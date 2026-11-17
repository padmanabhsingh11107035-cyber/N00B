-- Faster, steadier comment lists. The old page functions (post_comments_page / reel_comments_page) hand over the newest 100 comments of ANY kind: when the newest comments were
-- all replies, their parent comments were older and fell outside the page, so the list showed NO comments although there were some; and 100 comments (each with a privacy-checked
-- author lookup) took long to arrive.
-- These two functions page by THREAD: p_limit top-level comments (pinned first, then newest) together with ALL the replies of exactly those comments, so a reply never arrives
-- without its parent and the first screen is small and quick (20 threads). They also say how many top-level comments are loaded, whether there are more, and how many comments the
-- post / reel has in all. Same visibility rules as before (a comment hidden by moderation is seen only by its writer). Signed-in people only, like the old page functions.
-- The old functions stay (older copies of the app still call them). Safe to run more than once.

create index if not exists comments_post_top_idx on public.comments (post_id, is_pinned desc, created_at desc) where parent_id is null;
create index if not exists comments_reel_top_idx on public.comments (reel_id, is_pinned desc, created_at desc) where parent_id is null;
create index if not exists comments_parent_idx on public.comments (parent_id) where parent_id is not null;

create or replace function public.post_comments_threads(p_post uuid, p_limit integer default 20, p_offset integer default 0) returns jsonb
language sql stable security definer set search_path = public as $$
  with lim as (select least(greatest(coalesce(p_limit, 20), 1), 50) as n, greatest(coalesce(p_offset, 0), 0) as o),
  tops as (
    select c as rec, c.id as cid, c.is_pinned as pinned, c.created_at as at
    from public.comments c, lim
    where c.post_id = p_post and c.parent_id is null and (c.hidden_reason is null or c.user_id = auth.uid())
    order by c.is_pinned desc, c.created_at desc, c.id desc
    limit (select n from lim) offset (select o from lim)
  ),
  reps as (
    select r as rec, r.created_at as at
    from public.comments r join tops t on r.parent_id = t.cid
    where r.hidden_reason is null or r.user_id = auth.uid()
    order by r.created_at asc, r.id asc
    limit 600
  )
  select jsonb_build_object(
    'comments',
      coalesce((select jsonb_agg(public.comment_json(t.rec) order by t.pinned desc, t.at desc, t.cid desc) from tops t), '[]'::jsonb)
      || coalesce((select jsonb_agg(public.comment_json(r.rec) order by r.at asc) from reps r), '[]'::jsonb),
    'topCount', (select count(*) from tops),
    'hasMore', (select count(*) from public.comments c where c.post_id = p_post and c.parent_id is null and (c.hidden_reason is null or c.user_id = auth.uid())) > (select o + n from lim),
    'total', (select count(*) from public.comments c where c.post_id = p_post and (c.hidden_reason is null or c.user_id = auth.uid())));
$$;

create or replace function public.reel_comments_threads(p_reel uuid, p_limit integer default 20, p_offset integer default 0) returns jsonb
language sql stable security definer set search_path = public as $$
  with lim as (select least(greatest(coalesce(p_limit, 20), 1), 50) as n, greatest(coalesce(p_offset, 0), 0) as o),
  tops as (
    select c as rec, c.id as cid, c.is_pinned as pinned, c.created_at as at
    from public.comments c, lim
    where c.reel_id = p_reel and c.parent_id is null and (c.hidden_reason is null or c.user_id = auth.uid())
    order by c.is_pinned desc, c.created_at desc, c.id desc
    limit (select n from lim) offset (select o from lim)
  ),
  reps as (
    select r as rec, r.created_at as at
    from public.comments r join tops t on r.parent_id = t.cid
    where r.hidden_reason is null or r.user_id = auth.uid()
    order by r.created_at asc, r.id asc
    limit 600
  )
  select jsonb_build_object(
    'comments',
      coalesce((select jsonb_agg(public.comment_json(t.rec) order by t.pinned desc, t.at desc, t.cid desc) from tops t), '[]'::jsonb)
      || coalesce((select jsonb_agg(public.comment_json(r.rec) order by r.at asc) from reps r), '[]'::jsonb),
    'topCount', (select count(*) from tops),
    'hasMore', (select count(*) from public.comments c where c.reel_id = p_reel and c.parent_id is null and (c.hidden_reason is null or c.user_id = auth.uid())) > (select o + n from lim),
    'total', (select count(*) from public.comments c where c.reel_id = p_reel and (c.hidden_reason is null or c.user_id = auth.uid())));
$$;

revoke all on function public.post_comments_threads(uuid, integer, integer) from public, anon;
revoke all on function public.reel_comments_threads(uuid, integer, integer) from public, anon;
grant execute on function public.post_comments_threads(uuid, integer, integer) to authenticated, service_role;
grant execute on function public.reel_comments_threads(uuid, integer, integer) to authenticated, service_role;
