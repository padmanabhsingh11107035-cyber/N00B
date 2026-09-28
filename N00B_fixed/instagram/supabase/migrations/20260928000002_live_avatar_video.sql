-- A custom "live" profile picture is now a real short VIDEO (not a GIF/WebP) — the client bakes a square,
-- cropped clip locally (see LiveProfilePictureModal.tsx) and uploads both the video and a poster frame.
-- `profiles.avatar` keeps holding the poster (so every existing "just show <img avatar>" spot still gets a
-- correct still picture with zero changes), and this adds where the matching video lives, so it up shows up
-- everywhere an author's avatar appears — story, post, reel, comment, or the profile itself.
alter table public.profiles add column if not exists live_avatar_video_url text;

drop function if exists public.apply_live_avatar(text, text);
create or replace function public.apply_live_avatar(p_preset text default null, p_custom_url text default null, p_custom_video_url text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); url text; video text;
begin
  if (select pro_tier from public.profiles where id = me) is null then
    raise exception 'Live Profile Pictures are a NOOB Pro feature. Upgrade to unlock them.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_preset, '')) <> '' then
    select l.url into url from public.live_avatar_presets l where l.id = p_preset;
    if url is null then raise exception 'Unknown preset.'; end if;
    video := null;   -- presets are curated animated images (GIF/WebP), not a separate video file
  elsif btrim(coalesce(p_custom_url, '')) <> '' then
    url := btrim(p_custom_url);
    video := nullif(btrim(coalesce(p_custom_video_url, '')), '');
  else
    raise exception 'Choose a preset or upload a custom live picture.';
  end if;
  update public.profiles set avatar = url, is_live_avatar = true, live_avatar_video_url = video where id = me;
  return jsonb_build_object('success', true, 'user', public.get_my_user());
end;
$$;
-- Dropping the old 2-argument version above lost its grant along with it (a fresh function starts with
-- none) — put it back, same as before.
revoke execute on function public.apply_live_avatar(text, text, text) from public;
grant execute on function public.apply_live_avatar(text, text, text) to authenticated;

-- Every place a full profile is read (the profile page, search, Explore, follow lists, ...) now also
-- carries the matching video, if there is one.
create or replace function public.user_public_json(p public.profiles) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar,
    'isLiveAvatar', p.is_live_avatar, 'liveAvatarVideoUrl', p.live_avatar_video_url,
    'bio', p.bio, 'accountType', p.account_type,
    'isBusiness', p.is_business, 'businessCategory', p.business_category,
    'isVerified', p.is_verified, 'verificationTier', p.verification_tier, 'proTier', p.pro_tier,
    'website', p.website, 'city', p.city, 'pronouns', p.pronouns,
    'socialLinks', p.social_links, 'interests', to_jsonb(p.interests), 'externalLinks', p.external_links,
    'customLinks', p.custom_links, 'crossProfiles', p.cross_profiles, 'statusNote', p.status_note,
    'followersCount', p.followers_count, 'followingCount', p.following_count, 'postsCount', p.posts_count,
    'noobPoints', p.noob_points, 'gamesWonCount', p.games_won_count, 'gamesPlayedCount', p.games_played_count,
    'isAi', p.is_ai, 'isAdmin', p.is_admin, 'createdAt', p.created_at,
    'followingIds', coalesce((select jsonb_agg(f.followee_id) from public.follows f where f.follower_id = p.id), '[]'::jsonb),
    'isFollowing', exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id),
    'isFollowRequested', exists (select 1 from public.follow_requests r where r.requester_id = auth.uid() and r.target_id = p.id)
  );
$$;

-- Posts
create or replace function public.post_json(p public.posts) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'userId', p.user_id, 'username', a.username, 'displayName', a.display_name,
    'userAvatar', a.avatar, 'isVerified', a.is_verified,
    'authorIsLiveAvatar', a.is_live_avatar, 'authorLiveAvatarVideoUrl', a.live_avatar_video_url,
    'caption', p.caption, 'location', p.location, 'createdAt', p.created_at,
    'slides', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'mediaUrl', s.media_url, 'objectKey', s.media_url, 'mediaType', s.media_type,
                                          'caption', s.caption, 'filter', s.filter, 'taggedUsers', s.tagged_users, 'productTags', s.product_tags)
                       order by s.position)
      from public.post_slides s where s.post_id = p.id), '[]'::jsonb),
    'likesCount', p.likes_count, 'commentsCount', p.comments_count, 'sharesCount', p.shares_count, 'savesCount', p.saves_count,
    'isLiked', exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    'isSaved', exists (select 1 from public.post_saves sv where sv.post_id = p.id and sv.user_id = auth.uid()),
    'isPinnedToProfile', p.is_pinned_to_profile, 'isArchived', p.is_archived, 'isCommentsDisabled', p.is_comments_disabled,
    'isLikeCountHidden', p.is_like_count_hidden, 'isSponsored', p.is_sponsored, 'isCollab', p.is_collab,
    'collabUsername', p.collab_username, 'taggedUsers', p.tagged_users, 'hasAiLabel', p.has_ai_label,
    'hashtags', to_jsonb(p.hashtags), 'audioTrack', p.audio_track, 'category', p.category,
    'textBgStyle', p.text_bg_style, 'webLink', p.web_link, 'scheduledFor', p.scheduled_for
  )
  from public.profiles a where a.id = p.user_id;
$$;

-- Reels
create or replace function public.reel_json(r public.reels) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'userId', r.user_id, 'username', a.username, 'userAvatar', a.avatar, 'isVerified', a.is_verified,
    'authorIsLiveAvatar', a.is_live_avatar, 'authorLiveAvatarVideoUrl', a.live_avatar_video_url,
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

-- Stories (and highlights, which reuse story_json's shape)
create or replace function public.story_json(s public.stories) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', s.id, 'userId', s.user_id, 'username', a.username, 'userAvatar', a.avatar, 'isVerified', a.is_verified,
    'authorIsLiveAvatar', a.is_live_avatar, 'authorLiveAvatarVideoUrl', a.live_avatar_video_url,
    'mediaUrl', s.media_url, 'mediaType', s.media_type, 'durationSeconds', s.duration_seconds,
    'createdAt', s.created_at, 'expiresAt', s.expires_at, 'isCloseFriendsOnly', s.is_close_friends_only,
    'isViewed', exists (select 1 from public.story_views v where v.story_id = s.id and v.user_id = auth.uid()),
    'viewedBy', case when s.user_id = auth.uid()
                     then coalesce((select jsonb_agg(v.user_id order by v.created_at) from public.story_views v where v.story_id = s.id), '[]'::jsonb)
                     else '[]'::jsonb end,
    'isLiked', exists (select 1 from public.story_likes l where l.story_id = s.id and l.user_id = auth.uid()),
    'likesCount', (select count(*) from public.story_likes l where l.story_id = s.id),
    'filter', s.filter, 'stickers', s.stickers,
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'username', cu.username, 'userAvatar', cu.avatar, 'text', c.text, 'createdAt', c.created_at) order by c.created_at)
      from public.story_comments c join public.profiles cu on cu.id = c.user_id where c.story_id = s.id), '[]'::jsonb))
  from public.profiles a where a.id = s.user_id;
$$;

-- Comments (on posts and reels)
create or replace function public.comment_json(c public.comments) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'postId', coalesce(c.post_id, c.reel_id), 'reelId', c.reel_id, 'userId', c.user_id, 'username', a.username,
    'userAvatar', a.avatar, 'isVerified', a.is_verified,
    'authorIsLiveAvatar', a.is_live_avatar, 'authorLiveAvatarVideoUrl', a.live_avatar_video_url,
    'text', c.text, 'likesCount', c.likes_count,
    'isLiked', exists (select 1 from public.comment_likes cl where cl.comment_id = c.id and cl.user_id = auth.uid()),
    'isPinned', c.is_pinned, 'createdAt', c.created_at,
    'parentId', c.parent_id, 'replyToUserId', c.reply_to_user_id, 'replyToUsername', ru.username)
  from public.profiles a
  left join public.profiles ru on ru.id = c.reply_to_user_id
  where a.id = c.user_id;
$$;
