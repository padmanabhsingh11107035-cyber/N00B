-- NOOB — reels can now carry a real playable audio URL for their attached track (a NOOB Songs
-- library pick, or your own recorded clip), not just the title/artist/cover text that was already
-- there. Posts and Stories already store their whole audioTrack/music-sticker object as flexible
-- jsonb and needed no schema change for this; reels decompose it into fixed columns, so audio_url
-- is a genuinely new column.

alter table public.reels add column if not exists audio_url text;

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

  insert into public.reels (id, user_id, video_url, thumbnail_url, caption, audio_title, audio_artist, audio_cover_url, audio_url, hashtags, category, views_count, duration_seconds)
  values (rid, me, p_video_url, nullif(p_thumbnail_url, ''), coalesce(p_caption, ''),
          coalesce(nullif(p_audio->>'title', ''), 'Original Sound'), coalesce(nullif(p_audio->>'artist', ''), prof.username),
          nullif(p_audio->>'coverUrl', ''), nullif(p_audio->>'audioUrl', ''),
          coalesce(p_hashtags, '{}'), coalesce(nullif(p_category, ''), 'others'), 1, 15);

  update public.profiles set extra = jsonb_set(extra, '{lastContentPostAt}', to_jsonb(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) where id = me;
  perform public.award_points(me, 25, 'Published a reel');
  return (select public.reel_json(r) from public.reels r where r.id = rid);
end;
$$;

-- reel_json: unchanged except audioTrack now also carries audioUrl.
create or replace function public.reel_json(r public.reels) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'userId', r.user_id, 'username', a.username, 'userAvatar', a.avatar, 'isVerified', a.is_verified,
    'authorIsLiveAvatar', a.is_live_avatar, 'authorLiveAvatarVideoUrl', a.live_avatar_video_url,
    'videoUrl', r.video_url, 'thumbnailUrl', r.thumbnail_url, 'caption', r.caption,
    'audioTrack', jsonb_build_object('title', coalesce(r.audio_title, 'Original Sound'), 'artist', coalesce(r.audio_artist, a.username), 'coverUrl', r.audio_cover_url, 'audioUrl', r.audio_url),
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
