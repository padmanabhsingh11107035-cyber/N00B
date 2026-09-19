-- NOOB — Supabase phase 1: sign-up/login, profiles, follows, posts, likes, comments, notifications.
--
-- Everything the old Express server did for these features, as database functions the
-- browser calls directly. Rule of thumb used throughout:
--   * plain reads/writes that row-level security already protects go straight to the tables;
--   * anything that must also award points, notify someone, enforce a daily limit or touch
--     protected columns is a function (SECURITY DEFINER where it has to bypass RLS, with its
--     own explicit permission checks, because RLS does not apply to it).
-- Replies use the same JSON shapes (camelCase) the old server returned, so screens don't change.

-- ===========================================================================
-- 0. Small additions
-- ===========================================================================

-- "Clear notifications" hides them for ONE person (broadcasts are shared rows).
create table public.notification_clears (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  primary key (notification_id, user_id)
);
alter table public.notification_clears enable row level security;
create policy notification_clears_owner on public.notification_clears for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, delete on public.notification_clears to authenticated;
grant all on public.notification_clears to service_role;

-- Follows, posts and post-publishing go through functions (points, limits, notifications),
-- so direct inserts are no longer allowed.
drop policy follows_insert on public.follows;
revoke insert on public.follows from authenticated;
drop policy posts_insert on public.posts;
revoke insert on public.posts from authenticated;

-- ===========================================================================
-- 1. Rules parity with the old server
-- ===========================================================================

-- A private account's content is visible to the author, to accounts that follow them,
-- and to accounts THEY follow (exactly the old isAuthorVisibleTo rule). Blocks hide it both ways.
create or replace function public.can_view_author(author uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    author = auth.uid()
    or public.is_admin()
    or (
      not exists (
        select 1 from public.blocks b
        where (b.blocker_id = author and b.blocked_id = auth.uid())
           or (b.blocker_id = auth.uid() and b.blocked_id = author)
      )
      and (
        (select p.account_type from public.profiles p where p.id = author) <> 'private'
        or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = author)
        or exists (select 1 from public.follows f where f.follower_id = author and f.followee_id = auth.uid())
      )
    );
$$;

-- Login by username OR email: return the account's real Auth login address.
create or replace function public.resolve_login_email(identifier text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (
      select u.email
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.profile_private pp on pp.user_id = p.id
      where lower(p.username) = lower(btrim(identifier))
         or lower(pp.email) = lower(btrim(identifier))
      order by p.created_at asc
      limit 1
    ),
    gen_random_uuid()::text || '@users.nooob.xyz'   -- well-formed decoy: no account probing
  );
$$;

-- ===========================================================================
-- 2. Points and notifications (used by everything below)
-- ===========================================================================

create or replace function public.award_points(p_user uuid, p_amount bigint, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare balance bigint;
begin
  update public.profiles set noob_points = noob_points + p_amount where id = p_user returning noob_points into balance;
  if found then
    insert into public.noob_transactions (user_id, amount, reason, balance_after) values (p_user, p_amount, p_reason, balance);
  end if;
end;
$$;

create or replace function public.notify_user(
  p_target uuid, p_type text, p_actor uuid, p_message text,
  p_title text default null, p_post uuid default null, p_reel uuid default null,
  p_chat uuid default null, p_action_status text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare nid uuid;
begin
  insert into public.notifications (target_user_id, actor_id, type, title, message, post_id, reel_id, chat_id, action_status)
  values (p_target, p_actor, p_type, p_title, p_message, p_post, p_reel, p_chat, p_action_status)
  returning id into nid;
  return nid;
end;
$$;

-- ===========================================================================
-- 3. Sign-up
-- ===========================================================================

-- Friendly pre-flight for the sign-up form (Auth itself only reports "database error").
-- Same rules and messages as the old server; callable while logged out.
create or replace function public.check_signup(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  clean text;
  dob date;
  age numeric;
  em text := lower(btrim(coalesce(p->>'email', '')));
  mob text := btrim(coalesce(p->>'mobileNumber', ''));
begin
  if btrim(coalesce(p->>'firstName', '')) = '' then return jsonb_build_object('error', 'Please enter your name'); end if;
  if em = '' then return jsonb_build_object('error', 'Email address is required'); end if;
  if btrim(coalesce(p->>'username', '')) = '' then return jsonb_build_object('error', 'User ID / Username is required'); end if;
  if coalesce(p->>'password', '') = '' then return jsonb_build_object('error', 'Password is required'); end if;
  if btrim(coalesce(p->>'bio', '')) = '' then return jsonb_build_object('error', 'Bio is compulsory. Please write a short bio about yourself.'); end if;
  if mob = '' then return jsonb_build_object('error', 'Mobile number is required'); end if;
  if coalesce((p->>'agreedToTerms')::boolean, false) is not true then
    return jsonb_build_object('error', 'You must agree to NOOB''s general terms and privacy policy');
  end if;

  if coalesce(p->>'dateOfBirth', '') = '' then return jsonb_build_object('error', 'Date of birth is required'); end if;
  begin
    dob := (p->>'dateOfBirth')::date;
  exception when others then
    return jsonb_build_object('error', 'Please enter a valid date of birth');
  end;
  if dob > current_date then return jsonb_build_object('error', 'Please enter a valid date of birth'); end if;
  age := (current_date - dob) / 365.25;
  if age < 13 then return jsonb_build_object('error', 'You must be at least 13 years old to create a NOOB account'); end if;
  if age > 82 then return jsonb_build_object('error', 'NOOB accounts are only available to users 82 years old or younger'); end if;

  clean := regexp_replace(lower(btrim(p->>'username')), '[^a-z0-9_.]', '', 'g');
  if clean = '' then return jsonb_build_object('error', 'User ID contains invalid characters'); end if;
  if exists (select 1 from public.profiles where lower(username) = clean) then
    return jsonb_build_object('error', 'User ID is already taken. Please choose another.');
  end if;

  -- a suspended person can't just sign up again under a new name
  if exists (
    select 1 from public.profiles pr join public.profile_private pp on pp.user_id = pr.id
    where pr.is_suspended and (lower(pp.email) = em or (mob <> '' and pp.mobile_number = mob))
  ) then
    return jsonb_build_object(
      'error', 'This account is suspended.', 'suspended', true,
      'message', 'We have detected that your account is suspended, and attempting to create a new account could result in further action against you. Please wait — our team will contact you.'
    );
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Creates the profile the moment Auth creates a login account. Accounts made by the
-- data import carry a "legacy_id" marker and bring their own profile, so they are skipped.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  clean text := regexp_replace(lower(btrim(coalesce(m->>'username', ''))), '[^a-z0-9_.]', '', 'g');
  kind text := case when m->>'account_type' in ('private', 'business') then m->>'account_type' else 'public' end;
  first_n text := btrim(coalesce(m->>'first_name', ''));
  last_n text := btrim(coalesce(m->>'last_name', ''));
  admin_id uuid;
begin
  if m ? 'legacy_id' or clean = '' then
    return new;
  end if;

  insert into public.profiles (id, username, display_name, avatar, bio, account_type, is_business, business_category)
  values (
    new.id, clean,
    coalesce(nullif(btrim(m->>'display_name'), ''), nullif(btrim(first_n || ' ' || last_n), ''), clean),
    coalesce(nullif(m->>'avatar', ''), '/noob-logo.svg.jpeg'),
    coalesce(nullif(btrim(m->>'bio'), ''), '🎉 Here for fun, laughs & connecting with cool people!'),
    kind, kind = 'business',
    case when kind = 'business' then coalesce(nullif(m->>'business_category', ''), 'Creator & Brand') else nullif(m->>'business_category', '') end
  );

  insert into public.profile_private (
    user_id, email, first_name, last_name, country_code, mobile_number, date_of_birth, gender,
    business_email, business_phone, business_address, business_addresses, agreed_to_terms
  ) values (
    new.id, lower(nullif(btrim(m->>'email'), '')), nullif(first_n, ''), nullif(last_n, ''),
    coalesce(nullif(m->>'country_code', ''), '+91 (IN)'), nullif(btrim(m->>'mobile_number'), ''),
    nullif(m->>'date_of_birth', '')::date, coalesce(nullif(m->>'gender', ''), 'Prefer not to say'),
    case when kind = 'business' then coalesce(nullif(m->>'business_email', ''), lower(nullif(btrim(m->>'email'), ''))) else nullif(m->>'business_email', '') end,
    case when kind = 'business' then coalesce(nullif(m->>'business_phone', ''), nullif(btrim(m->>'mobile_number'), '')) else nullif(m->>'business_phone', '') end,
    nullif(m->>'business_address', ''),
    case when nullif(m->>'business_address', '') is null then '{}'::text[] else array[m->>'business_address'] end,
    coalesce((m->>'agreed_to_terms')::boolean, false)
  );

  -- everyone starts out following the official NOOB account
  select id into admin_id from public.profiles where is_admin and lower(username) = 'noob' limit 1;
  if admin_id is not null and admin_id <> new.id then
    insert into public.follows (follower_id, followee_id) values (new.id, admin_id) on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- 4. JSON shapes (what the old server sent, so screens keep working)
-- ===========================================================================

create or replace function public.user_public_json(p public.profiles) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar,
    'isLiveAvatar', p.is_live_avatar, 'bio', p.bio, 'accountType', p.account_type,
    'isBusiness', p.is_business, 'businessCategory', p.business_category,
    'isVerified', p.is_verified, 'verificationTier', p.verification_tier, 'proTier', p.pro_tier,
    'website', p.website, 'city', p.city, 'pronouns', p.pronouns,
    'socialLinks', p.social_links, 'interests', to_jsonb(p.interests), 'externalLinks', p.external_links,
    'customLinks', p.custom_links, 'crossProfiles', p.cross_profiles, 'statusNote', p.status_note,
    'followersCount', p.followers_count, 'followingCount', p.following_count, 'postsCount', p.posts_count,
    'noobPoints', p.noob_points, 'gamesWonCount', p.games_won_count, 'gamesPlayedCount', p.games_played_count,
    'isAi', p.is_ai, 'isAdmin', p.is_admin, 'createdAt', p.created_at,
    'followingIds', coalesce((select jsonb_agg(f.followee_id) from public.follows f where f.follower_id = p.id), '[]'::jsonb),
    'isFollowing', exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id),
    'isFollowRequested', exists (select 1 from public.follow_requests r where r.requester_id = auth.uid() and r.target_id = p.id)
  );
$$;

-- The signed-in user's OWN full record (adds contact details, block list, requests, wallet history).
create or replace function public.get_my_user() returns jsonb
language sql stable set search_path = public as $$
  select public.user_public_json(p) || jsonb_build_object(
    'email', pp.email, 'firstName', pp.first_name, 'lastName', pp.last_name,
    'countryCode', pp.country_code, 'mobileNumber', pp.mobile_number, 'dateOfBirth', pp.date_of_birth,
    'gender', pp.gender, 'businessEmail', pp.business_email, 'businessPhone', pp.business_phone,
    'businessAddress', pp.business_address, 'businessAddresses', to_jsonb(coalesce(pp.business_addresses, '{}')),
    'agreedToTerms', pp.agreed_to_terms, 'suspendedReason', pp.suspended_reason,
    'isSuspended', p.is_suspended, 'privacySettings', p.privacy_settings,
    'proBilling', p.pro_billing, 'proAutoRenew', p.pro_auto_renew, 'proRenewsAt', p.pro_renews_at,
    'purchasedItemIds', to_jsonb(p.purchased_item_ids),
    'blockedUserIds', coalesce((select jsonb_agg(b.blocked_id) from public.blocks b where b.blocker_id = p.id), '[]'::jsonb),
    'followRequests', coalesce((
      select jsonb_agg(jsonb_build_object('userId', r.requester_id, 'username', q.username, 'displayName', q.display_name,
                                          'avatar', q.avatar, 'requestedAt', r.created_at) order by r.created_at desc)
      from public.follow_requests r join public.profiles q on q.id = r.requester_id where r.target_id = p.id), '[]'::jsonb),
    'pendingSentRequests', coalesce((select jsonb_agg(r.target_id) from public.follow_requests r where r.requester_id = p.id), '[]'::jsonb),
    'noobTransactions', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'amount', t.amount, 'reason', t.reason, 'timestamp', t.created_at, 'balanceAfter', t.balance_after)
                       order by t.created_at desc)
      from (select * from public.noob_transactions where user_id = p.id order by created_at desc limit 200) t), '[]'::jsonb)
  )
  from public.profiles p
  left join public.profile_private pp on pp.user_id = p.id
  where p.id = auth.uid();
$$;

create or replace function public.search_users(p_search text default '') returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(public.user_public_json(x.pr) order by (x.pr).created_at desc), '[]'::jsonb)
  from (
    select pr from public.profiles pr
    where btrim(coalesce(p_search, '')) = ''
       or pr.username ilike '%' || btrim(p_search) || '%'
       or pr.display_name ilike '%' || btrim(p_search) || '%'
       or pr.bio ilike '%' || btrim(p_search) || '%'
    order by pr.created_at desc limit 300
  ) x;
$$;

create or replace function public.post_json(p public.posts) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'userId', p.user_id, 'username', a.username, 'displayName', a.display_name,
    'userAvatar', a.avatar, 'isVerified', a.is_verified,
    'caption', p.caption, 'location', p.location, 'createdAt', p.created_at,
    'slides', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'mediaUrl', s.media_url, 'objectKey', s.media_url, 'mediaType', s.media_type,
                                          'caption', s.caption, 'filter', s.filter, 'taggedUsers', s.tagged_users, 'productTags', s.product_tags)
                       order by s.position)
      from public.post_slides s where s.post_id = p.id), '[]'::jsonb),
    'likesCount', p.likes_count, 'commentsCount', p.comments_count, 'sharesCount', p.shares_count, 'savesCount', p.saves_count,
    'isLiked', exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    'isSaved', exists (select 1 from public.post_saves sv where sv.post_id = p.id and sv.user_id = auth.uid()),
    'isPinnedToProfile', p.is_pinned_to_profile, 'isArchived', p.is_archived, 'isCommentsDisabled', p.is_comments_disabled,
    'isLikeCountHidden', p.is_like_count_hidden, 'isSponsored', p.is_sponsored, 'isCollab', p.is_collab,
    'collabUsername', p.collab_username, 'taggedUsers', p.tagged_users, 'hasAiLabel', p.has_ai_label,
    'hashtags', to_jsonb(p.hashtags), 'audioTrack', p.audio_track, 'category', p.category,
    'textBgStyle', p.text_bg_style, 'webLink', p.web_link, 'scheduledFor', p.scheduled_for
  )
  from public.profiles a where a.id = p.user_id;
$$;

-- ===========================================================================
-- 5. Profile
-- ===========================================================================

-- Whitelisted self-service profile edit (the old /users/profile/update and PUT /users/me).
-- Points, verification, admin flag etc. can never be reached through here.
create or replace function public.update_my_profile(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  cur public.profiles;
  clean text;
  dob date;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select * into cur from public.profiles where id = me;
  if not found then raise exception 'User not found'; end if;

  if p ? 'username' and lower(btrim(p->>'username')) <> lower(cur.username) then
    clean := regexp_replace(lower(btrim(p->>'username')), '[^a-z0-9_.]', '', 'g');
    if clean = '' then raise exception 'User ID contains invalid characters'; end if;
    if exists (select 1 from public.profiles where id <> me and lower(username) = clean) then
      raise exception 'Username is already taken by another account.' using errcode = '23505';
    end if;
    update public.profiles set username = clean where id = me;
  end if;

  if p ? 'dateOfBirth' and nullif(p->>'dateOfBirth', '') is not null then
    begin dob := (p->>'dateOfBirth')::date; exception when others then raise exception 'Please enter a valid date of birth.'; end;
    if dob > current_date then raise exception 'Please enter a valid date of birth.'; end if;
    if (current_date - dob) / 365.25 < 13 then raise exception 'You must be at least 13 years old to use NOOB.'; end if;
    if (current_date - dob) / 365.25 > 82 then raise exception 'NOOB accounts are only available to users 82 years old or younger.'; end if;
    update public.profile_private set date_of_birth = dob where user_id = me;
  end if;

  if p ? 'email' and nullif(btrim(p->>'email'), '') is not null then
    if lower(btrim(p->>'email')) !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'Please enter a valid email address.'; end if;
    update public.profile_private set email = lower(btrim(p->>'email')) where user_id = me;
  end if;

  update public.profiles set
    display_name      = coalesce(nullif(btrim(p->>'displayName'), ''), display_name),
    avatar            = coalesce(nullif(p->>'avatar', ''), avatar),
    bio               = case when p ? 'bio' then btrim(coalesce(p->>'bio', '')) else bio end,
    website           = case when p ? 'website' then btrim(coalesce(p->>'website', '')) else website end,
    city              = case when p ? 'city' then btrim(coalesce(p->>'city', '')) else city end,
    pronouns          = case when p ? 'pronouns' then p->>'pronouns' else pronouns end,
    account_type      = case when p->>'accountType' in ('public', 'private', 'business') then p->>'accountType' else account_type end,
    is_business       = case when p->>'accountType' in ('public', 'private', 'business') then p->>'accountType' = 'business'
                             when p ? 'isBusiness' then (p->>'isBusiness')::boolean else is_business end,
    business_category = case when p ? 'businessCategory' then p->>'businessCategory' else business_category end,
    interests         = case when jsonb_typeof(p->'interests') = 'array' then array(select jsonb_array_elements_text(p->'interests')) else interests end,
    social_links      = case when jsonb_typeof(p->'socialLinks') = 'object' then p->'socialLinks' else social_links end,
    external_links    = case when jsonb_typeof(p->'externalLinks') = 'array' then p->'externalLinks' else external_links end,
    custom_links      = case when jsonb_typeof(p->'customLinks') = 'array' then p->'customLinks' else custom_links end,
    cross_profiles    = case when jsonb_typeof(p->'crossProfiles') = 'array' then p->'crossProfiles' else cross_profiles end,
    privacy_settings  = case when jsonb_typeof(p->'privacySettings') = 'object' then p->'privacySettings' else privacy_settings end,
    status_note       = case when p ? 'statusNote' then nullif(p->'statusNote', 'null'::jsonb) else status_note end
  where id = me;

  update public.profile_private set
    first_name       = coalesce(nullif(btrim(p->>'firstName'), ''), first_name),
    last_name        = coalesce(nullif(btrim(p->>'lastName'), ''), last_name),
    country_code     = coalesce(nullif(p->>'countryCode', ''), country_code),
    mobile_number    = case when p ? 'mobileNumber' then btrim(coalesce(p->>'mobileNumber', '')) else mobile_number end,
    gender           = case when p ? 'gender' then p->>'gender' else gender end,
    business_email   = case when p ? 'businessEmail' then p->>'businessEmail' else business_email end,
    business_phone   = case when p ? 'businessPhone' then p->>'businessPhone' else business_phone end,
    business_address = case when p ? 'businessAddress' then p->>'businessAddress' else business_address end,
    business_addresses = case when jsonb_typeof(p->'businessAddresses') = 'array' then array(select jsonb_array_elements_text(p->'businessAddresses')) else business_addresses end
  where user_id = me;

  return public.get_my_user();
end;
$$;

-- Google Play requires self-service deletion. Password-gated; the main NOOB admin can't be deleted.
create or replace function public.delete_my_account(p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me uuid := auth.uid(); enc text; prof public.profiles;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select * into prof from public.profiles where id = me;
  select encrypted_password into enc from auth.users where id = me;
  if coalesce(p_password, '') = '' or enc is null or crypt(p_password, enc) <> enc then
    raise exception 'Incorrect password. Please re-enter your password to confirm deletion.' using errcode = '28P01';
  end if;
  if prof.is_admin or lower(prof.username) = 'noob' then
    raise exception 'The primary NOOB administrator account cannot be deleted this way.';
  end if;
  delete from auth.users where id = me;   -- cascades to the profile and everything they made
  return jsonb_build_object('success', true, 'message', 'Your account and all associated content have been permanently deleted.');
end;
$$;

-- ===========================================================================
-- 6. Follows
-- ===========================================================================

create or replace function public.follow_requests_json(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('userId', r.requester_id, 'username', q.username, 'displayName', q.display_name,
                                               'avatar', q.avatar, 'requestedAt', r.created_at) order by r.created_at desc), '[]'::jsonb)
  from public.follow_requests r join public.profiles q on q.id = r.requester_id
  where r.target_id = p_user and p_user = auth.uid();
$$;

-- Follow / unfollow / cancel a pending request — private accounts queue a request instead.
create or replace function public.toggle_follow(p_target uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.profiles;
begin
  if me is null then raise exception 'Unauthorized' using errcode = '28000'; end if;
  if p_target = me then raise exception 'You can''t follow yourself.'; end if;
  if (select is_suspended from public.profiles where id = me) then raise exception 'Unauthorized' using errcode = '28000'; end if;
  select * into t from public.profiles where id = p_target;
  if not found then raise exception 'User not found'; end if;

  if exists (select 1 from public.follows where follower_id = me and followee_id = p_target) then
    delete from public.follows where follower_id = me and followee_id = p_target;
  elsif exists (select 1 from public.follow_requests where requester_id = me and target_id = p_target) then
    delete from public.follow_requests where requester_id = me and target_id = p_target;
    delete from public.notifications
      where type = 'follow_request_received' and target_user_id = p_target and actor_id = me and action_status = 'pending';
  else
    if exists (select 1 from public.blocks b where (b.blocker_id = p_target and b.blocked_id = me) or (b.blocker_id = me and b.blocked_id = p_target)) then
      raise exception 'You can''t follow this account.';
    end if;
    if t.account_type = 'private' then
      insert into public.follow_requests (requester_id, target_id) values (me, p_target) on conflict do nothing;
      perform public.notify_user(p_target, 'follow_request_received', me, 'wants to follow you.', null, null, null, null, 'pending');
    else
      insert into public.follows (follower_id, followee_id) values (me, p_target) on conflict do nothing;
      perform public.notify_user(p_target, 'new_follower', me, 'started following you.');
    end if;
  end if;

  return jsonb_build_object(
    'success', true,
    'isFollowing', exists (select 1 from public.follows where follower_id = me and followee_id = p_target),
    'isFollowRequested', exists (select 1 from public.follow_requests where requester_id = me and target_id = p_target),
    'followersCount', (select followers_count from public.profiles where id = p_target)
  );
end;
$$;

create or replace function public.accept_follow_request(p_requester uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Unauthorized' using errcode = '28000'; end if;
  if not exists (select 1 from public.follow_requests where requester_id = p_requester and target_id = me) then
    raise exception 'No pending request from this user.';
  end if;
  delete from public.follow_requests where requester_id = p_requester and target_id = me;
  insert into public.follows (follower_id, followee_id) values (p_requester, me) on conflict do nothing;
  update public.notifications set action_status = 'accepted'
    where type = 'follow_request_received' and target_user_id = me and actor_id = p_requester and action_status = 'pending';
  perform public.notify_user(p_requester, 'follow_request_accepted', me, 'accepted your follow request.');
  return jsonb_build_object('success', true, 'followersCount', (select followers_count from public.profiles where id = me),
                            'followRequests', public.follow_requests_json(me));
end;
$$;

create or replace function public.decline_follow_request(p_requester uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Unauthorized' using errcode = '28000'; end if;
  delete from public.follow_requests where requester_id = p_requester and target_id = me;
  update public.notifications set action_status = 'declined'
    where type = 'follow_request_received' and target_user_id = me and actor_id = p_requester and action_status = 'pending';
  return jsonb_build_object('success', true, 'followRequests', public.follow_requests_json(me));
end;
$$;

-- ===========================================================================
-- 7. Posts
-- ===========================================================================

create or replace function public.feed_posts(p_limit integer default 200) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(public.post_json(x.po) order by (x.po).created_at desc), '[]'::jsonb)
  from (select po from public.posts po order by po.created_at desc limit least(greatest(p_limit, 1), 500)) x;
$$;

create or replace function public.liked_posts() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(public.post_json(p) order by l.created_at desc), '[]'::jsonb)
  from public.post_likes l join public.posts p on p.id = l.post_id where l.user_id = auth.uid();
$$;

create or replace function public.saved_posts() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(public.post_json(p) order by s.created_at desc), '[]'::jsonb)
  from public.post_saves s join public.posts p on p.id = s.post_id where s.user_id = auth.uid();
$$;

create or replace function public.archived_posts() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(public.post_json(p) order by p.created_at desc), '[]'::jsonb)
  from public.posts p where p.user_id = auth.uid() and p.is_archived;
$$;

-- Publishing: free accounts get one post OR reel per day; +25 points.
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
    insert into public.post_slides (id, post_id, position, media_url, media_type, caption, filter, tagged_users, product_tags)
    values (
      case when s->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (s->>'id')::uuid else gen_random_uuid() end,
      new_id, i, media,
      case when s->>'mediaType' in ('image', 'video', 'code') then s->>'mediaType' else 'image' end,
      nullif(s->>'caption', ''), nullif(s->>'filter', ''),
      coalesce(s->'taggedUsers', '[]'::jsonb), coalesce(s->'productTags', '[]'::jsonb)
    );
    i := i + 1;
  end loop;

  update public.profiles set extra = jsonb_set(extra, '{lastContentPostAt}', to_jsonb(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) where id = me;
  perform public.award_points(me, 25, 'Published a post');
  return (select public.post_json(p) from public.posts p where p.id = new_id);
end;
$$;

create or replace function public.toggle_post_like(p_post uuid) returns jsonb
language plpgsql set search_path = public as $$
declare me uuid := auth.uid(); liked boolean;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.posts where id = p_post) then raise exception 'Post not found'; end if;
  if exists (select 1 from public.post_likes where post_id = p_post and user_id = me) then
    delete from public.post_likes where post_id = p_post and user_id = me;
    liked := false;
  else
    insert into public.post_likes (post_id, user_id) values (p_post, me);
    liked := true;
  end if;
  return jsonb_build_object('success', true, 'isLiked', liked, 'likesCount', (select likes_count from public.posts where id = p_post));
end;
$$;

-- Liking notifies the author (not for liking your own post) — same as before.
create or replace function public.notify_post_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare author uuid;
begin
  -- Only fresh likes notify. Likes loaded by a data import carry their original (old)
  -- timestamp, so re-importing history never re-sends "X liked your post".
  if new.created_at < now() - interval '2 minutes' then
    return null;
  end if;
  select user_id into author from public.posts where id = new.post_id;
  if author is not null and author <> new.user_id then
    perform public.notify_user(author, 'post_like', new.user_id, 'liked your post.', null, new.post_id);
  end if;
  return null;
end;
$$;
create trigger post_likes_notify after insert on public.post_likes
  for each row execute function public.notify_post_like();

create or replace function public.toggle_post_save(p_post uuid) returns jsonb
language plpgsql set search_path = public as $$
declare me uuid := auth.uid(); saved boolean;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.posts where id = p_post) then raise exception 'Post not found'; end if;
  if exists (select 1 from public.post_saves where post_id = p_post and user_id = me) then
    delete from public.post_saves where post_id = p_post and user_id = me;
    saved := false;
  else
    insert into public.post_saves (post_id, user_id) values (p_post, me);
    saved := true;
  end if;
  return jsonb_build_object('success', true, 'isSaved', saved, 'savesCount', (select saves_count from public.posts where id = p_post));
end;
$$;

-- Owner (or admin) switches: archive / comments on-off / hide like count.
create or replace function public.toggle_post_flag(p_post uuid, p_flag text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid; v boolean;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select user_id into owner from public.posts where id = p_post;
  if owner is null then raise exception 'Post not found'; end if;
  if owner <> me and not public.is_admin() then raise exception 'You can only modify your own posts.' using errcode = '42501'; end if;
  if p_flag = 'archive' then
    update public.posts set is_archived = not is_archived where id = p_post returning is_archived into v;
    return jsonb_build_object('success', true, 'isArchived', v);
  elsif p_flag = 'comments' then
    update public.posts set is_comments_disabled = not is_comments_disabled where id = p_post returning is_comments_disabled into v;
    return jsonb_build_object('success', true, 'isCommentsDisabled', v);
  elsif p_flag = 'like_count' then
    update public.posts set is_like_count_hidden = not is_like_count_hidden where id = p_post returning is_like_count_hidden into v;
    return jsonb_build_object('success', true, 'isLikeCountHidden', v);
  end if;
  raise exception 'Unknown post setting.';
end;
$$;

create or replace function public.delete_post_slide(p_post uuid, p_slide uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select user_id into owner from public.posts where id = p_post;
  if owner is null then raise exception 'Post not found'; end if;
  if owner <> me and not public.is_admin() then raise exception 'You can only remove media from your own posts.' using errcode = '42501'; end if;
  if not exists (select 1 from public.post_slides where id = p_slide and post_id = p_post) then
    raise exception 'That picture/video was not found on this post.';
  end if;
  if (select count(*) from public.post_slides where post_id = p_post) <= 1 then
    raise exception 'This is the only picture/video on the post — delete the whole post instead.';
  end if;
  delete from public.post_slides where id = p_slide;
  -- keep positions contiguous
  update public.post_slides s set position = r.n
    from (select id, row_number() over (order by position) - 1 as n from public.post_slides where post_id = p_post) r
    where s.id = r.id and s.position <> r.n;
  return jsonb_build_object('success', true, 'post', (select public.post_json(p) from public.posts p where p.id = p_post));
end;
$$;

create or replace function public.record_post_view(p_post uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner uuid;
begin
  select user_id into owner from public.posts where id = p_post;
  if owner is null then raise exception 'Post not found'; end if;
  if me is not null and me <> owner and public.can_view_author(owner) then
    insert into public.post_views (post_id, user_id) values (p_post, me) on conflict do nothing;
  end if;
  return jsonb_build_object('success', true, 'viewsCount', (select count(*) from public.post_views where post_id = p_post));
end;
$$;

create or replace function public.post_likers(p_post uuid) returns jsonb
language plpgsql stable set search_path = public as $$
begin
  if not exists (select 1 from public.posts where id = p_post) then raise exception 'You cannot view this post.' using errcode = '42501'; end if;
  return jsonb_build_object('users', coalesce((
    select jsonb_agg(public.user_public_json(pr) order by l.created_at desc)
    from public.post_likes l join public.profiles pr on pr.id = l.user_id where l.post_id = p_post), '[]'::jsonb));
end;
$$;

create or replace function public.post_viewers(p_post uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select user_id into owner from public.posts where id = p_post;
  if owner is null then raise exception 'Post not found'; end if;
  if owner <> auth.uid() then raise exception 'Only the post owner can see who viewed it.' using errcode = '42501'; end if;
  return jsonb_build_object('users', coalesce((
    select jsonb_agg(public.user_public_json(pr) order by v.created_at desc)
    from public.post_views v join public.profiles pr on pr.id = v.user_id where v.post_id = p_post), '[]'::jsonb));
end;
$$;

-- ===========================================================================
-- 8. Comments
-- ===========================================================================

create or replace function public.comment_json(c public.comments) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'postId', c.post_id, 'reelId', c.reel_id, 'userId', c.user_id, 'username', a.username,
    'userAvatar', a.avatar, 'isVerified', a.is_verified, 'text', c.text, 'likesCount', c.likes_count,
    'isLiked', false, 'isPinned', c.is_pinned, 'createdAt', c.created_at)
  from public.profiles a where a.id = c.user_id;
$$;

create or replace function public.post_comments(p_post uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('comments', coalesce(jsonb_agg(public.comment_json(c) order by c.created_at desc), '[]'::jsonb))
  from public.comments c where c.post_id = p_post;
$$;

-- +5 points, notifies the post's author. Runs with elevated rights (it awards points and notifies),
-- so it checks by hand what row-level security would have: signed in, post visible to you, comments on.
create or replace function public.add_comment(p_post uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t text := btrim(coalesce(p_text, '')); cid uuid; owner uuid; disabled boolean;
begin
  if me is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if (select is_suspended from public.profiles where id = me) is not false then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if t = '' then raise exception 'Comment text cannot be empty'; end if;
  select user_id, is_comments_disabled into owner, disabled from public.posts where id = p_post;
  if owner is null then raise exception 'Post not found'; end if;
  if not public.can_view_author(owner) then raise exception 'You cannot view this post.' using errcode = '42501'; end if;
  if disabled then raise exception 'Comments are turned off for this post.' using errcode = '42501'; end if;
  insert into public.comments (post_id, user_id, text) values (p_post, me, t) returning id into cid;
  if owner <> me then
    perform public.notify_user(owner, 'post_comment', me,
      'commented: "' || left(t, 80) || case when length(t) > 80 then '…' else '' end || '"', null, p_post);
  end if;
  perform public.award_points(me, 5, 'Posted a comment');
  return jsonb_build_object('success', true, 'comment', (select public.comment_json(c) from public.comments c where c.id = cid));
end;
$$;

create or replace function public.toggle_pin_comment(p_comment uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.comments; owner uuid; v boolean;
begin
  select * into c from public.comments where id = p_comment;
  if not found then return jsonb_build_object('success', true, 'isPinned', false); end if;
  select user_id into owner from public.posts where id = c.post_id;
  if me is null or (owner is distinct from me and not public.is_admin()) then
    raise exception 'Only the post owner can pin comments.' using errcode = '42501';
  end if;
  update public.comments set is_pinned = not is_pinned where id = p_comment returning is_pinned into v;
  return jsonb_build_object('success', true, 'isPinned', v);
end;
$$;

-- ===========================================================================
-- 9. Notifications
-- ===========================================================================

create or replace function public.my_notifications() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('notifications', coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id, 'type', n.type, 'title', n.title, 'message', n.message, 'createdAt', n.created_at,
    'targetUserId', coalesce(n.target_user_id::text, 'all'),
    'actorId', n.actor_id, 'actorUsername', a.username, 'actorDisplayName', a.display_name, 'actorAvatar', a.avatar,
    'senderId', n.actor_id, 'senderUsername', a.username, 'senderDisplayName', a.display_name, 'senderAvatar', a.avatar,
    'senderIsVerified', coalesce(a.is_verified, false),
    'postId', n.post_id, 'reelId', n.reel_id, 'chatId', n.chat_id, 'actionStatus', n.action_status,
    'isRead', exists (select 1 from public.notification_reads r where r.notification_id = n.id and r.user_id = auth.uid())
  ) order by n.created_at desc), '[]'::jsonb))
  from public.notifications n
  left join public.profiles a on a.id = n.actor_id
  where auth.uid() is not null
    and (n.target_user_id = auth.uid() or n.target_user_id is null)
    and not exists (select 1 from public.notification_clears c where c.notification_id = n.id and c.user_id = auth.uid());
$$;

create or replace function public.mark_notifications_read() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  insert into public.notification_reads (notification_id, user_id)
  select n.id, auth.uid() from public.notifications n where n.target_user_id = auth.uid() or n.target_user_id is null
  on conflict do nothing;
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.clear_notifications() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  insert into public.notification_clears (notification_id, user_id)
  select n.id, auth.uid() from public.notifications n where n.target_user_id = auth.uid() or n.target_user_id is null
  on conflict do nothing;
  return jsonb_build_object('success', true);
end;
$$;

-- ===========================================================================
-- 10. App-wide settings (read)
-- ===========================================================================

create or replace function public.get_app_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(settings, '{}'::jsonb) || jsonb_build_object('storeEnabled', store_enabled, 'storeDeliveryFee', store_delivery_fee)
  from public.app_settings where id = 1;
$$;

-- ===========================================================================
-- 11. Who may call what
-- ===========================================================================
-- Nothing is callable by default. The signed-in role gets everything; the logged-out
-- visitor gets only the three sign-up / login helpers.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.resolve_login_email(text), public.username_taken(text), public.check_signup(jsonb) to anon;
alter default privileges in schema public revoke execute on functions from public, anon;

-- Internal helpers: only other database functions may call these — never a browser.
-- (Otherwise anyone could award themselves points or forge notifications.)
revoke execute on function public.award_points(uuid, bigint, text) from authenticated;
revoke execute on function public.notify_user(uuid, text, uuid, text, text, uuid, uuid, uuid, text) from authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.notify_post_like() from authenticated;
revoke execute on function public.bump_counter() from authenticated;
