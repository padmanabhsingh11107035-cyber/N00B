-- NOOB - chat pictures, videos and voice notes: a PRIVATE bucket for them (phase B, optional; needs migration 20261114000001).
--
-- A new bucket  chatmedia  that is NOT public: its files have no public link at all. A file in it can be opened only through the website's Worker (which asks
-- can_read_chat_media first) or by a signed-in member of the chat that owns it. Nothing existing changes: the "media" bucket, its files, its links and its rules
-- stay exactly as they are. New chat uploads go to the new bucket only when the app is built with VITE_CHAT_PRIVATE_BUCKET=1 (default: off, so installing this file
-- alone changes nothing for anybody). Old files are COPIED (never moved) by scripts/migrate-chat-media.mjs, run by the owner; see docs/PRIVATE-CHAT-MEDIA.md.
--
-- Rules for the new bucket (storage.objects):
--   * add a file: signed-in people, only a name like  chat/<letters, digits . _ ~ @ + = ->  (one folder level, same shape the app uses), never overwrite (the app uploads
--     with x-upsert=false and there is no update policy), same size limit (50 MB) and types as "media";
--   * read a file: its uploader, and every member of a chat that has it (can_read_chat_media); nobody else, not even by listing;
--   * no update and no delete for people: removing a file is done by the existing deletion queue (media_trash -> purge_media), which uses the server key.
-- Run once, in the SQL editor. Safe to run twice.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chatmedia', 'chatmedia', false, 52428800, array['image/*', 'video/*', 'audio/*', 'application/octet-stream'])
on conflict (id) do update
  set public = false, file_size_limit = 52428800, allowed_mime_types = array['image/*', 'video/*', 'audio/*', 'application/octet-stream'];

drop policy if exists chatmedia_upload on storage.objects;
create policy chatmedia_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'chatmedia' and name ~ '^chat/[A-Za-z0-9._~@+=-]{1,160}$');

-- (the same guard as in "media": an opaque type is accepted only for a locked-attachment name)
drop policy if exists chatmedia_sealed_only on storage.objects;
create policy chatmedia_sealed_only on storage.objects as restrictive for insert to authenticated
  with check (
    bucket_id <> 'chatmedia'
    or lower(coalesce(metadata ->> 'mimetype', '')) <> 'application/octet-stream'
    or name ~ '^chat/[A-Za-z0-9._~@+=-]{1,160}\.sealed$'
  );

drop policy if exists chatmedia_select on storage.objects;
create policy chatmedia_select on storage.objects for select to authenticated
  using (bucket_id = 'chatmedia' and (owner_id = (select auth.uid())::text or public.can_read_chat_media(name)));
