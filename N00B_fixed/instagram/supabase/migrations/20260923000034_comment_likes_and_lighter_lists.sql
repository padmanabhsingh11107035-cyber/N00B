-- NOOB — two independent fixes:
--
-- 1) Comment "likes" were never real: CommentsSheet.tsx toggled isLiked/likesCount purely in local
--    React state, with no backend call at all — comment_json has always hardcoded 'isLiked': false
--    for exactly this reason (there was nothing to check it against). So a like never survived
--    closing and reopening the comment sheet, a reload, or being seen by anyone else. Mirrors
--    post_likes/reel_likes exactly.
create table public.comment_likes (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index comment_likes_user_idx on public.comment_likes (user_id);

alter table public.comment_likes enable row level security;
create policy comment_likes_select on public.comment_likes for select to authenticated
  using (exists (select 1 from public.comments c where c.id = comment_id));
create policy comment_likes_insert on public.comment_likes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.comments c where c.id = comment_id));
create policy comment_likes_delete on public.comment_likes for delete to authenticated
  using (user_id = auth.uid());
grant select, insert, delete on public.comment_likes to authenticated;

-- Reuses the same generic counter-sync trigger every other likes_count/saves_count/comments_count
-- column is kept in step with (see 20260919000001_core_schema.sql) — no new trigger logic needed.
create trigger comment_likes_count after insert or delete on public.comment_likes
  for each row execute function public.bump_counter('comments', 'likes_count', 'comment_id');

create or replace function public.toggle_comment_like(p_comment uuid) returns jsonb
language plpgsql set search_path = public as $$
declare me uuid := auth.uid(); liked boolean;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.comments where id = p_comment) then raise exception 'Comment not found'; end if;
  if exists (select 1 from public.comment_likes where comment_id = p_comment and user_id = me) then
    delete from public.comment_likes where comment_id = p_comment and user_id = me;
    liked := false;
  else
    insert into public.comment_likes (comment_id, user_id) values (p_comment, me);
    liked := true;
  end if;
  return jsonb_build_object('success', true, 'isLiked', liked, 'likesCount', (select likes_count from public.comments where id = p_comment));
end;
$$;

-- comment_json now checks the viewer's own like instead of always returning false. Same signature
-- as before (a `create or replace`, not a new overload) — every caller (post_comments,
-- reel_comments, add_comment, add_reel_comment) picks this up automatically.
create or replace function public.comment_json(c public.comments) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'postId', coalesce(c.post_id, c.reel_id), 'reelId', c.reel_id, 'userId', c.user_id, 'username', a.username,
    'userAvatar', a.avatar, 'isVerified', a.is_verified, 'text', c.text, 'likesCount', c.likes_count,
    'isLiked', exists (select 1 from public.comment_likes cl where cl.comment_id = c.id and cl.user_id = auth.uid()),
    'isPinned', c.is_pinned, 'createdAt', c.created_at,
    'parentId', c.parent_id, 'replyToUserId', c.reply_to_user_id, 'replyToUsername', ru.username)
  from public.profiles a
  left join public.profiles ru on ru.id = c.reply_to_user_id
  where a.id = c.user_id;
$$;

-- ===========================================================================
-- 2) "Who liked / viewed this" lists (post_likers, post_viewers, reel_likers, reel_viewers) were
--    built on user_public_json — a full profile JSON that, per row, aggregates that person's ENTIRE
--    following list (followingIds) plus a dozen other profile fields, none of which LikesViewsSheet.tsx
--    ever reads (confirmed: it only renders avatar/username/displayName/isVerified). Measured
--    directly against production: post_likers took ~2.4x the server time of post_comments for the
--    exact same request shape (6.6ms vs 2.7ms) purely from that wasted per-row work — small today,
--    but it scales with how many accounts each liker/viewer follows, not with anything this list
--    actually needs. Swapping to a trimmed shape for just these four lists removes that waste
--    without touching user_public_json itself (still used, unchanged, everywhere a full profile is
--    actually needed).
create or replace function public.user_list_json(p public.profiles) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'displayName', p.display_name,
    'avatar', p.avatar, 'isVerified', p.is_verified
  );
$$;

create or replace function public.post_likers(p_post uuid) returns jsonb
language plpgsql stable set search_path = public as $$
begin
  if not exists (select 1 from public.posts where id = p_post) then raise exception 'You cannot view this post.' using errcode = '42501'; end if;
  return jsonb_build_object('users', coalesce((
    select jsonb_agg(public.user_list_json(pr) order by l.created_at desc)
    from public.post_likes l join public.profiles pr on pr.id = l.user_id where l.post_id = p_post), '[]'::jsonb));
end;
$$;

create or replace function public.post_viewers(p_post uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from public.posts where id = p_post;
  if owner is null then raise exception 'Post not found'; end if;
  if owner <> auth.uid() then raise exception 'Only the post owner can see who viewed it.' using errcode = '42501'; end if;
  return jsonb_build_object('users', coalesce((
    select jsonb_agg(public.user_list_json(pr) order by v.created_at desc)
    from public.post_views v join public.profiles pr on pr.id = v.user_id where v.post_id = p_post), '[]'::jsonb));
end;
$$;

create or replace function public.reel_likers(p_reel uuid) returns jsonb
language plpgsql stable set search_path = public as $$
begin
  if not exists (select 1 from public.reels where id = p_reel) then raise exception 'You cannot view this reel.' using errcode = '42501'; end if;
  return jsonb_build_object('users', coalesce((
    select jsonb_agg(public.user_list_json(pr) order by l.created_at desc)
    from public.reel_likes l join public.profiles pr on pr.id = l.user_id where l.reel_id = p_reel), '[]'::jsonb));
end;
$$;

create or replace function public.reel_viewers(p_reel uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from public.reels where id = p_reel;
  if owner is null then raise exception 'Reel not found'; end if;
  if owner <> auth.uid() then raise exception 'Only the reel owner can see who viewed it.' using errcode = '42501'; end if;
  return jsonb_build_object('users', coalesce((
    select jsonb_agg(public.user_list_json(pr) order by v.created_at desc)
    from public.reel_views v join public.profiles pr on pr.id = v.user_id where v.reel_id = p_reel), '[]'::jsonb));
end;
$$;
