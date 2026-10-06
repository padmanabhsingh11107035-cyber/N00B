-- Three new Feed (long-video) pages: History, Playlist, Liked Videos.
--
-- History: record_long_video_view already dedupes one row per (video, user) via a primary key, but
-- never refreshed created_at on a re-watch, so "most recently watched" would have actually sorted by
-- first-ever watch. Fixed with an ON CONFLICT ... DO UPDATE so created_at is always last-watched.
--
-- Liked Videos: long_video_likes already exists (toggle_long_video_like) but had no list RPC.
--
-- Playlist: "saved" videos (toggle_save_long_video / saved_long_videos, both already live, just never
-- shown anywhere) become the page's default section. Alongside that, users can create their own named
-- playlists and add/remove videos from them - two new tables, both owner-only.

create or replace function public.record_long_video_view(p_video uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cnt int;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  insert into public.long_video_views (video_id, user_id) values (p_video, me)
    on conflict (video_id, user_id) do update set created_at = now();
  select count(*) into cnt from public.long_video_views where video_id = p_video;
  update public.long_videos set views_count = cnt where id = p_video;
  return jsonb_build_object('success', true, 'viewsCount', cnt);
end;
$$;

create or replace function public.liked_long_videos() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(public.long_video_json(v) order by l.created_at desc), '[]'::jsonb)
  from public.long_video_likes l join public.long_videos v on v.id = l.video_id where l.user_id = auth.uid();
$$;
grant execute on function public.liked_long_videos() to authenticated;

create or replace function public.history_long_videos() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(public.long_video_json(v) order by h.created_at desc), '[]'::jsonb)
  from (select * from public.long_video_views where user_id = auth.uid() order by created_at desc limit 200) h
  join public.long_videos v on v.id = h.video_id;
$$;
grant execute on function public.history_long_videos() to authenticated;

-- ---------------------------------------------------------------------------------- playlists

create table public.long_video_playlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
create index long_video_playlists_user_idx on public.long_video_playlists (user_id);
alter table public.long_video_playlists enable row level security;
create policy long_video_playlists_owner on public.long_video_playlists for select to authenticated
  using (user_id = auth.uid());
grant select on public.long_video_playlists to authenticated;

create table public.long_video_playlist_items (
  playlist_id uuid not null references public.long_video_playlists (id) on delete cascade,
  video_id    uuid not null references public.long_videos (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (playlist_id, video_id)
);
create index long_video_playlist_items_playlist_idx on public.long_video_playlist_items (playlist_id, created_at desc);
alter table public.long_video_playlist_items enable row level security;
create policy long_video_playlist_items_owner on public.long_video_playlist_items for select to authenticated
  using (exists (select 1 from public.long_video_playlists p where p.id = playlist_id and p.user_id = auth.uid()));
grant select on public.long_video_playlist_items to authenticated;

create or replace function public.create_long_video_playlist(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pid uuid; nm text;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  nm := left(btrim(coalesce(p_name, '')), 60);
  if nm = '' then raise exception 'Give your playlist a name.'; end if;
  insert into public.long_video_playlists (user_id, name) values (me, nm) returning id into pid;
  return jsonb_build_object('success', true, 'id', pid, 'name', nm);
end;
$$;
grant execute on function public.create_long_video_playlist(text) to authenticated;

create or replace function public.rename_long_video_playlist(p_id uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); nm text;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  nm := left(btrim(coalesce(p_name, '')), 60);
  if nm = '' then raise exception 'Give your playlist a name.'; end if;
  if not exists (select 1 from public.long_video_playlists where id = p_id and user_id = me) then
    raise exception 'Playlist not found.' using errcode = '42501';
  end if;
  update public.long_video_playlists set name = nm where id = p_id;
  return jsonb_build_object('success', true);
end;
$$;
grant execute on function public.rename_long_video_playlist(uuid, text) to authenticated;

create or replace function public.delete_long_video_playlist(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  delete from public.long_video_playlists where id = p_id and user_id = me;
  return jsonb_build_object('success', true);
end;
$$;
grant execute on function public.delete_long_video_playlist(uuid) to authenticated;

create or replace function public.fetch_my_long_video_playlists() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.name, 'createdAt', p.created_at,
    'videosCount', (select count(*) from public.long_video_playlist_items i where i.playlist_id = p.id),
    'coverThumbnail', (
      select v.thumbnail_url from public.long_video_playlist_items i
      join public.long_videos v on v.id = i.video_id
      where i.playlist_id = p.id order by i.created_at desc limit 1
    )
  ) order by p.created_at desc), '[]'::jsonb)
  from public.long_video_playlists p where p.user_id = auth.uid();
$$;
grant execute on function public.fetch_my_long_video_playlists() to authenticated;

-- Same as above, plus whether p_video_id is already in each playlist - backs the "Add to Playlist" picker.
create or replace function public.fetch_my_long_video_playlists_with_membership(p_video_id uuid) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.name,
    'videosCount', (select count(*) from public.long_video_playlist_items i where i.playlist_id = p.id),
    'hasVideo', exists (select 1 from public.long_video_playlist_items i where i.playlist_id = p.id and i.video_id = p_video_id)
  ) order by p.created_at desc), '[]'::jsonb)
  from public.long_video_playlists p where p.user_id = auth.uid();
$$;
grant execute on function public.fetch_my_long_video_playlists_with_membership(uuid) to authenticated;

create or replace function public.fetch_long_video_playlist_items(p_playlist_id uuid) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(public.long_video_json(v) order by i.created_at desc), '[]'::jsonb)
  from public.long_video_playlist_items i
  join public.long_videos v on v.id = i.video_id
  where i.playlist_id = p_playlist_id
    and exists (select 1 from public.long_video_playlists p where p.id = p_playlist_id and p.user_id = auth.uid());
$$;
grant execute on function public.fetch_long_video_playlist_items(uuid) to authenticated;

create or replace function public.toggle_video_in_playlist(p_playlist_id uuid, p_video_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); in_playlist boolean;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not exists (select 1 from public.long_video_playlists where id = p_playlist_id and user_id = me) then
    raise exception 'Playlist not found.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.long_videos where id = p_video_id) then raise exception 'Video not found'; end if;
  if exists (select 1 from public.long_video_playlist_items where playlist_id = p_playlist_id and video_id = p_video_id) then
    delete from public.long_video_playlist_items where playlist_id = p_playlist_id and video_id = p_video_id;
    in_playlist := false;
  else
    insert into public.long_video_playlist_items (playlist_id, video_id) values (p_playlist_id, p_video_id);
    in_playlist := true;
  end if;
  return jsonb_build_object('success', true, 'inPlaylist', in_playlist);
end;
$$;
grant execute on function public.toggle_video_in_playlist(uuid, uuid) to authenticated;
