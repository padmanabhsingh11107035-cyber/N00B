-- Chat alerts on the phone are only for a person who is AWAY from NOOB.
-- While NOOB is open in front of someone (the screen on, the app on top), the chat list and the red number on the Chat icon already tell them: no banner, no sound.
--   * The open app tells the database every 15 seconds that it is in front (touch_in_front(true)), and the moment it is left (touch_in_front(false)). The mark is only good for
--     25 seconds, so a phone that is switched off or a closed tab can never keep alerts away for long.
--   * push_claim leaves out of a CHAT alert every person whose app is in front. Every other kind of notification (likes, follows, NOOB Draw ...) is not affected.
-- Safe to run more than once.

alter table public.profile_private add column if not exists in_front_until timestamptz;

create or replace function public.touch_in_front(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return; end if;
  insert into public.profile_private (user_id, in_front_until)
    values (me, case when coalesce(p_on, false) then now() + interval '25 seconds' else null end)
  on conflict (user_id) do update set in_front_until = excluded.in_front_until;
end;
$$;
revoke execute on function public.touch_in_front(boolean) from public, anon;
grant execute on function public.touch_in_front(boolean) to authenticated;

create or replace function public.push_claim(p_secret text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare expected text; n public.notifications; who text; subs jsonb;
begin
  select value into expected from public.internal_config where key = 'push_secret';
  if expected is null or p_secret is distinct from expected then raise exception 'Unauthorized'; end if;
  update public.notifications set push_sent_at = now() where id = p_id and push_sent_at is null returning * into n;
  if not found then return jsonb_build_object('claimed', false); end if;
  select username into who from public.profiles where id = n.actor_id;
  select coalesce(jsonb_agg(jsonb_build_object('userId', s.user_id, 'subscription', s.subscription)), '[]'::jsonb) into subs
  from public.push_subscriptions s join public.profiles pr on pr.id = s.user_id
  where not pr.is_suspended
    and (n.target_user_id is null or s.user_id = n.target_user_id)
    and s.user_id is distinct from n.actor_id
    and not public.in_quiet_hours(s.user_id, now())
    and not (n.type <> 'call_ring' and n.chat_id is not null and exists (
      select 1 from public.chat_members m where m.chat_id = n.chat_id and m.user_id = s.user_id and m.is_muted))
    and not (n.type = 'new_message' and exists (
      select 1 from public.profile_private pp where pp.user_id = s.user_id and pp.in_front_until is not null and pp.in_front_until > now()));
  if n.type = 'new_message' then delete from public.notifications where id = p_id; end if;   -- a chat alert lives on the phone only
  return jsonb_build_object(
    'claimed', true,
    'type', n.type,
    'chatId', n.chat_id,
    'title', left(coalesce(nullif(btrim(n.title), ''), case when who is not null then '@' || who else 'NOOB' end), 100),
    'body', left(coalesce(nullif(btrim(n.message), ''), 'You have a new notification.'), 160),
    'data', n.data,
    'publicKey', (select value from public.internal_config where key = 'vapid_public_key'),
    'recipients', subs);
end;
$$;
revoke execute on function public.push_claim(text, uuid) from public, anon, authenticated;
grant execute on function public.push_claim(text, uuid) to service_role;
