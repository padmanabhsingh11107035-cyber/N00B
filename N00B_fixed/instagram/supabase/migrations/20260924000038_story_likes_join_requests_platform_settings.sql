-- NOOB — three independent additions, bundled in one migration so there is only one thing to run:
--
-- 1) Story likes were never actually saved anywhere — the heart button in StoryViewerModal only ever
--    flipped a local React Set that reset itself the next time the viewer opened, no backend call at
--    all. Mirrors the story_views table/pattern exactly (same table shape, same story_json wiring).
--
-- 2) "Apply to join us" — a lightweight application form any signed-in member can submit once, and
--    the main admin reviews from the new admin console. Table has no direct-access policies at all
--    (same as public.reports): every read and write goes through a security-definer RPC below.
--
-- 3) platform_settings — a single-row table for the admin console's new toggles: pause new sign-ups,
--    a whole-app maintenance lock (with the message shown to everyone it blocks), read by anyone
--    (even logged out, so the sign-up screen and the maintenance screen both work pre-login) but only
--    ever written by the main admin.

-- ===========================================================================
-- 1. Story likes
-- ===========================================================================
create table public.story_likes (
  story_id   uuid not null references public.stories (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);
alter table public.story_likes enable row level security;

-- Same visibility rule as story_views: you can see your own like, the story's owner sees everyone's.
create policy story_likes_select on public.story_likes for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or exists (select 1 from public.stories s where s.id = story_id and s.user_id = auth.uid()));
grant select on public.story_likes to authenticated;

create or replace function public.story_json(s public.stories) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', s.id, 'userId', s.user_id, 'username', a.username, 'userAvatar', a.avatar, 'isVerified', a.is_verified,
    'mediaUrl', s.media_url, 'mediaType', s.media_type, 'durationSeconds', s.duration_seconds,
    'createdAt', s.created_at, 'expiresAt', s.expires_at, 'isCloseFriendsOnly', s.is_close_friends_only,
    'isViewed', exists (select 1 from public.story_views v where v.story_id = s.id and v.user_id = auth.uid()),
    'viewedBy', case when s.user_id = auth.uid()
                     then coalesce((select jsonb_agg(v.user_id order by v.created_at) from public.story_views v where v.story_id = s.id), '[]'::jsonb)
                     else '[]'::jsonb end,
    'isLiked', exists (select 1 from public.story_likes l where l.story_id = s.id and l.user_id = auth.uid()),
    'likesCount', (select count(*) from public.story_likes l where l.story_id = s.id),
    'filter', s.filter, 'stickers', s.stickers,
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'username', cu.username, 'userAvatar', cu.avatar, 'text', c.text, 'createdAt', c.created_at) order by c.created_at)
      from public.story_comments c join public.profiles cu on cu.id = c.user_id where c.story_id = s.id), '[]'::jsonb))
  from public.profiles a where a.id = s.user_id;
$$;

create or replace function public.toggle_story_like(p_story uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid; was_liked boolean; cnt int;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select user_id into owner from public.stories where id = p_story and expires_at > now();
  if owner is null then raise exception 'This story is no longer available.' using errcode = 'P0002'; end if;
  if owner <> me and not public.can_view_author(owner) then raise exception 'You cannot see this story.' using errcode = '42501'; end if;
  select exists (select 1 from public.story_likes where story_id = p_story and user_id = me) into was_liked;
  if was_liked then
    delete from public.story_likes where story_id = p_story and user_id = me;
  else
    insert into public.story_likes (story_id, user_id) values (p_story, me) on conflict do nothing;
  end if;
  select count(*) into cnt from public.story_likes where story_id = p_story;
  return jsonb_build_object('success', true, 'isLiked', not was_liked, 'likesCount', cnt);
end;
$$;

-- ===========================================================================
-- 2. "Apply to join us" — team applications
-- ===========================================================================
create table public.team_applications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  full_name        text not null,
  role_interested  text not null,
  why_join         text not null,
  experience       text not null default '',
  availability     text not null default '',
  contact          text not null default '',
  status           text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at       timestamptz not null default now(),
  reviewed_by      uuid references public.profiles (id),
  reviewed_at      timestamptz
);
create index team_applications_user_idx on public.team_applications (user_id, created_at desc);
alter table public.team_applications enable row level security;
-- No policies on purpose (same as public.reports) — every read and write goes through the
-- security-definer functions below, so RLS blocks any other access by default.

create or replace function public.team_application_json(t public.team_applications) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'userId', t.user_id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar,
    'fullName', t.full_name, 'roleInterested', t.role_interested, 'whyJoin', t.why_join, 'experience', t.experience,
    'availability', t.availability, 'contact', t.contact, 'status', t.status, 'createdAt', t.created_at,
    'reviewedBy', (select username from public.profiles where id = t.reviewed_by), 'reviewedAt', t.reviewed_at)
  from public.profiles p where p.id = t.user_id;
$$;

create or replace function public.submit_team_application(
  p_full_name text, p_role text, p_why text, p_experience text default '', p_availability text default '', p_contact text default ''
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); app public.team_applications;
begin
  if me is null or (select is_suspended from public.profiles where id = me) is not false then raise exception 'Please log in.' using errcode = '28000'; end if;
  if coalesce(btrim(p_full_name), '') = '' then raise exception 'Please tell us your name.'; end if;
  if coalesce(btrim(p_role), '') = '' then raise exception 'Please tell us what role you are interested in.'; end if;
  if coalesce(btrim(p_why), '') = '' then raise exception 'Please tell us why you want to join.'; end if;
  if exists (select 1 from public.team_applications where user_id = me and status = 'pending') then
    raise exception 'You already have an application awaiting review.';
  end if;
  insert into public.team_applications (user_id, full_name, role_interested, why_join, experience, availability, contact)
  values (me, btrim(p_full_name), btrim(p_role), btrim(p_why), coalesce(btrim(p_experience), ''), coalesce(btrim(p_availability), ''), coalesce(btrim(p_contact), ''))
  returning * into app;
  return jsonb_build_object('success', true, 'application', public.team_application_json(app));
end;
$$;

create or replace function public.admin_team_applications() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  return jsonb_build_object('success', true,
    'applications', coalesce((select jsonb_agg(public.team_application_json(t) order by t.created_at desc) from public.team_applications t), '[]'::jsonb));
end;
$$;

create or replace function public.admin_review_team_application(p_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid; app public.team_applications; st text;
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  me := auth.uid();
  st := case when p_status in ('accepted', 'declined') then p_status else 'pending' end;
  update public.team_applications set status = st, reviewed_by = me, reviewed_at = now() where id = p_id returning * into app;
  if not found then raise exception 'Application not found'; end if;
  return jsonb_build_object('success', true, 'application', public.team_application_json(app));
end;
$$;

-- ===========================================================================
-- 3. Platform settings — sign-ups pause, whole-app maintenance lock
-- ===========================================================================
create table public.platform_settings (
  id                    boolean primary key default true check (id),
  signups_enabled       boolean not null default true,
  maintenance_enabled   boolean not null default false,
  maintenance_message   text not null default 'NOOB is under quick maintenance. Please check back soon.',
  updated_by            uuid references public.profiles (id),
  updated_at            timestamptz not null default now()
);
insert into public.platform_settings (id) values (true) on conflict do nothing;
alter table public.platform_settings enable row level security;
-- Deliberately no table policies — read and write both go through the functions below (the read one
-- is callable by anon specifically so a not-yet-logged-in visitor's sign-up screen can check it too).

create or replace function public.public_platform_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'signupsEnabled', s.signups_enabled, 'maintenanceEnabled', s.maintenance_enabled, 'maintenanceMessage', s.maintenance_message)
  from public.platform_settings s where s.id = true;
$$;
grant execute on function public.public_platform_settings() to anon, authenticated;

create or replace function public.admin_set_platform_settings(
  p_signups_enabled boolean default null, p_maintenance_enabled boolean default null, p_maintenance_message text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid;
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  me := auth.uid();
  update public.platform_settings set
    signups_enabled = coalesce(p_signups_enabled, signups_enabled),
    maintenance_enabled = coalesce(p_maintenance_enabled, maintenance_enabled),
    maintenance_message = coalesce(nullif(btrim(p_maintenance_message), ''), maintenance_message),
    updated_by = me, updated_at = now()
  where id = true;
  perform public.log_admin_action('platform_settings_changed', null,
    jsonb_build_object('signupsEnabled', p_signups_enabled, 'maintenanceEnabled', p_maintenance_enabled));
  return public.public_platform_settings();
end;
$$;

-- ===========================================================================
-- 4. Admin content browser — every post/reel/story, not just who the admin follows
-- ===========================================================================
create or replace function public.admin_content_feed(p_type text, p_limit integer default 60) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  if p_type = 'reels' then
    return jsonb_build_object('success', true, 'items', coalesce((
      select jsonb_agg(public.reel_json(x.r) order by (x.r).created_at desc)
      from (select r from public.reels r order by r.created_at desc limit least(greatest(p_limit, 1), 200)) x), '[]'::jsonb));
  elsif p_type = 'stories' then
    return jsonb_build_object('success', true, 'items', coalesce((
      select jsonb_agg(public.story_json(x.s) order by (x.s).created_at desc)
      from (select s from public.stories s order by s.created_at desc limit least(greatest(p_limit, 1), 200)) x), '[]'::jsonb));
  else
    return jsonb_build_object('success', true, 'items', coalesce((
      select jsonb_agg(public.post_json(x.p) order by (x.p).created_at desc)
      from (select p from public.posts p order by p.created_at desc limit least(greatest(p_limit, 1), 200)) x), '[]'::jsonb));
  end if;
end;
$$;
