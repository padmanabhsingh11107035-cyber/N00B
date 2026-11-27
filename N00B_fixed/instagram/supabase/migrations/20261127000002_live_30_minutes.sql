-- Live streams: at most 30 minutes, and nothing of a live is kept after it ends. Run after the earlier migrations. Safe to run more than once.
--
-- The video of a live is carried by Agora and was never recorded, so there is no replay. This adds the two rules the app promised:
--   * a live that is 30 minutes old is ended by the database itself (the host's phone also stops it at 30 minutes, this is the safety net for a phone that died or was closed);
--   * the chat of a live is erased a minute after it ends (the gifts stay: they are a record of NOOB Points that moved), and an ended live is never listed or joined.
-- list_live_streams also hands out the number of hearts, so the "Live now" boxes on top of Home can show them.
create or replace function public.live_streams_housekeeping() returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.live_streams set status = 'ended', ended_at = now()
   where status = 'live' and started_at < now() - interval '30 minutes';
  delete from public.live_stream_comments c
   using public.live_streams s
   where s.id = c.stream_id and s.status = 'ended' and s.ended_at < now() - interval '1 minute';
end;
$$;
revoke all on function public.live_streams_housekeeping() from public, anon, authenticated;

create or replace function public.list_live_streams() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.live_streams_housekeeping();
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'title', s.title, 'viewerCount', s.viewer_count, 'totalLikes', s.total_likes, 'startedAt', s.started_at,
      'host', jsonb_build_object('id', p.id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar)
    ) order by s.viewer_count desc, s.started_at desc), '[]'::jsonb)
    from public.live_streams s join public.profiles p on p.id = s.host_id
    where s.status = 'live' and s.started_at >= now() - interval '30 minutes' and public.can_view_author(s.host_id)
  );
end;
$$;
revoke execute on function public.list_live_streams() from public;
grant execute on function public.list_live_streams() to authenticated;

create or replace function public.live_stream_join(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s public.live_streams;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  perform public.live_streams_housekeeping();
  select * into s from public.live_streams where id = p_id;
  if not found or s.status <> 'live' or not public.can_view_author(s.host_id) then
    raise exception 'This stream is not available.';
  end if;
  update public.live_streams set viewer_count = viewer_count + 1 where id = p_id;
  return jsonb_build_object('channelName', s.channel_name, 'hostId', s.host_id, 'isHost', s.host_id = me);
end;
$$;
revoke execute on function public.live_stream_join(uuid) from public;
grant execute on function public.live_stream_join(uuid) to authenticated;

-- every minute, where the database has a scheduler (the same one the hourly NOOB jobs use)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('noob-live-housekeeping', '* * * * *', $job$ select public.live_streams_housekeeping(); $job$);
  end if;
exception when others then null;
end $$;
