-- A big, randomly-rolled "post bonus" offer — shown as a card on Home with Accept/Reject. Accepting
-- opens the post/reel/video creation flow; whatever gets published next claims the exact amount that
-- was rolled, credited the moment it's created. The amount has to be generated and remembered
-- SERVER-SIDE (not just picked client-side and sent back on "claim") so a client can never just call
-- a claim RPC with a number of its own choosing.

create table public.post_bonus_offers (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  amount     bigint not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz
);
alter table public.post_bonus_offers enable row level security;
create policy post_bonus_offers_select on public.post_bonus_offers for select to authenticated
  using (user_id = auth.uid());
grant select on public.post_bonus_offers to authenticated;

-- Rolls (or re-rolls) this account's offer — 5,000,000 to 30,000,000 points, good for 30 minutes.
-- Calling it again before that expires just replaces the pending offer with a fresh roll.
create or replace function public.request_post_bonus_offer() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); amt bigint;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  amt := 5000000 + floor(random() * 25000001)::bigint;
  insert into public.post_bonus_offers (user_id, amount, created_at, expires_at, claimed_at)
    values (me, amt, now(), now() + interval '30 minutes', null)
  on conflict (user_id) do update
    set amount = excluded.amount, created_at = now(), expires_at = now() + interval '30 minutes', claimed_at = null;
  return jsonb_build_object('amount', amt);
end;
$$;
grant execute on function public.request_post_bonus_offer() to authenticated;

-- Shared by create_post/create_reel/create_long_video: if this account has a pending, unexpired,
-- unclaimed bonus offer, award exactly that (and mark it claimed) instead of the normal flat amount.
create or replace function public.claim_post_bonus_or_default(p_user uuid, p_default bigint, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare offer public.post_bonus_offers;
begin
  select * into offer from public.post_bonus_offers
    where user_id = p_user and claimed_at is null and expires_at > now();
  if found then
    update public.post_bonus_offers set claimed_at = now() where user_id = p_user;
    perform public.award_points(p_user, offer.amount, p_reason || ' (bonus offer)');
  else
    perform public.award_points(p_user, p_default, p_reason);
  end if;
end;
$$;
revoke execute on function public.claim_post_bonus_or_default(uuid, bigint, text) from authenticated;

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
  perform public.claim_post_bonus_or_default(me, 25, 'Published a post');
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
  perform public.claim_post_bonus_or_default(me, 25, 'Published a reel');
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
  if coalesce(p_duration_seconds, 0) <= 0 or p_duration_seconds > 7200 then
    raise exception 'Videos must be longer than 0 seconds and no more than 2 hours.';
  end if;
  insert into public.long_videos (user_id, video_url, thumbnail_url, title, description, duration_seconds)
    values (me, btrim(p_video_url), nullif(btrim(coalesce(p_thumbnail_url, '')), ''), left(btrim(coalesce(p_title, '')), 150),
            left(btrim(coalesce(p_description, '')), 2000), p_duration_seconds)
    returning id into vid;
  perform public.claim_post_bonus_or_default(me, 25, 'Uploaded a video');
  return jsonb_build_object('success', true, 'video', (select public.long_video_json(v) from public.long_videos v where v.id = vid));
end;
$$;
