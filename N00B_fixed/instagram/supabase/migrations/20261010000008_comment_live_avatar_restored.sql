-- A comment author lost their live profile picture: comment_json used to carry the author's live-picture video
-- (authorIsLiveAvatar / authorLiveAvatarVideoUrl, added in 20260928000002) but the comment-attachments update
-- (20261005000001) and the long-video update (20261006000005) each rewrote comment_json without those two fields, so comments
-- showed only the still frame. This puts them back, keeping everything the later versions added (attachments, replies, videos).
--
-- Replaces one function and one table rule, and removes one duplicate function. No rows are changed.

create or replace function public.comment_json(c public.comments) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'postId', coalesce(c.post_id, c.reel_id, c.long_video_id), 'reelId', c.reel_id, 'userId', c.user_id, 'username', a.username,
    'userAvatar', a.avatar, 'isVerified', a.is_verified,
    'authorIsLiveAvatar', a.is_live_avatar, 'authorLiveAvatarVideoUrl', a.live_avatar_video_url,
    'text', coalesce(c.text, ''), 'likesCount', c.likes_count,
    'isLiked', exists (select 1 from public.comment_likes cl where cl.comment_id = c.id and cl.user_id = auth.uid()),
    'isPinned', c.is_pinned, 'createdAt', c.created_at,
    'parentId', c.parent_id, 'replyToUserId', c.reply_to_user_id, 'replyToUsername', ru.username,
    'mediaUrl', c.media_url, 'mediaType', c.media_type, 'mediaDuration', c.media_duration)
  from public.profiles a
  left join public.profiles ru on ru.id = c.reply_to_user_id
  where a.id = c.user_id;
$$;

-- A second thing the long-video update (20261006000005) undid: turning comments off on a REEL stopped being enforced when someone
-- writes a comment straight into the table (the normal "add comment" path still refused, so the app looked fine, but the rule could be
-- bypassed). Reels' "comments off" check (added in 20260922000026) is back, next to posts' and long videos'.
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      (post_id is not null and exists (select 1 from public.posts p where p.id = post_id and not p.is_comments_disabled))
      or (reel_id is not null and exists (select 1 from public.reels r where r.id = reel_id and not r.is_comments_disabled))
      or (long_video_id is not null and exists (select 1 from public.long_videos v where v.id = long_video_id and not v.is_comments_disabled))
    )
  );

-- Shop settings: the Food Stall update (20261007000014) added a second set_shop_settings(boolean, numeric, text) next to the original
-- (boolean, numeric). Any call that names only the first two values then matches BOTH, and the database refuses it as ambiguous. The
-- three-value version does everything the two-value one did (the third value is optional), so the old one goes.
drop function if exists public.set_shop_settings(boolean, numeric);
