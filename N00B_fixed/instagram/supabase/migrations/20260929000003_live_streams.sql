-- Live Streaming: a host goes live, viewers watch (video itself is carried by Agora, not this database),
-- and can send NOOB Points as gifts in real time. Privacy reuses the exact same can_view_author() rule
-- already used for posts/reels/stories, so a private account's stream is only visible to the same people
-- who could already see their other content (plus super viewers).

create table if not exists public.live_streams (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  channel_name text not null unique,
  title text not null default '',
  status text not null default 'live' check (status in ('live', 'ended')),
  viewer_count int not null default 0,
  total_gift_points bigint not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists live_streams_status_idx on public.live_streams (status) where status = 'live';
create index if not exists live_streams_host_idx on public.live_streams (host_id);

alter table public.live_streams enable row level security;
drop policy if exists live_streams_read on public.live_streams;
create policy live_streams_read on public.live_streams for select using (public.can_view_author(host_id));

-- One row per gift sent during a stream — the tamper-proof feed viewers subscribe to (via Realtime) to see
-- gift animations, since only the live_stream_gift() function below can ever insert into it.
create table if not exists public.live_stream_gifts (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.live_streams(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  amount bigint not null,
  created_at timestamptz not null default now()
);
create index if not exists live_stream_gifts_stream_idx on public.live_stream_gifts (stream_id, created_at desc);
alter table public.live_stream_gifts enable row level security;
drop policy if exists live_stream_gifts_read on public.live_stream_gifts;
create policy live_stream_gifts_read on public.live_stream_gifts for select using (
  exists (select 1 from public.live_streams s where s.id = stream_id and public.can_view_author(s.host_id))
);

-- Starting a stream you're already live on just hands back the same one (safe against a double-tap on "Go Live").
create or replace function public.start_live_stream(p_title text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); existing public.live_streams; s public.live_streams;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into existing from public.live_streams where host_id = me and status = 'live';
  if found then
    return jsonb_build_object('id', existing.id, 'channelName', existing.channel_name, 'title', existing.title, 'startedAt', existing.started_at);
  end if;
  insert into public.live_streams (host_id, channel_name, title)
  values (me, 'live_' || replace(gen_random_uuid()::text, '-', ''), left(btrim(coalesce(p_title, '')), 80))
  returning * into s;
  return jsonb_build_object('id', s.id, 'channelName', s.channel_name, 'title', s.title, 'startedAt', s.started_at);
end;
$$;
revoke execute on function public.start_live_stream(text) from public;
grant execute on function public.start_live_stream(text) to authenticated;

create or replace function public.end_live_stream(p_stream_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  update public.live_streams set status = 'ended', ended_at = now()
  where id = p_stream_id and host_id = me and status = 'live';
  if not found then raise exception 'That stream was not found or has already ended.'; end if;
  return jsonb_build_object('success', true);
end;
$$;
revoke execute on function public.end_live_stream(uuid) from public;
grant execute on function public.end_live_stream(uuid) to authenticated;

-- Everyone currently live, visible to the caller — used for the "Live" rail/feed.
create or replace function public.list_live_streams() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'title', s.title, 'viewerCount', s.viewer_count, 'startedAt', s.started_at,
    'host', jsonb_build_object('id', p.id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar)
  ) order by s.viewer_count desc, s.started_at desc), '[]'::jsonb)
  from public.live_streams s join public.profiles p on p.id = s.host_id
  where s.status = 'live' and public.can_view_author(s.host_id);
$$;
revoke execute on function public.list_live_streams() from public;
grant execute on function public.list_live_streams() to authenticated;

-- A viewer joining: the one place that both enforces privacy (can_view_author) AND counts the viewer, so the
-- Agora token function below can trust its result without repeating either check itself.
create or replace function public.live_stream_join(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s public.live_streams;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
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

create or replace function public.live_stream_leave(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.live_streams set viewer_count = greatest(0, viewer_count - 1) where id = p_id and status = 'live';
$$;
revoke execute on function public.live_stream_leave(uuid) from public;
grant execute on function public.live_stream_leave(uuid) to authenticated;

-- Sending a gift: an instant points spend (no password prompt, same as any other points-spending feature
-- like the mini-games) — not a peer-to-peer transfer someone set out to make, so it stays low-friction.
create or replace function public.live_stream_gift(p_stream_id uuid, p_amount bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); s public.live_streams; bal bigint; sname text; hname text; tid uuid := gen_random_uuid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000 then raise exception 'Enter a valid number of points to gift.'; end if;
  select * into s from public.live_streams where id = p_stream_id for update;
  if not found or s.status <> 'live' then raise exception 'This stream has ended.'; end if;
  if s.host_id = me then raise exception 'You cannot gift your own stream.'; end if;

  select noob_points, username into bal, sname from public.profiles where id = me;
  if bal < p_amount then raise exception 'Insufficient NOOB Points. You have % points.', public.fmt_points(bal); end if;
  select username into hname from public.profiles where id = s.host_id;

  perform public.apply_points(me, -p_amount, 'Gift to @' || hname || ' (live stream)', tid);
  perform public.apply_points(s.host_id, p_amount, 'Gift from @' || sname || ' (live stream)', tid);
  update public.live_streams set total_gift_points = total_gift_points + p_amount where id = p_stream_id;
  insert into public.live_stream_gifts (stream_id, sender_id, amount) values (p_stream_id, me, p_amount);
  perform public.notify_user(s.host_id, 'live_gift', me,
    '@' || sname || ' sent you ' || public.fmt_points(p_amount) || ' NOOB Points on your live stream!', '🎁 Live Gift');
  return jsonb_build_object('success', true, 'transferId', tid);
end;
$$;
revoke execute on function public.live_stream_gift(uuid, bigint) from public;
grant execute on function public.live_stream_gift(uuid, bigint) to authenticated;
