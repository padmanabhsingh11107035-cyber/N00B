-- NOOB — one honest ranking for the score games on the Games page (Flappy, NOOB Run 3D, Frostzero ...). Every game has a row in hosted_score_rules (the biggest score it can really give, and how
-- often a score may be sent); a signed-in person's best score per game is kept; the board shows everyone once, best first, with the person's own place.
--
-- Purely ADDITIVE: two new tables and three functions. Nothing existing is changed or deleted.
-- Who can do what: both tables are closed to everybody (the app's public key can not read or write them directly). A signed-in person can send their own score and read a board, nothing else.
-- Honest limit: a score is sent by the game running on the person's phone, so a determined person can send a made-up one. What stops the silly cases: a score above what the game can give is
-- refused, and a score can only be sent every few seconds; anything else would need the game itself to run on the server.

create table if not exists public.hosted_score_rules (
  game             text primary key check (game ~ '^[a-z0-9_]{2,40}$'),
  label            text not null,
  max_score        bigint not null check (max_score > 0),
  min_gap_seconds  integer not null default 8 check (min_gap_seconds >= 0),
  higher_is_better boolean not null default true
);
alter table public.hosted_score_rules enable row level security;
revoke all on public.hosted_score_rules from public, anon, authenticated;
grant all on public.hosted_score_rules to service_role;

create table if not exists public.hosted_scores (
  game        text not null references public.hosted_score_rules (game) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  best        bigint not null,
  plays       integer not null default 1,
  updated_at  timestamptz not null default now(),   -- when the best score was set
  last_sent   timestamptz not null default now(),   -- when a score was last sent (any score)
  primary key (game, user_id)
);
create index if not exists hosted_scores_board_idx on public.hosted_scores (game, best desc, updated_at);
create index if not exists hosted_scores_user_idx on public.hosted_scores (user_id);
alter table public.hosted_scores enable row level security;
revoke all on public.hosted_scores from public, anon, authenticated;
grant all on public.hosted_scores to service_role;

-- The games that have a ranking (add a row here for every new score game; the numbers are what the game can really give).
insert into public.hosted_score_rules (game, label, max_score, min_gap_seconds, higher_is_better) values
  ('flappy20',   'Flappy 20',   100000,   8, true),
  ('noob_run_3d','NOOB Run 3D', 5000000, 15, true)
on conflict (game) do nothing;

create or replace function public.hosted_score_submit(p_game text, p_score bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  r      public.hosted_score_rules;
  cur    public.hosted_scores;
  v_better boolean;
begin
  if v_uid is null then return jsonb_build_object('success', false, 'error', 'Please log in.'); end if;
  select * into r from public.hosted_score_rules where game = p_game;
  if not found then return jsonb_build_object('success', false, 'error', 'This game has no ranking.'); end if;
  if p_score is null or p_score < 0 or p_score > r.max_score then return jsonb_build_object('success', false, 'error', 'That score is not possible in this game.'); end if;
  select * into cur from public.hosted_scores where game = p_game and user_id = v_uid for update;
  if not found then
    insert into public.hosted_scores (game, user_id, best) values (p_game, v_uid, p_score);
    return jsonb_build_object('success', true, 'best', p_score, 'newBest', true);
  end if;
  if cur.last_sent > now() - make_interval(secs => r.min_gap_seconds) then
    return jsonb_build_object('success', false, 'error', 'Scores can only be sent every few seconds.', 'best', cur.best);
  end if;
  v_better := case when r.higher_is_better then p_score > cur.best else p_score < cur.best end;
  update public.hosted_scores set
    best = case when v_better then p_score else best end,
    updated_at = case when v_better then now() else updated_at end,
    plays = plays + 1,
    last_sent = now()
  where game = p_game and user_id = v_uid;
  return jsonb_build_object('success', true, 'best', case when v_better then p_score else cur.best end, 'newBest', v_better);
end;
$$;

create or replace function public.hosted_score_board(p_game text, p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  r     public.hosted_score_rules;
  v_me  jsonb;
begin
  if v_uid is null then return jsonb_build_object('rows', '[]'::jsonb, 'me', null); end if;
  select * into r from public.hosted_score_rules where game = p_game;
  if not found then return jsonb_build_object('rows', '[]'::jsonb, 'me', null); end if;
  select jsonb_build_object('rank', t.rank, 'best', t.best) into v_me from (
    select user_id, best, rank() over (order by case when r.higher_is_better then -best else best end, updated_at) as rank
    from public.hosted_scores where game = p_game
  ) t where t.user_id = v_uid;
  return jsonb_build_object(
    'label', r.label,
    'higherIsBetter', r.higher_is_better,
    'me', v_me,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('rank', t.rank, 'username', p.username, 'displayName', coalesce(nullif(p.display_name, ''), p.username), 'avatar', p.avatar, 'best', t.best, 'isMe', t.user_id = v_uid) order by t.rank)
      from (
        select user_id, best, updated_at, rank() over (order by case when r.higher_is_better then -best else best end, updated_at) as rank
        from public.hosted_scores where game = p_game
        order by case when r.higher_is_better then -best else best end, updated_at
        limit greatest(1, least(coalesce(p_limit, 50), 100))
      ) t join public.profiles p on p.id = t.user_id
    ), '[]'::jsonb));
end;
$$;

revoke all on function public.hosted_score_submit(text, bigint), public.hosted_score_board(text, integer) from public, anon;
grant execute on function public.hosted_score_submit(text, bigint), public.hosted_score_board(text, integer) to authenticated;
