-- NOOB — gives reels the same owner controls posts already have: turn comments off, and hide the
-- like count from everyone but yourself. Purely additive; existing reels default to both off (comments
-- on, like count shown), exactly as they behave today.
alter table public.reels add column if not exists is_comments_disabled boolean not null default false;
alter table public.reels add column if not exists is_like_count_hidden boolean not null default false;

-- Comments RLS: the post branch already refused an insert once is_comments_disabled was set;
-- the reel branch never had the equivalent check, since reels never had the column at all.
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      (post_id is not null and exists (select 1 from public.posts p where p.id = post_id and not p.is_comments_disabled))
      or (reel_id is not null and exists (select 1 from public.reels r where r.id = reel_id and not r.is_comments_disabled))
    )
  );

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
    'taggedUsers', r.tagged_users, 'category', r.category,
    'isCommentsDisabled', r.is_comments_disabled, 'isLikeCountHidden', r.is_like_count_hidden)
  from public.profiles a where a.id = r.user_id;
$$;

create or replace function public.add_reel_comment(p_reel uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t text := btrim(coalesce(p_text, '')); cid uuid; owner uuid; disabled boolean;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if (select is_suspended from public.profiles where id = me) is not false then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if t = '' then raise exception 'Comment text cannot be empty'; end if;
  select user_id, is_comments_disabled into owner, disabled from public.reels where id = p_reel;
  if owner is null then raise exception 'Reel not found'; end if;
  if not public.can_view_author(owner) then raise exception 'You cannot view this reel.' using errcode = '42501'; end if;
  if disabled then raise exception 'Comments are turned off for this reel.' using errcode = '42501'; end if;
  insert into public.comments (reel_id, user_id, text) values (p_reel, me, t) returning id into cid;
  if owner <> me then
    perform public.notify_user(owner, 'post_comment', me,
      'commented on your reel: "' || left(t, 80) || case when length(t) > 80 then '…' else '' end || '"', null, null, p_reel);
  end if;
  perform public.award_points(me, 5, 'Commented on a reel');
  return jsonb_build_object('success', true, 'comment', (select public.comment_json(c) from public.comments c where c.id = cid));
end;
$$;

-- Same shape as toggle_post_flag: only the reel's own owner (or an admin, for moderation) may flip these.
create or replace function public.toggle_reel_flag(p_reel uuid, p_flag text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid; v boolean;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select user_id into owner from public.reels where id = p_reel;
  if owner is null then raise exception 'Reel not found'; end if;
  if owner <> me and not public.is_admin() then raise exception 'You can only modify your own reels.' using errcode = '42501'; end if;
  if p_flag = 'comments' then
    update public.reels set is_comments_disabled = not is_comments_disabled where id = p_reel returning is_comments_disabled into v;
    return jsonb_build_object('success', true, 'isCommentsDisabled', v);
  elsif p_flag = 'like_count' then
    update public.reels set is_like_count_hidden = not is_like_count_hidden where id = p_reel returning is_like_count_hidden into v;
    return jsonb_build_object('success', true, 'isLikeCountHidden', v);
  end if;
  raise exception 'Unknown reel setting.';
end;
$$;

revoke execute on function public.toggle_reel_flag(uuid, text) from public, anon;
grant execute on function public.toggle_reel_flag(uuid, text) to authenticated, service_role;
