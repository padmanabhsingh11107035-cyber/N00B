-- NOOB — Supabase phase 2a: stories, highlights, reels, music, custom stickers, saved collections.
--
-- Same approach as phase 1: plain rows/policies for what row-level security already protects, and
-- functions (with their own permission checks) for anything that awards points, notifies someone,
-- enforces the daily posting limit, or must bypass RLS. Replies use the old server's JSON shapes.

-- ===========================================================================
-- 1. Tables
-- ===========================================================================

create table public.stories (
  id                     uuid primary key default gen_random_uuid(),
  legacy_id              text unique,
  user_id                uuid not null references public.profiles (id) on delete cascade,
  media_url              text not null,
  media_type             text not null default 'image' check (media_type in ('image', 'video')),
  duration_seconds       integer not null default 5,
  is_close_friends_only  boolean not null default false,
  filter                 text,
  stickers               jsonb not null default '[]',
  created_at             timestamptz not null default now(),
  expires_at             timestamptz not null default (now() + interval '24 hours')
);
create index stories_user_idx on public.stories (user_id, created_at desc);
create index stories_expiry_idx on public.stories (expires_at);

create table public.story_views (
  story_id   uuid not null references public.stories (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

create table public.story_comments (
  id         uuid primary key default gen_random_uuid(),
  story_id   uuid not null references public.stories (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  text       text not null check (length(text) between 1 and 500),
  created_at timestamptz not null default now()
);
create index story_comments_story_idx on public.story_comments (story_id, created_at);

create table public.highlights (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text not null,
  cover_url  text not null default '',
  story_ids  jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index highlights_user_idx on public.highlights (user_id, created_at desc);

create table public.music_tracks (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,
  uploader_id uuid not null references public.profiles (id) on delete cascade,
  title       text not null,
  artist      text not null default '',
  genre       text not null default 'Original / All Genres',
  audio_url   text not null,
  cover_url   text not null default '',
  duration    text not null default '3:00',
  likes_count integer not null default 0,
  plays_count integer not null default 0,
  created_at  timestamptz not null default now()
);
create table public.music_likes (
  track_id   uuid not null references public.music_tracks (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (track_id, user_id)
);

create table public.custom_stickers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  object_key text not null,
  title      text not null default 'My Sticker',
  created_at timestamptz not null default now()
);
create index custom_stickers_user_idx on public.custom_stickers (user_id, created_at desc);

create table public.collections (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  name             text not null default 'New Collection',
  cover_url        text not null default '',
  is_collaborative boolean not null default false,
  is_private       boolean not null default false,
  created_at       timestamptz not null default now()
);
create index collections_user_idx on public.collections (user_id, created_at desc);
create table public.collection_posts (
  collection_id uuid not null references public.collections (id) on delete cascade,
  post_id       uuid not null references public.posts (id) on delete cascade,
  added_at      timestamptz not null default now(),
  primary key (collection_id, post_id)
);

-- counter for music likes (same trigger helper as everything else)
create trigger music_likes_count after insert or delete on public.music_likes
  for each row execute function public.bump_counter('music_tracks', 'likes_count', 'track_id');

-- ===========================================================================
-- 2. Row-level security
-- ===========================================================================

alter table public.stories          enable row level security;
alter table public.story_views      enable row level security;
alter table public.story_comments   enable row level security;
alter table public.highlights       enable row level security;
alter table public.music_tracks     enable row level security;
alter table public.music_likes      enable row level security;
alter table public.custom_stickers  enable row level security;
alter table public.collections      enable row level security;
alter table public.collection_posts enable row level security;

-- Stories vanish after 24 hours for everyone but their author (and admins). Created only through
-- create_story(); the author (or admin) may delete.
create policy stories_select on public.stories for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or (expires_at > now() and public.can_view_author(user_id)));
create policy stories_delete on public.stories for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- You can see your OWN view records (so a story you watched shows as viewed); the story's owner sees everyone's.
create policy story_views_select on public.story_views for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or exists (select 1 from public.stories s where s.id = story_id and s.user_id = auth.uid()));
create policy story_comments_select on public.story_comments for select to authenticated
  using (exists (select 1 from public.stories s where s.id = story_id));
create policy story_comments_delete on public.story_comments for delete to authenticated
  using (user_id = auth.uid() or public.is_admin() or exists (select 1 from public.stories s where s.id = story_id and s.user_id = auth.uid()));

create policy highlights_select on public.highlights for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or public.can_view_author(user_id));
create policy highlights_owner_write on public.highlights for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy music_tracks_select on public.music_tracks for select to authenticated using (true);
create policy music_tracks_delete on public.music_tracks for delete to authenticated
  using (uploader_id = auth.uid() or public.is_admin());
create policy music_likes_select on public.music_likes for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy music_likes_insert on public.music_likes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.music_tracks t where t.id = track_id));
create policy music_likes_delete on public.music_likes for delete to authenticated using (user_id = auth.uid());

create policy custom_stickers_owner on public.custom_stickers for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy collections_owner on public.collections for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy collection_posts_owner on public.collection_posts for all to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid()))
  with check (
    exists (select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid())
    and exists (select 1 from public.posts p where p.id = post_id)
  );

-- Same for reels: your own views (your watch history) are yours to read; the reel's owner sees everyone's.
drop policy reel_views_select on public.reel_views;
create policy reel_views_select on public.reel_views for select to authenticated
  using (user_id = auth.uid() or public.is_admin() or exists (select 1 from public.reels r where r.id = reel_id and r.user_id = auth.uid()));

-- Reels are published through create_reel() (daily limit, points) — no direct inserts.
drop policy reels_insert on public.reels;
revoke insert on public.reels from authenticated;

-- A reel's owner may also remove comments on their reel (like a post owner already can).
drop policy comments_delete on public.comments;
create policy comments_delete on public.comments for delete to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid())
    or exists (select 1 from public.reels r where r.id = reel_id and r.user_id = auth.uid())
  );

-- ===========================================================================
-- 3. Table privileges (explicit, least privilege)
-- ===========================================================================
grant select, delete                 on public.stories          to authenticated;
grant select                         on public.story_views      to authenticated;
grant select, delete                 on public.story_comments   to authenticated;
grant select, insert, update, delete on public.highlights       to authenticated;
grant select, delete                 on public.music_tracks     to authenticated;
grant select, insert, delete         on public.music_likes      to authenticated;
grant select, insert, update, delete on public.custom_stickers  to authenticated;
grant select, insert, update, delete on public.collections      to authenticated;
grant select, insert, delete         on public.collection_posts to authenticated;
grant all on public.stories, public.story_views, public.story_comments, public.highlights, public.music_tracks,
             public.music_likes, public.custom_stickers, public.collections, public.collection_posts to service_role;

-- ===========================================================================
-- 4. Comments: reels share the comment shape (postId carries the reel id, as before)
-- ===========================================================================
create or replace function public.comment_json(c public.comments) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'postId', coalesce(c.post_id, c.reel_id), 'reelId', c.reel_id, 'userId', c.user_id, 'username', a.username,
    'userAvatar', a.avatar, 'isVerified', a.is_verified, 'text', c.text, 'likesCount', c.likes_count,
    'isLiked', false, 'isPinned', c.is_pinned, 'createdAt', c.created_at)
  from public.profiles a where a.id = c.user_id;
$$;

create or replace function public.toggle_pin_comment(p_comment uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.comments; owner uuid; v boolean;
begin
  select * into c from public.comments where id = p_comment;
  if not found then return jsonb_build_object('success', true, 'isPinned', false); end if;
  select coalesce((select user_id from public.posts where id = c.post_id), (select user_id from public.reels where id = c.reel_id)) into owner;
  if me is null or (owner is distinct from me and not public.is_admin()) then
    raise exception 'Only the owner can pin comments.' using errcode = '42501';
  end if;
  update public.comments set is_pinned = not is_pinned where id = p_comment returning is_pinned into v;
  return jsonb_build_object('success', true, 'isPinned', v);
end;
$$;

-- ===========================================================================
-- 5. Stories
-- ===========================================================================
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
    'filter', s.filter, 'stickers', s.stickers,
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'username', cu.username, 'userAvatar', cu.avatar, 'text', c.text, 'createdAt', c.created_at) order by c.created_at)
      from public.story_comments c join public.profiles cu on cu.id = c.user_id where c.story_id = s.id), '[]'::jsonb))
  from public.profiles a where a.id = s.user_id;
$$;

create or replace function public.active_stories() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(public.story_json(x.st) order by (x.st).created_at desc), '[]'::jsonb)
  from (select st from public.stories st where st.expires_at > now() order by st.created_at desc limit 300) x;
$$;

create or replace function public.create_story(p_media_url text, p_media_type text default 'image', p_stickers jsonb default '[]', p_close_friends boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); sid uuid;
begin
  if me is null or (select is_suspended from public.profiles where id = me) is not false then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if coalesce(btrim(p_media_url), '') = '' then raise exception 'A story needs a picture or video.'; end if;
  insert into public.stories (user_id, media_url, media_type, stickers, is_close_friends_only)
  values (me, p_media_url, case when p_media_type = 'video' then 'video' else 'image' end, coalesce(p_stickers, '[]'::jsonb), coalesce(p_close_friends, false))
  returning id into sid;
  return (select public.story_json(s) from public.stories s where s.id = sid);
end;
$$;

create or replace function public.record_story_view(p_story uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid;
begin
  select user_id into owner from public.stories where id = p_story and expires_at > now();
  if owner is null then raise exception 'Story not found' using errcode = 'P0002'; end if;
  if me is not null and me <> owner and public.can_view_author(owner) then
    insert into public.story_views (story_id, user_id) values (p_story, me) on conflict do nothing;
  end if;
  return jsonb_build_object('success', true, 'viewsCount', (select count(*) from public.story_views where story_id = p_story));
end;
$$;

create or replace function public.story_viewers(p_story uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from public.stories where id = p_story;
  if owner is null then raise exception 'Story not found'; end if;
  if owner <> auth.uid() then raise exception 'Only the story owner can see who viewed it.' using errcode = '42501'; end if;
  return jsonb_build_object('users', coalesce((
    select jsonb_agg(public.user_public_json(pr) order by v.created_at desc)
    from public.story_views v join public.profiles pr on pr.id = v.user_id where v.story_id = p_story), '[]'::jsonb));
end;
$$;

create or replace function public.add_story_comment(p_story uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t text := left(btrim(coalesce(p_text, '')), 500); owner uuid; cid uuid; who public.profiles;
begin
  if me is null then raise exception 'Please log in to comment.' using errcode = '28000'; end if;
  if t = '' then raise exception 'Comment cannot be empty.'; end if;
  select user_id into owner from public.stories where id = p_story and expires_at > now();
  if owner is null then raise exception 'Story not found or has expired.'; end if;
  if not public.can_view_author(owner) then raise exception 'You cannot view this story.' using errcode = '42501'; end if;
  insert into public.story_comments (story_id, user_id, text) values (p_story, me, t) returning id into cid;
  select * into who from public.profiles where id = me;
  return jsonb_build_object('success', true, 'comment', jsonb_build_object(
    'id', cid, 'username', who.username, 'userAvatar', who.avatar, 'text', t, 'createdAt', now()));
end;
$$;

create or replace function public.my_highlights() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'title', h.title, 'coverUrl', h.cover_url, 'storyIds', h.story_ids) order by h.created_at desc), '[]'::jsonb)
  from public.highlights h where h.user_id = auth.uid();
$$;

create or replace function public.create_highlight(p_title text, p_cover_url text, p_story_ids jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); hid uuid;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if btrim(coalesce(p_title, '')) = '' then raise exception 'A highlight needs a title.'; end if;
  insert into public.highlights (user_id, title, cover_url, story_ids)
  values (me, btrim(p_title), coalesce(p_cover_url, ''), coalesce(p_story_ids, '[]'::jsonb)) returning id into hid;
  return jsonb_build_object('success', true, 'highlight', jsonb_build_object('id', hid, 'title', btrim(p_title), 'coverUrl', coalesce(p_cover_url, ''), 'storyIds', coalesce(p_story_ids, '[]'::jsonb)));
end;
$$;

-- Removes stories past their 24 hours (their files are cleaned up separately).
create or replace function public.cleanup_expired_stories() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.stories where expires_at < now() - interval '1 hour';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ===========================================================================
-- 6. Reels
-- ===========================================================================
create or replace function public.reel_json(r public.reels) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'userId', r.user_id, 'username', a.username, 'userAvatar', a.avatar, 'isVerified', a.is_verified,
    'videoUrl', r.video_url, 'thumbnailUrl', r.thumbnail_url, 'caption', r.caption,
    'audioTrack', jsonb_build_object('title', coalesce(r.audio_title, 'Original Sound'), 'artist', coalesce(r.audio_artist, a.username), 'coverUrl', r.audio_cover_url),
    'likesCount', r.likes_count, 'commentsCount', r.comments_count, 'sharesCount', r.shares_count,
    'savesCount', r.saves_count, 'viewsCount', r.views_count,
    'isLiked', exists (select 1 from public.reel_likes l where l.reel_id = r.id and l.user_id = auth.uid()),
    'isSaved', exists (select 1 from public.reel_saves s where s.reel_id = r.id and s.user_id = auth.uid()),
    'isFollowing', exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = r.user_id),
    'hashtags', to_jsonb(r.hashtags), 'createdAt', r.created_at, 'durationSeconds', coalesce(r.duration_seconds, 15),
    'webLink', r.web_link, 'isTrialReel', r.is_trial_reel, 'isCollab', r.is_collab, 'collabUsername', r.collab_username,
    'taggedUsers', r.tagged_users, 'category', r.category)
  from public.profiles a where a.id = r.user_id;
$$;

create or replace function public.feed_reels(p_limit integer default 100) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(public.reel_json(x.re) order by (x.re).created_at desc), '[]'::jsonb)
  from (select re from public.reels re order by re.created_at desc limit least(greatest(p_limit, 1), 300)) x;
$$;

create or replace function public.reel_history() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(public.reel_json(r) order by v.created_at desc), '[]'::jsonb)
  from (select * from public.reel_views where user_id = auth.uid() order by created_at desc limit 100) v
  join public.reels r on r.id = v.reel_id;
$$;

-- Free accounts get one post OR reel a day (shared with posts); +25 points.
create or replace function public.create_reel(
  p_video_url text, p_thumbnail_url text default '', p_caption text default '', p_audio jsonb default null,
  p_hashtags text[] default '{}', p_category text default 'others'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); prof public.profiles; last_post timestamptz; rid uuid := gen_random_uuid();
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select * into prof from public.profiles where id = me;
  if not found or prof.is_suspended then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if coalesce(btrim(p_video_url), '') = '' then raise exception 'A reel needs a video.'; end if;

  if prof.pro_tier is null then
    last_post := nullif(prof.extra->>'lastContentPostAt', '')::timestamptz;
    if last_post is not null and now() - last_post < interval '24 hours' then
      raise exception 'Free accounts can publish one post or reel per day. Upgrade to NOOB Pro for unlimited posting.'
        using errcode = 'P0001', detail = to_char((last_post + interval '24 hours') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    end if;
  end if;

  insert into public.reels (id, user_id, video_url, thumbnail_url, caption, audio_title, audio_artist, audio_cover_url, hashtags, category, views_count, duration_seconds)
  values (rid, me, p_video_url, nullif(p_thumbnail_url, ''), coalesce(p_caption, ''),
          coalesce(nullif(p_audio->>'title', ''), 'Original Sound'), coalesce(nullif(p_audio->>'artist', ''), prof.username), nullif(p_audio->>'coverUrl', ''),
          coalesce(p_hashtags, '{}'), coalesce(nullif(p_category, ''), 'others'), 1, 15);

  update public.profiles set extra = jsonb_set(extra, '{lastContentPostAt}', to_jsonb(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) where id = me;
  perform public.award_points(me, 25, 'Published a reel');
  return (select public.reel_json(r) from public.reels r where r.id = rid);
end;
$$;

create or replace function public.toggle_reel_like(p_reel uuid) returns jsonb
language plpgsql set search_path = public as $$
declare me uuid := auth.uid(); liked boolean;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.reels where id = p_reel) then raise exception 'Reel not found'; end if;
  if exists (select 1 from public.reel_likes where reel_id = p_reel and user_id = me) then
    delete from public.reel_likes where reel_id = p_reel and user_id = me; liked := false;
  else
    insert into public.reel_likes (reel_id, user_id) values (p_reel, me); liked := true;
  end if;
  return jsonb_build_object('success', true, 'isLiked', liked, 'likesCount', (select likes_count from public.reels where id = p_reel));
end;
$$;

create or replace function public.notify_reel_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare author uuid;
begin
  if new.created_at < now() - interval '2 minutes' then return null; end if;   -- imported history never re-notifies
  select user_id into author from public.reels where id = new.reel_id;
  if author is not null and author <> new.user_id then
    perform public.notify_user(author, 'post_like', new.user_id, 'liked your reel.', null, null, new.reel_id);
  end if;
  return null;
end;
$$;
create trigger reel_likes_notify after insert on public.reel_likes
  for each row execute function public.notify_reel_like();

create or replace function public.toggle_reel_save(p_reel uuid) returns jsonb
language plpgsql set search_path = public as $$
declare me uuid := auth.uid(); saved boolean;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.reels where id = p_reel) then raise exception 'Reel not found'; end if;
  if exists (select 1 from public.reel_saves where reel_id = p_reel and user_id = me) then
    delete from public.reel_saves where reel_id = p_reel and user_id = me; saved := false;
  else
    insert into public.reel_saves (reel_id, user_id) values (p_reel, me); saved := true;
  end if;
  return jsonb_build_object('success', true, 'isSaved', saved, 'savesCount', (select saves_count from public.reels where id = p_reel));
end;
$$;

create or replace function public.reel_likers(p_reel uuid) returns jsonb
language plpgsql stable set search_path = public as $$
begin
  if not exists (select 1 from public.reels where id = p_reel) then raise exception 'You cannot view this reel.' using errcode = '42501'; end if;
  return jsonb_build_object('users', coalesce((
    select jsonb_agg(public.user_public_json(pr) order by l.created_at desc)
    from public.reel_likes l join public.profiles pr on pr.id = l.user_id where l.reel_id = p_reel), '[]'::jsonb));
end;
$$;

create or replace function public.reel_viewers(p_reel uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from public.reels where id = p_reel;
  if owner is null then raise exception 'Reel not found'; end if;
  if owner <> auth.uid() then raise exception 'Only the reel owner can see who viewed it.' using errcode = '42501'; end if;
  return jsonb_build_object('users', coalesce((
    select jsonb_agg(public.user_public_json(pr) order by v.created_at desc)
    from public.reel_views v join public.profiles pr on pr.id = v.user_id where v.reel_id = p_reel), '[]'::jsonb));
end;
$$;

-- Every watch bumps the counter; the watcher joins the (unique) viewer list and moves to the top of THEIR history.
create or replace function public.record_reel_view(p_reel uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid; views integer;
begin
  select user_id into owner from public.reels where id = p_reel;
  if owner is null then raise exception 'Reel not found'; end if;
  if not public.can_view_author(owner) then raise exception 'You cannot view this reel.' using errcode = '42501'; end if;
  update public.reels set views_count = views_count + 1 where id = p_reel returning views_count into views;
  if me is not null then
    insert into public.reel_views (reel_id, user_id) values (p_reel, me)
    on conflict (reel_id, user_id) do update set created_at = now();
  end if;
  return jsonb_build_object('success', true, 'viewsCount', views);
end;
$$;

create or replace function public.reel_comments(p_reel uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('comments', coalesce(jsonb_agg(public.comment_json(c) order by c.created_at desc), '[]'::jsonb))
  from public.comments c where c.reel_id = p_reel;
$$;

create or replace function public.add_reel_comment(p_reel uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t text := btrim(coalesce(p_text, '')); cid uuid; owner uuid;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if (select is_suspended from public.profiles where id = me) is not false then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if t = '' then raise exception 'Comment text cannot be empty'; end if;
  select user_id into owner from public.reels where id = p_reel;
  if owner is null then raise exception 'Reel not found'; end if;
  if not public.can_view_author(owner) then raise exception 'You cannot view this reel.' using errcode = '42501'; end if;
  insert into public.comments (reel_id, user_id, text) values (p_reel, me, t) returning id into cid;
  if owner <> me then
    perform public.notify_user(owner, 'post_comment', me,
      'commented on your reel: "' || left(t, 80) || case when length(t) > 80 then '…' else '' end || '"', null, null, p_reel);
  end if;
  perform public.award_points(me, 5, 'Commented on a reel');
  return jsonb_build_object('success', true, 'comment', (select public.comment_json(c) from public.comments c where c.id = cid));
end;
$$;

-- ===========================================================================
-- 7. Music
-- ===========================================================================
create or replace function public.music_json(t public.music_tracks) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'title', t.title, 'artist', t.artist, 'genre', t.genre, 'audioUrl', t.audio_url, 'coverUrl', t.cover_url,
    'duration', t.duration, 'uploaderId', t.uploader_id, 'uploaderUsername', u.username, 'uploaderAvatar', u.avatar,
    'likesCount', t.likes_count, 'playsCount', t.plays_count,
    'isLiked', exists (select 1 from public.music_likes l where l.track_id = t.id and l.user_id = auth.uid()),
    'createdAt', t.created_at)
  from public.profiles u where u.id = t.uploader_id;
$$;

create or replace function public.list_music_tracks() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(public.music_json(t) order by t.created_at desc), '[]'::jsonb) from public.music_tracks t;
$$;

create or replace function public.upload_music_track(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); prof public.profiles; tid uuid;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select * into prof from public.profiles where id = me;
  if btrim(coalesce(p->>'title', '')) = '' or coalesce(p->>'audioUrl', '') = '' then
    raise exception 'Track title and audio file are required';
  end if;
  insert into public.music_tracks (uploader_id, title, artist, genre, audio_url, cover_url, duration)
  values (me, btrim(p->>'title'), btrim(coalesce(nullif(p->>'artist', ''), nullif(prof.display_name, ''), prof.username)),
          coalesce(nullif(p->>'genre', ''), 'Original / All Genres'), p->>'audioUrl',
          coalesce(nullif(p->>'coverUrl', ''), 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&auto=format&fit=crop&q=80'),
          coalesce(nullif(p->>'duration', ''), '3:00'))
  returning id into tid;
  return jsonb_build_object('success', true, 'track', (select public.music_json(t) from public.music_tracks t where t.id = tid));
end;
$$;

create or replace function public.rename_music_track(p_track uuid, p_title text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid; t text := left(btrim(coalesce(p_title, '')), 100);
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select uploader_id into owner from public.music_tracks where id = p_track;
  if owner is null then raise exception 'Track not found'; end if;
  if owner <> me then raise exception 'Only the publisher who uploaded this track can rename it.' using errcode = '42501'; end if;
  if t = '' then raise exception 'Track title cannot be empty.'; end if;
  update public.music_tracks set title = t where id = p_track;
  return jsonb_build_object('success', true, 'track', (select public.music_json(x) from public.music_tracks x where x.id = p_track));
end;
$$;

create or replace function public.toggle_music_like(p_track uuid) returns jsonb
language plpgsql set search_path = public as $$
declare me uuid := auth.uid(); liked boolean;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.music_tracks where id = p_track) then raise exception 'Track not found'; end if;
  if exists (select 1 from public.music_likes where track_id = p_track and user_id = me) then
    delete from public.music_likes where track_id = p_track and user_id = me; liked := false;
  else
    insert into public.music_likes (track_id, user_id) values (p_track, me); liked := true;
  end if;
  return jsonb_build_object('success', true, 'isLiked', liked, 'likesCount', (select likes_count from public.music_tracks where id = p_track));
end;
$$;

-- ===========================================================================
-- 8. Custom stickers and saved collections
-- ===========================================================================
create or replace function public.my_stickers() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'url', s.object_key) order by s.created_at desc), '[]'::jsonb)
  from public.custom_stickers s where s.user_id = auth.uid();
$$;

create or replace function public.add_sticker(p_key text, p_title text default null) returns jsonb
language plpgsql set search_path = public as $$
declare me uuid := auth.uid(); sid uuid;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if btrim(coalesce(p_key, '')) = '' then raise exception 'No uploaded sticker reference provided.'; end if;
  insert into public.custom_stickers (user_id, object_key, title)
  values (me, btrim(p_key), coalesce(nullif(btrim(p_title), ''), 'My Sticker')) returning id into sid;
  return jsonb_build_object('success', true, 'sticker', jsonb_build_object('id', sid, 'title', coalesce(nullif(btrim(p_title), ''), 'My Sticker')));
end;
$$;

create or replace function public.collection_json(c public.collections) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'name', c.name,
    'coverUrl', coalesce(nullif(c.cover_url, ''), 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=80'),
    'postsCount', (select count(*) from public.collection_posts cp where cp.collection_id = c.id),
    'postIds', coalesce((select jsonb_agg(cp.post_id order by cp.added_at desc) from public.collection_posts cp where cp.collection_id = c.id), '[]'::jsonb),
    'isCollaborative', c.is_collaborative, 'isPrivate', c.is_private);
$$;

create or replace function public.my_collections() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(public.collection_json(c) order by c.created_at desc), '[]'::jsonb)
  from public.collections c where c.user_id = auth.uid();
$$;

create or replace function public.create_collection(p_name text default null, p_cover_url text default null) returns jsonb
language plpgsql set search_path = public as $$
declare me uuid := auth.uid(); cid uuid;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  insert into public.collections (user_id, name, cover_url)
  values (me, coalesce(nullif(btrim(p_name), ''), 'New Collection'), coalesce(p_cover_url, '')) returning id into cid;
  return jsonb_build_object('success', true, 'collection', (select public.collection_json(c) from public.collections c where c.id = cid));
end;
$$;

create or replace function public.add_post_to_collection(p_collection uuid, p_post uuid) returns jsonb
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.collections where id = p_collection and user_id = auth.uid()) then raise exception 'Collection not found'; end if;
  insert into public.collection_posts (collection_id, post_id) values (p_collection, p_post) on conflict do nothing;
  return jsonb_build_object('success', true, 'collection', (select public.collection_json(c) from public.collections c where c.id = p_collection));
end;
$$;

-- ===========================================================================
-- 9. Who may call what (same rule as before: signed-in only; internal helpers stay private)
-- ===========================================================================
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.resolve_login_email(text), public.username_taken(text), public.check_signup(jsonb) to anon;
revoke execute on function public.award_points(uuid, bigint, text) from authenticated;
revoke execute on function public.notify_user(uuid, text, uuid, text, text, uuid, uuid, uuid, text) from authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.notify_post_like() from authenticated;
revoke execute on function public.notify_reel_like() from authenticated;
revoke execute on function public.bump_counter() from authenticated;
revoke execute on function public.guard_inline_media() from authenticated;
revoke execute on function public.cleanup_expired_stories() from authenticated;
