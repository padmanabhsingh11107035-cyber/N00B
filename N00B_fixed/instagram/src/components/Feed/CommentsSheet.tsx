import React, { useState, useEffect } from 'react';
import { X, Send, Heart, Pin, Trash2, ShieldCheck, CheckSquare, Square, CornerDownRight, ChevronDown, ChevronUp } from 'lucide-react';
import { Post, PostComment, User } from '../../types';
import { fetchComments, addComment, deleteComment, togglePinComment, toggleCommentLike } from '../../services/api';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import confetti from 'canvas-confetti';

interface CommentsSheetProps {
  post: Post;
  currentUser: User;
  onClose: () => void;
}

export const CommentsSheet: React.FC<CommentsSheetProps> = ({ post, currentUser, onClose }) => {
  const [comments, setComments] = useState<PostComment[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedCommentIds, setSelectedCommentIds] = useState<string[]>([]);
  const [isBulkMode, setIsBulkMode] = useState(false);
  // Replying to a comment (yours or anyone's) — always resolves to the top-level comment's id, even
  // when tapping "Reply" on a reply, since threads are flattened to one level (matching the backend).
  const [replyingTo, setReplyingTo] = useState<{ topLevelId: string; username: string } | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<string[]>([]);
  const [commentError, setCommentError] = useState('');

  const isPostOwner = post.userId === currentUser.id || post.username === currentUser.username;

  useEffect(() => {
    loadComments();
  }, [post.id]);

  const loadComments = async () => {
    setLoading(true);
    try {
      const data = await fetchComments(post.id);
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
    if (!inputText.trim()) return;

    setCommentError('');
    try {
      const newC = await addComment(post.id, inputText.trim(), replyingTo?.topLevelId);
      if (!newC) throw new Error('Could not post the comment.');
      // Only clear the input / close the reply composer / celebrate on an ACTUAL success — clearing
      // these unconditionally used to make a silently-failed save look identical to a real one (the
      // text vanished, confetti fired, but nothing was ever saved).
      setComments(prev => [...(Array.isArray(prev) ? prev : []), newC]);
      if (replyingTo) setExpandedThreads((prev) => (prev.includes(replyingTo.topLevelId) ? prev : [...prev, replyingTo.topLevelId]));
      setInputText('');
      setReplyingTo(null);
      confetti({ particleCount: 20, spread: 45, origin: { y: 0.9 } });
    } catch (err) {
      console.error(err);
      setCommentError(err instanceof Error ? err.message : 'Could not post the comment. Please try again.');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteComment(post.id, commentId);
      // A deleted top-level comment takes its replies with it (cascade on the server) — drop both here.
      setComments(prev => (Array.isArray(prev) ? prev.filter((c) => c.id !== commentId && c.parentId !== commentId) : []));
    } catch (err) {
      console.error(err);
    }
  };

  const handleTogglePin = async (commentId: string) => {
    try {
      const res = await togglePinComment(post.id, commentId);
      setComments(prev =>
        (Array.isArray(prev) ? prev : []).map((c) => (c.id === commentId ? { ...c, isPinned: res.isPinned } : c))
      );
    } catch (err) {
      console.error(err);
    }
  };

  // Optimistic, but reconciled with the real (persisted) result — a like used to just flip local
  // state with no backend call at all, so it silently reset the moment the sheet was closed and
  // reopened. Rolled back on failure instead of trusting the optimistic flip.
  const handleToggleLike = async (commentId: string) => {
    const prev = comments;
    setComments((cur) =>
      cur.map((item) =>
        item.id === commentId
          ? { ...item, isLiked: !item.isLiked, likesCount: item.likesCount + (item.isLiked ? -1 : 1) }
          : item
      )
    );
    const res = await toggleCommentLike(post.id, commentId);
    if (!res.success) {
      setComments(prev);
      return;
    }
    setComments((cur) =>
      cur.map((item) => (item.id === commentId ? { ...item, isLiked: res.isLiked, likesCount: res.likesCount } : item))
    );
  };

  const handleBulkDelete = async () => {
    for (const cId of selectedCommentIds) {
      await deleteComment(post.id, cId);
    }
    setComments(prev => (Array.isArray(prev) ? prev.filter((c) => !selectedCommentIds.includes(c.id) && !selectedCommentIds.includes(c.parentId || '')) : []));
    setSelectedCommentIds([]);
    setIsBulkMode(false);
  };

  const toggleSelectComment = (cId: string) => {
    if (selectedCommentIds.includes(cId)) {
      setSelectedCommentIds(selectedCommentIds.filter((id) => id !== cId));
    } else {
      setSelectedCommentIds([...selectedCommentIds, cId]);
    }
  };

  const toggleThread = (topLevelId: string) => {
    setExpandedThreads((prev) => (prev.includes(topLevelId) ? prev.filter((id) => id !== topLevelId) : [...prev, topLevelId]));
  };

  // Top-level comments (pinned first), each with its own flat list of replies.
  const safeComments = Array.isArray(comments) ? comments : [];
  const topLevel = safeComments.filter((c) => !c.parentId);
  const repliesOf = (topLevelId: string) => safeComments.filter((c) => c.parentId === topLevelId);
  const sortedTopLevel = [...topLevel].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return 0;
  });

  const CommentRow: React.FC<{ c: PostComment; isReply?: boolean }> = ({ c, isReply }) => {
    const canDelete = isPostOwner || c.userId === currentUser.id;
    const isSelected = selectedCommentIds.includes(c.id);
    const topLevelId = c.parentId || c.id;

    return (
      <div
        className={`flex items-start justify-between gap-3 p-2 rounded-xl transition-colors ${
          c.isPinned ? 'bg-[#00FF66]/5 border border-[#00FF66]/20' : 'hover:bg-neutral-900/40'
        } ${isReply ? 'ml-8 border-l border-neutral-800 pl-3' : ''}`}
      >
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          {isBulkMode && !isReply && (
            <button onClick={() => toggleSelectComment(c.id)} className="mt-1 text-[#00FF66] cursor-pointer">
              {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-gray-500" />}
            </button>
          )}
          <img
            src={c.userAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
            alt={c.username}
            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
            referrerPolicy="no-referrer"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-white">{c.username}</span>
              {c.isVerified && <VerifiedBadge size="xs" />}
              {c.isPinned && (
                <span className="flex items-center gap-0.5 text-[9px] text-[#00FF66] bg-[#00FF66]/10 px-1.5 py-0.2 rounded font-semibold">
                  <Pin className="w-2.5 h-2.5" /> Pinned
                </span>
              )}
              <span className="text-[10px] text-gray-400">{c.createdAt}</span>
            </div>
            <p translate="no" className="text-xs text-gray-200 mt-1 whitespace-pre-line leading-relaxed break-words">
              {isReply && c.replyToUsername && c.replyToUsername !== c.username && (
                <span className="text-[#00FF66] font-semibold mr-1">@{c.replyToUsername}</span>
              )}
              {c.text}
            </p>
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
          {isPostOwner && !isReply && (
            <button
              onClick={() => handleTogglePin(c.id)}
              className={`p-1 rounded hover:bg-neutral-800 transition-colors ${c.isPinned ? 'text-[#00FF66]' : 'text-gray-400'}`}
              title={c.isPinned ? 'Unpin comment' : 'Pin comment'}
            >
              <Pin className="w-3.5 h-3.5" />
            </button>
          )}
          {canDelete && !isBulkMode && (
            <button
              onClick={() => handleDeleteComment(c.id)}
              className="p-1 text-gray-400 hover:text-red-400 rounded hover:bg-neutral-800"
              title="Delete comment"
            >
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
    <div
      id="comments-sheet-modal"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="w-full max-w-lg bg-[#0e0e0e] border border-neutral-800 sm:rounded-2xl rounded-t-2xl h-[80vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white tracking-tight">Comments</h3>
            <span className="text-xs text-gray-400">({comments.length})</span>
          </div>

          <div className="flex items-center gap-2">
            {isPostOwner && comments.length > 0 && (
              <button
                onClick={() => setIsBulkMode(!isBulkMode)}
                className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${
                  isBulkMode ? 'bg-[#00FF66] text-black' : 'text-gray-400 hover:text-white'
                }`}
              >
                {isBulkMode ? 'Cancel' : 'Bulk Manage'}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-neutral-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Bulk Action Bar */}
        {isBulkMode && (
          <div className="bg-neutral-900 px-4 py-2 flex items-center justify-between border-b border-neutral-800 text-xs">
            <span className="text-gray-300 font-medium">
              {selectedCommentIds.length} comments selected
            </span>
            <button
              disabled={selectedCommentIds.length === 0}
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/40 rounded-lg hover:bg-red-500 hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Selected
            </button>
          </div>
        )}

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {loading ? (
            <div className="text-center py-8 text-xs text-gray-500">Loading comments...</div>
          ) : sortedTopLevel.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-xs">
              No comments yet. Start the conversation!
            </div>
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

        {/* Input Form with Line Breaks Support */}
        <form
          onSubmit={handleSendComment}
          className="p-3 bg-neutral-900 border-t border-neutral-800"
        >
          {commentError && (
            <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-400">
              {commentError}
            </div>
          )}
          {replyingTo && (
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[11px] text-gray-400">
                Replying to <span className="text-[#00FF66] font-semibold">@{replyingTo.username}</span>
              </span>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="text-[11px] text-gray-500 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <img
              src={currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
              alt={currentUser.username}
              className="w-8 h-8 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="flex-1 flex items-center bg-black rounded-xl border border-neutral-700 px-3 py-1.5 focus-within:border-[#00FF66]">
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
              disabled={!inputText.trim()}
              className="px-3.5 py-2 bg-[#00FF66] text-black font-bold text-xs rounded-xl disabled:opacity-40 hover:scale-105 transition-transform cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
