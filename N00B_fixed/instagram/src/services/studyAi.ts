import { supabase } from './supabase';
import { friendly, newRef, type Result } from './studyApi';
import { readNdjson, type ChatEvent } from '../utils/studyStream';
import type { QuizQuestion } from '../utils/studyTypes';

// NOOB STUDY's AI: talks to the "study-ai" function. The keys of the AI services live only there; this file never sees one. Every call needs a
// signed-in student. Errors come back as plain sentences (and a short code, so a screen can react: "limit", "busy", "not_configured"…).

const BASE = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '');
const FN = `${BASE}/functions/v1/study-ai`;

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
export type { ChatEvent, ChatSource } from '../utils/studyStream';

export interface ChatParams { message: string; conversationId?: string | null; subjectId?: string | null; mode?: 'chat' | 'teach'; images?: string[]; /* small pictures (data), sent with the question and never stored */ materialId?: string | null; topic?: string; clientRef: string; language?: string }

export async function streamChat(params: ChatParams, onEvent: (e: ChatEvent) => void, signal?: AbortSignal): Promise<{ ok: boolean; error?: string; code?: string }> {
  try {
    const res = await fetch(FN, { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ action: 'chat', stream: true, ...params }), signal });
    if (!res.ok) return await failure(res);
    const type = res.headers.get('content-type') || '';
    if (type.includes('application/json')) {                       // a message sent twice: the saved answer comes back whole
      const d: any = await res.json();
      onEvent({ t: 'meta', conversationId: d.conversationId, userMessageId: d.userMessageId, sources: d.sources });
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
export const extractText = (pictures: string[]) => aiCall<{ text: string }>({ action: 'extract', images: pictures });

// ---- pictures: made small on the phone and sent WITH the question, straight to the AI. They are never uploaded to a store and never saved: the
// chat only remembers that a picture was sent. A video is never sent either: a few still frames from it are.
export const MAX_PICTURES = 4;
export interface StudyPicture { key: string; url: string; data: string }   // key: a name for the screen; url: what to show; data: the small picture the AI gets
const MAX_DATA_CHARS = 1_500_000;
const picKey = () => 'p' + Math.random().toString(36).slice(2, 10);
const blobToDataUrl = (b: Blob): Promise<string> => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
export const dataToPicture = (data: string): StudyPicture => ({ key: picKey(), url: data, data });

async function shrink(source: CanvasImageSource, w: number, h: number): Promise<string | null> {
  for (const [edge, q] of [[1280, 0.72], [1024, 0.62], [800, 0.55]] as const) {
    const scale = Math.min(1, edge / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(source, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', q);
    if (url.length <= MAX_DATA_CHARS) return url;
  }
  return null;
}

export async function preparePicture(file: File): Promise<Result<StudyPicture>> {
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) return { ok: false, error: 'Please choose a picture (a photo or a screenshot).' };
  if (file.size > 40 * 1024 * 1024) return { ok: false, error: 'That picture is very large. Please choose a smaller one.' };
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('bad')); img.src = url; });
    const data = await shrink(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
    if (!data) return { ok: false, error: 'That picture is too detailed to send. Please take it again a little further away.' };
    return { ok: true, data: { key: picKey(), url: data, data } };
  } catch {
    // some phones hand over a format the page cannot draw: send the file as it is if it is already small and a normal picture type
    if (/^image\/(jpeg|png|webp)$/.test(file.type) && file.size < 1_000_000) { const data = await blobToDataUrl(file); return { ok: true, data: { key: picKey(), url: data, data } }; }
    return { ok: false, error: 'That picture could not be read. Please try another one (a JPEG or PNG works best).' };
  } finally { URL.revokeObjectURL(url); }
}

// a few still frames from a video (the video itself never leaves the phone)
export async function prepareVideoFrames(file: File, frames = 3): Promise<Result<StudyPicture[]>> {
  if (file.size > 400 * 1024 * 1024) return { ok: false, error: 'That video is very large. Please choose a shorter one.' };
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('bad')); setTimeout(() => rej(new Error('slow')), 15000); });
    const d = v.duration;
    if (!Number.isFinite(d) || d <= 0) return { ok: false, error: 'That video could not be read. Please try another one.' };
    const out: StudyPicture[] = [];
    const n = Math.max(1, Math.min(frames, MAX_PICTURES));
    for (let i = 0; i < n; i++) {
      v.currentTime = Math.min(d - 0.05, Math.max(0, (d * (i + 1)) / (n + 1)));
      await new Promise<void>((res, rej) => { v.onseeked = () => res(); v.onerror = () => rej(new Error('bad')); setTimeout(() => rej(new Error('slow')), 8000); });
      const data = await shrink(v, v.videoWidth, v.videoHeight);
      if (data) out.push({ key: picKey(), url: data, data });
    }
    if (!out.length) return { ok: false, error: 'No picture could be taken from that video. Please try another one.' };
    return { ok: true, data: out };
  } catch {
    return { ok: false, error: 'That video could not be read on this phone. Please take a photo instead.' };
  } finally { URL.revokeObjectURL(url); }
}

// photos and videos together: at most `room` pictures come out, and a plain sentence says what went wrong with any that did not
export async function prepareFiles(files: File[], room: number, onEach?: () => void): Promise<{ pics: StudyPicture[]; errors: string[]; framed: boolean }> {
  const pics: StudyPicture[] = []; const errors: string[] = []; let framed = false;
  for (const f of files) {
    if (pics.length >= room) break;
    if (f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(f.name)) {
      const r = await prepareVideoFrames(f, Math.min(3, room - pics.length));
      if (r.ok) { pics.push(...r.data); framed = true; } else errors.push(r.error);
    } else {
      const r = await preparePicture(f);
      if (r.ok) pics.push(r.data); else errors.push(r.error);
    }
    onEach?.();
  }
  return { pics, errors, framed };
}

// ---- practice material (used from the Practice screens)
export type { QuizQuestion } from '../utils/studyTypes';
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

// patterns in the student's own past papers (only those papers are read; each topic says which papers it was seen in)
export interface PaperTopic { topic: string; papers: number[]; count: number; example: string | null; verified: boolean }
export const analyzePapers = (p: { materialIds: string[]; language?: string }) =>
  aiCall<{ topics: PaperTopic[]; papers: Array<{ n: number; title: string }>; generated: true; note: string }>({ action: 'analyze', ...p });

export { newRef };

// the weekly test: ask the function to make this week's test for a subject (the same test all week)
export const startTest = (subjectId: string, language?: string) =>
  aiCall<{ testId: string; status: 'ready' | 'done' | 'expired'; existing: boolean }>({ action: 'test', subjectId, language });
