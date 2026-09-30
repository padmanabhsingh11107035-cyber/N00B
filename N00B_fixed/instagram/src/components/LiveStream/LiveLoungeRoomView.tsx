import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X, Mic, MicOff, Video as VideoIcon, VideoOff, MonitorUp, PenTool, MessageCircle, Users,
  Send, Copy, Check, UserCheck, UserX, LogOut, Radio, Eraser
} from 'lucide-react';
import AgoraRTC, {
  IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack, ILocalVideoTrack,
  IAgoraRTCRemoteUser, IRemoteVideoTrack, IRemoteAudioTrack
} from 'agora-rtc-sdk-ng';
import { User } from '../../types';
import { AvatarMedia } from '../Common/AvatarMedia';
import {
  LiveLoungeParticipant,
  LiveLoungeRoomChatMessage,
  startLiveLoungeRoom,
  joinLiveLoungeRoomByCode,
  fetchLiveLoungeRoomMyStatus,
  fetchLiveLoungeRoomParticipants,
  admitLiveLoungeParticipant,
  joinLiveLoungeRoom,
  endLiveLoungeRoom,
  leaveLiveLoungeRoom,
  sendLiveLoungeRoomChat,
  fetchLiveLoungeRoomChat,
  subscribeToLiveLoungeRoomChat,
  subscribeToLiveLoungeRoomParticipants,
  connectLiveLoungeWhiteboard,
  connectLiveLoungeScreenShare,
  fetchPublicPlatformSettings,
  inviteToLiveLoungeRoom
} from '../../services/api';
import { isIosStandalonePwa } from '../../utils/platformDetect';
import { friendlyAgoraError } from '../../utils/agoraError';

interface LiveLoungeRoomViewProps {
  currentUser: User;
  mode: 'host' | 'join';
  onClose: () => void;
  allUsers?: User[];
  initialRoomId?: string;
}

type Phase = 'lobby' | 'waiting-room' | 'connecting' | 'live' | 'ended';

interface RemoteEntry {
  uid: number;
  hasVideo: boolean;
  hasAudio: boolean;
  videoTrack?: IRemoteVideoTrack;
  audioTrack?: IRemoteAudioTrack;
}

// A stable numeric Agora uid derived from the NOOB user id — the token is minted as a wildcard (uid 0),
// so any client-chosen numeric uid is accepted; deriving it this way means every client can work out
// "whose tile is this" just from the DB's own participant list, without any extra signaling.
function agoraUidFor(userId: string): number {
  const hex = userId.replace(/-/g, '').slice(0, 8);
  return parseInt(hex, 16) >>> 0;
}

const VideoTile: React.FC<{
  videoTrack?: IRemoteVideoTrack | ICameraVideoTrack | ILocalVideoTrack;
  name: string;
  avatar?: string;
  isSelf?: boolean;
  hasVideo: boolean;
  muted?: boolean;
  full?: boolean;
}> = ({ videoTrack, name, avatar, isSelf, hasVideo, muted, full }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (hasVideo && videoTrack && ref.current) {
      videoTrack.play(ref.current, { fit: full ? 'contain' : 'cover', mirror: false });
    }
    return () => { try { videoTrack?.stop(); } catch { /* already stopped */ } };
  }, [videoTrack, hasVideo, full]);

  return (
    <div className={full ? 'relative w-full h-full bg-black' : 'relative aspect-[3/4] rounded-xl overflow-hidden bg-neutral-900 border border-white/10'}>
      <div ref={ref} className="absolute inset-0 w-full h-full" />
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <AvatarMedia src={avatar} alt={name} className="w-14 h-14 rounded-full object-cover" />
        </div>
      )}
      <div className={`absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-2 py-0.5 ${full ? 'bottom-4 left-4' : ''}`}>
        {muted && <MicOff className="w-3 h-3 text-red-400" />}
        <span className="text-white text-[10px] font-semibold truncate max-w-[90px]">{isSelf ? 'You' : name}{full ? "'s screen" : ''}</span>
      </div>
    </div>
  );
};

export const LiveLoungeRoomView: React.FC<LiveLoungeRoomViewProps> = ({ currentUser, mode, onClose, allUsers, initialRoomId }) => {
  const [phase, setPhase] = useState<Phase>(initialRoomId ? 'waiting-room' : 'lobby');
  const [title, setTitle] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [roomId, setRoomId] = useState<string | undefined>(initialRoomId);
  const [roomCode, setRoomCode] = useState<string | undefined>();
  const [isHost, setIsHost] = useState(mode === 'host');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [loungeLock, setLoungeLock] = useState<{ locked: boolean; message: string }>({ locked: false, message: '' });
  const [invitePanelOpen, setInvitePanelOpen] = useState(false);
  const [inviteQuery, setInviteQuery] = useState('');
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchPublicPlatformSettings().then((s) =>
      setLoungeLock({ locked: !!s.liveLoungeMaintenance, message: s.liveLoungeMaintenanceMessage || 'NOOB Live Room is down. It will be back soon.' })
    );
  }, []);

  const [participants, setParticipants] = useState<{ admitted: LiveLoungeParticipant[]; waiting: LiveLoungeParticipant[] }>({ admitted: [], waiting: [] });
  const [remotes, setRemotes] = useState<Map<number, RemoteEntry>>(new Map());
  const [messages, setMessages] = useState<LiveLoungeRoomChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');

  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [screenShareError, setScreenShareError] = useState('');
  const [screenSharingUid, setScreenSharingUid] = useState<number | null>(null);
  const sharingScreenRef = useRef(false);
  const [panel, setPanel] = useState<'none' | 'chat' | 'people'>('none');
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const micTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const camTrackRef = useRef<ICameraVideoTrack | null>(null);
  const screenTrackRef = useRef<ILocalVideoTrack | null>(null);
  const cleanedUpRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const whiteboardChannelRef = useRef<{ send: (payload: any) => void; toggle: (open: boolean) => void; query: () => void; disconnect: () => void } | null>(null);
  const whiteboardOpenRef = useRef(false);
  const drawHandlerRef = useRef<((payload: any) => void) | null>(null);
  const screenShareChannelRef = useRef<{ send: (payload: { uid: number; sharing: boolean }) => void; query: () => void; disconnect: () => void } | null>(null);

  const myUid = agoraUidFor(currentUser.id);

  const refreshParticipants = useCallback((id: string) => {
    fetchLiveLoungeRoomParticipants(id).then((res) => {
      // Left in deliberately: the only way to tell "the fetch is quietly returning empty" apart from
      // "nobody's actually waiting" without a live two-account repro — check this if the waiting-room
      // banner still doesn't show up despite someone being in the room.
      console.log('[lounge] participants', { roomId: id, isHost, admitted: res.admitted.length, waiting: res.waiting.length });
      setParticipants(res);
    });
  }, [isHost]);

  const connectAgora = useCallback(async (id: string) => {
    const join = await joinLiveLoungeRoom(id);
    if (!join.success || !join.token || !join.channelName || !join.appId) {
      setError(join.error || 'Could not join this room.');
      setPhase('ended');
      return;
    }
    // Camera/mic permission prompts (and a bad Agora config) can otherwise hang this forever with no
    // feedback — racing every risky step against a timeout guarantees SOME outcome either way.
    const withTimeout = <T,>(p: Promise<T>, ms = 20000): Promise<T> =>
      Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('This is taking too long — check your camera/microphone permissions and try again.')), ms))]);
    try {
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      clientRef.current = client;

      client.on('user-published', async (user, mediaType) => {
        const track = await client.subscribe(user, mediaType);
        const uid = user.uid as number;
        setRemotes((prev) => {
          const next: Map<number, RemoteEntry> = new Map(prev);
          const entry: RemoteEntry = next.get(uid) || { uid, hasVideo: false, hasAudio: false };
          if (mediaType === 'video') { entry.hasVideo = true; entry.videoTrack = track as IRemoteVideoTrack; }
          if (mediaType === 'audio') { entry.hasAudio = true; entry.audioTrack = track as IRemoteAudioTrack; (track as IRemoteAudioTrack).play(); }
          next.set(uid, entry);
          return next;
        });
      });
      client.on('user-unpublished', (user, mediaType) => {
        const uid = user.uid as number;
        setRemotes((prev) => {
          const found = prev.get(uid);
          if (!found) return prev;
          const entry: RemoteEntry = { ...found };
          if (mediaType === 'video') { entry.hasVideo = false; entry.videoTrack = undefined; }
          if (mediaType === 'audio') { entry.hasAudio = false; entry.audioTrack = undefined; }
          const next: Map<number, RemoteEntry> = new Map(prev);
          next.set(uid, entry);
          return next;
        });
        // Safety net for "the sharer's screen-share ended without a clean stop broadcast" (a crash, a
        // dropped connection) — their video going away is the one signal that can't be missed either way.
        if (mediaType === 'video') setScreenSharingUid((prevUid) => (prevUid === uid ? null : prevUid));
      });
      client.on('user-left', (user: IAgoraRTCRemoteUser) => {
        const uid = user.uid as number;
        setRemotes((prev) => {
          const next: Map<number, RemoteEntry> = new Map(prev);
          next.delete(uid);
          return next;
        });
        setScreenSharingUid((prevUid) => (prevUid === uid ? null : prevUid));
      });

      await withTimeout(client.join(join.appId, join.channelName, join.token, myUid));

      // Acquired separately with allSettled (not Promise.all) so a device with no working microphone
      // still joins camera-only — Promise.all's rejection would have made the successfully-acquired
      // camera track unreachable to close, leaving the camera indicator lit for no reason.
      const [micResult, camResult] = await withTimeout(Promise.allSettled([
        AgoraRTC.createMicrophoneAudioTrack(),
        AgoraRTC.createCameraVideoTrack()
      ]));
      if (camResult.status === 'rejected') {
        if (micResult.status === 'fulfilled') micResult.value.close();
        throw camResult.reason;
      }
      camTrackRef.current = camResult.value;
      micTrackRef.current = micResult.status === 'fulfilled' ? micResult.value : null;
      await withTimeout(client.publish(micTrackRef.current ? [micTrackRef.current, camTrackRef.current] : [camTrackRef.current]));

      setPhase('live');
      refreshParticipants(id);
    } catch (err) {
      if (isHost) void endLiveLoungeRoom(id);
      try {
        micTrackRef.current?.close();
        camTrackRef.current?.close();
        await clientRef.current?.leave();
      } catch { /* best-effort teardown of a connection that never fully came up */ }
      setError(friendlyAgoraError(err, 'Could not start your camera/microphone.'));
      setPhase('ended');
    }
  }, [myUid, refreshParticipants, isHost]);

  const handleStartRoom = async () => {
    setError('');
    setBusy(true);
    const res = await startLiveLoungeRoom(title);
    setBusy(false);
    if (!res.success || !res.roomId) {
      setError(res.error || 'Could not start the room.');
      return;
    }
    setRoomId(res.roomId);
    setRoomCode(res.roomCode);
    setIsHost(true);
    setPhase('connecting');
    connectAgora(res.roomId);
  };

  const handleJoinByCode = async () => {
    if (!codeInput.trim()) return;
    setError('');
    setBusy(true);
    const res = await joinLiveLoungeRoomByCode(codeInput.trim());
    setBusy(false);
    if (!res.success || !res.roomId) {
      setError(res.error || 'Could not join that room.');
      return;
    }
    setRoomId(res.roomId);
    setTitle(res.title || '');
    setPhase('waiting-room');
  };

  // Waiting room: poll our own admission status.
  useEffect(() => {
    if (phase !== 'waiting-room' || !roomId) return;
    let alive = true;
    const tick = async () => {
      const status = await fetchLiveLoungeRoomMyStatus(roomId);
      if (!alive) return;
      if (status?.title) setTitle(status.title);
      if (status?.roomCode) setRoomCode(status.roomCode);
      if (status?.status === 'admitted') { setPhase('connecting'); connectAgora(roomId); }
      else if (status?.status === 'removed' || status?.roomStatus === 'ended') {
        setError(status?.roomStatus === 'ended' ? 'This room has ended.' : 'The host removed you from this room.');
        setPhase('ended');
      }
    };
    tick();
    const interval = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(interval); };
  }, [phase, roomId, connectAgora]);

  // Live: chat + participants realtime.
  useEffect(() => {
    if (phase !== 'live' || !roomId) return;
    let alive = true;
    fetchLiveLoungeRoomChat(roomId).then((res) => {
      console.log('[lounge] chat history', { roomId, success: res.success, count: res.messages?.length, error: res.error });
      if (alive && res.success) setMessages(res.messages);
    });
    const unsubChat = subscribeToLiveLoungeRoomChat(roomId, (m) => {
      console.log('[lounge] chat realtime message', m);
      setMessages((prev) => [...prev, m]);
    });
    const unsubParticipants = subscribeToLiveLoungeRoomParticipants(roomId, () => refreshParticipants(roomId));
    // A poll on top of realtime, not instead of it — someone reaching the waiting room is exactly the
    // moment a host needs to know about reliably, so this doesn't lean on realtime alone for it.
    const interval = setInterval(() => refreshParticipants(roomId), 4000);
    return () => { alive = false; unsubChat(); unsubParticipants(); clearInterval(interval); };
  }, [phase, roomId, refreshParticipants]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  // Whoever is sharing their screen fills the whole call for everyone — announced explicitly since
  // Agora gives a remote viewer no way to tell a screen track from a camera track on its own.
  useEffect(() => {
    if (phase !== 'live' || !roomId) return;
    const channel = connectLiveLoungeScreenShare(
      roomId,
      (payload) => {
        if (payload.sharing) setScreenSharingUid(payload.uid);
        else setScreenSharingUid((prev) => (prev === payload.uid ? null : prev));
      },
      () => { if (sharingScreenRef.current) channel.send({ uid: myUid, sharing: true }); }
    );
    screenShareChannelRef.current = channel;
    channel.query();
    return () => { channel.disconnect(); screenShareChannelRef.current = null; };
  }, [phase, roomId, myUid]);

  // Whiteboard visibility: connected for the whole call (not just while open) so anyone toggling it
  // on/off is reflected for every participant, and a late joiner learns it's already open.
  useEffect(() => {
    if (phase !== 'live' || !roomId) return;
    const channel = connectLiveLoungeWhiteboard(
      roomId,
      (payload) => drawHandlerRef.current?.(payload),
      (open) => setWhiteboardOpen(open),
      () => { if (whiteboardOpenRef.current) channel.toggle(true); }
    );
    whiteboardChannelRef.current = channel;
    channel.query();
    return () => { channel.disconnect(); whiteboardChannelRef.current = null; };
  }, [phase, roomId]);

  // Kept in sync regardless of whether the state change came from this device's own toggle or a
  // broadcast from someone else — read inside the query handler above, which fires on a network
  // event and can't rely on the latest render's closure.
  useEffect(() => { whiteboardOpenRef.current = whiteboardOpen; }, [whiteboardOpen]);

  const handleToggleWhiteboard = (open: boolean) => {
    setWhiteboardOpen(open);
    whiteboardChannelRef.current?.toggle(open);
  };

  // Whiteboard drawing (local canvas setup + broadcast receive) — separate from the effect above
  // because the <canvas> only exists in the DOM once whiteboardOpen is true.
  useEffect(() => {
    if (!whiteboardOpen) { drawHandlerRef.current = null; return; }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const resize = () => { canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight; };
    resize();
    window.addEventListener('resize', resize);

    const drawSegment = (x0: number, y0: number, x1: number, y1: number) => {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0 * canvas.width, y0 * canvas.height);
      ctx.lineTo(x1 * canvas.width, y1 * canvas.height);
      ctx.stroke();
    };

    drawHandlerRef.current = (payload) => {
      if (payload?.clear) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
      if (payload) drawSegment(payload.x0, payload.y0, payload.x1, payload.y1);
    };
    return () => { window.removeEventListener('resize', resize); drawHandlerRef.current = null; };
  }, [whiteboardOpen]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    lastPointRef.current = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !roomId) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !lastPointRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const point = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x * canvas.width, lastPointRef.current.y * canvas.height);
    ctx.lineTo(point.x * canvas.width, point.y * canvas.height);
    ctx.stroke();
    whiteboardChannelRef.current?.send({ x0: lastPointRef.current.x, y0: lastPointRef.current.y, x1: point.x, y1: point.y });
    lastPointRef.current = point;
  };
  const handlePointerUp = () => { drawingRef.current = false; lastPointRef.current = null; };
  const handleClearWhiteboard = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    whiteboardChannelRef.current?.send({ clear: true });
  };

  const cleanup = useCallback(async () => {
    if (cleanedUpRef.current) return;
    cleanedUpRef.current = true;
    try {
      micTrackRef.current?.close();
      camTrackRef.current?.close();
      screenTrackRef.current?.close();
      await clientRef.current?.leave();
    } catch { /* best-effort teardown */ }
  }, []);
  useEffect(() => () => { void cleanup(); }, [cleanup]);

  const handleEndOrLeave = async () => {
    if (roomId) {
      if (isHost) await endLiveLoungeRoom(roomId);
      else await leaveLiveLoungeRoom(roomId);
    }
    await cleanup();
    onClose();
  };

  // The waiting-room screen checks its own admission every few seconds, but once someone is actually
  // in the call nothing did — a host removing them, or ending the room for everyone, previously only
  // ever changed the database; the removed person's own screen just kept running the call forever.
  useEffect(() => {
    if (phase !== 'live' || !roomId || isHost) return;
    let alive = true;
    const tick = async () => {
      const status = await fetchLiveLoungeRoomMyStatus(roomId);
      if (!alive) return;
      if (status?.roomStatus === 'ended' || status?.status === 'removed') {
        await cleanup();
        setError(status?.roomStatus === 'ended' ? 'The host ended this room.' : 'The host removed you from this room.');
        setPhase('ended');
      }
    };
    const interval = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(interval); };
  }, [phase, roomId, isHost, cleanup]);

  const handleToggleMic = () => { micTrackRef.current?.setEnabled(!micOn); setMicOn((v) => !v); };
  const handleToggleCamera = () => { camTrackRef.current?.setEnabled(!cameraOn); setCameraOn((v) => !v); };

  const handleToggleScreenShare = async () => {
    const client = clientRef.current;
    if (!client) return;
    if (!sharingScreen) {
      setScreenShareError('');
      if (typeof navigator.mediaDevices?.getDisplayMedia !== 'function') {
        setScreenShareError(
          isIosStandalonePwa() || /iPhone|iPad|iPod/.test(navigator.userAgent)
            ? 'Screen sharing is not available on iPhone/iPad browsers — this is an Apple restriction, not something the app controls. Share from a laptop or desktop instead.'
            : 'This browser does not support screen sharing.'
        );
        return;
      }
      try {
        const screenTrack = await AgoraRTC.createScreenVideoTrack({}, 'disable');
        if (camTrackRef.current) await client.unpublish(camTrackRef.current);
        await client.publish(screenTrack);
        screenTrackRef.current = screenTrack;
        screenTrack.on('track-ended', () => { void handleToggleScreenShare(); });
        setSharingScreen(true);
        sharingScreenRef.current = true;
        setScreenSharingUid(myUid);
        screenShareChannelRef.current?.send({ uid: myUid, sharing: true });
      } catch (err) {
        // Agora wraps the browser's own error, so the DOM exception name (NotAllowedError/AbortError —
        // "cancelled the picker") shows up in .message or a nested .name, not always the top-level one.
        const e = err as { name?: string; code?: string; message?: string };
        const text = `${e?.name || ''} ${e?.code || ''} ${e?.message || ''}`;
        if (!/NotAllowedError|AbortError|PERMISSION_DENIED/i.test(text)) {
          setScreenShareError(friendlyAgoraError(err, 'Could not start screen sharing.'));
        }
      }
    } else {
      try {
        if (screenTrackRef.current) { await client.unpublish(screenTrackRef.current); screenTrackRef.current.close(); screenTrackRef.current = null; }
        if (camTrackRef.current) await client.publish(camTrackRef.current);
      } catch { /* best-effort revert */ }
      setSharingScreen(false);
      sharingScreenRef.current = false;
      setScreenSharingUid((prev) => (prev === myUid ? null : prev));
      screenShareChannelRef.current?.send({ uid: myUid, sharing: false });
    }
  };

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text || !roomId) return;
    setChatInput('');
    const res = await sendLiveLoungeRoomChat(roomId, text);
    console.log('[lounge] chat send', { roomId, success: res.success, error: res.error });
    if (!res.success) {
      setError(res.error || 'Could not send that message.');
      return;
    }
    // Shows the sender their own message right away instead of waiting on the realtime echo
    // (which other participants still rely on) — a dropped/delayed socket shouldn't make a
    // successfully-sent message look like it vanished.
    if (res.message) {
      setMessages((prev) => (prev.some((m) => m.id === res.message!.id) ? prev : [...prev, res.message!]));
    }
  };

  const copyRoomCode = () => {
    if (!roomCode) return;
    navigator.clipboard?.writeText(roomCode).then(() => { setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); }).catch(() => undefined);
  };

  const handleInvite = async (userId: string) => {
    if (!roomId) return;
    const res = await inviteToLiveLoungeRoom(roomId, userId);
    if (res.success) setInvitedIds((prev) => new Set(prev).add(userId));
    else setError(res.error || 'Could not send that invite.');
  };
  const inviteCandidates = (allUsers || [])
    .filter((u) => u.id !== currentUser.id && !u.isAi && !participants.admitted.some((p) => p.userId === u.id))
    .filter((u) => (inviteQuery.trim() ? u.username.toLowerCase().includes(inviteQuery.trim().toLowerCase()) : true))
    .slice(0, 30);

  // ---------------------------------------------------------------- lobby / waiting / connecting / ended

  if (phase === 'lobby' && isIosStandalonePwa()) {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center px-6 gap-4 text-center">
        <button onClick={onClose} className="absolute top-4 right-4 text-white/80"><X className="w-6 h-6" /></button>
        <VideoIcon className="w-10 h-10 text-white/40" />
        <h2 className="text-white text-base font-semibold">Open NOOB in Safari for Live Lounge</h2>
        <p className="text-white/60 text-sm max-w-sm">
          iPhone blocks camera/microphone access for apps opened from the home screen icon. Open Safari, go to
          <span className="text-white font-semibold"> {window.location.origin}</span>, and try again from there.
        </p>
      </div>
    );
  }

  if (phase === 'lobby' && loungeLock.locked && !currentUser.isAdmin) {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center px-6 gap-4 text-center">
        <button onClick={onClose} className="absolute top-4 right-4 text-white/80"><X className="w-6 h-6" /></button>
        <Radio className="w-10 h-10 text-white/40" />
        <h2 className="text-white text-base font-semibold">NOOB Live Room is locked</h2>
        <p className="text-white/60 text-sm max-w-sm">{loungeLock.message}</p>
      </div>
    );
  }

  if (phase === 'lobby') {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center px-6 gap-5">
        <button onClick={onClose} className="absolute top-4 right-4 text-white/80"><X className="w-6 h-6" /></button>
        {loungeLock.locked && currentUser.isAdmin && (
          <p className="text-amber-400 text-[11px] text-center max-w-sm">Locked for everyone else right now — you can still host/join as admin.</p>
        )}
        <Radio className="w-10 h-10 text-purple-400" />
        <h2 className="text-white text-lg font-semibold">{mode === 'host' ? 'Start a Live Lounge room' : 'Join a Live Lounge room'}</h2>
        {mode === 'host' ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="Room title (optional)"
            className="w-full max-w-sm bg-white/10 text-white placeholder-white/40 rounded-full px-4 py-3 text-sm outline-none"
          />
        ) : (
          <input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter' && codeInput.trim() && !busy) handleJoinByCode(); }}
            placeholder="Room code"
            autoFocus
            className="w-full max-w-sm bg-white/10 text-white placeholder-white/40 rounded-full px-4 py-3 text-sm text-center tracking-widest font-bold outline-none"
          />
        )}
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <button
          onClick={mode === 'host' ? handleStartRoom : handleJoinByCode}
          disabled={busy || (mode === 'join' && !codeInput.trim())}
          className="w-full max-w-sm bg-purple-500 text-white font-semibold rounded-full py-3 disabled:opacity-40 active:scale-95 transition"
        >
          {busy ? 'Please wait…' : mode === 'host' ? 'Start Room' : 'Join Room'}
        </button>
      </div>
    );
  }

  if (phase === 'waiting-room') {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <button onClick={handleEndOrLeave} className="absolute top-4 right-4 text-white/80"><X className="w-6 h-6" /></button>
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-purple-400 animate-spin" />
        <p className="text-white text-sm font-semibold">{title || 'Live Lounge room'}</p>
        <p className="text-white/60 text-xs">Waiting for the host to let you in…</p>
      </div>
    );
  }

  if (phase === 'connecting') {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-purple-400 animate-spin" />
        <p className="text-white/70 text-sm">Connecting…</p>
      </div>
    );
  }

  if (phase === 'ended') {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-white text-base">{error || 'This room has ended.'}</p>
        <button onClick={onClose} className="mt-2 bg-white/10 text-white rounded-full px-6 py-2 text-sm">Close</button>
      </div>
    );
  }

  // ---------------------------------------------------------------- live room

  const remoteList: RemoteEntry[] = Array.from(remotes.values());

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="min-w-0">
          <p className="text-white text-sm font-bold truncate">{title || 'Live Lounge'}</p>
          {roomCode && (
            <button onClick={copyRoomCode} className="flex items-center gap-1 text-[11px] text-purple-300">
              Code: <span className="font-mono font-bold">{roomCode}</span> {codeCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isHost && (
            <button onClick={() => setInvitePanelOpen(true)} className="flex items-center gap-1.5 bg-white/10 text-white rounded-full px-3 py-1.5 text-xs font-semibold">
              <Users className="w-3.5 h-3.5" /> Invite
            </button>
          )}
          <button onClick={handleEndOrLeave} className="flex items-center gap-1.5 bg-red-500/15 text-red-300 border border-red-500/30 rounded-full px-3 py-1.5 text-xs font-semibold">
            {isHost ? 'End' : <LogOut className="w-3.5 h-3.5" />} {isHost ? '' : 'Leave'}
          </button>
        </div>
      </div>

      {/* Hard to miss even if the host never opens People — a badge on a 6-icon toolbar is easy to overlook. */}
      {isHost && participants.waiting.length > 0 && (
        <button
          onClick={() => setPanel('people')}
          className="shrink-0 mx-3 mt-3 flex items-center justify-between gap-2 bg-amber-500/15 border border-amber-500/40 rounded-2xl px-4 py-2.5 animate-pulse"
        >
          <span className="text-amber-300 text-xs font-semibold">
            🔔 {participants.waiting.length} {participants.waiting.length === 1 ? 'person' : 'people'} waiting to join
          </span>
          <span className="text-amber-300 text-xs font-bold">Review →</span>
        </button>
      )}

      {screenShareError && (
        <button
          onClick={() => setScreenShareError('')}
          className="shrink-0 mx-3 mt-3 flex items-center justify-between gap-2 bg-red-500/15 border border-red-500/40 rounded-2xl px-4 py-2.5 text-left"
        >
          <span className="text-red-300 text-xs font-semibold">{screenShareError}</span>
          <X className="w-3.5 h-3.5 text-red-300 shrink-0" />
        </button>
      )}

      <div className={screenSharingUid !== null ? 'flex-1 overflow-hidden' : 'flex-1 overflow-y-auto p-3'}>
        {screenSharingUid !== null ? (
          screenSharingUid === myUid ? (
            <VideoTile videoTrack={screenTrackRef.current || undefined} name={currentUser.username} isSelf hasVideo full muted={!micOn} />
          ) : (
            (() => {
              const r = remotes.get(screenSharingUid);
              const p = participants.admitted.find((a) => agoraUidFor(a.userId) === screenSharingUid);
              return <VideoTile videoTrack={r?.videoTrack} name={p?.username || 'Guest'} hasVideo={!!r?.hasVideo} full muted={!r?.hasAudio} />;
            })()
          )
        ) : (
          <div className="grid grid-cols-2 gap-2 max-w-2xl mx-auto">
            <VideoTile videoTrack={(sharingScreen ? screenTrackRef.current : camTrackRef.current) || undefined} name={currentUser.username} avatar={currentUser.avatar} isSelf hasVideo={sharingScreen || cameraOn} muted={!micOn} />
            {remoteList.map((r) => {
              const p = participants.admitted.find((a) => agoraUidFor(a.userId) === r.uid);
              return (
                <VideoTile key={r.uid} videoTrack={r.videoTrack} name={p?.username || 'Guest'} avatar={p?.avatar} hasVideo={r.hasVideo} muted={!r.hasAudio} />
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom toolbar */}
      <div className="shrink-0 flex items-center justify-center gap-2 px-3 py-3 border-t border-white/10 bg-zinc-950/95">
        <button onClick={handleToggleMic} className={`p-3 rounded-full ${micOn ? 'bg-white/10 text-white' : 'bg-red-500/20 text-red-400'}`}>
          {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>
        <button onClick={handleToggleCamera} className={`p-3 rounded-full ${cameraOn ? 'bg-white/10 text-white' : 'bg-red-500/20 text-red-400'}`}>
          {cameraOn ? <VideoIcon className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>
        <button onClick={handleToggleScreenShare} className={`p-3 rounded-full ${sharingScreen ? 'bg-purple-500/30 text-purple-300' : 'bg-white/10 text-white'}`}>
          <MonitorUp className="w-5 h-5" />
        </button>
        <button onClick={() => handleToggleWhiteboard(!whiteboardOpen)} className={`p-3 rounded-full ${whiteboardOpen ? 'bg-purple-500/30 text-purple-300' : 'bg-white/10 text-white'}`}>
          <PenTool className="w-5 h-5" />
        </button>
        <button onClick={() => setPanel(panel === 'chat' ? 'none' : 'chat')} className={`p-3 rounded-full ${panel === 'chat' ? 'bg-purple-500/30 text-purple-300' : 'bg-white/10 text-white'}`}>
          <MessageCircle className="w-5 h-5" />
        </button>
        <button onClick={() => setPanel(panel === 'people' ? 'none' : 'people')} className={`relative p-3 rounded-full ${panel === 'people' ? 'bg-purple-500/30 text-purple-300' : 'bg-white/10 text-white'}`}>
          <Users className="w-5 h-5" />
          {isHost && participants.waiting.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{participants.waiting.length}</span>
          )}
        </button>
      </div>

      {/* Whiteboard overlay */}
      {whiteboardOpen && (
        <div className="absolute inset-0 z-10 bg-black flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <span className="text-white text-xs font-bold">Whiteboard</span>
            <div className="flex items-center gap-2">
              <button onClick={handleClearWhiteboard} className="flex items-center gap-1 text-[11px] text-white/70 px-2 py-1 rounded-lg bg-white/10">
                <Eraser className="w-3.5 h-3.5" /> Clear
              </button>
              <button onClick={() => handleToggleWhiteboard(false)} className="text-white/70 p-1"><X className="w-4 h-4" /></button>
            </div>
          </div>
          <canvas
            ref={canvasRef}
            className="flex-1 w-full touch-none cursor-crosshair"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        </div>
      )}

      {/* Chat panel */}
      {panel === 'chat' && (
        <div className="absolute inset-x-0 bottom-0 z-10 h-2/3 bg-zinc-950 border-t border-white/10 rounded-t-2xl flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
            <span className="text-white text-xs font-bold">Chat</span>
            <button onClick={() => setPanel('none')} className="text-white/70"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
            {messages.map((m) => (
              <div key={m.id} className="text-xs">
                <span className="font-semibold text-white/90">{m.sender.username}: </span>
                <span className="text-white/80">{m.text}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="flex items-center gap-2 p-2.5 border-t border-white/10">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSendChat(); }}
              maxLength={300}
              placeholder="Message"
              className="flex-1 bg-white/10 text-white placeholder-white/40 rounded-full px-4 py-2 text-xs outline-none"
            />
            <button onClick={handleSendChat} className="text-white p-2"><Send className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* People / waiting room panel */}
      {panel === 'people' && (
        <div className="absolute inset-x-0 bottom-0 z-10 h-2/3 bg-zinc-950 border-t border-white/10 rounded-t-2xl flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
            <span className="text-white text-xs font-bold">People</span>
            <button onClick={() => setPanel('none')} className="text-white/70"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
            {isHost && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-amber-400 font-bold uppercase">Waiting room ({participants.waiting.length})</p>
                {participants.waiting.length === 0 && <p className="text-[11px] text-white/40 py-1">No one waiting right now.</p>}
                {participants.waiting.map((p) => (
                  <div key={p.userId} className="flex items-center gap-2 p-2 rounded-xl bg-white/5">
                    <AvatarMedia src={p.avatar} alt={p.username} className="w-8 h-8 rounded-full object-cover" />
                    <span className="flex-1 text-xs text-white truncate">{p.username}</span>
                    <button onClick={() => admitLiveLoungeParticipant(roomId!, p.userId, true).then(() => refreshParticipants(roomId!))} className="p-1.5 bg-[#00FF66]/20 text-[#00FF66] rounded-lg"><UserCheck className="w-3.5 h-3.5" /></button>
                    <button onClick={() => admitLiveLoungeParticipant(roomId!, p.userId, false).then(() => refreshParticipants(roomId!))} className="p-1.5 bg-red-500/20 text-red-400 rounded-lg"><UserX className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1.5">
              <p className="text-[10px] text-white/50 font-bold uppercase">In the room ({participants.admitted.length})</p>
              {participants.admitted.map((p) => (
                <div key={p.userId} className="flex items-center gap-2 p-2 rounded-xl bg-white/5">
                  <AvatarMedia src={p.avatar} alt={p.username} className="w-8 h-8 rounded-full object-cover" />
                  <span className="flex-1 text-xs text-white truncate">{p.username}{p.role === 'host' ? ' (Host)' : ''}</span>
                  {isHost && p.userId !== currentUser.id && (
                    <button onClick={() => admitLiveLoungeParticipant(roomId!, p.userId, false).then(() => refreshParticipants(roomId!))} className="p-1.5 bg-red-500/20 text-red-400 rounded-lg text-[10px] font-bold px-2">Remove</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Invite panel (host only) */}
      {invitePanelOpen && (
        <div className="absolute inset-x-0 bottom-0 z-10 h-2/3 bg-zinc-950 border-t border-white/10 rounded-t-2xl flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
            <span className="text-white text-xs font-bold">Invite to this room</span>
            <button onClick={() => setInvitePanelOpen(false)} className="text-white/70"><X className="w-4 h-4" /></button>
          </div>
          <div className="px-3 pt-2">
            <input
              value={inviteQuery}
              onChange={(e) => setInviteQuery(e.target.value)}
              placeholder="Search by username"
              autoFocus
              className="w-full bg-white/10 text-white placeholder-white/40 rounded-full px-4 py-2 text-xs outline-none"
            />
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
            {inviteCandidates.length === 0 && <p className="text-[11px] text-white/40 py-2 text-center">No matching users.</p>}
            {inviteCandidates.map((u) => (
              <div key={u.id} className="flex items-center gap-2 p-2 rounded-xl bg-white/5">
                <AvatarMedia src={u.avatar} alt={u.username} className="w-8 h-8 rounded-full object-cover" />
                <span className="flex-1 text-xs text-white truncate">{u.username}</span>
                {invitedIds.has(u.id) ? (
                  <span className="text-[10px] text-[#00FF66] font-bold px-2">Invited</span>
                ) : (
                  <button onClick={() => handleInvite(u.id)} className="p-1.5 bg-purple-500/20 text-purple-300 rounded-lg text-[10px] font-bold px-2">Invite</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
