-- NOOB — Instants (like Instagram's): quick, camera-only photos shared from the Chat page with Close Friends or
-- with friends (people you follow who follow you back).
--   * Each friend can open an instant ONCE; then it's gone for them. Unopened instants expire after 24 hours.
--   * Friends can react with an emoji (the sender is told); the sender never sees who merely looked.
--   * The sender keeps a private archive ("Your Instants", only visible to them) and can delete an instant
--     (that also takes it back from everyone who hasn't opened it — the "undo").
--   * Close Friends is a new personal list (it was only a flag on stories before).
-- Photos are stored under the media bucket's new "instants/" folder; a photo's address is only handed out to a
-- recipient when they open it.

-- ---------------------------------------------------------------------------------------------------------------
-- Storage: allow the "instants/" folder (same list as 20260923000032, plus instants)
-- ---------------------------------------------------------------------------------------------------------------
drop policy if exists media_upload on storage.objects;
create policy media_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] in ('posts', 'reels', 'stories', 'avatars', 'music', 'covers', 'stickers', 'products', 'chat', 'instants')
  );

-- ---------------------------------------------------------------------------------------------------------------
-- Close Friends
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.close_friends (
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  friend_id  uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, friend_id),
  check (owner_id <> friend_id)
);
alter table public.close_friends enable row level security;
revoke all on public.close_friends from anon, authenticated;       -- only through the functions below

-- Friends = people I follow who follow me back (the only people who can be picked as Close Friends too).
create or replace function public.my_friend_ids(me uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select f.followee_id from public.follows f
  join public.profiles p on p.id = f.followee_id and not p.is_suspended
  where f.follower_id = me
    and exists (select 1 from public.follows g where g.follower_id = f.followee_id and g.followee_id = me)
    and not exists (select 1 from public.blocks b where (b.blocker_id = me and b.blocked_id = f.followee_id)
                                                   or (b.blocker_id = f.followee_id and b.blocked_id = me));
$$;
revoke execute on function public.my_friend_ids(uuid) from public, anon, authenticated;

-- My friends, each marked whether they're on my Close Friends list.
create or replace function public.my_close_friends() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'displayName', p.display_name,
                     'avatar', p.avatar, 'isVerified', p.is_verified,
                     'isCloseFriend', exists (select 1 from public.close_friends c where c.owner_id = me and c.friend_id = p.id))
                     order by p.username)
    from public.profiles p where p.id in (select public.my_friend_ids(me))), '[]'::jsonb);
end;
$$;

create or replace function public.set_close_friend(p_user uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if p_on then
    if p_user not in (select public.my_friend_ids(me)) then
      raise exception 'Only friends (people you follow who follow you back) can be Close Friends.';
    end if;
    insert into public.close_friends (owner_id, friend_id) values (me, p_user) on conflict do nothing;
  else
    delete from public.close_friends where owner_id = me and friend_id = p_user;
  end if;
  return jsonb_build_object('success', true, 'count', (select count(*) from public.close_friends where owner_id = me));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Instants
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.instants (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  media_url  text not null,
  caption    text not null default '',
  audience   text not null check (audience in ('friends', 'close_friends')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index if not exists instants_user_idx on public.instants (user_id, created_at desc);

create table if not exists public.instant_recipients (
  instant_id uuid not null references public.instants (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  viewed_at  timestamptz,
  reaction   text,
  reacted_at timestamptz,
  primary key (instant_id, user_id)
);
create index if not exists instant_recipients_inbox_idx on public.instant_recipients (user_id) where viewed_at is null;

alter table public.instants enable row level security;
alter table public.instant_recipients enable row level security;
revoke all on public.instants, public.instant_recipients from anon, authenticated;   -- only through the functions below

create or replace function public.instant_sender_json(p public.profiles) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('userId', p.id, 'username', p.username, 'displayName', p.display_name,
                            'avatar', p.avatar, 'isVerified', p.is_verified);
$$;
revoke execute on function public.instant_sender_json(public.profiles) from public, anon, authenticated;

-- Share a photo taken with the camera. Returns how many people it went to.
create or replace function public.send_instant(p_media_url text, p_caption text default '', p_audience text default 'friends')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); inst public.instants; n int; who text;
begin
  if me is null or (select is_suspended from public.profiles where id = me) is not false then
    raise exception 'Please log in.' using errcode = '28000';
  end if;
  if p_audience not in ('friends', 'close_friends') then raise exception 'Choose Friends or Close Friends.'; end if;
  if p_media_url is null or p_media_url !~ '^instants/[A-Za-z0-9._-]+$' then raise exception 'Take a photo first.'; end if;
  if p_audience = 'close_friends' and not exists (
       select 1 from public.close_friends c where c.owner_id = me and c.friend_id in (select public.my_friend_ids(me))) then
    raise exception 'Add people to your Close Friends first.';
  end if;
  if p_audience = 'friends' and not exists (select 1 from public.my_friend_ids(me)) then
    raise exception 'You have no friends to share with yet — friends are people you follow who follow you back.';
  end if;
  insert into public.instants (user_id, media_url, caption, audience)
  values (me, p_media_url, left(btrim(coalesce(p_caption, '')), 100), p_audience)
  returning * into inst;
  insert into public.instant_recipients (instant_id, user_id)
  select inst.id, f from public.my_friend_ids(me) f
  where p_audience = 'friends' or f in (select c.friend_id from public.close_friends c where c.owner_id = me);
  get diagnostics n = row_count;
  -- tell them (it shows in notifications and, where switched on, as a phone notification)
  perform public.notify_user(r.user_id, 'instant', me, 'sent you an instant.')
  from public.instant_recipients r where r.instant_id = inst.id;
  return jsonb_build_object('success', true, 'id', inst.id, 'recipients', n, 'createdAt', inst.created_at);
end;
$$;

-- Take an instant back / delete it from your archive (it disappears for everyone).
create or replace function public.delete_instant(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); i public.instants;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into i from public.instants where id = p_id and user_id = me;
  if not found then raise exception 'That instant was not found.'; end if;
  -- its "sent you an instant" notifications (made in the same moment as the instant)
  delete from public.notifications where type = 'instant' and actor_id = me and created_at = i.created_at
    and target_user_id in (select user_id from public.instant_recipients where instant_id = p_id);
  delete from public.instants where id = p_id;
  return jsonb_build_object('success', true);
end;
$$;

-- Instants waiting for me (not opened, not expired), oldest first. The photo itself comes only with open_instant.
create or replace function public.my_instant_inbox() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', i.id, 'caption', i.caption, 'createdAt', i.created_at,
                     'sender', public.instant_sender_json(p)) order by i.created_at)
    from public.instant_recipients r
    join public.instants i on i.id = r.instant_id
    join public.profiles p on p.id = i.user_id
    where r.user_id = me and r.viewed_at is null and i.expires_at > now() and not p.is_suspended), '[]'::jsonb);
end;
$$;

-- Open an instant: it can be seen only once.
create or replace function public.open_instant(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); i public.instants; p public.profiles;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  update public.instant_recipients set viewed_at = now()
  where instant_id = p_id and user_id = me and viewed_at is null
    and exists (select 1 from public.instants x where x.id = p_id and x.expires_at > now());
  if not found then raise exception 'This instant is no longer available.'; end if;
  select * into i from public.instants where id = p_id;
  select * into p from public.profiles where id = i.user_id;
  return jsonb_build_object('success', true, 'instant', jsonb_build_object(
    'id', i.id, 'mediaUrl', i.media_url, 'caption', i.caption, 'createdAt', i.created_at, 'sender', public.instant_sender_json(p)));
end;
$$;

-- React to an instant you received (the sender is told). One reaction per person; reacting again changes it.
create or replace function public.react_instant(p_id uuid, p_emoji text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid; e text := btrim(coalesce(p_emoji, ''));
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if e = '' or char_length(e) > 8 then raise exception 'Pick an emoji.'; end if;
  update public.instant_recipients set reaction = e, reacted_at = now() where instant_id = p_id and user_id = me;
  if not found then raise exception 'This instant is no longer available.'; end if;
  select user_id into owner from public.instants where id = p_id;
  perform public.notify_user(owner, 'instant_reaction', me, 'reacted ' || e || ' to your instant.');
  return jsonb_build_object('success', true, 'reaction', e);
end;
$$;

-- My own instants (only I can see them), newest first, with who reacted.
create or replace function public.my_instants_archive(p_limit int default 200) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'mediaUrl', i.media_url, 'caption', i.caption, 'audience', i.audience,
      'createdAt', i.created_at, 'expiresAt', i.expires_at,
      'sentTo', (select count(*) from public.instant_recipients r where r.instant_id = i.id),
      'reactions', coalesce((select jsonb_agg(jsonb_build_object('username', p.username, 'emoji', r.reaction) order by r.reacted_at)
                             from public.instant_recipients r join public.profiles p on p.id = r.user_id
                             where r.instant_id = i.id and r.reaction is not null), '[]'::jsonb))
      order by i.created_at desc)
    from (select * from public.instants where user_id = me and created_at > now() - interval '365 days'
          order by created_at desc limit least(greatest(p_limit, 1), 500)) i), '[]'::jsonb);
end;
$$;

revoke execute on function public.my_close_friends(), public.set_close_friend(uuid, boolean),
  public.send_instant(text, text, text), public.delete_instant(uuid), public.my_instant_inbox(),
  public.open_instant(uuid), public.react_instant(uuid, text), public.my_instants_archive(int) from public, anon;
grant execute on function public.my_close_friends(), public.set_close_friend(uuid, boolean),
  public.send_instant(text, text, text), public.delete_instant(uuid), public.my_instant_inbox(),
  public.open_instant(uuid), public.react_instant(uuid, text), public.my_instants_archive(int) to authenticated;
