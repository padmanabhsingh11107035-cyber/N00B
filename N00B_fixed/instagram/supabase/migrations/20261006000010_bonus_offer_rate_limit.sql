-- The post-bonus offer was re-rolling (and re-showing) on every single app load/refresh instead of
-- being a rare, exciting thing. Now it's offered at most once every 2 days per account: if this
-- account's last offer was created within the last 2 days, no new one is issued (and the banner
-- simply doesn't show) regardless of whether that offer was accepted, rejected, or just never acted
-- on — the 2-day cooldown is from when it was LAST SHOWN, not from when it was claimed.
create or replace function public.request_post_bonus_offer() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); existing public.post_bonus_offers; amt bigint;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into existing from public.post_bonus_offers where user_id = me;
  if found and existing.created_at > now() - interval '2 days' then
    return jsonb_build_object('available', false);
  end if;
  amt := 5000000 + floor(random() * 25000001)::bigint;
  insert into public.post_bonus_offers (user_id, amount, created_at, expires_at, claimed_at)
    values (me, amt, now(), now() + interval '30 minutes', null)
  on conflict (user_id) do update
    set amount = excluded.amount, created_at = now(), expires_at = now() + interval '30 minutes', claimed_at = null;
  return jsonb_build_object('available', true, 'amount', amt);
end;
$$;
