import { setAppMusicPlaying } from '../utils/gameMusic';
import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { MusicTrack } from '../types';
import { fetchMusicTracks, toggleLikeMusicTrack } from '../services/api';

interface MusicPlayerContextType {
  tracks: MusicTrack[];
  currentTrack: MusicTrack | null;
  isPlaying: boolean;
  progress: number;
  isMuted: boolean;
  playbackError: string | null;
  togglePlay: (track?: MusicTrack) => void;
  playTrack: (track: MusicTrack) => void;
  pauseTrack: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  toggleMute: () => void;
  // Shuffle: the next song is a random one. Repeat: the song that ends plays again.
  shuffle: boolean;
  repeat: boolean;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  // Where the song is, in seconds (the length is the real one once the file has loaded).
  elapsedSec: number;
  totalSec: number;
  refreshTracks: () => Promise<void>;
  seekTo: (percentage: number) => void;
  // Like / unlike a track (saved in the database — one like per person per track).
  toggleLike: (trackId: string) => Promise<void>;
}

const MusicPlayerContext = createContext<MusicPlayerContextType | undefined>(undefined);

export const MusicPlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [totalSec, setTotalSec] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // While the person's own music plays, the Games page keeps quiet (see utils/gameMusic.ts).
  useEffect(() => { setAppMusicPlaying(isPlaying); }, [isPlaying]);

  useEffect(() => {
    loadTracks();
  }, []);

  const loadTracks = async () => {
    try {
      const data = await fetchMusicTracks();
      setTracks(data);
      if (data.length > 0 && !currentTrack) {
        setCurrentTrack(data[0]);
      }
    } catch (err) {
      console.error('Failed to fetch tracks in global player:', err);
    }
  };

  // Shows the like straight away, then keeps the saved state (or goes back if it couldn't be saved).
  const toggleLike = async (trackId: string) => {
    const before = tracks.find((t) => t.id === trackId);
    if (!before) return;
    const patchTrack = (liked: boolean, count: number) => {
      const upd = (t: MusicTrack) => (t.id === trackId ? { ...t, isLiked: liked, likesCount: count } : t);
      setTracks((prev) => prev.map(upd));
      setCurrentTrack((prev) => (prev ? upd(prev) : prev));
    };
    const wasLiked = !!before.isLiked;
    patchTrack(!wasLiked, Math.max(0, (before.likesCount || 0) + (wasLiked ? -1 : 1)));
    const res = await toggleLikeMusicTrack(trackId);
    if (res && res.success) patchTrack(!!res.isLiked, res.likesCount ?? 0);
    else patchTrack(wasLiked, before.likesCount || 0);
  };

  const playTrack = (track: MusicTrack) => {
    setPlaybackError(null);
    setCurrentTrack(track);
    setIsPlaying(true);
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.play().catch((err) => {
          console.warn('Playback prevented:', err);
          setIsPlaying(false);
          setPlaybackError(`Couldn't play "${track.title}". Your browser may not support this audio format.`);
        });
      }
    }, 50);
  };

  const pauseTrack = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
  };

  const togglePlay = (track?: MusicTrack) => {
    const target = track || currentTrack;
    if (!target) return;

    if (currentTrack?.id === target.id) {
      if (isPlaying) {
        pauseTrack();
      } else {
        setPlaybackError(null);
        setIsPlaying(true);
        audioRef.current?.play().catch((err) => {
          console.warn('Playback error:', err);
          setIsPlaying(false);
          setPlaybackError(`Couldn't play "${target.title}". Your browser may not support this audio format.`);
        });
      }
    } else {
      playTrack(target);
    }
  };

  const nextTrack = () => {
    if (tracks.length === 0) return;
    const currentIndex = tracks.findIndex((t) => t.id === currentTrack?.id);
    let nextIndex = (currentIndex + 1) % tracks.length;
    if (shuffle && tracks.length > 1) {
      do { nextIndex = Math.floor(Math.random() * tracks.length); } while (nextIndex === currentIndex);
    }
    playTrack(tracks[nextIndex]);
  };

  const prevTrack = () => {
    if (tracks.length === 0) return;
    const currentIndex = tracks.findIndex((t) => t.id === currentTrack?.id);
    const prevIndex = (currentIndex - 1 + tracks.length) % tracks.length;
    playTrack(tracks[prevIndex]);
  };

  const toggleMute = () => {
    setIsMuted((prev) => !prev);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const cur = audioRef.current.currentTime;
      const total = audioRef.current.duration || 1;
      setProgress((cur / total) * 100);
      setElapsedSec(cur);
      if (isFinite(audioRef.current.duration)) setTotalSec(audioRef.current.duration);
    }
  };

  // The song ended: with Repeat on it starts again, otherwise the next one plays.
  const handleEnded = () => {
    const audio = audioRef.current;
    if (repeat && audio) {
      audio.currentTime = 0;
      audio.play().catch(() => setIsPlaying(false));
      return;
    }
    nextTrack();
  };

  const seekTo = (percentage: number) => {
    const audio = audioRef.current;
    if (audio && isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = (percentage / 100) * audio.duration;
      setProgress(percentage);
    }
  };

  return (
    <MusicPlayerContext.Provider
      value={{
        tracks,
        currentTrack,
        isPlaying,
        progress,
        isMuted,
        playbackError,
        togglePlay,
        playTrack,
        pauseTrack,
        nextTrack,
        prevTrack,
        toggleMute,
        shuffle,
        repeat,
        toggleShuffle: () => setShuffle((v) => !v),
        toggleRepeat: () => setRepeat((v) => !v),
        elapsedSec,
        totalSec,
        refreshTracks: loadTracks,
        seekTo,
        toggleLike
      }}
    >
      {children}

      {/* Global persistent audio element that stays mounted across all tab transitions */}
      {currentTrack?.audioUrl && (
        <audio
          ref={audioRef}
          src={currentTrack.audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onLoadedMetadata={(e) => { const d = (e.target as HTMLAudioElement).duration; setTotalSec(isFinite(d) ? d : 0); setElapsedSec(0); }}
          onError={(e) => {
            console.warn('Audio playback error:', e);
            setIsPlaying(false);
            const mediaError = (e.target as HTMLAudioElement).error;
            const message =
              mediaError?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
                ? `Couldn't play "${currentTrack.title}". This audio file's format isn't supported by your browser.`
                : `Couldn't play "${currentTrack.title}". The track may have expired — try refreshing.`;
            setPlaybackError(message);
          }}
          muted={isMuted}
          preload="none"
        />
      )}
    </MusicPlayerContext.Provider>
  );
};

export function useMusicPlayer() {
  const context = useContext(MusicPlayerContext);
  if (!context) {
    throw new Error('useMusicPlayer must be used within a MusicPlayerProvider');
  }
  return context;
}
