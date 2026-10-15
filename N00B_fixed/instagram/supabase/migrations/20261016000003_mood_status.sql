-- Mood Status: a person picks how they feel (happy, confident, tired, sad, angry, excited, bored, loved), may add a short note (80 characters), and chooses who can see it:
-- everyone, followers, or only themselves. It can clear itself after a set time (24 hours is offered), and the person can change or remove it whenever they like.
--
-- Nothing is published for anyone: a mood exists only after the person presses the button, and it is shown only as its own setting allows. The rules are kept HERE:
--   * the table can not be read or written by the app at all; everything goes through the functions below;
--   * whether someone may see a mood is decided by the database: "only me" is seen by nobody else; "followers" by the people who follow that person; "everyone" by anyone
--     who may see that person's profile (so a private account's mood still goes only to its followers); a blocked person, someone the owner hid their profile from, and a
--     suspended account never see it or appear in a list; a mood that has expired is gone for everybody;
--   * the lists ("friends' moods", "community moods") contain only moods the viewer is allowed to see, and the community list leaves out private accounts altogether.
-- Safe to run more than once. No existing table or function is changed.

create or replace function public.fun_clean_text(t text) returns text
language sql immutable set search_path = public as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          replace(replace(coalesce(t, ''), E'\r\n', E'\n'), E'\r', E'\n'),
          E'[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]', '', 'g'),
        E'[ \\t]+\n', E'\n', 'g'),
      E'\n{3,}', E'\n\n', 'g'),
    E' \n\t');
$$;
revoke execute on function public.fun_clean_text(text) from public, anon, authenticated;

create table if not exists public.user_moods (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  mood text not null check (mood in ('happy', 'confident', 'tired', 'sad', 'angry', 'excited', 'bored', 'loved')),
  note text not null default '' check (char_length(note) <= 80),
  visibility text not null default 'followers' check (visibility in ('everyone', 'followers', 'only_me')),
  updated_at timestamptz not null default now(),                       -- when the mood was last set
  expires_at timestamptz                                               -- null: stays until changed or removed
);
create index if not exists user_moods_community_idx on public.user_moods (updated_at desc, user_id desc) where visibility = 'everyone';
create index if not exists user_moods_recent_idx on public.user_moods (updated_at desc, user_id desc);
create index if not exists user_moods_expiry_idx on public.user_moods (expires_at) where expires_at is not null;

alter table public.user_moods enable row level security;
revoke all on public.user_moods from public, anon, authenticated;

-- May the signed-in person (or a visitor) see this person's current mood?
create or replace function public.mood_visible(m public.user_moods) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if m.expires_at is not null and m.expires_at <= now() then return false; end if;
  if me is not distinct from m.user_id then return true; end if;
  if m.visibility = 'only_me' then return false; end if;
  if coalesce((select p.is_suspended from public.profiles p where p.id = m.user_id), true) then return false; end if;
  if me is not null and (
       exists (select 1 from public.blocks b where (b.blocker_id = m.user_id and b.blocked_id = me) or (b.blocker_id = me and b.blocked_id = m.user_id))
    or exists (select 1 from public.profile_hides h where h.owner_id = m.user_id and h.hidden_from_id = me)
  ) then return false; end if;
  if m.visibility = 'followers' then
    return me is not null and exists (select 1 from public.follows f where f.follower_id = me and f.followee_id = m.user_id);
  end if;
  return public.can_view_author(m.user_id);                              -- "everyone": whoever may see that person's profile
end;
$$;
revoke execute on function public.mood_visible(public.user_moods) from public, anon, authenticated;

create or replace function public.mood_json(m public.user_moods, for_owner boolean default false) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('mood', m.mood, 'note', m.note, 'updatedAt', m.updated_at)
         || case when for_owner then jsonb_build_object('visibility', m.visibility, 'expiresAt', m.expires_at) else '{}'::jsonb end;
$$;
revoke execute on function public.mood_json(public.user_moods, boolean) from public, anon, authenticated;

-- Set (or change) my mood. Nothing happens until this is called.
create or replace function public.mood_set(p_mood text, p_note text default '', p_visibility text default 'followers', p_expire_hours int default 24) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  note text := regexp_replace(public.fun_clean_text(p_note), E'\\s+', ' ', 'g');
  vis text := coalesce(p_visibility, 'followers');
  m public.user_moods;
  last_at timestamptz;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if coalesce((select is_suspended from public.profiles where id = me), true) then raise exception 'This account can not change its mood right now.'; end if;
  if p_mood is null or p_mood not in ('happy', 'confident', 'tired', 'sad', 'angry', 'excited', 'bored', 'loved') then raise exception 'Pick one of the moods.'; end if;
  if char_length(note) > 80 then raise exception 'A note can be at most 80 characters.'; end if;
  if vis not in ('everyone', 'followers', 'only_me') then raise exception 'Choose who can see your mood.'; end if;
  if p_expire_hours is not null and (p_expire_hours < 1 or p_expire_hours > 168) then raise exception 'A mood can clear itself after 1 to 168 hours.'; end if;
  select updated_at into last_at from public.user_moods where user_id = me;
  if last_at is not null and last_at > now() - interval '2 seconds' then raise exception 'Please wait a moment before changing your mood again.'; end if;
  insert into public.user_moods (user_id, mood, note, visibility, updated_at, expires_at)
  values (me, p_mood, note, vis, now(), case when p_expire_hours is null then null else now() + make_interval(hours => p_expire_hours) end)
  on conflict (user_id) do update set mood = excluded.mood, note = excluded.note, visibility = excluded.visibility, updated_at = excluded.updated_at, expires_at = excluded.expires_at
  returning * into m;
  return public.mood_json(m, true);
end;
$$;
revoke execute on function public.mood_set(text, text, text, int) from public, anon;
grant execute on function public.mood_set(text, text, text, int) to authenticated;

create or replace function public.mood_clear() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  delete from public.user_moods where user_id = me;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.mood_clear() from public, anon;
grant execute on function public.mood_clear() to authenticated;

-- My own mood (null if none, or if it has cleared itself).
create or replace function public.mood_my() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m public.user_moods;
begin
  if auth.uid() is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into m from public.user_moods where user_id = auth.uid() and (expires_at is null or expires_at > now());
  if not found then return null; end if;
  return public.mood_json(m, true);
end;
$$;
revoke execute on function public.mood_my() from public, anon;
grant execute on function public.mood_my() to authenticated;

-- Someone's mood as the person looking is allowed to see it (null otherwise: nothing tells "no mood" apart from "not allowed").
create or replace function public.mood_get(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m public.user_moods;
begin
  select * into m from public.user_moods where user_id = p_user;
  if not found or not public.mood_visible(m) then return null; end if;
  return public.mood_json(m, p_user is not distinct from auth.uid());
end;
$$;
grant execute on function public.mood_get(uuid) to anon, authenticated;

-- The moods of the people I follow that I am allowed to see, newest first, a page at a time (keyset: the time and person of the last one seen).
create or replace function public.mood_friends(p_limit int default 20, p_before timestamptz default null, p_before_user uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  lim int := least(greatest(coalesce(p_limit, 20), 1), 50);
  msgs jsonb;
  total int;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  with page as (
    select m.user_id, m.mood, m.note, m.updated_at, p.username, p.display_name, p.avatar, p.is_verified,
           row_number() over (order by m.updated_at desc, m.user_id desc) as rn
    from public.user_moods m
    join public.profiles p on p.id = m.user_id
    join public.follows f on f.follower_id = me and f.followee_id = m.user_id
    where m.visibility <> 'only_me' and public.mood_visible(m)
      and (p_before is null or (m.updated_at, m.user_id) < (p_before, coalesce(p_before_user, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by m.updated_at desc, m.user_id desc
    limit lim + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('userId', user_id, 'username', username, 'displayName', coalesce(nullif(display_name, ''), username), 'avatar', avatar,
                                               'isVerified', is_verified, 'mood', mood, 'note', note, 'updatedAt', updated_at) order by rn) filter (where rn <= lim), '[]'::jsonb), count(*)
    into msgs, total
  from page;
  return jsonb_build_object('moods', msgs, 'hasMore', total > lim);
end;
$$;
revoke execute on function public.mood_friends(int, timestamptz, uuid) from public, anon;
grant execute on function public.mood_friends(int, timestamptz, uuid) to authenticated;

-- The moods people shared with everyone (public accounts only; never mine, never anyone who blocked me or hid from me), newest first.
create or replace function public.mood_community(p_limit int default 20, p_before timestamptz default null, p_before_user uuid default null, p_mood text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  lim int := least(greatest(coalesce(p_limit, 20), 1), 50);
  msgs jsonb;
  total int;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  with page as (
    select m.user_id, m.mood, m.note, m.updated_at, p.username, p.display_name, p.avatar, p.is_verified,
           row_number() over (order by m.updated_at desc, m.user_id desc) as rn
    from public.user_moods m
    join public.profiles p on p.id = m.user_id
    where m.visibility = 'everyone' and p.account_type <> 'private' and not p.is_suspended and not p.is_ai and m.user_id <> me
      and (p_mood is null or m.mood = p_mood)
      and public.mood_visible(m)
      and (p_before is null or (m.updated_at, m.user_id) < (p_before, coalesce(p_before_user, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by m.updated_at desc, m.user_id desc
    limit lim + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('userId', user_id, 'username', username, 'displayName', coalesce(nullif(display_name, ''), username), 'avatar', avatar,
                                               'isVerified', is_verified, 'mood', mood, 'note', note, 'updatedAt', updated_at) order by rn) filter (where rn <= lim), '[]'::jsonb), count(*)
    into msgs, total
  from page;
  return jsonb_build_object('moods', msgs, 'hasMore', total > lim);
end;
$$;
revoke execute on function public.mood_community(int, timestamptz, uuid, text) from public, anon;
grant execute on function public.mood_community(int, timestamptz, uuid, text) to authenticated;
