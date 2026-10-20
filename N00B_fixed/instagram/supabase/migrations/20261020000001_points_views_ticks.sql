-- 1. Points: 10,000,000 for publishing a post / reel / video and 1,000,000 for every comment (it was 25 and 5). Each one is announced with the official NOOB logo,
--    remembered, and taken back (with the reason in the points history) if the post / reel / video / comment is deleted.
-- 2. Reel views: one person = one view, however many times they watch it. The counters are recounted from the list of people who really watched.
-- 3. The "has the app" tick in the admin panel is for the real Android app only: a phone that installed NOOB from the website (home-screen app) is told apart ('pwa').
-- Safe to run more than once.

-- ---------------------------------------------------------------------------------------------------------------- points
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.content_point_awards'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%content_type%' loop
    execute format('alter table public.content_point_awards drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.content_point_awards add constraint content_point_awards_content_type_check check (content_type in ('post', 'reel', 'video', 'comment'));

-- gives the points for a new post / reel / video (the bonus offer's amount if one is live), remembers them, and tells the person - from the official NOOB account
create or replace function public.claim_post_bonus_or_default(
  p_user uuid, p_default bigint, p_reason text, p_content_type text default null, p_content_id uuid default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare offer public.post_bonus_offers; amt bigint; why text; what text; nid uuid; bonus boolean := false;
begin
  select * into offer from public.post_bonus_offers where user_id = p_user and claimed_at is null and expires_at > now();
  if found then
    update public.post_bonus_offers set claimed_at = now() where user_id = p_user;
    amt := offer.amount; why := p_reason || ' (bonus offer)'; bonus := true;
  else
    amt := p_default; why := p_reason;
  end if;
  perform public.award_points(p_user, amt, why);

  if p_content_type in ('post', 'reel', 'video') and p_content_id is not null then
    insert into public.content_point_awards (user_id, content_type, content_id, amount, reason)
      values (p_user, p_content_type, p_content_id, amt, why)
    on conflict (content_type, content_id) do nothing;
  end if;

  what := case p_content_type when 'post' then 'publishing a post' when 'reel' then 'publishing a reel' when 'video' then 'uploading a video' else 'your new content' end;
  nid := public.notify_user(p_user, 'points_earned', public.noob_admin_id(),
    'You received ' || public.fmt_points(amt) || ' NOOB Points for ' || what || case when bonus then ' - your bonus offer!' else '.' end,
    '🎉 NOOB Points received');
  if nid is not null then
    update public.notifications set data = jsonb_build_object('contentType', p_content_type, 'contentId', p_content_id, 'amount', amt, 'bonus', bonus) where id = nid;
  end if;
  return amt;
end;
$$;
revoke execute on function public.claim_post_bonus_or_default(uuid, bigint, text, text, uuid) from public, anon, authenticated;

-- 1,000,000 points for a comment (or a reply) on a post, a reel or a video
create or replace function public.award_comment_points(p_user uuid, p_comment uuid, p_kind text) returns bigint
language plpgsql security definer set search_path = public as $$
declare amt bigint := 1000000; why text; what text; nid uuid;
begin
  why := case p_kind when 'reel' then 'Commented on a reel' when 'video' then 'Commented on a video' else 'Posted a comment' end;
  what := case p_kind when 'reel' then 'commenting on a reel' when 'video' then 'commenting on a video' else 'commenting on a post' end;
  perform public.award_points(p_user, amt, why);
  insert into public.content_point_awards (user_id, content_type, content_id, amount, reason) values (p_user, 'comment', p_comment, amt, why)
    on conflict (content_type, content_id) do nothing;
  nid := public.notify_user(p_user, 'points_earned', public.noob_admin_id(), 'You received ' || public.fmt_points(amt) || ' NOOB Points for ' || what || '.', '🎉 NOOB Points received');
  if nid is not null then
    update public.notifications set data = jsonb_build_object('contentType', 'comment', 'contentId', p_comment, 'amount', amt, 'bonus', false) where id = nid;
  end if;
  return amt;
end;
$$;
revoke execute on function public.award_comment_points(uuid, uuid, text) from public, anon, authenticated;

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
  perform public.claim_post_bonus_or_default(me, 10000000, 'Published a post', 'post', new_id);
  return (select public.post_json(p) from public.posts p where p.id = new_id);
end;
$$;

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
          coalesce(p_hashtags, '{}'), coalesce(nullif(p_category, ''), 'others'), 0, 15);

  update public.profiles set extra = jsonb_set(extra, '{lastContentPostAt}', to_jsonb(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) where id = me;
  perform public.claim_post_bonus_or_default(me, 10000000, 'Published a reel', 'reel', rid);
  return (select public.reel_json(r) from public.reels r where r.id = rid);
end;
$$;

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
  perform public.claim_post_bonus_or_default(me, 10000000, 'Uploaded a video', 'video', vid);
  return jsonb_build_object('success', true, 'video', (select public.long_video_json(v) from public.long_videos v where v.id = vid));
end;
$$;

create or replace function public.add_comment(
  p_post uuid, p_text text default null, p_parent_comment uuid default null,
  p_media_url text default null, p_media_type text default null, p_media_duration text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); t text := btrim(coalesce(p_text, '')); cid uuid; owner uuid; disabled boolean;
  parent public.comments; top_parent uuid; reply_to uuid; notif_text text;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if (select is_suspended from public.profiles where id = me) is not false then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if t = '' and p_media_url is null then raise exception 'Comment text cannot be empty'; end if;
  if p_media_url is not null and p_media_type not in ('image', 'video', 'voice', 'gif', 'sticker') then
    raise exception 'Unsupported attachment type';
  end if;
  select user_id, is_comments_disabled into owner, disabled from public.posts where id = p_post;
  if owner is null then raise exception 'Post not found'; end if;
  if not public.can_view_author(owner) then raise exception 'You cannot view this post.' using errcode = '42501'; end if;
  if disabled then raise exception 'Comments are turned off for this post.' using errcode = '42501'; end if;

  if p_parent_comment is not null then
    select * into parent from public.comments where id = p_parent_comment and post_id = p_post;
    if not found then raise exception 'The comment you are replying to no longer exists.'; end if;
    top_parent := coalesce(parent.parent_id, parent.id);
    reply_to := parent.user_id;
  end if;

  insert into public.comments (post_id, user_id, text, parent_id, reply_to_user_id, media_url, media_type, media_duration)
    values (p_post, me, nullif(t, ''), top_parent, reply_to, p_media_url, p_media_type, p_media_duration) returning id into cid;

  notif_text := case when t <> '' then '"' || left(t, 80) || case when length(t) > 80 then '…' else '' end || '"' else public.comment_media_label(p_media_type) end;
  if owner <> me then
    perform public.notify_user(owner, 'post_comment', me, 'commented: ' || notif_text, null, p_post);
  end if;
  if reply_to is not null and reply_to <> me and reply_to <> owner then
    perform public.notify_user(reply_to, 'post_comment', me, 'replied to your comment: ' || notif_text, null, p_post);
  end if;
  perform public.award_comment_points(me, cid, 'post');
  return jsonb_build_object('success', true, 'comment', (select public.comment_json(c) from public.comments c where c.id = cid));
end;
$$;

create or replace function public.add_reel_comment(
  p_reel uuid, p_text text default null, p_parent_comment uuid default null,
  p_media_url text default null, p_media_type text default null, p_media_duration text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); t text := btrim(coalesce(p_text, '')); cid uuid; owner uuid; disabled boolean;
  parent public.comments; top_parent uuid; reply_to uuid; notif_text text;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if (select is_suspended from public.profiles where id = me) is not false then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if t = '' and p_media_url is null then raise exception 'Comment text cannot be empty'; end if;
  if p_media_url is not null and p_media_type not in ('image', 'video', 'voice', 'gif', 'sticker') then
    raise exception 'Unsupported attachment type';
  end if;
  select user_id, is_comments_disabled into owner, disabled from public.reels where id = p_reel;
  if owner is null then raise exception 'Reel not found'; end if;
  if not public.can_view_author(owner) then raise exception 'You cannot view this reel.' using errcode = '42501'; end if;
  if disabled then raise exception 'Comments are turned off for this reel.' using errcode = '42501'; end if;

  if p_parent_comment is not null then
    select * into parent from public.comments where id = p_parent_comment and reel_id = p_reel;
    if not found then raise exception 'The comment you are replying to no longer exists.'; end if;
    top_parent := coalesce(parent.parent_id, parent.id);
    reply_to := parent.user_id;
  end if;

  insert into public.comments (reel_id, user_id, text, parent_id, reply_to_user_id, media_url, media_type, media_duration)
    values (p_reel, me, nullif(t, ''), top_parent, reply_to, p_media_url, p_media_type, p_media_duration) returning id into cid;

  notif_text := case when t <> '' then '"' || left(t, 80) || case when length(t) > 80 then '…' else '' end || '"' else public.comment_media_label(p_media_type) end;
  if owner <> me then
    perform public.notify_user(owner, 'post_comment', me, 'commented on your reel: ' || notif_text, null, null, p_reel);
  end if;
  if reply_to is not null and reply_to <> me and reply_to <> owner then
    perform public.notify_user(reply_to, 'post_comment', me, 'replied to your comment: ' || notif_text, null, null, p_reel);
  end if;
  perform public.award_comment_points(me, cid, 'reel');
  return jsonb_build_object('success', true, 'comment', (select public.comment_json(c) from public.comments c where c.id = cid));
end;
$$;

create or replace function public.add_long_video_comment(
  p_video uuid, p_text text default null, p_parent_comment uuid default null,
  p_media_url text default null, p_media_type text default null, p_media_duration text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); t text := btrim(coalesce(p_text, '')); cid uuid; owner uuid; disabled boolean;
  parent public.comments; top_parent uuid; reply_to uuid; notif_text text;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if (select is_suspended from public.profiles where id = me) is not false then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if t = '' and p_media_url is null then raise exception 'Comment text cannot be empty'; end if;
  if p_media_url is not null and p_media_type not in ('image', 'video', 'voice', 'gif', 'sticker') then
    raise exception 'Unsupported attachment type';
  end if;
  select user_id, is_comments_disabled into owner, disabled from public.long_videos where id = p_video;
  if owner is null then raise exception 'Video not found'; end if;
  if not public.can_view_author(owner) then raise exception 'You cannot view this video.' using errcode = '42501'; end if;
  if disabled then raise exception 'Comments are turned off for this video.' using errcode = '42501'; end if;

  if p_parent_comment is not null then
    select * into parent from public.comments where id = p_parent_comment and long_video_id = p_video;
    if not found then raise exception 'The comment you are replying to no longer exists.'; end if;
    top_parent := coalesce(parent.parent_id, parent.id);
    reply_to := parent.user_id;
  end if;

  insert into public.comments (long_video_id, user_id, text, parent_id, reply_to_user_id, media_url, media_type, media_duration)
    values (p_video, me, nullif(t, ''), top_parent, reply_to, p_media_url, p_media_type, p_media_duration) returning id into cid;

  notif_text := case when t <> '' then '"' || left(t, 80) || case when length(t) > 80 then '…' else '' end || '"' else public.comment_media_label(p_media_type) end;
  if owner <> me then
    perform public.notify_user(owner, 'post_comment', me, 'commented on your video: ' || notif_text, null, null, null);
  end if;
  if reply_to is not null and reply_to <> me and reply_to <> owner then
    perform public.notify_user(reply_to, 'post_comment', me, 'replied to your comment: ' || notif_text, null, null, null);
  end if;
  perform public.award_comment_points(me, cid, 'video');
  return jsonb_build_object('success', true, 'comment', (select public.comment_json(c) from public.comments c where c.id = cid));
end;
$$;

grant execute on function public.add_comment(uuid, text, uuid, text, text, text) to authenticated;
grant execute on function public.add_reel_comment(uuid, text, uuid, text, text, text) to authenticated;
grant execute on function public.add_long_video_comment(uuid, text, uuid, text, text, text) to authenticated;

-- Taking the points back when a comment is deleted by its writer or removed by someone else. A comment that goes only because what it was on went (the post, reel or video
-- deleted; the comment it answered deleted; the whole account deleted) is NOT the writer's doing: nothing is taken from them.
create or replace function public.take_back_comment_points() returns trigger
language plpgsql security definer set search_path = public as $$
declare a public.content_point_awards; moved bigint; who uuid := auth.uid(); mine boolean; bal bigint; why text; msg text; nid uuid;
begin
  select * into a from public.content_point_awards where content_type = 'comment' and content_id = old.id and taken_back_at is null for update;
  if not found then return old; end if;
  if not exists (select 1 from public.profiles where id = a.user_id) then return old; end if;
  if old.post_id is not null and not exists (select 1 from public.posts where id = old.post_id) then return old; end if;
  if old.reel_id is not null and not exists (select 1 from public.reels where id = old.reel_id) then return old; end if;
  if old.long_video_id is not null and not exists (select 1 from public.long_videos where id = old.long_video_id) then return old; end if;
  if old.parent_id is not null and not exists (select 1 from public.comments where id = old.parent_id) then return old; end if;

  mine := who is null or who = a.user_id;
  select noob_points into bal from public.profiles where id = a.user_id for update;
  moved := least(a.amount, greatest(coalesce(bal, 0), 0));
  why := 'Points taken back: ' || case when mine then 'you deleted the comment you earned them for' else 'the comment you earned them for was removed' end
    || case when moved < a.amount then ' (' || public.fmt_points(moved) || ' of ' || public.fmt_points(a.amount) || ' could be taken - the rest was already spent)' else '' end;
  if moved > 0 then
    perform public.apply_points(a.user_id, -moved, why);
  else
    insert into public.noob_transactions (user_id, amount, reason, balance_after) values (a.user_id, 0, why, coalesce(bal, 0));
  end if;
  update public.content_point_awards set taken_back_at = now(), taken_back_amount = moved where id = a.id;

  msg := case
    when mine and moved >= a.amount then 'You deleted your comment, so the ' || public.fmt_points(a.amount) || ' NOOB Points you earned for it were taken back.'
    when mine then 'You deleted your comment, so ' || public.fmt_points(moved) || ' of the ' || public.fmt_points(a.amount) || ' NOOB Points you earned for it were taken back (the rest was already spent).'
    when moved >= a.amount then 'Your comment was removed, so the ' || public.fmt_points(a.amount) || ' NOOB Points you earned for it were taken back.'
    else 'Your comment was removed, so ' || public.fmt_points(moved) || ' of the ' || public.fmt_points(a.amount) || ' NOOB Points you earned for it were taken back (the rest was already spent).'
  end;
  nid := public.notify_user(a.user_id, 'points_removed', public.noob_admin_id(), msg, '↩️ NOOB Points taken back');
  if nid is not null then
    update public.notifications set data = jsonb_build_object('contentType', 'comment', 'contentId', old.id, 'amount', a.amount, 'takenBack', moved) where id = nid;
  end if;
  return old;
end;
$$;
revoke execute on function public.take_back_comment_points() from public, anon, authenticated;
drop trigger if exists comments_take_back_points on public.comments;
create trigger comments_take_back_points after delete on public.comments for each row execute function public.take_back_comment_points();

-- the takings-back of posts, reels and videos also come from the official NOOB account now
create or replace function public.take_back_content_points() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  kind text := tg_argv[0]; a public.content_point_awards; moved bigint; who uuid := auth.uid(); mine boolean;
  noun text; why text; msg text; bal bigint; nid uuid;
begin
  select * into a from public.content_point_awards where content_type = kind and content_id = old.id and taken_back_at is null for update;
  if not found then return old; end if;
  if not exists (select 1 from public.profiles where id = a.user_id) then return old; end if;

  noun := case kind when 'post' then 'post' when 'reel' then 'reel' else 'video' end;
  mine := who is null or who = a.user_id;
  select noob_points into bal from public.profiles where id = a.user_id for update;
  moved := least(a.amount, greatest(coalesce(bal, 0), 0));
  why := 'Points taken back: ' || case when mine then 'you deleted the ' || noun || ' you earned them for' else 'the ' || noun || ' you earned them for was removed' end
    || case when moved < a.amount then ' (' || public.fmt_points(moved) || ' of ' || public.fmt_points(a.amount) || ' could be taken - the rest was already spent)' else '' end;
  if moved > 0 then
    perform public.apply_points(a.user_id, -moved, why);
  else
    insert into public.noob_transactions (user_id, amount, reason, balance_after) values (a.user_id, 0, why, coalesce(bal, 0));
  end if;
  update public.content_point_awards set taken_back_at = now(), taken_back_amount = moved where id = a.id;

  msg := case
    when mine and moved >= a.amount then 'You deleted your ' || noun || ', so the ' || public.fmt_points(a.amount) || ' NOOB Points you earned for it were taken back.'
    when mine then 'You deleted your ' || noun || ', so ' || public.fmt_points(moved) || ' of the ' || public.fmt_points(a.amount) || ' NOOB Points you earned for it were taken back (the rest was already spent).'
    when moved >= a.amount then 'Your ' || noun || ' was removed, so the ' || public.fmt_points(a.amount) || ' NOOB Points you earned for it were taken back.'
    else 'Your ' || noun || ' was removed, so ' || public.fmt_points(moved) || ' of the ' || public.fmt_points(a.amount) || ' NOOB Points you earned for it were taken back (the rest was already spent).'
  end;
  nid := public.notify_user(a.user_id, 'points_removed', public.noob_admin_id(), msg, '↩️ NOOB Points taken back');
  if nid is not null then
    update public.notifications set data = jsonb_build_object('contentType', kind, 'contentId', old.id, 'amount', a.amount, 'takenBack', moved) where id = nid;
  end if;
  return old;
end;
$$;
revoke execute on function public.take_back_content_points() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------- reel views
-- One person = one view: a watch counts only the first time that person watches that reel (the list of who watched is kept as before, and moves them up in THEIR history).
create or replace function public.record_reel_view(p_reel uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid; views integer; fresh boolean := false;
begin
  select user_id into owner from public.reels where id = p_reel;
  if owner is null then raise exception 'Reel not found'; end if;
  if not public.can_view_author(owner) then raise exception 'You cannot view this reel.' using errcode = '42501'; end if;
  if me is not null then
    insert into public.reel_views (reel_id, user_id) values (p_reel, me)
    on conflict (reel_id, user_id) do update set created_at = now()
    returning (xmax = 0) into fresh;
    if fresh then update public.reels set views_count = views_count + 1 where id = p_reel; end if;
  end if;
  select views_count into views from public.reels where id = p_reel;
  return jsonb_build_object('success', true, 'viewsCount', views);
end;
$$;

-- the counters so far were raised on every watch: set them to the number of people who really watched
update public.reels r set views_count = (select count(*) from public.reel_views v where v.reel_id = r.id);

-- ---------------------------------------------------------------------------------------------------------------- the app tick
-- 'app' = the real Android app, 'pwa' = installed from the website onto the home screen, 'web' = an ordinary browser tab
alter table public.profile_private drop constraint if exists profile_private_last_seen_platform_check;
alter table public.profile_private add constraint profile_private_last_seen_platform_check
  check (last_seen_platform is null or last_seen_platform in ('app', 'pwa', 'web'));
create or replace function public.touch_last_seen(p_platform text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or p_platform not in ('app', 'pwa', 'web') then return; end if;
  insert into public.profile_private (user_id, last_seen_at, last_seen_platform)
    values (me, now(), p_platform)
  on conflict (user_id) do update set last_seen_at = excluded.last_seen_at, last_seen_platform = excluded.last_seen_platform;
end;
$$;
grant execute on function public.touch_last_seen(text) to authenticated;
