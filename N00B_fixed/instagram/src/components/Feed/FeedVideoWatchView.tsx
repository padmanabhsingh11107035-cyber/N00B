import React, { useEffect, useState } from 'react';
import { X, Heart, ThumbsDown, MessageCircle, Send, Bookmark, Download, ListPlus, Check, Plus, Loader2 } from 'lucide-react';
import { Post, User, LongVideoPlaylist } from '../../types';
import { AvatarMedia } from '../Common/AvatarMedia';
import { formatRelativeTime } from '../../utils/formatTime';
import { formatNoobPoints } from '../../utils/formatPoints';
import { isMainAdmin } from '../../adminAccess';
import { CommentsSheet } from './CommentsSheet';
import { SharePostSheet } from '../Common/SharePostSheet';
import { SharePostToChatModal } from '../Common/SharePostToChatModal';
import {
  toggleLikePost,
  toggleSavePost,
  toggleDislikePost,
  fetchFeedVideoUpNext,
  fetchPlaylistsForPost,
  togglePostInPlaylist,
  createLongVideoPlaylist
} from '../../services/api';

interface FeedVideoWatchViewProps {
  post: Post;
  currentUser: User;
  onClose: () => void;
  onNavigateToProfile?: (user: User) => void;
}

// A YouTube-style full "watch page" for a Feed video post — opened from a small expand button on
// the inline preview (see PostCard's onOpenVideoWatch). Deliberately self-contained (its own local
// copy of whichever post is currently open, its own like/save/dislike calls) rather than routed
// through FeedView/App.tsx's central posts array, same pattern CommentsSheet and HomeVideoFeedView's
// openVideo already use for this app's other full-screen single-item views — switching to an "up
// next" video never requires that video to already be loaded into the main feed.
export const FeedVideoWatchView: React.FC<FeedVideoWatchViewProps> = ({ post, currentUser, onClose, onNavigateToProfile }) => {
  const [activePost, setActivePost] = useState(post);
  const [showComments, setShowComments] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [showShareToChat, setShowShareToChat] = useState(false);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [showPlaylistSheet, setShowPlaylistSheet] = useState(false);
  const [playlists, setPlaylists] = useState<(LongVideoPlaylist & { hasVideo: boolean })[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [upNext, setUpNext] = useState<Post[]>([]);
  const [upNextLoading, setUpNextLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);

  const videoSlide = activePost.slides.find((s) => s.mediaType === 'video') || activePost.slides[0];
  const isAdmin = isMainAdmin(currentUser);

  useEffect(() => {
    let alive = true;
    setUpNextLoading(true);
    fetchFeedVideoUpNext(activePost.id).then((list) => {
      if (alive) {
        setUpNext(list);
        setUpNextLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [activePost.id]);

  const copyPostLink = async () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?post=${encodeURIComponent(activePost.id)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareLinkCopied(true);
      setTimeout(() => setShareLinkCopied(false), 2000);
    } catch {
      // clipboard blocked — nothing more to do here
    }
  };

  const handleToggleLike = async () => {
    const wasLiked = activePost.isLiked;
    const res = await toggleLikePost(activePost.id);
    if ('error' in res) return;
    setActivePost((p) => ({ ...p, isLiked: res.isLiked, likesCount: res.likesCount, isDisliked: wasLiked ? p.isDisliked : false }));
  };

  const handleToggleDislike = async () => {
    const res = await toggleDislikePost(activePost.id);
    if ('error' in res) return;
    setActivePost((p) => ({
      ...p,
      isDisliked: res.isDisliked,
      isLiked: res.isLiked,
      likesCount: res.likesCount,
      dislikesCount: res.dislikesCount ?? p.dislikesCount
    }));
  };

  const handleToggleSave = async () => {
    const res = await toggleSavePost(activePost.id);
    if ('error' in res) return;
    setActivePost((p) => ({ ...p, isSaved: res.isSaved, savesCount: res.savesCount }));
  };

  const handleOpenPlaylistSheet = async () => {
    setShowPlaylistSheet(true);
    setPlaylistsLoading(true);
    setPlaylists(await fetchPlaylistsForPost(activePost.id));
    setPlaylistsLoading(false);
  };

  const handleTogglePlaylist = async (playlistId: string) => {
    const res = await togglePostInPlaylist(playlistId, activePost.id);
    if (!res.success) return;
    setPlaylists((prev) => prev.map((pl) => (pl.id === playlistId ? { ...pl, hasVideo: !!res.inPlaylist, videosCount: pl.videosCount + (res.inPlaylist ? 1 : -1) } : pl)));
  };

  const handleCreatePlaylist = async () => {
    const name = newPlaylistName.trim();
    if (!name || creatingPlaylist) return;
    setCreatingPlaylist(true);
    const res = await createLongVideoPlaylist(name);
    if (res.success && res.id) {
      await handleTogglePlaylist(res.id);
      setPlaylists((prev) => [{ id: res.id!, name, videosCount: 1, createdAt: new Date().toISOString(), hasVideo: true }, ...prev]);
      setNewPlaylistName('');
    }
    setCreatingPlaylist(false);
  };

  const handleDownload = async () => {
    if (!videoSlide || downloading) return;
    setDownloading(true);
    setDownloadError(false);
    try {
      const res = await fetch(videoSlide.mediaUrl);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `noob-video-${activePost.id}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  };

  const handleSelectUpNext = (next: Post) => {
    setActivePost(next);
    setShowComments(false);
    setShowShareSheet(false);
    setShowShareToChat(false);
    setShowPlaylistSheet(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-zinc-800/80 shrink-0">
        <button onClick={onClose} className="p-1.5 text-white cursor-pointer" title="Close">
          <X className="w-5 h-5" />
        </button>
        <span className="text-[11px] font-bold text-zinc-400">Watching</span>
      </div>

      <div className="w-full bg-black shrink-0">
        {videoSlide && (
          <video
            key={activePost.id}
            src={videoSlide.mediaUrl}
            controls
            autoPlay
            playsInline
            className="w-full max-h-[45vh] bg-black"
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-3.5 py-3 space-y-3 border-b border-zinc-800/60">
          {activePost.caption && <p className="text-white text-sm font-bold leading-snug whitespace-pre-line">{activePost.caption}</p>}

          <button
            onClick={() => onNavigateToProfile?.({ id: activePost.userId, username: activePost.username, displayName: activePost.displayName, avatar: activePost.userAvatar } as User)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <AvatarMedia src={activePost.userAvatar} alt={activePost.username} className="w-9 h-9 rounded-full object-cover" />
            <div className="text-left">
              <span className="text-white text-xs font-semibold block">@{activePost.username}</span>
              <span className="text-zinc-500 text-[10px]">{formatRelativeTime(activePost.createdAt)}</span>
            </div>
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleToggleLike}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer ${
                activePost.isLiked ? 'bg-red-500/15 text-red-400 border border-red-500/40' : 'bg-zinc-900 text-zinc-300 border border-zinc-800'
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${activePost.isLiked ? 'fill-current' : ''}`} />
              {!activePost.isLikeCountHidden && formatNoobPoints(activePost.likesCount)}
            </button>

            <button
              onClick={handleToggleDislike}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer ${
                activePost.isDisliked ? 'bg-zinc-700 text-white border border-zinc-500' : 'bg-zinc-900 text-zinc-300 border border-zinc-800'
              }`}
              title="Dislike"
            >
              <ThumbsDown className={`w-3.5 h-3.5 ${activePost.isDisliked ? 'fill-current' : ''}`} />
              {isAdmin && typeof activePost.dislikesCount === 'number' && formatNoobPoints(activePost.dislikesCount)}
            </button>

            {!activePost.isCommentsDisabled && (
              <button
                onClick={() => setShowComments(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer bg-zinc-900 text-zinc-300 border border-zinc-800"
              >
                <MessageCircle className="w-3.5 h-3.5" /> {activePost.commentsCount > 0 ? formatNoobPoints(activePost.commentsCount) : 'Comment'}
              </button>
            )}

            <button
              onClick={() => setShowShareSheet(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer bg-zinc-900 text-zinc-300 border border-zinc-800"
            >
              <Send className="w-3.5 h-3.5 -rotate-12" /> Share
            </button>

            <button
              onClick={handleToggleSave}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer ${
                activePost.isSaved ? 'bg-noob/15 text-noob border border-noob/40' : 'bg-zinc-900 text-zinc-300 border border-zinc-800'
              }`}
            >
              <Bookmark className={`w-3.5 h-3.5 ${activePost.isSaved ? 'fill-current' : ''}`} /> Save
            </button>

            <button
              onClick={handleOpenPlaylistSheet}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer bg-zinc-900 text-zinc-300 border border-zinc-800"
            >
              <ListPlus className="w-3.5 h-3.5" /> Playlist
            </button>

            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer bg-zinc-900 text-zinc-300 border border-zinc-800 disabled:opacity-60"
            >
              {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Download
            </button>
            {downloadError && <span className="text-[10px] text-red-400 w-full">Couldn't download that — try again.</span>}
          </div>
        </div>

        {/* Up Next */}
        <div className="px-3.5 py-3 space-y-2.5">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Up Next</h3>
          {upNextLoading ? (
            <div className="py-6 flex items-center justify-center text-zinc-500 text-xs">Loading more videos…</div>
          ) : upNext.length === 0 ? (
            <div className="py-6 text-center text-zinc-500 text-xs">No other videos to show right now.</div>
          ) : (
            upNext.map((v) => {
              const vSlide = v.slides.find((s) => s.mediaType === 'video');
              if (!vSlide) return null;
              return (
                <button key={v.id} onClick={() => handleSelectUpNext(v)} className="w-full flex items-center gap-3 text-left cursor-pointer">
                  <div className="relative w-28 aspect-video rounded-lg overflow-hidden bg-zinc-900 shrink-0">
                    <video src={vSlide.mediaUrl} className="w-full h-full object-cover" muted preload="metadata" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-white line-clamp-2 leading-snug">{v.caption || 'Untitled video'}</p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">@{v.username}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {showComments && (
        <CommentsSheet post={activePost} currentUser={currentUser} onClose={() => setShowComments(false)} />
      )}

      {showShareSheet && (
        <SharePostSheet
          type="post"
          linkCopied={shareLinkCopied}
          onCopyLink={copyPostLink}
          onSendInChat={() => {
            setShowShareSheet(false);
            setShowShareToChat(true);
          }}
          onClose={() => setShowShareSheet(false)}
        />
      )}

      {showShareToChat && (
        <SharePostToChatModal currentUser={currentUser} itemId={activePost.id} itemType="post" onClose={() => setShowShareToChat(false)} />
      )}

      {showPlaylistSheet && (
        <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center animate-in fade-in duration-150" onClick={() => setShowPlaylistSheet(false)}>
          <div
            className="w-full sm:max-w-sm sm:rounded-3xl rounded-t-3xl bg-zinc-950 border border-zinc-800 overflow-hidden max-h-[75vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-bold text-white">Save to Playlist</h3>
              <button onClick={() => setShowPlaylistSheet(false)} className="p-1.5 rounded-full hover:bg-zinc-900 text-zinc-400 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {playlistsLoading ? (
                <div className="py-6 flex items-center justify-center text-zinc-500 text-xs">Loading playlists…</div>
              ) : (
                playlists.map((pl) => (
                  <button
                    key={pl.id}
                    onClick={() => handleTogglePlaylist(pl.id)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl hover:bg-zinc-900 cursor-pointer"
                  >
                    <span className="text-xs font-semibold text-white">{pl.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-500">{pl.videosCount}</span>
                      {pl.hasVideo && <Check className="w-4 h-4 text-noob" />}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="p-3 border-t border-zinc-800 flex items-center gap-2 shrink-0">
              <input
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
                placeholder="New playlist name"
                maxLength={60}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-noob/50"
              />
              <button
                onClick={handleCreatePlaylist}
                disabled={!newPlaylistName.trim() || creatingPlaylist}
                className="p-2 rounded-xl bg-noob text-black disabled:opacity-40 disabled:cursor-default cursor-pointer"
              >
                {creatingPlaylist ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
