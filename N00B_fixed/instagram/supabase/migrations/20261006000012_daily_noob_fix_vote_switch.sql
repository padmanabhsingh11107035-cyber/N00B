-- Bug fix: moving your vote from one entry to another used an UPSERT (INSERT ... ON CONFLICT DO
-- UPDATE) on the same (challenge_date, voter_id) row. The votes_count trigger only fires AFTER
-- INSERT OR DELETE, never AFTER UPDATE, so switching a vote silently never changed either entry's
-- count. Fixed by explicitly deleting any existing vote first, then inserting fresh — a first-time
-- vote still only does the insert, but a vote switch now fires both a DELETE (decrementing the old
-- entry) and an INSERT (incrementing the new one).

create or replace function public.vote_daily_challenge_entry(p_entry_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); entry public.daily_challenge_entries;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into entry from public.daily_challenge_entries where id = p_entry_id;
  if not found then raise exception 'Entry not found'; end if;
  if entry.challenge_date <> current_date then raise exception 'Voting has closed for that day.'; end if;
  if entry.user_id = me then raise exception 'You can''t vote for your own entry.'; end if;
  delete from public.daily_challenge_votes where challenge_date = entry.challenge_date and voter_id = me;
  insert into public.daily_challenge_votes (challenge_date, voter_id, entry_id)
    values (entry.challenge_date, me, p_entry_id);
  return jsonb_build_object('success', true);
end;
$$;
grant execute on function public.vote_daily_challenge_entry(uuid) to authenticated;
