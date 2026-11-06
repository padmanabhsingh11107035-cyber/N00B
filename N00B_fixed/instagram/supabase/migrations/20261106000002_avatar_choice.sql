-- Choose avatar: the character a person picks no longer replaces their profile picture. The profile keeps showing the picture the person has; the chosen avatar is
-- kept on its own, and anyone who visits the profile sees a "View avatar" button that opens that person's avatar page (only that one character, nothing to pick).
--
-- The choice is a short id (for example "nova") in its own table, so nothing about profiles, posts or pictures changes. The table can not be read or written by the
-- app directly; everything goes through the three functions below. Who may see a choice is decided here: the owner always; anyone who may see that person's profile
-- (so a private account's avatar goes only to people who may open it); never a blocked person, nor someone the owner hid the profile from, nor a suspended account.
-- Safe to run more than once. No existing table or function is changed.

create table if not exists public.avatar_choices (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  avatar_id text not null check (avatar_id ~ '^[a-z0-9_-]{1,40}$'),
  updated_at timestamptz not null default now()
);
alter table public.avatar_choices enable row level security;
revoke all on public.avatar_choices from public, anon, authenticated;

-- Choose (or change) my avatar. The profile picture is not touched.
create or replace function public.avatar_choice_set(p_avatar text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); a text := lower(btrim(coalesce(p_avatar, '')));
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if a !~ '^[a-z0-9_-]{1,40}$' then raise exception 'Pick one of the avatars.'; end if;
  insert into public.avatar_choices (user_id, avatar_id, updated_at) values (me, a, now())
  on conflict (user_id) do update set avatar_id = excluded.avatar_id, updated_at = excluded.updated_at;
  return jsonb_build_object('success', true, 'avatar', a);
end;
$$;
revoke execute on function public.avatar_choice_set(text) from public, anon;
grant execute on function public.avatar_choice_set(text) to authenticated;

-- The avatar a person chose, for whoever may see that person (null: none chosen, or not allowed: the two look the same).
create or replace function public.avatar_choice_get(p_user uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); a text;
begin
  select c.avatar_id into a from public.avatar_choices c where c.user_id = p_user;
  if a is null then return null; end if;
  if me is not distinct from p_user then return a; end if;
  if coalesce((select p.is_suspended from public.profiles p where p.id = p_user), true) then return null; end if;
  if me is not null and (
       exists (select 1 from public.blocks b where (b.blocker_id = p_user and b.blocked_id = me) or (b.blocker_id = me and b.blocked_id = p_user))
    or exists (select 1 from public.profile_hides h where h.owner_id = p_user and h.hidden_from_id = me)
  ) then return null; end if;
  if not public.can_view_author(p_user) then return null; end if;
  return a;
end;
$$;
revoke execute on function public.avatar_choice_get(uuid) from public;
grant execute on function public.avatar_choice_get(uuid) to anon, authenticated;

-- Take my choice away (the "View avatar" button disappears from my profile).
create or replace function public.avatar_choice_clear() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  delete from public.avatar_choices where user_id = me;
  return jsonb_build_object('success', true);
end;
$$;
revoke execute on function public.avatar_choice_clear() from public, anon;
grant execute on function public.avatar_choice_clear() to authenticated;
