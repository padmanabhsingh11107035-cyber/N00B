-- NOOB Ads, photos: an ad is either ONE video or 1 to 10 PHOTOS. The photos change by themselves in the banner (the next one comes after 1 second).
-- media_urls holds all the files of the ad in order (the first one is also in media_url, as before, so nothing that already exists changes).
-- submit_ad_application, ad_json and active_ads are replaced; an older copy of the app that still sends one "mediaUrl" keeps working.

alter table public.ad_applications add column if not exists media_urls text[] not null default '{}';
update public.ad_applications set media_urls = array[media_url] where cardinality(media_urls) = 0;

create or replace function public.ad_media_list_ok(p text[]) returns boolean
language sql immutable set search_path = public as $$
  select p is not null and cardinality(p) between 1 and 10
     and not exists (select 1 from unnest(p) x where x is null or x !~ '^ads/[A-Za-z0-9._-]+$' or char_length(x) > 200);
$$;
revoke execute on function public.ad_media_list_ok(text[]) from public, anon, authenticated;

alter table public.ad_applications drop constraint if exists ad_media_list;
alter table public.ad_applications add constraint ad_media_list
  check (public.ad_media_list_ok(media_urls) and media_urls[1] = media_url and (media_type = 'image' or cardinality(media_urls) = 1));

create or replace function public.ad_json(a public.ad_applications, with_contact boolean default false) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', a.id, 'title', a.title, 'link', a.link, 'mediaUrl', a.media_url, 'mediaUrls', to_jsonb(a.media_urls), 'mediaType', a.media_type, 'durationDays', a.duration_days,
    'requestedPages', to_jsonb(a.requested_pages), 'approvedPages', to_jsonb(a.approved_pages),
    'status', case when a.status = 'approved' and a.ends_at is not null and a.ends_at <= now() then 'ended' else a.status end,
    'adminNote', a.admin_note, 'startsAt', a.starts_at, 'endsAt', a.ends_at, 'createdAt', a.created_at, 'reviewedAt', a.reviewed_at
  ) || case when with_contact then (
    select jsonb_build_object(
      'userId', p.id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar, 'isVerified', p.is_verified, 'businessCategory', p.business_category,
      'businessEmail', coalesce(nullif(pp.business_email, ''), pp.email), 'businessPhone', coalesce(nullif(pp.business_phone, ''), pp.mobile_number))
    from public.profiles p left join public.profile_private pp on pp.user_id = p.id where p.id = a.user_id) else '{}'::jsonb end;
$$;
revoke execute on function public.ad_json(public.ad_applications, boolean) from public, anon, authenticated;

-- p: { mediaType: 'image'|'video', mediaUrls: ["ads/..", ...] (1 to 10 photos, or exactly 1 video), durationDays, pages: ["reels"|"feed"|"home"|"all"], title?, link? }
-- (an older app sends mediaUrl, one file, instead of mediaUrls)
create or replace function public.submit_ad_application(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.acting_user(); mtype text := lower(btrim(coalesce(p->>'mediaType', ''))); urls text[];
  days integer; pages text[]; ttl text := left(btrim(coalesce(p->>'title', '')), 80); lnk text := nullif(btrim(coalesce(p->>'link', '')), ''); new_id uuid;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = me and (is_business or account_type = 'business') and not is_suspended) then
    raise exception 'Ads are for business accounts. Switch your account to a business account first.';
  end if;
  if mtype not in ('image', 'video') then raise exception 'An ad is a picture or a video.'; end if;
  urls := array(select btrim(x.v) from jsonb_array_elements_text(case when jsonb_typeof(p->'mediaUrls') = 'array' then p->'mediaUrls' else '[]'::jsonb end) with ordinality as x(v, n) order by x.n);
  if cardinality(urls) = 0 and btrim(coalesce(p->>'mediaUrl', '')) <> '' then urls := array[btrim(p->>'mediaUrl')]; end if;
  if cardinality(urls) = 0 then raise exception 'Please add the picture or video of your ad.'; end if;
  if mtype = 'video' and cardinality(urls) <> 1 then raise exception 'A video ad has one video.'; end if;
  if mtype = 'image' and cardinality(urls) > 10 then raise exception 'You can add up to 10 photos.'; end if;
  if not public.ad_media_list_ok(urls) then raise exception 'Please add the picture or video of your ad.'; end if;
  if (select count(distinct x) from unnest(urls) x) <> cardinality(urls) then raise exception 'The same photo was added twice.'; end if;
  if (select count(*) from storage.objects o where o.bucket_id = 'media' and o.name = any (urls) and (o.owner_id = me::text or o.owner = me)) <> cardinality(urls) then
    raise exception 'That file was not found. Please choose it again.';
  end if;
  begin days := (p->>'durationDays')::integer; exception when others then days := null; end;
  if days is null or days not in (1, 3, 7, 14, 30) then raise exception 'Choose how long the ad should run.'; end if;
  pages := public.ad_clean_pages(array(select jsonb_array_elements_text(case when jsonb_typeof(p->'pages') = 'array' then p->'pages' else '[]'::jsonb end)));
  if cardinality(pages) = 0 then raise exception 'Choose where the ad should be shown: Reels, Feed, Home or all of them.'; end if;
  if lnk is not null and (char_length(lnk) > 400 or lnk !~* '^https?://[^[:space:]]+$') then raise exception 'The link must start with https:// (or leave it empty).'; end if;
  if (select count(*) from public.ad_applications where user_id = me and status = 'pending') >= 3 then
    raise exception 'You already have 3 requests waiting. The NOOB team will contact you soon.';
  end if;
  if (select count(*) from public.ad_applications where user_id = me and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Too many requests today. Please try again tomorrow.';
  end if;
  insert into public.ad_applications (user_id, title, link, media_url, media_urls, media_type, duration_days, requested_pages)
  values (me, ttl, lnk, urls[1], urls, mtype, days, pages) returning id into new_id;
  return jsonb_build_object('success', true, 'id', new_id);
end;
$$;

create or replace function public.active_ads(p_page text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'title', a.title, 'link', a.link, 'mediaUrl', a.media_url, 'mediaUrls', to_jsonb(a.media_urls), 'mediaType', a.media_type, 'endsAt', a.ends_at,
      'advertiser', jsonb_build_object('username', p.username, 'displayName', p.display_name, 'avatar', p.avatar, 'isVerified', p.is_verified))
    order by a.starts_at desc), '[]'::jsonb)
  from public.ad_applications a join public.profiles p on p.id = a.user_id
  where auth.uid() is not null and a.status = 'approved' and a.starts_at <= now() and a.ends_at > now()
    and p_page = any (a.approved_pages) and p_page in ('reels', 'feed', 'home') and not p.is_suspended;
$$;

revoke execute on function public.submit_ad_application(jsonb), public.active_ads(text) from public, anon;
grant execute on function public.submit_ad_application(jsonb), public.active_ads(text) to authenticated;
