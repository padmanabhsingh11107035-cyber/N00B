// Online games: the quick way to hear that the other player did something. A player who has just written to the shared room (moved, joined, finished) sends a tiny "poke" on a Supabase
// Realtime channel named after the room; the other player's phone hears it at once and reads the room straight away, instead of waiting for its next check (which now runs every second as
// a safety net). The poke carries no game data: the room itself is still read from the database, so nothing can be faked by it. When Realtime is not available nothing breaks: the checks go on.
import { supabase } from '../services/supabase';

type Entry = { channel: ReturnType<typeof supabase.channel>; listeners: Set<() => void>; ready: boolean; queued: boolean };
const rooms = new Map<string, Entry>();

function open(code: string): Entry | null {
  const known = rooms.get(code);
  if (known) return known;
  try {
    const channel = supabase.channel(`noob-room-${code}`);
    const entry: Entry = { channel, listeners: new Set(), ready: false, queued: false };
    channel.on('broadcast', { event: 'poke' }, () => entry.listeners.forEach((fn) => fn()));
    channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        entry.ready = true;
        if (entry.queued) { entry.queued = false; void channel.send({ type: 'broadcast', event: 'poke', payload: {} }); }
      }
    });
    rooms.set(code, entry);
    return entry;
  } catch { return null; }
}

function release(code: string): void {
  const entry = rooms.get(code);
  if (!entry || entry.listeners.size > 0) return;
  rooms.delete(code);
  try { void supabase.removeChannel(entry.channel); } catch { /* already gone */ }
}

/** Calls onPoke whenever the other player pokes this room. Returns a function that stops listening. */
export function listenRoom(code: string, onPoke: () => void): () => void {
  const entry = open(code);
  if (!entry) return () => undefined;
  entry.listeners.add(onPoke);
  return () => { entry.listeners.delete(onPoke); window.setTimeout(() => release(code), 3000); };
}

/** Pokes the other player of this room (fire and forget). */
export function pingRoom(code: string): void {
  const entry = open(code);
  if (!entry) return;
  if (entry.ready) { try { void entry.channel.send({ type: 'broadcast', event: 'poke', payload: {} }); } catch { /* the other player's next check will find it */ } } else entry.queued = true;
  window.setTimeout(() => release(code), 4000);
}
