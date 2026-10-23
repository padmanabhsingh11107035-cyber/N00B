import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { useDevicePrefs, shouldAutoplayVideo } from '../../utils/devicePrefs';
import { installPostKeys, POST_SLIDE_EVENT, NavDirection } from '../../utils/keyboardNav';
import { can, isMainAdmin } from '../../adminAccess';
import { usePinnedFeedItems, toggleFeedPin } from '../../services/pinnedFeed';
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  MoreHorizontal,
  MapPin,
  Sparkles,
  ExternalLink,
  Volume2,
  Tag,
  ShieldCheck,
  Archive,
  Pin,
  MessageSquareOff,
  EyeOff,
  Trash2,
  Link2,
  VolumeX,
  Music,
  Maximize2
} from 'lucide-react';
import { Post, PostSlide, User } from '../../types';
import confetti from 'canvas-confetti';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import { FullscreenAvatarModal } from '../Common/FullscreenAvatarModal';
import { LikesViewsSheet } from '../Common/LikesViewsSheet';
import { SharePostSheet } from '../Common/SharePostSheet';
import { safeExternalUrl } from '../../utils/safeUrl';
import { contentUrl } from '../../utils/routes';
import { fetchPostLikers, fetchPostViewers, recordPostView, fetchUserById } from '../../services/api';
import { likeCountHiddenFor, useSetting } from '../../services/settingsApi';
import { formatExactDateTime } from '../../utils/formatTime';
import { LikeReactionBurst } from '../Common/LikeReactionBurst';
import { AvatarMedia } from '../Common/AvatarMedia';
import { reactionEmojiForCategory } from '../../utils/categoryReaction';
import { useScreenshotAlert } from '../../utils/useScreenshotAlert';
import { lookStyle, lookRatio, lookAlt } from '../../utils/slideLook';
import { reportSongVisibility, forgetSong, holdSongs, toggleFeedSound, subscribeFeedSong, getFeedSongView } from '../../utils/songSound';

interface ToggleFollowResult {
  success: boolean;
  isFollowing: boolean;
  isFollowRequested?: boolean;
}

interface PostCardProps {
  post: Post;
  currentUser: User;
  onToggleLike: (postId: string) => void;
  onToggleSave: (postId: string) => void;
  onOpenComments: (post: Post) => void;
  onToggleArchive: (postId: string) => void;
  onToggleComments: (postId: string) => void;
  onToggleLikeCount: (postId: string) => void;
  onDeletePost: (postId: string) => void;
  onDeleteSlide?: (postId: string, slideId: string) => void;
  onHideAd?: (postId: string) => void;
  onSelectCategory?: (category: string) => void;
  onNavigateToProfile?: (user: User, isUpdate?: boolean) => void;
  // Every account, used to open a co-author whose id was never stored (only their @handle).
  allUsers?: User[];
  onToggleFollowUser?: (userId: string) => Promise<ToggleFollowResult | void>;
  onOpenVideoWatch?: (post: Post) => void;
}

export const PostCard: React.FC<PostCardProps> = ({
  post,
  currentUser,
  onToggleLike,
  onToggleSave,
  onOpenComments,
  onToggleArchive,
  onToggleComments,
  onToggleLikeCount,
  onDeletePost,
  onDeleteSlide,
  onHideAd,
  onToggleFollowUser,
  onSelectCategory,
  onNavigateToProfile,
  allUsers = [],
  onOpenVideoWatch
}) => {
  const devicePrefs = useDevicePrefs();
  const videoMayAutoplay = shouldAutoplayVideo(devicePrefs);   // Settings > Media quality: Wi-Fi only / never / data saver
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showDoubleTapHeart, setShowDoubleTapHeart] = useState(false);
  const [likeBurstKey, setLikeBurstKey] = useState(0);
  const reactionEmoji = reactionEmojiForCategory(post.category);
  const [isCaptionExpanded, setIsCaptionExpanded] = useState(false);
  const [showFullscreenAvatar, setShowFullscreenAvatar] = useState(false);
  const [showLikesSheet, setShowLikesSheet] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);

  const copyPostLink = async () => {
    const shareUrl = contentUrl('post', post.id);
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand('copy');
      } catch {}
      document.body.removeChild(textarea);
    }
    setShareLinkCopied(true);
    setTimeout(() => setShareLinkCopied(false), 2000);
  };

  const isOwner = post.userId === currentUser.id || post.username === currentUser.username;
  const hideOthersCounts = useSetting('likes.hideOthers');
  const likeCountHidden = likeCountHiddenFor(post.isLikeCountHidden, post.userId, currentUser.id, hideOthersCounts);
  // may remove other people's content: the main admin, or an admin who was given the "moderate content" permission
  const isMasterAdmin = can(currentUser, 'moderate_content');
  const pinnedPosts = usePinnedFeedItems();
  const hasSlides = post.slides && post.slides.length > 0 && post.slides[0]?.mediaUrl;
  const currentSlide = hasSlides ? (post.slides[currentSlideIndex] || post.slides[0]) : null;
  // only the picture shown and its two neighbours are drawn (they are what a finger drags in); the rest are not in the page at all
  const shownIndex = hasSlides ? Math.min(currentSlideIndex, post.slides.length - 1) : 0;
  const slideWindow = hasSlides
    ? [shownIndex - 1, shownIndex, shownIndex + 1].filter((i) => i >= 0 && i < post.slides.length).map((i) => ({ slide: post.slides[i], idx: i }))
    : [];
  const [showTagPill, setShowTagPill] = useState(false);
  // The song attached to this post plays by itself, with sound, while the post is on screen (see src/utils/songSound.ts), like Instagram.
  // The speaker button (and the song tag under the picture) turns song sound off and on.
  const songUrl = post.audioTrack?.audioUrl || '';
  const feedSong = useSyncExternalStore(subscribeFeedSong, getFeedSongView, getFeedSongView);
  const songActive = !!songUrl && feedSong.activeId === post.id;
  const songHeard = songActive && feedSong.soundOn && !feedSong.blocked;
  const songNeedsTap = songActive && feedSong.soundOn && feedSong.blocked;
  const speakerOn = feedSong.soundOn && !songNeedsTap;
  // somebody turned the volume of the post's own video up: the song steps aside
  const [videoUnmuted, setVideoUnmuted] = useState(false);
  useEffect(() => (videoUnmuted && songUrl ? holdSongs() : undefined), [videoUnmuted, songUrl]);

  // The whole picture, never a hard crop — like Instagram's feed: the box takes the shape of whatever was uploaded, only nudged
  // toward its 4:5 (portrait) / 1.91:1 (landscape) limits when a picture is more extreme than that. 4:5 while the real shape isn't
  // known yet (page load, or a slide not opened before) keeps the very first paint identical to before, so there is no layout jump
  // for the common case; it only widens/narrows once the picture's own shape is read off it.
  const [slideAspect, setSlideAspect] = useState<number | null>(null);
  const slideImgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    setSlideAspect(null);
    const img = slideImgRef.current;
    if (img && img.complete && img.naturalWidth && img.naturalHeight) setSlideAspect(img.naturalWidth / img.naturalHeight);
  }, [currentSlide?.mediaUrl]);
  const MIN_ASPECT = 4 / 5; // Instagram's tallest allowed portrait
  const MAX_ASPECT = 1.91; // Instagram's widest allowed landscape
  // a shape chosen when the post was made (1:1, 4:5, 16:9) wins over the picture's own shape
  const chosenRatio = currentSlide ? lookRatio(currentSlide.filter) : null;
  const boxAspect = chosenRatio ?? Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, slideAspect ?? MIN_ASPECT));

  const primaryTaggedUser = post.taggedUsers && post.taggedUsers.length > 0 
    ? post.taggedUsers[0] 
    : post.collabUsername 
    ? {
        username: post.collabUsername,
        displayName: post.collabUserDisplayName || post.collabUsername,
        avatar: post.collabUserAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'
      }
    : null;

  // Deleting a slide out from under whichever one is currently being viewed
  // (e.g. the admin removes the last slide in the carousel) would otherwise
  // leave the index pointing past the new, shorter array.
  useEffect(() => {
    if (post.slides && currentSlideIndex >= post.slides.length) {
      setCurrentSlideIndex(Math.max(0, post.slides.length - 1));
    }
  }, [post.slides, currentSlideIndex]);

  // Record a view once this post has genuinely scrolled into view (not
  // merely been fetched as part of the feed list) — matches the same
  // "actually seen it" trigger reels/stories already use, via
  // IntersectionObserver rather than a click, since a feed post has no
  // separate "opened" moment. Fires at most once per mount.
  const articleRef = useRef<HTMLElement>(null);
  const hasRecordedViewRef = useRef(false);
  useEffect(() => {
    if (isOwner) return; // no point recording your own view of your own post
    const el = articleRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (hasRecordedViewRef.current) return;
        if (entries[0]?.isIntersecting) {
          hasRecordedViewRef.current = true;
          recordPostView(post.id).catch(() => {});
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  // Separate, non-disconnecting observer just for "is this post the one on
  // screen right now" — unlike the view-recording one above (which fires
  // once and stops), a feed can have many posts mounted at once and we need
  // to know, continuously, which single one a PrintScreen press was
  // plausibly "about".
  const [isInView, setIsInView] = useState(false);
  useEffect(() => {
    const el = articleRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => setIsInView(!!entries[0]?.isIntersecting),
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [post.id]);
  useScreenshotAlert('post', post.id, isInView && !isOwner);

  // Tell the song player how much of this post fills the screen: the post that fills it most plays its song, and none plays when none does.
  useEffect(() => {
    const el = articleRef.current;
    if (!songUrl || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const e = entries[entries.length - 1];
        const room = Math.min(e.boundingClientRect.height, e.rootBounds?.height || window.innerHeight) || 1;
        reportSongVisibility(post.id, songUrl, e.intersectionRect.height / room);
      },
      { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      forgetSong(post.id);
    };
  }, [post.id, songUrl]);

  // Only the current slide's <img> is ever mounted, so switching slides used
  // to mean a fresh network fetch on every arrow click, with the old image
  // stuck on screen until it landed — feeling "stuck"/slow on anything but a
  // fast connection. Warming the browser's image cache for every slide once
  // the post is actually scrolled into view means later clicks just paint an
  // already-loaded image instantly — gated on isInView so a feed with several
  // posts mounted at once doesn't fire every off-screen post's full set of
  // slide fetches on load, competing with and delaying the one image actually
  // on screen.
  useEffect(() => {
    if (!isInView || !post.slides || post.slides.length <= 1) return;
    post.slides.forEach((slide) => {
      if (slide.mediaUrl && slide.mediaType !== 'video') {
        const img = new Image();
        img.src = slide.mediaUrl;
      }
    });
  }, [post.slides, isInView]);

  const handleDoubleTap = () => {
    if (!post.isLiked) {
      onToggleLike(post.id);
      setLikeBurstKey((k) => k + 1);
    }
    setShowDoubleTapHeart(true);
    confetti({ particleCount: 25, spread: 50, origin: { y: 0.6 } });
    setTimeout(() => {
      setShowDoubleTapHeart(false);
    }, 850);
  };

  // Swipe through the carousel with the finger: the pictures sit side by side on a track that moves WITH the finger, so the next (or
  // previous) picture is already there, sliding in, while the finger drags — like Instagram. Letting go far enough (or with a flick)
  // slides on to it; letting go early slides back. The drag is kept in refs and written straight to the track's style, so nothing re-renders
  // until a slide is chosen. The axis locks at the first 8 px: sideways claims the gesture (and stops it reaching FeedView's pull-to-refresh),
  // up / down is left to the page's own scrolling (the box says touch-action: pan-y).
  const SLIDE_MS = 260;
  const boxRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const slideBusyRef = useRef(false);
  const slideTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(slideTimerRef.current), []);
  const dragRef = useRef<{ startX: number; startY: number; lastX: number; lastT: number; speed: number; width: number; horizontal: boolean | null } | null>(null);

  const moveTrack = (px: number, ms: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = ms ? `transform ${ms}ms cubic-bezier(0.22, 0.8, 0.3, 1)` : 'none';
    track.style.transform = `translate3d(${px}px, 0, 0)`;
  };
  // Slide on to the next (1) or the previous (-1) picture, from wherever the track is now.
  const slideBy = (dir: 1 | -1) => {
    if (slideBusyRef.current) return;
    const count = post.slides?.length || 0;
    const target = currentSlideIndex + dir;
    if (target < 0 || target >= count) { moveTrack(0, 200); return; }
    const width = boxRef.current?.clientWidth || 0;
    if (!width) { setCurrentSlideIndex(target); return; }
    slideBusyRef.current = true;
    moveTrack(-dir * width, SLIDE_MS);
    window.clearTimeout(slideTimerRef.current);
    slideTimerRef.current = window.setTimeout(() => {
      // the new picture takes the middle and the track goes back to rest in the same moment, so nothing flashes
      flushSync(() => setCurrentSlideIndex(target));
      moveTrack(0, 0);
      slideBusyRef.current = false;
    }, SLIDE_MS + 20);
  };
  const slideByRef = useRef(slideBy);
  slideByRef.current = slideBy;

  const handleCarouselTouchStart = (e: React.TouchEvent) => {
    if (slideBusyRef.current) { dragRef.current = null; return; }
    const t = e.touches[0];
    dragRef.current = { startX: t.clientX, startY: t.clientY, lastX: t.clientX, lastT: performance.now(), speed: 0, width: boxRef.current?.clientWidth || 1, horizontal: null };
  };
  const handleCarouselTouchMove = (e: React.TouchEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const x = e.touches[0].clientX;
    const dx = x - d.startX;
    const dy = e.touches[0].clientY - d.startY;
    if (d.horizontal === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      d.horizontal = Math.abs(dx) > Math.abs(dy);
    }
    if (!d.horizontal) return;
    e.stopPropagation();
    const now = performance.now();
    if (now > d.lastT) d.speed = (x - d.lastX) / (now - d.lastT);   // px per ms, the latest movement
    d.lastX = x;
    d.lastT = now;
    const last = (post.slides?.length || 1) - 1;
    const nothingThere = (dx > 0 && currentSlideIndex === 0) || (dx < 0 && currentSlideIndex === last);
    moveTrack(nothingThere ? dx * 0.25 : dx, 0);   // before the first / after the last picture the page only gives a little
  };
  const handleCarouselTouchEnd = (e: React.TouchEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || !d.horizontal) return;
    const dx = e.changedTouches[0].clientX - d.startX;
    const speed = performance.now() - d.lastT > 80 ? 0 : d.speed;   // a finger that rested before lifting is not a flick
    const far = Math.abs(dx) > d.width * 0.22 || (Math.abs(speed) > 0.45 && Math.sign(speed) === Math.sign(dx));
    if (far) slideBy(dx < 0 ? 1 : -1);
    else moveTrack(0, 200);
  };
  const handleCarouselTouchCancel = () => {
    if (dragRef.current?.horizontal) moveTrack(0, 200);
    dragRef.current = null;
  };

  // On a computer: A / D (or ← / →) move through the photos of the post in the middle of the screen, like a swipe
  // (W / S jump between posts — see utils/keyboardNav.ts).
  const slideCount = post.slides?.length || 0;
  useEffect(() => {
    installPostKeys();
    const el = articleRef.current;
    if (!el || slideCount < 2) return;
    const onSlide = (e: Event) => {
      const dir = (e as CustomEvent<NavDirection>).detail;
      if (dir === 'right') slideByRef.current(1);
      else if (dir === 'left') slideByRef.current(-1);
    };
    el.addEventListener(POST_SLIDE_EVENT, onSlide);
    return () => el.removeEventListener(POST_SLIDE_EVENT, onSlide);
  }, [slideCount]);

  // Tap the author's name or @handle (on a post or its comments) -> their real, full profile.
  // It opens AT ONCE with what the app already knows about that person (the list of users it loaded), and the newest details are fetched quietly and swapped in; only a
  // person that is not in that list is waited for.
  const goToProfile = async (userId: string) => {
    if (!onNavigateToProfile || !userId) return;
    const known = allUsers.find((u) => u.id === userId);
    if (known) {
      onNavigateToProfile(known);
      void fetchUserById(userId).then((fresh) => { if (fresh) onNavigateToProfile(fresh, true); }).catch(() => undefined);
      return;
    }
    const user = await fetchUserById(userId);
    if (user) onNavigateToProfile(user);
  };
  // Same for a tagged / co-author account: older posts only stored its @handle, newer ones also its id.
  const goToTagged = (tagged: { userId?: string; username: string }) => {
    if (tagged.userId) { void goToProfile(tagged.userId); return; }
    const match = allUsers.find((u) => u.username?.toLowerCase() === tagged.username.toLowerCase());
    if (match) void goToProfile(match.id);
  };

  // One picture of the carousel: the picture or video, and the text / sticker / mention layers that belong to it.
  const renderSlide = (slide: PostSlide, isCur: boolean) => {
    const look = lookStyle(slide.filter);
    return (
      <>
        {slide.mediaType === 'video' ? (
          isCur ? (
            <video
              key="live"
              src={slide.mediaUrl}
              className="w-full h-full object-cover"
              style={look}
              controls
              loop
              muted
              playsInline
              preload="metadata"
              autoPlay={isInView && videoMayAutoplay}
              onPlay={(e) => setVideoUnmuted(!e.currentTarget.muted)}
              onPause={() => setVideoUnmuted(false)}
              onVolumeChange={(e) => setVideoUnmuted(!e.currentTarget.muted && !e.currentTarget.paused)}
              onLoadedMetadata={(e) => {
                const video = e.currentTarget;
                if (video.videoWidth && video.videoHeight) setSlideAspect(video.videoWidth / video.videoHeight);
              }}
            />
          ) : (
            <video key="peek" src={slide.mediaUrl} className="w-full h-full object-cover" style={look} muted playsInline preload="metadata" />
          )
        ) : (
          <img
            ref={isCur ? slideImgRef : undefined}
            src={slide.mediaUrl}
            alt={lookAlt(slide.filter) || slide.caption || post.caption}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.01]"
            style={look}
            referrerPolicy="no-referrer"
            loading={isCur ? 'lazy' : 'eager'}
            decoding="async"
            onLoad={(e) => {
              const img = e.currentTarget;
              if (isCur && img.naturalWidth && img.naturalHeight) setSlideAspect(img.naturalWidth / img.naturalHeight);
            }}
          />
        )}

        {/* Text / sticker / mention / hashtag / link layers placed in the Post creator — same
            declarative shape as Story.stickers, same EditableStickerLayer engine to create them. */}
        {slide.stickers?.map((sticker, idx) => {
          const layerStyle: React.CSSProperties = {
            top: `${sticker.y}%`,
            left: `${sticker.x}%`,
            width: sticker.width ? `${sticker.width}%` : undefined,
            transform: `translate(-50%, -50%) rotate(${sticker.rotation || 0}deg)`
          };
          if (sticker.type === 'text') {
            return (
              <div key={idx} className="absolute z-20 pointer-events-none" style={layerStyle}>
                <p
                  className="font-extrabold text-center whitespace-pre-wrap break-words"
                  style={{ color: sticker.data?.color, fontSize: `${(sticker.width || 55) * 0.12}cqw`, textShadow: '0 2px 6px rgba(0,0,0,0.6), 0 0 2px rgba(0,0,0,0.85)' }}
                >
                  {sticker.data?.text}
                </p>
              </div>
            );
          }
          if (sticker.type === 'sticker') {
            const w = sticker.width || (sticker.data?.kind === 'emoji' ? 26 : 42);
            return (
              <div key={idx} className="absolute z-20 pointer-events-none" style={layerStyle}>
                {sticker.data?.kind === 'emoji' ? (
                  <span className="block text-center leading-none" style={{ fontSize: `${w * 0.22}cqw` }}>{sticker.data?.content}</span>
                ) : (
                  <img src={sticker.data?.content} alt="" className="w-full h-auto rounded-lg" />
                )}
              </div>
            );
          }
          if (sticker.type === 'mention') {
            return (
              <div key={idx} className="absolute z-20 pointer-events-auto" style={layerStyle}>
                <div className="w-full flex items-center justify-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); goToProfile(sticker.data?.userId); }}
                    className="inline-flex items-center gap-1.5 bg-black/80 backdrop-blur-md border border-[#3B82F6]/50 rounded-full pl-1 pr-3 py-1 shadow-lg whitespace-nowrap cursor-pointer"
                    style={{ fontSize: `${(sticker.width || 42) * 0.1}cqw` }}
                  >
                    <img src={sticker.data?.avatar} alt="" className="rounded-full object-cover shrink-0" style={{ width: '1.8em', height: '1.8em' }} referrerPolicy="no-referrer" />
                    <span className="font-semibold text-white" style={{ fontSize: '1em' }}>@{sticker.data?.username}</span>
                  </button>
                </div>
              </div>
            );
          }
          if (sticker.type === 'hashtag') {
            return (
              <div key={idx} className="absolute z-20 pointer-events-auto" style={layerStyle}>
                <div className="w-full flex items-center justify-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); onSelectCategory && onSelectCategory(sticker.data?.tag); }}
                    className="inline-flex items-center gap-1 bg-black/80 backdrop-blur-md border border-noob/40 rounded-full px-3 py-1.5 shadow-lg whitespace-nowrap cursor-pointer"
                    style={{ fontSize: `${(sticker.width || 40) * 0.1}cqw` }}
                  >
                    <span className="font-semibold text-noob" style={{ fontSize: '1em' }}>#{sticker.data?.tag}</span>
                  </button>
                </div>
              </div>
            );
          }
          if (sticker.type === 'link') {
            return (
              <div key={idx} className="absolute z-20 pointer-events-auto" style={layerStyle}>
                <div className="w-full flex items-center justify-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); window.open(sticker.data?.url, '_blank', 'noopener,noreferrer'); }}
                    className="inline-flex items-center gap-1.5 bg-white text-black rounded-full px-3 py-1.5 shadow-lg whitespace-nowrap cursor-pointer"
                    style={{ fontSize: `${(sticker.width || 46) * 0.09}cqw` }}
                  >
                    <Link2 className="shrink-0" style={{ width: '1.1em', height: '1.1em' }} />
                    <span className="font-bold" style={{ fontSize: '1em' }}>{sticker.data?.label}</span>
                  </button>
                </div>
              </div>
            );
          }
          return null;
        })}
      </>
    );
  };

  // Text Background styling for text-only thoughts
  const getTextBgClass = (bgStyle?: string) => {
    switch (bgStyle) {
      case 'emerald':
        return 'bg-gradient-to-br from-emerald-950 via-zinc-950 to-green-900/40 border-emerald-500/30 text-emerald-100';
      case 'cyber':
        return 'bg-gradient-to-br from-purple-950 via-zinc-950 to-cyan-950 border-cyan-500/30 text-cyan-100';
      case 'flame':
        return 'bg-gradient-to-br from-rose-950 via-zinc-950 to-amber-950 border-rose-500/30 text-rose-100';
      case 'slate':
        return 'bg-zinc-900 border-zinc-700 text-zinc-100';
      default:
        return 'bg-zinc-950/80 border-white/10 text-white';
    }
  };

  return (
    <article
      ref={articleRef}
      data-post-card=""
      id={`post-card-${post.id}`}
      className="w-full bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden mb-4 shadow-xl transition-all"
    >
      {/* 1. Post Header (Dual Overlapping Avatars for Tagged / Collab Posts - Instagram Style) */}
      <header className="flex items-center justify-between px-3.5 py-3 border-b border-white/5">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Dual Overlapping Avatars Container */}
          <div className="relative flex items-center shrink-0">
            <div
              onClick={() => setShowFullscreenAvatar(true)}
              className="w-9 h-9 rounded-full p-[1.5px] bg-gradient-to-tr from-green-500 via-blue-500 to-purple-500 cursor-pointer hover:scale-105 transition-transform"
              title="View full-size avatar"
            >
              <AvatarMedia
                src={post.userAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                isLiveAvatar={post.authorIsLiveAvatar}
                liveAvatarVideoUrl={post.authorLiveAvatarVideoUrl}
                alt={post.username}
                className="w-full h-full rounded-full object-cover"
              />
            </div>

            {/* Tagged / Collaborator Secondary Overlapping Avatar */}
            {primaryTaggedUser && (
              <div
                className="relative -ml-3 mt-2 w-6 h-6 rounded-full ring-2 ring-black bg-zinc-800 overflow-hidden shadow-md cursor-pointer hover:scale-110 transition-transform"
                title={`Tagged: @${primaryTaggedUser.username}`}
              >
                <img
                  src={primaryTaggedUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                  alt={primaryTaggedUser.username}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                onClick={() => goToProfile(post.userId)}
                className="min-w-0 text-xs font-bold text-white tracking-tight underline decoration-1 underline-offset-[3px] decoration-zinc-50/70 cursor-pointer break-words [overflow-wrap:anywhere]"
              >
                {post.displayName || post.username}
              </span>
              {post.isVerified && <VerifiedBadge size="sm" />}

              {/* Instagram-style joint author line */}
              {primaryTaggedUser && (
                <>
                  <span className="text-[11px] text-zinc-400 font-medium">and</span>
                  <span onClick={() => goToTagged(primaryTaggedUser)} className="text-xs font-bold text-noob flex items-center gap-1 underline decoration-1 underline-offset-[3px] decoration-zinc-50/70 cursor-pointer">
                    @{primaryTaggedUser.username}
                  </span>
                </>
              )}
            </div>

            {/* the @username is shown once, in front of the caption under the picture - here only the place and the category (if any) go under the name */}
            {(post.location || post.category) && (
              <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                {post.location && (
                  <div className="flex items-center gap-1">
                    <MapPin className="w-2.5 h-2.5 text-noob" />
                    <span className="truncate max-w-[150px]">{post.location}</span>
                  </div>
                )}

                {post.category && (
                  <>
                    {post.location && <span>•</span>}
                    <span className="capitalize text-zinc-300 font-semibold">{post.category}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Options Menu Toggle */}
        <div className="relative shrink-0 ml-2">
          <button
            id={`post-options-btn-${post.id}`}
            onClick={() => setShowOptionsMenu(!showOptionsMenu)}
            className="p-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Post options"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>

          {showOptionsMenu && (
            <div className="absolute right-0 top-8 z-40 w-52 bg-zinc-950/95 border border-white/10 rounded-2xl py-1.5 shadow-2xl backdrop-blur-xl">
              {post.isSponsored && onHideAd && (
                <button
                  onClick={() => {
                    onHideAd(post.id);
                    setShowOptionsMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-yellow-400 hover:bg-zinc-800 flex items-center gap-2 cursor-pointer"
                >
                  <EyeOff className="w-4 h-4" /> Hide Advertisement
                </button>
              )}
              <button
                onClick={() => {
                  setShowLikesSheet(true);
                  setShowOptionsMenu(false);
                }}
                className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800 flex items-center gap-2 cursor-pointer"
              >
                <Heart className="w-4 h-4 text-red-400" /> Likes{isOwner ? ' & Views' : ''}
              </button>
              {isOwner && (
                <>
                  <button
                    onClick={() => {
                      onToggleArchive(post.id);
                      setShowOptionsMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800 flex items-center gap-2 cursor-pointer"
                  >
                    <Archive className="w-4 h-4 text-noob" /> {post.isArchived ? 'Unarchive Post' : 'Archive Post'}
                  </button>
                  <button
                    onClick={() => {
                      onToggleComments(post.id);
                      setShowOptionsMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800 flex items-center gap-2 cursor-pointer"
                  >
                    <MessageSquareOff className="w-4 h-4 text-purple-400" /> {post.isCommentsDisabled ? 'Turn On Comments' : 'Turn Off Comments'}
                  </button>
                  <button
                    onClick={() => {
                      onToggleLikeCount(post.id);
                      setShowOptionsMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800 flex items-center gap-2 cursor-pointer"
                  >
                    <EyeOff className="w-4 h-4 text-cyan-400" /> {post.isLikeCountHidden ? 'Unhide Like Count' : 'Hide Like Count'}
                  </button>
                </>
              )}
              {isMainAdmin(currentUser) && (
                <button
                  onClick={async () => {
                    setShowOptionsMenu(false);
                    const res = await toggleFeedPin('post', post.id);
                    if (!res.success) alert(res.error || 'Could not change the pin.');
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800 flex items-center gap-2 cursor-pointer"
                >
                  <Pin className="w-4 h-4 text-noob" /> {pinnedPosts.some((p) => p.kind === 'post' && p.itemId === post.id) ? 'Unpin from Feed' : 'Pin to Feed'}
                </button>
              )}
              {(isOwner || isMasterAdmin) && (
                <button
                  onClick={() => {
                    onDeletePost(post.id);
                    setShowOptionsMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-zinc-800 flex items-center gap-2 border-t border-zinc-800 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" /> Delete Post
                </button>
              )}
              <button
                onClick={() => {
                  copyPostLink();
                  setShowOptionsMenu(false);
                }}
                className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800 flex items-center gap-2 cursor-pointer"
              >
                <Tag className="w-4 h-4 text-blue-400" /> Copy Link
              </button>
            </div>
          )}
        </div>
      </header>

      {/* 2. Post Media Container OR Rich Text Thought Card */}
      {hasSlides && currentSlide ? (
        <div
          ref={boxRef}
          className="relative w-full bg-black flex items-center justify-center overflow-hidden cursor-pointer select-none group"
          style={{ aspectRatio: boxAspect, containerType: 'inline-size', touchAction: 'pan-y' }}
          onDoubleClick={handleDoubleTap}
          onTouchStart={post.slides && post.slides.length > 1 ? handleCarouselTouchStart : undefined}
          onTouchMove={post.slides && post.slides.length > 1 ? handleCarouselTouchMove : undefined}
          onTouchEnd={post.slides && post.slides.length > 1 ? handleCarouselTouchEnd : undefined}
          onTouchCancel={post.slides && post.slides.length > 1 ? handleCarouselTouchCancel : undefined}
        >
          {/* The pictures side by side on a track that follows the finger: this one in the middle, the one before and the one after beside it */}
          <div ref={trackRef} className="absolute inset-0 will-change-transform">
            {slideWindow.map(({ slide, idx }) => (
              <div key={slide.id} className="absolute inset-0 overflow-hidden" style={{ transform: `translate3d(${(idx - shownIndex) * 100}%, 0, 0)` }}>
                {renderSlide(slide, idx === shownIndex)}
              </div>
            ))}
          </div>

          {/* The attached song: a speaker button on the picture (like Instagram) and, if the phone wants a tap first, a "Tap for sound" hint. */}
          {songUrl && (
            <button
              type="button"
              data-testid="post-sound-button"
              onClick={(e) => { e.stopPropagation(); toggleFeedSound(); }}
              onDoubleClick={(e) => e.stopPropagation()}
              title={speakerOn ? 'Sound on' : 'Sound off'}
              aria-label={speakerOn ? 'Turn sound off' : 'Turn sound on'}
              className="absolute bottom-3 left-3 z-20 p-2 rounded-full bg-black/70 hover:bg-black text-white backdrop-blur-md border border-white/10 transition-colors cursor-pointer"
            >
              {speakerOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          )}
          {songNeedsTap && (
            <div data-testid="post-tap-for-sound" className="absolute bottom-3 left-14 z-20 pointer-events-none px-2.5 py-1 rounded-full bg-black/70 text-white text-[10px] font-bold backdrop-blur-md border border-white/10">
              Tap for sound
            </div>
          )}

          {/* Opens the full YouTube-style watch page (like/dislike/comments/share/save/playlist/
              download/up next) — the inline player above still works exactly as before; this is an
              explicit, separate affordance so it never conflicts with double-tap-to-like. */}
          {currentSlide.mediaType === 'video' && onOpenVideoWatch && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenVideoWatch(post);
              }}
              title="Open full video"
              className="absolute bottom-3 right-3 z-20 p-2 rounded-full bg-black/70 hover:bg-black text-white backdrop-blur-md border border-white/10 transition-colors cursor-pointer"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}

          {/* Double-tap animated heart pop */}
          {showDoubleTapHeart && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 animate-ping">
              <Heart className="w-24 h-24 text-red-500 fill-red-500 drop-shadow-2xl" />
            </div>
          )}

          {/* Tagged-people floating indicator, bottom-left. A slide can carry up to 68 point-tagged
              people (currentSlide.taggedUsers, set from PostCreationModal's Tag People tool) — when
              present, this stacked-avatar button replaces the older single-collaborator pill below,
              which only ever supported one person and stays as the fallback for older posts. */}
          {currentSlide?.taggedUsers && currentSlide.taggedUsers.length > 0 ? (
            <div className="absolute bottom-3 left-3 z-20">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTagPill(!showTagPill);
                }}
                className="flex items-center bg-black/70 hover:bg-black/90 backdrop-blur-md rounded-full pl-1 pr-2 py-1 border border-white/20 shadow-lg transition-transform hover:scale-105"
              >
                <div className="flex items-center -space-x-2">
                  {currentSlide.taggedUsers.slice(0, 3).map((t) => (
                    <img
                      key={t.userId}
                      src={t.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                      alt={t.username}
                      className="w-5 h-5 rounded-full object-cover ring-2 ring-black"
                      referrerPolicy="no-referrer"
                    />
                  ))}
                  {currentSlide.taggedUsers.length > 3 && (
                    <span className="w-5 h-5 rounded-full bg-neutral-800 ring-2 ring-black flex items-center justify-center text-[8px] font-bold text-white">
                      +{currentSlide.taggedUsers.length - 3}
                    </span>
                  )}
                </div>
                <Tag className="w-3 h-3 text-noob ml-1.5" />
              </button>

              {showTagPill && (
                <div className="absolute bottom-9 left-0 bg-black/95 text-white p-2 rounded-xl border border-noob/50 shadow-2xl backdrop-blur-xl min-w-[160px] max-h-48 overflow-y-auto space-y-1.5 animate-in zoom-in-90 duration-150">
                  {currentSlide.taggedUsers.map((t) => (
                    <div key={t.userId} onClick={() => goToTagged(t)} className="flex items-center gap-2 cursor-pointer hover:underline">
                      <img
                        src={t.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                        alt={t.username}
                        className="w-6 h-6 rounded-full object-cover ring-1 ring-noob"
                        referrerPolicy="no-referrer"
                      />
                      <span className="text-[11px] font-bold truncate">{t.displayName || t.username}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : primaryTaggedUser && (
            <div className="absolute bottom-3 left-3 z-20">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTagPill(!showTagPill);
                }}
                className="px-2.5 py-1 rounded-full bg-black/80 hover:bg-black text-white text-[10px] font-bold backdrop-blur-md border border-white/20 flex items-center gap-1.5 shadow-lg transition-transform hover:scale-105"
              >
                <Tag className="w-3 h-3 text-noob" />
                <span>@{primaryTaggedUser.username}</span>
              </button>

              {/* Tag popover bubble */}
              {showTagPill && (
                <div onClick={() => goToTagged(primaryTaggedUser)} className="cursor-pointer absolute bottom-9 left-0 bg-black/95 text-white p-2 rounded-xl border border-noob/50 shadow-2xl backdrop-blur-xl flex items-center gap-2 min-w-[140px] animate-in zoom-in-90 duration-150">
                  <img
                    src={primaryTaggedUser.avatar}
                    alt={primaryTaggedUser.username}
                    className="w-6 h-6 rounded-full object-cover ring-1 ring-noob"
                  />
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold block truncate">
                      {primaryTaggedUser.displayName || primaryTaggedUser.username}
                    </span>
                    <span className="text-[9px] text-noob block">Tagged Profile</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Carousel Multi-slide indicator (if > 1 slide) — swipe and the dots below move between
              slides; there are deliberately no tap arrows here any more. */}
          {post.slides && post.slides.length > 1 && (
            <>
              {/* Slide Index Badge (e.g. 1/3) */}
              <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md border border-white/10 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white z-20">
                {currentSlideIndex + 1}/{post.slides.length}
              </div>

              {/* Remove just this picture/video from the carousel — owner or
                  the NOOB admin account only, and only while there's more
                  than one slide left (removing the last one should be
                  "delete the whole post" instead). */}
              {(isOwner || isMasterAdmin) && onDeleteSlide && currentSlide && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSlide(post.id, currentSlide.id);
                  }}
                  title="Remove this picture/video"
                  className="absolute top-11 right-3 p-1.5 rounded-full bg-black/70 hover:bg-red-600 text-white backdrop-blur-md z-20 transition-colors border border-white/10 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}

          {/* Product / LiDAR Tag Indicator */}
          {currentSlide.productTags && currentSlide.productTags.length > 0 && (
            <div className="absolute bottom-3 right-3 bg-black/80 backdrop-blur-md border border-green-500/40 rounded-xl px-2.5 py-1 text-[10px] text-noob flex items-center gap-1.5 shadow-lg">
              <Tag className="w-3 h-3" />
              <span>{currentSlide.productTags[0].name} ({currentSlide.productTags[0].price})</span>
            </div>
          )}

          {/* AI Creator Label */}
          {post.hasAiLabel && (
            <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md border border-purple-500/40 rounded-full px-2.5 py-0.5 text-[10px] text-purple-300 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-purple-400" /> AI Enhanced
            </div>
          )}
        </div>
      ) : (
        /* Text Thought Post Canvas */
        <div
          className={`p-6 sm:p-8 min-h-[160px] flex flex-col justify-center border-y select-none relative ${getTextBgClass(
            post.textBgStyle
          )}`}
          onDoubleClick={handleDoubleTap}
        >
          <p translate="no" className="text-base sm:text-lg font-medium leading-relaxed whitespace-pre-line break-words">
            {post.caption}
          </p>

          {primaryTaggedUser && (
            <div className="mt-4 pt-3 border-t border-white/10 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-zinc-400">Co-authored with:</span>
              <div onClick={() => goToTagged(primaryTaggedUser)} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-xs font-bold text-noob cursor-pointer hover:underline">
                <img
                  src={primaryTaggedUser.avatar}
                  alt={primaryTaggedUser.username}
                  className="w-4 h-4 rounded-full object-cover"
                />
                <span>@{primaryTaggedUser.username}</span>
              </div>
            </div>
          )}

          {showDoubleTapHeart && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 animate-ping">
              <Heart className="w-24 h-24 text-red-500 fill-red-500 drop-shadow-2xl" />
            </div>
          )}
        </div>
      )}

      {/* 3. Action Buttons & Carousel Dots */}
      <div className="px-3.5 pt-3 pb-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            {/* Like */}
            <button
              id={`like-btn-${post.id}`}
              onClick={() => {
                if (!post.isLiked) setLikeBurstKey((k) => k + 1);
                onToggleLike(post.id);
              }}
              className={`relative transition-transform active:scale-125 cursor-pointer ${
                post.isLiked ? 'text-red-500' : 'text-white hover:text-zinc-300'
              }`}
              title={post.isLiked ? 'Unlike' : 'Like'}
            >
              <Heart className={`w-6 h-6 ${post.isLiked ? 'fill-current stroke-red-500' : 'stroke-current'}`} />
              <LikeReactionBurst emoji={reactionEmoji} burstKey={likeBurstKey} />
            </button>

            {/* Comment */}
            {!post.isCommentsDisabled && (
              <button
                id={`comment-btn-${post.id}`}
                onClick={() => onOpenComments(post)}
                className="text-white hover:text-zinc-300 transition-colors cursor-pointer"
                title="View & Add Comments"
              >
                <MessageCircle className="w-6 h-6 stroke-current" />
              </button>
            )}

            {/* Share */}
            <button
              id={`share-btn-${post.id}`}
              onClick={() => setShowShareSheet(true)}
              className="text-white hover:text-zinc-300 transition-colors cursor-pointer"
              title="Share"
            >
              <Send className="w-5 h-5 stroke-current -rotate-12" />
            </button>
          </div>

          {/* Carousel Slide Dots */}
          {post.slides.length > 1 && (
            <div className="flex items-center gap-1">
              {post.slides.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-1.5 rounded-full transition-all duration-200 ${
                    idx === currentSlideIndex ? 'w-4 bg-noob' : 'w-1.5 bg-zinc-700'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Bookmark / Save */}
          <button
            id={`save-btn-${post.id}`}
            onClick={() => onToggleSave(post.id)}
            className={`transition-transform active:scale-125 cursor-pointer ${
              post.isSaved ? 'text-noob' : 'text-white hover:text-zinc-300'
            }`}
            title={post.isSaved ? 'Remove from Saved' : 'Save to Collection'}
          >
            <Bookmark className={`w-6 h-6 ${post.isSaved ? 'fill-current stroke-noob' : 'stroke-current'}`} />
          </button>
        </div>

        {/* Like Counts */}
        {!likeCountHidden && (
          <button
            onClick={() => setShowLikesSheet(true)}
            disabled={post.likesCount === 0}
            className="mt-2 text-xs font-bold text-white tracking-tight hover:underline disabled:hover:no-underline cursor-pointer disabled:cursor-default text-left"
          >
            {post.likesCount.toLocaleString()} {post.likesCount === 1 ? 'like' : 'likes'}
          </button>
        )}

        {/* Captions with Formatted Line Breaks */}
        <div className="mt-1.5 text-xs text-zinc-200">
          <span onClick={() => goToProfile(post.userId)} className="font-bold text-white mr-1.5 cursor-pointer underline decoration-1 underline-offset-[3px] decoration-zinc-50/70">
            {post.username}
          </span>
          <span translate="no" className={`whitespace-pre-line leading-relaxed ${!isCaptionExpanded ? 'line-clamp-2' : ''}`}>
            {post.caption || ''}
          </span>
          {(post.caption || '').length > 90 && (
            <button
              onClick={() => setIsCaptionExpanded(!isCaptionExpanded)}
              className="text-zinc-400 hover:text-white text-[11px] ml-1.5 cursor-pointer"
            >
              {isCaptionExpanded ? 'less' : 'more'}
            </button>
          )}
        </div>

        {/* Distinct Slide Caption (if present) */}
        {currentSlide?.caption && (
          <div className="mt-1 text-[11px] text-noob italic flex items-center gap-1">
            <span>↳ Slide note:</span> {currentSlide.caption}
          </div>
        )}

        {/* Hashtags */}
        {post.hashtags && post.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {post.hashtags.map((tag, idx) => (
              <span
                key={idx}
                onClick={() => onSelectCategory && onSelectCategory(tag.replace('#', ''))}
                className="text-[11px] text-noob/80 hover:text-noob hover:underline cursor-pointer"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Outbound Link for Meta-Verified Users */}
        {safeExternalUrl(post.webLink) && (
          <a
            href={safeExternalUrl(post.webLink) as string}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-noob hover:underline mt-1.5 font-medium"
          >
            <ExternalLink className="w-3 h-3" /> {post.webLink}
          </a>
        )}

        {/* Audio Track Tag */}
        {post.audioTrack && (
          <button
            type="button"
            data-testid="post-song-tag"
            onClick={(e) => { e.stopPropagation(); if (songUrl) toggleFeedSound(); }}
            className="flex items-center gap-1.5 text-[10px] text-zinc-400 mt-2 bg-zinc-900/80 hover:bg-zinc-800 rounded-full px-2.5 py-1 w-fit border border-white/5 cursor-pointer transition-colors"
          >
            {!songUrl ? <Music className="w-3 h-3 text-noob" /> : speakerOn ? <Volume2 className={`w-3 h-3 text-noob ${songHeard ? 'animate-pulse' : ''}`} /> : <VolumeX className="w-3 h-3 text-noob" />}
            <span className="truncate max-w-[220px]">
              {post.audioTrack.title}{post.audioTrack.artist ? ` · ${post.audioTrack.artist}` : ''}
            </span>
          </button>
        )}

        {/* Comments Preview Button */}
        {!post.isCommentsDisabled && (
          <button
            onClick={() => onOpenComments(post)}
            className="mt-2 text-xs text-zinc-400 hover:text-zinc-200 block text-left cursor-pointer"
          >
            {post.commentsCount > 0
              ? `View all ${post.commentsCount} ${post.commentsCount === 1 ? 'comment' : 'comments'}`
              : 'Add a comment...'}
          </button>
        )}

        {/* Timestamp — exact date/time, not a relative "2h ago" that goes
            stale the moment you stop looking at the screen. */}
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mt-1 pb-1 text-right">
          {formatExactDateTime(post.createdAt)}
        </div>
      </div>

      <FullscreenAvatarModal
        isOpen={showFullscreenAvatar}
        avatarUrl={post.userAvatar}
        username={post.username}
        displayName={post.displayName || post.username}
        isVerified={post.isVerified}
        onClose={() => setShowFullscreenAvatar(false)}
      />

      {showLikesSheet && (
        <LikesViewsSheet
          likes={{ label: 'Likes', fetchUsers: () => fetchPostLikers(post.id) }}
          views={isOwner ? { label: 'Views', fetchUsers: () => fetchPostViewers(post.id) } : undefined}
          ownerUsername={post.username}
          currentUserId={currentUser.id}
          onToggleFollowUser={onToggleFollowUser}
          onNavigateToUser={onNavigateToProfile}
          onClose={() => setShowLikesSheet(false)}
        />
      )}

      {showShareSheet && (
        <SharePostSheet type="post" currentUser={currentUser} itemId={post.id} ownerUsername={post.username} onClose={() => setShowShareSheet(false)} />
      )}
    </article>
  );
};
