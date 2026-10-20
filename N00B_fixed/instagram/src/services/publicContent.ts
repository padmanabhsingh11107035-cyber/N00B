import { supabase, resolveMedia } from './supabase';
import { VISITOR_KEY, newVisitorId } from '../utils/visitorInfo';
import type { ContentRoute } from '../utils/routes';

// A post, reel, video or profile of a PUBLIC account, looked at without an account (migration 20261020000005_public_content.sql). Works for anyone; says "not found" for a private,
// suspended or missing one without telling which.
export interface PublicSlide { mediaUrl: string; mediaType: 'image' | 'video' | 'code'; caption?: string | null; filter?: string | null }
export interface PublicItem {
  kind: 'post' | 'reel' | 'video' | 'profile';
  id: string;
  username: string;
  displayName: string;
  userAvatar: string;
  isVerified: boolean;
  caption?: string;
  title?: string;
  description?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  slides?: PublicSlide[];
  likesCount?: number;
  commentsCount?: number;
  viewsCount?: number;
  isLikeCountHidden?: boolean;
  createdAt?: string;
  durationSeconds?: number;
  // a profile
  bio?: string;
  isPrivate?: boolean;
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
  posts?: Array<{ id: string; mediaUrl: string; mediaType: string }>;
}

export type PublicResult = { status: 'ok'; item: PublicItem } | { status: 'missing' } | { status: 'error' };

const media = (v?: string | null) => (v ? resolveMedia(v) : '');

function shape(raw: any): PublicItem {
  const item: PublicItem = { ...raw };
  item.userAvatar = media(raw.userAvatar) || '/noob-logo.svg.jpeg';
  if (raw.videoUrl) item.videoUrl = media(raw.videoUrl);
  if (raw.thumbnailUrl) item.thumbnailUrl = media(raw.thumbnailUrl);
  if (Array.isArray(raw.slides)) item.slides = raw.slides.map((s: any) => ({ ...s, mediaUrl: media(s.mediaUrl) }));
  if (Array.isArray(raw.posts)) item.posts = raw.posts.map((p: any) => ({ ...p, mediaUrl: media(p.mediaUrl) }));
  return item;
}

export async function fetchPublicItem(route: ContentRoute): Promise<PublicResult> {
  try {
    const call = route.kind === 'reel' ? supabase.rpc('public_reel', { p_id: route.id })
      : route.kind === 'video' ? supabase.rpc('public_video', { p_id: route.id })
      : route.kind === 'post' ? supabase.rpc('public_post', { p_id: route.id })
      : supabase.rpc('public_profile', { p_username: route.id });
    const { data, error } = await call;
    if (error) {
      // an id that is not even an id (a made-up address) is simply "not found"
      return /invalid input syntax|uuid/i.test(error.message || '') ? { status: 'missing' } : { status: 'error' };
    }
    return data && typeof data === 'object' ? { status: 'ok', item: shape(data) } : { status: 'missing' };
  } catch {
    return { status: 'error' };
  }
}

function visitorId(): string | null {
  try {
    const have = localStorage.getItem(VISITOR_KEY);
    if (have && have.length >= 8) return have;
    const id = newVisitorId();
    if (id) localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    return newVisitorId();
  }
}

/** One view for this device (never more, however often it plays again). Quiet: a missed count is not worth an error. Returns the number of views now, when known. */
export async function recordPublicView(kind: 'reel' | 'video', id: string): Promise<number | null> {
  try {
    const v = visitorId();
    if (!v) return null;
    const { data } = await supabase.rpc('record_public_view', { p_kind: kind, p_id: id, p_visitor: v });
    return data && typeof data.viewsCount === 'number' ? data.viewsCount : null;
  } catch {
    return null;
  }
}
