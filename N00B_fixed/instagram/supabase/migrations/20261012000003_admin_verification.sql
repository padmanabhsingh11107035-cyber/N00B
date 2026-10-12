-- The NOOB administrator can verify any account (the verified badge: a white badge with a black tick in dark mode, a black badge with a white
-- tick in light mode) or take it away again, from the Admin Control Panel. The person gets a notification straight away and an e-mail
-- (queued like the receipts, see 20261011000003). Every grant / removal is written to the admin activity log.

create or replace function public.admin_set_verification(p_target uuid, p_verified boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.profiles; admin_id uuid;
begin
  perform public.require_master_admin('Only the main NOOB administrator can verify accounts.');
  select * into t from public.profiles where id = p_target for update;
  if not found then raise exception 'Account not found.'; end if;
  admin_id := public.noob_admin_id();

  if coalesce(p_verified, true) then
    if t.is_verified then raise exception '@% is already verified.', t.username; end if;
    update public.profiles set is_verified = true, verification_tier = 'premium' where id = t.id;
    perform public.notify_user(t.id, 'admin_direct', admin_id,
      'The NOOB team has verified your account. The verified badge now shows next to your name everywhere in NOOB.', '✅ You are verified!');
    perform public.queue_email(t.id, 'verified_by_admin', jsonb_build_object('username', t.username, 'at', now()));
    perform public.log_admin_action('verification_granted', t.id, jsonb_build_object('username', t.username));
    return jsonb_build_object('success', true, 'verified', true, 'message', '@' || t.username || ' is verified now. They have been told by notification and e-mail.');
  end if;

  if not t.is_verified then raise exception '@% is not verified.', t.username; end if;
  update public.profiles set is_verified = false, verification_tier = null where id = t.id;
  perform public.notify_user(t.id, 'admin_direct', admin_id, 'The NOOB team has removed the verified badge from your account.', 'Verification removed');
  perform public.log_admin_action('verification_removed', t.id, jsonb_build_object('username', t.username));
  return jsonb_build_object('success', true, 'verified', false, 'message', 'The verified badge was removed from @' || t.username || '.');
end;
$$;
revoke execute on function public.admin_set_verification(uuid, boolean) from public, anon;
grant execute on function public.admin_set_verification(uuid, boolean) to authenticated;
