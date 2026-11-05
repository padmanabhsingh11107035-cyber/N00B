// Scratch Reveal: the types and the server calls of the scratch cards (supabase/migrations/20261105000001_scratch_cards.sql).
// Every call answers {ok: true, ...} or {ok: false, error} and never throws, so a screen only has to show the text.
import { supabase, resolveMedia } from '../../services/supabase';
import { uploadMediaFile } from '../../services/supabaseApi';

export type ReactionKind = 'heart' | 'thumb' | 'flame' | 'rocket' | 'skull';
export const REACTION_KINDS: ReactionKind[] = ['heart', 'thumb', 'flame', 'rocket', 'skull'];
export type FoilType = 'doodle' | 'silver' | 'gold' | 'holographic';
export const FOIL_TYPES: FoilType[] = ['doodle', 'silver', 'gold', 'holographic'];

export interface ScratchCard {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  isVerified: boolean;
  title: string;
  hint: string;
  /** the picture's address (resolved for display) */
  imageSrc: string;
  /** the picture's key in storage */
  imageKey: string;
  category: string;
  foil: FoilType;
  createdAt: string;
  isMine: boolean;
  counts: Record<ReactionKind, number>;
  mine: ReactionKind[];
  comments: number;
  scratchers: number;
  saved: boolean;
  revealed: boolean;
}

export interface ScratchNote {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  isVerified: boolean;
  body: string;
  createdAt: string;
  canDelete: boolean;
}

export type Fail = { ok: false; error: string };
export type Result<T> = ({ ok: true } & T) | Fail;
/** true when a call failed (the project's TypeScript setup does not narrow on `ok` by itself) */
export const failed = (r: { ok: boolean }): r is Fail => r.ok === false;

const ZERO: Record<ReactionKind, number> = { heart: 0, thumb: 0, flame: 0, rocket: 0, skull: 0 };

export function mapCard(raw: any): ScratchCard {
  const counts = { ...ZERO };
  for (const k of REACTION_KINDS) counts[k] = Math.max(0, Number(raw?.counts?.[k]) || 0);
  const foil: FoilType = FOIL_TYPES.includes(raw?.foil) ? raw.foil : 'doodle';
  return {
    id: String(raw?.id || ''),
    userId: String(raw?.userId || ''),
    username: String(raw?.username || ''),
    displayName: String(raw?.displayName || raw?.username || ''),
    avatar: resolveMedia(raw?.avatar),
    isVerified: !!raw?.isVerified,
    title: String(raw?.title || ''),
    hint: String(raw?.hint || ''),
    imageSrc: resolveMedia(raw?.image),
    imageKey: String(raw?.image || ''),
    category: String(raw?.category || ''),
    foil,
    createdAt: String(raw?.createdAt || ''),
    isMine: !!raw?.isMine,
    counts,
    mine: Array.isArray(raw?.mine) ? raw.mine.filter((k: unknown): k is ReactionKind => REACTION_KINDS.includes(k as ReactionKind)) : [],
    comments: Math.max(0, Number(raw?.comments) || 0),
    scratchers: Math.max(0, Number(raw?.scratchers) || 0),
    saved: !!raw?.saved,
    revealed: !!raw?.revealed
  };
}

const NOT_READY = 'Scratch cards are not switched on yet. Please try again in a little while.';
const friendly = (e: { message?: string } | null | undefined): string => {
  const m = String(e?.message || '');
  if (/could not find the function|schema cache|does not exist/i.test(m)) return NOT_READY;
  if (/jwt|not authenticated|permission denied/i.test(m)) return 'Please log in again.';
  return 'Something went wrong. Check your connection and try again.';
};

async function call<T = any>(fn: string, args: Record<string, unknown>): Promise<({ ok: true; data: T } | Fail)> {
  try {
    // never wait for ever: after 20 seconds the person is told, and can try again
    const answer = await Promise.race([
      supabase.rpc(fn, args),
      new Promise<{ data: null; error: { message: string } }>((resolve) => setTimeout(() => resolve({ data: null, error: { message: 'timeout' } }), 20000))
    ]);
    const { data, error } = answer as { data: unknown; error: { message?: string } | null };
    if (error) return { ok: false, error: friendly(error) };
    return { ok: true, data: data as T };
  } catch (e) {
    return { ok: false, error: friendly(e as Error) };
  }
}

export async function loadFeed(opts: { category?: string; before?: string; saved?: boolean; limit?: number } = {}): Promise<Result<{ cards: ScratchCard[] }>> {
  const r = await call<any[]>('scratch_feed', { p_category: opts.category && opts.category !== 'All' ? opts.category : null, p_before: opts.before || null, p_limit: opts.limit ?? 12, p_saved: !!opts.saved });
  if (failed(r)) return r;
  return { ok: true, cards: (Array.isArray(r.data) ? r.data : []).map(mapCard) };
}

export async function createCard(file: File, fields: { title: string; hint: string; category: string; foil: FoilType }, onProgress?: (fraction: number) => void): Promise<Result<{ card: ScratchCard }>> {
  try {
    const up = await uploadMediaFile(file, 'posts', { onProgress: (p) => onProgress?.(p.fraction) });
    if (!up.success) return { ok: false, error: 'The picture could not be uploaded. Please try again.' };
    const r = await call<any>('scratch_create', { p_title: fields.title, p_hint: fields.hint, p_image: up.objectKey, p_category: fields.category, p_foil: fields.foil });
    if (failed(r)) return r;
    if (!r.data?.success) return { ok: false, error: String(r.data?.error || 'The card could not be posted.') };
    return { ok: true, card: mapCard(r.data.card) };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'The picture could not be uploaded. Please try again.' };
  }
}

async function cardCall(fn: string, args: Record<string, unknown>): Promise<Result<{ card: ScratchCard }>> {
  const r = await call<any>(fn, args);
  if (failed(r)) return r;
  if (!r.data?.success || !r.data?.card) return { ok: false, error: String(r.data?.error || 'That did not work. Please try again.') };
  return { ok: true, card: mapCard(r.data.card) };
}

export const react = (id: string, kind: ReactionKind) => cardCall('scratch_react', { p_id: id, p_kind: kind });
export const toggleSave = (id: string) => cardCall('scratch_save', { p_id: id });
export const markRevealed = (id: string) => cardCall('scratch_reveal', { p_id: id });
export const addNote = (id: string, body: string) => cardCall('scratch_comment', { p_id: id, p_body: body });

export async function deleteCard(id: string): Promise<Result<{}>> {
  const r = await call<any>('scratch_delete', { p_id: id });
  if (failed(r)) return r;
  return r.data?.success ? { ok: true } : { ok: false, error: String(r.data?.error || 'The card could not be deleted.') };
}

export async function loadNotes(id: string): Promise<Result<{ notes: ScratchNote[] }>> {
  const r = await call<any[]>('scratch_comments', { p_id: id });
  if (failed(r)) return r;
  const notes = (Array.isArray(r.data) ? r.data : []).map((n: any): ScratchNote => ({
    id: String(n.id), userId: String(n.userId), username: String(n.username || ''), displayName: String(n.displayName || n.username || ''),
    avatar: resolveMedia(n.avatar), isVerified: !!n.isVerified, body: String(n.body || ''), createdAt: String(n.createdAt || ''), canDelete: !!n.canDelete
  }));
  return { ok: true, notes };
}

export async function deleteNote(commentId: string): Promise<Result<{}>> {
  const r = await call<any>('scratch_comment_delete', { p_comment: commentId });
  if (failed(r)) return r;
  return r.data?.success ? { ok: true } : { ok: false, error: String(r.data?.error || 'The note could not be deleted.') };
}

/** "12m ago", "3h ago", "2d ago", or the date */
export function ago(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'Just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d ago`;
  try { return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); } catch { return ''; }
}

/** 1.2K style counts */
export function short(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(n);
}
