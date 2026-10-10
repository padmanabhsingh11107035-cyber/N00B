-- Home page story tray (Instagram style): one call returns everything the tray needs.
--
--   stories      The live (24 h) stories this person may see on the home page:
--                  * their own, always;
--                  * every PUBLIC or BUSINESS account's, whether or not they follow each other;
--                  * a PRIVATE account's only when this person follows it (a private account's story is never shown to a
--                    stranger);
--                  * never from someone who blocked them / they blocked, never from someone who hid their profile from them,
--                    never from a suspended account;
--                  * a "Close Friends" story only to the author's Close Friends list (and the author).
--                The people are ranked (own, then people they follow, then the rest, newest story first) and capped at 60 so
--                the tray stays light; every story of those people is returned.
--   suggestions  Up to 10 random accounts to follow: public/business only, not themselves, not already followed, not blocked
--                either way, not hidden from them, not suspended, not an AI account, and not someone already in the tray with
--                a story. Different on every call and different for every person.
--
-- The existing active_stories() is left exactly as it was (the app falls back to it until this migration is run).
create or replace function public.home_story_tray() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null or coalesce((select is_suspended from public.profiles where id = me), true) then
    return jsonb_build_object('stories', '[]'::jsonb, 'suggestions', '[]'::jsonb);
  end if;

  return (
    with vis as (
      select st.id, st.user_id, st.created_at,
             exists (select 1 from public.follows f where f.follower_id = me and f.followee_id = st.user_id) as followed
      from public.stories st
      join public.profiles p on p.id = st.user_id
      where st.expires_at > now()
        and not p.is_suspended
        and (
          st.user_id = me
          or (
            public.can_view_author(st.user_id)
            and (
              p.account_type in ('public', 'business')
              or exists (select 1 from public.follows f where f.follower_id = me and f.followee_id = st.user_id)
            )
            and (
              not st.is_close_friends_only
              or exists (select 1 from public.close_friends c where c.owner_id = st.user_id and c.friend_id = me)
            )
          )
        )
    ),
    top_authors as (
      select v.user_id from vis v
      group by v.user_id
      order by (v.user_id = me) desc, bool_or(v.followed) desc, max(v.created_at) desc
      limit 60
    ),
    sug as (
      select p.id, p.username, p.display_name, p.avatar, p.is_verified, p.account_type, random() as r
      from public.profiles p
      where p.id <> me
        and not p.is_suspended
        and not p.is_ai
        and p.account_type in ('public', 'business')
        and not exists (select 1 from public.follows f where f.follower_id = me and f.followee_id = p.id)
        and not exists (
          select 1 from public.blocks b
          where (b.blocker_id = me and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = me)
        )
        and not exists (select 1 from public.profile_hides h where h.owner_id = p.id and h.hidden_from_id = me)
        and not exists (select 1 from vis v where v.user_id = p.id)
      order by r
      limit 10
    )
    select jsonb_build_object(
      'stories', coalesce((
        select jsonb_agg(public.story_json(s) order by s.created_at desc)
        from public.stories s
        where s.id in (select v.id from vis v where v.user_id in (select user_id from top_authors))
      ), '[]'::jsonb),
      'suggestions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', x.id, 'username', x.username, 'displayName', x.display_name, 'avatar', x.avatar,
          'isVerified', x.is_verified, 'accountType', x.account_type) order by x.r)
        from sug x
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke execute on function public.home_story_tray() from public, anon;
grant execute on function public.home_story_tray() to authenticated;
