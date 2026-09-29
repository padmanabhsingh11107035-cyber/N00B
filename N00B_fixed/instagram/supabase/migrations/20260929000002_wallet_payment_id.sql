-- Every NOOB Points payment now gets a real, shared reference — both legs of a transfer (the sender's debit
-- and the receiver's credit) are tagged with the same transfer_id, so it can be looked up as ONE payment
-- (a "Payment ID") instead of two disconnected wallet lines, and support can pull up its full detail when
-- someone needs help with a specific one.
alter table public.noob_transactions add column if not exists transfer_id uuid;
create index if not exists noob_transactions_transfer_idx on public.noob_transactions (transfer_id) where transfer_id is not null;

-- apply_points gained an optional transfer_id — nothing else changed, so every existing caller (mini-game
-- wins, post/comment rewards, admin point adjustments, ...) is unaffected and simply never sets one.
drop function if exists public.apply_points(uuid, bigint, text);
create or replace function public.apply_points(p_user uuid, p_delta bigint, p_reason text, p_transfer_id uuid default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare before_pts bigint; after_pts bigint;
begin
  select noob_points into before_pts from public.profiles where id = p_user for update;
  if not found then return 0; end if;
  after_pts := greatest(0, before_pts + p_delta);
  if after_pts = before_pts then return 0; end if;
  update public.profiles set noob_points = after_pts where id = p_user;
  insert into public.noob_transactions (user_id, amount, reason, balance_after, transfer_id)
  values (p_user, after_pts - before_pts, p_reason, after_pts, p_transfer_id);
  return after_pts - before_pts;
end;
$$;
-- Purely internal (dropping the old signature lost its revoke along with it) — never callable directly.
revoke execute on function public.apply_points(uuid, bigint, text, uuid) from public;

-- wallet_transfer now stamps both sides of the payment with one shared id and hands it back, so the
-- client can show it right away on the success screen.
create or replace function public.wallet_transfer(p_recipient uuid, p_amount numeric, p_password text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  me uuid := public.acting_user(); amt bigint; rname text; sname text; note text; bal bigint; enc text;
  tid uuid := gen_random_uuid();
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
  perform public.apply_points(me, -amt, 'Sent to @' || rname || case when note <> '' then ': ' || note else '' end, tid);
  perform public.apply_points(p_recipient, amt, 'Received from @' || sname || case when note <> '' then ': ' || note else '' end, tid);
  perform public.notify_user(p_recipient, 'points_transfer', me,
    '@' || sname || ' sent you ' || public.fmt_points(amt) || ' NOOB Points' || case when note <> '' then ': "' || note || '"' else '.' end,
    '💰 NOOB Points Received');
  return jsonb_build_object('success', true, 'transferId', tid,
    'message', 'Sent ' || public.fmt_points(amt) || ' points to @' || rname || '.', 'user', public.get_my_user());
end;
$$;
-- Dropping+recreating (the signature is unchanged here, but keep this explicit and correct regardless).
revoke execute on function public.wallet_transfer(uuid, numeric, text, text) from public;
grant execute on function public.wallet_transfer(uuid, numeric, text, text) to authenticated;

-- My own NOOB Points payments (sent or received) — what the support chat's "Payment Issue" flow shows to
-- pick from. Never anyone else's.
create or replace function public.my_wallet_transfers(p_limit int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'transferId', t.transfer_id, 'direction', case when t.amount < 0 then 'sent' else 'received' end,
      'amount', abs(t.amount), 'createdAt', t.created_at,
      'otherParty', jsonb_build_object('id', p.id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar)
    ) order by t.created_at desc)
    from public.noob_transactions t
    left join public.noob_transactions other on other.transfer_id = t.transfer_id and other.user_id <> t.user_id
    left join public.profiles p on p.id = other.user_id
    where t.user_id = me and t.transfer_id is not null
    limit least(greatest(p_limit, 1), 100)
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.my_wallet_transfers(int) from public;
grant execute on function public.my_wallet_transfers(int) to authenticated;

-- Full detail of one payment — restricted to the two people actually part of it.
create or replace function public.wallet_transfer_detail(p_transfer_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); mine public.noob_transactions; other public.noob_transactions; other_profile public.profiles;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into mine from public.noob_transactions where transfer_id = p_transfer_id and user_id = me;
  if not found then raise exception 'That payment was not found.'; end if;
  select * into other from public.noob_transactions where transfer_id = p_transfer_id and user_id <> me;
  select * into other_profile from public.profiles where id = other.user_id;
  return jsonb_build_object(
    'transferId', p_transfer_id, 'direction', case when mine.amount < 0 then 'sent' else 'received' end,
    'amount', abs(mine.amount), 'createdAt', mine.created_at, 'reason', mine.reason,
    'otherParty', jsonb_build_object('id', other_profile.id, 'username', other_profile.username,
                                      'displayName', other_profile.display_name, 'avatar', other_profile.avatar)
  );
end;
$$;
revoke execute on function public.wallet_transfer_detail(uuid) from public;
grant execute on function public.wallet_transfer_detail(uuid) to authenticated;
