-- ROLLBACK of 20261114000021_gapb_stage2a_direct_functions.sql (not a migration: run by hand in the SQL editor only if that stage has to be undone; it restores the previous definitions exactly).
-- Do not run before the later stages are rolled back too (newest first), and never while the row rule of stage 5 is on.
begin;

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
  from (
    select pr.id, pr.created_at, public.explore_pinned_at(pr.id) as pin from public.profiles pr
    where (btrim(coalesce(p_search, '')) = ''
       or pr.username ilike '%' || btrim(p_search) || '%'
       or pr.display_name ilike '%' || btrim(p_search) || '%'
       or pr.bio ilike '%' || btrim(p_search) || '%')
      and not public.is_hidden_from_me(pr.id)
    order by public.explore_pinned_at(pr.id) desc nulls last, pr.created_at desc limit 300
  ) x;
$function$;

create or replace function public.user_by_id(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select public.user_public_json_by_id(pr.id) from public.profiles pr
  where pr.id = p_id and not public.is_hidden_from_me(pr.id);
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
    join public.profiles p on p.id = mine.followee_id
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
    select jsonb_agg(public.user_list_json_by_id(pr.id) order by l.created_at desc)
    from public.post_likes l join public.profiles pr on pr.id = l.user_id where l.post_id = p_post), '[]'::jsonb));
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
    select jsonb_agg(public.user_list_json_by_id(pr.id) order by l.created_at desc)
    from public.reel_likes l join public.profiles pr on pr.id = l.user_id where l.reel_id = p_reel), '[]'::jsonb));
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
             and (not exists (select 1 from public.profiles q where q.id = f.followee_id and q.account_type = 'private')
                  or exists (select 1 from public.follows mine where mine.follower_id = auth.uid() and mine.followee_id = f.followee_id))
           )
         )
    ), '[]'::jsonb),
    'isFollowing', exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id),
    'isFollowRequested', exists (select 1 from public.follow_requests r where r.requester_id = auth.uid() and r.target_id = p.id)
  );
$function$;

drop function if exists public.profile_search_candidates(text);

commit;
