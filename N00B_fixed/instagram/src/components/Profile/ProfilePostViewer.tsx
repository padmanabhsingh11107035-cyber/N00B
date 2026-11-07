import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Post, User } from '../../types';
import { PostCard } from '../Feed/PostCard';
import { CommentsSheet } from '../Feed/CommentsSheet';
import { FeedVideoWatchView } from '../Feed/FeedVideoWatchView';
import { applyLikes, useLikeLedgerVersion } from '../../utils/likeLedger';

export interface PostActions {
  onToggleLike: (postId: string) => void;
  onToggleSave: (postId: string) => void;
  onToggleArchive: (postId: string) => void;
  onToggleComments: (postId: string) => void;
  onToggleLikeCount: (postId: string) => void;
  onDeletePost: (postId: string) => void;
  onDeleteSlide?: (postId: string, slideId: string) => void;
}

interface Props extends PostActions {
  title: string;
  posts: Post[];
  /** the app's own up-to-date copy of every post: the viewer always shows these, so a like, a save or a comment shows at once */
  livePosts?: Post[];
  startId: string;
  currentUser: User;
  allUsers: User[];
  onClose: () => void;
  onNavigateToProfile?: (user: User, isUpdate?: boolean) => void;
  onToggleFollowUser?: React.ComponentProps<typeof PostCard>['onToggleFollowUser'];
}

// A person's posts as one scrolling page, opened exactly on the post that was tapped in the profile grid. It lives on top of the profile (nothing about the page underneath
// changes, and Back returns to the same grid), so it never jumps to Explore or the Home feed and always starts on the right post.
export const ProfilePostViewer: React.FC<Props> = ({ title, posts: snapshot, livePosts, startId, currentUser, allUsers, onClose, onNavigateToProfile, onToggleFollowUser, ...actions }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const likeVersion = useLikeLedgerVersion();
  // the list as it was when the person tapped, but every post taken from the app's live copy (then passed through the likes memory), never the old snapshot
  const posts = useMemo(() => {
    const live = new Map((livePosts ?? []).map((p) => [p.id, p] as const));
    return applyLikes(snapshot.map((p) => live.get(p.id) ?? p), 'post');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, livePosts, likeVersion]);
  const [commentsFor, setCommentsFor] = useState<Post | null>(null);
  const [watchPost, setWatchPost] = useState<Post | null>(null);

  // Take the tapped post to the top and keep it there while pictures above it finish loading; stops the moment the person scrolls or touches the page.
  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    let stopped = false;
    const align = () => {
      if (stopped) return;
      const el = box.querySelector<HTMLElement>(`[data-viewer-post="${startId}"]`);
      if (!el) return;
      const target = Math.max(0, el.offsetTop - 4);
      if (Math.abs(box.scrollTop - target) > 1) box.scrollTop = target;
    };
    const stop = () => { stopped = true; };
    align();
    const timers = [60, 200, 450, 900, 1600].map((ms) => window.setTimeout(align, ms));
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(align) : null;
    ro?.observe(box);
    Array.from(box.children).forEach((c) => ro?.observe(c as Element));
    const end = window.setTimeout(() => { stopped = true; ro?.disconnect(); }, 2500);
    box.addEventListener('touchstart', stop, { passive: true });
    box.addEventListener('wheel', stop, { passive: true });
    box.addEventListener('mousedown', stop);
    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
      clearTimeout(end);
      ro?.disconnect();
      box.removeEventListener('touchstart', stop);
      box.removeEventListener('wheel', stop);
      box.removeEventListener('mousedown', stop);
    };
  }, [startId]);

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col" data-testid="profile-post-viewer">
      <div className="shrink-0 flex items-center gap-3 px-3 py-3 border-b border-zinc-900 bg-black">
        <button onClick={onClose} aria-label="Back" className="p-2 -ml-1 rounded-full hover:bg-zinc-900 text-white cursor-pointer"><ArrowLeft className="w-5 h-5" /></button>
        <h2 className="text-sm font-bold text-white truncate">{title}</h2>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-xl mx-auto w-full space-y-4 px-0 sm:px-4 py-3 pb-24">
          {posts.map((post) => (
            <div key={post.id} data-viewer-post={post.id}>
              <PostCard
                post={post}
                currentUser={currentUser}
                onOpenComments={(p) => setCommentsFor(p)}
                onNavigateToProfile={onNavigateToProfile}
                allUsers={allUsers}
                onToggleFollowUser={onToggleFollowUser}
                onOpenVideoWatch={(p) => setWatchPost(p)}
                {...actions}
              />
            </div>
          ))}
        </div>
      </div>
      {commentsFor && <CommentsSheet post={commentsFor} currentUser={currentUser} onClose={() => setCommentsFor(null)} onNavigateToProfile={onNavigateToProfile} />}
      {watchPost && <FeedVideoWatchView post={watchPost} currentUser={currentUser} onClose={() => setWatchPost(null)} onNavigateToProfile={onNavigateToProfile} />}
    </div>
  );
};
