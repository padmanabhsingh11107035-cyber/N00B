-- 20261114000023: Privacy gap B, stage 2b-2: story_json (author and story commenters) and music_json read the card through profile_brief
-- Part of docs/PRIVACY-GAP-B-PLAN.md (owner decisions D1 to D3 taken: nothing visible changes).
-- LIVE EFFECT: none visible: identical answers
-- Safe to run twice (create or replace / on conflict do nothing). No table row is changed, nothing is deleted.
-- ROLLBACK: supabase/one-off/rollback-gapb-stage2b2.sql

create or replace function public.story_json(s stories)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', s.id, 'userId', s.user_id, 'username', a.username, 'userAvatar', a.avatar, 'isVerified', a.is_verified,
    'authorIsLiveAvatar', a.is_live_avatar, 'authorLiveAvatarVideoUrl', a.live_avatar_video_url,
    'mediaUrl', s.media_url, 'mediaType', s.media_type, 'durationSeconds', s.duration_seconds,
    'createdAt', s.created_at, 'expiresAt', s.expires_at, 'isCloseFriendsOnly', s.is_close_friends_only,
    'isViewed', exists (select 1 from public.story_views v where v.story_id = s.id and v.user_id = auth.uid()),
    'viewedBy', case when s.user_id = auth.uid()
                     then coalesce((select jsonb_agg(v.user_id order by v.created_at) from public.story_views v where v.story_id = s.id), '[]'::jsonb)
                     else '[]'::jsonb end,
    'isLiked', exists (select 1 from public.story_likes l where l.story_id = s.id and l.user_id = auth.uid()),
    'likesCount', (select count(*) from public.story_likes l where l.story_id = s.id),
    'filter', s.filter, 'stickers', s.stickers,
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'username', cu.username, 'userAvatar', cu.avatar, 'text', c.text, 'createdAt', c.created_at) order by c.created_at)
      from public.story_comments c join lateral public.profile_brief(c.user_id) cu on true where c.story_id = s.id), '[]'::jsonb))
  from public.profile_brief(s.user_id) a;
$function$;

create or replace function public.music_json(t music_tracks)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', t.id, 'title', t.title, 'artist', t.artist, 'genre', t.genre, 'audioUrl', t.audio_url, 'coverUrl', t.cover_url,
    'duration', t.duration, 'uploaderId', t.uploader_id, 'uploaderUsername', u.username, 'uploaderAvatar', u.avatar,
    'likesCount', t.likes_count, 'playsCount', t.plays_count,
    'isLiked', exists (select 1 from public.music_likes l where l.track_id = t.id and l.user_id = auth.uid()),
    'createdAt', t.created_at)
  from public.profile_brief(t.uploader_id) u;
$function$;
