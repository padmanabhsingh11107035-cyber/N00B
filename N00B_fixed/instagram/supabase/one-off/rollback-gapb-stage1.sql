-- ROLLBACK of 20261114000020_gapb_stage1_profile_helpers.sql (not a migration: run by hand in the SQL editor only if stage 1 has to be undone).
-- Run it ONLY after the stage 2 rollbacks (rollback-gapb-stage2b3, 2b2, 2b1, 2a, in that order), because the stage 2 functions call these helpers.
-- It also needs the stage 5 row rule to be off (rollback-stage5.sql first): the policy calls profile_row_visible.
begin;
drop function if exists public.profile_row_visible(uuid);
drop function if exists public.profile_noob_admin_ids();
drop function if exists public.profile_is_private(uuid);
drop function if exists public.profile_brief(uuid);
delete from public.internal_config where key = 'profiles_row_rule';
commit;
