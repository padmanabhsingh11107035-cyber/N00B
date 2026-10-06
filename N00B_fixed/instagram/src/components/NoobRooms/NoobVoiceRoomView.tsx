import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Mic, MicOff, Users, LogOut, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import AgoraRTC, { IAgoraRTCClient, IMicrophoneAudioTrack, IRemoteAudioTrack } from 'agora-rtc-sdk-ng';
import { NoobRoom, NoobRoomParticipant, User } from '../../types';
import { AvatarMedia } from '../Common/AvatarMedia';
import {
  joinNoobRoom,
  leaveNoobRoom,
  endNoobRoom,
  fetchNoobRoomParticipants,
  subscribeToNoobRoomParticipants
} from '../../services/api';
import { friendlyAgoraError } from '../../utils/agoraError';

interface NoobVoiceRoomViewProps {
  currentUser: User;
  room: NoobRoom;
  onClose: () => void;
}

type Phase = 'connecting' | 'live' | 'ended';

interface RemoteEntry {
  uid: number;
  hasAudio: boolean;
  audioTrack?: IRemoteAudioTrack;
}

// Same stable-uid derivation as Live Lounge's agoraUidFor — lets every client work out "whose tile is
// this" from the DB's own participant list, no extra signaling needed.
function agoraUidFor(userId: string): number {
  const hex = userId.replace(/-/g, '').slice(0, 8);
  return parseInt(hex, 16) >>> 0;
}

// Audio-only, public, instant-join voice room. Adapted from LiveLoungeRoomView's live-call plumbing
// (Agora client setup, lazy mic-permission pattern, remote-track bookkeeping, cleanup-on-unmount) with
// everything that doesn't fit a public many-person room stripped out: no waiting room/admission (an
// Agora token request IS the join, see noob_room_join), no video/camera, no whiteboard/screen-share/
// invite — those are Live Lounge's private-meeting features, not this one's.
export const NoobVoiceRoomView: React.FC<NoobVoiceRoomViewProps> = ({ currentUser, room, onClose }) => {
  const [phase, setPhase] = useState<Phase>('connecting');
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState('');
  const [endReason, setEndReason] = useState<'left' | 'ended' | 'error'>('left');
  const [participants, setParticipants] = useState<NoobRoomParticipant[]>([]);
  const [remotes, setRemotes] = useState<Map<number, RemoteEntry>>(new Map());
  const [micOn, setMicOn] = useState(false);
  const callStartRef = useRef<number | null>(null);

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const micTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const cleanedUpRef = useRef(false);

  const myUid = agoraUidFor(currentUser.id);

  const refreshParticipants = useCallback(() => {
    fetchNoobRoomParticipants(room.id).then(setParticipants);
  }, [room.id]);

  const cleanup = useCallback(async () => {
    if (cleanedUpRef.current) return;
    cleanedUpRef.current = true;
    try {
      micTrackRef.current?.close();
      await clientRef.current?.leave();
    } catch { /* best-effort teardown */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const withTimeout = <T,>(p: Promise<T>, ms = 20000): Promise<T> =>
      Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('This is taking too long — check your connection and try again.')), ms))]);

    (async () => {
      const join = await joinNoobRoom(room.id);
      if (cancelled) return;
      if (!join.success || !join.token || !join.channelName || !join.appId) {
        setError(join.error || 'Could not join this room.');
        setEndReason('error');
        setPhase('ended');
        return;
      }
      setIsHost(!!join.isHost);
      try {
        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        clientRef.current = client;

        client.on('user-published', async (user, mediaType) => {
          if (mediaType !== 'audio') return;
          const track = await client.subscribe(user, mediaType);
          const uid = user.uid as number;
          (track as IRemoteAudioTrack).play();
          setRemotes((prev) => {
            const next = new Map(prev);
            next.set(uid, { uid, hasAudio: true, audioTrack: track as IRemoteAudioTrack });
            return next;
          });
        });
        client.on('user-unpublished', (user, mediaType) => {
          if (mediaType !== 'audio') return;
          const uid = user.uid as number;
          setRemotes((prev) => {
            if (!prev.has(uid)) return prev;
            const next = new Map(prev);
            next.set(uid, { uid, hasAudio: false });
            return next;
          });
        });
        client.on('user-left', (user) => {
          const uid = user.uid as number;
          setRemotes((prev) => {
            if (!prev.has(uid)) return prev;
            const next = new Map(prev);
            next.delete(uid);
            return next;
          });
        });

        await withTimeout(client.join(join.appId, join.channelName, join.token, myUid));
        if (cancelled) { await cleanup(); return; }

        // Mic starts OFF and unpublished — joining a room should never itself trigger a permission
        // prompt. Only acquired lazily the moment the mic button is tapped (handleToggleMic).
        setPhase('live');
        callStartRef.current = Date.now();
        refreshParticipants();
      } catch (err) {
        await cleanup();
        if (cancelled) return;
        setError(friendlyAgoraError(err, 'Could not join this room.'));
        setEndReason('error');
        setPhase('ended');
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount, off the room prop at open time
  }, []);

  useEffect(() => {
    if (phase !== 'live') return;
    const unsub = subscribeToNoobRoomParticipants(room.id, refreshParticipants);
    const interval = setInterval(refreshParticipants, 5000);
    return () => { unsub(); clearInterval(interval); };
  }, [phase, room.id, refreshParticipants]);

  useEffect(() => () => { void cleanup(); }, [cleanup]);

  const handleToggleMic = async () => {
    const client = clientRef.current;
    if (!client) return;
    if (!micTrackRef.current) {
      try {
        const track = await AgoraRTC.createMicrophoneAudioTrack();
        micTrackRef.current = track;
        await client.publish(track);
        setMicOn(true);
      } catch (err) {
        setError(friendlyAgoraError(err, 'Could not access your microphone.'));
      }
      return;
    }
    micTrackRef.current.setEnabled(!micOn);
    setMicOn((v) => !v);
  };

  const handleLeaveOrEnd = async (asHostEnd: boolean) => {
    if (asHostEnd) await endNoobRoom(room.id);
    else await leaveNoobRoom(room.id);
    await cleanup();
    setEndReason(asHostEnd ? 'ended' : 'left');
    setPhase('ended');
  };

  if (phase === 'connecting') {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-[#00FF66] animate-spin" />
        <p className="text-zinc-400 text-sm">Connecting…</p>
      </div>
    );
  }

  if (phase === 'ended') {
    const durationMs = callStartRef.current ? Date.now() - callStartRef.current : 0;
    const durationText = (() => {
      if (durationMs < 60000) return null;
      const totalMinutes = Math.round(durationMs / 60000);
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    })();
    const copy = {
      left: { title: 'Left the room', body: 'You left this room.', tone: 'good' as const },
      ended: { title: 'Room ended', body: 'You ended this room. Everyone has been disconnected.', tone: 'good' as const },
      error: { title: 'Could not join', body: error || 'Something went wrong connecting to this room.', tone: 'warn' as const }
    }[endReason];
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center border ${
          copy.tone === 'warn' ? 'bg-amber-500/15 border-amber-500/40' : 'bg-[#00FF66]/15 border-[#00FF66]/40'
        }`}>
          {copy.tone === 'warn' ? <AlertCircle className="w-8 h-8 text-amber-400" /> : <CheckCircle2 className="w-8 h-8 text-[#00FF66]" />}
        </div>
        <div>
          <h2 className="text-white text-lg font-bold">{copy.title}</h2>
          <p className="text-zinc-400 text-xs mt-1 max-w-xs">{copy.body}</p>
        </div>
        {durationText && (
          <div className="flex items-center gap-1.5 text-zinc-500 text-xs bg-white/5 rounded-full px-3 py-1.5">
            <Clock className="w-3.5 h-3.5" /> In the room for {durationText}
          </div>
        )}
        <button onClick={onClose} className="mt-2 bg-[#00FF66] text-black font-bold rounded-full px-8 py-2.5 text-sm cursor-pointer">Done</button>
      </div>
    );
  }

  // ---------------------------------------------------------------- live room

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-800/80">
        <div className="min-w-0">
          <p className="text-white text-sm font-bold truncate">{room.name}</p>
          <p className="text-[11px] text-zinc-500 flex items-center gap-1">
            <Users className="w-3 h-3" /> {participants.length} {participants.length === 1 ? 'person' : 'people'}
          </p>
        </div>
        <button
          onClick={() => void handleLeaveOrEnd(isHost)}
          className="flex items-center gap-1.5 bg-red-500/15 text-red-300 border border-red-500/30 rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer shrink-0"
        >
          {isHost ? 'End' : <LogOut className="w-3.5 h-3.5" />} {isHost ? '' : 'Leave'}
        </button>
      </div>

      {error && (
        <button onClick={() => setError('')} className="shrink-0 mx-3 mt-3 flex items-center justify-between gap-2 bg-red-500/15 border border-red-500/40 rounded-2xl px-4 py-2.5 text-left">
          <span className="text-red-300 text-xs font-semibold">{error}</span>
          <X className="w-3.5 h-3.5 text-red-300 shrink-0" />
        </button>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 max-w-xl mx-auto">
          {participants.map((p) => {
            const uid = agoraUidFor(p.userId);
            const isSelf = p.userId === currentUser.id;
            const speaking = isSelf ? micOn : !!remotes.get(uid)?.hasAudio;
            return (
              <div key={p.userId} className="flex flex-col items-center gap-1.5">
                <div className={`relative w-16 h-16 rounded-full ${speaking ? 'ring-2 ring-[#00FF66]' : ''}`}>
                  <AvatarMedia src={p.avatar} alt={p.username} className="w-full h-full rounded-full object-cover" />
                  {isSelf && !micOn && (
                    <span className="absolute -bottom-1 -right-1 bg-red-500 rounded-full p-1 border-2 border-zinc-950">
                      <MicOff className="w-2.5 h-2.5 text-white" />
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-zinc-300 font-semibold truncate max-w-[72px]">{isSelf ? 'You' : p.username}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 flex items-center justify-center px-3 py-4 border-t border-zinc-800/80">
        <button
          onClick={handleToggleMic}
          className={`p-4 rounded-full cursor-pointer ${micOn ? 'bg-zinc-800 text-white' : 'bg-red-500/20 text-red-400'}`}
        >
          {micOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
        </button>
      </div>
    </div>
  );
};
