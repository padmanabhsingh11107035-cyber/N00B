// Runs an actual NOOB chat call: real, direct WebRTC connections between everyone currently in it
// (a small mesh — every device connects straight to every other device), signaled through the
// Realtime channel in callSignaling.ts. Nothing about the call — who joined, any audio — is ever
// written to a database table; the moment everyone leaves, there is no record it happened.
//
// The caller never connects (no mic request, no presence announced) while just ringing — see
// startAsCaller()/connectMedia() below — and any side that finds itself alone again (the call
// dropped below 2 real participants) hangs up automatically rather than sitting in a "call" that's
// really already over.
import { useCallback, useEffect, useRef, useState } from 'react';
import { joinCallChannel, getIceServers, MAX_CALL_PARTICIPANTS, type CallChannel, type CallPresence, type SignalMessage } from '../../services/callSignaling';
import { logCallEvent } from '../../services/api';
import type { User } from '../../types';

export interface CallParticipant {
  userId: string;
  username: string;
  displayName?: string;
  avatar?: string;
  isLocal: boolean;
  hasAudio: boolean;
  stream: MediaStream | null;
}

interface PeerState {
  pc: RTCPeerConnection;
  pendingCandidates: RTCIceCandidateInit[];
  initiator: boolean;
}

export function useChatCall(chatId: string, me: User) {
  const [presence, setPresence] = useState<Record<string, CallPresence>>({});
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [micOn, setMicOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  // True from startAsCaller() until either a peer shows up (connectMedia runs automatically) or the
  // caller gives up — the call screen shows "Ringing…" the whole time, with no media active at all.
  const [ringing, setRinging] = useState(false);

  const chanRef = useRef<CallChannel | null>(null);
  const peersRef = useRef<Map<string, PeerState>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const aliveRef = useRef(true);
  const iceServersRef = useRef<RTCIceServer[]>([{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]);
  const trackedRef = useRef(false);
  const waitForPeerRef = useRef(false);
  const connectingRef = useRef(false);
  const endedBelowTwoRef = useRef(false);
  // Whoever is first to actually connect to an otherwise-empty call "owns" logging it — set once at
  // connect, read once at leave, so exactly one participant ever writes the "call ended" line.
  const isCallOwnerRef = useRef(false);
  const joinedAtRef = useRef<number | null>(null);
  const everMultiPartyRef = useRef(false);
  const leaveRef = useRef<() => void>(() => undefined);

  const myPresence = useCallback(
    (audio: boolean): CallPresence => ({
      userId: me.id,
      username: me.username,
      displayName: me.displayName,
      avatar: me.avatar,
      hasVideo: false,
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

  // The actual connect: requests the mic (only moment this ever happens) and announces our own
  // presence on the channel — called immediately when answering a ring, or automatically once a
  // caller who was only peeking sees someone else show up.
  const connectMedia = useCallback(async () => {
    if (trackedRef.current || connectingRef.current) return;
    connectingRef.current = true;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setMicOn(true);
      iceServersRef.current = await getIceServers();
      const chan = chanRef.current;
      if (!chan) return;
      isCallOwnerRef.current = Object.keys(chan.presenceState()).length === 0;
      await chan.track(myPresence(true));
      trackedRef.current = true;
      setRinging(false);
      setJoined(true);
      joinedAtRef.current = Date.now();
    } catch (err) {
      // Surface the browser's real reason (NotAllowedError = permission denied, NotFoundError = no
      // mic device, NotReadableError = mic already in use by something else, etc.) instead of one
      // generic message for every case — this is the one piece of information that actually tells us
      // what to fix next.
      const name = (err as { name?: string } | undefined)?.name;
      const reason =
        name === 'NotAllowedError'
          ? 'Microphone access was denied. Please allow it for this app (check your OS mic privacy settings too) and try again.'
          : name === 'NotFoundError'
          ? 'No microphone was found on this device.'
          : name === 'NotReadableError'
          ? 'Your microphone is already being used by another app.'
          : name
          ? `Could not use your microphone (${name}).`
          : 'Could not use your microphone. Please allow microphone access and try again.';
      setError(reason);
    } finally {
      connectingRef.current = false;
    }
  }, [myPresence]);

  const handlePresence = useCallback(
    (state: Record<string, CallPresence>) => {
      if (!aliveRef.current) return;
      setPresence(state);
      const otherCount = Object.keys(state).filter((k) => k !== me.id).length;
      if (otherCount >= 1 && trackedRef.current) everMultiPartyRef.current = true;

      // Caller still just peeking: the moment anyone else is actually present, connect for real.
      if (waitForPeerRef.current && !trackedRef.current && otherCount >= 1) {
        void connectMedia();
      }

      // Never manage peer connections until we ourselves have actually connected.
      if (!trackedRef.current) return;

      for (const peerId of Object.keys(state)) {
        if (peerId === me.id || peersRef.current.has(peerId)) continue;
        ensurePeer(peerId, me.id < peerId);
      }
      for (const peerId of Array.from(peersRef.current.keys())) {
        if (!Object.prototype.hasOwnProperty.call(state, peerId)) closePeer(peerId);
      }

      // A call only makes sense with 2+ real participants — if it drops below that (the other side
      // hung up, or everyone else already left) and it ever genuinely had someone else in it, this
      // side hangs up too instead of sitting alone in a "live" call.
      if (everMultiPartyRef.current && Object.keys(state).length < 2 && !endedBelowTwoRef.current) {
        endedBelowTwoRef.current = true;
        leaveRef.current();
      }
    },
    [ensurePeer, closePeer, connectMedia, me.id]
  );

  const openChannel = useCallback(
    (waitForPeer: boolean) => {
      if (chanRef.current) return;
      waitForPeerRef.current = waitForPeer;
      setRinging(waitForPeer);
      const chan = joinCallChannel(chatId, me.id, (msg) => void handleSignal(msg), handlePresence);
      chanRef.current = chan;
    },
    [chatId, me.id, handleSignal, handlePresence]
  );

  // Fresh outgoing call: open the channel in listen-only mode (no mic, no presence announced) and
  // wait — connectMedia() only runs once handlePresence actually sees someone else join.
  const startAsCaller = useCallback(() => {
    openChannel(true);
  }, [openChannel]);

  // Answering a ring, or joining an already-live call: connect right away.
  const answer = useCallback(async () => {
    openChannel(false);
    await connectMedia();
  }, [openChannel, connectMedia]);

  const leave = useCallback(() => {
    for (const peerId of Array.from(peersRef.current.keys())) closePeer(peerId);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    const chan = chanRef.current;
    chanRef.current = null;
    void chan?.leave();
    if (isCallOwnerRef.current && everMultiPartyRef.current && joinedAtRef.current) {
      const durationSeconds = Math.round((Date.now() - joinedAtRef.current) / 1000);
      void logCallEvent(chatId, 'ended', durationSeconds);
    }
    isCallOwnerRef.current = false;
    joinedAtRef.current = null;
    everMultiPartyRef.current = false;
    endedBelowTwoRef.current = false;
    trackedRef.current = false;
    waitForPeerRef.current = false;
    setJoined(false);
    setRinging(false);
    setPresence({});
    setRemoteStreams({});
  }, [closePeer, chatId]);
  leaveRef.current = leave;

  const toggleMic = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
    void chanRef.current?.track(myPresence(track.enabled));
  }, [myPresence]);

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
  const participants: CallParticipant[] = trackedRef.current
    ? [
        { userId: me.id, username: me.username, displayName: me.displayName, avatar: me.avatar, isLocal: true, hasAudio: micOn, stream: null },
        ...remotePeers.map(
          (p): CallParticipant => ({
            userId: p.userId,
            username: p.username,
            displayName: p.displayName,
            avatar: p.avatar,
            isLocal: false,
            hasAudio: p.hasAudio,
            stream: remoteStreams[p.userId] || null
          })
        )
      ]
    : [];

  return {
    joined,
    ringing,
    participants,
    micOn,
    error,
    startAsCaller,
    answer,
    leave,
    toggleMic,
    atCapacity: Object.keys(presence).length >= MAX_CALL_PARTICIPANTS
  };
}
