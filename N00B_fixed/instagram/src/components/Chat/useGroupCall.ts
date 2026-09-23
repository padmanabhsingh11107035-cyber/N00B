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
import { joinCallChannel, ICE_SERVERS, MAX_CALL_PARTICIPANTS, type CallChannel, type CallPresence, type SignalMessage } from '../../services/callSignaling';
import { notifyCallStarted } from '../../services/api';
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
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const state: PeerState = { pc, pendingCandidates: [], initiator };
      peersRef.current.set(peerId, state);

      localStreamRef.current?.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current!));

      pc.onicecandidate = (e) => {
        if (e.candidate) void chanRef.current?.send({ from: me.id, to: peerId, kind: 'ice', data: e.candidate.toJSON() });
      };
      pc.ontrack = (e) => {
        setRemoteStreams((prev) => ({ ...prev, [peerId]: e.streams[0] || new MediaStream([e.track]) }));
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
    const chan = joinCallChannel(chatId, me.id, (msg) => void handleSignal(msg), handlePresence);
    chanRef.current = chan;
    await chan.track(myPresence(false, true));
    setJoined(true);
    // Tell the rest of the group once, only when this is the very first person in an otherwise empty
    // call — not on every later join, which would just be noise for an already-live call.
    if (Object.keys(chan.presenceState()).length <= 1) void notifyCallStarted(chatId).catch(() => undefined);
  }, [chatId, me.id, presence, handleSignal, handlePresence, myPresence]);

  const leave = useCallback(() => {
    for (const peerId of Array.from(peersRef.current.keys())) closePeer(peerId);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    const chan = chanRef.current;
    chanRef.current = null;
    void chan?.leave();
    setJoined(false);
    setPresence({});
    setRemoteStreams({});
  }, [closePeer]);

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
