import React, { useEffect, useRef, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { User } from '../../types';
import { VerifiedBadge } from './VerifiedBadge';

interface LikesViewsSheetProps {
  title: string; // e.g. "Liked by" / "Viewed by"
  fetchUsers: () => Promise<{ users?: User[]; error?: string }>;
  onClose: () => void;
  onNavigateToUser?: (user: User) => void;
}

// How far down the sheet must be dragged (from its own drag handle/header,
// not the scrollable list below) before releasing counts as "dismiss" —
// short of that it springs back open.
const DRAG_DISMISS_THRESHOLD = 90;

// Shared bottom sheet for "who liked this" / "who viewed this" on a post,
// reel, or story — fixed at 75% of the viewport height, drag-to-dismiss
// from the handle/header (the list itself scrolls normally), matching the
// same slide-up entrance as the Comments sheet.
export const LikesViewsSheet: React.FC<LikesViewsSheetProps> = ({ title, fetchUsers, onClose, onNavigateToUser }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dragY, setDragY] = useState(0);
  const [hasDraggedOnce, setHasDraggedOnce] = useState(false);
  const draggingRef = useRef(false);
  const dragStartYRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchUsers();
        if (cancelled) return;
        if (res.users) {
          setUsers(res.users);
        } else {
          setError(res.error || 'Could not load this list.');
        }
      } catch (err) {
        if (!cancelled) setError('Could not load this list.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDragStart = (e: React.TouchEvent) => {
    draggingRef.current = true;
    dragStartYRef.current = e.touches[0].clientY;
    setHasDraggedOnce(true);
  };

  const handleDragMove = (e: React.TouchEvent) => {
    if (!draggingRef.current) return;
    const delta = e.touches[0].clientY - dragStartYRef.current;
    if (delta > 0) setDragY(delta);
  };

  const handleDragEnd = () => {
    draggingRef.current = false;
    if (dragY > DRAG_DISMISS_THRESHOLD) {
      onClose();
    } else {
      setDragY(0);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={hasDraggedOnce ? { transform: `translateY(${dragY}px)` } : undefined}
        className={`w-full max-w-lg bg-[#0e0e0e] border border-neutral-800 sm:rounded-2xl rounded-t-2xl h-[75vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200 ${
          hasDraggedOnce && !draggingRef.current ? 'transition-transform' : ''
        }`}
      >
        {/* Drag handle */}
        <div
          onTouchStart={handleDragStart}
          onTouchMove={handleDragMove}
          onTouchEnd={handleDragEnd}
          className="pt-2.5 pb-1 flex justify-center cursor-grab active:cursor-grabbing shrink-0 touch-none"
        >
          <div className="w-10 h-1.5 rounded-full bg-neutral-700" />
        </div>

        {/* Header */}
        <div
          onTouchStart={handleDragStart}
          onTouchMove={handleDragMove}
          onTouchEnd={handleDragEnd}
          className="flex items-center justify-between px-4 pb-3 border-b border-neutral-800 shrink-0"
        >
          <h3 className="text-sm font-bold text-white tracking-tight">
            {title} {!loading && !error && <span className="text-xs text-gray-400 font-normal">({users.length})</span>}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-neutral-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-14 flex flex-col items-center justify-center gap-2 text-zinc-500">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-xs">Loading...</span>
            </div>
          ) : error ? (
            <div className="py-14 text-center text-xs text-zinc-500 px-6">{error}</div>
          ) : users.length === 0 ? (
            <div className="py-14 text-center text-xs text-zinc-500 px-6">No one yet.</div>
          ) : (
            users.map((u) => (
              <button
                key={u.id}
                onClick={() => onNavigateToUser?.(u)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-left transition-colors cursor-pointer"
              >
                <img
                  src={u.avatar || '/noob-logo.svg.jpeg'}
                  alt={u.username}
                  className="w-11 h-11 rounded-full object-cover border border-zinc-800 shrink-0"
                  referrerPolicy="no-referrer"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-white truncate">{u.displayName || u.username}</span>
                    {u.isVerified && <VerifiedBadge size="xs" />}
                  </div>
                  <span className="text-[11px] text-zinc-500 truncate block">@{u.username}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
