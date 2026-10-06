-- Three additions to Daily NOOB:
-- 1) A user can delete their own entry (an admin can too, for moderation).
-- 2) Once a day's challenge has ended and been settled (votes tallied, points paid out, the champion
--    recorded), that day's ENTRIES, VOTES and UPLOADED FILES are permanently deleted from the server.
--    Nothing else is touched: the daily_challenges row (the prompt) and daily_challenge_settlements
--    row (the Hall of Fame record - winner, prompt, vote count, no media) are deliberately kept
--    forever, since neither holds the bulky per-entry data this is about, and deleting them would
--    break the Hall of Fame history. Settlement already only ever runs once per day (see the
--    previous migration), so this deletion is also exactly-once, never repeated.
-- 3) Admin-authored tasks: the NOOB admin panel can set (or schedule ahead) a specific prompt for a
--    given day, which takes priority over the auto-rotating pool. The pool stays as the fallback for
--    any day the admin hasn't set one, so Daily NOOB never goes empty.

alter table public.daily_challenges add column if not exists custom_prompt text;

create or replace function public.get_daily_challenge() returns jsonb
language plpgsql security definer set search_path = public as $$
declare today public.daily_challenges; me uuid := auth.uid();
begin
  perform public.settle_past_daily_challenges();
  today := public.ensure_daily_challenge(current_date);
  return jsonb_build_object(
    'challengeDate', today.challenge_date,
    'prompt', coalesce(today.custom_prompt, (select prompt from public.daily_challenge_prompts where id = today.prompt_id)),
    'hasSubmitted', me is not null and exists (select 1 from public.daily_challenge_entries e where e.challenge_date = today.challenge_date and e.user_id = me),
    'myVoteEntryId', (select v.entry_id from public.daily_challenge_votes v where v.challenge_date = today.challenge_date and v.voter_id = me)
  );
end;
$$;

create or replace function public.fetch_daily_champions(p_limit integer default 20) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'challengeDate', x.challenge_date, 'userId', x.winner_id, 'username', x.username, 'userAvatar', x.avatar,
    'isVerified', x.is_verified, 'votesCount', x.winner_votes, 'prompt', x.prompt
  ) order by x.challenge_date desc), '[]'::jsonb)
  from (
    select s.challenge_date, s.winner_id, s.winner_votes, a.username, a.avatar, a.is_verified,
      coalesce(dc.custom_prompt, (select prompt from public.daily_challenge_prompts where id = dc.prompt_id)) as prompt
    from public.daily_challenge_settlements s
    join public.daily_challenges dc on dc.challenge_date = s.challenge_date
    join public.profiles a on a.id = s.winner_id
    where s.winner_id is not null
    order by s.challenge_date desc
    limit least(greatest(p_limit, 1), 100)
  ) x;
$$;

-- Lets an admin set (or schedule) today's or a future day's task. Never a past day - that challenge
-- has already run (or its data may already be wiped by settlement).
create or replace function public.admin_set_daily_challenge(p_date date, p_prompt text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin only.' using errcode = '42501'; end if;
  if p_date < current_date then raise exception 'That day has already ended.'; end if;
  if coalesce(btrim(p_prompt), '') = '' then raise exception 'Enter a task for that day.'; end if;
  perform public.ensure_daily_challenge(p_date);
  update public.daily_challenges set custom_prompt = left(btrim(p_prompt), 300) where challenge_date = p_date;
  return jsonb_build_object('success', true);
end;
$$;
grant execute on function public.admin_set_daily_challenge(date, text) to authenticated;

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
  delete from storage.objects where bucket_id = 'media' and name = entry.media_url;
  return jsonb_build_object('success', true);
end;
$$;
grant execute on function public.delete_daily_challenge_entry(uuid) to authenticated;

-- settle_past_daily_challenges: same tally-and-pay-out as before, now followed by permanently wiping
-- that day's entries/votes/files once it's been settled.
create or replace function public.settle_past_daily_challenges() returns void
language plpgsql security definer set search_path = public as $$
declare d record; top record; rank integer;
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

    -- The event has ended and been settled — permanently delete just that day's entries, votes and
    -- uploaded files. daily_challenges (the prompt) and daily_challenge_settlements (the Hall of Fame
    -- record, just written above) are deliberately left alone.
    delete from storage.objects
      where bucket_id = 'media'
        and name in (select media_url from public.daily_challenge_entries where challenge_date = d.challenge_date);
    delete from public.daily_challenge_entries where challenge_date = d.challenge_date;
  end loop;
end;
$$;
