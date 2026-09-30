-- NOOB — Live Lounge chat: the read policy compared live_lounge_room_participants.room_id to
-- itself (the unqualified `room_id` on the right resolved to the subquery's own p.room_id, not
-- the chat row's room_id) — a tautology that made Realtime's per-client filter wrong, so a
-- participant's live chat messages weren't reliably delivered to everyone in the room. Fixed by
-- qualifying it explicitly. Safe to run even if 20260929000008 already put these tables on the
-- realtime publication.

drop policy if exists live_lounge_room_chat_read on public.live_lounge_room_chat;
create policy live_lounge_room_chat_read on public.live_lounge_room_chat for select using (
  exists (select 1 from public.live_lounge_room_participants p where p.room_id = live_lounge_room_chat.room_id and p.user_id = auth.uid() and p.status = 'admitted')
  or room_id in (select id from public.live_lounge_rooms where host_id = auth.uid())
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_lounge_room_chat') then
      alter publication supabase_realtime add table public.live_lounge_room_chat;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_lounge_room_participants') then
      alter publication supabase_realtime add table public.live_lounge_room_participants;
    end if;
  end if;
end
$$;
