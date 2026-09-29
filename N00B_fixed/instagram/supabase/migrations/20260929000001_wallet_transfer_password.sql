-- Sending NOOB Points now needs the sender's own password to confirm, UPI-style — nothing about who can
-- be paid, how much, or the ledger itself changes; this only adds one more thing you must prove before
-- money actually moves.
drop function if exists public.wallet_transfer(uuid, numeric, text);
create or replace function public.wallet_transfer(p_recipient uuid, p_amount numeric, p_password text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  me uuid := public.acting_user(); amt bigint; rname text; sname text; note text; bal bigint; enc text;
begin
  if p_recipient is null then raise exception 'Choose someone to send points to.'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 9000000000000000000 then
    raise exception 'Enter a valid whole number of points to send.';
  end if;
  amt := floor(p_amount)::bigint;
  if p_recipient = me then raise exception 'You cannot send points to yourself.'; end if;
  if not exists (select 1 from public.profiles where id = p_recipient) then raise exception 'Recipient account not found.'; end if;

  select encrypted_password into enc from auth.users where id = me;
  if coalesce(p_password, '') = '' or enc is null or crypt(p_password, enc) <> enc then
    raise exception 'Incorrect password. Please re-enter your password to confirm this payment.' using errcode = '28P01';
  end if;

  perform 1 from public.profiles where id in (me, p_recipient) order by id for update;
  select noob_points, username into bal, sname from public.profiles where id = me;
  if bal < amt then raise exception 'Insufficient NOOB Points. You have % points.', public.fmt_points(bal); end if;
  select username into rname from public.profiles where id = p_recipient;

  note := left(btrim(coalesce(p_note, '')), 140);
  perform public.apply_points(me, -amt, 'Sent to @' || rname || case when note <> '' then ': ' || note else '' end);
  perform public.apply_points(p_recipient, amt, 'Received from @' || sname || case when note <> '' then ': ' || note else '' end);
  perform public.notify_user(p_recipient, 'points_transfer', me,
    '@' || sname || ' sent you ' || public.fmt_points(amt) || ' NOOB Points' || case when note <> '' then ': "' || note || '"' else '.' end,
    '💰 NOOB Points Received');
  return jsonb_build_object('success', true,
    'message', 'Sent ' || public.fmt_points(amt) || ' points to @' || rname || '.', 'user', public.get_my_user());
end;
$$;
-- Dropping the old signature above lost its grant along with it — put it back, same as before.
revoke execute on function public.wallet_transfer(uuid, numeric, text, text) from public;
grant execute on function public.wallet_transfer(uuid, numeric, text, text) to authenticated;
