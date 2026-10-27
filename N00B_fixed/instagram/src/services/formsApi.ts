// NOOB Forms: the calls to the database. The owner reads and writes his own forms through the table (row-level security lets nobody else in); a person filling a form only
// ever calls form_public_get / form_public_submit, which hand out the published copy and check every answer (migration 20261028000001).
import { supabase } from './supabase';
import { MAIN_SITE } from '../utils/siteUrl';
import type { FormDraft, ResponseRow } from '../utils/forms';

export type FormStatus = 'draft' | 'published' | 'closed';
export interface FormRow {
  id: string; title: string; description: string; slug: string | null; status: FormStatus; draft: FormDraft; published: FormDraft | null;
  version: number; response_count: number; starred: boolean; folder: string | null; archived_at: string | null; deleted_at: string | null;
  published_at: string | null; created_at: string; updated_at: string;
}
const COLS = 'id,title,description,slug,status,draft,published,version,response_count,starred,folder,archived_at,deleted_at,published_at,created_at,updated_at';
const fail = (e: { message?: string } | null, fallback: string): never => { throw new Error(e?.message && !/JWT|fetch/i.test(e.message) ? e.message : fallback); };

export const formLink = (slug: string): string => `${MAIN_SITE}/f/${slug}`;

export async function listForms(): Promise<FormRow[]> {
  const { data, error } = await supabase.from('forms').select(COLS).order('updated_at', { ascending: false }).limit(500);
  if (error) fail(error, 'Could not load your forms. Please check your connection.');
  return (data ?? []) as FormRow[];
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
  const { data, error, count } = await supabase.from('form_responses').select('id,created_at,answers,version', { count: 'exact' }).eq('form_id', formId).order('created_at', { ascending: false }).range(page * size, page * size + size - 1);
  if (error) fail(error, 'Could not load the responses.');
  return { rows: (data ?? []) as ResponseRow[], total: count ?? 0 };
}
/** All answers, in pages of 500 (for the charts and the export; the screen itself shows 25 at a time). Stops at 20000. */
export async function allResponses(formId: string, limit = 20000): Promise<ResponseRow[]> {
  const out: ResponseRow[] = [];
  for (let from = 0; from < limit; from += 500) {
    const { data, error } = await supabase.from('form_responses').select('id,created_at,answers,version').eq('form_id', formId).order('created_at', { ascending: false }).range(from, from + 499);
    if (error) fail(error, 'Could not load the responses.');
    out.push(...((data ?? []) as ResponseRow[]));
    if ((data?.length ?? 0) < 500) break;
  }
  return out;
}
export async function deleteResponse(id: string): Promise<void> {
  const { error } = await supabase.from('form_responses').delete().eq('id', id);
  if (error) fail(error, 'Could not delete the response.');
}
export async function clearResponses(formId: string): Promise<void> {
  const { error } = await supabase.from('form_responses').delete().eq('form_id', formId);
  if (error) fail(error, 'Could not clear the responses.');
}

// ------------------------------------------------ the public side (no account needed)
export interface PublicForm { state: 'open' | 'closed' | 'notopen' | 'notfound'; title?: string; description?: string; version?: number; questions?: FormDraft['questions']; theme?: FormDraft['theme']; settings?: FormDraft['settings'] }
export async function getPublicForm(slug: string): Promise<PublicForm> {
  const { data, error } = await supabase.rpc('form_public_get', { p_slug: slug });
  if (error) fail(error, 'This form could not be opened. Please try again.');
  return data as PublicForm;
}
export async function submitPublicForm(slug: string, answers: Record<string, unknown>, utm?: Record<string, string>): Promise<{ ok: boolean; error?: string; question?: string }> {
  const { data, error } = await supabase.rpc('form_public_submit', { p_slug: slug, p_answers: answers, p_meta: utm ? { utm } : {} });
  if (error) fail(error, 'Your answers were not sent. Please check your connection and try again.');
  return data as { ok: boolean; error?: string; question?: string };
}
