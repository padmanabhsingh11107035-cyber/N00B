-- 20261114000021: Privacy gap B, stage 2a: the six functions the app calls directly (search_users, user_by_id, mutual_followers, post_likers, reel_likers, user_public_json) read the profile through definer helpers instead of the table
-- Part of docs/PRIVACY-GAP-B-PLAN.md (owner decisions D1 to D3 taken: nothing visible changes).
-- LIVE EFFECT: none visible: every answer is byte-identical (proved by scripts/supabase/test-privacy-gap-b.mjs). Adds one helper, profile_search_candidates.
-- Safe to run twice (create or replace / on conflict do nothing). No table row is changed, nothing is deleted.
-- ROLLBACK: supabase/one-off/rollback-gapb-stage2a.sql

-- the people list: the id list, the where-clause and the 300 limit stay exactly as in search_users, only the profile read moves inside a definer function
create or replace function public.profile_search_candidates(p_search text default '')
returns table (id uuid, created_at timestamptz, pin timestamptz)
language sql stable security definer set search_path = public as $$
  select pr.id, pr.created_at, public.explore_pinned_at(pr.id) as pin from public.profiles pr
  where (btrim(coalesce(p_search, '')) = ''
     or pr.username ilike '%' || btrim(p_search) || '%'
     or pr.display_name ilike '%' || btrim(p_search) || '%'
     or pr.bio ilike '%' || btrim(p_search) || '%')
    and not public.is_hidden_from_me(pr.id)
  order by public.explore_pinned_at(pr.id) desc nulls last, pr.created_at desc limit 300
$$;
revoke all on function public.profile_search_candidates(text) from public, anon;
grant execute on function public.profile_search_candidates(text) to authenticated, service_role;

create or replace function public.search_users(p_search text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(
           case when x.pin is not null then public.user_public_json_by_id(x.id) || jsonb_build_object('pinned', true)
                else public.user_public_json_by_id(x.id) end
           order by x.pin desc nulls last, x.created_at desc), '[]'::jsonb)
  from public.profile_search_candidates(p_search) x;
$function$;

create or replace function public.user_by_id(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select public.user_public_json_by_id(b.id) from public.profile_brief(p_id) b
  where not public.is_hidden_from_me(b.id);
$function$;

create or replace function public.mutual_followers(p_target uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id, 'username', x.username, 'displayName', x.display_name, 'avatar', x.avatar
  )), '[]'::jsonb)
  from (
    select p.id, p.username, p.display_name, p.avatar
    from public.follows mine
    join public.follows theirs on theirs.follower_id = mine.followee_id
    join lateral public.profile_brief(mine.followee_id) p on true
    where mine.follower_id = auth.uid()
      and theirs.followee_id = p_target
      and mine.followee_id <> p_target
    order by p.username
    limit 50
  ) x;
$function$;

create or replace function public.post_likers(p_post uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.posts where id = p_post) then raise exception 'You cannot view this post.' using errcode = '42501'; end if;
  return jsonb_build_object('users', coalesce((
    select jsonb_agg(public.user_list_json_by_id(l.user_id) order by l.created_at desc)
    from public.post_likes l where l.post_id = p_post), '[]'::jsonb));
end;
$function$;

create or replace function public.reel_likers(p_reel uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.reels where id = p_reel) then raise exception 'You cannot view this reel.' using errcode = '42501'; end if;
  return jsonb_build_object('users', coalesce((
    select jsonb_agg(public.user_list_json_by_id(l.user_id) order by l.created_at desc)
    from public.reel_likes l where l.reel_id = p_reel), '[]'::jsonb));
end;
$function$;

create or replace function public.user_public_json(p profiles)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'displayName', p.display_name, 'avatar', p.avatar,
    'isLiveAvatar', p.is_live_avatar, 'liveAvatarVideoUrl', p.live_avatar_video_url,
    'bio', p.bio, 'accountType', p.account_type,
    'isBusiness', p.is_business, 'businessCategory', p.business_category,
    'isVerified', p.is_verified, 'verificationTier', p.verification_tier, 'proTier', p.pro_tier,
    'website', p.website, 'city', p.city, 'pronouns', p.pronouns,
    'socialLinks', p.social_links, 'interests', to_jsonb(p.interests), 'externalLinks', p.external_links,
    'customLinks', p.custom_links, 'crossProfiles', p.cross_profiles, 'statusNote', p.status_note,
    'followersCount', p.followers_count, 'followingCount', p.following_count, 'postsCount', p.posts_count,
    'noobPoints', p.noob_points, 'gamesWonCount', p.games_won_count, 'gamesPlayedCount', p.games_played_count,
    'isAi', p.is_ai, 'isAdmin', p.is_admin, 'createdAt', p.created_at,
    'followingIds', coalesce((
      select jsonb_agg(f.followee_id) from public.follows f
       where f.follower_id = p.id
         and (
           auth.uid() is null or public.is_admin()
           or f.followee_id = auth.uid()                                                    -- the reader themselves: always visible to them
           or (
             public.can_see_follow_edges_of(p.id)                                           -- may the reader see this account's follow rows at all?
             and (not public.profile_is_private(f.followee_id)
                  or exists (select 1 from public.follows mine where mine.follower_id = auth.uid() and mine.followee_id = f.followee_id))
           )
         )
    ), '[]'::jsonb),
    'isFollowing', exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id),
    'isFollowRequested', exists (select 1 from public.follow_requests r where r.requester_id = auth.uid() and r.target_id = p.id)
  );
$function$;
