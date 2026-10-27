-- NOOB — three small things, in one file:
--   1. Notepad (profile menu > Settings and activity > Notepad): each person's own text notes. Only the owner can read or change them.
--   2. "Where did you hear about NOOB?": one answer per person, asked once right after an account is made. The administrator can see the totals.
--   3. Daily NOOB coming back: when the administrator switches the Daily NOOB page back ON (Admin > Pages), everybody gets a notification (and a push) about it, once per switch.

-- ------------------------------------------------------------------------------------------------ 1. notepad
create table if not exists public.profile_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null default '' check (char_length(body) <= 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profile_notes_user_idx on public.profile_notes (user_id, updated_at desc);
alter table public.profile_notes enable row level security;
revoke all on public.profile_notes from public, anon;
grant select, insert, update, delete on public.profile_notes to authenticated;
grant all on public.profile_notes to service_role;
drop policy if exists profile_notes_own_select on public.profile_notes;
drop policy if exists profile_notes_own_insert on public.profile_notes;
drop policy if exists profile_notes_own_update on public.profile_notes;
drop policy if exists profile_notes_own_delete on public.profile_notes;
create policy profile_notes_own_select on public.profile_notes for select using (user_id = auth.uid());
create policy profile_notes_own_insert on public.profile_notes for insert with check (user_id = auth.uid());
create policy profile_notes_own_update on public.profile_notes for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy profile_notes_own_delete on public.profile_notes for delete using (user_id = auth.uid());

-- at most 300 notes each, and the time of the last change is kept by the database itself
create or replace function public.profile_notes_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.profile_notes where user_id = new.user_id) >= 300 then
      raise exception 'You have 300 notes already. Delete one to make room for a new one.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.profile_notes_guard() from public, anon, authenticated;
drop trigger if exists profile_notes_guard_trg on public.profile_notes;
create trigger profile_notes_guard_trg before insert or update on public.profile_notes for each row execute function public.profile_notes_guard();

-- ------------------------------------------------------------------------------------------------ 2. where did you hear about NOOB
create table if not exists public.signup_sources (
  user_id     uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  source      text not null check (char_length(source) between 1 and 40),
  detail      text check (detail is null or char_length(detail) <= 200),
  answered_at timestamptz not null default now()
);
alter table public.signup_sources enable row level security;
revoke all on public.signup_sources from public, anon;
grant select, insert on public.signup_sources to authenticated;
grant all on public.signup_sources to service_role;
drop policy if exists signup_sources_own_select on public.signup_sources;
drop policy if exists signup_sources_own_insert on public.signup_sources;
create policy signup_sources_own_select on public.signup_sources for select using (user_id = auth.uid());
create policy signup_sources_own_insert on public.signup_sources for insert with check (user_id = auth.uid());

-- the totals for the administrator: how many people named each place (and the "other" words people typed)
create or replace function public.admin_signup_sources() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_master_admin();
  return jsonb_build_object(
    'total', (select count(*) from public.signup_sources),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('source', s.source, 'count', s.n) order by s.n desc) from (select source, count(*) n from public.signup_sources group by source) s), '[]'::jsonb),
    'others', coalesce((select jsonb_agg(x.detail) from (select detail from public.signup_sources where source = 'other' and detail is not null order by answered_at desc limit 100) x), '[]'::jsonb));
end;
$$;
revoke execute on function public.admin_signup_sources() from public, anon;
grant execute on function public.admin_signup_sources() to authenticated;

-- ------------------------------------------------------------------------------------------------ 3. Daily NOOB is back
-- Same function as before (a page switched off or on), plus: switching "daily" from OFF to ON notifies every active account (each notification is also pushed to the phones that have
-- notifications on, by the usual push path). Switching it on when it was already on, or any other page, notifies nobody.
create or replace function public.admin_set_feature(p_key text, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k text := lower(btrim(coalesce(p_key, ''))); was_off boolean; me uuid := auth.uid(); r record;
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  if k !~ '^[a-z0-9-]{2,40}$' then raise exception 'That is not the name of a page.'; end if;
  if p_on is null then raise exception 'Say whether the page should be on or off.'; end if;
  select k = any (s.disabled_features) into was_off from public.platform_settings s where s.id = true;
  update public.platform_settings s set
    disabled_features = case
      when p_on then array_remove(s.disabled_features, k)
      when k = any (s.disabled_features) then s.disabled_features
      when cardinality(s.disabled_features) >= 100 then s.disabled_features
      else array_append(s.disabled_features, k) end,
    updated_by = me, updated_at = now()
  where s.id = true;
  perform public.log_admin_action('feature_switch_changed', null, jsonb_build_object('feature', k, 'on', p_on));
  if p_on and k = 'daily' and coalesce(was_off, false) then
    for r in select p.id from public.profiles p where not p.is_suspended and p.id <> me loop
      perform public.notify_user(r.id, 'admin_direct', me, 'Daily NOOB is back! Today''s challenge is waiting for you.', 'Daily NOOB is back 🎯');
    end loop;
  end if;
  return public.public_platform_settings();
end;
$$;
revoke execute on function public.admin_set_feature(text, boolean) from public, anon;
grant execute on function public.admin_set_feature(text, boolean) to authenticated;
