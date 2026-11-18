-- PRIVACY GAP B, STAGE 6 (docs/PRIVACY-GAP-B-PLAN.md): with a second switch, the table "profiles" can be read straight from the table ONLY for your own row (and by the administrator).
-- Today (stage 5, live since 14 Nov) a logged-in person who talks to the database directly can still list everybody's basic card (name, picture, bio). The app never does that: it asks the
-- safe functions (search_users, feed, chats ...), which run with the database's own rights and ignore this rule, and the live check shows 0 functions that read profiles with the caller's rights.
-- RUNNING THIS FILE CHANGES NOTHING FOR ANYBODY: the new switch 'profiles_row_strict' is 'off', and with it off the rule is exactly the stage 5 rule (switch 'profiles_row_rule').
--   TURN STAGE 6 ON  (the real change):  update public.internal_config set value = 'on'  where key = 'profiles_row_strict';
--   UNDO, instant, one statement:         update public.internal_config set value = 'off' where key = 'profiles_row_strict';
-- No data is touched. Safe to run more than once.

insert into public.internal_config (key, value) values ('profiles_row_strict', 'off') on conflict (key) do nothing;

create or replace function public.profile_row_visible_strict(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when coalesce((select c.value from public.internal_config c where c.key = 'profiles_row_strict'), 'off') = 'on' then false   -- strict: nobody else's row (own row and administrator are allowed by the policy itself)
    else public.profile_row_visible(p_id)                                                                                       -- otherwise exactly the stage 5 rule
  end
$$;
revoke all on function public.profile_row_visible_strict(uuid) from public, anon;
grant execute on function public.profile_row_visible_strict(uuid) to authenticated, service_role;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.profile_row_visible_strict(id));
