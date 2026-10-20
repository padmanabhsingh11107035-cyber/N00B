-- Quality options for the Feed / Videos page (like YouTube's 1080p / 480p / 240p): a video can carry lower-quality copies of itself, so a person on slow or paid data can watch
-- a smaller one. The copies are made on the uploader's phone right after the video is posted and added with set_long_video_renditions(); older videos simply have none
-- (the player then offers the original only). Each copy is { "height": 480, "url": "videos/....mp4", "bytes": 12345678 }.
-- Safe to run more than once.

alter table public.long_videos add column if not exists renditions jsonb not null default '[]'::jsonb;

create or replace function public.long_video_json(v public.long_videos) returns jsonb
language sql stable set search_path = public as $$
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
$$;

create or replace function public.set_long_video_renditions(p_video uuid, p_renditions jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v public.long_videos; clean jsonb := '[]'::jsonb; r jsonb; h integer; u text; b bigint; seen integer[] := '{}';
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into v from public.long_videos where id = p_video;
  if not found then raise exception 'Video not found.'; end if;
  if v.user_id <> me then raise exception 'Only the person who posted the video can do this.' using errcode = '42501'; end if;
  if p_renditions is null or jsonb_typeof(p_renditions) <> 'array' then raise exception 'The lower-quality copies must be a list.'; end if;
  if jsonb_array_length(p_renditions) > 4 then raise exception 'A video can have at most four lower-quality copies.'; end if;
  for r in select * from jsonb_array_elements(p_renditions) loop
    h := nullif(r->>'height', '')::integer;
    u := r->>'url';
    b := nullif(r->>'bytes', '')::bigint;
    if h is null or h < 100 or h > 2160 then raise exception 'A copy has no valid height.'; end if;
    if u is null or u !~ '^videos/[A-Za-z0-9._-]+$' then raise exception 'A copy has no valid file.'; end if;
    if b is null or b < 1 or b > 60000000 then raise exception 'A copy has no valid size.'; end if;
    if h = any(seen) then raise exception 'Two copies have the same height.'; end if;
    seen := seen || h;
    clean := clean || jsonb_build_array(jsonb_build_object('height', h, 'url', u, 'bytes', b));
  end loop;
  update public.long_videos set renditions = (select coalesce(jsonb_agg(x order by (x->>'height')::integer desc), '[]'::jsonb) from jsonb_array_elements(clean) x) where id = p_video;
  return jsonb_build_object('success', true, 'renditions', (select renditions from public.long_videos where id = p_video));
end;
$$;
revoke execute on function public.set_long_video_renditions(uuid, jsonb) from public, anon;
grant execute on function public.set_long_video_renditions(uuid, jsonb) to authenticated;
