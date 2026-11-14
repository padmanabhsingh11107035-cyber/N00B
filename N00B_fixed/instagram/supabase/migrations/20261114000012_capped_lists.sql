-- Growth preparation (docs/GROWTH-PREPARATION.md, measure 6): the four lists that had no limit get one, and the long ones get a "Load more".
-- ADDITIVE: nothing is deleted or changed in any table. The four old functions keep their name, arguments, access rights and answer shape;
-- they now stop at 500 rows (newest / first first, same order as before), so below 500 rows the answer is exactly the same as before.
-- New "page" functions take a limit and an offset, for the "Load more" button:
--   post_comments_page(p_post, p_limit default 100, p_offset default 0)
--   reel_comments_page(p_reel, p_limit default 100, p_offset default 0)
--   list_music_tracks_page(p_limit default 100, p_offset default 0)
-- (limit is clamped to 1..500, offset to 0 or more; same order, with the id as the tie-break so pages never overlap).
-- my_chats has no page function: the Messages page does not page, so it is only capped at 500 chats (pinned and the Lounge first, then newest).
-- Safe to run twice. Callers (src/services/supabaseApi.ts) fall back to the old functions while this migration is not run yet.

-- ------------------------------------------------------------------ comments
create or replace function public.post_comments_page(p_post uuid, p_limit integer default 100, p_offset integer default 0) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('comments', coalesce(jsonb_agg(public.comment_json(x.c) order by (x.c).created_at desc, (x.c).id desc), '[]'::jsonb))
  from (
    select c from public.comments c
    where c.post_id = p_post and (c.hidden_reason is null or c.user_id = auth.uid())
    order by c.created_at desc, c.id desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500) offset greatest(coalesce(p_offset, 0), 0)
  ) x;
$$;

create or replace function public.reel_comments_page(p_reel uuid, p_limit integer default 100, p_offset integer default 0) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('comments', coalesce(jsonb_agg(public.comment_json(x.c) order by (x.c).created_at desc, (x.c).id desc), '[]'::jsonb))
  from (
    select c from public.comments c
    where c.reel_id = p_reel and (c.hidden_reason is null or c.user_id = auth.uid())
    order by c.created_at desc, c.id desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500) offset greatest(coalesce(p_offset, 0), 0)
  ) x;
$$;

create or replace function public.list_music_tracks_page(p_limit integer default 100, p_offset integer default 0) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(public.music_json(x.t) order by (x.t).created_at desc, (x.t).id desc), '[]'::jsonb)
  from (
    select t from public.music_tracks t
    order by t.created_at desc, t.id desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500) offset greatest(coalesce(p_offset, 0), 0)
  ) x;
$$;

-- the page functions are for people who are signed in (the old ones keep whatever access they already have)
revoke all on function public.post_comments_page(uuid, integer, integer) from public, anon;
revoke all on function public.reel_comments_page(uuid, integer, integer) from public, anon;
revoke all on function public.list_music_tracks_page(integer, integer) from public, anon;
grant execute on function public.post_comments_page(uuid, integer, integer) to authenticated, service_role;
grant execute on function public.reel_comments_page(uuid, integer, integer) to authenticated, service_role;
grant execute on function public.list_music_tracks_page(integer, integer) to authenticated, service_role;

-- ------------------------------------------------------------------ the old functions: same name, same answer, now capped at 500
create or replace function public.post_comments(p_post uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.post_comments_page(p_post, 500, 0);
$$;

create or replace function public.reel_comments(p_reel uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.reel_comments_page(p_reel, 500, 0);
$$;

create or replace function public.list_music_tracks() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(public.music_json(x.t) order by (x.t).created_at desc, (x.t).id desc), '[]'::jsonb)
  from (select t from public.music_tracks t order by t.created_at desc, t.id desc limit 500) x;
$$;

create or replace function public.my_chats() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(public.chat_json(x.c) order by x.top desc, x.last_at desc), '[]'::jsonb)
  from (
    select c, (c.is_global_default or coalesce(m.is_pinned, false)) as top, c.last_message_at as last_at
    from public.chats c left join public.chat_members m on m.chat_id = c.id and m.user_id = auth.uid()
    where auth.uid() is not null and (c.is_global_default or m.user_id is not null)
    order by (c.is_global_default or coalesce(m.is_pinned, false)) desc, c.last_message_at desc
    limit 500
  ) x;
$$;
