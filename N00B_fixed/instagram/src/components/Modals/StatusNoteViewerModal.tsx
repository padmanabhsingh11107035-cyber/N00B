import React, { useEffect, useRef, useState } from 'react';
import { X, Music, MapPin, Volume2, VolumeX, Play, Pause, Trash2, Edit3, Clock, Sparkles } from 'lucide-react';
import { StatusNote } from '../../types';

interface StatusNoteViewerModalProps {
  note: StatusNote;
  user: {
    id?: string;
    username: string;
    displayName?: string;
    avatar?: string;
  };
  isCurrentUser?: boolean;
  onClose: () => void;
  onOpenEditNote?: () => void;
  onClearNote?: () => void;
}

export const StatusNoteViewerModal: React.FC<StatusNoteViewerModalProps> = ({
  note,
  user,
  isCurrentUser = false,
  onClose,
  onOpenEditNote,
  onClearNote
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const intervalRef = useRef<any>(null);

  // 1. Calculate remaining time before vanishing (24-hour lifespan)
  useEffect(() => {
    const calculateTime = () => {
      const now = Date.now();
      const expires = note.expiresAt || (note.createdAtTimestamp ? note.createdAtTimestamp + 24 * 60 * 60 * 1000 : now + 24 * 60 * 60 * 1000);
      const diffMs = expires - now;

      if (diffMs <= 0) {
        setTimeLeft('Expired (vanishing...)');
        if (onClearNote && isCurrentUser) {
          onClearNote();
        }
      } else {
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        setTimeLeft(`${hours}h ${minutes}m left`);
      }
    };

    calculateTime();
    const timer = setInterval(calculateTime, 30000);
    return () => clearInterval(timer);
  }, [note, isCurrentUser, onClearNote]);

  // 2. Auto-play tagged song automatically using Web Audio synthesizer
  useEffect(() => {
    if (note.musicTrack) {
      startSynthMusic(note.musicTrack);
    }

    return () => {
      stopSynthMusic();
    };
  }, [note.musicTrack]);

  const startSynthMusic = (trackTitle: string) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.2, ctx.currentTime);
      masterGain.connect(ctx.destination);
      gainNodeRef.current = masterGain;

      // Determine chord sequence based on track name
      let chordFreqs = [261.63, 329.63, 392.00, 523.25]; // C major default
      if (trackTitle.toLowerCase().includes('cyber') || trackTitle.toLowerCase().includes('synth')) {
        chordFreqs = [220.00, 261.63, 329.63, 440.00]; // A minor cyber
      } else if (trackTitle.toLowerCase().includes('lo-fi')) {
        chordFreqs = [174.61, 220.00, 261.63, 329.63]; // Fmaj7 chill
      } else if (trackTitle.toLowerCase().includes('robot')) {
        chordFreqs = [196.00, 246.94, 293.66, 392.00]; // G techno
      }

      let step = 0;
      const playNote = () => {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') return;
        const noteCtx = audioCtxRef.current;
        const osc = noteCtx.createOscillator();
        const noteGain = noteCtx.createGain();

        const baseFreq = chordFreqs[step % chordFreqs.length];
        osc.type = trackTitle.toLowerCase().includes('synth') ? 'sawtooth' : 'sine';
        osc.frequency.setValueAtTime(baseFreq, noteCtx.currentTime);

        noteGain.gain.setValueAtTime(0.01, noteCtx.currentTime);
        noteGain.gain.exponentialRampToValueAtTime(0.18, noteCtx.currentTime + 0.1);
        noteGain.gain.exponentialRampToValueAtTime(0.001, noteCtx.currentTime + 1.2);

        osc.connect(noteGain);
        noteGain.connect(masterGain);

        osc.start();
        osc.stop(noteCtx.currentTime + 1.3);

        step++;
      };

      playNote();
      intervalRef.current = setInterval(playNote, 900);
      setIsPlaying(true);
    } catch (err) {
      console.warn('Audio auto-play notice:', err);
    }
  };

  const stopSynthMusic = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      try {
        audioCtxRef.current.close();
      } catch (e) {
        // ignore
      }
      audioCtxRef.current = null;
    }
    setIsPlaying(false);
  };

  const togglePlay = () => {
    if (isPlaying) {
      stopSynthMusic();
    } else if (note.musicTrack) {
      startSynthMusic(note.musicTrack);
    }
  };

  const toggleMute = () => {
    if (gainNodeRef.current && audioCtxRef.current) {
      if (isMuted) {
        gainNodeRef.current.gain.setValueAtTime(0.2, audioCtxRef.current.currentTime);
        setIsMuted(false);
      } else {
        gainNodeRef.current.gain.setValueAtTime(0, audioCtxRef.current.currentTime);
        setIsMuted(true);
      }
    }
  };

  return (
    <div
      id="status-note-viewer-backdrop"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        id="status-note-viewer-card"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-6 relative animate-in zoom-in-95 duration-200"
      >
        {/* Top controls: 24h timer & Close */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Clock className="w-4 h-4" />
            </span>
            <div>
              <span className="text-xs font-bold text-white block">Status Note</span>
              <span className="text-[10px] text-amber-400 font-semibold">
                ⏳ Disappears in 24h • {timeLeft || 'Active'}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-zinc-900 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Big Note Speech Bubble (turns into bigger view!) */}
        <div className="flex flex-col items-center py-2 space-y-4">
          <div className="relative w-full max-w-sm">
            <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-black border-2 border-[#00FF66] rounded-3xl p-6 shadow-[0_0_30px_rgba(0,255,102,0.2)] text-center relative overflow-hidden group">
              <Sparkles className="w-4 h-4 text-[#00FF66] absolute top-3 left-3 opacity-60" />
              <p className="text-base sm:text-lg font-bold text-white leading-relaxed break-words px-2">
                "{note.text}"
              </p>
              {note.location && (
                <div className="mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-[#00FF66] bg-[#00FF66]/10 py-1 px-3 rounded-full mx-auto w-fit border border-[#00FF66]/20">
                  <MapPin className="w-3 h-3" />
                  <span>{note.location}</span>
                </div>
              )}
            </div>
            {/* Triangular pointer pointing to avatar */}
            <div className="w-4 h-4 bg-zinc-900 border-r-2 border-b-2 border-[#00FF66] rotate-45 mx-auto -mt-2" />
          </div>

          {/* User info */}
          <div className="flex items-center gap-3 mt-1">
            <img
              src={user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
              alt={user.username}
              className="w-14 h-14 rounded-full object-cover ring-2 ring-[#00FF66] shadow-lg"
              referrerPolicy="no-referrer"
            />
            <div>
              <span className="text-sm font-bold text-white block">
                {user.displayName || user.username}
              </span>
              <span className="text-xs text-zinc-400">@{user.username}</span>
            </div>
          </div>
        </div>

        {/* Auto-Playing Music Tag Section */}
        {note.musicTrack ? (
          <div className="p-3.5 bg-gradient-to-r from-emerald-950/60 via-zinc-900 to-black border border-[#00FF66]/40 rounded-2xl flex items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={togglePlay}
                className="w-10 h-10 rounded-xl bg-[#00FF66] hover:bg-[#00FF66]/90 text-black flex items-center justify-center shrink-0 cursor-pointer shadow-md transition-transform hover:scale-105"
                title={isPlaying ? 'Pause auto-playing audio' : 'Play song'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-black" /> : <Play className="w-5 h-5 fill-black ml-0.5" />}
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Music className="w-3.5 h-3.5 text-[#00FF66] shrink-0 animate-pulse" />
                  <span className="text-xs font-bold text-white truncate block">
                    {note.musicTrack}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-[#00FF66] font-semibold">
                    {isPlaying ? '🎵 Auto-playing tagged song' : 'Audio paused'}
                  </span>
                  {isPlaying && (
                    <span className="flex items-center gap-0.5">
                      <span className="w-1 h-3 bg-[#00FF66] rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1 h-4 bg-[#00FF66] rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1 h-2 bg-[#00FF66] rounded-full animate-bounce" />
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={toggleMute}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer shrink-0"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-[#00FF66]" />}
            </button>
          </div>
        ) : (
          <div className="text-center py-1">
            <span className="text-[11px] text-zinc-500">No music track attached to this note</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-zinc-800/80">
          {isCurrentUser ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (onClearNote) onClearNote();
                  onClose();
                }}
                className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 text-xs font-semibold flex items-center gap-1.5 border border-zinc-800 hover:border-red-500/30 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Note
              </button>
              <button
                onClick={() => {
                  onClose();
                  if (onOpenEditNote) onOpenEditNote();
                }}
                className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 border border-zinc-800 transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-[#00FF66]" /> Change Note
              </button>
            </div>
          ) : (
            <div className="text-[11px] text-zinc-500">
              Shared by @{user.username}
            </div>
          )}

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#00FF66] text-black font-bold text-xs hover:bg-[#00FF66]/90 transition-transform hover:scale-105 cursor-pointer ml-auto"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
