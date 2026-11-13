-- Home feed, one page at a time (cursor paging).
-- ADDITIVE ONLY: one new function and one new index. feed_posts() is NOT touched, so the app as it is today keeps working exactly the same.
-- feed_posts_page returns the same post JSON (post_json) in the same order (newest first) as feed_posts, but only `p_limit` posts that come
-- strictly after the cursor (created_at, id) = (p_before_at, p_before_id); no cursor = the newest page.
-- Like feed_posts it is a plain (security invoker) function, so the posts_select row-level-security policy decides what each person may see
-- (blocked people, suspended / private accounts, archived and scheduled posts): the rules are identical by construction, not copied.
-- Safe to run twice.

create index if not exists posts_created_id_idx on public.posts (created_at desc, id desc);

create or replace function public.feed_posts_page(
  p_limit integer default 30,
  p_before_at timestamptz default null,
  p_before_id uuid default null
) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(public.post_json(x.po) order by (x.po).created_at desc, (x.po).id desc), '[]'::jsonb)
  from (
    select po from public.posts po
    where p_before_at is null
       or po.created_at < p_before_at
       or (po.created_at = p_before_at and p_before_id is not null and po.id < p_before_id)
    order by po.created_at desc, po.id desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  ) x;
$$;

revoke all on function public.feed_posts_page(integer, timestamptz, uuid) from public, anon;
grant execute on function public.feed_posts_page(integer, timestamptz, uuid) to authenticated, service_role;
