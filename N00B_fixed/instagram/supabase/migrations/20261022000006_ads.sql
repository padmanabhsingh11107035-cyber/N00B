-- NOOB Ads: a business account applies for an ad (a picture or a video, for how many days, on which pages: Reels, Feed, Home or all three), the NOOB admin reads the request,
-- decides which pages it may appear on (one switch per page) and approves it, and for as long as it runs the ad is shown at the top of those pages.
--
-- Everything goes through the functions below (row level security on, no policies, no direct table rights), like NOOB Draw and Our Team:
--   submit_ad_application(p)            a business account sends a request (free). Its file must be one it uploaded itself into the "ads" folder.
--   my_ad_applications()                the sender's own requests and what became of them
--   admin_ad_applications(status)       the admin's list, with how to reach each advertiser (business e-mail and phone)
--   admin_review_ad(id, action, ...)    approve (with the pages and the number of days), reject, stop a running ad, change its pages
--   active_ads(page)                    the ads that are running right now on 'reels', 'feed' or 'home' (for the pages to show)

-- The "ads" folder joins the folders people may upload into (the full list as of the last change, plus 'ads').
drop policy if exists media_upload on storage.objects;
create policy media_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] in
      ('posts', 'reels', 'stories', 'avatars', 'music', 'covers', 'stickers', 'products', 'chat', 'instants', 'comments', 'videos', 'daily', 'songs', 'team', 'ads')
  );

create table if not exists public.ad_applications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  title           text not null default '',
  link            text,
  media_url       text not null,
  media_type      text not null check (media_type in ('image', 'video')),
  duration_days   integer not null check (duration_days in (1, 3, 7, 14, 30)),
  requested_pages text[] not null,
  approved_pages  text[] not null default '{}',
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'ended')),
  admin_note      text not null default '',
  reviewed_by     uuid references public.profiles(id) on delete set null,
  reviewed_at     timestamptz,
  starts_at       timestamptz,
  ends_at         timestamptz,
  created_at      timestamptz not null default now(),
  constraint ad_title_len     check (char_length(title) <= 80),
  constraint ad_link_ok       check (link is null or (char_length(link) <= 400 and link ~* '^https?://[^[:space:]]+$')),
  constraint ad_media_ok      check (char_length(media_url) <= 200 and media_url ~ '^ads/[A-Za-z0-9._-]+$'),
  constraint ad_requested_ok  check (requested_pages <@ array['reels', 'feed', 'home']::text[] and cardinality(requested_pages) >= 1),
  constraint ad_approved_ok   check (approved_pages <@ array['reels', 'feed', 'home']::text[]),
  constraint ad_note_len      check (char_length(admin_note) <= 300)
);
create index if not exists ad_applications_user_idx   on public.ad_applications (user_id, created_at desc);
create index if not exists ad_applications_status_idx on public.ad_applications (status, ends_at);
alter table public.ad_applications enable row level security;

-- "all" or any mix of reels / feed / home, in one fixed order, without anything else in it
create or replace function public.ad_clean_pages(p_in text[]) returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array(select x from unnest(array['reels', 'feed', 'home']) x where x = any (coalesce(p_in, '{}')) or 'all' = any (coalesce(p_in, '{}'))), '{}'::text[]);
$$;

create or replace function public.ad_json(a public.ad_applications, with_contact boolean default false) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', a.id, 'title', a.title, 'link', a.link, 'mediaUrl', a.media_url, 'mediaType', a.media_type, 'durationDays', a.duration_days,
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

-- a business account sends a request. p: { mediaUrl, mediaType, durationDays, pages: ["reels"|"feed"|"home"|"all"], title?, link? }
create or replace function public.submit_ad_application(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.acting_user(); key text := btrim(coalesce(p->>'mediaUrl', '')); mtype text := lower(btrim(coalesce(p->>'mediaType', '')));
  days integer; pages text[]; ttl text := left(btrim(coalesce(p->>'title', '')), 80); lnk text := nullif(btrim(coalesce(p->>'link', '')), ''); new_id uuid;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = me and (is_business or account_type = 'business') and not is_suspended) then
    raise exception 'Ads are for business accounts. Switch your account to a business account first.';
  end if;
  if mtype not in ('image', 'video') then raise exception 'An ad is a picture or a video.'; end if;
  if key !~ '^ads/[A-Za-z0-9._-]+$' or char_length(key) > 200 then raise exception 'Please add the picture or video of your ad.'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'media' and o.name = key and (o.owner_id = me::text or o.owner = me)) then
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
  insert into public.ad_applications (user_id, title, link, media_url, media_type, duration_days, requested_pages)
  values (me, ttl, lnk, key, mtype, days, pages) returning id into new_id;
  return jsonb_build_object('success', true, 'id', new_id);
end;
$$;

create or replace function public.my_ad_applications() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.ad_json(a) order by a.created_at desc), '[]'::jsonb) from public.ad_applications a where a.user_id = auth.uid();
$$;

-- the admin's list. p_status: null = all, 'pending', 'live' (approved and running), 'ended', 'rejected'
create or replace function public.admin_ad_applications(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'pendingCount', (select count(*) from public.ad_applications where status = 'pending'),
    'rows', coalesce((
      select jsonb_agg(public.ad_json(a, true) order by (a.status = 'pending') desc, a.created_at desc)
      from public.ad_applications a
      where p_status is null or p_status = ''
         or (p_status = 'pending' and a.status = 'pending')
         or (p_status = 'live' and a.status = 'approved' and a.ends_at > now())
         or (p_status = 'ended' and (a.status = 'ended' or (a.status = 'approved' and a.ends_at <= now())))
         or (p_status = 'rejected' and a.status = 'rejected')
    ), '[]'::jsonb));
end;
$$;

-- p_action: 'approve' (p_pages = where it may appear, p_days = how long, default what was asked), 'reject', 'stop' (end a running ad now), 'pages' (change where a running ad appears)
create or replace function public.admin_review_ad(p_id uuid, p_action text, p_pages text[] default null, p_days integer default null, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.ad_applications; pages text[] := public.ad_clean_pages(p_pages); days integer; live boolean;
begin
  if not public.is_master_admin() then raise exception 'Access denied. Administrator privileges required.' using errcode = '42501'; end if;
  select * into a from public.ad_applications where id = p_id for update;
  if not found then raise exception 'That request was not found.'; end if;
  live := coalesce(a.status = 'approved' and a.ends_at > now(), false);
  if p_action = 'approve' then
    if live then raise exception 'This ad is already running.'; end if;
    if cardinality(pages) = 0 then raise exception 'Switch on at least one page (Reels, Feed or Home).'; end if;
    days := coalesce(p_days, a.duration_days);
    if days < 1 or days > 90 then raise exception 'The ad can run for 1 to 90 days.'; end if;
    update public.ad_applications set status = 'approved', approved_pages = pages, starts_at = now(), ends_at = now() + make_interval(days => days),
           admin_note = left(btrim(coalesce(p_note, '')), 300), reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  elsif p_action = 'reject' then
    if live then raise exception 'This ad is running. Stop it first.'; end if;
    update public.ad_applications set status = 'rejected', approved_pages = '{}', admin_note = left(btrim(coalesce(p_note, '')), 300), reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  elsif p_action = 'stop' then
    if not live then raise exception 'This ad is not running.'; end if;
    update public.ad_applications set status = 'ended', ends_at = now(), reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  elsif p_action = 'pages' then
    if not live then raise exception 'Only a running ad can change pages.'; end if;
    if cardinality(pages) = 0 then raise exception 'Switch on at least one page (Reels, Feed or Home), or stop the ad.'; end if;
    update public.ad_applications set approved_pages = pages where id = p_id;
  else
    raise exception 'Unknown action.';
  end if;
  perform public.log_admin_action('ad_' || p_action, a.user_id, jsonb_build_object('adId', p_id));
  return jsonb_build_object('success', true, 'ad', (select public.ad_json(x, true) from public.ad_applications x where x.id = p_id));
end;
$$;

-- the ads running right now on one page, for the page to show (newest approved first). Nothing about the advertiser's contact details leaves here.
create or replace function public.active_ads(p_page text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'title', a.title, 'link', a.link, 'mediaUrl', a.media_url, 'mediaType', a.media_type, 'endsAt', a.ends_at,
      'advertiser', jsonb_build_object('username', p.username, 'displayName', p.display_name, 'avatar', p.avatar, 'isVerified', p.is_verified))
    order by a.starts_at desc), '[]'::jsonb)
  from public.ad_applications a join public.profiles p on p.id = a.user_id
  where auth.uid() is not null and a.status = 'approved' and a.starts_at <= now() and a.ends_at > now()
    and p_page = any (a.approved_pages) and p_page in ('reels', 'feed', 'home') and not p.is_suspended;
$$;

revoke execute on function public.ad_clean_pages(text[]), public.submit_ad_application(jsonb), public.my_ad_applications(), public.admin_ad_applications(text),
  public.admin_review_ad(uuid, text, text[], integer, text), public.active_ads(text) from public, anon;
grant execute on function public.ad_clean_pages(text[]), public.submit_ad_application(jsonb), public.my_ad_applications(), public.admin_ad_applications(text),
  public.admin_review_ad(uuid, text, text[], integer, text), public.active_ads(text) to authenticated;
