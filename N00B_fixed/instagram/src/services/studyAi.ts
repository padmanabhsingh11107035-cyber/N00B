import { supabase } from './supabase';
import { compressImage } from '../utils/mediaCompressor';
import { friendly, newRef, type Result } from './studyApi';
import { readNdjson, type ChatEvent } from '../utils/studyStream';

// NOOB STUDY's AI: talks to the "study-ai" function. The keys of the AI services live only there; this file never sees one. Every call needs a
// signed-in student. Errors come back as plain sentences (and a short code, so a screen can react: "limit", "busy", "not_configured"…).

const BASE = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '');
const FN = `${BASE}/functions/v1/study-ai`;
export const STUDY_BUCKET = 'study';

export type AiResult<T> = Result<T> & { code?: string };
export interface AiHealth { configured: boolean; text: boolean; vision: boolean; speechToText: boolean; search: boolean; providers: string[]; remaining: Record<string, { limit: number; used: number; remaining: number }> }

async function authHeaders(): Promise<Record<string, string>> {
  let token = '';
  try { token = (await supabase.auth.getSession()).data.session?.access_token || ''; } catch { /* the call below will say "please log in" */ }
  return { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${token || KEY}` };
}

// a failed answer from the function: its own sentence if it sent one, else a plain one
async function failure(res: Response): Promise<{ ok: false; error: string; code?: string }> {
  let body: any = null;
  try { body = await res.json(); } catch { /* not JSON: a gateway page */ }
  if (body?.error) return { ok: false, error: String(body.error), code: body.code };
  if (res.status === 404) return { ok: false, error: 'The AI tutor is not switched on yet.', code: 'not_configured' };
  if (res.status === 401) return { ok: false, error: 'Please log in again to continue.', code: 'login' };
  if (res.status === 429) return { ok: false, error: 'Too many requests. Please wait a moment.', code: 'limit' };
  return { ok: false, error: 'The tutor is not reachable right now. Please try again in a moment.', code: 'busy' };
}

export async function aiCall<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<AiResult<T>> {
  try {
    const res = await fetch(FN, { method: 'POST', headers: await authHeaders(), body: JSON.stringify(body), signal });
    if (!res.ok) return await failure(res);
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return { ok: false, error: '', code: 'aborted' };
    return { ok: false, error: friendly((err as Error)?.message || ''), code: 'offline' };
  }
}

export const aiHealth = () => aiCall<AiHealth>({ action: 'health' });

// ---- the tutor's answer, arriving piece by piece
export type { ChatEvent } from '../utils/studyStream';

export interface ChatParams { message: string; conversationId?: string | null; subjectId?: string | null; mode?: 'chat' | 'teach'; images?: string[]; materialId?: string | null; topic?: string; clientRef: string; language?: string }

export async function streamChat(params: ChatParams, onEvent: (e: ChatEvent) => void, signal?: AbortSignal): Promise<{ ok: boolean; error?: string; code?: string }> {
  try {
    const res = await fetch(FN, { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ action: 'chat', stream: true, ...params }), signal });
    if (!res.ok) return await failure(res);
    const type = res.headers.get('content-type') || '';
    if (type.includes('application/json')) {                       // a message sent twice: the saved answer comes back whole
      const d: any = await res.json();
      onEvent({ t: 'meta', conversationId: d.conversationId, userMessageId: d.userMessageId });
      if (d.reply) onEvent({ t: 'delta', text: String(d.reply) });
      onEvent({ t: 'done', messageId: d.messageId ?? null, remaining: d.remaining ?? null });
      return { ok: true };
    }
    if (!res.body) return { ok: false, error: 'The tutor did not answer. Please try again.', code: 'busy' };
    await readNdjson(res.body, onEvent);
    return { ok: true };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return { ok: false, error: '', code: 'aborted' };
    return { ok: false, error: friendly((err as Error)?.message || ''), code: 'offline' };
  }
}

export const transcribe = (base64: string, mime: string, language?: string) => aiCall<{ text: string }>({ action: 'transcribe', audio: base64, mime, language });
export const extractText = (keys: string[]) => aiCall<{ text: string }>({ action: 'extract', images: keys });

// ---- pictures: shrunk on the phone, stored in the student's own private folder
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const MAX_PICTURES = 4;
export async function uploadStudyImage(userId: string, file: File): Promise<Result<{ key: string; url: string }>> {
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) return { ok: false, error: 'Please choose a picture (a photo or a screenshot).' };
  if (file.size > 25 * 1024 * 1024) return { ok: false, error: 'That picture is very large. Please choose a smaller one.' };
  let out = file;
  try { out = await compressImage(file, 1600, 1600, 0.82); } catch { /* the original is sent */ }
  const type = out.type in EXT ? out.type : 'image/jpeg';
  if (out.size > 6 * 1024 * 1024) return { ok: false, error: 'That picture is still too large. Please take it again a little further away.' };
  const key = `${userId}/chat/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${EXT[type]}`;
  const { error } = await supabase.storage.from(STUDY_BUCKET).upload(key, out, { contentType: type, cacheControl: '3600', upsert: false });
  if (error) return { ok: false, error: /exceeded|size/i.test(error.message) ? 'That picture is too large.' : 'The picture could not be uploaded. Please try again.' };
  return { ok: true, data: { key, url: URL.createObjectURL(out) } };
}
export async function removeStudyFiles(keys: string[]): Promise<void> {
  const own = keys.filter((k) => typeof k === 'string' && k.length > 0);
  if (own.length) { try { await supabase.storage.from(STUDY_BUCKET).remove(own); } catch { /* a stray file is private and unguessable */ } }
}

const signed = new Map<string, { url: string; until: number }>();
// Pictures are private: they are shown through short-lived signed addresses, made only for the student who owns them.
export async function signedUrls(keys: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const need: string[] = [];
  for (const k of keys) { const c = signed.get(k); if (c && c.until > Date.now() + 60_000) out[k] = c.url; else need.push(k); }
  if (need.length) {
    try {
      const { data } = await supabase.storage.from(STUDY_BUCKET).createSignedUrls(need, 3600);
      for (const d of data || []) if (d.path && d.signedUrl) { signed.set(d.path, { url: d.signedUrl, until: Date.now() + 3500_000 }); out[d.path] = d.signedUrl; }
    } catch { /* the pictures simply do not show */ }
  }
  return out;
}

// ---- practice material (used from the Practice screens)
export interface QuizQuestion { type: 'mcq' | 'tf' | 'short' | 'numerical' | 'fill' | 'case'; question: string; options?: string[]; answer: number | string | boolean; explanation: string; unit?: string; steps?: string[]; marks?: number }
export const generateQuiz = (p: { subject?: string; topic?: string; count?: number; difficulty?: string; format?: string; materialId?: string | null; language?: string }) =>
  aiCall<{ questions: QuizQuestion[]; generated: true; dropped: number }>({ action: 'generate', kind: 'quiz', ...p });
export const generateCards = (p: { subject?: string; topic?: string; count?: number; materialId?: string | null; language?: string }) =>
  aiCall<{ cards: Array<{ front: string; back: string }>; generated: true }>({ action: 'generate', kind: 'flashcards', ...p });
export const generateNotes = (p: { kind: 'summary' | 'notes'; subject?: string; topic?: string; materialId?: string | null; language?: string }) =>
  aiCall<{ text: string; citations: Array<{ n: number; title: string | null; page: number | null }> }>({ action: 'generate', ...p });
export const gradeAnswer = (p: { question: string; answer: string; reference?: string; marks?: number }) =>
  aiCall<{ score: number; max: number; feedback: string; strengths: string[]; improvements: string[]; criteria: string; estimate: true }>({ action: 'grade', ...p });
export interface ResearchSource { n: number; title: string; url: string; official: boolean; retrievedAt: string; read: boolean; note?: string }
export const research = (p: { query: string; board?: string; level?: string }) =>
  aiCall<{ answer: string; sources: ResearchSource[]; configured: boolean; note?: string; partial?: boolean }>({ action: 'research', ...p });

export { newRef };
