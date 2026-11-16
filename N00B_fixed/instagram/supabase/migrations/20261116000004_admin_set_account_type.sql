-- The main NOOB administrator can change the type of ANY account (public / private / business) from the Admin Control Panel.
-- The person is NOT told: no notification, no e-mail, no push. The change is written to the admin activity log (only administrators read that).
-- It does exactly what the person's own switch does (profiles.account_type and profiles.is_business); nothing else about the account changes.
-- Safe to run more than once.

create or replace function public.admin_set_account_type(p_target uuid, p_type text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.profiles; before_type text;
begin
  perform public.require_master_admin('Only the main NOOB administrator can change an account type.');
  if p_type is null or p_type not in ('public', 'private', 'business') then raise exception 'The type must be public, private or business.'; end if;
  select * into t from public.profiles where id = p_target for update;
  if not found then raise exception 'Account not found.'; end if;
  if t.id = public.noob_admin_id() then raise exception 'The official NOOB account keeps its type.'; end if;
  before_type := t.account_type;
  if before_type = p_type then raise exception '@% is already a % account.', t.username, p_type; end if;

  update public.profiles set account_type = p_type, is_business = (p_type = 'business') where id = t.id;
  perform public.log_admin_action('account_type_changed', t.id, jsonb_build_object('username', t.username, 'from', before_type, 'to', p_type));
  return jsonb_build_object('success', true, 'accountType', p_type, 'message', '@' || t.username || ' is a ' || p_type || ' account now. They have not been told.');
end;
$$;
revoke execute on function public.admin_set_account_type(uuid, text) from public, anon;
grant execute on function public.admin_set_account_type(uuid, text) to authenticated;
