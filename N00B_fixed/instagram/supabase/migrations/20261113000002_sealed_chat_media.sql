-- NOOB - end-to-end locked pictures, videos and voice notes in chats.
--
-- The app now locks a chat attachment ON THE SENDER'S PHONE (AES-GCM, a new random key for every file) before uploading it. What reaches storage is random
-- bytes, saved as  chat/<name>.sealed  ; the file's key travels only inside the already end-to-end encrypted chat message. Nothing existing changes: old
-- pictures, videos and voice notes keep their names, links and rules exactly as they are.
--
-- This file does four small, additive things:
--   1. the storage bucket also accepts the type "application/octet-stream" (what a locked file is). A RESTRICTIVE policy makes sure that type is accepted ONLY
--      for  chat/<name>.sealed  - every other folder still takes pictures, video and audio only, as before.
--   2. a table  sealed_media  that remembers which locked file belongs to which message. The server can not see inside a locked message, so without this a
--      deleted message would leave its locked file behind, and the "files nobody points to" sweep (media_unused_candidates) could list a locked file as unused.
--      With it, deleting the message (or the chat, or the account) puts the file into the normal media_trash queue (24 hours, then purged like every other file).
--   3. three small functions the app calls: register_sealed_media (right after the upload), attach_sealed_media (right after the message is sent) and
--      discard_sealed_media (when sending failed). A forgotten (never attached) registration is cleared two days later, by its owner's next upload.
--   4. nothing is read from or written to any existing row.
-- Run once, in the SQL editor. It is safe to run twice. (It needs migration 20261016000005, the media_trash queue, to have been run - it was.)

-- 1 -----------------------------------------------------------------------------------------------------------------------------------------------------
update storage.buckets
   set allowed_mime_types = array['image/*', 'video/*', 'audio/*', 'application/octet-stream']
 where id = 'media';

drop policy if exists media_sealed_only on storage.objects;
create policy media_sealed_only on storage.objects as restrictive for insert to authenticated
  with check (
    bucket_id <> 'media'
    or coalesce(metadata ->> 'mimetype', '') <> 'application/octet-stream'
    or name ~ '^chat/[A-Za-z0-9._~@+=-]{1,160}\.sealed$'
  );

-- 2 -----------------------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.sealed_media (
  key         text primary key check (key ~ '^chat/[A-Za-z0-9._~@+=-]{1,160}\.sealed$'),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  chat_id     uuid not null references public.chats(id) on delete cascade,
  message_id  uuid references public.messages(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists sealed_media_message_idx on public.sealed_media (message_id) where message_id is not null;
create index if not exists sealed_media_stale_idx on public.sealed_media (owner_id, created_at) where message_id is null;
alter table public.sealed_media enable row level security;
revoke all on public.sealed_media from anon, authenticated;     -- only the functions below touch it

-- when a row goes (its message, chat or account was deleted, or the send failed) its locked file goes into the normal deletion queue
do $$
begin
  if to_regprocedure('public.trash_replaced_media()') is null then
    raise exception 'Run migration 20261016000005 (the media_trash queue) first.';
  end if;
  drop trigger if exists trash_media_del_sealed_media on public.sealed_media;
  create trigger trash_media_del_sealed_media after delete on public.sealed_media
    for each row execute function public.trash_replaced_media('24 hours', 'key');
end
$$;

-- 3 -----------------------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.register_sealed_media(p_chat uuid, p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not public.is_chat_member(p_chat) then raise exception 'You are not a participant in this chat.' using errcode = '42501'; end if;
  if p_key is null or p_key !~ '^chat/[A-Za-z0-9._~@+=-]{1,160}\.sealed$' then raise exception 'That is not a valid attachment.'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'media' and o.name = p_key and o.owner_id = me::text) then
    raise exception 'That upload was not found.';
  end if;
  -- the person's own forgotten registrations (a send that never finished) are cleared; their files go to the deletion queue
  delete from public.sealed_media where owner_id = me and message_id is null and created_at < now() - interval '2 days';
  insert into public.sealed_media (key, owner_id, chat_id) values (p_key, me, p_chat) on conflict (key) do nothing;
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.attach_sealed_media(p_message uuid, p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n integer;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  update public.sealed_media s set message_id = p_message
    from public.messages m
   where s.key = p_key and s.owner_id = me and s.message_id is null
     and m.id = p_message and m.sender_id = me and m.e2ee is not null and m.chat_id = s.chat_id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'That attachment does not belong to this message.'; end if;
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.discard_sealed_media(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  delete from public.sealed_media where key = p_key and owner_id = me and message_id is null;
  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.register_sealed_media(uuid, text), public.attach_sealed_media(uuid, text), public.discard_sealed_media(text) from public, anon;
grant execute on function public.register_sealed_media(uuid, text), public.attach_sealed_media(uuid, text), public.discard_sealed_media(text) to authenticated;
