import React, { useEffect, useRef, useState } from 'react';
import { Heart, MessageCircle, Eye, Lock, Loader2, RotateCcw, BadgeCheck } from 'lucide-react';
import { fetchPublicItem, recordPublicView, type PublicItem, type PublicResult } from '../../services/publicContent';
import type { ContentRoute } from '../../utils/routes';
import { formatNoobPoints } from '../../utils/formatPoints';
import { formatRelativeTime } from '../../utils/formatTime';

// A post, reel, video or profile of a public account, opened from a link by someone with NO account (like Instagram's links): they can look, play the video and swipe the pictures;
// everything that needs an account (like, comment, follow, more) asks them to log in or sign up first, and after they do the same thing opens inside the app.
interface Props {
  route: ContentRoute;
  /** log in or sign up: the page closes and the sign-in page opens (the address is kept, so the same thing opens inside the app afterwards) */
  onLogin: () => void;
}

const LABEL: Record<ContentRoute['kind'], string> = { post: 'post', reel: 'reel', video: 'video', profile: 'profile' };

export const PublicContentPage: React.FC<Props> = ({ route, onLogin }) => {
  const [result, setResult] = useState<PublicResult | null>(null);
  const [views, setViews] = useState<number | null>(null);
  const counted = useRef(false);
  const load = () => {
    setResult(null);
    void fetchPublicItem(route).then(setResult);
  };
  useEffect(() => { counted.current = false; load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [route.kind, route.id]);

  const item = result?.status === 'ok' ? result.item : null;
  useEffect(() => {
    if (!item) return;
    const prev = document.title;
    document.title = item.kind === 'profile' ? `${item.displayName || item.username} (@${item.username}) on NOOB` : `@${item.username} on NOOB`;
    return () => { document.title = prev; };
  }, [item]);

  const onPlay = () => {
    if (!item || counted.current || (item.kind !== 'reel' && item.kind !== 'video')) return;
    counted.current = true;
    void recordPublicView(item.kind, item.id).then((n) => { if (typeof n === 'number') setViews(n); });
  };

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-black text-white media-dark" data-testid="public-page" data-kind={route.kind}>
      <header className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-zinc-800">
        <div className="max-w-md mx-auto h-14 px-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 no-underline text-white">
            <img src="/noob-logo-circle.png" alt="" className="w-8 h-8 rounded-[24%]" />
            <span className="font-black tracking-tight">NOOB</span>
          </a>
          <div className="flex items-center gap-2">
            <button onClick={onLogin} className="px-4 py-1.5 rounded-full border border-zinc-600 text-xs font-bold cursor-pointer" data-testid="public-login">Log in</button>
            <button onClick={onLogin} className="px-4 py-1.5 rounded-full bg-white text-black text-xs font-black cursor-pointer" data-testid="public-signup">Sign up</button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto pb-32">
        {result === null && (
          <div className="py-24 flex flex-col items-center gap-3 text-zinc-400" data-testid="public-loading"><Loader2 className="w-7 h-7 animate-spin" /><p className="text-xs">Opening…</p></div>
        )}

        {result?.status === 'error' && (
          <div className="py-20 px-6 text-center space-y-4" data-testid="public-error">
            <p className="text-base font-bold">Could not open this {LABEL[route.kind]}</p>
            <p className="text-xs text-zinc-400">Check your connection and try again.</p>
            <button onClick={load} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-white text-black text-xs font-black cursor-pointer"><RotateCcw className="w-3.5 h-3.5" /> Try again</button>
          </div>
        )}

        {result?.status === 'missing' && (
          <div className="py-20 px-6 text-center space-y-4" data-testid="public-missing">
            <Lock className="w-9 h-9 mx-auto text-zinc-500" />
            <p className="text-base font-bold">This {LABEL[route.kind]} is not available</p>
            <p className="text-xs text-zinc-400 leading-relaxed">It may have been removed, or it belongs to a private account. If you have an account, log in to see what you are allowed to see.</p>
            <button onClick={onLogin} className="px-6 py-2.5 rounded-full bg-white text-black text-xs font-black cursor-pointer">Log in</button>
          </div>
        )}

        {item && item.kind === 'profile' && <ProfileBody item={item} onLogin={onLogin} />}
        {item && item.kind !== 'profile' && <ContentBody item={item} views={views ?? item.viewsCount ?? null} onPlay={onPlay} onLogin={onLogin} />}
      </main>

      {item && (
        <footer className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black via-black/95 to-transparent pt-6 pb-[max(1rem,env(safe-area-inset-bottom))] px-4">
          <div className="max-w-md mx-auto">
            <button onClick={onLogin} className="w-full py-3 rounded-full bg-white text-black text-sm font-black cursor-pointer" data-testid="public-cta">
              {item.kind === 'profile' ? `Log in to follow @${item.username}` : `Log in to like, comment and follow @${item.username}`}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
};

const Author: React.FC<{ item: PublicItem; onLogin: () => void }> = ({ item, onLogin }) => (
  <button onClick={onLogin} className="flex items-center gap-2.5 min-w-0 cursor-pointer text-left">
    <img src={item.userAvatar} alt="" className="w-9 h-9 rounded-full object-cover border border-zinc-800 shrink-0" referrerPolicy="no-referrer" />
    <span className="min-w-0">
      <span className="flex items-center gap-1 text-sm font-bold truncate" translate="no">@{item.username}{item.isVerified && <BadgeCheck className="w-4 h-4 text-sky-400 shrink-0" />}</span>
      {item.createdAt && <span className="block text-[11px] text-zinc-500">{formatRelativeTime(item.createdAt)}</span>}
    </span>
  </button>
);

const Counts: React.FC<{ item: PublicItem; views: number | null; onLogin: () => void }> = ({ item, views, onLogin }) => (
  <div className="flex items-center gap-5 text-sm text-zinc-300">
    <button onClick={onLogin} className="flex items-center gap-1.5 cursor-pointer" aria-label="Like (log in first)" data-testid="public-like"><Heart className="w-5 h-5" />{item.isLikeCountHidden ? '' : formatNoobPoints(item.likesCount || 0)}</button>
    <button onClick={onLogin} className="flex items-center gap-1.5 cursor-pointer" aria-label="Comment (log in first)" data-testid="public-comment"><MessageCircle className="w-5 h-5" />{formatNoobPoints(item.commentsCount || 0)}</button>
    {views !== null && <span className="flex items-center gap-1.5 text-zinc-400" data-testid="public-views"><Eye className="w-5 h-5" />{formatNoobPoints(views)}</span>}
  </div>
);

const ContentBody: React.FC<{ item: PublicItem; views: number | null; onPlay: () => void; onLogin: () => void }> = ({ item, views, onPlay, onLogin }) => {
  const [slide, setSlide] = useState(0);
  const slides = item.slides || [];
  const text = item.kind === 'video' ? [item.title, item.description].filter(Boolean).join('\n') : item.caption;
  return (
    <article className="pt-3 space-y-3" data-testid="public-content">
      <div className="px-4"><Author item={item} onLogin={onLogin} /></div>

      {(item.kind === 'reel' || item.kind === 'video') && (
        <div className={`bg-black ${item.kind === 'reel' ? 'aspect-[9/16] max-h-[72vh] mx-auto' : 'aspect-video'} w-full`}>
          <video
            src={item.videoUrl}
            poster={item.thumbnailUrl}
            controls
            playsInline
            preload="metadata"
            loop={item.kind === 'reel'}
            onPlay={onPlay}
            className="w-full h-full object-contain bg-black"
            data-testid="public-video"
          />
        </div>
      )}

      {item.kind === 'post' && slides.length > 0 && (
        <div className="relative">
          <div
            className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
            onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
            data-testid="public-slides"
          >
            {slides.map((s, i) => (
              <div key={i} className="snap-center shrink-0 w-full bg-black flex items-center justify-center">
                {s.mediaType === 'video'
                  ? <video src={s.mediaUrl} controls playsInline preload="metadata" className="w-full max-h-[75vh] object-contain" />
                  : <img src={s.mediaUrl} alt={s.caption || ''} loading={i === 0 ? 'eager' : 'lazy'} className="w-full max-h-[75vh] object-contain" referrerPolicy="no-referrer" />}
              </div>
            ))}
          </div>
          {slides.length > 1 && (
            <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1.5 pointer-events-none">
              {slides.map((_, i) => <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === slide ? 'bg-white' : 'bg-white/40'}`} />)}
            </div>
          )}
        </div>
      )}

      <div className="px-4 space-y-2.5">
        <Counts item={item} views={item.kind === 'post' ? null : views} onLogin={onLogin} />
        {text && <p className="text-sm leading-relaxed whitespace-pre-line break-words" data-testid="public-caption">{text}</p>}
        {item.kind === 'post' && item.createdAt && <p className="text-[11px] text-zinc-500">{formatRelativeTime(item.createdAt)}</p>}
        <button onClick={onLogin} className="text-xs text-zinc-400 underline cursor-pointer">{item.commentsCount ? `Log in to read ${item.commentsCount.toLocaleString()} comment${item.commentsCount === 1 ? '' : 's'}` : 'Log in to comment'}</button>
      </div>
    </article>
  );
};

const ProfileBody: React.FC<{ item: PublicItem; onLogin: () => void }> = ({ item, onLogin }) => (
  <section className="pt-6 space-y-5" data-testid="public-profile">
    <div className="px-4 flex items-center gap-4">
      <img src={item.userAvatar} alt="" className="w-20 h-20 rounded-full object-cover border border-zinc-800 shrink-0" referrerPolicy="no-referrer" />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-black flex items-center gap-1 truncate" translate="no">{item.displayName || item.username}{item.isVerified && <BadgeCheck className="w-5 h-5 text-sky-400 shrink-0" />}</p>
        <p className="text-xs text-zinc-400" translate="no">@{item.username}</p>
        <div className="flex gap-4 mt-2 text-xs text-zinc-300">
          <span><b className="text-white">{formatNoobPoints(item.postsCount || 0)}</b> posts</span>
          <span><b className="text-white">{formatNoobPoints(item.followersCount || 0)}</b> followers</span>
          <span><b className="text-white">{formatNoobPoints(item.followingCount || 0)}</b> following</span>
        </div>
      </div>
    </div>
    {item.bio && <p className="px-4 text-sm leading-relaxed whitespace-pre-line break-words">{item.bio}</p>}
    <div className="px-4"><button onClick={onLogin} className="w-full py-2.5 rounded-xl bg-white text-black text-sm font-black cursor-pointer" data-testid="public-follow">Follow</button></div>
    {item.isPrivate ? (
      <div className="py-12 px-6 text-center border-t border-zinc-800 space-y-2" data-testid="public-private">
        <Lock className="w-8 h-8 mx-auto text-zinc-500" />
        <p className="text-sm font-bold">This account is private</p>
        <p className="text-xs text-zinc-400">Log in and follow @{item.username} to see their posts.</p>
      </div>
    ) : (item.posts || []).length === 0 ? (
      <p className="py-12 text-center text-xs text-zinc-500 border-t border-zinc-800">No posts yet.</p>
    ) : (
      <div className="grid grid-cols-3 gap-0.5 border-t border-zinc-800 pt-0.5" data-testid="public-grid">
        {(item.posts || []).map((p) => (
          <button key={p.id} onClick={onLogin} className="relative aspect-square bg-zinc-900 cursor-pointer overflow-hidden" aria-label="Open post (log in first)">
            {p.mediaType === 'video' ? <video src={p.mediaUrl} muted playsInline preload="metadata" className="w-full h-full object-cover" /> : <img src={p.mediaUrl} alt="" loading="lazy" className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
          </button>
        ))}
      </div>
    )}
  </section>
);
