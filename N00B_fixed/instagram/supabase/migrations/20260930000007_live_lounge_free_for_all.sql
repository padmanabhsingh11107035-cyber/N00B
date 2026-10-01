-- NOOB — Live Lounge is now free for everyone. has_live_lounge_access() is the single gate used
-- everywhere (starting/joining a room, hosting a live stream, the profile's hasLiveLounge flag),
-- so changing just this one function turns off the paywall across the whole app at once — the
-- purchase/coupon/payment-request system underneath is left completely intact (not deleted),
-- it's just no longer consulted, so this is trivially reversible later.

create or replace function public.has_live_lounge_access(p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null;
$$;
