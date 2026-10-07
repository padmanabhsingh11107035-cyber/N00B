// Runs an actual NOOB chat call: real, direct WebRTC connections between everyone currently in it
// (a small mesh — every device connects straight to every other device), signaled through the
// Realtime channel in callSignaling.ts. Nothing about the call — who joined, any audio — is ever
// written to a database table; the moment everyone leaves, there is no record it happened.
//
// The caller never connects (no presence announced) while just ringing — see startAsCaller()/
// trackPresence() below — and any side that finds itself alone again (the call dropped below 2 real
// participants) hangs up automatically rather than sitting in a "call" that's really already over.
//
// Joining the call and turning your mic on are deliberately two separate steps, same as NOOB Rooms/
// Live Lounge: trackPresence() announces you're in the call with no mic request at all, so joining
// never depends on microphone access succeeding. The mic is only ever requested from toggleMic() —
// which should only ever be wired to a direct button tap — the first time someone actually taps to
// unmute. A failed mic grant then just means "still muted," not "never actually joined the call."
import { useCallback, useEffect, useRef, useState } from 'react';
import { joinCallChannel, getIceServers, MAX_CALL_PARTICIPANTS, type CallChannel, type CallPresence, type SignalMessage } from '../../services/callSignaling';
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

// Turns a getUserMedia() failure into the actual reason instead of one generic message for every
// case — NotAllowedError (permission denied) vs NotFoundError (no mic) vs NotReadableError (mic
// already in use elsewhere) are each a different real problem to fix.
function micErrorMessage(err: unknown): string {
  const name = (err as { name?: string } | undefined)?.name;
  if (name === 'NotAllowedError') return 'Microphone access was denied. Please allow it for this app (check your OS mic privacy settings too) and try again.';
  if (name === 'NotFoundError') return 'No microphone was found on this device.';
  if (name === 'NotReadableError') return 'Your microphone is already being used by another app.';
  if (name) return `Could not use your microphone (${name}).`;
  return 'Could not use your microphone. Please allow microphone access and try again.';
}

export function useChatCall(chatId: string, me: User) {
  const [presence, setPresence] = useState<Record<string, CallPresence>>({});
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  // Mic starts OFF and unpublished — joining a call should never itself trigger a permission
  // prompt, only an explicit tap on the mic button does (see toggleMic below).
  const [micOn, setMicOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  // True from startAsCaller() until either a peer shows up (trackPresence runs automatically) or the
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

  // Joins the call's roster — no microphone request at all, just announces presence so the 2-person
  // rule and peer connections can engage. Called immediately when answering a ring or joining an
  // already-live call, or automatically once a caller who was only peeking sees someone else show up.
  const trackPresence = useCallback(async () => {
    if (trackedRef.current || connectingRef.current) return;
    connectingRef.current = true;
    setError(null);
    try {
      iceServersRef.current = await getIceServers();
      const chan = chanRef.current;
      if (!chan) return;
      await chan.track(myPresence(false));
      trackedRef.current = true;
      setRinging(false);
      setJoined(true);
    } catch {
      setError('Could not join the call. Please try again.');
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

      // Caller still just peeking: the moment anyone else is actually present, join for real.
      if (waitForPeerRef.current && !trackedRef.current && otherCount >= 1) {
        void trackPresence();
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
    [ensurePeer, closePeer, trackPresence, me.id]
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
  // wait — trackPresence() only runs once handlePresence actually sees someone else join.
  const startAsCaller = useCallback(() => {
    openChannel(true);
  }, [openChannel]);

  // Answering a ring, or joining an already-live call: join the roster right away — still no mic
  // request, that only ever happens from an explicit tap on the mic button (toggleMic below).
  const answer = useCallback(async () => {
    openChannel(false);
    await trackPresence();
  }, [openChannel, trackPresence]);

  const leave = useCallback(() => {
    for (const peerId of Array.from(peersRef.current.keys())) closePeer(peerId);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    const chan = chanRef.current;
    chanRef.current = null;
    void chan?.leave();
    everMultiPartyRef.current = false;
    endedBelowTwoRef.current = false;
    trackedRef.current = false;
    waitForPeerRef.current = false;
    setJoined(false);
    setRinging(false);
    setPresence({});
    setRemoteStreams({});
  }, [closePeer]);
  leaveRef.current = leave;

  // First tap ever: actually requests the microphone (the only place this hook ever does) and, once
  // granted, adds the live track to every peer connection already open — each one's onnegotiationneeded
  // handler (see ensurePeer above) automatically renegotiates so audio starts flowing with no extra
  // wiring needed here. Every tap after that is just a cheap local mute/unmute, no new prompt.
  const toggleMic = useCallback(async () => {
    const existing = localStreamRef.current?.getAudioTracks()[0];
    if (existing) {
      existing.enabled = !existing.enabled;
      setMicOn(existing.enabled);
      void chanRef.current?.track(myPresence(existing.enabled));
      return;
    }
    if (connectingRef.current) return;
    connectingRef.current = true;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      for (const { pc } of peersRef.current.values()) pc.addTrack(track, stream);
      setMicOn(true);
      void chanRef.current?.track(myPresence(true));
    } catch (err) {
      setError(micErrorMessage(err));
    } finally {
      connectingRef.current = false;
    }
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
