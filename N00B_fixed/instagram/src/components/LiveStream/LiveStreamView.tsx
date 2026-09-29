import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Heart, Gift, Send, Users, Mic, MicOff, Radio, Camera, MonitorUp } from 'lucide-react';
import AgoraRTC, { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack, ILocalVideoTrack } from 'agora-rtc-sdk-ng';
import { User } from '../../types';
import { AvatarMedia } from '../Common/AvatarMedia';
import { LikeReactionBurst } from '../Common/LikeReactionBurst';
import { formatNoobPoints } from '../../utils/formatPoints';
import {
  LiveStreamSummary,
  LiveStreamComment,
  startLiveStream,
  endLiveStream,
  leaveLiveStream,
  joinLiveStream,
  sendLiveStreamComment,
  fetchLiveStreamComments,
  likeLiveStream,
  giftLiveStream,
  subscribeToLiveStreamComments,
  subscribeToLiveStreamHearts,
  broadcastLiveStreamHeart,
  fetchLiveStreams
} from '../../services/api';

interface LiveStreamViewProps {
  currentUser: User;
  mode: 'host' | 'view';
  stream?: LiveStreamSummary;
  onClose: () => void;
}

const GIFT_AMOUNTS = [50, 100, 500, 1000];
type Phase = 'setup' | 'connecting' | 'live' | 'ended';

// Full-screen live video — used both by the host (broadcasting their camera) and by a viewer (watching
// someone else's). Agora carries the actual video; everything else (privacy, viewer counting, chat,
// gifts) is the database, reached the same way whether this is a host or a viewer session.
export const LiveStreamView: React.FC<LiveStreamViewProps> = ({ currentUser, mode, stream, onClose }) => {
  const [phase, setPhase] = useState<Phase>(mode === 'host' ? 'setup' : 'connecting');
  const [title, setTitle] = useState('');
  const [videoSource, setVideoSource] = useState<'camera' | 'screen'>('camera');
  const [streamId, setStreamId] = useState<string | undefined>(stream?.id);
  const [hostInfo] = useState(
    stream?.host ?? { id: currentUser.id, username: currentUser.username, displayName: currentUser.displayName, avatar: currentUser.avatar }
  );
  const [comments, setComments] = useState<LiveStreamComment[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [viewerCount, setViewerCount] = useState(stream?.viewerCount ?? 0);
  const [heartKey, setHeartKey] = useState(0);
  const [giftSheetOpen, setGiftSheetOpen] = useState(false);
  const [error, setError] = useState('');
  const [micOn, setMicOn] = useState(true);

  const videoRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localTracksRef = useRef<[IMicrophoneAudioTrack, ICameraVideoTrack | ILocalVideoTrack] | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const cleanedUpRef = useRef(false);

  const connect = useCallback(async (id: string, isHostRole: boolean) => {
    const join = await joinLiveStream(id);
    if (!join.success || !join.token || !join.channelName || !join.appId) {
      setError(join.error || 'Could not join this stream.');
      setPhase('ended');
      return;
    }
    try {
      const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
      clientRef.current = client;
      await client.setClientRole(isHostRole ? 'host' : 'audience');

      if (!isHostRole) {
        client.on('user-published', async (user, mediaType) => {
          await client.subscribe(user, mediaType);
          if (mediaType === 'video' && videoRef.current) user.videoTrack?.play(videoRef.current, { fit: 'cover' });
          if (mediaType === 'audio') user.audioTrack?.play();
        });
        client.on('user-left', () => {
          setError('The host ended this stream.');
          setPhase('ended');
        });
      }

      await client.join(join.appId, join.channelName, join.token, null);

      if (isHostRole) {
        let audioTrack: IMicrophoneAudioTrack;
        let videoTrack: ICameraVideoTrack | ILocalVideoTrack;
        if (videoSource === 'screen') {
          [audioTrack, videoTrack] = await Promise.all([
            AgoraRTC.createMicrophoneAudioTrack(),
            AgoraRTC.createScreenVideoTrack({}, 'disable')
          ]);
          // The browser's own "Stop sharing" control ends the track directly — treat that exactly
          // like tapping the in-app end button, instead of leaving a dead, silent stream running.
          videoTrack.on('track-ended', () => { void handleCloseTap(); });
        } else {
          [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
        }
        localTracksRef.current = [audioTrack, videoTrack];
        await client.publish([audioTrack, videoTrack]);
        if (videoRef.current) videoTrack.play(videoRef.current, { fit: videoSource === 'screen' ? 'contain' : 'cover' });
      }
      setPhase('live');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the camera/microphone.');
      setPhase('ended');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoSource]);

  const handleGoLive = async () => {
    setError('');
    setPhase('connecting');
    const res = await startLiveStream(title);
    if (!res.success || !res.id) {
      setError(res.error || 'Could not go live.');
      setPhase('setup');
      return;
    }
    setStreamId(res.id);
    await connect(res.id, true);
  };

  useEffect(() => {
    if (mode === 'view' && stream) void connect(stream.id, false);
    // Runs once, on mount — a viewer session always joins exactly the stream it was opened for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!streamId || phase !== 'live') return;
    let alive = true;
    fetchLiveStreamComments(streamId).then((res) => { if (alive && res.success) setComments(res.comments); });
    const unsubComments = subscribeToLiveStreamComments(streamId, (c) => setComments((prev) => [...prev, c]));
    const unsubHearts = subscribeToLiveStreamHearts(streamId, () => setHeartKey((k) => k + 1));
    return () => { alive = false; unsubComments(); unsubHearts(); };
  }, [streamId, phase]);

  useEffect(() => {
    if (!streamId || phase !== 'live') return;
    const tick = () => fetchLiveStreams().then((res) => {
      const mine = res.streams.find((s) => s.id === streamId);
      if (mine) setViewerCount(mine.viewerCount);
    });
    const interval = setInterval(tick, 10000);
    return () => clearInterval(interval);
  }, [streamId, phase]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  const cleanup = useCallback(async () => {
    if (cleanedUpRef.current) return;
    cleanedUpRef.current = true;
    try {
      if (localTracksRef.current) {
        localTracksRef.current[0].close();
        localTracksRef.current[1].close();
      }
      await clientRef.current?.leave();
    } catch {
      // best-effort teardown — the view is closing either way
    }
  }, []);

  useEffect(() => () => { void cleanup(); }, [cleanup]);

  const handleCloseTap = async () => {
    if (mode === 'host' && streamId) {
      await endLiveStream(streamId);
    } else if (streamId) {
      await leaveLiveStream(streamId);
    }
    await cleanup();
    onClose();
  };

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text || !streamId) return;
    setChatInput('');
    const res = await sendLiveStreamComment(streamId, text);
    if (!res.success) setError(res.error || 'Could not send that message.');
  };

  const handleLike = () => {
    if (!streamId) return;
    setHeartKey((k) => k + 1);
    void likeLiveStream(streamId);
    broadcastLiveStreamHeart(streamId);
  };

  const handleGift = async (amount: number) => {
    if (!streamId) return;
    setGiftSheetOpen(false);
    const res = await giftLiveStream(streamId, amount);
    if (!res.success) setError(res.error || 'Could not send that gift.');
  };

  if (phase === 'setup') {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center px-6 gap-5">
        <button onClick={onClose} className="absolute top-4 right-4 text-white/80"><X className="w-6 h-6" /></button>
        <Radio className="w-10 h-10 text-red-500" />
        <h2 className="text-white text-lg font-semibold">Go Live</h2>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder="Add a title (optional)"
          className="w-full max-w-sm bg-white/10 text-white placeholder-white/40 rounded-full px-4 py-3 text-sm outline-none"
        />
        <div className="w-full max-w-sm grid grid-cols-2 gap-2">
          <button
            onClick={() => setVideoSource('camera')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition ${
              videoSource === 'camera' ? 'bg-white text-black' : 'bg-white/10 text-white/70'
            }`}
          >
            <Camera className="w-4 h-4" /> Camera
          </button>
          <button
            onClick={() => setVideoSource('screen')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition ${
              videoSource === 'screen' ? 'bg-white text-black' : 'bg-white/10 text-white/70'
            }`}
          >
            <MonitorUp className="w-4 h-4" /> Screen
          </button>
        </div>
        {videoSource === 'screen' && (
          <p className="text-white/50 text-[11px] max-w-sm text-center">Your browser will ask which screen, window, or tab to share — your mic stays on so you can talk over it.</p>
        )}
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <button onClick={handleGoLive} className="w-full max-w-sm bg-red-600 text-white font-semibold rounded-full py-3 active:scale-95 transition">
          Start Streaming
        </button>
      </div>
    );
  }

  if (phase === 'connecting') {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        <p className="text-white/70 text-sm">Connecting…</p>
      </div>
    );
  }

  if (phase === 'ended') {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-white text-base">{error || 'This stream has ended.'}</p>
        <button onClick={onClose} className="mt-2 bg-white/10 text-white rounded-full px-6 py-2 text-sm">Close</button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
      <div className="relative w-full h-full max-h-[860px] max-w-[440px] mx-auto bg-black overflow-hidden">
        <div ref={videoRef} className="absolute inset-0 w-full h-full bg-neutral-950" />

        <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between">
          <div className="flex items-center gap-2 bg-black/40 backdrop-blur-sm rounded-full pl-1 pr-3 py-1">
            <AvatarMedia src={hostInfo.avatar} alt={hostInfo.username} className="w-7 h-7 rounded-full object-cover" />
            <span className="text-white text-xs font-semibold">{hostInfo.username}</span>
            <span className="bg-red-600 text-white text-[9px] font-bold px-1.5 rounded-full">LIVE</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-black/40 backdrop-blur-sm rounded-full px-2.5 py-1 text-white text-xs">
              <Users className="w-3.5 h-3.5" /> {viewerCount}
            </div>
            {mode === 'host' && (
              <button
                onClick={() => { localTracksRef.current?.[0]?.setEnabled(!micOn); setMicOn((v) => !v); }}
                className="bg-black/40 backdrop-blur-sm rounded-full p-1.5 text-white"
              >
                {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>
            )}
            <button onClick={handleCloseTap} className="bg-black/40 backdrop-blur-sm rounded-full p-1.5 text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 via-black/30 to-transparent pt-10">
          <div className="max-h-[38vh] overflow-y-auto px-3 pb-2 flex flex-col gap-1.5 no-scrollbar">
            {comments.map((c) => (
              <div key={c.id} className={`text-xs flex items-start gap-1.5 ${c.giftAmount ? 'bg-amber-500/20 rounded-lg px-2 py-1 w-fit' : ''}`}>
                <span className="font-semibold text-white/90">{c.sender.username}</span>
                <span className={c.giftAmount ? 'text-amber-300' : 'text-white/80'}>{c.text}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="relative flex items-center gap-2 px-3 pb-4 pt-1">
            <div className="relative flex-1">
              <LikeReactionBurst emoji="❤️" burstKey={heartKey} />
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleSendChat(); }}
                maxLength={300}
                placeholder="Say something…"
                className="w-full bg-white/10 text-white placeholder-white/40 rounded-full px-4 py-2 text-sm outline-none"
              />
            </div>
            {mode === 'view' && (
              <>
                <button onClick={handleLike} className="text-white p-2 active:scale-90 transition"><Heart className="w-6 h-6" /></button>
                <button onClick={() => setGiftSheetOpen(true)} className="text-white p-2 active:scale-90 transition"><Gift className="w-6 h-6" /></button>
              </>
            )}
            <button onClick={handleSendChat} className="text-white p-2"><Send className="w-5 h-5" /></button>
          </div>
        </div>

        {giftSheetOpen && (
          <div className="absolute inset-0 z-20 bg-black/60 flex items-end" onClick={() => setGiftSheetOpen(false)}>
            <div className="w-full bg-neutral-900 rounded-t-2xl p-5" onClick={(e) => e.stopPropagation()}>
              <p className="text-white text-sm font-semibold mb-3">Send a gift</p>
              <div className="grid grid-cols-4 gap-2">
                {GIFT_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => void handleGift(amt)}
                    className="flex flex-col items-center gap-1 bg-white/5 rounded-xl py-3 active:scale-95 transition"
                  >
                    <Gift className="w-5 h-5 text-amber-400" />
                    <span className="text-white text-xs font-semibold">{formatNoobPoints(amt)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
