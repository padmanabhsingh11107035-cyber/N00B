import React from 'react';
import { Play, Pause, SkipForward, Volume2, VolumeX, Music } from 'lucide-react';
import { useMusicPlayer } from '../../context/MusicPlayerContext';

interface FloatingMiniPlayerProps {
  onOpenMusicHub: () => void;
  activeTab: string;
}

export const FloatingMiniPlayer: React.FC<FloatingMiniPlayerProps> = ({ onOpenMusicHub, activeTab }) => {
  const { currentTrack, isPlaying, progress, isMuted, togglePlay, nextTrack, toggleMute } = useMusicPlayer();

  if (!currentTrack || activeTab === 'music') {
    return null;
  }

  return (
    <div
      id="floating-mini-music-player"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-[420px] bg-zinc-950/95 border border-purple-500/30 rounded-2xl p-2.5 shadow-2xl backdrop-blur-xl flex items-center justify-between gap-3 animate-in slide-in-from-bottom-5 duration-300 ring-1 ring-white/10"
    >
      {/* Track Details & Cover (Click to jump to Music Hub) */}
      <div
        onClick={onOpenMusicHub}
        className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer group"
      >
        <div className="relative w-10 h-10 rounded-xl overflow-hidden shrink-0 shadow-md border border-white/10">
          <img
            src={currentTrack.coverUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=80'}
            alt={currentTrack.title}
            className={`w-full h-full object-cover ${isPlaying ? 'animate-spin-slow' : ''}`}
          />
          <div className="absolute inset-0 bg-black/20" />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-white truncate group-hover:text-[#00FF66] transition-colors">
              {currentTrack.title}
            </span>
            {isPlaying && (
              <span className="flex items-center gap-0.5">
                <span className="w-1 h-2 bg-[#00FF66] animate-pulse rounded-full" />
                <span className="w-1 h-3.5 bg-[#00FF66] animate-pulse delay-75 rounded-full" />
                <span className="w-1 h-2.5 bg-[#00FF66] animate-pulse delay-150 rounded-full" />
              </span>
            )}
          </div>
          <span className="text-[10px] text-zinc-400 truncate block">
            {currentTrack.artist} • <span className="text-purple-400 font-medium">{currentTrack.genre}</span>
          </span>
        </div>
      </div>

      {/* Playback Controls */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={toggleMute}
          className="p-1.5 text-zinc-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          onClick={() => togglePlay()}
          className="w-8 h-8 rounded-full bg-white hover:bg-zinc-200 text-black flex items-center justify-center shadow-md transition-transform hover:scale-105 active:scale-95 cursor-pointer"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="w-3.5 h-3.5 fill-black" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-black ml-0.5" />
          )}
        </button>

        <button
          type="button"
          onClick={nextTrack}
          className="p-1.5 text-zinc-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          title="Next Track"
        >
          <SkipForward className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Progress Bar overlay */}
      <div className="absolute -bottom-[1px] left-3 right-3 h-[2px] bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#00FF66] to-cyan-400 transition-all duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};
