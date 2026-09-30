-- NOOB — brings the same layered sticker editor built for Stories (text, emoji/GIF stickers,
-- mentions, hashtags, links, draw, countdown, location — all draggable/resizable/rotatable) to
-- Post creation. Stored the same way: a jsonb array of {type, data, x, y, width, rotation} per
-- slide, reusing the exact shape already defined for stories.stickers.

alter table public.post_slides add column if not exists stickers jsonb not null default '[]';

-- create_post: unchanged except the per-slide insert now also carries stickers through, same
-- coalesce-from-payload pattern already used for that slide's taggedUsers/productTags.
create or replace function public.create_post(
  p_slides jsonb, p_caption text default '', p_category text default 'tech',
  p_hashtags text[] default '{}', p_audio jsonb default null, p_web_link text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  prof public.profiles;
  last_post timestamptz;
  new_id uuid := gen_random_uuid();
  s jsonb;
  i integer := 0;
  media text;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select * into prof from public.profiles where id = me;
  if not found or prof.is_suspended then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if p_slides is null or jsonb_typeof(p_slides) <> 'array' or jsonb_array_length(p_slides) = 0 then
    raise exception 'A post needs at least one picture or video.';
  end if;

  if prof.pro_tier is null then
    last_post := nullif(prof.extra->>'lastContentPostAt', '')::timestamptz;
    if last_post is not null and now() - last_post < interval '24 hours' then
      raise exception 'Free accounts can publish one post or reel per day. Upgrade to NOOB Pro for unlimited posting.'
        using errcode = 'P0001', detail = to_char((last_post + interval '24 hours') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    end if;
  end if;

  insert into public.posts (id, user_id, caption, category, hashtags, audio_track, web_link)
  values (new_id, me, coalesce(p_caption, ''), coalesce(nullif(p_category, ''), 'tech'), coalesce(p_hashtags, '{}'), p_audio, nullif(p_web_link, ''));

  for s in select * from jsonb_array_elements(p_slides) loop
    media := coalesce(nullif(s->>'objectKey', ''), nullif(s->>'mediaUrl', ''));
    if media is null then raise exception 'Every picture or video needs a file.'; end if;
    insert into public.post_slides (id, post_id, position, media_url, media_type, caption, filter, tagged_users, product_tags, stickers)
    values (
      case when s->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (s->>'id')::uuid else gen_random_uuid() end,
      new_id, i, media,
      case when s->>'mediaType' in ('image', 'video', 'code') then s->>'mediaType' else 'image' end,
      nullif(s->>'caption', ''), nullif(s->>'filter', ''),
      coalesce(s->'taggedUsers', '[]'::jsonb), coalesce(s->'productTags', '[]'::jsonb), coalesce(s->'stickers', '[]'::jsonb)
    );
    i := i + 1;
  end loop;

  update public.profiles set extra = jsonb_set(extra, '{lastContentPostAt}', to_jsonb(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) where id = me;
  perform public.award_points(me, 25, 'Published a post');
  return (select public.post_json(p) from public.posts p where p.id = new_id);
end;
$$;

-- post_json: unchanged except the slide object now also returns 'stickers'.
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
    'isPinnedToProfile', p.is_pinned_to_profile, 'isArchived', p.is_archived, 'isCommentsDisabled', p.is_comments_disabled,
    'isLikeCountHidden', p.is_like_count_hidden, 'isSponsored', p.is_sponsored, 'isCollab', p.is_collab,
    'collabUsername', p.collab_username, 'taggedUsers', p.tagged_users, 'hasAiLabel', p.has_ai_label,
    'hashtags', to_jsonb(p.hashtags), 'audioTrack', p.audio_track, 'category', p.category,
    'textBgStyle', p.text_bg_style, 'webLink', p.web_link, 'scheduledFor', p.scheduled_for
  )
  from public.profiles a where a.id = p.user_id;
$$;
