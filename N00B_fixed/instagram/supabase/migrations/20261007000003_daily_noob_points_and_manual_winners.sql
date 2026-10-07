-- Daily NOOB fixes:
-- 1) Submitting an entry now earns immediate participation points (+25, matching every other content
--    type — "Published a post", "Published a reel", "Uploaded a video"). Previously an entry earned
--    ZERO points unless it finished top 3 by vote count AFTER the day rolled over — which is exactly
--    why posting felt like it did nothing.
-- 2) New admin-only manual placement: an admin can directly assign 1st/2nd/3rd for a day's challenge
--    from among that day's real participants, instead of relying purely on vote counts — useful when
--    turnout is too low for the automatic vote-based settlement to ever crown a winner. Guarded
--    against double-paying: refuses once that day is already settled, by either path.

create or replace function public.submit_daily_challenge_entry(p_media_url text, p_media_type text, p_caption text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); today date := current_date; eid uuid;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  if (select is_suspended from public.profiles where id = me) is not false then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if coalesce(btrim(p_media_url), '') = '' then raise exception 'An entry needs a photo or video.'; end if;
  if p_media_type not in ('image', 'video') then raise exception 'Unsupported entry type.'; end if;
  perform public.ensure_daily_challenge(today);
  if exists (select 1 from public.daily_challenge_entries where challenge_date = today and user_id = me) then
    raise exception 'You already entered today''s NOOB challenge — come back tomorrow for a new one.';
  end if;
  insert into public.daily_challenge_entries (challenge_date, user_id, media_url, media_type, caption)
    values (today, me, p_media_url, p_media_type, left(btrim(coalesce(p_caption, '')), 200))
    returning id into eid;
  perform public.award_points(me, 25, 'Entered Daily NOOB');
  return jsonb_build_object('success', true, 'entryId', eid);
end;
$$;
grant execute on function public.submit_daily_challenge_entry(text, text, text) to authenticated;

create or replace function public.admin_assign_daily_challenge_winners(p_date date, p_first uuid, p_second uuid default null, p_third uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare first_votes integer; purged text[];
begin
  if not public.is_admin() then raise exception 'Admin only.' using errcode = '42501'; end if;
  if p_first is null then raise exception 'Pick at least a 1st place.'; end if;
  if exists (select 1 from public.daily_challenge_settlements where challenge_date = p_date) then
    raise exception 'That day has already been settled.';
  end if;
  if not exists (select 1 from public.daily_challenge_entries where challenge_date = p_date and user_id = p_first) then
    raise exception 'That user didn''t enter that day''s challenge.';
  end if;
  if p_second is not null and not exists (select 1 from public.daily_challenge_entries where challenge_date = p_date and user_id = p_second) then
    raise exception 'That user didn''t enter that day''s challenge.';
  end if;
  if p_third is not null and not exists (select 1 from public.daily_challenge_entries where challenge_date = p_date and user_id = p_third) then
    raise exception 'That user didn''t enter that day''s challenge.';
  end if;

  select votes_count into first_votes from public.daily_challenge_entries where challenge_date = p_date and user_id = p_first;
  perform public.award_points(p_first, 10000, 'Daily NOOB — #1 place (' || p_date || ', admin-assigned)');
  if p_second is not null then
    perform public.award_points(p_second, 5000, 'Daily NOOB — #2 place (' || p_date || ', admin-assigned)');
  end if;
  if p_third is not null then
    perform public.award_points(p_third, 2500, 'Daily NOOB — #3 place (' || p_date || ', admin-assigned)');
  end if;

  insert into public.daily_challenge_settlements (challenge_date, winner_id, winner_votes)
    values (p_date, p_first, coalesce(first_votes, 0));

  -- Same purge-and-hand-back-the-keys pattern as settle_past_daily_challenges/get_daily_challenge —
  -- raw SQL can't delete storage.objects directly, so the caller removes these via the Storage API.
  select coalesce(array_agg(media_url), '{}') into purged from public.daily_challenge_entries where challenge_date = p_date;
  delete from public.daily_challenge_entries where challenge_date = p_date;
  return jsonb_build_object('success', true, 'purgedMediaKeys', coalesce(to_jsonb(purged), '[]'::jsonb));
end;
$$;
grant execute on function public.admin_assign_daily_challenge_winners(date, uuid, uuid, uuid) to authenticated;
