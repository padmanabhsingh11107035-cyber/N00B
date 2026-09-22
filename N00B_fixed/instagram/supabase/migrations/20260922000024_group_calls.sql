-- NOOB — Group video/voice calls.
-- The call itself is real, direct WebRTC between the people in it: audio and video never pass through
-- any NOOB server, not even briefly (the browser standard requires the media itself to be encrypted
-- point-to-point). What NOOB's server carries is only SIGNALING — "here is my connection offer for
-- this call" — a few hundred bytes per person, over a Realtime channel, discarded the moment it is
-- delivered. Nothing about a call (who joined, audio, video) is ever written to a table.
--
-- A call can only be started in a real group chat that is not currently "only admins can send" —
-- a group under that restriction disables calling for everyone, admins included, exactly like it
-- disables typing.

-- Only a genuine member of the chat may start or join its call, and only when the group currently
-- allows it. Called before the client ever opens a signaling channel.
create or replace function public.can_start_call(p_chat uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.chats c
    where c.id = p_chat and c.is_group and not c.is_global_default and not c.is_ai
      and not c.only_admins_can_send
      and public.is_chat_member(p_chat)
  );
$$;

revoke execute on function public.can_start_call(uuid) from public, anon;
grant execute on function public.can_start_call(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Realtime Authorization: only a real, current member of chat <id> may listen to or send on the
-- channel "call:<id>" — nobody else can, even though channel names are not secret the way a chat's
-- own id already isn't (the same "unguessable id, not a public listing" model already used for
-- Storage). This is the actual gate; the client-side call icon is only ever a convenience on top of it.
-- Guarded: the local PGlite test harness has no "realtime" schema at all (it is a Supabase-hosted
-- feature, not a plain-Postgres one), so this is skipped there rather than failing every test run —
-- it still runs for real on the live project, where that schema exists.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "call channel members can receive" on "realtime"."messages"';
    execute 'drop policy if exists "call channel members can send" on "realtime"."messages"';
    execute $policy$
      create policy "call channel members can receive" on "realtime"."messages"
        for select to authenticated
        using (
          realtime.topic() like 'call:%'
          and public.can_start_call(substring(realtime.topic() from 6)::uuid)
        )
    $policy$;
    execute $policy$
      create policy "call channel members can send" on "realtime"."messages"
        for insert to authenticated
        with check (
          realtime.topic() like 'call:%'
          and public.can_start_call(substring(realtime.topic() from 6)::uuid)
        )
    $policy$;
  end if;
end
$$;
