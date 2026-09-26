// Runs an actual NOOB group call: real, direct WebRTC connections between everyone currently in it
// (a small mesh — every device connects straight to every other device), signaled through the
// Realtime channel in callSignaling.ts. Nothing about the call — who joined, any audio, any video —
// is ever written to a database table; the moment everyone leaves, there is no record it happened.
//
// Camera starts OFF and is never even requested from the browser until the person turns it on
// (so the camera's hardware light only ever comes on when they actually choose that) — the
// microphone starts on (muteable) the way every call app's does, since joining a call at all implies
// wanting to be heard.
import { useCallback, useEffect, useRef, useState } from 'react';
import { joinCallChannel, getIceServers, MAX_CALL_PARTICIPANTS, type CallChannel, type CallPresence, type SignalMessage } from '../../services/callSignaling';
import { notifyCallStarted, logCallEvent } from '../../services/api';
import type { User } from '../../types';

export interface CallParticipant {
  userId: string;
  username: string;
  displayName?: string;
  avatar?: string;
  isLocal: boolean;
  hasVideo: boolean;
  hasAudio: boolean;
  stream: MediaStream | null;
}

interface PeerState {
  pc: RTCPeerConnection;
  pendingCandidates: RTCIceCandidateInit[];
  initiator: boolean;
}

export function useGroupCall(chatId: string, me: User) {
  const [presence, setPresence] = useState<Record<string, CallPresence>>({});
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  const chanRef = useRef<CallChannel | null>(null);
  const peersRef = useRef<Map<string, PeerState>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const aliveRef = useRef(true);
  const iceServersRef = useRef<RTCIceServer[]>([{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]);
  // Whoever is first to join an otherwise-empty call "owns" reporting it (same convention
  // notifyCallStarted already used) — set once at join, read once at leave, so exactly one
  // participant ever writes the "call ended" line into chat history instead of everyone doing it.
  const isCallOwnerRef = useRef(false);
  const joinedAtRef = useRef<number | null>(null);
  const everMultiPartyRef = useRef(false);

  const myPresence = useCallback(
    (video: boolean, audio: boolean): CallPresence => ({
      userId: me.id,
      username: me.username,
      displayName: me.displayName,
      avatar: me.avatar,
      hasVideo: video,
      hasAudio: audio
    }),
    [me.id, me.username, me.displayName, me.avatar]
  );

  const closePeer = useCallback((peerId: string) => {
    const p = peersRef.current.get(peerId);
    if (!p) return;
    try {
      p.pc.close();
    } catch {
      /* already closed */
    }
    peersRef.current.delete(peerId);
    setRemoteStreams((prev) => {
      if (!(peerId in prev)) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  const ensurePeer = useCallback(
    (peerId: string, initiator: boolean): PeerState => {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;
      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      const state: PeerState = { pc, pendingCandidates: [], initiator };
      peersRef.current.set(peerId, state);

      localStreamRef.current?.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current!));

      pc.onicecandidate = (e) => {
        if (e.candidate) void chanRef.current?.send({ from: me.id, to: peerId, kind: 'ice', data: e.candidate.toJSON() });
      };
      pc.ontrack = (e) => {
        setRemoteStreams((prev) => ({ ...prev, [peerId]: e.streams[0] || new MediaStream([e.track]) }));
      };
      // A connection that drops to failed/disconnected (very plausible without a hard failover path,
      // e.g. a brief network handoff) would otherwise just sit there silent/frozen for the rest of the
      // call — restartIce() triggers a fresh onnegotiationneeded below, which re-offers automatically.
      pc.oniceconnectionstatechange = () => {
        if ((pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') && pc.signalingState === 'stable') {
          try {
            pc.restartIce();
          } catch {
            /* not supported on this browser — the peer just stays down until someone rejoins */
          }
        }
      };
      pc.onnegotiationneeded = async () => {
        try {
          if (pc.signalingState !== 'stable') return;
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await chanRef.current?.send({ from: me.id, to: peerId, kind: 'offer', data: pc.localDescription });
        } catch {
          // a renegotiation glitch is not fatal — the connection keeps working with what it already has
        }
      };

      if (initiator) {
        pc.createOffer()
          .then(async (offer) => {
            await pc.setLocalDescription(offer);
            await chanRef.current?.send({ from: me.id, to: peerId, kind: 'offer', data: pc.localDescription });
          })
          .catch(() => setError('Could not start a connection with one of the other people in the call.'));
      }
      return state;
    },
    [me.id]
  );

  const handleSignal = useCallback(
    async (msg: SignalMessage) => {
      if (!aliveRef.current) return;
      const peerId = msg.from;
      if (msg.kind === 'offer') {
        const state = ensurePeer(peerId, false);
        try {
          await state.pc.setRemoteDescription(msg.data as RTCSessionDescriptionInit);
          for (const c of state.pendingCandidates.splice(0)) await state.pc.addIceCandidate(c).catch(() => undefined);
          const answer = await state.pc.createAnswer();
          await state.pc.setLocalDescription(answer);
          await chanRef.current?.send({ from: me.id, to: peerId, kind: 'answer', data: state.pc.localDescription });
        } catch {
          setError('Could not answer a call connection.');
        }
      } else if (msg.kind === 'answer') {
        const state = peersRef.current.get(peerId);
        if (!state) return;
        try {
          await state.pc.setRemoteDescription(msg.data as RTCSessionDescriptionInit);
          for (const c of state.pendingCandidates.splice(0)) await state.pc.addIceCandidate(c).catch(() => undefined);
        } catch {
          /* a late or duplicate answer is harmless to drop */
        }
      } else if (msg.kind === 'ice') {
        const state = peersRef.current.get(peerId);
        if (!state) return;
        const candidate = msg.data as RTCIceCandidateInit;
        if (state.pc.remoteDescription) await state.pc.addIceCandidate(candidate).catch(() => undefined);
        else state.pendingCandidates.push(candidate);
      } else if (msg.kind === 'bye') {
        closePeer(peerId);
      }
    },
    [ensurePeer, closePeer, me.id]
  );

  const handlePresence = useCallback(
    (state: Record<string, CallPresence>) => {
      if (!aliveRef.current) return;
      setPresence(state);
      if (Object.keys(state).length >= 2) everMultiPartyRef.current = true;
      for (const peerId of Object.keys(state)) {
        if (peerId === me.id || peersRef.current.has(peerId)) continue;
        ensurePeer(peerId, me.id < peerId);
      }
      for (const peerId of Array.from(peersRef.current.keys())) {
        if (!Object.prototype.hasOwnProperty.call(state, peerId)) closePeer(peerId);
      }
    },
    [ensurePeer, closePeer, me.id]
  );

  const join = useCallback(async () => {
    setError(null);
    if (Object.keys(presence).length >= MAX_CALL_PARTICIPANTS) {
      setError(`This call is full (${MAX_CALL_PARTICIPANTS} people is the most a group call can hold).`);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setMicOn(true);
      setCameraOn(false);
    } catch {
      setError('Could not use your microphone. Please allow microphone access and try again.');
      return;
    }
    iceServersRef.current = await getIceServers();
    const chan = joinCallChannel(chatId, me.id, (msg) => void handleSignal(msg), handlePresence);
    chanRef.current = chan;
    await chan.track(myPresence(false, true));
    setJoined(true);
    joinedAtRef.current = Date.now();
    // Tell the rest of the group once, only when this is the very first person in an otherwise empty
    // call — not on every later join, which would just be noise for an already-live call. That same
    // first joiner is also the one who'll write the "call ended" log line when they leave (see leave()).
    isCallOwnerRef.current = Object.keys(chan.presenceState()).length <= 1;
    if (isCallOwnerRef.current) void notifyCallStarted(chatId).catch(() => undefined);
  }, [chatId, me.id, presence, handleSignal, handlePresence, myPresence]);

  const leave = useCallback(() => {
    for (const peerId of Array.from(peersRef.current.keys())) closePeer(peerId);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    const chan = chanRef.current;
    chanRef.current = null;
    void chan?.leave();
    // Only the call's "owner" (see join()) logs it, and only once it actually connected with someone —
    // a call nobody else ever joined is a missed call, logged separately from the ring-timeout path.
    if (isCallOwnerRef.current && everMultiPartyRef.current && joinedAtRef.current) {
      const durationSeconds = Math.round((Date.now() - joinedAtRef.current) / 1000);
      void logCallEvent(chatId, 'ended', durationSeconds);
    }
    isCallOwnerRef.current = false;
    joinedAtRef.current = null;
    everMultiPartyRef.current = false;
    setJoined(false);
    setPresence({});
    setRemoteStreams({});
  }, [closePeer, chatId]);

  const toggleMic = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
    void chanRef.current?.track(myPresence(cameraOn, track.enabled));
  }, [cameraOn, myPresence]);

  const toggleCamera = useCallback(async () => {
    if (cameraOn) {
      const track = localStreamRef.current?.getVideoTracks()[0];
      if (track) {
        track.stop();
        localStreamRef.current?.removeTrack(track);
        for (const { pc } of peersRef.current.values()) {
          const sender = pc.getSenders().find((s) => s.track === track);
          if (sender) pc.removeTrack(sender);
        }
      }
      setCameraOn(false);
      setLocalStream(localStreamRef.current ? new MediaStream(localStreamRef.current.getTracks()) : null);
      void chanRef.current?.track(myPresence(false, micOn));
      return;
    }
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
      const track = camStream.getVideoTracks()[0];
      localStreamRef.current?.addTrack(track);
      for (const { pc } of peersRef.current.values()) pc.addTrack(track, localStreamRef.current!);
      setCameraOn(true);
      setLocalStream(localStreamRef.current ? new MediaStream(localStreamRef.current.getTracks()) : null);
      void chanRef.current?.track(myPresence(true, micOn));
    } catch {
      setError('Could not use your camera. Please allow camera access and try again.');
    }
  }, [cameraOn, micOn, myPresence, facingMode]);

  // Front/back camera switch — only meaningful once the camera is already on. Replaces the live
  // video track both locally and on every existing peer connection (RTCRtpSender.replaceTrack),
  // so nobody else in the call needs a renegotiation for this to take effect.
  const switchCamera = useCallback(async () => {
    if (!cameraOn) return;
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: nextFacing } } });
      const newTrack = camStream.getVideoTracks()[0];
      const oldTrack = localStreamRef.current?.getVideoTracks()[0];
      if (oldTrack) {
        oldTrack.stop();
        localStreamRef.current?.removeTrack(oldTrack);
      }
      localStreamRef.current?.addTrack(newTrack);
      for (const { pc } of peersRef.current.values()) {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(newTrack);
        else pc.addTrack(newTrack, localStreamRef.current!);
      }
      setLocalStream(localStreamRef.current ? new MediaStream(localStreamRef.current.getTracks()) : null);
      setFacingMode(nextFacing);
    } catch {
      setError('Could not switch cameras — this device may only have one.');
    }
  }, [cameraOn, facingMode]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      for (const peerId of Array.from(peersRef.current.keys())) closePeer(peerId);
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      void chanRef.current?.leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  const remotePeers: CallPresence[] = Object.keys(presence)
    .map((k) => presence[k])
    .filter((p) => p.userId !== me.id);
  const participants: CallParticipant[] = [
    { userId: me.id, username: me.username, displayName: me.displayName, avatar: me.avatar, isLocal: true, hasVideo: cameraOn, hasAudio: micOn, stream: localStream },
    ...remotePeers.map(
      (p): CallParticipant => ({
        userId: p.userId,
        username: p.username,
        displayName: p.displayName,
        avatar: p.avatar,
        isLocal: false,
        hasVideo: p.hasVideo,
        hasAudio: p.hasAudio,
        stream: remoteStreams[p.userId] || null
      })
    )
  ];

  return {
    joined,
    participants,
    micOn,
    cameraOn,
    facingMode,
    error,
    join,
    leave,
    toggleMic,
    toggleCamera,
    switchCamera,
    atCapacity: Object.keys(presence).length >= MAX_CALL_PARTICIPANTS
  };
}
