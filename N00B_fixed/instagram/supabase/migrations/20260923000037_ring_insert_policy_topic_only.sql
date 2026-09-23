-- NOOB — the ring:<calleeUserId> INSERT policy conditioned on the broadcast's own payload
-- (payload->>'chatId') never actually let a message through, even for a fully legitimate, real
-- chat member ringing a real fellow member — confirmed by testing the proven call:<chatId> pattern
-- side by side: identical can_start_call() check, but topic-only (no payload reference), and THAT
-- one delivers correctly every time. Whatever the reason, payload-conditioned broadcast
-- authorization isn't reliable here, so this drops it in favor of a topic-only check that mirrors
-- call:%'s own proven shape: "does the sender (auth.uid()) share a real chat with the person named
-- in the topic" — no payload access needed, and the Global Lounge / AI chat are excluded so this
-- can't be satisfied by the fact that literally everyone is a Lounge member.
drop policy if exists "ring channel members can send" on "realtime"."messages";
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute $policy$
      create policy "ring channel members can send" on "realtime"."messages"
        for insert to authenticated
        with check (
          realtime.topic() like 'ring:%'
          and exists (
            select 1
            from public.chat_members cm1
            join public.chat_members cm2 on cm2.chat_id = cm1.chat_id
            join public.chats c on c.id = cm1.chat_id
            where cm1.user_id = auth.uid()
              and cm2.user_id = substring(realtime.topic() from 6)::uuid
              and not c.is_global_default
              and not c.is_ai
              and not c.only_admins_can_send
          )
        )
    $policy$;
  end if;
end
$$;
