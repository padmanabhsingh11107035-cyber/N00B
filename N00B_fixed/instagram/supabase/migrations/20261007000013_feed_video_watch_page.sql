-- Backend for the new YouTube-style "watch page" for Feed video posts: dislikes (count visible to
-- the main admin ONLY — not even the post's own owner, matching the explicit spec this was built
-- to), a cross-content playlist system (reusing the long_video_playlists container introduced in
-- 20261006000014 so a playlist can hold Feed videos the same way it already holds NOOB Videos
-- uploads), and a lightweight "up next" feed of other video posts, people you follow first.

-- ===========================================================================
-- 1. Dislikes — a private signal, not a public pile-on list like post_likes intentionally is
-- ===========================================================================

create table public.post_dislikes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_dislikes_user_idx on public.post_dislikes (user_id);
alter table public.post_dislikes enable row level security;

-- Unlike post_likes_select (open to anyone who can see the post), only the disliker's own row and
-- the admin can ever be read back — nobody can browse who disliked what.
create policy post_dislikes_select on public.post_dislikes for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy post_dislikes_insert on public.post_dislikes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));
create policy post_dislikes_delete on public.post_dislikes for delete to authenticated
  using (user_id = auth.uid());
grant select, insert, delete on public.post_dislikes to authenticated;

alter table public.posts add column if not exists dislikes_count integer not null default 0;

create trigger post_dislikes_count after insert or delete on public.post_dislikes
  for each row execute function public.bump_counter('posts', 'dislikes_count', 'post_id');

create or replace function public.toggle_post_dislike(p_post uuid) returns jsonb
language plpgsql set search_path = public as $$
declare me uuid := auth.uid(); disliked boolean;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.posts where id = p_post) then raise exception 'Post not found'; end if;
  if exists (select 1 from public.post_dislikes where post_id = p_post and user_id = me) then
    delete from public.post_dislikes where post_id = p_post and user_id = me;
    disliked := false;
  else
    insert into public.post_dislikes (post_id, user_id) values (p_post, me);
    disliked := true;
    -- Can't like and dislike the same post at once — same rule every other platform uses.
    delete from public.post_likes where post_id = p_post and user_id = me;
  end if;
  return jsonb_build_object(
    'success', true, 'isDisliked', disliked,
    'isLiked', exists (select 1 from public.post_likes where post_id = p_post and user_id = me),
    'likesCount', (select likes_count from public.posts where id = p_post),
    'dislikesCount', case when public.is_admin() then (select dislikes_count from public.posts where id = p_post) else null end
  );
end;
$$;
grant execute on function public.toggle_post_dislike(uuid) to authenticated;

-- post_json() gains isDisliked (always, same as isLiked/isSaved) and dislikesCount (admin-only —
-- the real number is never sent down to a normal viewer, not even the post's own owner).
create or replace function public.post_json(p public.posts) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'userId', p.user_id, 'username', a.username, 'displayName', a.display_name,
    'userAvatar', a.avatar, 'isVerified', a.is_verified,
    'authorIsLiveAvatar', a.is_live_avatar, 'authorLiveAvatarVideoUrl', a.live_avatar_video_url,
    'caption', p.caption, 'location', p.location, 'createdAt', p.created_at,
    'slides', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'mediaUrl', s.media_url, 'objectKey', s.media_url, 'mediaType', s.media_type,
                                          'caption', s.caption, 'filter', s.filter, 'taggedUsers', s.tagged_users, 'productTags', s.product_tags,
                                          'stickers', s.stickers)
                       order by s.position)
      from public.post_slides s where s.post_id = p.id), '[]'::jsonb),
    'likesCount', p.likes_count, 'commentsCount', p.comments_count, 'sharesCount', p.shares_count, 'savesCount', p.saves_count,
    'isLiked', exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    'isSaved', exists (select 1 from public.post_saves sv where sv.post_id = p.id and sv.user_id = auth.uid()),
    'isDisliked', exists (select 1 from public.post_dislikes d where d.post_id = p.id and d.user_id = auth.uid()),
    'dislikesCount', case when public.is_admin() then p.dislikes_count else null end,
    'isPinnedToProfile', p.is_pinned_to_profile, 'isArchived', p.is_archived, 'isCommentsDisabled', p.is_comments_disabled,
    'isLikeCountHidden', p.is_like_count_hidden, 'isSponsored', p.is_sponsored, 'isCollab', p.is_collab,
    'collabUsername', p.collab_username, 'taggedUsers', p.tagged_users, 'hasAiLabel', p.has_ai_label,
    'hashtags', to_jsonb(p.hashtags), 'audioTrack', p.audio_track, 'category', p.category,
    'textBgStyle', p.text_bg_style, 'webLink', p.web_link, 'scheduledFor', p.scheduled_for
  )
  from public.profiles a where a.id = p.user_id;
$$;

-- ===========================================================================
-- 2. Playlists for Feed video posts — reuses the long_video_playlists container as-is (a playlist
--    is just "a named list of videos I own"; it doesn't care whether a video came from NOOB Videos
--    or the Feed), adding only a second item table for posts.
-- ===========================================================================

create table public.post_playlist_items (
  playlist_id uuid not null references public.long_video_playlists (id) on delete cascade,
  post_id     uuid not null references public.posts (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (playlist_id, post_id)
);
create index post_playlist_items_playlist_idx on public.post_playlist_items (playlist_id, created_at desc);
alter table public.post_playlist_items enable row level security;
create policy post_playlist_items_owner on public.post_playlist_items for select to authenticated
  using (exists (select 1 from public.long_video_playlists p where p.id = playlist_id and p.user_id = auth.uid()));
grant select on public.post_playlist_items to authenticated;

create or replace function public.fetch_my_post_playlists_with_membership(p_post_id uuid) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.name,
    'videosCount', (
      (select count(*) from public.long_video_playlist_items i where i.playlist_id = p.id) +
      (select count(*) from public.post_playlist_items i where i.playlist_id = p.id)
    ),
    'hasVideo', exists (select 1 from public.post_playlist_items i where i.playlist_id = p.id and i.post_id = p_post_id)
  ) order by p.created_at desc), '[]'::jsonb)
  from public.long_video_playlists p where p.user_id = auth.uid();
$$;
grant execute on function public.fetch_my_post_playlists_with_membership(uuid) to authenticated;

create or replace function public.toggle_post_in_playlist(p_playlist_id uuid, p_post_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); in_playlist boolean;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not exists (select 1 from public.long_video_playlists where id = p_playlist_id and user_id = me) then
    raise exception 'Playlist not found.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.posts where id = p_post_id) then raise exception 'Post not found'; end if;
  if exists (select 1 from public.post_playlist_items where playlist_id = p_playlist_id and post_id = p_post_id) then
    delete from public.post_playlist_items where playlist_id = p_playlist_id and post_id = p_post_id;
    in_playlist := false;
  else
    insert into public.post_playlist_items (playlist_id, post_id) values (p_playlist_id, p_post_id);
    in_playlist := true;
  end if;
  return jsonb_build_object('success', true, 'inPlaylist', in_playlist);
end;
$$;
grant execute on function public.toggle_post_in_playlist(uuid, uuid) to authenticated;

-- ===========================================================================
-- 3. "Up next" — other video posts, people you follow first, then random. Reuses can_view_author
--    so a private account's videos never leak into someone else's up-next list.
-- ===========================================================================

create or replace function public.feed_video_up_next(p_exclude_post_id uuid default null, p_limit int default 20) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(public.post_json(x.post)), '[]'::jsonb)
  from (
    select p as post
    from public.posts p
    where (p_exclude_post_id is null or p.id <> p_exclude_post_id)
      and not p.is_archived
      and exists (select 1 from public.post_slides s where s.post_id = p.id and s.media_type = 'video')
      and public.can_view_author(p.user_id)
    order by (exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.user_id)) desc, random()
    limit greatest(1, least(p_limit, 50))
  ) x;
$$;
grant execute on function public.feed_video_up_next(uuid, int) to authenticated;
