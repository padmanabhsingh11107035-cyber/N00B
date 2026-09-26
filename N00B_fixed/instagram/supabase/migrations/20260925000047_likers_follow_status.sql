-- NOOB — the redesigned "Likes and views" sheet shows a Follow/Following/Requested button next to
-- each person in the list, so post_likers/post_viewers/reel_likers/reel_viewers (all built from
-- user_list_json) need the viewer's own follow relationship to each listed person.

create or replace function public.user_list_json(p public.profiles) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'displayName', p.display_name,
    'avatar', p.avatar, 'isVerified', p.is_verified,
    'isFollowing', exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id),
    'isFollowRequested', exists (select 1 from public.follow_requests fr where fr.requester_id = auth.uid() and fr.target_id = p.id)
  );
$$;
