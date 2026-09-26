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

// Free, public STUN servers — used as-is when TURN credentials aren't available, and always included
// alongside TURN as extra fallback options.
const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

// STUN alone can't get two devices through many real-world NATs (cellular carrier-grade NAT, some
// corporate/campus Wi-Fi, some home routers) — this asks the server for short-lived TURN relay
// credentials (minted per-call so nothing long-lived ever reaches the browser) and falls back to
// STUN-only if TURN isn't configured yet or is briefly unreachable, so a call still works either way.
export async function getIceServers(): Promise<RTCIceServer[]> {
  try {
    const { data, error } = await supabase.functions.invoke('dynamic-handler', { body: { action: 'get_turn_credentials' } });
    if (!error && Array.isArray(data?.iceServers) && data.iceServers.length) return data.iceServers as RTCIceServer[];
  } catch {
    /* fall through to STUN-only below */
  }
  return STUN_SERVERS;
}

export const MAX_CALL_PARTICIPANTS = 6;
