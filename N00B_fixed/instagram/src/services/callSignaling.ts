// The signaling side of a NOOB group call: a small, ephemeral Realtime channel that lets the people
// already in a call find each other and swap the handful of messages WebRTC needs (an "offer",
// an "answer", and a stream of tiny ICE candidates) to open a DIRECT connection between their
// browsers. Once that connection opens, the actual audio/video for that pair flows straight between
// their two devices — this channel never sees it and never sees anything after the call ends.
//
// Access to a call's channel is gated server-side (see migration 20260922000024_group_calls.sql):
// only a genuine member of that chat may listen to or send on "call:<chatId>" at all, checked by
// Postgres RLS on every message, not just by the chat id being hard to guess.
import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface CallPresence {
  userId: string;
  username: string;
  displayName?: string;
  avatar?: string;
  hasVideo: boolean;
  hasAudio: boolean;
}

export type SignalKind = 'offer' | 'answer' | 'ice' | 'bye';
export interface SignalMessage {
  from: string;
  to: string;
  kind: SignalKind;
  data?: unknown;
}

export interface CallChannel {
  track: (presence: CallPresence) => Promise<void>;
  send: (msg: SignalMessage) => Promise<void>;
  presenceState: () => Record<string, CallPresence>;
  leave: () => Promise<void>;
}

export function joinCallChannel(
  chatId: string,
  myUserId: string,
  onSignal: (msg: SignalMessage) => void,
  onPresenceChange: (state: Record<string, CallPresence>) => void
): CallChannel {
  const channel: RealtimeChannel = supabase.channel(`call:${chatId}`, {
    config: { private: true, broadcast: { self: false }, presence: { key: myUserId } }
  });

  const presenceState = (): Record<string, CallPresence> => {
    const raw = channel.presenceState<CallPresence>();
    const out: Record<string, CallPresence> = {};
    for (const key of Object.keys(raw)) {
      const entry = raw[key]?.[0] as unknown as CallPresence | undefined;
      if (entry) out[key] = entry;
    }
    return out;
  };

  channel
    .on('broadcast', { event: 'signal' }, ({ payload }) => {
      const msg = payload as SignalMessage;
      if (msg && msg.to === myUserId) onSignal(msg);
    })
    .on('presence', { event: 'sync' }, () => onPresenceChange(presenceState()))
    .subscribe();

  return {
    track: async (presence) => {
      await channel.track(presence);
    },
    send: async (msg) => {
      await channel.send({ type: 'broadcast', event: 'signal', payload: msg });
    },
    presenceState,
    leave: async () => {
      try {
        await channel.untrack();
      } catch {
        /* already gone */
      }
      await supabase.removeChannel(channel);
    }
  };
}

// Free, public STUN servers only (no TURN/paid relay): enough for most home and phone connections to
// find a direct path to each other. A small number of people behind strict corporate or carrier NATs
// may fail to connect to each other specifically — an honest limit of not running paid relay infrastructure,
// not a bug.
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

export const MAX_CALL_PARTICIPANTS = 6;
