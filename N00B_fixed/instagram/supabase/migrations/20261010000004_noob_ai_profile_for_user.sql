-- NOOB AI shows each person's CURRENT NOOB profile picture next to their name.
--
-- Same pattern as the NOOB AI feedback functions: the shared secret (already stored in internal_config for the feedback
-- feature) proves the question comes from NOOB AI, and the answer is limited to the one account passed in:
-- its profile picture, display name and username, which are already public on the NOOB profile page.
--
-- Safe to run more than once. It only adds this one function; no data is touched.

create or replace function public.noob_ai_profile_for_user(p_secret text, p_noob_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare expected text;
begin
  select value into expected from public.internal_config where key = 'noob_ai_feedback_secret';
  if expected is null or p_secret is distinct from expected then raise exception 'Unauthorized'; end if;
  return coalesce((
    select jsonb_build_object(
      'avatar', coalesce(p.avatar, ''),
      'displayName', coalesce(p.display_name, p.username, ''),
      'username', coalesce(p.username, '')
    )
    from public.profiles p where p.id = p_noob_user_id
  ), '{}'::jsonb);
end;
$$;
revoke execute on function public.noob_ai_profile_for_user(text, uuid) from public;
grant execute on function public.noob_ai_profile_for_user(text, uuid) to anon, authenticated;
