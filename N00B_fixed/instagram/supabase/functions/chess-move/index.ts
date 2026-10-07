// NOOB — Edge Function "chess-move".
//
// The one piece Chess Blitz's online mode actually needed to be real: a server-side, authoritative
// move validator. game_rooms.board can't just be trusted from whichever client calls
// submit_game_room_move (that RPC is hard-coded to Tic Tac Toe's 9-cell board anyway) — Chess Blitz
// swings 50,000,000 points on a win and wipes the loser's whole balance, so a client-trusted "I won"
// would be a free jackpot exploit. Postgres has no chess engine, so this runs chess.js itself,
// server-side, as the only source of truth for "was that move legal" and "is the game over".
//
// { action: "move", code, from, to, promotion? } -> validate + apply a move, or end the match if it
//                                                    was checkmate/stalemate/draw
// { action: "resign", code }                      -> end the match immediately, caller loses
//
// Deploy with "Verify JWT" switched OFF (same as every other function here) — the caller's login
// token is checked in the code below.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { Chess } from 'npm:chess.js@1.4.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Supabase provides keys under the classic name or (newer projects) inside a list.
function envKey(classic: string, listName: string): string {
  const direct = Deno.env.get(classic);
  if (direct) return direct;
  try {
    const keys = JSON.parse(Deno.env.get(listName) || '{}');
    return keys.default || (Object.values(keys)[0] as string) || '';
  } catch {
    return '';
  }
}
const serviceKey = () => envKey('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS');
const publicKey = () => envKey('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS');

interface RoomPlayer {
  userId: string;
  username: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  const code = String(body?.code || '').trim();
  const action = body?.action === 'resign' ? 'resign' : 'move';
  if (!code) return json({ error: 'Missing room code.' }, 400);

  const url = Deno.env.get('SUPABASE_URL')!;
  // game_rooms has no grants for authenticated/anon at all (every other game already goes through
  // security-definer RPCs instead) — this function is the equivalent privileged path for chess,
  // doing its own authorization checks below exactly like those RPCs do.
  const admin = createClient(url, serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'Please log in.' }, 401);
  const { data: authData } = await admin.auth.getUser(token);
  const me = authData?.user?.id;
  if (!me) return json({ error: 'Please log in.' }, 401);

  const { data: room, error: roomErr } = await admin.from('game_rooms').select('*').eq('code', code).maybeSingle();
  if (roomErr || !room) return json({ error: 'Match not found or has expired.' }, 404);
  if (room.game_id !== 'chess_blitz') return json({ error: 'This match is not a chess game.' }, 400);
  if (room.status === 'finished') return json({ error: 'This match has already ended.' }, 400);

  const players: RoomPlayer[] = room.players || [];
  if (!players.some((p) => p.userId === me)) return json({ error: 'You are not part of this match.' }, 403);
  if (players.length < 2) return json({ error: 'Waiting for an opponent to join.' }, 400);
  const opponent = players.find((p) => p.userId !== me)!;

  if (action === 'resign') {
    const outcomes = { [me]: 'loss', [opponent.userId]: 'win' };
    const { error: finErr } = await admin.rpc('finalize_room_outcome', { p_code: code, p_outcomes: outcomes });
    if (finErr) return json({ error: finErr.message }, 500);
  } else {
    // Resigning is always allowed regardless of whose turn it is; actually moving is not.
    if (room.turn !== me) return json({ error: "It's not your turn." }, 400);

    const from = String(body?.from || '');
    const to = String(body?.to || '');
    const promotion = body?.promotion ? String(body.promotion) : undefined;
    if (!from || !to) return json({ error: 'Invalid move.' }, 400);

    const fen: string = room.board?.fen || new Chess().fen();
    const chess = new Chess(fen);
    let move;
    try {
      move = chess.move({ from, to, promotion: promotion || 'q' });
    } catch {
      move = null;
    }
    if (!move) return json({ error: 'Illegal move.' }, 400);

    const newFen = chess.fen();

    if (chess.isGameOver()) {
      // chess.js's turn() flips to the side that must move next right after .move() succeeds, so a
      // checkmate here means the OPPONENT (now to move) is checkmated — the mover (me) wins.
      const outcomes: Record<string, 'win' | 'tie' | 'loss'> = chess.isCheckmate()
        ? { [me]: 'win', [opponent.userId]: 'loss' }
        : { [me]: 'tie', [opponent.userId]: 'tie' };

      const { error: updErr } = await admin
        .from('game_rooms')
        .update({ board: { fen: newFen, lastMove: { from, to } } })
        .eq('code', code);
      if (updErr) return json({ error: updErr.message }, 500);

      const { error: finErr } = await admin.rpc('finalize_room_outcome', { p_code: code, p_outcomes: outcomes });
      if (finErr) return json({ error: finErr.message }, 500);
    } else {
      const { error: updErr } = await admin
        .from('game_rooms')
        .update({ board: { fen: newFen, lastMove: { from, to } }, turn: opponent.userId })
        .eq('code', code);
      if (updErr) return json({ error: updErr.message }, 500);
    }
  }

  // Build the response the same authorized/shaped way every other game-room call already does,
  // rather than re-deriving the room_json() shape by hand here.
  const asUser = createClient(url, publicKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: roomJson, error: getErr } = await asUser.rpc('get_game_room', { p_code: code });
  if (getErr) return json({ error: getErr.message }, 500);
  return json(roomJson);
});
