-- ROLLBACK of apply-stage5.sql (not a migration; run by hand in the SQL editor). It switches the rule OFF first, then puts the original policy back: every logged-in person can read every profile row again, exactly as before.
-- Nothing in the data changes. Safe to run twice.
begin;
update public.internal_config set value = 'off' where key = 'profiles_row_rule';
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
commit;
