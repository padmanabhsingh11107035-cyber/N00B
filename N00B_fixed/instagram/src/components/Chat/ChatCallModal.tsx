import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, AlertTriangle, Volume2, VolumeX } from 'lucide-react';
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

// One person in the call: a round picture and the name, with a mic-off mark when they are muted.
// For a remote person, the connection underneath (see connectionState on CallParticipant) is what actually decides whether their audio can reach this device at all,
// so a stuck / failed connection is written under the name instead of just silently never making a sound.
const Face: React.FC<{ p: CallParticipant; size: number }> = ({ p, size }) => {
  const notConnected = !p.isLocal && p.connectionState && p.connectionState !== 'connected';
  const failed = !p.isLocal && (p.connectionState === 'failed' || p.connectionState === 'disconnected');
  return (
    <div className="flex flex-col items-center gap-2 min-w-0">
      <div className="relative rounded-full" style={{ width: size, height: size }}>
        <img src={p.avatar || '/noob-logo-circle.png'} alt="" className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
        {!p.hasAudio && (
          <span className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-black border border-white/20"><MicOff className="w-3.5 h-3.5 text-red-400" /></span>
        )}
      </div>
      <span className="text-sm font-bold text-white truncate max-w-[110px]">{p.isLocal ? 'You' : p.displayName || p.username}</span>
      {notConnected && <span className={`text-[11px] font-semibold ${failed ? 'text-red-300' : 'text-zinc-400'}`}>{failed ? 'Connection issue' : 'Connecting audio…'}</span>}
    </div>
  );
};

const AudioSink: React.FC<{ stream: MediaStream; muted?: boolean }> = ({ stream, muted }) => {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream;
    // Autoplay is normally allowed for a real-time call stream, but if the browser blocks it
    // anyway this makes that an actual, loggable failure instead of silent, unexplained quiet.
    ref.current.play().catch((err) => console.warn('[call] could not autoplay remote audio:', err));
  }, [stream]);
  return <audio ref={ref} autoPlay muted={!!muted} />;
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
  // "Speaker": whether the other people can be heard on this device (off = their sound is switched off here, they still hear you)
  const [speakerOn, setSpeakerOn] = useState(true);
  const [now, setNow] = useState(() => Date.now());

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

  // when the call was picked up, for the length written on the Calls page
  const joinedAtRef = useRef<number | null>(null);
  if (joined && joinedAtRef.current === null) joinedAtRef.current = Date.now();
  useEffect(() => {
    if (!joined) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [joined]);
  const secs = joinedAtRef.current ? Math.max(0, Math.floor((now - joinedAtRef.current) / 1000)) : 0;
  const clock = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  const handleClose = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    // a call that was connected: the person who started it writes it down once (with how long it lasted)
    if (isOutgoing && joined && joinedAtRef.current) void logCallEvent(chatId, 'ended', (Date.now() - joinedAtRef.current) / 1000);
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

  const others = participants.filter((p) => !p.isLocal);
  const isPair = !isGroup && others.length <= 1;
  const bigPhoto = others[0]?.avatar || ringMembers?.[0]?.avatar || '/noob-logo-circle.png';
  const status = error ? '' : ringing ? 'Ringing…' : !joined ? 'Connecting…' : clock;

  return (
    <div
      data-noob-keep="1"
      className="edge-own call-page fixed inset-0 z-[130] media-dark chat-wallpaper flex flex-col text-white"
      style={{ paddingTop: 'calc(var(--sat, env(safe-area-inset-top, 0px)) + 10px)', paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}
      role="dialog" aria-modal="true" aria-label={`Call in ${chatName}`}
    >
      {/* the other side's sound: one hidden player each, switched by the Speaker button */}
      {others.map((p) => (p.stream ? <AudioSink key={p.userId} stream={p.stream} muted={!speakerOn} /> : null))}

      <header className="shrink-0 px-5 pt-3 text-center">
        <h3 className="text-[34px] leading-tight font-extrabold tracking-tight truncate">{chatName}</h3>
        <p className="mt-1 text-[22px] font-semibold text-zinc-400 tabular-nums" data-testid="call-status">{status}</p>
        {declinedBy.length > 0 && <p className="text-xs text-amber-400 mt-1">@{declinedBy.join(', @')} declined</p>}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 flex flex-col items-center justify-center">
        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-bold flex items-center gap-2 max-w-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {isPair ? (
          <div className="relative">
            {!joined && !error && <div className="absolute -inset-3 rounded-full bg-white/10 animate-ping" />}
            <img src={bigPhoto} alt="" className="relative w-[min(56vw,260px)] h-[min(56vw,260px)] rounded-full object-cover shadow-[0_20px_50px_-20px_rgba(0,0,0,.9)]" referrerPolicy="no-referrer" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-x-5 gap-y-6 w-full max-w-sm justify-items-center">
            {(joined ? participants : []).map((p) => <Face key={p.userId} p={p} size={76} />)}
          </div>
        )}
        {joined && !micOn && !error && <p className="text-xs text-zinc-500 text-center mt-5">Your microphone is off. Tap Mute to turn it on.</p>}
        {joined && atCapacity && (
          <p className="text-xs text-amber-300 text-center mt-4">This call is full: a group call holds at most {MAX_CALL_PARTICIPANTS} people at once.</p>
        )}
      </div>

      {/* the buttons: one rounded panel, big round buttons with their names */}
      <div className="shrink-0 mx-3 rounded-[32px] bg-[#232326] border border-white/5 px-6 py-6 grid grid-cols-3 gap-y-5 justify-items-center" data-testid="call-controls">
        <button type="button" onClick={() => setSpeakerOn((v) => !v)} className="flex flex-col items-center gap-2 cursor-pointer active:scale-95 transition-transform" aria-pressed={speakerOn} aria-label="Speaker">
          <span className={`w-[72px] h-[72px] rounded-full grid place-items-center ${speakerOn ? 'bg-white text-black' : 'bg-[#0f0f11] text-white'}`}>
            {speakerOn ? <Volume2 className="w-7 h-7" /> : <VolumeX className="w-7 h-7" />}
          </span>
          <span className="text-[17px] font-semibold">Speaker</span>
        </button>
        <button type="button" onClick={toggleMic} disabled={!joined} className="flex flex-col items-center gap-2 cursor-pointer active:scale-95 transition-transform disabled:opacity-40" aria-pressed={!micOn} aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}>
          <span className={`w-[72px] h-[72px] rounded-full grid place-items-center ${micOn ? 'bg-[#0f0f11] text-white' : 'bg-white text-black'}`}>
            {micOn ? <Mic className="w-7 h-7" /> : <MicOff className="w-7 h-7" />}
          </span>
          <span className="text-[17px] font-semibold">{micOn ? 'Mute' : 'Unmute'}</span>
        </button>
        <button type="button" onClick={handleClose} className="flex flex-col items-center gap-2 cursor-pointer active:scale-95 transition-transform" aria-label={ringing ? 'Cancel' : 'End call'} data-testid="call-end">
          <span className="w-[72px] h-[72px] rounded-full grid place-items-center bg-[#d4183d] text-white"><PhoneOff className="w-7 h-7" /></span>
          <span className="text-[17px] font-semibold">{ringing ? 'Cancel' : 'End'}</span>
        </button>
      </div>
    </div>
  );
};
