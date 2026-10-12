-- Profile "Feed" tab: besides video posts it now also lists the long videos (Home > Videos) a person uploaded. Before, those showed on no
-- profile page at all, so someone who had published a video there saw an empty Feed tab. Newest first; the usual rule applies: a private
-- account's videos are only returned to people allowed to see that account (can_view_author).
create or replace function public.user_long_videos(p_user uuid, p_limit integer default 60) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(public.long_video_json(x.v) order by (x.v).created_at desc), '[]'::jsonb)
  from (
    select v
    from public.long_videos v
    where v.user_id = p_user
      and public.can_view_author(v.user_id)
    order by v.created_at desc
    limit greatest(1, least(p_limit, 100))
  ) x;
$$;

revoke execute on function public.user_long_videos(uuid, integer) from public, anon;
grant execute on function public.user_long_videos(uuid, integer) to authenticated;
