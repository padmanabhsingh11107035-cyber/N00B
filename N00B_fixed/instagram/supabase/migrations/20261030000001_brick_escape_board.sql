-- Brick Escape: a global ranking by level. Every player has ONE row: the highest level they have cleared. The game (inside the Games page) reports a cleared level, the board shows the best players.
-- Safe to run more than once.

create table if not exists public.brick_escape_scores (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  best_level integer not null default 0 check (best_level >= 0),
  updated_at timestamptz not null default now()
);
create index if not exists brick_escape_scores_board_idx on public.brick_escape_scores (best_level desc, updated_at);
alter table public.brick_escape_scores enable row level security;   -- no policy on purpose: only the functions below read and write it

-- A level was cleared. Levels go one after the other, so a level can only be 1..5 above the best one on record, and no sooner than a level can really be played (3 seconds each).
create or replace function public.brick_escape_level_done(p_level integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); cur public.brick_escape_scores; gap integer;
begin
  if p_level is null or p_level < 1 or p_level > 100000 then raise exception 'Invalid level.'; end if;
  insert into public.brick_escape_scores (user_id, best_level, updated_at) values (me, 0, now() - interval '1 minute') on conflict do nothing;
  select * into cur from public.brick_escape_scores where user_id = me for update;
  if p_level <= cur.best_level then
    return jsonb_build_object('success', true, 'bestLevel', cur.best_level, 'newBest', false);
  end if;
  gap := p_level - cur.best_level;
  if gap > 5 then raise exception 'Clear the earlier levels first.'; end if;
  if cur.updated_at > now() - make_interval(secs => gap * 3) then raise exception 'That level was cleared too fast to count.'; end if;
  update public.brick_escape_scores set best_level = p_level, updated_at = now() where user_id = me;
  return jsonb_build_object('success', true, 'bestLevel', p_level, 'newBest', true);
end;
$$;

-- The board: the 50 highest levels, and where the person looking stands.
create or replace function public.brick_escape_leaderboard() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); mine record; total integer;
begin
  if me is null then raise exception 'Please log in.' using errcode = '28000'; end if;
  select count(*) into total from public.brick_escape_scores s join public.profiles p on p.id = s.user_id
    where s.best_level > 0 and not p.is_ai and lower(p.username) <> 'noob';
  select r.rn, r.best_level into mine from (
    select s.user_id, s.best_level, row_number() over (order by s.best_level desc, s.updated_at asc, s.user_id) as rn
    from public.brick_escape_scores s join public.profiles p on p.id = s.user_id
    where s.best_level > 0 and not p.is_ai and lower(p.username) <> 'noob') r where r.user_id = me;
  return jsonb_build_object(
    'total', total,
    'entries', coalesce((
      select jsonb_agg(t.entry order by t.rn) from (
        select x.rn, jsonb_build_object('rank', x.rn, 'userId', x.user_id, 'username', x.username,
                 'displayName', coalesce(nullif(x.display_name, ''), x.username), 'avatar', x.avatar,
                 'level', x.best_level, 'isMe', x.user_id = me) as entry
        from (
          select s.*, p.username, p.display_name, p.avatar,
                 row_number() over (order by s.best_level desc, s.updated_at asc, s.user_id) as rn
          from public.brick_escape_scores s join public.profiles p on p.id = s.user_id
          where s.best_level > 0 and not p.is_ai and lower(p.username) <> 'noob') x
        where x.rn <= 50) t), '[]'::jsonb),
    'me', case when mine.rn is null then null else jsonb_build_object('rank', mine.rn, 'level', mine.best_level) end);
end;
$$;

revoke execute on function public.brick_escape_level_done(integer) from public, anon;
revoke execute on function public.brick_escape_leaderboard() from public, anon;
grant execute on function public.brick_escape_level_done(integer) to authenticated;
grant execute on function public.brick_escape_leaderboard() to authenticated;
