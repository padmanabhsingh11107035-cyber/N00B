import React, { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Users } from 'lucide-react';
import type { RingEvent } from '../../services/ringSignaling';

interface IncomingCallModalProps {
  ring: RingEvent;
  onAccept: () => void;
  onDecline: () => void;
}

// A classic two-tone ring, generated with the Web Audio API so this needs no audio file — looped
// until the call is answered, declined, or the caller cancels. Best-effort: a browser that refuses
// to let audio play without a prior user gesture just rings silently (the visible screen and
// vibration below still work), never a crash.
function useRingtone(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!active) return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    ctxRef.current = ctx;

    const playPulse = () => {
      if (ctx.state === 'closed') return;
      for (const freq of [480, 620]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.9);
      }
    };

    playPulse();
    timerRef.current = window.setInterval(playPulse, 1600);

    return () => {
      window.clearInterval(timerRef.current);
      try {
        void ctx.close();
      } catch {
        /* already closed */
      }
    };
  }, [active]);
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({ ring, onAccept, onDecline }) => {
  useRingtone(true);

  useEffect(() => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate([500, 300, 500, 300, 500]);
      } catch {
        /* not supported everywhere */
      }
    }
  }, []);

  return (
    <div
      className="fixed inset-0 z-[140] bg-gradient-to-b from-zinc-950 via-black to-zinc-950 flex flex-col items-center justify-between py-16 px-6 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={`Incoming call from ${ring.from.displayName || ring.from.username}`}
    >
      <div className="text-center space-y-1.5">
        <p className="text-xs font-bold text-[#00FF66] uppercase tracking-widest">
          {ring.isGroup ? 'Incoming Group Call' : 'Incoming Call'}
        </p>
        <p className="text-[11px] text-zinc-500">{ring.chatName}</p>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-[#00FF66]/20 animate-ping" />
          <img
            src={ring.from.avatar || '/noob-logo-circle.png'}
            alt={ring.from.username}
            className="relative w-28 h-28 rounded-full object-cover ring-4 ring-[#00FF66]/60"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-black text-white">{ring.from.displayName || ring.from.username}</h2>
          <p className="text-xs text-zinc-400">@{ring.from.username} is calling you</p>
        </div>
        {ring.isGroup && (
          <span className="flex items-center gap-1.5 text-[10px] text-zinc-500 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-full">
            <Users className="w-3 h-3" /> Group call
          </span>
        )}
      </div>

      <div className="flex items-center gap-10">
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={onDecline}
            title="Decline"
            className="p-5 rounded-full bg-red-600 hover:bg-red-500 text-white cursor-pointer shadow-lg shadow-red-600/30 transition-transform hover:scale-105"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
          <span className="text-[11px] text-zinc-400 font-semibold">Decline</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={onAccept}
            title="Accept"
            className="p-5 rounded-full bg-[#00FF66] hover:bg-[#00FF66]/90 text-black cursor-pointer shadow-lg shadow-[#00FF66]/30 transition-transform hover:scale-105"
          >
            <Phone className="w-6 h-6" />
          </button>
          <span className="text-[11px] text-zinc-400 font-semibold">Accept</span>
        </div>
      </div>
    </div>
  );
};
