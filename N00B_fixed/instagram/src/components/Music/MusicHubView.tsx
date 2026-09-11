import React, { useState, useRef } from 'react';
import {
  Music,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Upload,
  Search,
  Sparkles,
  Disc3,
  Flame,
  Radio,
  Share2,
  Check,
  Clock
} from 'lucide-react';
import { MusicTrack, User } from '../../types';
import { uploadMusicTrack, uploadMediaFile } from '../../services/api';
import { useMusicPlayer } from '../../context/MusicPlayerContext';
import { getAudioDuration } from '../../utils/mediaCompressor';
import confetti from 'canvas-confetti';

interface MusicHubViewProps {
  currentUser: User;
}

export const MusicHubView: React.FC<MusicHubViewProps> = ({ currentUser }) => {
  const {
    tracks,
    currentTrack: currentPlayingTrack,
    isPlaying,
    progress: audioProgress,
    isMuted,
    playbackError,
    togglePlay,
    toggleMute,
    refreshTracks,
    seekTo
  } = useMusicPlayer();

  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Upload Form
  const [titleInput, setTitleInput] = useState('');
  const [artistInput, setArtistInput] = useState(currentUser.displayName || currentUser.username);
  const [genreInput, setGenreInput] = useState('');
  const [coverUrlInput, setCoverUrlInput] = useState('');
  const [audioUrlInput, setAudioUrlInput] = useState('');
  const [coverObjectKey, setCoverObjectKey] = useState('');
  const [audioObjectKey, setAudioObjectKey] = useState('');
  const [detectedDuration, setDetectedDuration] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const coverFileRef = useRef<HTMLInputElement>(null);
  const audioFileRef = useRef<HTMLInputElement>(null);

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const res = await uploadMediaFile(file, 'posts');
        if (res.url) setCoverUrlInput(res.url);
        // The presigned URL expires in an hour — persist the durable object
        // key instead so the server can re-sign it on every future load.
        setCoverObjectKey(res.objectKey || '');
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        // Auto calculate duration from uploaded audio
        const duration = await getAudioDuration(file);
        setDetectedDuration(duration);

        const res = await uploadMediaFile(file, 'music');
        if (res.url) {
          setAudioUrlInput(res.url);
        }
        setAudioObjectKey(res.objectKey || '');
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleCreateTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleInput.trim() || !genreInput || !audioUrlInput || !coverUrlInput) return;

    try {
      setIsUploading(true);
      const finalDuration = detectedDuration || (await getAudioDuration(audioUrlInput));

      await uploadMusicTrack({
        title: titleInput.trim(),
        artist: artistInput.trim(),
        genre: genreInput,
        duration: finalDuration,
        coverUrl: coverObjectKey || coverUrlInput,
        audioUrl: audioObjectKey || audioUrlInput
      });

      await refreshTracks();
      setShowUploadModal(false);
      setTitleInput('');
      setGenreInput('');
      setCoverUrlInput('');
      setAudioUrlInput('');
      setCoverObjectKey('');
      setAudioObjectKey('');
      setDetectedDuration('');
      confetti({ particleCount: 40, spread: 60, origin: { y: 0.6 } });
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  const filteredTracks = tracks.filter((t) => {
    const matchesGenre = selectedGenre === 'all' || t.genre.toLowerCase() === selectedGenre.toLowerCase();
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.genre.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesGenre && matchesSearch;
  });

  const genres = ['all', 'Synthwave', 'Lo-Fi', 'EDM', 'Hip Hop', 'Phonk', 'Cyberpunk', 'Ambient'];

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pb-28 pt-2">
      {/* Music Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 p-5 rounded-3xl bg-zinc-950 border border-zinc-800/80 shadow-2xl">
        <div className="flex items-center gap-3.5">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(168,85,247,0.35)]"
            style={{ background: 'conic-gradient(from 180deg, #00FF66, #22D3EE, #A855F7, #EC4899, #FB923C, #FACC15, #00FF66)' }}
          >
            <Disc3 className="w-6 h-6 text-white stroke-[2.5] animate-spin-slow" />
          </div>
          <h1 className="text-xl font-black text-white tracking-tight">NOOB Music</h1>
        </div>

        <button
          onClick={() => setShowUploadModal(true)}
          className="px-4 py-2.5 rounded-2xl bg-[#00FF66] hover:bg-[#00FF66]/90 text-black text-xs font-black flex items-center gap-2 shadow-[0_0_15px_rgba(0,255,102,0.25)] transition-all cursor-pointer self-start sm:self-auto"
        >
          <Upload className="w-4 h-4" />
          <span>Upload Track</span>
        </button>
      </div>

      {/* Active Sticky Player Banner */}
      {currentPlayingTrack && (
        <div className="mb-6 p-4 rounded-3xl bg-gradient-to-r from-zinc-900 via-zinc-900 to-purple-950/40 border border-purple-500/30 shadow-2xl flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative w-12 h-12 rounded-2xl overflow-hidden shrink-0 shadow-lg border border-white/10">
                <img
                  src={currentPlayingTrack.coverUrl}
                  alt={currentPlayingTrack.title}
                  className={`w-full h-full object-cover ${isPlaying ? 'animate-spin-slow' : ''}`}
                />
                <div className="absolute inset-0 bg-black/20" />
              </div>

              <div className="min-w-0">
                <span className="text-xs font-black text-white truncate block">
                  {currentPlayingTrack.title}
                </span>
                <span className="text-[11px] text-zinc-400 truncate block">
                  {currentPlayingTrack.artist} • <span className="text-purple-400 font-semibold">{currentPlayingTrack.genre}</span>
                </span>
              </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={toggleMute}
                className="p-2 rounded-full text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <button
                onClick={() => togglePlay(currentPlayingTrack)}
                className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:scale-105 transition-transform cursor-pointer"
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-black" /> : <Play className="w-5 h-5 fill-black ml-0.5" />}
              </button>
            </div>
          </div>

          {/* Scrubbable Progress Bar */}
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={Number.isFinite(audioProgress) ? audioProgress : 0}
            onChange={(e) => seekTo(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[#00FF66]"
            style={{
              background: `linear-gradient(to right, #00FF66 ${audioProgress}%, #3f3f46 ${audioProgress}%)`
            }}
            aria-label="Seek track position"
          />

          {playbackError && (
            <p className="text-[11px] text-rose-400 font-semibold text-center bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-1.5">
              {playbackError}
            </p>
          )}
        </div>
      )}

      {/* Search & Genre Filters */}
      <div className="space-y-3 mb-6">
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search community tracks, artists, or genres..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900/80 border border-zinc-800 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#00FF66]"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {genres.map((g) => (
            <button
              key={g}
              onClick={() => setSelectedGenre(g)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer ${
                selectedGenre === g
                  ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(147,51,234,0.4)]'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Track List Grid */}
      {filteredTracks.length === 0 ? (
        <div className="py-16 text-center bg-zinc-950 rounded-3xl border border-zinc-800 space-y-2">
          <Music className="w-8 h-8 text-zinc-600 mx-auto" />
          <p className="text-sm font-bold text-white">No tracks yet</p>
          <p className="text-xs text-zinc-500">Be the first to upload one to the Community Music Hub.</p>
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filteredTracks.map((track) => {
          const isSelected = currentPlayingTrack?.id === track.id;
          return (
            <div
              key={track.id}
              onClick={() => togglePlay(track)}
              className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer group ${
                isSelected
                  ? 'bg-purple-950/30 border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                  : 'bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-white/10">
                  <img
                    src={track.coverUrl}
                    alt={track.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {isSelected && isPlaying ? (
                      <Pause className="w-5 h-5 text-white fill-white" />
                    ) : (
                      <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                    )}
                  </div>
                </div>

                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-white truncate group-hover:text-purple-300 transition-colors">
                    {track.title}
                  </h4>
                  <p className="text-[11px] text-zinc-400 truncate">
                    {track.artist} • <span className="text-zinc-500">{track.genre}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-mono text-zinc-500">{track.duration}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlay(track);
                  }}
                  className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-white text-zinc-300 hover:text-black flex items-center justify-center transition-colors cursor-pointer"
                >
                  {isSelected && isPlaying ? (
                    <Pause className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Upload Track Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-black text-white">Upload Audio Track</h3>

            <form onSubmit={handleCreateTrack} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1">Track Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Midnight Cyber Drive"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00FF66]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1">Artist / Producer</label>
                <input
                  type="text"
                  required
                  value={artistInput}
                  onChange={(e) => setArtistInput(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00FF66]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1">Genre</label>
                <select
                  required
                  value={genreInput}
                  onChange={(e) => setGenreInput(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00FF66]"
                >
                  <option value="" disabled>Select a genre…</option>
                  {genres.filter((g) => g !== 'all').map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              {/* Upload Cover & MP3 */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => coverFileRef.current?.click()}
                  className={`p-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                    coverUrlInput
                      ? 'bg-pink-500/10 border-pink-500/40 text-pink-300'
                      : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
                  }`}
                >
                  {coverUrlInput ? <Check className="w-3 h-3 text-pink-400" /> : <Upload className="w-3 h-3 text-pink-400" />} Cover Art
                </button>
                <input ref={coverFileRef} type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />

                <button
                  type="button"
                  onClick={() => audioFileRef.current?.click()}
                  className={`p-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                    audioUrlInput
                      ? 'bg-[#00FF66]/10 border-[#00FF66]/40 text-[#00FF66]'
                      : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
                  }`}
                >
                  {audioUrlInput ? <Check className="w-3 h-3 text-[#00FF66]" /> : <Upload className="w-3 h-3 text-[#00FF66]" />} Audio File
                </button>
                <input ref={audioFileRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" onChange={handleAudioUpload} className="hidden" />
              </div>

              {/* Auto Duration Status */}
              <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 flex items-center justify-between text-xs">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#00FF66]" />
                  Auto-detected Length:
                </span>
                <span className="font-mono font-bold text-[#00FF66] bg-black/40 px-2 py-0.5 rounded-md border border-white/5">
                  {detectedDuration || 'Upload audio…'}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 text-xs text-zinc-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !titleInput.trim() || !genreInput || !audioUrlInput || !coverUrlInput}
                  className="px-5 py-2 rounded-xl bg-[#00FF66] text-black font-extrabold text-xs shadow-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isUploading ? 'Publishing...' : 'Publish Track'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
