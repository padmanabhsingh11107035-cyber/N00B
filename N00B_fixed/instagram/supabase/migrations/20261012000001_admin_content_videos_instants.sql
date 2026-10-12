-- NOOB admin panel -> Content tab: besides posts, reels and stories the admin can now also browse every long VIDEO and every INSTANT
-- on the platform (like admin_content_feed does for the other three). Videos can be pinned to the Feed from there (admin_set_feed_pin,
-- migration 20261011000002); instants are view-only on purpose: they are private photos sent to friends, so they are never pinnable.
-- Only the main admin may call these.

create or replace function public.admin_content_videos(p_limit integer default 60) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  return jsonb_build_object('success', true, 'items', coalesce((
    select jsonb_agg(public.long_video_json(x.v) order by (x.v).created_at desc)
    from (select v from public.long_videos v order by v.created_at desc limit least(greatest(p_limit, 1), 200)) x), '[]'::jsonb));
end;
$$;
revoke execute on function public.admin_content_videos(integer) from public, anon;
grant execute on function public.admin_content_videos(integer) to authenticated;

create or replace function public.admin_content_instants(p_limit integer default 60) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  return jsonb_build_object('success', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'userId', i.user_id, 'username', p.username, 'userAvatar', p.avatar, 'isVerified', p.is_verified,
      'mediaUrl', i.media_url, 'mediaType', 'image', 'caption', i.caption, 'audience', i.audience,
      'createdAt', i.created_at, 'expiresAt', i.expires_at,
      'sentTo', (select count(*) from public.instant_recipients r where r.instant_id = i.id)) order by i.created_at desc)
    from (select * from public.instants order by created_at desc limit least(greatest(p_limit, 1), 200)) i
    join public.profiles p on p.id = i.user_id), '[]'::jsonb));
end;
$$;
revoke execute on function public.admin_content_instants(integer) from public, anon;
grant execute on function public.admin_content_instants(integer) to authenticated;
