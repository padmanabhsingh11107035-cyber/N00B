import React, { useState, useRef, useEffect } from 'react';
import { Heart,
  Music,
  Play,
  Pause,
  Upload,
  Plus,
  Search,
  ChevronRight,
  MoreHorizontal,
  SkipBack,
  SkipForward,
  Check,
  Clock,
  Pencil,
  X as XIcon,
  Trash2,
  Image as ImageIcon
} from 'lucide-react';
import { MusicTrack, User } from '../../types';
import { uploadMusicTrack, uploadMediaFile, renameMusicTrack, updateMusicTrackCover, deleteMusicTrack } from '../../services/api';
import { useMusicPlayer } from '../../context/MusicPlayerContext';
import { getAudioDuration } from '../../utils/mediaCompressor';
import { isVideoFile, extractAudioFromVideoFile, MAX_MUSIC_UPLOAD_SECONDS } from '../../utils/extractAudioFromVideo';
import { isMainAdmin } from '../../adminAccess';
import confetti from 'canvas-confetti';
import { MusicSplash } from './MusicSplash';
import { NowPlaying, useSongKeys } from './NowPlaying';
import { coverTint, fallbackTint, type CoverTint } from '../../utils/coverColor';

interface MusicHubViewProps {
  currentUser: User;
}

export const MusicHubView: React.FC<MusicHubViewProps> = ({ currentUser }) => {
  const {
    tracks,
    currentTrack: currentPlayingTrack,
    isPlaying,
    progress: audioProgress,
    playbackError,
    togglePlay,
    nextTrack,
    prevTrack,
    refreshTracks,
    toggleLike,
    pauseTrack
  } = useMusicPlayer();

  useEffect(() => {
    refreshTracks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [likedOnly, setLikedOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [menuTrackId, setMenuTrackId] = useState<string | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  // the colour of the song that is on: the mini player takes it
  const [tint, setTint] = useState<CoverTint>(() => fallbackTint(''));
  useEffect(() => {
    if (!currentPlayingTrack) return;
    let alive = true;
    setTint(fallbackTint(currentPlayingTrack.title));
    void coverTint(currentPlayingTrack.coverUrl, currentPlayingTrack.title).then((t) => { if (alive) setTint(t); });
    return () => { alive = false; };
  }, [currentPlayingTrack?.id, currentPlayingTrack?.coverUrl]);
  useEffect(() => {
    if (!menuTrackId) return;
    const close = () => setMenuTrackId(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menuTrackId]);

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
  const [isExtractingAudio, setIsExtractingAudio] = useState(false);
  const [audioUploadError, setAudioUploadError] = useState('');

  // Renaming — publisher-only, so this is only ever offered on tracks the
  // current account itself uploaded (checked against track.uploaderId).
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editTitleDraft, setEditTitleDraft] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameError, setRenameError] = useState('');

  const startRename = (track: MusicTrack) => {
    setEditingTrackId(track.id);
    setEditTitleDraft(track.title);
    setRenameError('');
  };

  const cancelRename = () => {
    setEditingTrackId(null);
    setEditTitleDraft('');
    setRenameError('');
  };

  // Changing a track's cover — uploader-only, same as renaming. Picking a new image uploads it,
  // then swaps the track over to it; the old cover file is permanently deleted from storage as
  // part of that (see updateMusicTrackCover).
  const coverEditFileRef = useRef<HTMLInputElement>(null);
  const coverEditTrackIdRef = useRef<string | null>(null);
  const [updatingCoverTrackId, setUpdatingCoverTrackId] = useState<string | null>(null);
  const [coverUpdateError, setCoverUpdateError] = useState('');
  const [coverUpdateErrorTrackId, setCoverUpdateErrorTrackId] = useState<string | null>(null);

  const startChangeCover = (track: MusicTrack) => {
    coverEditTrackIdRef.current = track.id;
    setCoverUpdateError('');
    setCoverUpdateErrorTrackId(null);
    coverEditFileRef.current?.click();
  };

  const handleCoverFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const trackId = coverEditTrackIdRef.current;
    e.target.value = '';
    if (!file || !trackId) return;
    setUpdatingCoverTrackId(trackId);
    try {
      const uploaded = await uploadMediaFile(file, 'posts');
      if (!uploaded.url) {
        setCoverUpdateError('Could not upload that image.');
        setCoverUpdateErrorTrackId(trackId);
        return;
      }
      const res = await updateMusicTrackCover(trackId, uploaded.objectKey || uploaded.url);
      if (res.success) {
        await refreshTracks();
      } else {
        setCoverUpdateError(res.error || 'Could not update the cover image.');
        setCoverUpdateErrorTrackId(trackId);
      }
    } catch {
      setCoverUpdateError('Could not update the cover image.');
      setCoverUpdateErrorTrackId(trackId);
    } finally {
      setUpdatingCoverTrackId(null);
      coverEditTrackIdRef.current = null;
    }
  };

  // Admin-only, permanent delete — removes the row and the actual audio/cover files from
  // storage (see deleteMusicTrack). Gated on isMainAdmin specifically, matching the server-side
  // check the RPC itself enforces, so the button never offers something the backend will refuse.
  const isMasterAdmin = isMainAdmin(currentUser);
  const [deletingTrackId, setDeletingTrackId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const confirmDeleteTrack = async (track: MusicTrack) => {
    setDeletingTrackId(track.id);
    setDeleteError('');
    try {
      const res = await deleteMusicTrack(track.id);
      if (res.success) {
        if (currentPlayingTrack?.id === track.id) pauseTrack();
        await refreshTracks();
        if (res.error) setDeleteError(res.error);
      } else {
        setDeleteError(res.error || 'Could not delete this track.');
      }
    } catch {
      setDeleteError('Could not delete this track.');
    } finally {
      setDeletingTrackId(null);
    }
  };

  const submitRename = async (trackId: string) => {
    const trimmed = editTitleDraft.trim();
    if (!trimmed) {
      setRenameError('Name cannot be empty.');
      return;
    }
    setIsRenaming(true);
    setRenameError('');
    try {
      const res = await renameMusicTrack(trackId, trimmed);
      if (res.success) {
        await refreshTracks();
        setEditingTrackId(null);
        setEditTitleDraft('');
      } else {
        setRenameError(res.error || 'Failed to rename track.');
      }
    } catch (err) {
      setRenameError('Failed to rename track.');
    } finally {
      setIsRenaming(false);
    }
  };

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
    let file = e.target.files?.[0];
    if (!file) return;
    setAudioUploadError('');
    try {
      // Video files are welcome here too — only the audio track ends up in the uploaded track.
      if (isVideoFile(file)) {
        setIsExtractingAudio(true);
        try {
          file = await extractAudioFromVideoFile(file);
        } finally {
          setIsExtractingAudio(false);
        }
      }
      const duration = await getAudioDuration(file);
      const [mm, ss] = duration.split(':').map(Number);
      if (mm * 60 + ss > MAX_MUSIC_UPLOAD_SECONDS) {
        setAudioUploadError('That track is longer than 20 minutes — please upload something shorter.');
        return;
      }
      setDetectedDuration(duration);

      const res = await uploadMediaFile(file, 'music');
      if (res.url) {
        setAudioUrlInput(res.url);
      }
      setAudioObjectKey(res.objectKey || '');
    } catch (err) {
      console.error(err);
      setAudioUploadError(err instanceof Error ? err.message : 'Could not process that file.');
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
      setAudioUploadError('');
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
    return matchesGenre && matchesSearch && (!likedOnly || !!t.isLiked);
  });
  // the first few songs are "Popular songs"; "All songs" opens the whole list
  const searching = showSearch && searchQuery.trim() !== '';
  const LIST_PREVIEW = 6;
  const shownTracks = showAll || searching || likedOnly || selectedGenre !== 'all' ? filteredTracks : filteredTracks.slice(0, LIST_PREVIEW);
  const totalPlays = tracks.reduce((n, t) => n + (t.playsCount || 0), 0);

  const genres = ['all', 'Synthwave', 'Lo-Fi', 'EDM', 'Hip Hop', 'Phonk', 'Cyberpunk', 'Ambient'];

  useSongKeys(!showPlayer && !showUploadModal);   // (the full player has its own)
  const isOwn = (t: MusicTrack) => t.uploaderId === currentUser.id;
  const hasMenu = (t: MusicTrack) => isOwn(t) || isMasterAdmin;

  return (
    <div className="w-full max-w-xl mx-auto pb-[calc(var(--nav-h,4rem)+6.5rem)] text-white" data-testid="music-hub" style={{ background: 'radial-gradient(120% 38% at 50% 78%, rgba(120,10,24,.28), transparent 70%)' }}>
      <MusicSplash />
      <input ref={coverEditFileRef} type="file" accept="image/*" onChange={handleCoverFileChosen} className="hidden" />

      {/* The spotlight: one big picture, the name over it */}
      <section className="relative w-full aspect-[5/6] max-h-[80vh] overflow-hidden sm:rounded-b-[32px] bg-black" aria-label="NOOB Music">
        <img src="/music/spotlight.webp" alt="" width={1000} height={1200} draggable={false} className="absolute inset-0 w-full h-full object-cover object-top" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050507] via-[#050507]/50 to-transparent" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(90,6,16,.28), transparent 45%)' }} />
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/55 to-transparent" />

        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-3">
          {/* NOOB Music's own picture: a chalk drawing of a disc player (public/noob-music-logo.jpg) */}
          <img
            src="/noob-music-logo.jpg"
            alt="NOOB Music logo"
            width={400}
            height={400}
            data-testid="music-logo"
            className="w-10 h-10 rounded-[22%] object-cover shrink-0 bg-black shadow-lg"
            draggable={false}
          />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setShowSearch((v) => !v); if (showSearch) setSearchQuery(''); }} aria-label="Search songs" aria-pressed={showSearch} className={`w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center cursor-pointer active:scale-90 transition ${showSearch ? 'bg-white text-black' : 'bg-black/35 text-white'}`}>
              <Search className="w-[18px] h-[18px]" />
            </button>
            <button type="button" onClick={() => { setLikedOnly((v) => !v); setShowAll(true); }} aria-label="Songs you liked" aria-pressed={likedOnly} className={`w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center cursor-pointer active:scale-90 transition ${likedOnly ? 'bg-white text-black' : 'bg-black/35 text-white'}`}>
              <Heart className={`w-[18px] h-[18px] ${likedOnly ? 'fill-black' : ''}`} />
            </button>
            <button type="button" onClick={() => setShowUploadModal(true)} aria-label="Upload a track" title="Upload a track" className="w-10 h-10 rounded-full bg-black/35 backdrop-blur-md text-white flex items-center justify-center cursor-pointer active:scale-90 transition">
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 px-5 pb-5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.28em] text-white/55">Spotlight</p>
          <h1 className="mt-1 text-[44px] leading-[1.02] font-extrabold tracking-tight text-white drop-shadow-[0_4px_18px_rgba(0,0,0,.5)]">NOOB Music</h1>
          <p className="mt-1.5 text-[11px] text-white/50">
            {tracks.length.toLocaleString()} {tracks.length === 1 ? 'song' : 'songs'}{totalPlays > 0 ? ` · ${totalPlays.toLocaleString()} plays` : ''}
          </p>
        </div>
      </section>

      <div className="px-4">
        {showSearch && (
          <div className="relative mt-4">
            <Search className="w-4 h-4 text-white/45 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              placeholder="Songs, artists or genres"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:bg-white/15"
            />
          </div>
        )}

        {/* Popular songs */}
        <div className="mt-6 flex items-center justify-between">
          <h2 className="text-[17px] font-bold">{likedOnly ? 'Songs you liked' : searching ? 'Results' : 'Popular songs'}</h2>
          {!likedOnly && !searching && filteredTracks.length > LIST_PREVIEW && selectedGenre === 'all' && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="flex items-center gap-0.5 rounded-full bg-white/10 pl-3 pr-2 py-1 text-[11px] font-semibold text-white/85 cursor-pointer active:scale-95 transition">
              {showAll ? 'Fewer songs' : 'All songs'} <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showAll ? 'rotate-90' : ''}`} />
            </button>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
          {genres.map((g) => (
            <button
              key={g}
              onClick={() => { setSelectedGenre(g); }}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-semibold capitalize transition-all cursor-pointer ${
                selectedGenre === g ? 'bg-white text-black' : 'bg-white/10 text-white/70 hover:text-white'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        {filteredTracks.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Music className="w-8 h-8 text-white/30 mx-auto" />
            <p className="text-sm font-bold">{likedOnly ? 'No liked songs yet' : tracks.length === 0 ? 'No tracks yet' : 'Nothing found'}</p>
            <p className="text-xs text-white/45">{likedOnly ? 'Tap the heart on a song to keep it here.' : tracks.length === 0 ? 'Tap + to upload the first one.' : 'Try another word or genre.'}</p>
          </div>
        ) : (
          <ul className="mt-2">
            {shownTracks.map((track, i) => {
              const isSelected = currentPlayingTrack?.id === track.id;
              return (
                <li
                  key={track.id}
                  onClick={() => togglePlay(track)}
                  className="music-row-in relative flex items-center gap-3 py-2.5 cursor-pointer group"
                  style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                >
                  <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-white/10">
                    <img src={track.coverUrl} alt="" className="w-full h-full object-cover" draggable={false} />
                    {isSelected && (
                      <div className="absolute inset-0 bg-black/50 flex items-end justify-center gap-[3px] pb-3 music-eq" aria-hidden="true">
                        <i className="block w-[3px] h-4 bg-white rounded-full origin-bottom" style={isPlaying ? undefined : { transform: 'scaleY(.35)' }} />
                        <i className="block w-[3px] h-4 bg-white rounded-full origin-bottom" style={isPlaying ? undefined : { transform: 'scaleY(.6)' }} />
                        <i className="block w-[3px] h-4 bg-white rounded-full origin-bottom" style={isPlaying ? undefined : { transform: 'scaleY(.35)' }} />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    {editingTrackId === track.id ? (
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          autoFocus
                          value={editTitleDraft}
                          onChange={(e) => setEditTitleDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitRename(track.id);
                            if (e.key === 'Escape') cancelRename();
                          }}
                          maxLength={100}
                          disabled={isRenaming}
                          className="min-w-0 flex-1 bg-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none"
                        />
                        <button type="button" disabled={isRenaming} onClick={() => submitRename(track.id)} className="w-7 h-7 rounded-full bg-white text-black flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50" title="Save name">
                          <Check className="w-4 h-4" />
                        </button>
                        <button type="button" disabled={isRenaming} onClick={cancelRename} className="w-7 h-7 rounded-full bg-white/15 text-white flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50" title="Cancel">
                          <XIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-[15px] font-semibold truncate">{track.title}</p>
                    )}
                    {editingTrackId === track.id && renameError && <p className="text-[11px] text-rose-300 mt-0.5">{renameError}</p>}
                    {updatingCoverTrackId === track.id && <p className="text-[11px] text-white/60 mt-0.5">Updating cover...</p>}
                    {coverUpdateErrorTrackId === track.id && coverUpdateError && <p className="text-[11px] text-rose-300 mt-0.5">{coverUpdateError}</p>}
                    <p className="text-[12px] text-white/45 truncate">{track.artist} · {track.genre}</p>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleLike(track.id); }}
                    className={`shrink-0 flex items-center gap-1 h-9 px-2 rounded-full text-[12px] font-semibold cursor-pointer active:scale-90 transition ${track.isLiked ? 'text-white' : 'text-white/40 hover:text-white'}`}
                    title={track.isLiked ? 'Unlike' : 'Like'}
                    aria-label={track.isLiked ? `Unlike ${track.title}` : `Like ${track.title}`}
                    aria-pressed={!!track.isLiked}
                  >
                    <Heart className={`w-[18px] h-[18px] ${track.isLiked ? 'fill-white' : ''}`} />
                    {track.likesCount > 0 && <span>{track.likesCount}</span>}
                  </button>

                  {hasMenu(track) ? (
                    <div className="relative shrink-0" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => setMenuTrackId(menuTrackId === track.id ? null : track.id)} aria-label={`More for ${track.title}`} aria-expanded={menuTrackId === track.id} className="w-9 h-9 rounded-full text-white/55 hover:text-white flex items-center justify-center cursor-pointer active:scale-90 transition">
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                      {menuTrackId === track.id && (
                        <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-2xl bg-[#1c1c20] border border-white/10 shadow-2xl p-1.5">
                          {isOwn(track) && (
                            <button type="button" onClick={() => { setMenuTrackId(null); startRename(track); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-semibold text-white hover:bg-white/10 cursor-pointer">
                              <Pencil className="w-4 h-4 text-white/60" /> Rename
                            </button>
                          )}
                          {isOwn(track) && (
                            <button type="button" disabled={updatingCoverTrackId === track.id} onClick={() => { setMenuTrackId(null); startChangeCover(track); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-semibold text-white hover:bg-white/10 cursor-pointer disabled:opacity-50">
                              <ImageIcon className="w-4 h-4 text-white/60" /> Change cover
                            </button>
                          )}
                          {isMasterAdmin && (
                            <button
                              type="button"
                              disabled={deletingTrackId === track.id}
                              onClick={() => {
                                setMenuTrackId(null);
                                if (window.confirm(`Permanently delete "${track.title}"? This removes it from NOOB's servers for everyone and cannot be undone.`)) confirmDeleteTrack(track);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-semibold text-rose-300 hover:bg-rose-500/10 cursor-pointer disabled:opacity-40"
                              title="Permanently delete this track (admin)"
                            >
                              <Trash2 className="w-4 h-4" /> Delete for everyone
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="shrink-0 w-10 text-right text-[12px] tabular-nums text-white/35">{track.duration}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {isMasterAdmin && deleteError && (
          <p className="text-[11px] text-rose-300 text-center mt-2">{deleteError}</p>
        )}
      </div>

      {/* The mini player: the colour of the song that is on; tap it for the full player */}
      {currentPlayingTrack && !showPlayer && (
        <div
          data-testid="music-mini"
          className="fixed left-3 right-[5.25rem] sm:right-auto sm:left-1/2 sm:-translate-x-1/2 bottom-[calc(var(--nav-h,4rem)+0.6rem)] z-40 sm:w-[calc(100%-1.5rem)] max-w-[460px] rounded-2xl overflow-hidden shadow-[0_16px_44px_rgba(0,0,0,.7)] border border-white/[0.08] backdrop-blur-xl"
          style={{ background: `linear-gradient(90deg, hsl(${tint.hue} ${Math.round(Math.min(0.9, tint.sat + 0.2) * 100)}% 15%), hsl(${tint.hue} ${Math.round(Math.min(0.9, tint.sat + 0.2) * 85)}% 8%))` }}
        >
          <div className="flex items-center gap-3 p-2.5 pr-3">
            <button type="button" onClick={() => setShowPlayer(true)} className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer" aria-label="Open the player">
              <img src={currentPlayingTrack.coverUrl} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0 bg-black/40" draggable={false} />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold truncate">{currentPlayingTrack.title}</span>
                <span className="block text-[11px] text-white/55 truncate">{currentPlayingTrack.artist}</span>
              </span>
            </button>
            <button type="button" onClick={prevTrack} aria-label="Previous song" className="w-9 h-9 rounded-full flex items-center justify-center text-white/85 cursor-pointer active:scale-90 transition"><SkipBack className="w-[18px] h-[18px] fill-current" /></button>
            <button type="button" onClick={() => togglePlay(currentPlayingTrack)} aria-label={isPlaying ? 'Pause' : 'Play'} className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center cursor-pointer active:scale-90 transition">
              {isPlaying ? <Pause className="w-[18px] h-[18px] fill-black" /> : <Play className="w-[18px] h-[18px] fill-black ml-0.5" />}
            </button>
            <button type="button" onClick={nextTrack} aria-label="Next song" className="w-9 h-9 rounded-full flex items-center justify-center text-white/85 cursor-pointer active:scale-90 transition"><SkipForward className="w-[18px] h-[18px] fill-current" /></button>
          </div>
          <div className="h-[3px] bg-white/10"><div className="h-full bg-white/80" style={{ width: `${Number.isFinite(audioProgress) ? audioProgress : 0}%` }} /></div>
          {playbackError && <p className="px-3 py-1.5 text-[11px] font-semibold text-rose-200 bg-black/40">{playbackError}</p>}
        </div>
      )}

      {showPlayer && currentPlayingTrack && <NowPlaying onClose={() => setShowPlayer(false)} />}

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
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-noob"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1">Artist / Producer</label>
                <input
                  type="text"
                  required
                  value={artistInput}
                  onChange={(e) => setArtistInput(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-noob"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1">Genre</label>
                <select
                  required
                  value={genreInput}
                  onChange={(e) => setGenreInput(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-noob"
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
                  disabled={isExtractingAudio}
                  className={`p-2.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                    audioUrlInput
                      ? 'bg-noob/10 border-noob/40 text-noob'
                      : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
                  }`}
                >
                  {isExtractingAudio ? (
                    <>Extracting audio…</>
                  ) : audioUrlInput ? (
                    <><Check className="w-3 h-3 text-noob" /> Audio File</>
                  ) : (
                    <><Upload className="w-3 h-3 text-noob" /> Audio File</>
                  )}
                </button>
                <input ref={audioFileRef} type="file" accept="audio/*,video/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.mp4,.mov,.m4v,.webm,.mkv" onChange={handleAudioUpload} className="hidden" />
              </div>

              {/* Auto Duration Status */}
              <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 flex items-center justify-between text-xs">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-noob" />
                  Auto-detected Length:
                </span>
                <span className="font-mono font-bold text-noob bg-black/40 px-2 py-0.5 rounded-md border border-white/5">
                  {detectedDuration || 'Upload audio…'}
                </span>
              </div>

              {audioUploadError && (
                <p className="text-[11px] text-rose-400 font-semibold text-center bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-1.5">
                  {audioUploadError}
                </p>
              )}

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
                  className="px-5 py-2 rounded-xl bg-noob text-black font-extrabold text-xs shadow-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
