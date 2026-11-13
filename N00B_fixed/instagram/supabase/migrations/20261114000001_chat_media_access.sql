-- NOOB - chat pictures, videos and voice notes can only be opened by the people of the chat that has them (phase A: the gate).
--
-- Until now a file under  chat/  in the "media" bucket could be opened by ANYONE who had its link. This migration adds a list of "which chat does this file belong to"
-- and one question the website's Worker asks for every chat file:  can_read_chat_media(key)  =  "is the person asking in the chat that has this file?".
-- Nothing is moved, changed or deleted: no file, no message, no existing table is touched. It only ADDS a table, three small functions and two triggers.
--
--   1. chat_media_index        which chat (and which message) a file under chat/ belongs to. Nobody can read or write it directly.
--   2. chat_media_key_of()     turns whatever a message stored (a bare key, /m/<key>, /media/<key>, a full Supabase or NOOB address, with ?query) into the key.
--   3. backfill                every existing message (and every locked-attachment registration) is indexed, so old pictures keep working for their chat.
--   4. triggers                every NEW message that carries a chat file is indexed by the database itself, so old app versions keep working (no new app call needed).
--                              A file is only indexed for a message whose SENDER uploaded it (or who can already open it): nobody can claim somebody else's file by typing its name.
--   5. can_read_chat_media()   the question. True only for a member of the indexed chat, whose message is not deleted, not "deleted for me" and not from before they joined.
--                              Unknown file = false (the answer never tells whether a file exists). Granted to signed-in people only.
--
-- Run once, in the SQL editor. Safe to run twice. Needs the earlier chat migrations (it uses is_chat_member, history_start, message_hides, sealed_media).

-- 1 -----------------------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.chat_media_index (
  id          bigint generated always as identity primary key,
  key         text not null check (key ~ '^chat/[A-Za-z0-9._~@+=-]{1,160}$'),
  chat_id     uuid not null references public.chats(id) on delete cascade,
  message_id  uuid references public.messages(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create unique index if not exists chat_media_index_uniq on public.chat_media_index (key, chat_id, (coalesce(message_id, '00000000-0000-0000-0000-000000000000'::uuid)));
create index if not exists chat_media_index_key_idx on public.chat_media_index (key);
create index if not exists chat_media_index_message_idx on public.chat_media_index (message_id) where message_id is not null;
create index if not exists chat_media_index_chat_idx on public.chat_media_index (chat_id);
alter table public.chat_media_index enable row level security;
revoke all on public.chat_media_index from anon, authenticated;       -- only the functions below touch it

-- 2 -----------------------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.chat_media_key_of(p_value text) returns text
language plpgsql immutable set search_path = public as $$
declare v text := btrim(coalesce(p_value, ''));
begin
  if v = '' or v ~* '^(data|blob):' or v like 'pending:%' then return null; end if;
  v := regexp_replace(v, '[?#].*$', '');
  v := regexp_replace(v, '^https?://[^/]+/', '/');
  v := regexp_replace(v, '^/(storage/v1/object/(public|authenticated|sign)/(media|chatmedia)|m|media)/', '');
  v := regexp_replace(v, '^/+', '');
  v := replace(replace(replace(replace(replace(v, '%40', '@'), '%2B', '+'), '%2b', '+'), '%3D', '='), '%3d', '=');
  if v ~ '^chat/[A-Za-z0-9._~@+=-]{1,160}$' then return v; end if;
  return null;
end;
$$;
revoke execute on function public.chat_media_key_of(text) from public, anon, authenticated;

-- 3 (the backfill is at the end of this file, after the functions it needs) -----------------------------------------------------------------------------------

-- 4 -----------------------------------------------------------------------------------------------------------------------------------------------------
-- A new message with a chat file: indexed by the database. It must never stop a message from being sent, so every problem is swallowed.
create or replace function public.index_chat_media_from_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text := public.chat_media_key_of(new.media_url); ok boolean;
begin
  if k is null then return null; end if;
  if new.sender_id is null then
    ok := true;                                   -- a message written by the server itself
  else
    ok := exists (select 1 from storage.objects o where o.bucket_id in ('media', 'chatmedia') and o.name = k and o.owner_id = new.sender_id::text)
       or exists (select 1 from public.chat_media_index i join public.chat_members cm on cm.chat_id = i.chat_id
                   where i.key = k and cm.user_id = new.sender_id);   -- the sender can already open it (shared again inside a chat they are in)
  end if;
  if ok then
    insert into public.chat_media_index (key, chat_id, message_id) values (k, new.chat_id, new.id) on conflict do nothing;
  end if;
  return null;
exception when others then
  return null;
end;
$$;
revoke execute on function public.index_chat_media_from_message() from public, anon, authenticated;
drop trigger if exists messages_index_chat_media on public.messages;
create trigger messages_index_chat_media after insert or update of media_url on public.messages
  for each row when (new.media_url is not null) execute function public.index_chat_media_from_message();

-- a locked attachment (the file is ciphertext, so it needs no gate, but it is listed too: the move script and the owner's counts see every chat file)
create or replace function public.index_chat_media_from_sealed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.message_id is not null then
    delete from public.chat_media_index where key = new.key and chat_id = new.chat_id and message_id is null;
  end if;
  insert into public.chat_media_index (key, chat_id, message_id) values (new.key, new.chat_id, new.message_id) on conflict do nothing;
  return null;
exception when others then
  return null;
end;
$$;
revoke execute on function public.index_chat_media_from_sealed() from public, anon, authenticated;
drop trigger if exists sealed_media_index_chat_media on public.sealed_media;
create trigger sealed_media_index_chat_media after insert or update of message_id on public.sealed_media
  for each row execute function public.index_chat_media_from_sealed();

-- 5 -----------------------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.can_read_chat_media(p_key text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); k text := public.chat_media_key_of(p_key);
begin
  if me is null or k is null then return false; end if;
  return exists (
    select 1
      from public.chat_media_index i
      left join public.messages m on m.id = i.message_id
     where i.key = k
       and public.is_chat_member(i.chat_id)
       and (i.message_id is null                                     -- a locked file registered but not yet attached: the chat's members may open it
            or (m.id is not null
                and not exists (select 1 from public.message_hides h where h.user_id = me and h.message_id = m.id)          -- "delete for me"
                and m.created_at >= coalesce(public.history_start(i.chat_id, me), '-infinity'::timestamptz)))               -- nothing from before the person joined
  );
end;
$$;
revoke execute on function public.can_read_chat_media(text) from public, anon;
grant execute on function public.can_read_chat_media(text) to authenticated;

-- 3 (the backfill) --------------------------------------------------------------------------------------------------------------------------------------
-- Every message that already points at a chat file, and every locked-attachment registration. Messages written by older app versions may hold the file as a
-- bare key, as /m/<key>, as /media/<key> or as a full address: all of them are turned into the key.
-- It runs only while the list is still EMPTY (the first run), so running this file again can never index anything new by accident. A message is left out when the file
-- is recorded in storage as uploaded by SOMEBODY ELSE than the message's sender (typing another person's file name into a message must not give access to it); files that
-- came over from the old storage have no recorded uploader and are kept. The owner's inventory query (docs/PRIVATE-CHAT-MEDIA.md) lists any message that was left out.
do $$
begin
  if not exists (select 1 from public.chat_media_index) then
    insert into public.chat_media_index (key, chat_id, message_id)
    select public.chat_media_key_of(m.media_url), m.chat_id, m.id
      from public.messages m
     where m.media_url is not null and public.chat_media_key_of(m.media_url) is not null
       and not exists (select 1 from storage.objects o
                        where o.bucket_id in ('media', 'chatmedia') and o.name = public.chat_media_key_of(m.media_url)
                          and o.owner_id is not null and m.sender_id is not null and o.owner_id <> m.sender_id::text)
    on conflict do nothing;

    insert into public.chat_media_index (key, chat_id, message_id)
    select s.key, s.chat_id, s.message_id from public.sealed_media s
    on conflict do nothing;
  end if;
end
$$;
