-- ROLLBACK of 20261114000022_gapb_stage2b_post_reel_video.sql (not a migration: run by hand in the SQL editor only if that stage has to be undone; it restores the previous definitions exactly).
-- Do not run before the later stages are rolled back too (newest first), and never while the row rule of stage 5 is on.
begin;

create or replace function public.post_json(p posts)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$;

create or replace function public.reel_json(r reels)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$;

create or replace function public.long_video_json(v long_videos)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', v.id, 'userId', v.user_id, 'username', a.username, 'userAvatar', a.avatar, 'isVerified', a.is_verified,
    'videoUrl', v.video_url, 'thumbnailUrl', v.thumbnail_url, 'title', v.title, 'description', v.description,
    'durationSeconds', v.duration_seconds, 'likesCount', v.likes_count, 'viewsCount', v.views_count,
    'commentsCount', v.comments_count, 'savesCount', v.saves_count,
    'isCommentsDisabled', v.is_comments_disabled, 'isLikeCountHidden', v.is_like_count_hidden,
    'isLiked', exists (select 1 from public.long_video_likes l where l.video_id = v.id and l.user_id = auth.uid()),
    'isSaved', exists (select 1 from public.long_video_saves s where s.video_id = v.id and s.user_id = auth.uid()),
    'createdAt', v.created_at, 'renditions', coalesce(v.renditions, '[]'::jsonb))
  from public.profiles a where a.id = v.user_id;
$function$;

commit;
