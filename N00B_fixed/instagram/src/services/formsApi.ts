// NOOB Forms: the calls to the database. The owner reads and writes his own forms through the table (row-level security lets nobody else in); a person filling a form only
// ever calls form_public_get / form_public_submit, which hand out the published copy and check every answer (migration 20261028000001).
import { supabase } from './supabase';
import { MAIN_SITE } from '../utils/siteUrl';
import type { FormDraft, ResponseRow } from '../utils/forms';

export type FormStatus = 'draft' | 'published' | 'closed';
export interface FormRow {
  owner_id: string; id: string; title: string; description: string; slug: string | null; status: FormStatus; draft: FormDraft; published: FormDraft | null;
  version: number; response_count: number; starred: boolean; folder: string | null; archived_at: string | null; deleted_at: string | null;
  published_at: string | null; created_at: string; updated_at: string;
}
const COLS = 'owner_id,id,title,description,slug,status,draft,published,version,response_count,starred,folder,archived_at,deleted_at,published_at,created_at,updated_at';
const fail = (e: { message?: string } | null, fallback: string): never => { throw new Error(e?.message && !/JWT|fetch/i.test(e.message) ? e.message : fallback); };

export const formLink = (slug: string): string => `${MAIN_SITE}/f/${slug}`;

export async function listForms(): Promise<FormRow[]> {
  const { data, error } = await supabase.from('forms').select(COLS).order('updated_at', { ascending: false }).limit(500);
  if (error) fail(error, 'Could not load your forms. Please check your connection.');
  return (data ?? []) as FormRow[];
}
export async function myRoles(): Promise<Record<string, 'editor' | 'viewer'>> {
  const { data } = await supabase.from('form_collaborators').select('form_id,role');
  return Object.fromEntries((data ?? []).map((r) => [r.form_id as string, r.role as 'editor' | 'viewer']));
}
export async function getForm(id: string): Promise<FormRow | null> {
  const { data, error } = await supabase.from('forms').select(COLS).eq('id', id).maybeSingle();
  if (error) fail(error, 'Could not open this form.');
  return (data as FormRow) ?? null;
}
export async function createForm(input: { title: string; description: string; draft: FormDraft }): Promise<FormRow> {
  const { data, error } = await supabase.from('forms').insert({ title: input.title, description: input.description, draft: input.draft }).select(COLS).single();
  if (error) fail(error, 'Could not create the form.');
  return data as FormRow;
}
/** Saves the draft. `knownUpdatedAt` is what this screen last saw: when somebody (another tab) saved in between, nothing is overwritten and 'conflict' is returned. */
export async function saveDraft(id: string, patch: { title?: string; description?: string; draft?: FormDraft }, knownUpdatedAt: string): Promise<{ ok: true; updated_at: string } | { ok: false; reason: 'conflict' }> {
  const { data, error } = await supabase.from('forms').update(patch).eq('id', id).eq('updated_at', knownUpdatedAt).select('updated_at');
  if (error) fail(error, 'Could not save. Your changes are kept on this screen.');
  if (!data?.length) return { ok: false, reason: 'conflict' };
  return { ok: true, updated_at: data[0].updated_at };
}
export async function updateMeta(id: string, patch: Partial<Pick<FormRow, 'starred' | 'folder' | 'archived_at' | 'deleted_at' | 'status' | 'title'>>): Promise<void> {
  const { error } = await supabase.from('forms').update(patch).eq('id', id);
  if (error) fail(error, 'Could not change the form.');
}
export async function deleteFormForever(id: string): Promise<void> {
  const { error } = await supabase.from('forms').delete().eq('id', id);
  if (error) fail(error, 'Could not delete the form.');
}
export async function duplicateForm(f: FormRow): Promise<FormRow> {
  return createForm({ title: (f.title + ' (copy)').slice(0, 200), description: f.description, draft: f.draft });   // the questions, theme and settings; never the answers
}
export async function publishForm(id: string): Promise<{ ok: boolean; slug?: string; problems?: string[] }> {
  const { data, error } = await supabase.rpc('form_publish', { p_id: id });
  if (error) fail(error, 'Could not publish. Please try again.');
  return data as { ok: boolean; slug?: string; problems?: string[] };
}

export async function listResponses(formId: string, page: number, size = 25): Promise<{ rows: ResponseRow[]; total: number }> {
  const { data, error, count } = await supabase.from('form_responses').select('*', { count: 'exact' }).eq('form_id', formId).order('created_at', { ascending: false }).range(page * size, page * size + size - 1);
  if (error) fail(error, 'Could not load the responses.');
  return { rows: (data ?? []) as ResponseRow[], total: count ?? 0 };
}
/** All answers, in pages of 500 (for the charts and the export; the screen itself shows 25 at a time). Stops at 20000. */
export async function allResponses(formId: string, limit = 20000): Promise<ResponseRow[]> {
  const out: ResponseRow[] = [];
  for (let from = 0; from < limit; from += 500) {
    const { data, error } = await supabase.from('form_responses').select('*').eq('form_id', formId).order('created_at', { ascending: false }).range(from, from + 499);
    if (error) fail(error, 'Could not load the responses.');
    out.push(...((data ?? []) as ResponseRow[]));
    if ((data?.length ?? 0) < 500) break;
  }
  return out;
}
/** the paths of the files inside some answers */
const filePaths = (rows: Array<{ answers: Record<string, unknown> }>): string[] => rows.flatMap((r) => Object.values(r.answers).flatMap((v) => (Array.isArray(v) ? v.map((f) => (f && typeof f === 'object' ? (f as { path?: unknown }).path : null)).filter((p): p is string => typeof p === 'string') : [])));
const removeFiles = async (paths: string[]): Promise<void> => { for (let i = 0; i < paths.length; i += 100) { try { await supabase.storage.from('form-uploads').remove(paths.slice(i, i + 100)); } catch { /* the answer is gone; a stray file is cleaned up later */ } } };
export async function deleteResponse(id: string, answers?: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('form_responses').delete().eq('id', id);
  if (error) fail(error, 'Could not delete the response.');
  if (answers) await removeFiles(filePaths([{ answers }]));
}
export async function clearResponses(formId: string): Promise<void> {
  const rows = await allResponses(formId);
  const { error } = await supabase.from('form_responses').delete().eq('form_id', formId);
  if (error) fail(error, 'Could not clear the responses.');
  await removeFiles(filePaths(rows));
}

// ------------------------------------------------ the public side (no account needed)
export interface PublicForm { state: 'open' | 'closed' | 'notopen' | 'notfound'; id?: string; title?: string; description?: string; version?: number; questions?: FormDraft['questions']; theme?: FormDraft['theme']; settings?: FormDraft['settings'] }
export async function getPublicForm(slug: string): Promise<PublicForm> {
  const { data, error } = await supabase.rpc('form_public_get', { p_slug: slug });
  if (error) fail(error, 'This form could not be opened. Please try again.');
  return data as PublicForm;
}
export async function submitPublicForm(slug: string, answers: Record<string, unknown>, utm?: Record<string, string>): Promise<{ ok: boolean; error?: string; question?: string; result?: import('../components/Forms/FormRenderer').QuizResult | null }> {
  const { data, error } = await supabase.rpc('form_public_submit', { p_slug: slug, p_answers: answers, p_meta: utm ? { utm } : {} });
  if (error) fail(error, 'Your answers were not sent. Please check your connection and try again.');
  return data as { ok: boolean; error?: string; question?: string };
}

// ------------------------------------------------ the AI helpers (the edge function "forms-ai"; the app works fully without it)
const AI_MESSAGES: Record<string, string> = {
  not_configured: 'The AI helper is not switched on yet. The owner of NOOB must add an AI key for it.',
  busy: 'You are asking too fast. Please wait a minute and try again.',
  login: 'Please log in again to use the AI helper.',
  toofew: 'There are too few written answers to summarise yet (at least 3).',
  invalid: 'The AI could not understand that. Please change the text and try again.'
};
export async function aiCall<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('forms-ai', { body });
  if (error) {
    let code = '';
    try { const res = (error as { context?: Response }).context; if (res) code = ((await res.json()) as { error?: string }).error ?? ''; } catch { /* no details */ }
    throw new Error(AI_MESSAGES[code] ?? 'The AI helper could not answer right now. Please try again in a moment.');
  }
  if (!data || (data as { error?: string }).error) throw new Error(AI_MESSAGES[(data as { error?: string } | null)?.error ?? ''] ?? 'The AI helper could not answer right now. Please try again in a moment.');
  return data as T;
}

// ------------------------------------------------ files attached to an answer (the bucket is private; only the people on the form can read them)
export interface UploadedFile { path: string; name: string; size: number; type: string }
export async function uploadFormFile(formId: string, file: File, allowed: string[], maxMb: number): Promise<UploadedFile> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  if (!ext) throw new Error('This file has no kind (for example .pdf).');
  if (allowed.length && !allowed.includes(ext)) throw new Error(`Only these kinds of files are accepted: ${allowed.join(', ')}.`);
  if (file.size > Math.min(10, maxMb || 10) * 1048576) throw new Error(`This file is bigger than ${Math.min(10, maxMb || 10)} MB.`);
  const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
  const path = `${formId}/${id}.${ext}`;
  const { error } = await supabase.storage.from('form-uploads').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) throw new Error('The file could not be uploaded. Please check your connection and try again.');
  return { path, name: file.name.slice(0, 200), size: file.size, type: (file.type || '').slice(0, 100) };
}
export async function fileLink(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('form-uploads').createSignedUrl(path, 120);
  if (error || !data) throw new Error('The file could not be opened.');
  return data.signedUrl;
}

// ------------------------------------------------ people on a form, my role, web hooks
export type FormRole = 'owner' | 'editor' | 'viewer' | null;
export async function myRole(formId: string): Promise<FormRole> {
  const { data } = await supabase.rpc('form_role', { p_form: formId });
  return (data as FormRole) ?? null;
}
export interface Collaborator { user_id: string; username: string; role: 'editor' | 'viewer' }
export async function listCollaborators(formId: string): Promise<Collaborator[]> {
  const { data, error } = await supabase.rpc('form_collab_list', { p_form: formId });
  if (error) fail(error, 'Could not load the people.');
  return (data ?? []) as Collaborator[];
}
const COLLAB_ERRORS: Record<string, string> = { nouser: 'No one has that User ID.', self: 'You already own this form.', notowner: 'Only the owner can do that.', toomany: 'A form can be shared with 20 people at most.', invalid: 'Please choose editor or viewer.' };
export async function addCollaborator(formId: string, username: string, role: 'editor' | 'viewer'): Promise<void> {
  const { data, error } = await supabase.rpc('form_collab_add', { p_form: formId, p_username: username, p_role: role });
  if (error) fail(error, 'Could not add this person.');
  const r = data as { ok: boolean; error?: string };
  if (!r.ok) throw new Error(COLLAB_ERRORS[r.error ?? ''] ?? 'Could not add this person.');
}
export async function removeCollaborator(formId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('form_collab_remove', { p_form: formId, p_user: userId });
  if (error) fail(error, 'Could not remove this person.');
}
export interface Webhook { id: string; url: string; secret: string; active: boolean; created_at: string }
export interface Delivery { id: string; webhook_id: string; status: 'pending' | 'sent' | 'failed'; attempts: number; http_status: number | null; last_error: string | null; created_at: string }
export async function listWebhooks(formId: string): Promise<{ hooks: Webhook[]; deliveries: Delivery[] }> {
  const { data: hooks, error } = await supabase.from('form_webhooks').select('id,url,secret,active,created_at').eq('form_id', formId).order('created_at');
  if (error) fail(error, 'Could not load the web hooks.');
  const ids = (hooks ?? []).map((h) => h.id);
  const { data: deliveries } = ids.length ? await supabase.from('form_webhook_deliveries').select('id,webhook_id,status,attempts,http_status,last_error,created_at').in('webhook_id', ids).order('created_at', { ascending: false }).limit(15) : { data: [] };
  return { hooks: (hooks ?? []) as Webhook[], deliveries: (deliveries ?? []) as Delivery[] };
}
export async function addWebhook(formId: string, url: string): Promise<void> {
  if (!/^https:\/\/[^\s]+$/i.test(url)) throw new Error('The address must start with https://');
  const { error } = await supabase.from('form_webhooks').insert({ form_id: formId, url });
  if (error) fail(error, 'Could not add the web hook.');
}
export async function setWebhook(id: string, patch: { active?: boolean }): Promise<void> { const { error } = await supabase.from('form_webhooks').update(patch).eq('id', id); if (error) fail(error, 'Could not change the web hook.'); }
export async function deleteWebhook(id: string): Promise<void> { const { error } = await supabase.from('form_webhooks').delete().eq('id', id); if (error) fail(error, 'Could not delete the web hook.'); }
export async function sendWebhooksNow(formId: string): Promise<{ sent: number; failed: number }> {
  const { data, error } = await supabase.functions.invoke('forms-webhook-run', { body: { formId } });
  if (error) throw new Error('The sender is not switched on yet (the function forms-webhook-run must be deployed).');
  return data as { sent: number; failed: number };
}
