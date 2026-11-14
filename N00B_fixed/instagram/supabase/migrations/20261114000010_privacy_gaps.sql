-- PRIVACY GAPS (follow-up to 20261114000009). Read docs/PRIVACY-HARDENING-2026-11-14.md ("Gaps closed") first.
-- Run AFTER 20261114000009. Safe to run twice (create or replace of one function, nothing else). Nothing is deleted or rewritten.
--
-- GAP A: user_public_json() handed out 'followingIds' (who an account follows) for EVERY account, private ones too, to any logged-in reader.
--   Now the list is the same only when the reader may see that account's follow rows (the account itself, an admin, a reader who follows it, or a non-private account),
--   and even then a PRIVATE account that the reader does not follow is left out of the list (so a private account's follower list cannot be rebuilt from other people's lists).
--   If the reader may NOT see the account's follow rows, the list is empty EXCEPT the reader's own id when that account follows the reader (the reader can already see that row, and the app
--   uses it for "follows you" and for who may start a chat). The counts (followersCount, followingCount) are untouched.
--   The reader's own list is complete (they follow every id in it). A call without a logged-in person (server side, auth.uid() is null) gets the old full answer.
--   Same signature, same security mode (invoker), same grants, same keys, same other fields as the 20260928000002 version.
-- GAP B: not changed on purpose, see the doc.

create or replace function public.user_public_json(p public.profiles) returns jsonb
language sql stable set search_path = public as $$
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
$$;
