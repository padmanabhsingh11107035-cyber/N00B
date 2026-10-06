-- Bug fix: `delete from storage.objects ...` run as plain SQL is rejected by Supabase with
-- "Direct deletion from storage tables is not allowed. Use the Storage API instead." (confirmed
-- live, on the previous migration's delete_daily_challenge_entry). Every other deletion path in this
-- app already removes files from the CLIENT via supabase.storage.from(bucket).remove([...]) (see
-- deleteMusicTrack in supabaseApi.ts) — that goes through the real Storage API, not raw SQL. This
-- migration stops touching storage.objects from SQL and instead hands the keys that need removing
-- back to the caller, who removes them via the Storage API.

create or replace function public.delete_daily_challenge_entry(p_entry_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare entry public.daily_challenge_entries;
begin
  select * into entry from public.daily_challenge_entries where id = p_entry_id;
  if not found then return jsonb_build_object('success', true); end if;
  if entry.user_id <> auth.uid() and not public.is_admin() then
    raise exception 'You can only delete your own entry.' using errcode = '42501';
  end if;
  delete from public.daily_challenge_entries where id = p_entry_id;
  return jsonb_build_object('success', true, 'mediaKey', entry.media_url);
end;
$$;
grant execute on function public.delete_daily_challenge_entry(uuid) to authenticated;

-- Returns the media keys of every entry it just wiped, so the caller (get_daily_challenge, below)
-- can hand them to the client for a real Storage API removal. Return type changed from void to
-- text[], which Postgres won't let `create or replace` do in place - drop it first.
drop function if exists public.settle_past_daily_challenges();
create or replace function public.settle_past_daily_challenges() returns text[]
language plpgsql security definer set search_path = public as $$
declare d record; top record; rank integer; purged text[] := '{}'; day_keys text[];
begin
  for d in
    select dc.challenge_date from public.daily_challenges dc
    where dc.challenge_date < current_date
      and not exists (select 1 from public.daily_challenge_settlements s where s.challenge_date = dc.challenge_date)
  loop
    rank := 0;
    for top in
      select e.id, e.user_id, e.votes_count from public.daily_challenge_entries e
      where e.challenge_date = d.challenge_date and e.votes_count > 0
      order by e.votes_count desc, e.created_at asc
      limit 3
    loop
      rank := rank + 1;
      perform public.award_points(top.user_id, case rank when 1 then 10000 when 2 then 5000 else 2500 end,
        'Daily NOOB — #' || rank || ' place (' || d.challenge_date || ')');
      if rank = 1 then
        insert into public.daily_challenge_settlements (challenge_date, winner_id, winner_votes)
          values (d.challenge_date, top.user_id, top.votes_count)
        on conflict (challenge_date) do nothing;
      end if;
    end loop;
    insert into public.daily_challenge_settlements (challenge_date, winner_id, winner_votes)
      values (d.challenge_date, null, null)
    on conflict (challenge_date) do nothing;

    select coalesce(array_agg(media_url), '{}') into day_keys
      from public.daily_challenge_entries where challenge_date = d.challenge_date;
    purged := purged || day_keys;
    delete from public.daily_challenge_entries where challenge_date = d.challenge_date;
  end loop;
  return purged;
end;
$$;

create or replace function public.get_daily_challenge() returns jsonb
language plpgsql security definer set search_path = public as $$
declare today public.daily_challenges; me uuid := auth.uid(); purged text[];
begin
  purged := public.settle_past_daily_challenges();
  today := public.ensure_daily_challenge(current_date);
  return jsonb_build_object(
    'challengeDate', today.challenge_date,
    'prompt', coalesce(today.custom_prompt, (select prompt from public.daily_challenge_prompts where id = today.prompt_id)),
    'hasSubmitted', me is not null and exists (select 1 from public.daily_challenge_entries e where e.challenge_date = today.challenge_date and e.user_id = me),
    'myVoteEntryId', (select v.entry_id from public.daily_challenge_votes v where v.challenge_date = today.challenge_date and v.voter_id = me),
    'purgedMediaKeys', coalesce(to_jsonb(purged), '[]'::jsonb)
  );
end;
$$;
grant execute on function public.get_daily_challenge() to authenticated;
