-- NOOB — highlights keep their likes/comments, and stay likeable/commentable forever.
--
-- Root cause of "the like isn't saved when I come back to a highlight" and "no comments/likes on
-- highlights": every story is folded into its day's highlight the moment it's posted (see the 22
-- Sep redesign), but the ORIGINAL `stories` row — the only place `story_likes`/`story_comments`
-- actually live — was still being hard-deleted ~25h later by the nightly cleanup_expired_stories()
-- cron job. `story_likes`/`story_comments` both `references public.stories (id) on delete cascade`,
-- so every like and comment made during that first 24h was silently destroyed the moment the row
-- was swept up, regardless of whether the highlight snapshot itself lived on. And the *_story RPCs
-- also flatly refused any NEW like/comment on a story past its `expires_at`, which is exactly what
-- a highlight page always is once the story is no longer in the live 24h tray.
--
-- Fix: stop deleting story rows at all (nothing in this codebase ever cleaned up their media
-- either, so nothing here changes what storage holds), and stop refusing interaction on an expired
-- one — `expires_at` still controls what the *live 24h tray* (active_stories()) shows, it just no
-- longer controls whether the row, or liking/commenting on it, is allowed to exist.

-- 1) The nightly cron job (see 20260919000006) still exists and still fires — this makes it do
--    nothing instead of destroying the row every like/comment (and the highlight's own history of
--    them) is attached to. Kept as a real function (not unscheduled) so the existing pg_cron job
--    keeps calling something that exists rather than erroring every night.
create or replace function public.cleanup_expired_stories() returns integer
language plpgsql security definer set search_path = public as $$
begin
  return 0;
end;
$$;

-- 2) Liking and commenting no longer require the story to still be "active" — only that it exists
--    and the caller is allowed to see its author (unchanged from before).
create or replace function public.toggle_story_like(p_story uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid; was_liked boolean; cnt int;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select user_id into owner from public.stories where id = p_story;
  if owner is null then raise exception 'This story is no longer available.' using errcode = 'P0002'; end if;
  if owner <> me and not public.can_view_author(owner) then raise exception 'You cannot see this story.' using errcode = '42501'; end if;
  select exists (select 1 from public.story_likes where story_id = p_story and user_id = me) into was_liked;
  if was_liked then
    delete from public.story_likes where story_id = p_story and user_id = me;
  else
    insert into public.story_likes (story_id, user_id) values (p_story, me) on conflict do nothing;
  end if;
  select count(*) into cnt from public.story_likes where story_id = p_story;
  return jsonb_build_object('success', true, 'isLiked', not was_liked, 'likesCount', cnt);
end;
$$;

create or replace function public.add_story_comment(p_story uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t text := left(btrim(coalesce(p_text, '')), 500); owner uuid; cid uuid; who public.profiles;
begin
  if me is null then raise exception 'Please log in to comment.' using errcode = '28000'; end if;
  if t = '' then raise exception 'Comment cannot be empty.'; end if;
  select user_id into owner from public.stories where id = p_story;
  if owner is null then raise exception 'Story not found.'; end if;
  if not public.can_view_author(owner) then raise exception 'You cannot view this story.' using errcode = '42501'; end if;
  insert into public.story_comments (story_id, user_id, text) values (p_story, me, t) returning id into cid;
  select * into who from public.profiles where id = me;
  return jsonb_build_object('success', true, 'comment', jsonb_build_object(
    'id', cid, 'username', who.username, 'userAvatar', who.avatar, 'text', t, 'createdAt', now()));
end;
$$;

-- 3) A highlight's own snapshot (public.highlights.items) only ever carries the cosmetic, immutable
--    part of a story (media, stickers, when it was posted) — never comments/likes, which keep
--    changing after the fact. This is the read path the highlight viewer calls, per item id, to
--    layer today's real comments/likes/isLiked on top of that fixed snapshot: same shape as
--    active_stories(), just for one story regardless of whether it is still in the live 24h tray.
create or replace function public.story_by_id(p_story uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from public.stories where id = p_story;
  if owner is null then return null; end if;
  if owner <> auth.uid() and not public.can_view_author(owner) then raise exception 'You cannot see this story.' using errcode = '42501'; end if;
  return (select public.story_json(s) from public.stories s where s.id = p_story);
end;
$$;
