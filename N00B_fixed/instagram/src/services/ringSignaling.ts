// "Ringing" for NOOB calls: a small, ephemeral Realtime broadcast that tells someone a call is
// waiting for them, wherever they currently are in the app — separate from callSignaling.ts, which
// only reaches people who have already opened that specific call's screen. Nothing here is ever
// written to a table; a ring exists only for the moment it takes to deliver it (see migration
// 20260923000035_call_ringing_and_1to1_calls.sql for the server-side authorization).
import { supabase } from './supabase';

export type RingEventType = 'incoming' | 'declined' | 'cancelled';

export interface RingEvent {
  type: RingEventType;
  chatId: string;
  chatName: string;
  isGroup: boolean;
  from: { id: string; username: string; displayName?: string; avatar?: string };
}

// Mounted once, app-wide (see useIncomingCalls) — this is what makes an incoming call reachable no
// matter which tab or screen someone is currently on.
export function listenForRings(myUserId: string, onEvent: (e: RingEvent) => void): () => void {
  const channel = supabase.channel(`ring:${myUserId}`, {
    config: { private: true, broadcast: { self: false } }
  });
  channel.on('broadcast', { event: 'ring' }, ({ payload }) => onEvent(payload as RingEvent)).subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

// One-shot: open just long enough to deliver this one ring, then close. The server only accepts
// this when the sender is a real, call-eligible member of `event.chatId` and the recipient is too
// (see the migration) — this can never be used to ring someone you don't actually share a chat with.
export async function sendRing(toUserId: string, event: RingEvent): Promise<void> {
  const channel = supabase.channel(`ring:${toUserId}`, {
    config: { private: true, broadcast: { self: false } }
  });
  try {
    await new Promise<void>((resolve, reject) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') reject(new Error(status));
      });
    });
    await channel.send({ type: 'broadcast', event: 'ring', payload: event });
  } finally {
    void supabase.removeChannel(channel);
  }
}
