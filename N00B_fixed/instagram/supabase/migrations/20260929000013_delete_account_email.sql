-- NOOB — account deletion now emails a "this just happened" receipt to whoever's address was on
-- the account, sent by the recover-account Edge Function's new "delete-account" action. This
-- function only needs to hand back the email/username/display name it already has BEFORE the row
-- is gone — the account is still fully deleted here exactly as before, password check included; the
-- Edge Function is what actually sends the email, using these returned fields.
create or replace function public.delete_my_account(p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me uuid := auth.uid(); enc text; prof public.profiles; priv public.profile_private;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select * into prof from public.profiles where id = me;
  select encrypted_password into enc from auth.users where id = me;
  if coalesce(p_password, '') = '' or enc is null or crypt(p_password, enc) <> enc then
    raise exception 'Incorrect password. Please re-enter your password to confirm deletion.' using errcode = '28P01';
  end if;
  if prof.is_admin or lower(prof.username) = 'noob' then
    raise exception 'The primary NOOB administrator account cannot be deleted this way.';
  end if;
  select * into priv from public.profile_private where user_id = me;
  delete from auth.users where id = me;   -- cascades to the profile and everything they made
  return jsonb_build_object(
    'success', true, 'message', 'Your account and all associated content have been permanently deleted.',
    'email', priv.email, 'username', prof.username, 'displayName', prof.display_name
  );
end;
$$;
