import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { MusicTrack } from '../types';
import { fetchMusicTracks } from '../services/api';

interface MusicPlayerContextType {
  tracks: MusicTrack[];
  currentTrack: MusicTrack | null;
  isPlaying: boolean;
  progress: number;
  isMuted: boolean;
  togglePlay: (track?: MusicTrack) => void;
  playTrack: (track: MusicTrack) => void;
  pauseTrack: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  toggleMute: () => void;
  refreshTracks: () => Promise<void>;
  seekTo: (percentage: number) => void;
}

const MusicPlayerContext = createContext<MusicPlayerContextType | undefined>(undefined);

export const MusicPlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  const playTrack = (track: MusicTrack) => {
    setCurrentTrack(track);
    setIsPlaying(true);
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.play().catch((err) => {
          console.warn('Playback prevented:', err);
          setIsPlaying(false);
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
        setIsPlaying(true);
        audioRef.current?.play().catch((err) => {
          console.warn('Playback error:', err);
          setIsPlaying(false);
        });
      }
    } else {
      playTrack(target);
    }
  };

  const nextTrack = () => {
    if (tracks.length === 0) return;
    const currentIndex = tracks.findIndex((t) => t.id === currentTrack?.id);
    const nextIndex = (currentIndex + 1) % tracks.length;
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
    }
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
        togglePlay,
        playTrack,
        pauseTrack,
        nextTrack,
        prevTrack,
        toggleMute,
        refreshTracks: loadTracks,
        seekTo
      }}
    >
      {children}

      {/* Global persistent audio element that stays mounted across all tab transitions */}
      {currentTrack?.audioUrl && (
        <audio
          ref={audioRef}
          src={currentTrack.audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onEnded={nextTrack}
          onError={(e) => {
            console.warn('Audio playback error:', e);
            setIsPlaying(false);
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
