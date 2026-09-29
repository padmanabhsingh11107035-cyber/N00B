-- Live chat + likes for live streams. Chat messages are real, permanent rows (so they double as the
-- stream's comment history, same idea as post/reel comments) — never ephemeral. Likes stay a lightweight
-- running counter (tapping a heart during a live is a reaction, not something anyone expects to browse
-- back through later) plus a realtime broadcast purely for the floating-heart animation.

alter table public.live_streams add column if not exists total_likes bigint not null default 0;

-- gift_amount is set only on the automatic "sent a gift" line live_stream_gift() below inserts — it lets
-- the client style that one line differently (a gold banner) without a second subscription just for gifts.
create table if not exists public.live_stream_comments (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.live_streams(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  gift_amount bigint,
  created_at timestamptz not null default now()
);
create index if not exists live_stream_comments_stream_idx on public.live_stream_comments (stream_id, created_at desc);
alter table public.live_stream_comments enable row level security;
drop policy if exists live_stream_comments_read on public.live_stream_comments;
create policy live_stream_comments_read on public.live_stream_comments for select using (
  exists (select 1 from public.live_streams s where s.id = stream_id and public.can_view_author(s.host_id))
);

create or replace function public.live_stream_comment(p_stream_id uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); body text := btrim(coalesce(p_text, '')); s public.live_streams; row_id uuid; row_created timestamptz;
  sname text; sdisplay text; savatar text;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if body = '' or length(body) > 300 then raise exception 'Enter a message up to 300 characters.'; end if;
  select * into s from public.live_streams where id = p_stream_id;
  if not found or s.status <> 'live' or not public.can_view_author(s.host_id) then
    raise exception 'This stream is not available.';
  end if;
  insert into public.live_stream_comments (stream_id, sender_id, text) values (p_stream_id, me, body)
  returning id, created_at into row_id, row_created;
  select username, display_name, avatar into sname, sdisplay, savatar from public.profiles where id = me;
  return jsonb_build_object(
    'id', row_id, 'streamId', p_stream_id, 'text', body, 'giftAmount', null, 'createdAt', row_created,
    'sender', jsonb_build_object('id', me, 'username', sname, 'displayName', sdisplay, 'avatar', savatar)
  );
end;
$$;
revoke execute on function public.live_stream_comment(uuid, text) from public;
grant execute on function public.live_stream_comment(uuid, text) to authenticated;

-- Recent chat history so someone joining mid-stream isn't dropped into an empty chat.
create or replace function public.live_stream_comments_recent(p_stream_id uuid, p_limit int default 50) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t."createdAt"), '[]'::jsonb) from (
    select c.id, c.stream_id as "streamId", c.text, c.gift_amount as "giftAmount", c.created_at as "createdAt",
           jsonb_build_object('id', p.id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar) as sender
    from public.live_stream_comments c
    join public.profiles p on p.id = c.sender_id
    where c.stream_id = p_stream_id
      and exists (select 1 from public.live_streams s where s.id = c.stream_id and public.can_view_author(s.host_id))
    order by c.created_at desc
    limit least(greatest(p_limit, 1), 100)
  ) t;
$$;
revoke execute on function public.live_stream_comments_recent(uuid, int) from public;
grant execute on function public.live_stream_comments_recent(uuid, int) to authenticated;

create or replace function public.live_stream_like(p_stream_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); new_total bigint;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  update public.live_streams set total_likes = total_likes + 1
  where id = p_stream_id and status = 'live' and public.can_view_author(host_id)
  returning total_likes into new_total;
  if not found then raise exception 'This stream is not available.'; end if;
  return jsonb_build_object('totalLikes', new_total);
end;
$$;
revoke execute on function public.live_stream_like(uuid) from public;
grant execute on function public.live_stream_like(uuid) to authenticated;

-- Same signature as the live_stream_gift() created in the previous migration, so CREATE OR REPLACE only
-- swaps its body — the grant that migration already made stays in place. The one addition: every gift
-- now also posts itself as a comment line (gift_amount set), so it shows up right in the chat feed
-- everyone is already watching, instead of needing a second subscription just for gifts.
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
  insert into public.live_stream_comments (stream_id, sender_id, text, gift_amount)
  values (p_stream_id, me, 'sent ' || public.fmt_points(p_amount) || ' NOOB Points 🎁', p_amount);
  perform public.notify_user(s.host_id, 'live_gift', me,
    '@' || sname || ' sent you ' || public.fmt_points(p_amount) || ' NOOB Points on your live stream!', '🎁 Live Gift');
  return jsonb_build_object('success', true, 'transferId', tid);
end;
$$;
revoke execute on function public.live_stream_gift(uuid, bigint) from public;
grant execute on function public.live_stream_gift(uuid, bigint) to authenticated;
