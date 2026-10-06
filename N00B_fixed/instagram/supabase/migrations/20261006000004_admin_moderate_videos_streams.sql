-- Let a moderator end anyone's live stream, not just their own (delete_long_video already allows
-- this for videos — see 20261006000002). Also puts live_streams on the realtime publication so a
-- host whose stream an admin just force-ended learns about it immediately instead of carrying on
-- broadcasting to an empty room.
create or replace function public.end_live_stream(p_stream_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  update public.live_streams set status = 'ended', ended_at = now()
  where id = p_stream_id and (host_id = me or public.is_admin()) and status = 'live';
  if not found then raise exception 'That stream was not found or has already ended.'; end if;
  return jsonb_build_object('success', true);
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_streams') then
    alter publication supabase_realtime add table public.live_streams;
  end if;
end
$$;
