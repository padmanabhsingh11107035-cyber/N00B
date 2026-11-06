-- Mood Status: a mood now clears itself at 12 midnight (the person's own midnight) instead of 24 hours after it was set.
-- The app sends the exact moment (the next midnight of the person's time zone); the database keeps it, never more than 48 hours ahead, and a mood that is past its moment is
-- gone for everybody, as before (mood_visible). Nothing else changes: who may see a mood, the two-second pause between changes, and every other rule of
-- mood_set (migration 20261016000003) are used as they are. An app that has not been updated yet keeps calling mood_set and works as before.
-- Safe to run more than once.

create or replace function public.mood_set_until(p_mood text, p_note text default '', p_visibility text default 'followers', p_expires_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  m public.user_moods;
  until_at timestamptz := p_expires_at;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  -- every rule (who is allowed, the moods, the note, who sees it, the pause) is checked by mood_set itself
  perform public.mood_set(p_mood, p_note, p_visibility, 24);
  if until_at is null or until_at <= now() then until_at := now() + interval '24 hours'; end if;
  until_at := least(until_at, now() + interval '48 hours');
  update public.user_moods set expires_at = until_at where user_id = me returning * into m;
  return public.mood_json(m, true);
end;
$$;
revoke execute on function public.mood_set_until(text, text, text, timestamptz) from public, anon;
grant execute on function public.mood_set_until(text, text, text, timestamptz) to authenticated;
