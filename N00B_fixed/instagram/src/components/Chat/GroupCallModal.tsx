import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Users, AlertTriangle, Loader2 } from 'lucide-react';
import type { User } from '../../types';
import { useGroupCall, type CallParticipant } from './useGroupCall';
import { MAX_CALL_PARTICIPANTS } from '../../services/callSignaling';

interface GroupCallModalProps {
  chatId: string;
  chatName: string;
  currentUser: User;
  onClose: () => void;
}

// One participant's tile: their video when they have it on, otherwise their avatar — never a blank
// box, so it is always clear who is actually there even with the camera off.
const Tile: React.FC<{ p: CallParticipant }> = ({ p }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && p.stream) videoRef.current.srcObject = p.stream;
  }, [p.stream]);
  const showVideo = p.hasVideo && p.stream && p.stream.getVideoTracks().length > 0;
  return (
    <div className="relative aspect-video bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 flex items-center justify-center">
      {showVideo ? (
        <video ref={videoRef} autoPlay playsInline muted={p.isLocal} className="w-full h-full object-cover" />
      ) : (
        <img
          src={p.avatar || '/noob-logo-circle.png'}
          alt=""
          className="w-16 h-16 rounded-full object-cover ring-2 ring-zinc-700"
          referrerPolicy="no-referrer"
        />
      )}
      {/* remote audio plays even while its tile shows an avatar (no video) */}
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
};

// A remote participant's audio has to actually play somewhere — the tile above only shows their
// avatar when video is off, so this renders the same stream into a hidden <audio> element instead of
// depending on a visible <video> tag being present.
const AudioSink: React.FC<{ stream: MediaStream }> = ({ stream }) => {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay />;
};

// A real group call: direct WebRTC between everyone in it (see useGroupCall.ts). Nothing here is ever
// saved — no recording, no call log, no message about who was on it — the call simply exists for as
// long as people are in it.
export const GroupCallModal: React.FC<GroupCallModalProps> = ({ chatId, chatName, currentUser, onClose }) => {
  const { joined, participants, micOn, cameraOn, error, join, leave, toggleMic, toggleCamera, atCapacity } = useGroupCall(chatId, currentUser);
  const joinAttempted = useRef(false);

  useEffect(() => {
    if (joinAttempted.current) return;
    joinAttempted.current = true;
    void join();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = () => {
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

  return (
    <div className="fixed inset-0 z-[130] bg-black/95 backdrop-blur-md flex flex-col" role="dialog" aria-modal="true" aria-label={`Call in ${chatName}`}>
      <header className="p-4 flex items-center justify-between border-b border-zinc-900 shrink-0">
        <div>
          <h3 className="text-sm font-black text-white">{chatName}</h3>
          <p className="text-[11px] text-zinc-400 flex items-center gap-1.5">
            <Users className="w-3 h-3" /> {participants.length} in the call — direct between devices, nothing saved
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {!joined && !error ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-400 py-16">
            <Loader2 className="w-8 h-8 animate-spin text-[#00FF66]" />
            <p className="text-xs">Joining the call…</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {participants.map((p) => (
              <Tile key={p.userId} p={p} />
            ))}
          </div>
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
        <button
          onClick={() => void toggleCamera()}
          disabled={!joined}
          title={cameraOn ? 'Turn camera off' : 'Turn camera on'}
          className={`p-4 rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
            cameraOn ? 'bg-[#00FF66] text-black' : 'bg-zinc-800 text-white hover:bg-zinc-700'
          }`}
        >
          {cameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>
        <button
          onClick={handleClose}
          title="Leave call"
          className="p-4 rounded-full bg-red-600 hover:bg-red-500 text-white cursor-pointer"
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
