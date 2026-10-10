-- Profile "Feed" tab: every video post (a post with at least one video slide) one person has shared, newest first.
-- The app only ever loads the latest 200 posts of everyone, so an older video of theirs would be missing from their
-- own profile; this asks the server for that one person's videos directly. Archived posts are left out, and the usual
-- rule applies: a private account's videos are only returned to people allowed to see that account.
create or replace function public.user_feed_videos(p_user uuid, p_limit integer default 60) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(public.post_json(x.po) order by (x.po).created_at desc), '[]'::jsonb)
  from (
    select p as po
    from public.posts p
    where p.user_id = p_user
      and not p.is_archived
      and exists (select 1 from public.post_slides s where s.post_id = p.id and s.media_type = 'video')
      and public.can_view_author(p.user_id)
    order by p.created_at desc
    limit greatest(1, least(p_limit, 100))
  ) x;
$$;

revoke execute on function public.user_feed_videos(uuid, integer) from public, anon;
grant execute on function public.user_feed_videos(uuid, integer) to authenticated;
