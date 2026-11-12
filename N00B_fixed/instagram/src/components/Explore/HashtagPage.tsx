import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Play, Heart, Hash, RefreshCw } from 'lucide-react';
import type { Post, Reel } from '../../types';
import { fetchPostsByHashtag, fetchReelsByHashtag, fetchHashtagCounts } from '../../services/api';
import type { HashtagSort } from '../../services/supabaseApi';
import { PostThumbnailMedia } from '../Common/PostThumbnailMedia';
import { LazyVideo } from '../Common/LazyVideo';
import { normalizeTag } from '../../utils/hashtags';
import { onCaptionEdited } from '../../utils/captionEvents';
import './hashtag.css';

// The page of one #hashtag: every post and reel that carries it (that this person may see), newest first or most liked first. Opens as a full-screen layer from anywhere
// a #tag is tapped (captions, comments, bios) or from the link ?tag=<tag>; tapping a tile opens the post / reel exactly like the Explore tiles do.
const PAGE = 60;

interface Props {
  tag: string;
  onBack: () => void;
  onOpenPost: (post: Post) => void;
  onOpenReel: (reel: Reel) => void;
}

export const HashtagPage: React.FC<Props> = ({ tag, onBack, onOpenPost, onOpenReel }) => {
  const t = normalizeTag(tag);
  const [sort, setSort] = useState<HashtagSort>('new');
  const [posts, setPosts] = useState<Post[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [counts, setCounts] = useState<{ posts: number; reels: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [more, setMore] = useState({ posts: false, reels: false });
  const run = useRef(0);

  const load = useCallback(async () => {
    const my = ++run.current;
    setLoading(true);
    setError('');
    try {
      const [p, r, c] = await Promise.all([fetchPostsByHashtag(t, sort, 0, PAGE), fetchReelsByHashtag(t, sort, 0, PAGE), fetchHashtagCounts(t).catch(() => null)]);
      if (my !== run.current) return;
      setPosts(p);
      setReels(r);
      setCounts(c);
      setMore({ posts: p.length >= PAGE, reels: r.length >= PAGE });
    } catch (e) {
      if (my !== run.current) return;
      setError(e instanceof Error && e.message ? e.message : 'This page could not be loaded.');
    } finally {
      if (my === run.current) setLoading(false);
    }
  }, [t, sort]);

  useEffect(() => { void load(); }, [load]);
  // a caption edited while this page is open: the text of the tiles changes at once (a tile that lost the tag goes on the next load)
  useEffect(() => onCaptionEdited((d) => {
    setPosts((prev) => prev.map((p) => (p.id === d.id && d.kind === 'post' ? { ...p, caption: d.caption, hashtags: d.hashtags } : p)));
    setReels((prev) => prev.map((r) => (r.id === d.id && d.kind === 'reel' ? { ...r, caption: d.caption, hashtags: d.hashtags } : r)));
  }), []);

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const [p, r] = await Promise.all([
        more.posts ? fetchPostsByHashtag(t, sort, posts.length, PAGE) : Promise.resolve([] as Post[]),
        more.reels ? fetchReelsByHashtag(t, sort, reels.length, PAGE) : Promise.resolve([] as Reel[])
      ]);
      setPosts((prev) => [...prev, ...p.filter((x) => !prev.some((y) => y.id === x.id))]);
      setReels((prev) => [...prev, ...r.filter((x) => !prev.some((y) => y.id === x.id))]);
      setMore({ posts: more.posts && p.length >= PAGE, reels: more.reels && r.length >= PAGE });
    } catch {
      /* the button stays; the person can tap it again */
    } finally {
      setLoadingMore(false);
    }
  };

  const total = counts ? counts.posts + counts.reels : posts.length + reels.length;
  const shown = posts.length + reels.length;
  const countText = loading && !counts ? 'Loading...' : `${total.toLocaleString()} ${total === 1 ? 'post' : 'posts'}${counts && counts.reels > 0 ? ` (incl. ${counts.reels.toLocaleString()} ${counts.reels === 1 ? 'reel' : 'reels'})` : ''}`;

  return (
    <div className="fixed inset-0 edge-own ht-root flex flex-col" data-testid="hashtag-page" data-tag={t}>
      <header className="ht-head shrink-0" style={{ paddingTop: 'calc(var(--sat, 0px) + 12px)' }}>
        <div className="flex items-center gap-2 px-3 pb-3">
          <button type="button" onClick={onBack} aria-label="Back" className="ht-back" data-testid="hashtag-back"><ArrowLeft className="w-5 h-5" /></button>
          <div className="min-w-0 flex-1">
            <h1 className="ht-title truncate" data-testid="hashtag-title">#{t}</h1>
            <p className="ht-sub" data-testid="hashtag-count">{countText}</p>
          </div>
        </div>
        <div className="ht-tabs px-3 pb-2.5" role="tablist" aria-label="Order">
          <button type="button" role="tab" aria-selected={sort === 'new'} className="ht-chip" data-on={sort === 'new' ? '1' : undefined} onClick={() => setSort('new')} data-testid="hashtag-sort-new">Newest</button>
          <button type="button" role="tab" aria-selected={sort === 'top'} className="ht-chip" data-on={sort === 'top' ? '1' : undefined} onClick={() => setSort('top')} data-testid="hashtag-sort-top">Most liked</button>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
        {loading ? (
          <div className="ht-grid" data-testid="hashtag-skeleton">
            {Array.from({ length: 12 }).map((_, i) => <div key={i} className="ht-tile ht-skel" />)}
          </div>
        ) : error ? (
          <div className="ht-empty" data-testid="hashtag-error">
            <p className="ht-empty-title">This page did not load</p>
            <p className="ht-empty-text">{error}</p>
            <button type="button" className="ht-btn" onClick={() => void load()}><RefreshCw className="w-4 h-4" /> Try again</button>
          </div>
        ) : shown === 0 ? (
          <div className="ht-empty" data-testid="hashtag-empty">
            <Hash className="w-10 h-10 mb-2 opacity-60" />
            <p className="ht-empty-title">Nothing with #{t} yet</p>
            <p className="ht-empty-text">Posts and reels you are allowed to see will show here as soon as someone uses this hashtag.</p>
          </div>
        ) : (
          <>
            <div className="ht-grid">
              {posts.map((post) => (
                <button type="button" key={'p' + post.id} className="ht-tile" onClick={() => onOpenPost(post)} aria-label={`Open post by @${post.username}`} data-testid="hashtag-post">
                  {post.slides?.[0]?.mediaUrl ? (
                    <PostThumbnailMedia src={post.slides[0].mediaUrl} filter={post.slides[0].filter} mediaType={post.slides[0].mediaType} alt={post.caption} className="w-full h-full object-cover" />
                  ) : (
                    <span className="ht-text-tile">{(post.caption || '').slice(0, 90)}</span>
                  )}
                  <span className="ht-likes"><Heart className="w-3 h-3 fill-white" /> {Intl.NumberFormat('en', { notation: 'compact' }).format(post.likesCount || 0)}</span>
                </button>
              ))}
              {reels.map((reel) => (
                <button type="button" key={'r' + reel.id} className="ht-tile" onClick={() => onOpenReel(reel)} aria-label={`Open reel by @${reel.username}`} data-testid="hashtag-reel">
                  {reel.thumbnailUrl ? (
                    <img loading="lazy" decoding="async" src={reel.thumbnailUrl} alt={reel.caption} className="w-full h-full object-cover" />
                  ) : (
                    <LazyVideo src={reel.videoUrl} muted playsInline className="w-full h-full object-cover" />
                  )}
                  <span className="ht-likes"><Play className="w-3 h-3 fill-white" /> {Intl.NumberFormat('en', { notation: 'compact' }).format(reel.viewsCount || 0)}</span>
                </button>
              ))}
            </div>
            {(more.posts || more.reels) && (
              <div className="flex justify-center py-4">
                <button type="button" className="ht-btn" onClick={() => void loadMore()} disabled={loadingMore} data-testid="hashtag-more">{loadingMore ? 'Loading...' : 'Show more'}</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
