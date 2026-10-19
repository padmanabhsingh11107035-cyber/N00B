-- Points for a post / reel / video: the person is told what they received, and if they delete it the points are taken back, with the reason in their points history.
--   1. content_point_awards remembers which points were given for which post, reel or video (the exact amount - the normal 25, or the big bonus-offer amount).
--   2. claim_post_bonus_or_default now records that, and sends a notification: "You received N NOOB Points for publishing a post".
--      create_post, create_reel and create_long_video (their latest versions, unchanged except for that one call) pass the new post / reel / video to it.
--   3. When a post, reel or video is deleted (by its owner, or removed by an admin) the points given for it are taken back: a line in the points history that says why,
--      and a notification ("You deleted your post, so the 25 NOOB Points you earned for it were taken back"). Taken back once only. What was already spent cannot be taken
--      from an empty wallet: the balance never goes below zero, and the history line says how much could be taken.
--   4. Both new notification types follow the "points" switch in Settings > Notifications.
-- Posts, reels and videos made before this migration have no record, so deleting them takes nothing back. Safe to run more than once.

create table if not exists public.content_point_awards (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  content_type      text not null check (content_type in ('post', 'reel', 'video')),
  content_id        uuid not null,
  amount            bigint not null,
  reason            text not null,
  awarded_at        timestamptz not null default now(),
  taken_back_at     timestamptz,
  taken_back_amount bigint,
  unique (content_type, content_id)
);
create index if not exists content_point_awards_user_idx on public.content_point_awards (user_id, awarded_at desc);
alter table public.content_point_awards enable row level security;
drop policy if exists content_point_awards_select on public.content_point_awards;
create policy content_point_awards_select on public.content_point_awards for select to authenticated using (user_id = auth.uid());
grant select on public.content_point_awards to authenticated;

-- gives the points (the bonus offer's amount if there is a live one, else the normal amount), remembers what they were for, and tells the person
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
  nid := public.notify_user(p_user, 'points_earned', null,
    'You received ' || public.fmt_points(amt) || ' NOOB Points for ' || what || case when bonus then ' - your bonus offer!' else '.' end,
    '🎉 NOOB Points received');
  if nid is not null then
    update public.notifications set data = jsonb_build_object('contentType', p_content_type, 'contentId', p_content_id, 'amount', amt, 'bonus', bonus) where id = nid;
  end if;
  return amt;
end;
$$;
revoke execute on function public.claim_post_bonus_or_default(uuid, bigint, text, text, uuid) from public, anon, authenticated;
-- the old three-argument version is replaced (the functions below are its only callers)

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
  perform public.claim_post_bonus_or_default(me, 25, 'Published a post', 'post', new_id);
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
          coalesce(p_hashtags, '{}'), coalesce(nullif(p_category, ''), 'others'), 1, 15);

  update public.profiles set extra = jsonb_set(extra, '{lastContentPostAt}', to_jsonb(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) where id = me;
  perform public.claim_post_bonus_or_default(me, 25, 'Published a reel', 'reel', rid);
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
  perform public.claim_post_bonus_or_default(me, 25, 'Uploaded a video', 'video', vid);
  return jsonb_build_object('success', true, 'video', (select public.long_video_json(v) from public.long_videos v where v.id = vid));
end;
$$;

drop function if exists public.claim_post_bonus_or_default(uuid, bigint, text);

-- the notification switch: both new types follow "points" in Settings > Notifications
create or replace function public.notifications_prefs() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text; until timestamptz;
begin
  if new.target_user_id is null then return new; end if;                      -- a message to everyone is not filtered
  k := case new.type
    when 'post_like' then 'notif.likes' when 'reel_like' then 'notif.likes'
    when 'post_comment' then 'notif.comments'
    when 'new_follower' then 'notif.follows' when 'follow_request_received' then 'notif.follows' when 'follow_request_accepted' then 'notif.follows'
    when 'new_message' then 'notif.messages' when 'instant' then 'notif.messages' when 'instant_reaction' then 'notif.messages'
    when 'mention' then 'notif.mentions'
    when 'live_lounge_invite' then 'notif.live' when 'live_lounge_meeting' then 'notif.live' when 'live_gift' then 'notif.live'
    when 'game_challenge' then 'notif.games' when 'noob_draw_ready' then 'notif.games'
    when 'points_transfer' then 'notif.points' when 'points_earned' then 'notif.points' when 'points_removed' then 'notif.points' when 'payment_request' then 'notif.points' when 'payment_request_approved' then 'notif.points' when 'payment_request_declined' then 'notif.points'
    when 'suggested_user' then 'notif.suggestions'
    when 'birthday_follower_alert' then 'notif.birthdays' when 'birthday_wish' then 'notif.birthdays'
    else null end;
  if k is null then return new; end if;                                       -- messages from the team, orders, calls and safety notices always arrive
  if not public.setting_bool(new.target_user_id, k) then return null; end if;
  begin until := (public.setting_json(new.target_user_id, 'notif.pauseUntil') #>> '{}')::timestamptz; exception when others then until := null; end;
  if until is not null and until > now() then return null; end if;
  return new;
end;
$$;

-- Taking the points back when the post / reel / video is deleted (any way it is deleted: by its owner, or by an admin removing it).
create or replace function public.take_back_content_points() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  kind text := tg_argv[0]; a public.content_point_awards; moved bigint; who uuid := auth.uid(); mine boolean;
  noun text; why text; msg text; bal bigint; nid uuid;
begin
  select * into a from public.content_point_awards where content_type = kind and content_id = old.id and taken_back_at is null for update;
  if not found then return old; end if;
  -- the whole account is being deleted: the wallet goes with it, nothing to take back from
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
    -- nothing left to take: the history still says what happened
    insert into public.noob_transactions (user_id, amount, reason, balance_after) values (a.user_id, 0, why, coalesce(bal, 0));
  end if;
  update public.content_point_awards set taken_back_at = now(), taken_back_amount = moved where id = a.id;

  msg := case
    when mine and moved >= a.amount then 'You deleted your ' || noun || ', so the ' || public.fmt_points(a.amount) || ' NOOB Points you earned for it were taken back.'
    when mine then 'You deleted your ' || noun || ', so ' || public.fmt_points(moved) || ' of the ' || public.fmt_points(a.amount) || ' NOOB Points you earned for it were taken back (the rest was already spent).'
    when moved >= a.amount then 'Your ' || noun || ' was removed, so the ' || public.fmt_points(a.amount) || ' NOOB Points you earned for it were taken back.'
    else 'Your ' || noun || ' was removed, so ' || public.fmt_points(moved) || ' of the ' || public.fmt_points(a.amount) || ' NOOB Points you earned for it were taken back (the rest was already spent).'
  end;
  nid := public.notify_user(a.user_id, 'points_removed', null, msg, '↩️ NOOB Points taken back');
  if nid is not null then
    update public.notifications set data = jsonb_build_object('contentType', kind, 'contentId', old.id, 'amount', a.amount, 'takenBack', moved) where id = nid;
  end if;
  return old;
end;
$$;
revoke execute on function public.take_back_content_points() from public, anon, authenticated;

drop trigger if exists posts_take_back_points on public.posts;
create trigger posts_take_back_points after delete on public.posts for each row execute function public.take_back_content_points('post');
drop trigger if exists reels_take_back_points on public.reels;
create trigger reels_take_back_points after delete on public.reels for each row execute function public.take_back_content_points('reel');
drop trigger if exists long_videos_take_back_points on public.long_videos;
create trigger long_videos_take_back_points after delete on public.long_videos for each row execute function public.take_back_content_points('video');
