import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Users, AlertTriangle, Loader2, PhoneIncoming } from 'lucide-react';
import type { User } from '../../types';
import { useChatCall, type CallParticipant } from './useChatCall';
import { MAX_CALL_PARTICIPANTS } from '../../services/callSignaling';
import { listenForRings, sendRing } from '../../services/ringSignaling';
import { notifyIncomingRing, logCallEvent } from '../../services/api';

// How long an outgoing call rings before it's treated as unanswered and auto-cancelled — long enough
// for someone to notice their phone/device and react, short enough that the caller isn't left staring
// at a ringing screen indefinitely.
const RING_TIMEOUT_MS = 45_000;

interface RingTarget {
  id: string;
  username: string;
  displayName?: string;
  avatar?: string;
}

interface ChatCallModalProps {
  chatId: string;
  chatName: string;
  currentUser: User;
  onClose: () => void;
  // Present only when THIS modal instance represents a fresh, outgoing call (the person tapped
  // "Start a call" themselves) — the other chat members to ring. Omitted when arriving here by
  // accepting someone else's ring, so accepting a call never also rings everyone right back.
  ringMembers?: RingTarget[];
  isGroup?: boolean;
}

// One participant's tile — audio-only, so always their avatar, with a mic-off badge when muted.
const Tile: React.FC<{ p: CallParticipant }> = ({ p }) => (
  <div className="relative aspect-video bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 flex items-center justify-center">
    <div className={`relative w-16 h-16 rounded-full ${p.hasAudio ? 'ring-2 ring-[#00FF66]/60' : 'ring-2 ring-zinc-700'}`}>
      <img src={p.avatar || '/noob-logo-circle.png'} alt="" className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
    </div>
    {/* remote audio has to actually play somewhere */}
    {!p.isLocal && p.stream && <AudioSink stream={p.stream} />}
    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2">
      <span className="text-[11px] font-bold text-white bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-lg truncate">
        {p.isLocal ? 'You' : p.displayName || p.username}
      </span>
      {!p.hasAudio && (
        <span className="p-1 rounded-full bg-black/60 backdrop-blur-md shrink-0">
          <MicOff className="w-3 h-3 text-red-400" />
        </span>
      )}
    </div>
  </div>
);

const AudioSink: React.FC<{ stream: MediaStream }> = ({ stream }) => {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay />;
};

// A real call: direct WebRTC between everyone in it (see useChatCall.ts). Nothing here is ever
// saved — no recording, no call log beyond the one plain "call ended/missed/declined" line — the
// call simply exists for as long as people are in it.
export const ChatCallModal: React.FC<ChatCallModalProps> = ({ chatId, chatName, currentUser, onClose, ringMembers, isGroup }) => {
  const { joined, ringing, participants, micOn, error, startAsCaller, answer, leave, toggleMic, atCapacity } = useChatCall(chatId, currentUser);
  const startAttempted = useRef(false);
  const ringSent = useRef(false);
  const closedRef = useRef(false);
  const [declinedBy, setDeclinedBy] = useState<string[]>([]);
  const isOutgoing = !!ringMembers && ringMembers.length > 0;

  useEffect(() => {
    if (startAttempted.current) return;
    startAttempted.current = true;
    if (isOutgoing) startAsCaller();
    else void answer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rings the other side(s) the moment this call actually opens — only for a fresh outgoing call.
  useEffect(() => {
    if (!isOutgoing || ringSent.current) return;
    ringSent.current = true;
    const event = {
      type: 'incoming' as const,
      chatId,
      chatName,
      isGroup: !!isGroup,
      from: { id: currentUser.id, username: currentUser.username, displayName: currentUser.displayName, avatar: currentUser.avatar }
    };
    for (const m of ringMembers!) {
      void sendRing(m.id, event).catch(() => undefined);
      // Backup path for a fully closed app — see notify_incoming_ring / dynamic-handler's handlePush.
      void notifyIncomingRing(chatId, m.id);
    }
  }, [isOutgoing, ringMembers, chatId, chatName, isGroup, currentUser]);

  // An outgoing call nobody answers within RING_TIMEOUT_MS is treated as the caller hanging up early.
  const [ringTimedOut, setRingTimedOut] = useState(false);
  useEffect(() => {
    if (!isOutgoing) return;
    const timer = window.setTimeout(() => setRingTimedOut(true), RING_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [isOutgoing]);
  useEffect(() => {
    if (ringTimedOut && !joined) handleClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ringTimedOut]);

  // Only the caller listens for declines — shown as a small notice, never blocks the call (the
  // people who did join keep talking regardless of who else said no).
  useEffect(() => {
    if (!isOutgoing) return;
    const stop = listenForRings(currentUser.id, (e) => {
      if (e.type === 'declined' && e.chatId === chatId) {
        setDeclinedBy((prev) => (prev.includes(e.from.username) ? prev : [...prev, e.from.username]));
      }
    });
    return stop;
  }, [isOutgoing, chatId, currentUser.id]);

  const handleClose = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    // Nobody ever picked up — let their phones stop ringing instead of leaving them hanging, and log
    // it as a missed call (whether that's because the ring timed out or the caller gave up early).
    if (isOutgoing && !joined) {
      const event = {
        type: 'cancelled' as const,
        chatId,
        chatName,
        isGroup: !!isGroup,
        from: { id: currentUser.id, username: currentUser.username, displayName: currentUser.displayName, avatar: currentUser.avatar }
      };
      for (const m of ringMembers!) void sendRing(m.id, event).catch(() => undefined);
      void logCallEvent(chatId, 'missed');
    }
    leave();
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The call ended itself (the hook auto-hung-up because it dropped below 2 participants) — close
  // the screen automatically. Only fires on the ringing/joined -> neither transition, never on the
  // very first render (before the call has had a chance to actually start).
  const wasActiveRef = useRef(false);
  useEffect(() => {
    if (ringing || joined) {
      wasActiveRef.current = true;
      return;
    }
    if (wasActiveRef.current && !error) handleClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ringing, joined, error]);

  return (
    <div className="fixed inset-0 z-[130] bg-black/95 backdrop-blur-md flex flex-col" role="dialog" aria-modal="true" aria-label={`Call in ${chatName}`}>
      <header className="p-4 flex items-center justify-between border-b border-zinc-900 shrink-0">
        <div>
          <h3 className="text-sm font-black text-white">{chatName}</h3>
          <p className="text-[11px] text-zinc-400 flex items-center gap-1.5">
            <Users className="w-3 h-3" />
            {ringing ? 'Ringing…' : `${participants.length} in the call — direct between devices, nothing saved`}
          </p>
          {declinedBy.length > 0 && <p className="text-[11px] text-amber-400 mt-0.5">@{declinedBy.join(', @')} declined</p>}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {ringing && !error ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-400 py-16">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-[#00FF66]/20 animate-ping" />
              <PhoneIncoming className="relative w-10 h-10 text-[#00FF66]" />
            </div>
            <p className="text-xs">Ringing — nothing connects until someone answers…</p>
          </div>
        ) : !joined && !error ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-400 py-16">
            <Loader2 className="w-8 h-8 animate-spin text-[#00FF66]" />
            <p className="text-xs">Connecting…</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {participants.map((p) => (
              <Tile key={p.userId} p={p} />
            ))}
          </div>
        )}
        {joined && !micOn && !error && (
          <p className="text-[11px] text-zinc-500 text-center mt-4">Tap the mic button below to start talking.</p>
        )}
        {joined && atCapacity && (
          <p className="text-[11px] text-amber-300 text-center mt-4">
            This call is full — a group call holds at most {MAX_CALL_PARTICIPANTS} people at once.
          </p>
        )}
      </div>

      <div className="p-5 flex items-center justify-center gap-4 border-t border-zinc-900 shrink-0">
        <button
          onClick={toggleMic}
          disabled={!joined}
          title={micOn ? 'Mute microphone' : 'Unmute microphone'}
          className={`p-4 rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
            micOn ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'bg-red-500/20 text-red-400 border border-red-500/40'
          }`}
        >
          {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>
        <button onClick={handleClose} title={ringing ? 'Cancel' : 'Leave call'} className="p-4 rounded-full bg-red-600 hover:bg-red-500 text-white cursor-pointer">
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
