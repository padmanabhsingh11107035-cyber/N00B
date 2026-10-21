-- Login approval by email: switching it ON sends no email. The switch just turns on (the question "Is this you?" is only ever emailed when someone logs in with the right password).
-- (The first version of this feature confirmed the switch with an email; that "enable" kind of question is simply not used any more. Nothing is removed from the database.)
-- The only check: there must be an email address on the account, otherwise there is nowhere to send the question. Additive and safe to run more than once.

create or replace function public.login_approval_turn_on() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if coalesce((select pp.email from public.profile_private pp where pp.user_id = me), '') = '' then
    return jsonb_build_object('success', false, 'error', 'Add an email address to your account first (Edit profile), so there is somewhere to send the question.');
  end if;
  insert into public.login_approval_settings (user_id, enabled, enabled_at, updated_at) values (me, true, now(), now())
  on conflict (user_id) do update set enabled = true, enabled_at = now(), updated_at = now();
  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.login_approval_turn_on() from public, anon;
grant execute on function public.login_approval_turn_on() to authenticated, service_role;
