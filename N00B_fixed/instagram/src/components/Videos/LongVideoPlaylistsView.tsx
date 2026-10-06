import React, { useEffect, useState } from 'react';
import { X, ListVideo, Bookmark, Plus, Trash2, Pencil, ChevronLeft } from 'lucide-react';
import { LongVideo, LongVideoPlaylist } from '../../types';
import {
  fetchSavedLongVideos,
  fetchMyLongVideoPlaylists,
  fetchLongVideoPlaylistItems,
  createLongVideoPlaylist,
  renameLongVideoPlaylist,
  deleteLongVideoPlaylist,
  toggleVideoInPlaylist
} from '../../services/api';

interface Props {
  onClose: () => void;
  onOpenVideo: (video: LongVideo) => void;
}

const formatDuration = (totalSeconds: number): string => {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

const VideoRow: React.FC<{ video: LongVideo; onOpen: () => void; onRemove?: () => void }> = ({ video, onOpen, onRemove }) => (
  <div className="w-full flex items-center gap-3">
    <button onClick={onOpen} className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer">
      <div className="relative w-24 aspect-video rounded-lg overflow-hidden bg-black shrink-0">
        {video.thumbnailUrl ? (
          <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover" />
        ) : (
          <video src={video.videoUrl} className="w-full h-full object-cover" muted preload="metadata" />
        )}
        <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[9px] font-bold px-1 py-0.5 rounded">{formatDuration(video.durationSeconds)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-white line-clamp-2 leading-snug">{video.title || 'Untitled video'}</p>
        <p className="text-[11px] text-zinc-400 mt-0.5">@{video.username}</p>
      </div>
    </button>
    {onRemove && (
      <button onClick={onRemove} className="p-1.5 text-zinc-500 hover:text-red-400 rounded-full hover:bg-zinc-900 cursor-pointer shrink-0" title="Remove from playlist">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    )}
  </div>
);

// Two sections: the existing "Saved" (bookmark) list, which had no screen to show it before this,
// and user-created named playlists. Tapping a video always hands it back to the parent's existing
// full-screen player (onOpenVideo) instead of reimplementing playback/like/comment/share here.
export const LongVideoPlaylistsView: React.FC<Props> = ({ onClose, onOpenVideo }) => {
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<LongVideo[]>([]);
  const [playlists, setPlaylists] = useState<LongVideoPlaylist[]>([]);
  const [openPlaylist, setOpenPlaylist] = useState<LongVideoPlaylist | null>(null);
  const [playlistItems, setPlaylistItems] = useState<LongVideo[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadLists = () => {
    setLoading(true);
    Promise.all([fetchSavedLongVideos(), fetchMyLongVideoPlaylists()]).then(([s, p]) => {
      setSaved(s);
      setPlaylists(p);
      setLoading(false);
    });
  };

  useEffect(() => { loadLists(); }, []);

  const openPlaylistItems = (playlist: LongVideoPlaylist) => {
    setOpenPlaylist(playlist);
    setItemsLoading(true);
    fetchLongVideoPlaylistItems(playlist.id).then((items) => { setPlaylistItems(items); setItemsLoading(false); });
  };

  const handleCreate = async () => {
    const name = prompt('Name your playlist:');
    if (!name || !name.trim()) return;
    setCreating(true);
    const res = await createLongVideoPlaylist(name.trim());
    setCreating(false);
    if (res.success) loadLists();
    else alert(res.error || 'Could not create the playlist.');
  };

  const handleRename = async (playlist: LongVideoPlaylist) => {
    const name = prompt('Rename playlist:', playlist.name);
    if (!name || !name.trim() || name.trim() === playlist.name) return;
    const res = await renameLongVideoPlaylist(playlist.id, name.trim());
    if (res.success) {
      const newName = name.trim();
      setPlaylists((prev) => prev.map((p) => (p.id === playlist.id ? { ...p, name: newName } : p)));
      setOpenPlaylist((cur) => (cur && cur.id === playlist.id ? { ...cur, name: newName } : cur));
    } else alert(res.error || 'Could not rename the playlist.');
  };

  const handleDeletePlaylist = async (playlist: LongVideoPlaylist) => {
    if (!confirm(`Delete "${playlist.name}"? This can't be undone.`)) return;
    const res = await deleteLongVideoPlaylist(playlist.id);
    if (res.success) {
      setPlaylists((prev) => prev.filter((p) => p.id !== playlist.id));
      setOpenPlaylist((cur) => (cur && cur.id === playlist.id ? null : cur));
    } else alert(res.error || 'Could not delete the playlist.');
  };

  const handleRemoveFromPlaylist = async (video: LongVideo) => {
    if (!openPlaylist) return;
    const res = await toggleVideoInPlaylist(openPlaylist.id, video.id);
    if (res.success) {
      setPlaylistItems((prev) => prev.filter((v) => v.id !== video.id));
      setPlaylists((prev) => prev.map((p) => (p.id === openPlaylist.id ? { ...p, videosCount: Math.max(0, p.videosCount - 1) } : p)));
    } else if (res.error) alert(res.error);
  };

  if (openPlaylist) {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-xl">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setOpenPlaylist(null)} className="p-1.5 -ml-1 text-zinc-300 hover:text-white rounded-lg hover:bg-zinc-900 cursor-pointer shrink-0">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base font-black text-white truncate">{openPlaylist.name}</h1>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => handleRename(openPlaylist)} className="p-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-900 cursor-pointer" title="Rename">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={() => handleDeletePlaylist(openPlaylist)} className="p-1.5 text-zinc-400 hover:text-red-400 rounded-full hover:bg-zinc-900 cursor-pointer" title="Delete playlist">
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-900 cursor-pointer" title="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {itemsLoading ? (
            <div className="py-16 flex items-center justify-center text-zinc-500 text-xs">Loading…</div>
          ) : playlistItems.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-2 text-center text-zinc-500">
              <ListVideo className="w-8 h-8 text-zinc-700" />
              <p className="text-xs">No videos in this playlist yet.</p>
            </div>
          ) : (
            <div className="space-y-3 max-w-2xl mx-auto">
              {playlistItems.map((v) => (
                <VideoRow key={v.id} video={v} onOpen={() => onOpenVideo(v)} onRemove={() => handleRemoveFromPlaylist(v)} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-xl">
        <h1 className="text-base font-black italic tracking-tighter text-white flex items-center gap-2">
          <ListVideo className="w-4.5 h-4.5" /> Playlist
        </h1>
        <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-900 cursor-pointer">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="py-16 flex items-center justify-center text-zinc-500 text-xs">Loading…</div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Bookmark className="w-4 h-4 text-[#00FF66]" />
                <span className="text-sm font-bold text-white">Saved ({saved.length})</span>
              </div>
              {saved.length === 0 ? (
                <p className="text-xs text-zinc-500">Videos you save will show up here.</p>
              ) : (
                <div className="space-y-3">
                  {saved.map((v) => <VideoRow key={v.id} video={v} onOpen={() => onOpenVideo(v)} />)}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-white">Your playlists</span>
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex items-center gap-1 bg-[#00FF66] text-black rounded-full pl-2 pr-3 py-1.5 text-xs font-bold cursor-pointer hover:bg-[#00FF66]/90 transition-colors disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" /> New
                </button>
              </div>
              {playlists.length === 0 ? (
                <p className="text-xs text-zinc-500">Create a playlist to organize videos your way.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {playlists.map((p) => (
                    <button key={p.id} onClick={() => openPlaylistItems(p)} className="flex flex-col gap-1.5 text-left cursor-pointer">
                      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                        {p.coverThumbnail ? (
                          <img src={p.coverThumbnail} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <ListVideo className="w-6 h-6 text-zinc-700" />
                        )}
                      </div>
                      <p className="text-xs font-bold text-white truncate">{p.name}</p>
                      <p className="text-[10px] text-zinc-500">{p.videosCount} {p.videosCount === 1 ? 'video' : 'videos'}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
