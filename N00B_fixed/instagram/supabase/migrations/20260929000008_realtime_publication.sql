-- Realtime for Live Streaming / Live Lounge — these tables were never added to the realtime
-- publication, so every postgres_changes subscription built on them (new chat messages arriving,
-- the host learning someone is in the waiting room) was silently doing nothing. Broadcast-only
-- channels (hearts, the whiteboard) don't need this — only tables read via postgres_changes do.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.live_stream_comments,
      public.live_lounge_room_participants,
      public.live_lounge_room_chat;
  end if;
end
$$;
