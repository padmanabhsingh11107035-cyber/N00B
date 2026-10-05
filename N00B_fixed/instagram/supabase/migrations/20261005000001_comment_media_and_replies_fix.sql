-- Comments (on posts AND reels — they share the one `comments` table) can now carry one attached
-- photo, video, voice note, GIF, or sticker, same as chat messages already could. A comment can be
-- text-only, media-only, or both.
--
-- This also finally applies migration 20260923000033's reply columns/logic, which was written and
-- pushed but never run — the app's reply UI (CommentsSheet.tsx, ReelsView.tsx) has been calling
-- add_comment/add_reel_comment with a p_parent_comment argument that the live functions didn't
-- accept, so replies have been failing. Folding it in here (instead of asking for two separate
-- pastes) since this migration has to replace those same two functions anyway for media.

alter table public.comments add column if not exists parent_id uuid references public.comments (id) on delete cascade;
alter table public.comments add column if not exists reply_to_user_id uuid references public.profiles (id) on delete set null;
create index if not exists comments_parent_idx on public.comments (parent_id, created_at);

alter table public.comments add column if not exists media_url text;
alter table public.comments add column if not exists media_type text;
alter table public.comments add column if not exists media_duration text;
alter table public.comments alter column text drop not null;
alter table public.comments drop constraint if exists comments_media_type_check;
alter table public.comments add constraint comments_media_type_check
  check (media_type is null or media_type in ('image', 'video', 'voice', 'gif', 'sticker'));
alter table public.comments drop constraint if exists comments_text_or_media_check;
alter table public.comments add constraint comments_text_or_media_check
  check (coalesce(btrim(text), '') <> '' or media_url is not null);

create or replace function public.comment_json(c public.comments) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'postId', coalesce(c.post_id, c.reel_id), 'reelId', c.reel_id, 'userId', c.user_id, 'username', a.username,
    'userAvatar', a.avatar, 'isVerified', a.is_verified, 'text', coalesce(c.text, ''), 'likesCount', c.likes_count,
    'isLiked', false, 'isPinned', c.is_pinned, 'createdAt', c.created_at,
    'parentId', c.parent_id, 'replyToUserId', c.reply_to_user_id, 'replyToUsername', ru.username,
    'mediaUrl', c.media_url, 'mediaType', c.media_type, 'mediaDuration', c.media_duration)
  from public.profiles a
  left join public.profiles ru on ru.id = c.reply_to_user_id
  where a.id = c.user_id;
$$;

-- A short, human label for the notification when the comment has no text of its own.
create or replace function public.comment_media_label(p_media_type text) returns text
language sql immutable as $$
  select case p_media_type
    when 'image' then 'sent a photo'
    when 'video' then 'sent a video'
    when 'voice' then 'sent a voice note'
    when 'gif' then 'sent a GIF'
    when 'sticker' then 'sent a sticker'
    else 'sent an attachment'
  end;
$$;

drop function if exists public.add_comment(uuid, text);
drop function if exists public.add_comment(uuid, text, uuid);
create or replace function public.add_comment(
  p_post uuid, p_text text default null, p_parent_comment uuid default null,
  p_media_url text default null, p_media_type text default null, p_media_duration text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); t text := btrim(coalesce(p_text, '')); cid uuid; owner uuid; disabled boolean;
  parent public.comments; top_parent uuid; reply_to uuid; notif_text text;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if (select is_suspended from public.profiles where id = me) is not false then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if t = '' and p_media_url is null then raise exception 'Comment text cannot be empty'; end if;
  if p_media_url is not null and p_media_type not in ('image', 'video', 'voice', 'gif', 'sticker') then
    raise exception 'Unsupported attachment type';
  end if;
  select user_id, is_comments_disabled into owner, disabled from public.posts where id = p_post;
  if owner is null then raise exception 'Post not found'; end if;
  if not public.can_view_author(owner) then raise exception 'You cannot view this post.' using errcode = '42501'; end if;
  if disabled then raise exception 'Comments are turned off for this post.' using errcode = '42501'; end if;

  if p_parent_comment is not null then
    select * into parent from public.comments where id = p_parent_comment and post_id = p_post;
    if not found then raise exception 'The comment you are replying to no longer exists.'; end if;
    top_parent := coalesce(parent.parent_id, parent.id);
    reply_to := parent.user_id;
  end if;

  insert into public.comments (post_id, user_id, text, parent_id, reply_to_user_id, media_url, media_type, media_duration)
    values (p_post, me, nullif(t, ''), top_parent, reply_to, p_media_url, p_media_type, p_media_duration) returning id into cid;

  notif_text := case when t <> '' then '"' || left(t, 80) || case when length(t) > 80 then '…' else '' end || '"' else public.comment_media_label(p_media_type) end;
  if owner <> me then
    perform public.notify_user(owner, 'post_comment', me, 'commented: ' || notif_text, null, p_post);
  end if;
  if reply_to is not null and reply_to <> me and reply_to <> owner then
    perform public.notify_user(reply_to, 'post_comment', me, 'replied to your comment: ' || notif_text, null, p_post);
  end if;
  perform public.award_points(me, 5, 'Posted a comment');
  return jsonb_build_object('success', true, 'comment', (select public.comment_json(c) from public.comments c where c.id = cid));
end;
$$;

drop function if exists public.add_reel_comment(uuid, text);
drop function if exists public.add_reel_comment(uuid, text, uuid);
create or replace function public.add_reel_comment(
  p_reel uuid, p_text text default null, p_parent_comment uuid default null,
  p_media_url text default null, p_media_type text default null, p_media_duration text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); t text := btrim(coalesce(p_text, '')); cid uuid; owner uuid; disabled boolean;
  parent public.comments; top_parent uuid; reply_to uuid; notif_text text;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if (select is_suspended from public.profiles where id = me) is not false then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if t = '' and p_media_url is null then raise exception 'Comment text cannot be empty'; end if;
  if p_media_url is not null and p_media_type not in ('image', 'video', 'voice', 'gif', 'sticker') then
    raise exception 'Unsupported attachment type';
  end if;
  select user_id, is_comments_disabled into owner, disabled from public.reels where id = p_reel;
  if owner is null then raise exception 'Reel not found'; end if;
  if not public.can_view_author(owner) then raise exception 'You cannot view this reel.' using errcode = '42501'; end if;
  if disabled then raise exception 'Comments are turned off for this reel.' using errcode = '42501'; end if;

  if p_parent_comment is not null then
    select * into parent from public.comments where id = p_parent_comment and reel_id = p_reel;
    if not found then raise exception 'The comment you are replying to no longer exists.'; end if;
    top_parent := coalesce(parent.parent_id, parent.id);
    reply_to := parent.user_id;
  end if;

  insert into public.comments (reel_id, user_id, text, parent_id, reply_to_user_id, media_url, media_type, media_duration)
    values (p_reel, me, nullif(t, ''), top_parent, reply_to, p_media_url, p_media_type, p_media_duration) returning id into cid;

  notif_text := case when t <> '' then '"' || left(t, 80) || case when length(t) > 80 then '…' else '' end || '"' else public.comment_media_label(p_media_type) end;
  if owner <> me then
    perform public.notify_user(owner, 'post_comment', me, 'commented on your reel: ' || notif_text, null, null, p_reel);
  end if;
  if reply_to is not null and reply_to <> me and reply_to <> owner then
    perform public.notify_user(reply_to, 'post_comment', me, 'replied to your comment: ' || notif_text, null, null, p_reel);
  end if;
  perform public.award_points(me, 5, 'Commented on a reel');
  return jsonb_build_object('success', true, 'comment', (select public.comment_json(c) from public.comments c where c.id = cid));
end;
$$;

grant execute on function public.add_comment(uuid, text, uuid, text, text, text) to authenticated;
grant execute on function public.add_reel_comment(uuid, text, uuid, text, text, text) to authenticated;
