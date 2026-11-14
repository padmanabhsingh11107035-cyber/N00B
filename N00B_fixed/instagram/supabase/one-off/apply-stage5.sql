-- PRIVACY GAP B, STAGE 5 (docs/PRIVACY-GAP-B-PLAN.md): the row rule on profiles. NOT a migration: it is NOT in supabase/migrations and is run by hand, once, by the owner.
-- Run it ONLY after: (1) migrations 20261114000020 to 20261114000024 are applied live, (2) the Stage 4 check (supabase/one-off/gap-b-live-check.sql) shows NO caller-rights reader of profiles,
-- (3) the app has been used for at least a day on stage 2 without errors.
-- WHAT IT DOES: replaces the select policy "profiles_select" (using (true)) by one that asks profile_row_visible(id). The switch row profiles_row_rule is 'off' after this script, and with the
-- switch OFF the helper answers true for every row, so RUNNING THIS SCRIPT CHANGES NOTHING FOR ANYBODY. The change happens only when you flip the switch (separate step, below).
-- NO DATA IS TOUCHED: no row is updated or deleted. The update policies are not changed. Triggers, sign-up, counters and every security definer function ignore the row rule.
-- SWITCH ON  (the real change; do it in a separate sitting and watch the app):  update public.internal_config set value = 'on'  where key = 'profiles_row_rule';
-- SWITCH OFF (fastest way back, one statement, instant):                         update public.internal_config set value = 'off' where key = 'profiles_row_rule';
-- FULL ROLLBACK: supabase/one-off/rollback-stage5.sql
begin;

insert into public.internal_config (key, value) values ('profiles_row_rule', 'off') on conflict (key) do nothing;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.profile_row_visible(id));

commit;
