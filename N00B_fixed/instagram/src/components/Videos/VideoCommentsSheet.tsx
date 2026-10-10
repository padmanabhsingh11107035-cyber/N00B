import React, { useState, useEffect } from 'react';
import { X, Send, Heart, Pin, Trash2, CornerDownRight, ChevronDown, ChevronUp, CheckSquare, Square } from 'lucide-react';
import { LongVideo, PostComment, User } from '../../types';
import {
  fetchLongVideoComments,
  addLongVideoComment,
  deleteLongVideoComment,
  toggleLongVideoPinComment,
  toggleLongVideoCommentLike
} from '../../services/api';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import { CommentMediaComposer, CommentAttachmentPreview, CommentMediaView, type CommentAttachment } from '../Feed/CommentMediaComposer';
import confetti from 'canvas-confetti';
import { AvatarMedia } from '../Common/AvatarMedia';

interface VideoCommentsSheetProps {
  video: LongVideo;
  currentUser: User;
  isMasterAdmin?: boolean;
  onClose: () => void;
}

// A near-identical copy of Feed/CommentsSheet.tsx, pointed at the long-video comment RPCs instead
// of the post ones — reels duplicate this same way (inline in ReelsView.tsx) rather than sharing a
// single genericized sheet, so this matches the codebase's existing pattern for a second target type.
export const VideoCommentsSheet: React.FC<VideoCommentsSheetProps> = ({ video, currentUser, isMasterAdmin, onClose }) => {
  const [comments, setComments] = useState<PostComment[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedCommentIds, setSelectedCommentIds] = useState<string[]>([]);
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ topLevelId: string; username: string } | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<string[]>([]);
  const [commentError, setCommentError] = useState('');
  const [attachment, setAttachment] = useState<CommentAttachment | null>(null);

  const isVideoOwner = video.userId === currentUser.id || video.username === currentUser.username;
  const canModerate = isVideoOwner || !!isMasterAdmin;

  useEffect(() => {
    loadComments();
  }, [video.id]);

  const loadComments = async () => {
    setLoading(true);
    try {
      const data = await fetchLongVideoComments(video.id);
      setComments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setComments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !attachment) return;

    setCommentError('');
    try {
      const media = attachment
        ? { url: attachment.objectKey || attachment.url, type: attachment.type, duration: attachment.duration }
        : undefined;
      const newC = await addLongVideoComment(video.id, inputText.trim(), replyingTo?.topLevelId, media);
      if (!newC) throw new Error('Could not post the comment.');
      setComments((prev) => [...(Array.isArray(prev) ? prev : []), newC]);
      if (replyingTo) setExpandedThreads((prev) => (prev.includes(replyingTo.topLevelId) ? prev : [...prev, replyingTo.topLevelId]));
      setInputText('');
      setAttachment(null);
      setReplyingTo(null);
      confetti({ particleCount: 20, spread: 45, origin: { y: 0.9 } });
    } catch (err) {
      console.error(err);
      setCommentError(err instanceof Error ? err.message : 'Could not post the comment. Please try again.');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteLongVideoComment(video.id, commentId);
      setComments((prev) => (Array.isArray(prev) ? prev.filter((c) => c.id !== commentId && c.parentId !== commentId) : []));
    } catch (err) {
      console.error(err);
    }
  };

  const handleTogglePin = async (commentId: string) => {
    try {
      const res = await toggleLongVideoPinComment(video.id, commentId);
      setComments((prev) => (Array.isArray(prev) ? prev : []).map((c) => (c.id === commentId ? { ...c, isPinned: res.isPinned } : c)));
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleLike = async (commentId: string) => {
    const prev = comments;
    setComments((cur) =>
      cur.map((item) => (item.id === commentId ? { ...item, isLiked: !item.isLiked, likesCount: item.likesCount + (item.isLiked ? -1 : 1) } : item))
    );
    const res = await toggleLongVideoCommentLike(video.id, commentId);
    if (!res.success) {
      setComments(prev);
      return;
    }
    setComments((cur) => cur.map((item) => (item.id === commentId ? { ...item, isLiked: res.isLiked, likesCount: res.likesCount } : item)));
  };

  const handleBulkDelete = async () => {
    for (const cId of selectedCommentIds) {
      await deleteLongVideoComment(video.id, cId);
    }
    setComments((prev) => (Array.isArray(prev) ? prev.filter((c) => !selectedCommentIds.includes(c.id) && !selectedCommentIds.includes(c.parentId || '')) : []));
    setSelectedCommentIds([]);
    setIsBulkMode(false);
  };

  const toggleSelectComment = (cId: string) => {
    setSelectedCommentIds((prev) => (prev.includes(cId) ? prev.filter((id) => id !== cId) : [...prev, cId]));
  };

  const toggleThread = (topLevelId: string) => {
    setExpandedThreads((prev) => (prev.includes(topLevelId) ? prev.filter((id) => id !== topLevelId) : [...prev, topLevelId]));
  };

  const safeComments = Array.isArray(comments) ? comments : [];
  const topLevel = safeComments.filter((c) => !c.parentId);
  const repliesOf = (topLevelId: string) => safeComments.filter((c) => c.parentId === topLevelId);
  const sortedTopLevel = [...topLevel].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return 0;
  });

  const CommentRow: React.FC<{ c: PostComment; isReply?: boolean }> = ({ c, isReply }) => {
    const canDelete = canModerate || c.userId === currentUser.id;
    const isSelected = selectedCommentIds.includes(c.id);
    const topLevelId = c.parentId || c.id;

    return (
      <div
        className={`flex items-start justify-between gap-3 p-2 rounded-xl transition-colors ${
          c.isPinned ? 'bg-noob/5 border border-noob/20' : 'hover:bg-neutral-900/40'
        } ${isReply ? 'ml-8 border-l border-neutral-800 pl-3' : ''}`}
      >
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          {isBulkMode && !isReply && (
            <button onClick={() => toggleSelectComment(c.id)} className="mt-1 text-noob cursor-pointer">
              {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-gray-500" />}
            </button>
          )}
          <AvatarMedia
            src={c.userAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
            isLiveAvatar={c.authorIsLiveAvatar}
            liveAvatarVideoUrl={c.authorLiveAvatarVideoUrl}
            alt={c.username}
            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-white">{c.username}</span>
              {c.isVerified && <VerifiedBadge size="xs" />}
              {c.isPinned && (
                <span className="flex items-center gap-0.5 text-[9px] text-noob bg-noob/10 px-1.5 py-0.2 rounded font-semibold">
                  <Pin className="w-2.5 h-2.5" /> Pinned
                </span>
              )}
              <span className="text-[10px] text-gray-400">{c.createdAt}</span>
            </div>
            <p translate="no" className="text-xs text-gray-200 mt-1 whitespace-pre-line leading-relaxed break-words">
              {isReply && c.replyToUsername && c.replyToUsername !== c.username && (
                <span className="text-noob font-semibold mr-1">@{c.replyToUsername}</span>
              )}
              {c.text}
            </p>
            {c.mediaUrl && c.mediaType && <CommentMediaView url={c.mediaUrl} type={c.mediaType} duration={c.mediaDuration} />}
            <button
              type="button"
              onClick={() => setReplyingTo({ topLevelId, username: c.username })}
              className="text-[10px] font-bold text-gray-400 hover:text-white mt-1 cursor-pointer"
            >
              Reply
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1 shrink-0">
          {canModerate && !isReply && (
            <button
              onClick={() => handleTogglePin(c.id)}
              className={`p-1 rounded hover:bg-neutral-800 transition-colors ${c.isPinned ? 'text-noob' : 'text-gray-400'}`}
              title={c.isPinned ? 'Unpin comment' : 'Pin comment'}
            >
              <Pin className="w-3.5 h-3.5" />
            </button>
          )}
          {canDelete && !isBulkMode && (
            <button onClick={() => handleDeleteComment(c.id)} className="p-1 text-gray-400 hover:text-red-400 rounded hover:bg-neutral-800" title="Delete comment">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => handleToggleLike(c.id)}
            className={`flex items-center gap-1 text-[11px] p-1 ${c.isLiked ? 'text-red-500' : 'text-gray-400 hover:text-white'}`}
          >
            <Heart className={`w-3.5 h-3.5 ${c.isLiked ? 'fill-current' : ''}`} />
            {c.likesCount > 0 && <span>{c.likesCount}</span>}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div id="video-comments-sheet-modal" className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-lg bg-zinc-950 border border-neutral-800 sm:rounded-2xl rounded-t-2xl h-[80vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white tracking-tight">Comments</h3>
            <span className="text-xs text-gray-400">({comments.length})</span>
          </div>
          <div className="flex items-center gap-2">
            {canModerate && comments.length > 0 && (
              <button
                onClick={() => setIsBulkMode(!isBulkMode)}
                className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${isBulkMode ? 'bg-noob text-black' : 'text-gray-400 hover:text-white'}`}
              >
                {isBulkMode ? 'Cancel' : 'Bulk Manage'}
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-neutral-800">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {isBulkMode && (
          <div className="bg-neutral-900 px-4 py-2 flex items-center justify-between border-b border-neutral-800 text-xs">
            <span className="text-gray-300 font-medium">{selectedCommentIds.length} comments selected</span>
            <button
              disabled={selectedCommentIds.length === 0}
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/40 rounded-lg hover:bg-red-500 hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Selected
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {loading ? (
            <div className="text-center py-8 text-xs text-gray-500">Loading comments...</div>
          ) : sortedTopLevel.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-xs">No comments yet. Start the conversation!</div>
          ) : (
            sortedTopLevel.map((c) => {
              const replies = repliesOf(c.id);
              const isExpanded = expandedThreads.includes(c.id);
              return (
                <div key={c.id} className="py-1.5">
                  <CommentRow c={c} />
                  {replies.length > 0 && (
                    <div className="ml-8 mt-1">
                      <button
                        type="button"
                        onClick={() => toggleThread(c.id)}
                        className="flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-white cursor-pointer mb-1"
                      >
                        <CornerDownRight className="w-3 h-3" />
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {isExpanded ? 'Hide' : 'View'} {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                      </button>
                      {isExpanded && (
                        <div className="space-y-1.5">
                          {replies.map((r) => (
                            <CommentRow key={r.id} c={r} isReply />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={handleSendComment} className="p-3 bg-neutral-900 border-t border-neutral-800">
          {commentError && (
            <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-400">{commentError}</div>
          )}
          {replyingTo && (
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[11px] text-gray-400">
                Replying to <span className="text-noob font-semibold">@{replyingTo.username}</span>
              </span>
              <button type="button" onClick={() => setReplyingTo(null)} className="text-[11px] text-gray-500 hover:text-white cursor-pointer">
                Cancel
              </button>
            </div>
          )}
          {attachment && <CommentAttachmentPreview attachment={attachment} onRemove={() => setAttachment(null)} />}
          <div className="mb-2">
            <CommentMediaComposer onAttachmentChange={setAttachment} onInsertEmoji={(emoji) => setInputText((prev) => prev + emoji)} />
          </div>
          <div className="flex items-center gap-2">
            <img
              src={currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
              alt={currentUser.username}
              className="w-8 h-8 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="flex-1 flex items-center bg-black rounded-xl border border-neutral-700 px-3 py-1.5 focus-within:border-noob">
              <textarea
                rows={1}
                placeholder={replyingTo ? `Reply to @${replyingTo.username}...` : 'Add a comment (Enter line breaks as needed)...'}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendComment(e);
                  }
                }}
                className="w-full bg-transparent text-xs text-white placeholder-gray-400 focus:outline-none resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={!inputText.trim() && !attachment}
              className="px-3.5 py-2 bg-noob text-black font-bold text-xs rounded-xl disabled:opacity-40 hover:scale-105 transition-transform cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
