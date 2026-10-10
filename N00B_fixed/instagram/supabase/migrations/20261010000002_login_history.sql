-- Login history + an honest "My devices" list.
--
-- device_sessions (single-device login) only knows which devices are signed in RIGHT NOW. This adds
-- login_history: one row per sign-in on a device — which device, its model, when it signed in and when
-- it signed out ("from – to"). Purely additive: no existing table or function is changed, so the
-- single-device login rules keep working exactly as they do today. A person can only ever read their
-- own rows.

create table if not exists public.login_history (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  device_id     text not null,
  device_label  text,
  device_model  text,
  logged_in_at  timestamptz not null default now(),
  logged_out_at timestamptz,
  end_reason    text check (end_reason in ('logout', 'removed', 'replaced'))
);
create index if not exists login_history_user_idx on public.login_history (user_id, logged_in_at desc);
create index if not exists login_history_open_idx on public.login_history (user_id, device_id) where logged_out_at is null;

alter table public.login_history enable row level security;
drop policy if exists login_history_select on public.login_history;
create policy login_history_select on public.login_history for select to authenticated using (user_id = auth.uid());
grant select on public.login_history to authenticated;

-- Called after every successful sign-in (and once at app start for a session that is already open).
-- Opens a history row for this device unless one is already open; any OTHER device still marked
-- signed-in is stale at this point (this device only got in because no other one was active), so its
-- row is closed as "replaced".
create or replace function public.record_login(p_device_id text, p_device_label text default null, p_device_model text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if coalesce(btrim(p_device_id), '') = '' then raise exception 'Missing device id.'; end if;

  update public.login_history set logged_out_at = now(), end_reason = 'replaced'
    where user_id = me and device_id <> p_device_id and logged_out_at is null;

  if exists (select 1 from public.login_history where user_id = me and device_id = p_device_id and logged_out_at is null) then
    update public.login_history
      set device_label = coalesce(nullif(btrim(p_device_label), ''), device_label),
          device_model = coalesce(nullif(btrim(p_device_model), ''), device_model)
      where user_id = me and device_id = p_device_id and logged_out_at is null;
  else
    insert into public.login_history (user_id, device_id, device_label, device_model)
      values (me, p_device_id, nullif(btrim(p_device_label), ''), nullif(btrim(p_device_model), ''));
  end if;
  return jsonb_build_object('success', true);
end;
$$;

-- Called when a device signs out (reason 'logout') or when you remove it from another device
-- (reason 'removed'). Closes its history row and frees its place in device_sessions, so a device that
-- has signed out stops being listed as signed in (and no longer blocks signing in somewhere else).
-- Never raises: signing out must always work.
create or replace function public.end_login(p_device_id text, p_reason text default 'logout') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or coalesce(btrim(p_device_id), '') = '' then return jsonb_build_object('success', false); end if;
  update public.login_history
    set logged_out_at = now(), end_reason = case when p_reason = 'removed' then 'removed' else 'logout' end
    where user_id = me and device_id = p_device_id and logged_out_at is null;
  update public.device_sessions set revoked_at = now()
    where user_id = me and device_id = p_device_id and revoked_at is null;
  return jsonb_build_object('success', true);
end;
$$;

-- Everything the "My devices" page shows: the devices signed in right now, and the recent history.
create or replace function public.my_devices() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'active', coalesce((
      select jsonb_agg(jsonb_build_object(
        'deviceId', d.device_id,
        'label', coalesce(d.device_label, 'Device'),
        'model', (select h.device_model from public.login_history h
                  where h.user_id = d.user_id and h.device_id = d.device_id order by h.logged_in_at desc limit 1),
        'loggedInAt', coalesce((select h.logged_in_at from public.login_history h
                  where h.user_id = d.user_id and h.device_id = d.device_id and h.logged_out_at is null
                  order by h.logged_in_at desc limit 1), d.created_at),
        'lastSeenAt', d.last_seen_at
      ) order by d.last_seen_at desc)
      from public.device_sessions d
      where d.user_id = auth.uid() and d.revoked_at is null
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id, 'deviceId', h.device_id, 'label', h.device_label, 'model', h.device_model,
        'loggedInAt', h.logged_in_at, 'loggedOutAt', h.logged_out_at, 'endReason', h.end_reason
      ) order by h.logged_in_at desc)
      from (select * from public.login_history where user_id = auth.uid() order by logged_in_at desc limit 60) h
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.record_login(text, text, text) from public;
revoke all on function public.end_login(text, text) from public;
revoke all on function public.my_devices() from public;
grant execute on function public.record_login(text, text, text) to authenticated;
grant execute on function public.end_login(text, text) to authenticated;
grant execute on function public.my_devices() to authenticated;
