-- "Most viewed" on Home: how many different people have viewed each of some posts. Run after the earlier migrations. Safe to run more than once.
--
-- NOOB already notes every unique viewer of a post (post_views, written by record_post_view; the owner's own views and views by people who may not see the author do not count, and the
-- list of WHO viewed stays owner-only in post_viewers). This function hands out only the NUMBERS, for up to 200 posts at a time, only for posts the asking person may see, so the Home
-- filter can sort by them. It reveals nothing about who viewed, and it changes no table.
create or replace function public.post_view_counts(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(x.id, x.n), '{}'::jsonb)
  from (
    select p.id, (select count(*) from public.post_views v where v.post_id = p.id) as n
    from public.posts p
    where p.id = any ((coalesce(p_ids, '{}'::uuid[]))[1:200])
      and public.can_view_author(p.user_id)
  ) x;
$$;

revoke all on function public.post_view_counts(uuid[]) from public, anon;
grant execute on function public.post_view_counts(uuid[]) to authenticated;
