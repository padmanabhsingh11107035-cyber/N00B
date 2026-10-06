-- "Daily NOOB" — one shared challenge every day, everyone submits an entry, everyone votes, and at
-- the day's end the top 3 win real NOOB Points (10,000 / 5,000 / 2,500) with #1 crowned that day's
-- Daily NOOB Champion. No cron job: settling a past day (tallying votes, awarding points, recording
-- the champion) happens lazily, exactly once, the next time anyone calls get_daily_challenge() after
-- that day has ended — see settle_past_daily_challenges() below.

-- Allow-list the 'daily' storage folder, same pattern as every earlier folder addition.
drop policy if exists media_upload on storage.objects;
create policy media_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] in
      ('posts', 'reels', 'stories', 'avatars', 'music', 'covers', 'stickers', 'products', 'chat', 'instants', 'comments', 'videos', 'daily')
  );

-- A rotating pool of prompts — today's challenge is picked deterministically from this pool by the
-- day of the year, so there's always one without needing an admin to set it manually every day.
create table public.daily_challenge_prompts (
  id      serial primary key,
  prompt  text not null
);
insert into public.daily_challenge_prompts (prompt) values
  ('Post the funniest picture in your gallery.'),
  ('Make the funniest 10-second reaction video.'),
  ('Show us your most chaotic desk or room right now.'),
  ('Post the worst photo anyone has ever taken of you.'),
  ('Recreate a famous movie scene in 10 seconds.'),
  ('Show your best "caught off guard" face.'),
  ('Post a photo that makes zero sense without context.'),
  ('Do your best impression of your pet (or a friend''s).'),
  ('Show us your most embarrassing childhood photo.'),
  ('Post the ugliest thing in your fridge right now.'),
  ('Film yourself trying not to laugh for 10 seconds.'),
  ('Show your most "so done with today" expression.'),
  ('Post a photo of your weirdest talent in action.'),
  ('Recreate your profile picture exactly, right now.'),
  ('Show the most random object within arm''s reach.'),
  ('Post your best plot-twist ending to a normal day.'),
  ('Film the most dramatic way to eat a snack.'),
  ('Show us your best "villain origin story" face.'),
  ('Post a photo that looks staged but totally wasn''t.'),
  ('Do a 10-second speedrun of your morning routine.');

create table public.daily_challenges (
  challenge_date date primary key default current_date,
  prompt_id      integer not null references public.daily_challenge_prompts (id),
  created_at     timestamptz not null default now()
);

create table public.daily_challenge_entries (
  id              uuid primary key default gen_random_uuid(),
  challenge_date  date not null references public.daily_challenges (challenge_date) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  media_url       text not null,
  media_type      text not null check (media_type in ('image', 'video')),
  caption         text not null default '',
  votes_count     integer not null default 0,
  created_at      timestamptz not null default now(),
  unique (challenge_date, user_id)
);
create index daily_challenge_entries_date_votes_idx on public.daily_challenge_entries (challenge_date, votes_count desc);

create table public.daily_challenge_votes (
  challenge_date date not null references public.daily_challenges (challenge_date) on delete cascade,
  voter_id       uuid not null references public.profiles (id) on delete cascade,
  entry_id       uuid not null references public.daily_challenge_entries (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (challenge_date, voter_id)
);

create table public.daily_challenge_settlements (
  challenge_date date primary key references public.daily_challenges (challenge_date) on delete cascade,
  winner_id      uuid references public.profiles (id) on delete set null,
  winner_votes   integer,
  settled_at     timestamptz not null default now()
);

alter table public.daily_challenge_prompts enable row level security;
alter table public.daily_challenges enable row level security;
alter table public.daily_challenge_entries enable row level security;
alter table public.daily_challenge_votes enable row level security;
alter table public.daily_challenge_settlements enable row level security;

create policy daily_challenges_select on public.daily_challenges for select to authenticated using (true);
create policy daily_challenge_entries_select on public.daily_challenge_entries for select to authenticated using (true);
create policy daily_challenge_settlements_select on public.daily_challenge_settlements for select to authenticated using (true);
grant select on public.daily_challenges, public.daily_challenge_entries, public.daily_challenge_settlements to authenticated;

create trigger daily_challenge_entry_votes_count after insert or delete on public.daily_challenge_votes
  for each row execute function public.bump_counter('daily_challenge_entries', 'votes_count', 'entry_id');

-- Deterministic "today's prompt": day-of-year modulo the pool size, so it's stable all day and
-- rotates every day without needing a cron job to roll it forward.
create or replace function public.ensure_daily_challenge(p_date date) returns public.daily_challenges
language plpgsql security definer set search_path = public as $$
declare row public.daily_challenges; pool_size integer; pick integer;
begin
  select * into row from public.daily_challenges where challenge_date = p_date;
  if found then return row; end if;
  select count(*) into pool_size from public.daily_challenge_prompts;
  pick := 1 + (extract(doy from p_date)::integer % greatest(pool_size, 1));
  insert into public.daily_challenges (challenge_date, prompt_id)
    values (p_date, pick)
  on conflict (challenge_date) do nothing;
  select * into row from public.daily_challenges where challenge_date = p_date;
  return row;
end;
$$;
revoke execute on function public.ensure_daily_challenge(date) from authenticated;

-- Tallies and pays out any past day that hasn't been settled yet. Called from get_daily_challenge()
-- so it happens automatically, exactly once per day, the next time anyone opens the feature.
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
    -- nobody got any votes that day — still mark it settled so this loop doesn't redo the work forever
    insert into public.daily_challenge_settlements (challenge_date, winner_id, winner_votes)
      values (d.challenge_date, null, null)
    on conflict (challenge_date) do nothing;
  end loop;
end;
$$;
revoke execute on function public.settle_past_daily_challenges() from authenticated;

create or replace function public.get_daily_challenge() returns jsonb
language plpgsql security definer set search_path = public as $$
declare today public.daily_challenges; me uuid := auth.uid();
begin
  perform public.settle_past_daily_challenges();
  today := public.ensure_daily_challenge(current_date);
  return jsonb_build_object(
    'challengeDate', today.challenge_date,
    'prompt', (select prompt from public.daily_challenge_prompts where id = today.prompt_id),
    'hasSubmitted', me is not null and exists (select 1 from public.daily_challenge_entries e where e.challenge_date = today.challenge_date and e.user_id = me),
    'myVoteEntryId', (select v.entry_id from public.daily_challenge_votes v where v.challenge_date = today.challenge_date and v.voter_id = me)
  );
end;
$$;
grant execute on function public.get_daily_challenge() to authenticated;

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
  return jsonb_build_object('success', true, 'entryId', eid);
end;
$$;
grant execute on function public.submit_daily_challenge_entry(text, text, text) to authenticated;

-- One vote per person per day; voting again just moves it to the new entry (never stacks).
create or replace function public.vote_daily_challenge_entry(p_entry_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); entry public.daily_challenge_entries;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select * into entry from public.daily_challenge_entries where id = p_entry_id;
  if not found then raise exception 'Entry not found'; end if;
  if entry.challenge_date <> current_date then raise exception 'Voting has closed for that day.'; end if;
  if entry.user_id = me then raise exception 'You can''t vote for your own entry.'; end if;
  insert into public.daily_challenge_votes (challenge_date, voter_id, entry_id)
    values (entry.challenge_date, me, p_entry_id)
  on conflict (challenge_date, voter_id) do update set entry_id = excluded.entry_id, created_at = now();
  return jsonb_build_object('success', true);
end;
$$;
grant execute on function public.vote_daily_challenge_entry(uuid) to authenticated;

create or replace function public.fetch_daily_challenge_entries(p_date date default current_date) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'userId', e.user_id, 'username', a.username, 'userAvatar', a.avatar, 'isVerified', a.is_verified,
    'mediaUrl', e.media_url, 'mediaType', e.media_type, 'caption', e.caption,
    'votesCount', e.votes_count, 'createdAt', e.created_at
  ) order by e.votes_count desc, e.created_at asc), '[]'::jsonb)
  from public.daily_challenge_entries e join public.profiles a on a.id = e.user_id
  where e.challenge_date = p_date;
$$;
grant execute on function public.fetch_daily_challenge_entries(date) to authenticated;

create or replace function public.fetch_daily_champions(p_limit integer default 20) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'challengeDate', x.challenge_date, 'userId', x.winner_id, 'username', x.username, 'userAvatar', x.avatar,
    'isVerified', x.is_verified, 'votesCount', x.winner_votes, 'prompt', x.prompt
  ) order by x.challenge_date desc), '[]'::jsonb)
  from (
    select s.challenge_date, s.winner_id, s.winner_votes, a.username, a.avatar, a.is_verified,
      (select prompt from public.daily_challenge_prompts where id = dc.prompt_id) as prompt
    from public.daily_challenge_settlements s
    join public.daily_challenges dc on dc.challenge_date = s.challenge_date
    join public.profiles a on a.id = s.winner_id
    where s.winner_id is not null
    order by s.challenge_date desc
    limit least(greatest(p_limit, 1), 100)
  ) x;
$$;
grant execute on function public.fetch_daily_champions(integer) to authenticated;
