import React, { useState } from 'react';
import { X, Send, MessageCircle } from 'lucide-react';
import { ScratchPost } from '../types/scratch';

interface CommentsDrawerProps {
  post: ScratchPost;
  isOpen: boolean;
  onClose: () => void;
  onAddComment: (text: string) => void;
}

export const CommentsDrawer: React.FC<CommentsDrawerProps> = ({
  post,
  isOpen,
  onClose,
  onAddComment,
}) => {
  const [commentText, setCommentText] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    onAddComment(commentText.trim());
    setCommentText('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-[#0d0d12] border-2 border-white rounded-t-3xl sm:rounded-3xl shadow-[5px_5px_0px_0px_#ffffff] max-h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-6">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b-2 border-white/40">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-400 flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-cyan-300" />
            </div>
            <div>
              <h3 className="font-marker text-sm text-white">Chalk Notes & Clues</h3>
              <p className="font-doodle text-xs text-zinc-400">
                {post.comments.length} community notes on this scratch reveal
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close comments drawer"
            onClick={onClose}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/60 active:scale-95"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {post.comments.length === 0 ? (
            <div className="text-center py-8">
              <p className="font-doodle text-zinc-400 text-sm">
                No notes yet! Be the first to leave a doodle clue.
              </p>
            </div>
          ) : (
            post.comments.map((c) => (
              <div
                key={c.id}
                className="flex items-start gap-3 p-3 rounded-2xl bg-black border border-white/30 shadow-[2px_2px_0px_0px_#ffffff]"
              >
                <img
                  src={c.avatar}
                  alt={c.author}
                  className="w-8 h-8 rounded-full border border-white object-cover"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-marker text-xs text-white">{c.author}</span>
                    <span className="text-[10px] font-doodle text-zinc-400">{c.time}</span>
                  </div>
                  <p className="text-xs text-zinc-200 mt-1 font-sans">{c.text}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSubmit} className="p-3 border-t-2 border-white/40 bg-[#121217] flex gap-2">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Write a scratch clue or reaction..."
            className="flex-1 bg-black border-2 border-white rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 font-sans"
          />
          <button
            type="submit"
            aria-label="Submit chalk note"
            disabled={!commentText.trim()}
            className="px-4 py-2 bg-white disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-marker text-xs rounded-xl border-2 border-white shadow-[2px_2px_0px_0px_#ffffff] flex items-center gap-1 active:scale-95 transition-all"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Post</span>
          </button>
        </form>
      </div>
    </div>
  );
};
