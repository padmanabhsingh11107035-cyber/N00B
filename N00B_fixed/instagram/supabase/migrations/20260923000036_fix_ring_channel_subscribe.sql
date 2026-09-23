-- NOOB — fixes ring:<calleeUserId> so the CALLER can actually deliver a ring, not just the callee
-- receive one. Found by testing both sides live: a private Realtime channel's broadcast has to go
-- through a subscribed WebSocket connection to actually be delivered — an unsubscribed send()
-- returns "ok" but silently reaches nobody on a private channel, confirmed by sending a real,
-- fully-authorized ring to an actively-listening test account and it never arriving.
--
-- The previous receive policy allowed only the addressed person to subscribe at all (substring(topic
-- from 6)::uuid = auth.uid()) — correct for READING, but that also blocks the CALLER from
-- subscribing long enough to send, since they are a different person. Splitting "who can subscribe"
-- from "who can actually deliver a real ring" fixes this:
--   - subscribe (select) is now open to any authenticated user — a ring:<id> topic name is not a
--     secret the way its CONTENTS need to be (this app already shows a profile's own user id
--     publicly, same "unguessable id, not a public listing" model as call:<chatId> already uses);
--   - send (insert) is UNCHANGED and still the real gate: only a genuine, call-eligible member of the
--     chat named in the payload, ringing a genuine fellow member of that same chat, as before.
drop policy if exists "ring channel members can receive" on "realtime"."messages";
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute $policy$
      create policy "ring channel members can receive" on "realtime"."messages"
        for select to authenticated
        using (realtime.topic() like 'ring:%')
    $policy$;
  end if;
end
$$;
