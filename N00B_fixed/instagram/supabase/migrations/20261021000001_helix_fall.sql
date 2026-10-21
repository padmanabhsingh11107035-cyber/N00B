-- Helix Fall (the 3D tower game on the Games page).
--   * Every level a player clears (90 floors) pays 50,000,000 NOOBs, level after level without end.
--   * Every player has ONE best score (the best Daily Tower run), kept for today's board and for the all-time board.
-- Safe to run more than once.

-- One row per player per board: day = 'all' for the all-time best, otherwise the Daily Tower's day (UTC+8, like the game itself: '2026-10-21').
create table if not exists public.helix_scores (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  day         text not null,
  best_score  integer not null default 0,
  best_level  integer not null default 1,
  best_floors integer not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists helix_scores_board_idx on public.helix_scores (day, best_score desc, updated_at);
alter table public.helix_scores enable row level security;   -- no policy on purpose: only the functions below read and write it

-- When a level was last paid, so two payouts can never come closer than a level can really be played.
create table if not exists public.helix_state (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  last_level_at timestamptz
);
alter table public.helix_state enable row level security;

-- A level (90 floors) was cleared: +50,000,000 NOOBs.
create or replace function public.helix_level_complete(p_level integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); st public.helix_state; earned constant bigint := 50000000; total bigint;
begin
  if p_level is null or p_level < 1 or p_level > 100000 then raise exception 'Invalid level.'; end if;
  if (select count(*) from public.game_scores where user_id = me and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Too many requests. Please slow down.';
  end if;
  insert into public.helix_state (user_id) values (me) on conflict do nothing;
  select * into st from public.helix_state where user_id = me for update;
  -- 90 floors cannot be fallen through in 20 seconds even by a perfect player: a payout sooner than that after the last one is refused.
  if st.last_level_at is not null and st.last_level_at > now() - interval '20 seconds' then
    raise exception 'That level was cleared too fast to count.';
  end if;
  update public.helix_state set last_level_at = now() where user_id = me;
  perform public.apply_points(me, earned, 'Helix Fall: cleared level ' || p_level);
  update public.profiles set games_won_count = games_won_count + 1 where id = me;
  insert into public.game_scores (user_id, game_id, game_title, score, points_awarded, result, opponent)
  values (me, 'helix_fall', 'Helix Fall', p_level, earned, 'win', 'Level ' || p_level);
  select noob_points into total from public.profiles where id = me;
  return jsonb_build_object('success', true, 'earnedPoints', earned, 'totalNoobPoints', total, 'level', p_level, 'user', public.get_my_user());
end;
$$;

-- A run ended (the ball fell). Only a Daily Tower run can set the best score; only the best of a player's runs is ever kept.
create or replace function public.helix_submit_run(p_score integer, p_floors integer, p_level integer, p_daily boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.acting_user();
  today text := to_char((now() at time zone 'utc') + interval '8 hours', 'YYYY-MM-DD');
  best integer; best_lvl integer; best_day integer; prev integer; k text;
begin
  if p_score is null or p_floors is null or p_level is null or p_score < 0 or p_floors < 0 or p_level < 1 or p_level > 100000 or p_floors > 10000000 then
    raise exception 'Invalid run.';
  end if;
  -- Level n means at least (n - 1) levels of 90 floors were passed, and the rules can only ever award so many points per floor and level.
  if p_floors < (p_level - 1) * 90 or p_score > p_floors * 105 + p_level * 2600 then raise exception 'That score is not possible.'; end if;
  if (select count(*) from public.game_scores where user_id = me and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Too many requests. Please slow down.';
  end if;
  update public.profiles set games_played_count = games_played_count + 1 where id = me;
  insert into public.game_scores (user_id, game_id, game_title, score, points_awarded, result, opponent)
  values (me, 'helix_fall', 'Helix Fall', p_score, 0, case when p_level > 1 then 'win' else 'loss' end, case when p_daily then 'Daily Tower' else 'Practice' end);
  select best_score into prev from public.helix_scores where user_id = me and day = 'all';
  if p_daily then
    foreach k in array array['all', today] loop
      insert into public.helix_scores (user_id, day, best_score, best_level, best_floors)
      values (me, k, p_score, p_level, p_floors)
      on conflict (user_id, day) do update set
        best_level  = case when excluded.best_score > public.helix_scores.best_score then excluded.best_level else public.helix_scores.best_level end,
        best_floors = case when excluded.best_score > public.helix_scores.best_score then excluded.best_floors else public.helix_scores.best_floors end,
        updated_at  = case when excluded.best_score > public.helix_scores.best_score then now() else public.helix_scores.updated_at end,
        best_score  = greatest(excluded.best_score, public.helix_scores.best_score);
    end loop;
  end if;
  select best_score, best_level into best, best_lvl from public.helix_scores where user_id = me and day = 'all';
  select best_score into best_day from public.helix_scores where user_id = me and day = today;
  return jsonb_build_object('success', true, 'bestScore', coalesce(best, 0), 'bestLevel', coalesce(best_lvl, 1), 'todayBest', coalesce(best_day, 0),
                            'newBest', coalesce(p_daily and p_score > coalesce(prev, 0), false));
end;
$$;

-- The board: one row per player (their best), best first. period = 'today' (the Daily Tower of today) or 'all'.
create or replace function public.helix_leaderboard(p_period text default 'today') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  today text := to_char((now() at time zone 'utc') + interval '8 hours', 'YYYY-MM-DD');
  k text; mine record; total integer;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  k := case when p_period = 'all' then 'all' else today end;
  select count(*) into total from public.helix_scores s join public.profiles p on p.id = s.user_id
    where s.day = k and s.best_score > 0 and not p.is_ai and lower(p.username) <> 'noob';
  select r.rn, r.best_score into mine from (
    select s.user_id, s.best_score, row_number() over (order by s.best_score desc, s.updated_at asc, s.user_id) as rn
    from public.helix_scores s join public.profiles p on p.id = s.user_id
    where s.day = k and s.best_score > 0 and not p.is_ai and lower(p.username) <> 'noob') r where r.user_id = me;
  return jsonb_build_object(
    'period', case when k = 'all' then 'all' else 'today' end, 'day', k, 'total', total,
    'entries', coalesce((
      select jsonb_agg(t.entry order by t.rn) from (
        select x.rn, jsonb_build_object('rank', x.rn, 'userId', x.user_id, 'username', x.username,
                 'displayName', coalesce(nullif(x.display_name, ''), x.username), 'avatar', x.avatar,
                 'score', x.best_score, 'level', x.best_level, 'floors', x.best_floors, 'isMe', x.user_id = me) as entry
        from (
          select s.*, p.username, p.display_name, p.avatar,
                 row_number() over (order by s.best_score desc, s.updated_at asc, s.user_id) as rn
          from public.helix_scores s join public.profiles p on p.id = s.user_id
          where s.day = k and s.best_score > 0 and not p.is_ai and lower(p.username) <> 'noob') x
        where x.rn <= 50) t), '[]'::jsonb),
    'me', case when mine.rn is null then null else jsonb_build_object('rank', mine.rn, 'score', mine.best_score) end);
end;
$$;

revoke execute on function public.helix_level_complete(integer) from public, anon;
revoke execute on function public.helix_submit_run(integer, integer, integer, boolean) from public, anon;
revoke execute on function public.helix_leaderboard(text) from public, anon;
grant execute on function public.helix_level_complete(integer) to authenticated;
grant execute on function public.helix_submit_run(integer, integer, integer, boolean) to authenticated;
grant execute on function public.helix_leaderboard(text) to authenticated;
