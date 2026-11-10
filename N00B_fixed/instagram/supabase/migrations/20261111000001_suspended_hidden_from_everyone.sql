-- A suspended account's content (posts, reels, stories, videos...) is hidden from EVERYONE, administrators and "super viewers" included.
-- The first version (20261110000002) let administrators and the accounts named noob / padmanabh still see it, so on those accounts it looked as if nothing was hidden.
-- The admin panel has its own tools (admin_content_feed and friends) for reviewing content, so it does not need this check to let it through.
-- Nothing is deleted: restoring the account brings everything back. Safe to run more than once; it changes no data.

create or replace function public.can_view_author(author uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    case
      when exists (select 1 from public.profiles s where s.id = author and s.is_suspended) then false
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
