-- "Remove follower": on your OWN followers list, you can remove someone who follows you, without
-- unfollowing them yourself (that's the existing toggle_follow, which only ever acts in the other
-- direction - me as follower_id). Same delete hide_profile_from/block_user already do as a side
-- effect, pulled out into its own minimal action.

create or replace function public.remove_follower(p_follower uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cnt int;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  delete from public.follows where follower_id = p_follower and followee_id = me;
  select count(*) into cnt from public.follows where followee_id = me;
  return jsonb_build_object('success', true, 'followersCount', cnt);
end;
$$;
grant execute on function public.remove_follower(uuid) to authenticated;
