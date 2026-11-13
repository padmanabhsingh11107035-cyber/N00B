-- NOOB - READ-ONLY counts for private chat media (docs/PRIVATE-CHAT-MEDIA.md). Changes nothing. Run in the SQL editor; every part is a separate "select".
-- Parts A and B work BEFORE migration 20261114000001; part C needs it.

-- A. Chat files in storage: plain ones (these get gated) and locked ones (*.sealed, left public: they are ciphertext)
select bucket_id,
       count(*) filter (where name !~ '\.sealed$')                                           as plain_files,
       coalesce(sum((metadata->>'size')::bigint) filter (where name !~ '\.sealed$'), 0)      as plain_bytes,
       count(*) filter (where name ~ '\.sealed$')                                            as locked_files
  from storage.objects
 where bucket_id in ('media', 'chatmedia') and name like 'chat/%'
 group by bucket_id;

-- B. Messages that point at a chat file (any stored form: key, /m/, /media/, full address). Expect the index (part C) to hold about this many rows after the migration.
with refs as (
  select m.id, m.chat_id,
         substring(regexp_replace(regexp_replace(m.media_url, '[?#].*$', ''), '^https?://[^/]+/', '/') from '(chat/[A-Za-z0-9._~@+=-]{1,160})$') as key
    from public.messages m
   where m.media_url is not null
)
select count(*) filter (where key is not null)                 as messages_with_chat_file,
       count(distinct key)                                      as distinct_files,
       count(distinct chat_id) filter (where key is not null)   as chats_involved
  from refs;

-- C. After the migration: how many are indexed, and which messages were left out on purpose (their file was recorded as uploaded by somebody else than the sender).
select (select count(*) from public.chat_media_index)                       as index_rows,
       (select count(distinct key) from public.chat_media_index)            as indexed_files;

select m.id as message_id, m.chat_id, m.sender_id, m.media_url, o.owner_id as file_uploaded_by
  from public.messages m
  join storage.objects o on o.bucket_id in ('media', 'chatmedia') and o.name = public.chat_media_key_of(m.media_url)
 where public.chat_media_key_of(m.media_url) is not null
   and not exists (select 1 from public.chat_media_index i where i.message_id = m.id)
 order by m.created_at desc
 limit 50;

-- D. Files under chat/ that no message points at (kept as they are; the deletion queue handles them as before)
select count(*) as unreferenced_plain_files
  from storage.objects o
 where o.bucket_id = 'media' and o.name like 'chat/%' and o.name !~ '\.sealed$'
   and not exists (select 1 from public.chat_media_index i where i.key = o.name);
