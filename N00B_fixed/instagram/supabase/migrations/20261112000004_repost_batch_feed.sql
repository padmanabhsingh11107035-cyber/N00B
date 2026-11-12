-- NOOB - Reposts, part 2: (1) one call for the repost state of many posts/reels at once (the feed used to ask once per card),
--                          (2) the reposts of the people you follow, for the Home feed ("Reposted by ...").
-- ADDITIVE ONLY: two new functions. No table, column or existing function is changed (feed_posts is not touched).

-- 1. repost_states('post', ARRAY[ids]) -> {"<id>": {"isReposted": true, "count": 3}, ...}   (at most 100 ids are read)
create or replace function public.repost_states(p_kind text, p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); result jsonb;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if p_kind not in ('post', 'reel', 'story') then raise exception 'Unknown kind'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then return '{}'::jsonb; end if;
  select coalesce(jsonb_object_agg(i.id::text, jsonb_build_object(
           'isReposted', exists (select 1 from public.reposts r where r.user_id = me and r.kind = p_kind and r.content_id = i.id),
           'count', (select count(*) from public.reposts r where r.kind = p_kind and r.content_id = i.id))), '{}'::jsonb)
    into result
  from (select distinct id from unnest(p_ids[1:100]) as id) i;
  return result;
end;
$$;

-- 2. feed_reposts(): the newest reposts (posts and reels) made in the last 30 days by people the caller follows.
--    One row per original (the most recent reposter wins). Left out: the caller's own reposts, items the caller wrote, archived
--    or scheduled posts, and anything the caller may not see (blocked, private and not followed, suspended). Same rule as post_by_id.
create or replace function public.feed_reposts(p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); result jsonb;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select coalesce(jsonb_agg(y.row_json order by y.at desc), '[]'::jsonb) into result
  from (
    select x.at, jsonb_build_object(
             'kind', x.kind,
             'repostedAt', x.at,
             'reposter', jsonb_build_object('id', pr.id, 'username', pr.username, 'displayName', pr.display_name, 'avatar', pr.avatar),
             'item', x.item) as row_json
    from (
      select distinct on (c.kind, c.content_id) c.kind, c.content_id, c.user_id as reposter_id, c.created_at as at, c.item
      from (
        select r.kind, r.content_id, r.user_id, r.created_at, public.post_json(po) as item
        from public.reposts r
        join public.follows f on f.follower_id = me and f.followee_id = r.user_id
        join public.posts po on r.kind = 'post' and po.id = r.content_id
        where r.created_at > now() - interval '30 days'
          and r.user_id <> me and po.user_id <> me
          and not po.is_archived
          and (po.scheduled_for is null or po.scheduled_for <= now())
          and public.can_view_author(po.user_id)
        union all
        select r.kind, r.content_id, r.user_id, r.created_at, public.reel_json(rl) as item
        from public.reposts r
        join public.follows f on f.follower_id = me and f.followee_id = r.user_id
        join public.reels rl on r.kind = 'reel' and rl.id = r.content_id
        where r.created_at > now() - interval '30 days'
          and r.user_id <> me and rl.user_id <> me
          and public.can_view_author(rl.user_id)
      ) c
      order by c.kind, c.content_id, c.created_at desc
    ) x
    join public.profiles pr on pr.id = x.reposter_id
    where coalesce(pr.is_suspended, false) = false
      and public.can_view_author(pr.id)
    order by x.at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ) y;
  return result;
end;
$$;

revoke all on function public.repost_states(text, uuid[]) from public, anon;
revoke all on function public.feed_reposts(integer) from public, anon;
grant execute on function public.repost_states(text, uuid[]) to authenticated;
grant execute on function public.feed_reposts(integer) to authenticated;
