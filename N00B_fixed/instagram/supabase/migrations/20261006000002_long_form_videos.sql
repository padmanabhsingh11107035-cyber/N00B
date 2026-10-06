-- Long-form video "Home" feed — a YouTube-style upload (up to 2 hours, optional thumbnail), kept
-- entirely separate from reels (its own table, its own feed function) so nothing here can ever leak
-- into feed_reels() or be mistaken for a reel by any existing query.

create table public.long_videos (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  video_url        text not null,
  thumbnail_url    text,
  title            text not null default '',
  description      text not null default '',
  duration_seconds integer not null,
  -- counters (protected, see the guard trigger below)
  likes_count      integer not null default 0,
  views_count      integer not null default 0,
  created_at       timestamptz not null default now(),
  check (duration_seconds > 0 and duration_seconds <= 7200)   -- server-side backstop for the 2h cap
);
create index long_videos_created_idx on public.long_videos (created_at desc);
create index long_videos_user_created_idx on public.long_videos (user_id, created_at desc);

create table public.long_video_likes (
  video_id   uuid not null references public.long_videos (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (video_id, user_id)
);

create table public.long_video_views (
  video_id   uuid not null references public.long_videos (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (video_id, user_id)
);

alter table public.long_videos enable row level security;
alter table public.long_video_likes enable row level security;
alter table public.long_video_views enable row level security;

create policy long_videos_select on public.long_videos for select to authenticated
  using (public.can_view_author(user_id));
create policy long_videos_insert on public.long_videos for insert to authenticated
  with check (user_id = auth.uid());
create policy long_videos_delete on public.long_videos for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy long_video_likes_select on public.long_video_likes for select to authenticated
  using (exists (select 1 from public.long_videos v where v.id = video_id));
create policy long_video_likes_insert on public.long_video_likes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.long_videos v where v.id = video_id));
create policy long_video_likes_delete on public.long_video_likes for delete to authenticated
  using (user_id = auth.uid());

create policy long_video_views_insert on public.long_video_views for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.long_videos v where v.id = video_id));

grant select, insert, delete on public.long_videos to authenticated;
grant select, insert, delete on public.long_video_likes to authenticated;
grant select, insert on public.long_video_views to authenticated;

-- Same protected-columns pattern as reels_guard: id/user_id/created_at and every counter are fixed
-- from the client's point of view — only the security-definer RPCs below may change them.
create or replace function public.guard_long_video_columns() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id is distinct from old.id
       or new.user_id is distinct from old.user_id
       or new.created_at is distinct from old.created_at
       or new.likes_count is distinct from old.likes_count
       or new.views_count is distinct from old.views_count then
      raise exception 'You can''t change protected video fields.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger long_videos_guard before update on public.long_videos
  for each row execute function public.guard_long_video_columns();

create or replace function public.long_video_json(v public.long_videos) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', v.id, 'userId', v.user_id, 'username', a.username, 'userAvatar', a.avatar, 'isVerified', a.is_verified,
    'videoUrl', v.video_url, 'thumbnailUrl', v.thumbnail_url, 'title', v.title, 'description', v.description,
    'durationSeconds', v.duration_seconds, 'likesCount', v.likes_count, 'viewsCount', v.views_count,
    'isLiked', exists (select 1 from public.long_video_likes l where l.video_id = v.id and l.user_id = auth.uid()),
    'createdAt', v.created_at)
  from public.profiles a where a.id = v.user_id;
$$;

create or replace function public.feed_long_videos(p_limit integer default 30) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(public.long_video_json(x.v) order by (x.v).created_at desc), '[]'::jsonb)
  from (select v from public.long_videos v where public.can_view_author(v.user_id)
        order by v.created_at desc limit least(greatest(p_limit, 1), 100)) x;
$$;

create or replace function public.create_long_video(
  p_video_url text, p_thumbnail_url text default null, p_title text default '',
  p_description text default '', p_duration_seconds integer default 0
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); vid uuid;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if (select is_suspended from public.profiles where id = me) is not false then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if coalesce(btrim(p_video_url), '') = '' then raise exception 'A video is required.'; end if;
  if coalesce(p_duration_seconds, 0) <= 0 or p_duration_seconds > 7200 then
    raise exception 'Videos must be longer than 0 seconds and no more than 2 hours.';
  end if;
  insert into public.long_videos (user_id, video_url, thumbnail_url, title, description, duration_seconds)
    values (me, btrim(p_video_url), nullif(btrim(coalesce(p_thumbnail_url, '')), ''), left(btrim(coalesce(p_title, '')), 150),
            left(btrim(coalesce(p_description, '')), 2000), p_duration_seconds)
    returning id into vid;
  perform public.award_points(me, 25, 'Uploaded a video');
  return jsonb_build_object('success', true, 'video', (select public.long_video_json(v) from public.long_videos v where v.id = vid));
end;
$$;

create or replace function public.toggle_long_video_like(p_video uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid; was_liked boolean; cnt int;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select user_id into owner from public.long_videos where id = p_video;
  if owner is null then raise exception 'Video not found.'; end if;
  if not public.can_view_author(owner) then raise exception 'You cannot view this video.' using errcode = '42501'; end if;
  select exists (select 1 from public.long_video_likes where video_id = p_video and user_id = me) into was_liked;
  if was_liked then
    delete from public.long_video_likes where video_id = p_video and user_id = me;
  else
    insert into public.long_video_likes (video_id, user_id) values (p_video, me) on conflict do nothing;
  end if;
  select count(*) into cnt from public.long_video_likes where video_id = p_video;
  update public.long_videos set likes_count = cnt where id = p_video;
  return jsonb_build_object('success', true, 'isLiked', not was_liked, 'likesCount', cnt);
end;
$$;

create or replace function public.record_long_video_view(p_video uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cnt int;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  insert into public.long_video_views (video_id, user_id) values (p_video, me) on conflict do nothing;
  select count(*) into cnt from public.long_video_views where video_id = p_video;
  update public.long_videos set views_count = cnt where id = p_video;
  return jsonb_build_object('success', true, 'viewsCount', cnt);
end;
$$;

create or replace function public.delete_long_video(p_video uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select user_id into owner from public.long_videos where id = p_video;
  if owner is null then raise exception 'Video not found.'; end if;
  if owner <> me and not public.is_admin() then raise exception 'You can only delete your own videos.' using errcode = '42501'; end if;
  delete from public.long_videos where id = p_video;
  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.guard_long_video_columns() from authenticated;
grant execute on function public.long_video_json(public.long_videos) to authenticated;
grant execute on function public.feed_long_videos(integer) to authenticated;
grant execute on function public.create_long_video(text, text, text, text, integer) to authenticated;
grant execute on function public.toggle_long_video_like(uuid) to authenticated;
grant execute on function public.record_long_video_view(uuid) to authenticated;
grant execute on function public.delete_long_video(uuid) to authenticated;
