-- UNDO of privacy gap B stage 6 (migration 20261118000007). Two ways back:
--   1. INSTANT, one statement (the table rule goes back to the stage 5 rule at once, nothing is deleted):
--        update public.internal_config set value = 'off' where key = 'profiles_row_strict';
--   2. FULL (this file): the stage 5 policy comes back as it was and the stage 6 helper and switch row are removed. Safe to run twice.
begin;
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.profile_row_visible(id));
drop function if exists public.profile_row_visible_strict(uuid);
delete from public.internal_config where key = 'profiles_row_strict';
commit;
