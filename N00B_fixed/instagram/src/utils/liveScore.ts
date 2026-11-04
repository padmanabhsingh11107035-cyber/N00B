// Online games where both players play their own round at the same time (Speed Math, Cyber Snake, Bubble Blitz, Memory Match, Rock Paper Scissors):
// each phone sends its current score on a Supabase Realtime channel named after the room, so the other player sees it climb live.
// It is only for show: the result of the match is still decided from the room in the database, so nothing can be faked by it.
import { supabase } from '../services/supabase';

type Entry = { channel: ReturnType<typeof supabase.channel>; ready: boolean; listeners: Set<(uid: string, value: number) => void>; pending: { uid: string; v: number } | null };
const rooms = new Map<string, Entry>();

function open(code: string): Entry | null {
  const known = rooms.get(code);
  if (known) return known;
  try {
    const channel = supabase.channel(`noob-live-${code}`);
    const entry: Entry = { channel, ready: false, listeners: new Set(), pending: null };
    channel.on('broadcast', { event: 'score' }, (msg: { payload?: { uid?: string; v?: number } }) => {
      const p = msg.payload;
      if (p && typeof p.uid === 'string' && typeof p.v === 'number') entry.listeners.forEach((fn) => fn(p.uid as string, p.v as number));
    });
    channel.subscribe((status: string) => {
      if (status !== 'SUBSCRIBED') return;
      entry.ready = true;
      if (entry.pending) { const p = entry.pending; entry.pending = null; void channel.send({ type: 'broadcast', event: 'score', payload: p }); }
    });
    rooms.set(code, entry);
    return entry;
  } catch { return null; }
}

/** Calls onScore whenever the other player sends a new score. Returns a function that stops listening and closes the channel. */
export function listenLive(code: string, onScore: (uid: string, value: number) => void): () => void {
  const entry = open(code);
  if (!entry) return () => undefined;
  entry.listeners.add(onScore);
  return () => {
    entry.listeners.delete(onScore);
    if (entry.listeners.size === 0) { rooms.delete(code); try { void supabase.removeChannel(entry.channel); } catch { /* already gone */ } }
  };
}

let lastSent = 0;
/** Sends my current score (at most about 4 times a second; the last value always goes out). */
export function sendLive(code: string, uid: string, value: number): void {
  const entry = open(code);
  if (!entry) return;
  const payload = { uid, v: value };
  if (!entry.ready) { entry.pending = payload; return; }
  const now = Date.now();
  if (now - lastSent < 250) { entry.pending = payload; window.setTimeout(() => { if (entry.pending === payload) { entry.pending = null; try { void entry.channel.send({ type: 'broadcast', event: 'score', payload }); } catch { /* the next one will do */ } } }, 260); return; }
  lastSent = now;
  try { void entry.channel.send({ type: 'broadcast', event: 'score', payload }); } catch { /* the next one will do */ }
}
