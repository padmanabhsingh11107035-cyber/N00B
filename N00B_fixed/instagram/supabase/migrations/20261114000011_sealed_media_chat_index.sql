-- Growth preparation (docs/GROWTH-PREPARATION.md, measure 9): the only foreign key without an index.
-- Deleting a chat (cascade) and "which sealed files belong to this chat" no longer scan the whole table. Nothing is changed or deleted; safe to run twice.
create index if not exists sealed_media_chat_idx on public.sealed_media (chat_id);
