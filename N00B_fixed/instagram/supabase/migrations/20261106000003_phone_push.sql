-- Phone notifications for the Android app (Firebase Cloud Messaging).
-- The Android app saves a phone address (token) with register_push_token (already there, kept in profile_private.push_tokens). Until now nothing sent to it: only browser
-- notifications (push_subscriptions) were delivered. push_claim now ALSO returns the phone addresses of the people who are to get the notification, using exactly the same
-- rules as before (the person it is for, never the one who caused it, no suspended accounts, quiet hours, muted chats, and no chat alert while the app is in front).
-- A second function lets the server forget phone addresses that Google says no longer exist.
-- Safe to run more than once. Nothing existing is removed.

create or replace function public.push_claim(p_secret text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare expected text; n public.notifications; who text; subs jsonb; phones jsonb;
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
  -- the phones: same people, same rules (only when the notification is for one person: a notification for everybody is not sent to phones)
  select coalesce(jsonb_agg(jsonb_build_object('userId', pp.user_id, 'token', t.token)), '[]'::jsonb) into phones
  from public.profile_private pp
  join public.profiles pr on pr.id = pp.user_id
  cross join lateral unnest(pp.push_tokens) as t(token)
  where n.target_user_id is not null
    and pp.user_id = n.target_user_id
    and not pr.is_suspended
    and pp.user_id is distinct from n.actor_id
    and not public.in_quiet_hours(pp.user_id, now())
    and not (n.type <> 'call_ring' and n.chat_id is not null and exists (
      select 1 from public.chat_members m where m.chat_id = n.chat_id and m.user_id = pp.user_id and m.is_muted))
    and not (n.type = 'new_message' and pp.in_front_until is not null and pp.in_front_until > now());
  if n.type = 'new_message' then delete from public.notifications where id = p_id; end if;   -- a chat alert lives on the phone only
  return jsonb_build_object(
    'claimed', true,
    'type', n.type,
    'chatId', n.chat_id,
    'title', left(coalesce(nullif(btrim(n.title), ''), case when who is not null then '@' || who else 'NOOB' end), 100),
    'body', left(coalesce(nullif(btrim(n.message), ''), 'You have a new notification.'), 160),
    'data', n.data,
    'publicKey', (select value from public.internal_config where key = 'vapid_public_key'),
    'recipients', subs,
    'phones', phones);
end;
$$;
revoke execute on function public.push_claim(text, uuid) from public, anon, authenticated;
grant execute on function public.push_claim(text, uuid) to service_role;

-- Forget phone addresses that no longer exist (the app was removed from that phone).
create or replace function public.push_forget_phones(p_secret text, p_dead jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare expected text; d jsonb;
begin
  select value into expected from public.internal_config where key = 'push_secret';
  if expected is null or p_secret is distinct from expected then raise exception 'Unauthorized'; end if;
  for d in select * from jsonb_array_elements(coalesce(p_dead, '[]'::jsonb)) loop
    update public.profile_private
       set push_tokens = array_remove(push_tokens, d->>'token')
     where user_id = (d->>'userId')::uuid;
  end loop;
end;
$$;
revoke execute on function public.push_forget_phones(text, jsonb) from public, anon, authenticated;
grant execute on function public.push_forget_phones(text, jsonb) to service_role;
