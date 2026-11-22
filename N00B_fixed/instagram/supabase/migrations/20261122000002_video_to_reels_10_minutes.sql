-- 20261122000002: a video of up to 10 minutes (was 70 seconds) can be added to Reels (same file, nothing copied). Only this one limit changes. Safe to run twice.

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
  if coalesce(v.duration_seconds, 0) > 600 then
    raise exception 'A video added to Reels can be up to 10 minutes. This one is longer, so it can stay on the Videos page only.';
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
