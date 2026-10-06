-- In-room text chat for NOOB Rooms, plus stickers/GIFs/photo/video attachments — same shape as
-- Live Lounge's live_lounge_room_chat, but public (no "admitted" gate, since these rooms have no
-- admission step at all) and with a media_url/media_type pair for non-text messages.

create table public.noob_room_chat (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.noob_rooms(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete cascade,
  text       text not null default '',
  media_url  text,
  media_type text check (media_type in ('image', 'video', 'gif', 'sticker')),
  created_at timestamptz not null default now()
);
create index noob_room_chat_room_idx on public.noob_room_chat (room_id, created_at desc);
alter table public.noob_room_chat enable row level security;
create policy noob_room_chat_read on public.noob_room_chat for select using (true);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.noob_room_chat;
  end if;
end
$$;

create or replace function public.noob_room_chat_send(p_room_id uuid, p_text text default '', p_media_url text default null, p_media_type text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); body text := btrim(coalesce(p_text, '')); row_id uuid; row_created timestamptz;
  sname text; sdisplay text; savatar text;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if body = '' and p_media_url is null then raise exception 'Enter a message or attach something.'; end if;
  if length(body) > 300 then raise exception 'Keep messages under 300 characters.'; end if;
  if not exists (select 1 from public.noob_room_participants where room_id = p_room_id and user_id = me) then
    raise exception 'You are not in this room.';
  end if;
  insert into public.noob_room_chat (room_id, sender_id, text, media_url, media_type)
    values (p_room_id, me, body, p_media_url, p_media_type)
    returning id, created_at into row_id, row_created;
  select username, display_name, avatar into sname, sdisplay, savatar from public.profiles where id = me;
  return jsonb_build_object('id', row_id, 'roomId', p_room_id, 'text', body, 'mediaUrl', p_media_url, 'mediaType', p_media_type, 'createdAt', row_created,
    'sender', jsonb_build_object('id', me, 'username', sname, 'displayName', sdisplay, 'avatar', savatar));
end;
$$;
grant execute on function public.noob_room_chat_send(uuid, text, text, text) to authenticated;

create or replace function public.noob_room_chat_recent(p_room_id uuid, p_limit int default 50) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t."createdAt"), '[]'::jsonb) from (
    select c.id, c.room_id as "roomId", c.text, c.media_url as "mediaUrl", c.media_type as "mediaType", c.created_at as "createdAt",
           jsonb_build_object('id', p.id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar) as sender
    from public.noob_room_chat c
    join public.profiles p on p.id = c.sender_id
    where c.room_id = p_room_id
    order by c.created_at desc
    limit least(greatest(p_limit, 1), 100)
  ) t;
$$;
grant execute on function public.noob_room_chat_recent(uuid, int) to authenticated;
