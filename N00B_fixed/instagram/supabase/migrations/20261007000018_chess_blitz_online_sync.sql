-- Chess Blitz online: today "Play with Available Users"/"Play with Friend" for chess is a sham —
-- each matched player quietly plays their own round against the local bot and the server compares
-- whose round went better, never a real head-to-head game. This migration is the small SQL half of
-- making it real; the actual move legality/checkmate/stalemate authority lives in the new
-- supabase/functions/chess-move Edge Function (Postgres has no chess engine to check that with).
--
-- board stores { fen, lastMove } for chess_blitz, same jsonb column tictactoe already reuses for
-- its own ('X'|'O'|null)[9] shape — nothing here changes tictactoe's own behavior at all.

-- A new room: seed the starting position + whose turn it is as soon as the second player joins,
-- exactly how tictactoe already seeds its empty 3x3 board.
create or replace function public.join_game_room(p_code text, p_game_id text, p_title text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); r public.game_rooms; info jsonb;
begin
  perform public.cleanup_stale_games();
  if btrim(coalesce(p_code, '')) = '' or btrim(coalesce(p_game_id, '')) = '' then raise exception 'Room code and gameId are required.'; end if;
  info := public.game_player_json(me);
  select * into r from public.game_rooms where code = p_code for update;
  if not found then
    if (select count(*) from public.game_rooms where created_by = me and created_at > now() - interval '1 minute') >= 30 then
      raise exception 'Too many requests. Please slow down.';
    end if;
    insert into public.game_rooms (code, game_id, game_title, players, created_by)
    values (p_code, p_game_id, coalesce(nullif(btrim(p_title), ''), p_game_id), jsonb_build_array(info), me)
    returning * into r;
    return jsonb_build_object('success', true, 'room', public.room_json(r));
  end if;
  if exists (select 1 from jsonb_array_elements(r.players) x where (x->>'userId')::uuid = me) then
    return jsonb_build_object('success', true, 'room', public.room_json(r));
  end if;
  if jsonb_array_length(r.players) >= 2 then raise exception 'This match is already full.'; end if;
  update public.game_rooms set players = players || jsonb_build_array(info), status = 'ready',
    board = case when game_id = 'tictactoe' then to_jsonb(array_fill(null::text, array[9]))
                 when game_id = 'chess_blitz' then jsonb_build_object('fen', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
                 else board end,
    turn = case when game_id in ('tictactoe', 'chess_blitz') then (players->0->>'userId')::uuid else turn end
  where code = p_code returning * into r;
  return jsonb_build_object('success', true, 'room', public.room_json(r));
end;
$$;

-- Same seeding, for the matchmaking-pairs-you-instantly path.
create or replace function public.join_matchmaking(p_game_id text, p_title text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.acting_user(); opp record; room_code text; r public.game_rooms;
begin
  perform public.cleanup_stale_games();
  if btrim(coalesce(p_game_id, '')) = '' then raise exception 'gameId is required.'; end if;
  delete from public.matchmaking_queue where user_id = me;
  select q.user_id into opp from public.matchmaking_queue q
  where q.game_id = p_game_id and q.matched_room_code is null and q.user_id <> me
  order by q.joined_at for update skip locked limit 1;
  if found then
    room_code := upper('MM-' || to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint) || '-' || substr(md5(random()::text), 1, 4));
    insert into public.game_rooms (code, game_id, game_title, status, players, created_by,
                                   board, turn)
    values (room_code, p_game_id, coalesce(nullif(btrim(p_title), ''), p_game_id), 'ready',
            jsonb_build_array(public.game_player_json(opp.user_id), public.game_player_json(me)), me,
            case when p_game_id = 'tictactoe' then to_jsonb(array_fill(null::text, array[9]))
                 when p_game_id = 'chess_blitz' then jsonb_build_object('fen', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') end,
            case when p_game_id in ('tictactoe', 'chess_blitz') then opp.user_id end)
    returning * into r;
    update public.matchmaking_queue set matched_room_code = room_code where user_id = opp.user_id;
    return jsonb_build_object('success', true, 'matched', true, 'room', public.room_json(r));
  end if;
  insert into public.matchmaking_queue (user_id, game_id) values (me, p_game_id);
  return jsonb_build_object('success', true, 'matched', false);
end;
$$;

-- Chess Blitz is now a live-synced board too (via the chess-move Edge Function) — the old "each
-- plays their own round, compare results" relay endpoint must refuse it, same as it already refuses
-- tictactoe, so nobody can bypass real move validation by calling the old relay directly.
create or replace function public.submit_game_room_result(p_code text, p_result text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.acting_user(); r public.game_rooms; p1 text; p2 text; r1 int; r2 int; outcomes jsonb; total bigint;
begin
  select * into r from public.game_rooms where code = p_code for update;
  if not found then raise exception 'Match not found or has expired.'; end if;
  if not exists (select 1 from jsonb_array_elements(r.players) x where (x->>'userId')::uuid = me) then
    raise exception 'You are not part of this match.' using errcode = '42501';
  end if;
  if r.game_id in ('tictactoe', 'chess_blitz') then raise exception 'This game uses live moves — submit via the move endpoint instead.'; end if;
  if p_result is null or p_result not in ('win', 'tie', 'loss') then raise exception 'Invalid result.'; end if;

  if not (r.results ? me::text) then
    update public.game_rooms set results = results || jsonb_build_object(me::text, p_result) where code = p_code returning * into r;
  end if;
  if r.status <> 'finished' and (select count(*) from jsonb_object_keys(r.results)) >= 2 and jsonb_array_length(r.players) = 2 then
    p1 := r.players->0->>'userId'; p2 := r.players->1->>'userId';
    r1 := case r.results->>p1 when 'win' then 2 when 'tie' then 1 else 0 end;
    r2 := case r.results->>p2 when 'win' then 2 when 'tie' then 1 else 0 end;
    outcomes := case when r1 = r2 then jsonb_build_object(p1, 'tie', p2, 'tie')
                     when r1 > r2 then jsonb_build_object(p1, 'win', p2, 'loss')
                     else jsonb_build_object(p1, 'loss', p2, 'win') end;
    perform public.finalize_room_outcome(p_code, outcomes);
    select * into r from public.game_rooms where code = p_code;
  end if;
  select noob_points into total from public.profiles where id = me;
  return jsonb_build_object('success', true, 'room', public.room_json(r), 'yourTotalPoints', total);
end;
$$;
