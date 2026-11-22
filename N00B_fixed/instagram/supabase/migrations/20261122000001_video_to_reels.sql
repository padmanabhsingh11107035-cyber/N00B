-- 20261122000001: "Add to Reels" for a video on the Videos page.
--
-- One video file, two places: the same uploaded file is shown on the Videos page AND in Reels. Nothing is copied: the new reel row points to the very same file
-- (same video_url, same cover), so the server holds the file once.
--
--   * A reel can be linked to the video it came from (reels.source_video_id). One video can have only one such reel.
--   * Only the owner can do it, only for a video of up to 10 minutes (raised from 70 seconds by 20261122000002), and it does not count as a second post: no extra points and it does
--     not use the free account's one-post-a-day.
--   * If the video is deleted, its linked reel goes with it (the file would be gone). If only the reel is deleted, the video stays.
--   * Files: the storage cleanup (media_trash / purge_media) checks every table before it deletes a file (media_in_use), so a file that the video or the reel still points
--     to is never deleted. Deleting one of the two never takes the file away from the other.
--
-- Safe to run twice. Nothing is deleted or changed in existing rows.

alter table public.reels add column if not exists source_video_id uuid references public.long_videos (id) on delete cascade;
create unique index if not exists reels_source_video_unique on public.reels (source_video_id) where source_video_id is not null;

-- The reel of one video (null when it has none): the app uses it to show "Added to Reels" and to link to it.
create or replace function public.long_video_reel_id(p_video uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select r.id from public.reels r where r.source_video_id = p_video limit 1;
$$;
revoke execute on function public.long_video_reel_id(uuid) from public, anon;
grant execute on function public.long_video_reel_id(uuid) to authenticated;

create or replace function public.add_long_video_to_reels(p_video uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v public.long_videos; prof public.profiles; rid uuid;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into prof from public.profiles where id = me;
  if not found or prof.is_suspended then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select * into v from public.long_videos where id = p_video;
  if not found then raise exception 'Video not found.'; end if;
  if v.user_id <> me then raise exception 'Only the person who uploaded a video can add it to Reels.' using errcode = '42501'; end if;
  if coalesce(v.duration_seconds, 0) > 70 then
    raise exception 'A reel can be up to 70 seconds. This video is longer, so it can stay on the Videos page only.';
  end if;

  -- already added: give the same reel back (adding twice does nothing)
  select id into rid from public.reels where source_video_id = v.id;
  if rid is null then
    insert into public.reels (id, user_id, video_url, thumbnail_url, caption, audio_title, audio_artist, hashtags, category, views_count, duration_seconds, source_video_id)
    values (gen_random_uuid(), me, v.video_url, v.thumbnail_url, left(coalesce(nullif(btrim(v.title), ''), nullif(btrim(v.description), ''), ''), 2200),
            'Original Sound', prof.username, '{}', 'others', 0, greatest(1, v.duration_seconds), v.id)
    returning id into rid;
  end if;
  return (select public.reel_json(r) from public.reels r where r.id = rid);
end;
$$;
revoke execute on function public.add_long_video_to_reels(uuid) from public, anon;
grant execute on function public.add_long_video_to_reels(uuid) to authenticated;
