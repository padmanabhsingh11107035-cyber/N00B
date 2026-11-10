-- When an administrator suspends an account, everything that account put on NOOB (posts, reels, stories, videos, ...) disappears for everybody else.
-- Nothing is deleted: restoring the account brings it all back. Administrators (and super viewers) can still see it, so they can review it.
-- Almost every "may I see this person's content" check in the database goes through can_view_author(), so the rule lives there.
-- It is safe to run more than once. It changes no data.

create or replace function public.can_view_author(author uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    case
      when exists (select 1 from public.profiles s where s.id = author and s.is_suspended)
        then (public.is_admin() or public.is_super_viewer())
      else (
        author is not distinct from auth.uid()
        or public.is_super_viewer()
        or (
          not exists (
            select 1 from public.blocks b
            where (b.blocker_id = author and b.blocked_id = auth.uid())
               or (b.blocker_id = auth.uid() and b.blocked_id = author)
          )
          and not exists (select 1 from public.profile_hides h where h.owner_id = author and h.hidden_from_id = auth.uid())
          and (
            (select p.account_type from public.profiles p where p.id = author) <> 'private'
            or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = author)
            or exists (select 1 from public.follows f where f.follower_id = author and f.followee_id = auth.uid())
          )
        )
      )
    end,
    false
  );
$$;

-- The profile page asks this to show "This account has been suspended" (it returns only yes / no, nothing else about the person).
create or replace function public.is_account_suspended(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select s.is_suspended from public.profiles s where s.id = p_user), false);
$$;
revoke execute on function public.is_account_suspended(uuid) from public, anon;
grant execute on function public.is_account_suspended(uuid) to authenticated;
