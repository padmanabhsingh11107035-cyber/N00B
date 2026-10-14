-- ===== 20261014000012_verified_price_linked_accounts.sql =====
create or replace function public.verify_badge_price(p_method text) returns bigint
language sql immutable as $$
  select case p_method when 'points_permanent' then 500000000::bigint when 'points_monthly' then 50000000::bigint else null end;
$$;

create or replace function public.verify_account(
  p_password text, p_method text, p_coupon_code text default null, p_discount_code text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  me uuid := public.acting_user(); enc text; prof public.profiles; disc public.coupons; vcoupon public.coupons;
  price bigint; label text; bal bigint; after_bal bigint;
begin
  if coalesce(p_password, '') = '' then
    raise exception 'Password is required to authenticate verification request.';
  end if;
  select encrypted_password into enc from auth.users where id = me;
  if enc is null or crypt(p_password, enc) <> enc then
    raise exception 'Invalid password. Please check your credentials.' using errcode = '28P01';
  end if;
  select * into prof from public.profiles where id = me for update;
  if prof.is_verified then raise exception 'Your account is already verified.'; end if;

  disc := public.find_eligible_coupon(p_discount_code, me);

  if p_method = 'coupon' then
    select c.* into vcoupon from public.coupons c
    where c.active and c.type = 'verification' and upper(c.code) = upper(btrim(coalesce(p_coupon_code, '')))
      and c.target_user_id = me
    limit 1;
    if not found then raise exception 'Invalid or expired verification coupon code.'; end if;
    label := 'Verification coupon';
  elsif p_method in ('points_permanent', 'points_monthly') then
    price := public.verify_badge_price(p_method);
    label := case when p_method = 'points_permanent' then 'Permanent verification badge' else 'Monthly verification badge' end;
    if disc.id is not null then
      price := greatest(0, round(price * (1 - disc.discount_percent / 100))::bigint);
    end if;
    bal := prof.noob_points;
    if bal < price then
      raise exception 'Insufficient NOOB Points. You have %, but % points are required for % verification.',
        public.fmt_points(bal), public.fmt_points(price),
        case when p_method = 'points_permanent' then 'permanent' else 'monthly' end;
    end if;
    perform public.apply_points(me, -price,
      case when disc.id is not null then format('%s (%s%% off: %s)', label, round(disc.discount_percent), disc.code) else label end);
    perform public.consume_coupon(disc.id, me);
  else
    raise exception 'Invalid verification method specified.';
  end if;

  if vcoupon.id is not null then update public.coupons set active = false where id = vcoupon.id; end if;
  update public.profiles set is_verified = true, verification_tier = 'premium' where id = me;
  select noob_points into after_bal from public.profiles where id = me;
  perform public.queue_email(me, 'verified_badge', jsonb_build_object(
    'label', label, 'method', p_method, 'permanent', p_method in ('coupon', 'points_permanent'),
    'pricePaid', case when price is null then null else public.fmt_points(price) end,
    'couponCode', coalesce(disc.code, null), 'discountPercent', disc.discount_percent,
    'walletAfter', public.fmt_points(after_bal), 'at', now()));
  return jsonb_build_object('success', true,
    'message', 'Congratulations! Your account @' || prof.username || ' is now officially verified with the blue checkmark!',
    'user', public.get_my_user());
end;
$$;

create or replace function public.verify_badge_prices() returns jsonb
language sql stable as $$
  select jsonb_build_object('permanent', public.verify_badge_price('points_permanent'), 'monthly', public.verify_badge_price('points_monthly'));
$$;

create or replace function public.link_email_key(p text) returns text
language sql immutable as $$
  select case
    when position('@' in coalesce(p, '')) = 0 then ''
    when lower(split_part(btrim(p), '@', 2)) in ('gmail.com', 'googlemail.com')
      then replace(split_part(lower(split_part(btrim(p), '@', 1)), '+', 1), '.', '') || '@gmail.com'
    else split_part(lower(split_part(btrim(p), '@', 1)), '+', 1) || '@' || lower(split_part(btrim(p), '@', 2))
  end;
$$;

create or replace function public.my_linked_accounts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.acting_user(); em text; ph text;
begin
  select public.link_email_key(pp.email),
         case when length(regexp_replace(coalesce(pp.mobile_number, ''), '\D', '', 'g')) >= 7
              then right(regexp_replace(coalesce(pp.mobile_number, ''), '\D', '', 'g'), 10) else '' end
    into em, ph
  from public.profile_private pp where pp.user_id = me;
  if coalesce(em, '') = '' and coalesce(ph, '') = '' then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar, 'isVerified', p.is_verified) order by p.username)
    from public.profiles p join public.profile_private pp on pp.user_id = p.id
    where p.id <> me and not p.is_suspended and not p.is_ai
      and ((em <> '' and public.link_email_key(pp.email) = em)
        or (ph <> '' and length(regexp_replace(coalesce(pp.mobile_number, ''), '\D', '', 'g')) >= 7
            and right(regexp_replace(coalesce(pp.mobile_number, ''), '\D', '', 'g'), 10) = ph))
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.link_email_key(text) from public, anon;
grant execute on function public.link_email_key(text) to authenticated;
revoke all on function public.verify_badge_price(text) from public, anon;
grant execute on function public.verify_badge_price(text) to authenticated;
revoke all on function public.verify_badge_prices() from public, anon;
grant execute on function public.verify_badge_prices() to authenticated;
revoke all on function public.my_linked_accounts() from public, anon;
grant execute on function public.my_linked_accounts() to authenticated;

-- ===== 20261014000013_delete_message_for_me.sql =====
create table if not exists public.message_hides (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  chat_id    uuid not null references public.chats (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
create index if not exists message_hides_user_chat_idx on public.message_hides (user_id, chat_id, created_at);
alter table public.message_hides enable row level security;
drop policy if exists message_hides_select_own on public.message_hides;
create policy message_hides_select_own on public.message_hides for select to authenticated using (user_id = auth.uid());
revoke all on public.message_hides from anon, authenticated;
grant select on public.message_hides to authenticated;   -- only your own rows (the policy); writing goes through hide_message_for_me

do $$ begin
  alter publication supabase_realtime add table public.message_hides;   -- so a second device of yours drops the message too
exception when others then null;
end $$;

create or replace function public.hide_message_for_me(p_message uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); chat uuid;
begin
  select m.chat_id into chat from public.messages m where m.id = p_message;
  if chat is null then raise exception 'Message not found'; end if;
  if not public.is_chat_member(chat) then raise exception 'You are not a participant in this chat.' using errcode = '42501'; end if;
  insert into public.message_hides (user_id, message_id, chat_id) values (me, p_message, chat) on conflict do nothing;
  return jsonb_build_object('success', true);
end;
$$;
revoke all on function public.hide_message_for_me(uuid) from public, anon;
grant execute on function public.hide_message_for_me(uuid) to authenticated;

drop function if exists public.chat_messages(uuid, integer, timestamptz);
create function public.chat_messages(p_chat uuid, p_limit integer default 300, p_after timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.chats where id = p_chat) then raise exception 'Chat not found'; end if;
  if not public.is_chat_member(p_chat) then raise exception 'You are not a participant in this chat.' using errcode = '42501'; end if;
  insert into public.chat_members (chat_id, user_id, last_read_at) values (p_chat, me, now())
  on conflict (chat_id, user_id) do update set last_read_at = now();

  if p_after is not null then
    return jsonb_build_object(
      'messages', coalesce((
        select jsonb_agg(public.message_json(t) order by t.created_at)
        from (select m.* from public.messages m
              where m.chat_id = p_chat and m.updated_at > p_after
                and not exists (select 1 from public.message_hides h where h.user_id = me and h.message_id = m.id)
              order by m.updated_at limit 500) t), '[]'::jsonb),
      'hiddenIds', coalesce((select jsonb_agg(h.message_id) from public.message_hides h where h.user_id = me and h.chat_id = p_chat and h.created_at > p_after - interval '1 minute'), '[]'::jsonb));
  end if;
  return jsonb_build_object('messages', coalesce((
    select jsonb_agg(public.message_json(t) order by t.created_at)
    from (select m.* from public.messages m
          where m.chat_id = p_chat
            and not exists (select 1 from public.message_hides h where h.user_id = me and h.message_id = m.id)
          order by m.created_at desc limit least(greatest(p_limit, 1), 500)) t), '[]'::jsonb));
end;
$$;
grant execute on function public.chat_messages(uuid, integer, timestamptz) to authenticated;

create or replace function public.chat_json(c public.chats) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'avatar', c.avatar, 'description', c.description,
    'participants', coalesce(public.chat_participants_json(c.id), '[]'::jsonb),
    'isGroup', c.is_group, 'creatorId', c.creator_id,
    'adminIds', (
      select coalesce(jsonb_agg(distinct t.x), '[]'::jsonb) from (
        select m2.user_id as x from public.chat_members m2 where m2.chat_id = c.id and m2.is_admin
        union select c.creator_id where c.creator_id is not null
        union select p2.id from public.profiles p2 where c.is_group and p2.is_admin and lower(p2.username) = 'noob'
      ) t),
    'onlyAdminsCanSend', c.only_admins_can_send,
    'isGlobalDefault', c.is_global_default, 'isAi', c.is_ai, 'isEnded', c.is_ended, 'endedAt', c.ended_at, 'review', c.review,
    'isEncryptable', not c.is_global_default and not c.is_ai and public.chat_is_encryptable(c.id),
    'unreadCount', (
      select count(*) from public.messages um
      where um.chat_id = c.id and um.sender_id is distinct from auth.uid()
        and um.created_at > coalesce(me.last_read_at, 'epoch'::timestamptz)
        and not exists (select 1 from public.message_hides h where h.user_id = auth.uid() and h.message_id = um.id)),
    'isPinned', c.is_global_default or coalesce(me.is_pinned, false), 'isMuted', coalesce(me.is_muted, false),
    'themeColor', c.theme_color, 'vanishMode', c.vanish_mode, 'customNickname', me.nickname,
    'readReceiptsEnabled', c.read_receipts_enabled, 'createdAt', c.created_at,
    'lastMessage', (select public.message_json(lm) from public.messages lm
                    where lm.chat_id = c.id
                      and not exists (select 1 from public.message_hides h where h.user_id = auth.uid() and h.message_id = lm.id)
                    order by lm.created_at desc limit 1))
  from (select 1) v left join public.chat_members me on me.chat_id = c.id and me.user_id = auth.uid();
$$;

-- ===== 20261014000014_noob_draw_ready_notifications.sql =====
create table if not exists public.noob_draw_ready_sent (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  pack     text not null,
  ready_at timestamptz not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, pack, ready_at)
);
alter table public.noob_draw_ready_sent enable row level security;      -- no policy: only the job below uses it

create or replace function public.run_noob_draw_ready_notifications() returns integer
language plpgsql security definer set search_path = public as $$
declare per text; n integer := 0; r record; admin_id uuid := public.noob_admin_id();
begin
  per := coalesce((select value from public.noob_draw_config where key = 'free_period'), 'month');
  for r in
    with last_free as (
      select s.user_id, s.pack, max(s.created_at) as last_at
      from public.noob_draw_spins s join public.noob_draw_packs pk on pk.id = s.pack
      where not s.paid group by s.user_id, s.pack
    ), due as (
      select lf.user_id, lf.pack,
             case when per = 'week' then lf.last_at + interval '7 days'
                  else (date_trunc('month', lf.last_at at time zone 'Asia/Kolkata') + interval '1 month') at time zone 'Asia/Kolkata' end as ready_at
      from last_free lf
    )
    select d.user_id, array_agg(d.pack order by d.pack) as packs, array_agg(d.ready_at order by d.pack) as readys
    from due d join public.profiles p on p.id = d.user_id
    where d.ready_at <= now()
      and d.ready_at > now() - interval '2 days'          -- a reset that just happened; never wake up old ones
      and not p.is_suspended and not p.is_ai
      and not exists (select 1 from public.noob_draw_ready_sent x where x.user_id = d.user_id and x.pack = d.pack and x.ready_at = d.ready_at)
    group by d.user_id
  loop
    insert into public.noob_draw_ready_sent (user_id, pack, ready_at)
    select r.user_id, k.pack, k.rd from unnest(r.packs, r.readys) as k(pack, rd) on conflict do nothing;
    perform public.notify_user(r.user_id, 'noob_draw_ready', admin_id,
      case when cardinality(r.packs) > 1
           then format('Your %s free NOOB Draw spins are back. Open NOOB Draw and spin to win Pro, the verified tick and millions of points.', cardinality(r.packs))
           else 'Your free NOOB Draw spin is back. Open NOOB Draw and spin to win Pro, the verified tick and millions of points.' end,
      '🎁 NOOB Draw is ready');
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.run_noob_draw_ready_notifications() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('noob-draw-ready', '*/10 * * * *', $job$ select public.run_noob_draw_ready_notifications(); $job$);
  end if;
exception when others then
  raise notice 'The NOOB Draw reminder job was not scheduled: %', sqlerrm;
end
$$;
