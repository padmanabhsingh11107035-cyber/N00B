-- NOOB — look up one person's public profile by their id. Posts and reels only carry a small, denormalized copy of their author (username,
-- avatar, display name) for speed — this lets the app fetch the REAL, full profile the moment someone taps that author, so "view profile"
-- from a post or a reel shows a real, complete profile page. Same visibility rule as search_users (nobody who hid from you shows up).
create or replace function public.user_by_id(p_id uuid) returns jsonb
language sql stable set search_path = public as $$
  select public.user_public_json(pr) from public.profiles pr
  where pr.id = p_id and not public.is_hidden_from_me(pr.id);
$$;
revoke execute on function public.user_by_id(uuid) from public, anon;
grant execute on function public.user_by_id(uuid) to authenticated, service_role;
