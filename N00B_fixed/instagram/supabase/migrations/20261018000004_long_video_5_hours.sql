-- A video for the Videos page may now be up to 5 hours long (it was 2 hours). A reel is limited to 70 seconds in the app (checked on the phone before
-- anything is uploaded). Safe to run more than once.

-- the old 2-hour check on the table, whatever it was called, goes; the new one is named
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.long_videos'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%duration_seconds%'
  loop
    execute format('alter table public.long_videos drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.long_videos
  add constraint long_videos_duration_seconds_check check (duration_seconds > 0 and duration_seconds <= 18000);   -- 5 hours

create or replace function public.create_long_video(
  p_video_url text, p_thumbnail_url text default null, p_title text default '',
  p_description text default '', p_duration_seconds integer default 0
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); vid uuid;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if (select is_suspended from public.profiles where id = me) is not false then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if coalesce(btrim(p_video_url), '') = '' then raise exception 'A video is required.'; end if;
  if coalesce(p_duration_seconds, 0) <= 0 or p_duration_seconds > 18000 then
    raise exception 'Videos must be longer than 0 seconds and no more than 5 hours.';
  end if;
  insert into public.long_videos (user_id, video_url, thumbnail_url, title, description, duration_seconds)
    values (me, btrim(p_video_url), nullif(btrim(coalesce(p_thumbnail_url, '')), ''), left(btrim(coalesce(p_title, '')), 150),
            left(btrim(coalesce(p_description, '')), 2000), p_duration_seconds)
    returning id into vid;
  perform public.claim_post_bonus_or_default(me, 25, 'Uploaded a video');
  return jsonb_build_object('success', true, 'video', (select public.long_video_json(v) from public.long_videos v where v.id = vid));
end;
$$;
