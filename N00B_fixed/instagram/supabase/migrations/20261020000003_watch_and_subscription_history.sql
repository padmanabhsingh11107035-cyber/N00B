-- 1. WATCH HISTORY (the Feed / Videos page). It was always empty: the list read a table that a person is not allowed to read directly (the list function ran with the
--    person's own rights), so every history came back as nothing even though the watch was written. Now:
--      * each video a person starts watching is written in their history at once (not when it ends), with the day and time;
--      * the list is read by a function that is allowed to read it, only ever for the person asking;
--      * a video can be removed from the history, the whole history can be cleared, and the history can be paused (nothing new is written while it is paused).
--    The view counter (one per person) is separate and is not touched by any of this.
-- 2. SUBSCRIPTION HISTORY: every NOOB Pro plan a person got (bought, renewed, paid by a friend, won), the plan now, when it ends, when it was bought, and what renewing it costs.
-- Safe to run more than once.

create table if not exists public.long_video_watch_history (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  video_id   uuid not null references public.long_videos (id) on delete cascade,
  watched_at timestamptz not null default now(),
  primary key (user_id, video_id)
);
create index if not exists long_video_watch_history_user_idx on public.long_video_watch_history (user_id, watched_at desc);
alter table public.long_video_watch_history enable row level security;
revoke all on public.long_video_watch_history from anon, authenticated;   -- only through the functions below
grant all on public.long_video_watch_history to service_role;

-- what each person had already watched is kept as their history
insert into public.long_video_watch_history (user_id, video_id, watched_at)
  select v.user_id, v.video_id, v.created_at from public.long_video_views v
  on conflict do nothing;

-- "pause watch history" is one more account setting
create or replace function public.settings_defaults() returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'notif.pauseUntil', null, 'notif.likes', true, 'notif.comments', true, 'notif.follows', true, 'notif.messages', true, 'notif.mentions', true,
    'notif.live', true, 'notif.games', true, 'notif.points', true, 'notif.suggestions', true, 'notif.birthdays', true,
    'notif.quiet', jsonb_build_object('on', false, 'from', '23:00', 'to', '07:00', 'tz', 0),
    'msg.who', 'connected', 'msg.storyReplies', 'everyone', 'msg.readReceipts', true,
    'activity.status', true,
    'tags.who', 'everyone', 'mentions.who', 'everyone',
    'comments.who', 'everyone', 'comments.hideOffensive', false,
    'share.toMessages', true,
    'limit.until', null, 'limit.audience', 'non_followers',
    'likes.hideOthers', false, 'likes.hideMine', false,
    -- Chats
    'chat.lastSeen', 'everyone', 'chat.groupAdds', 'everyone', 'chat.typing', true,
    'chat.fontSize', 'medium', 'chat.wallpaper', 'doodle', 'chat.timeFormat', '12h',
    'chat.compactList', false, 'chat.previewInList', true, 'chat.listAvatars', true, 'chat.pinnedOnTop', true, 'chat.unreadBadges', true,
    'chat.sounds', true, 'chat.vibrate', true, 'chat.autoLoad', 'always', 'chat.confirmDelete', true, 'chat.encryptionNotice', true,
    'history.paused', false);
$$;

create or replace function public.settings_enums() returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'msg.who', jsonb_build_array('connected', 'following', 'nobody'),
    'msg.storyReplies', jsonb_build_array('everyone', 'following', 'off'),
    'tags.who', jsonb_build_array('everyone', 'following', 'nobody'),
    'mentions.who', jsonb_build_array('everyone', 'following', 'nobody'),
    'comments.who', jsonb_build_array('everyone', 'followers', 'following', 'both', 'off'),
    'limit.audience', jsonb_build_array('non_followers', 'recent_followers'),
    'chat.lastSeen', jsonb_build_array('everyone', 'contacts', 'nobody'),
    'chat.groupAdds', jsonb_build_array('everyone', 'contacts', 'nobody'),
    'chat.fontSize', jsonb_build_array('small', 'medium', 'large'),
    'chat.wallpaper', jsonb_build_array('doodle', 'plain', 'dark'),
    'chat.timeFormat', jsonb_build_array('12h', '24h'),
    'chat.autoLoad', jsonb_build_array('always', 'wifi', 'never'));
$$;

-- a watch: counted once per person (as before), and written in the person's history unless they paused it
create or replace function public.record_long_video_view(p_video uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cnt int;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  insert into public.long_video_views (video_id, user_id) values (p_video, me)
    on conflict (video_id, user_id) do update set created_at = now();
  if not coalesce(public.setting_bool(me, 'history.paused'), false) then
    insert into public.long_video_watch_history (user_id, video_id, watched_at) values (me, p_video, now())
      on conflict (user_id, video_id) do update set watched_at = now();
  end if;
  select count(*) into cnt from public.long_video_views where video_id = p_video;
  update public.long_videos set views_count = cnt where id = p_video;
  return jsonb_build_object('success', true, 'viewsCount', cnt);
end;
$$;
grant execute on function public.record_long_video_view(uuid) to authenticated;

create or replace function public.history_long_videos() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(public.long_video_json(v) || jsonb_build_object('watchedAt', h.watched_at) order by h.watched_at desc)
    from (select * from public.long_video_watch_history where user_id = me order by watched_at desc limit 300) h
    join public.long_videos v on v.id = h.video_id
    where public.can_view_author(v.user_id)
  ), '[]'::jsonb);
end;
$$;
grant execute on function public.history_long_videos() to authenticated;

create or replace function public.remove_from_watch_history(p_video uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  delete from public.long_video_watch_history where user_id = me and video_id = p_video;
  return jsonb_build_object('success', true);
end;
$$;
grant execute on function public.remove_from_watch_history(uuid) to authenticated;

create or replace function public.clear_watch_history() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n integer;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  delete from public.long_video_watch_history where user_id = me;
  get diagnostics n = row_count;
  return jsonb_build_object('success', true, 'removed', n);
end;
$$;
grant execute on function public.clear_watch_history() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------- subscription history
create or replace function public.my_subscription_history() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); p public.profiles; price bigint; hist jsonb; started timestamptz; tiers jsonb;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into p from public.profiles where id = me;

  with receipts as (       -- the receipts written since 2026-10-11 (they carry every detail)
    select e.created_at as at,
           case when e.payload->>'method' = 'renewal' then 'renewal' when e.payload->>'method' in ('friend', 'friend_topup') then 'friend' else 'purchase' end as kind,
           e.payload->>'tier' as tier, e.payload->>'planName' as plan_name, e.payload->>'billing' as billing,
           nullif(replace(coalesce(e.payload->>'pricePaid', ''), ',', ''), '')::numeric as paid,
           nullif(replace(coalesce(e.payload->>'listPrice', ''), ',', ''), '')::numeric as list_price,
           e.payload->>'couponCode' as coupon, nullif(e.payload->>'renewsAt', '')::timestamptz as ends_at,
           e.payload->'paidBy'->>'username' as paid_by
      from public.email_outbox e where e.user_id = me and e.kind = 'pro_upgraded'
  ), prizes as (            -- Pro plans won in NOOB Draw
    select e.created_at as at, 'prize'::text as kind, e.payload->>'tier' as tier, e.payload->>'label' as plan_name, null::text as billing, 0::numeric as paid,
           null::numeric as list_price, null::text as coupon, null::timestamptz as ends_at, null::text as paid_by
      from public.email_outbox e where e.user_id = me and e.kind = 'draw_prize' and e.payload->>'prize' = 'pro'
  ), ledger as (            -- plans paid before the receipts existed: read back from the wallet history
    select t.created_at as at, case when t.reason like 'NOOB Pro renewal%' then 'renewal' else 'purchase' end as kind,
           substring(t.reason from '\((\w+), (?:monthly|yearly)') as tier, null::text as plan_name, substring(t.reason from '\(\w+, (monthly|yearly)') as billing,
           (-t.amount)::numeric as paid, null::numeric as list_price, null::text as coupon, null::timestamptz as ends_at, null::text as paid_by
      from public.noob_transactions t
     where t.user_id = me and t.amount < 0 and t.reason like 'NOOB Pro%'
       and not exists (select 1 from public.email_outbox e where e.user_id = me and e.kind = 'pro_upgraded' and abs(extract(epoch from (e.created_at - t.created_at))) < 300)
  ), allrows as (
    select * from receipts union all select * from prizes union all select * from ledger
  )
  select coalesce(jsonb_agg(jsonb_build_object('at', a.at, 'kind', a.kind, 'tier', a.tier, 'planName', coalesce(a.plan_name, initcap(a.tier)), 'billing', a.billing, 'paid', a.paid,
           'listPrice', a.list_price, 'coupon', a.coupon, 'endsAt', a.ends_at, 'paidBy', a.paid_by) order by a.at desc), '[]'::jsonb)
    into hist from allrows a;

  price := case when p.pro_tier is null then null else public.pro_renewal_price(p.pro_tier, coalesce(p.pro_billing, 'monthly')) end;
  started := (select max((x->>'at')::timestamptz) from jsonb_array_elements(hist) x where x->>'tier' = p.pro_tier and x->>'kind' <> 'prize');
  select coalesce(jsonb_agg(jsonb_build_object('tier', t, 'monthly', public.pro_renewal_price(t, 'monthly'), 'yearly', public.pro_renewal_price(t, 'yearly')) order by public.pro_tier_price(t)), '[]'::jsonb)
    into tiers from unnest(array['starter', 'plus', 'pro', 'elite', 'ultimate']) t;

  return jsonb_build_object(
    'current', jsonb_build_object(
      'tier', p.pro_tier, 'billing', p.pro_billing, 'autoRenew', p.pro_auto_renew, 'endsAt', p.pro_renews_at, 'purchasedAt', started,
      'active', p.pro_tier is not null and (p.pro_renews_at is null or p.pro_renews_at > now()),
      'daysLeft', case when p.pro_renews_at is null then null else greatest(0, ceil(extract(epoch from (p.pro_renews_at - now())) / 86400)::int) end,
      'renewalPrice', price, 'balance', p.noob_points, 'shortfall', case when price is null then null else greatest(0, price - p.noob_points) end),
    'history', hist, 'plans', tiers);
end;
$$;
revoke execute on function public.my_subscription_history() from public, anon;
grant execute on function public.my_subscription_history() to authenticated;
