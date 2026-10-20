-- Posts, reels, videos and profiles of PUBLIC accounts can be looked at without an account (a link opened in a browser, like Instagram): these functions are the only way in, they answer
-- nothing for a private or suspended account, and they hand over only what the page shows (no email, no ids of other people, no private fields).
-- A visitor without an account is counted ONCE per reel / video (one device = one view, however often it is played again), and never a robot.
-- Safe to run more than once.

create table if not exists public.public_content_views (
  kind       text not null check (kind in ('reel', 'video')),
  item_id    uuid not null,
  visitor    text not null,
  ip_hash    text,
  created_at timestamptz not null default now(),
  primary key (kind, item_id, visitor)
);
-- one network address counts once as well, so making up new visitor ids does not raise a number
create unique index if not exists public_content_views_ip_key on public.public_content_views (kind, item_id, ip_hash) where ip_hash is not null;
alter table public.public_content_views enable row level security;
revoke all on public.public_content_views from anon, authenticated;

-- may someone with no account look at this person's things? (public, not suspended)
create or replace function public.public_account_ok(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.account_type <> 'private' and not p.is_suspended from public.profiles p where p.id = p_user), false);
$$;
revoke execute on function public.public_account_ok(uuid) from public, anon, authenticated;

create or replace function public.public_reel(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r public.reels; a public.profiles;
begin
  select * into r from public.reels where id = p_id;
  if not found or r.is_trial_reel then return null; end if;
  select * into a from public.profiles where id = r.user_id;
  if not found or not public.public_account_ok(r.user_id) then return null; end if;
  return jsonb_build_object(
    'kind', 'reel', 'id', r.id, 'username', a.username, 'displayName', a.display_name, 'userAvatar', a.avatar, 'isVerified', a.is_verified,
    'videoUrl', r.video_url, 'thumbnailUrl', r.thumbnail_url, 'caption', r.caption, 'audioTitle', r.audio_title,
    'likesCount', r.likes_count, 'commentsCount', r.comments_count, 'viewsCount', r.views_count,
    'isLikeCountHidden', coalesce(r.is_like_count_hidden, false), 'createdAt', r.created_at, 'durationSeconds', coalesce(r.duration_seconds, 15));
end;
$$;

create or replace function public.public_video(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v public.long_videos; a public.profiles;
begin
  select * into v from public.long_videos where id = p_id;
  if not found then return null; end if;
  select * into a from public.profiles where id = v.user_id;
  if not found or not public.public_account_ok(v.user_id) then return null; end if;
  return jsonb_build_object(
    'kind', 'video', 'id', v.id, 'username', a.username, 'displayName', a.display_name, 'userAvatar', a.avatar, 'isVerified', a.is_verified,
    'videoUrl', v.video_url, 'thumbnailUrl', v.thumbnail_url, 'title', v.title, 'description', v.description,
    'likesCount', v.likes_count, 'viewsCount', v.views_count, 'commentsCount', v.comments_count,
    'isLikeCountHidden', coalesce(v.is_like_count_hidden, false), 'createdAt', v.created_at, 'durationSeconds', v.duration_seconds);
end;
$$;

create or replace function public.public_post(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p public.posts; a public.profiles;
begin
  select * into p from public.posts where id = p_id;
  if not found or p.is_archived or (p.scheduled_for is not null and p.scheduled_for > now()) then return null; end if;
  select * into a from public.profiles where id = p.user_id;
  if not found or not public.public_account_ok(p.user_id) then return null; end if;
  return jsonb_build_object(
    'kind', 'post', 'id', p.id, 'username', a.username, 'displayName', a.display_name, 'userAvatar', a.avatar, 'isVerified', a.is_verified,
    'caption', p.caption, 'location', p.location,
    'slides', coalesce((select jsonb_agg(jsonb_build_object('mediaUrl', s.media_url, 'mediaType', s.media_type, 'caption', s.caption, 'filter', s.filter) order by s.position)
                          from public.post_slides s where s.post_id = p.id), '[]'::jsonb),
    'likesCount', p.likes_count, 'commentsCount', p.comments_count, 'isLikeCountHidden', coalesce(p.is_like_count_hidden, false), 'createdAt', p.created_at);
end;
$$;

-- a profile: who they are and, for a public account, their latest pictures (never for a private one: only its header)
create or replace function public.public_profile(p_username text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a public.profiles; u text := btrim(coalesce(p_username, ''));
begin
  if u !~ '^[A-Za-z0-9._]{1,40}$' then return null; end if;
  select * into a from public.profiles where lower(username) = lower(u);
  if not found or a.is_suspended then return null; end if;
  return jsonb_build_object(
    'kind', 'profile', 'id', a.id, 'username', a.username, 'displayName', a.display_name, 'userAvatar', a.avatar, 'isVerified', a.is_verified, 'bio', a.bio,
    'isPrivate', a.account_type = 'private', 'followersCount', a.followers_count, 'followingCount', a.following_count, 'postsCount', a.posts_count,
    'posts', case when a.account_type = 'private' then '[]'::jsonb else coalesce((
        select jsonb_agg(jsonb_build_object('id', x.id, 'mediaUrl', x.media_url, 'mediaType', x.media_type) order by x.created_at desc)
          from (select p.id, p.created_at, s.media_url, s.media_type
                  from public.posts p join public.post_slides s on s.post_id = p.id and s.position = 0
                 where p.user_id = a.id and not p.is_archived and (p.scheduled_for is null or p.scheduled_for <= now())
                 order by p.created_at desc limit 12) x), '[]'::jsonb) end);
end;
$$;

-- one view for a visitor without an account (reel or video); robots are not counted; answers with the number of views now
create or replace function public.record_public_view(p_kind text, p_id uuid, p_visitor text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id text := btrim(coalesce(p_visitor, '')); v_h jsonb; v_ip text; v_ua text; v_hash text; v_owner uuid; v_rows integer := 0; v_views integer;
begin
  if p_kind not in ('reel', 'video') or v_id !~ '^[A-Za-z0-9-]{8,64}$' then return jsonb_build_object('success', false); end if;
  if p_kind = 'reel' then select user_id into v_owner from public.reels where id = p_id; else select user_id into v_owner from public.long_videos where id = p_id; end if;
  if v_owner is null or not public.public_account_ok(v_owner) then return jsonb_build_object('success', false); end if;
  begin v_h := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then v_h := null; end;
  v_ua := coalesce(v_h->>'user-agent', '');
  v_ip := nullif(btrim(split_part(coalesce(v_h->>'cf-connecting-ip', v_h->>'x-forwarded-for', ''), ',', 1)), '');
  v_hash := case when v_ip is null then null else md5('noob-views:' || v_ip) end;
  if v_ua ~* '(bot|crawl|spider|slurp|headless|lighthouse|facebookexternalhit|preview|monitor|curl/|python-requests)' then
    v_views := case when p_kind = 'reel' then (select views_count from public.reels where id = p_id) else (select views_count from public.long_videos where id = p_id) end;
    return jsonb_build_object('success', true, 'counted', false, 'viewsCount', v_views);
  end if;
  begin
    insert into public.public_content_views (kind, item_id, visitor, ip_hash) values (p_kind, p_id, v_id, v_hash);
    v_rows := 1;
  exception when unique_violation then v_rows := 0;
  end;
  if v_rows = 1 then
    if p_kind = 'reel' then update public.reels set views_count = views_count + 1 where id = p_id;
    else update public.long_videos set views_count = views_count + 1 where id = p_id; end if;
  end if;
  v_views := case when p_kind = 'reel' then (select views_count from public.reels where id = p_id) else (select views_count from public.long_videos where id = p_id) end;
  return jsonb_build_object('success', true, 'counted', v_rows = 1, 'viewsCount', v_views);
end;
$$;

revoke execute on function public.public_reel(uuid), public.public_video(uuid), public.public_post(uuid), public.public_profile(text), public.record_public_view(text, uuid, text) from public;
grant execute on function public.public_reel(uuid), public.public_video(uuid), public.public_post(uuid), public.public_profile(text), public.record_public_view(text, uuid, text) to anon, authenticated;
