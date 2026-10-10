-- The admin panel can now see, for every account, whether notifications are switched on: whether the person has allowed
-- notifications on their phone / browser (a saved push registration exists), when that was last confirmed, and roughly which kind
-- of device it is (taken from the address of the browser's own notification service, so the registration itself is never sent).
--
-- Adds three fields to what the admin panel's account list already receives (pushEnabled, pushUpdatedAt, pushKind). Replaces one
-- function. No rows are changed.

create or replace function public.admin_user_view(p public.profiles) returns jsonb
language sql stable security definer set search_path = public as $$
  select (case when public.has_permission('view_accounts') then public.admin_user_json(p)
               else public.user_public_json(p) || jsonb_build_object('isSuspended', p.is_suspended,
                      'suspendedReason', (select pp.suspended_reason from public.profile_private pp where pp.user_id = p.id)) end)
         || jsonb_build_object('isStaff', public.is_staff(p.id))
         || coalesce((
              select jsonb_build_object(
                'pushEnabled', true,
                'pushUpdatedAt', s.updated_at,
                'pushKind', case
                  when s.subscription->>'endpoint' like '%web.push.apple.com%' then 'apple'
                  when s.subscription->>'endpoint' like '%fcm.googleapis.com%' or s.subscription->>'endpoint' like '%android.googleapis.com%' then 'chrome'
                  when s.subscription->>'endpoint' like '%mozilla.com%' then 'firefox'
                  when s.subscription->>'endpoint' like '%notify.windows.com%' then 'edge'
                  else 'other' end)
              from public.push_subscriptions s where s.user_id = p.id
            ), jsonb_build_object('pushEnabled', false));
$$;
