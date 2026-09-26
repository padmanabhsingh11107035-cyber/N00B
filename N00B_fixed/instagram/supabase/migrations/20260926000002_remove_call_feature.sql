-- The call feature (voice/video calls, ring notifications, call log) is being removed from the app
-- entirely. This undoes 20260926000001_call_log_and_ring_push.sql — safe to run whether or not that
-- one ever was (every drop below is a plain "if exists"). The underlying group-call plumbing from
-- 20260922000024_group_calls.sql / 20260923000035..37 (can_start_call, the call:/ring: Realtime
-- policies) is deliberately left in place: it's already fully gated by chat-membership checks, so
-- leaving it unreachable (nothing in the app calls it anymore) is harmless, and dropping Realtime
-- Authorization policies is comparatively riskier for zero real benefit.

drop function if exists public.log_call_event(uuid, text, int);
drop function if exists public.notify_incoming_ring(uuid, uuid);
drop function if exists public.decline_ring_token(text);

-- Back to the pre-call-ring version (20260919000008_staff_permissions_group_policy_push.sql) — plain
-- {title, body} for the edge function, no type/data passthrough, and every notification (call-related
-- or not) respects a muted chat again.
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
    and not (n.chat_id is not null and exists (
      select 1 from public.chat_members m where m.chat_id = n.chat_id and m.user_id = s.user_id and m.is_muted));
  return jsonb_build_object(
    'claimed', true,
    'title', left(coalesce(nullif(btrim(n.title), ''), case when who is not null then '@' || who else 'NOOB' end), 100),
    'body', left(coalesce(nullif(btrim(n.message), ''), 'You have a new notification.'), 160),
    'publicKey', (select value from public.internal_config where key = 'vapid_public_key'),
    'recipients', subs);
end;
$$;
revoke all on function public.push_claim(text, uuid) from public, anon, authenticated;
grant execute on function public.push_claim(text, uuid) to service_role;
