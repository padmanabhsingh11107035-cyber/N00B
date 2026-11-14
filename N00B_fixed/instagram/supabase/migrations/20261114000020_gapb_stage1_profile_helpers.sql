-- 20261114000020: Privacy gap B, stage 1: the small definer helpers and the OFF/ON switch (docs/PRIVACY-GAP-B-PLAN.md)
-- LIVE EFFECT: none. Only NEW functions and one NEW switch row (value 'off') are added. No existing function reads them yet (stage 2 does that), no policy changes.
-- Owner decisions: D1 suspended accounts stay in search and user_by_id; D2 old content keeps showing author names (profile_brief blanks nothing, also not for hidden or suspended accounts); D3 search_users stays as is.
-- Safe to run twice. No row of profiles is touched, nothing is deleted.
-- ROLLBACK (only while no stage 2 migration is applied, otherwise roll those back first): supabase/one-off/rollback-gapb-stage1.sql

-- the harmless "card" of a person: username, display name, avatar, tick, live avatar and bio (exactly what the builders show today), no hidden / suspended filter.
-- Zero rows when the account does not exist, like the old "from profiles where id = ..." (so the builders return null in the same cases).
create or replace function public.profile_brief(p_id uuid)
returns table (id uuid, username text, display_name text, avatar text, is_verified boolean, is_live_avatar boolean, live_avatar_video_url text, bio text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar, p.is_verified, p.is_live_avatar, p.live_avatar_video_url, p.bio
  from public.profiles p where p.id = p_id
$$;

-- is this followed account private? (user_public_json uses it so that a hidden private account is still left out of followingIds after the row rule exists)
create or replace function public.profile_is_private(p_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.account_type = 'private' from public.profiles p where p.id = p_id), false)
$$;

-- the id(s) of the administrator account named noob (chat_json: who counts as admin of a group)
create or replace function public.profile_noob_admin_ids()
returns table (id uuid)
language sql stable security definer set search_path = public as $$
  select p.id from public.profiles p where p.is_admin and lower(p.username) = 'noob'
$$;

-- the switch (a row in internal_config, default OFF)
insert into public.internal_config (key, value) values ('profiles_row_rule', 'off') on conflict (key) do nothing;

-- "may the caller read this profile row directly?" Switch OFF (the default and today's behaviour): always true.
-- Switch ON: the own row, the administrator, or an account that is neither hidden from the caller nor suspended.
create or replace function public.profile_row_visible(p_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when coalesce((select c.value from public.internal_config c where c.key = 'profiles_row_rule'), 'off') <> 'on' then true
    else p_id is not distinct from auth.uid()
      or public.is_admin()
      or (not public.is_hidden_from_me(p_id) and not coalesce((select s.is_suspended from public.profiles s where s.id = p_id), false))
  end
$$;

-- only logged-in people (and the server) may call them; a visitor may not
revoke all on function public.profile_brief(uuid) from public, anon;
revoke all on function public.profile_is_private(uuid) from public, anon;
revoke all on function public.profile_noob_admin_ids() from public, anon;
revoke all on function public.profile_row_visible(uuid) from public, anon;
grant execute on function public.profile_brief(uuid) to authenticated, service_role;
grant execute on function public.profile_is_private(uuid) to authenticated, service_role;
grant execute on function public.profile_noob_admin_ids() to authenticated, service_role;
grant execute on function public.profile_row_visible(uuid) to authenticated, service_role;
