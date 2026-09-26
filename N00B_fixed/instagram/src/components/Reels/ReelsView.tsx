import React, { useState, useRef, useEffect } from 'react';
import { can } from '../../adminAccess';
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  Music,
  ExternalLink,
  Sparkles,
  Globe,
  Check,
  Film,
  Eye,
  ArrowLeft,
  Trash2,
  MoreHorizontal,
  MessageSquareOff,
  EyeOff,
  CornerDownRight,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Reel, User } from '../../types';
import {
  toggleLikeReel,
  toggleSaveReel,
  recordReelView,
  fetchReelComments,
  addReelComment,
  fetchReelLikers,
  fetchReelViewers,
  deleteReel,
  fetchUserById,
  toggleCommentsReel,
  toggleLikeCountReel
} from '../../services/api';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import { LikesViewsSheet } from '../Common/LikesViewsSheet';
import { SharePostSheet } from '../Common/SharePostSheet';
import { SharePostToChatModal } from '../Common/SharePostToChatModal';
import confetti from 'canvas-confetti';
import { useScreenshotAlert } from '../../utils/useScreenshotAlert';

interface ToggleFollowResult {
  success: boolean;
  isFollowing: boolean;
  isFollowRequested?: boolean;
  followersCount: number;
  message?: string;
}

interface ReelsViewProps {
  reels: Reel[];
  currentUser: User;
  initialReelId?: string;
  onToggleFollowUser?: (userId: string) => Promise<ToggleFollowResult | void>;
  onGoBack?: () => void;
  onNavigateToProfile?: (user: User) => void;
}

// Fisher-Yates shuffle — used to randomize reel order and to reshuffle
// into a fresh order once a full pass finishes, so playback never repeats
// the same sequence back-to-back.
function shuffleReels<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export const ReelsView: React.FC<ReelsViewProps> = ({
  reels,
  currentUser,
  initialReelId,
  onToggleFollowUser,
  onGoBack,
  onNavigateToProfile
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isVideoBuffering, setIsVideoBuffering] = useState(true);
  const [videoFailed, setVideoFailed] = useState(false);
  const [showHeartAnim, setShowHeartAnim] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showReelOptionsMenu, setShowReelOptionsMenu] = useState(false);
  const [showLikesViewsSheet, setShowLikesViewsSheet] = useState(false);
  const [likesViewsInitialTab, setLikesViewsInitialTab] = useState<'likes' | 'views'>('likes');
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [showShareToChat, setShowShareToChat] = useState(false);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [aiVoiceTranslationActive, setAiVoiceTranslationActive] = useState(false);
  const [localReels, setLocalReels] = useState<Reel[]>(reels);
  const [reelComments, setReelComments] = useState<any[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  // Replying to a comment (yours or anyone's) — always resolves to the top-level comment's id, even
  // replying to a reply, since threads are flattened one level deep (matches the backend).
  const [replyingToComment, setReplyingToComment] = useState<{ topLevelId: string; username: string } | null>(null);
  const [expandedReplyThreads, setExpandedReplyThreads] = useState<string[]>([]);
  const [commentError, setCommentError] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const nextVideoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  // Tapping a creator's name/avatar needs their full profile, which the reel itself only carries a
  // denormalized sliver of (username, avatar) — fetching it only ON tap means a real network wait
  // before the profile even starts to open. Instead, the creator of the reel someone is CURRENTLY
  // watching (and the very next one, so a fast swiper is covered too) is looked up quietly in the
  // background the moment it's shown; by the time anyone actually taps, it's usually already in hand.
  const profileCacheRef = useRef<Map<string, User>>(new Map());
  // Set true only when the browser itself rejected unmuted autoplay (not
  // when the user deliberately tapped the volume icon) — lets the
  // first-interaction listener below know it's safe to switch sound back
  // on automatically, without ever overriding a real manual mute.
  const wasAutoMutedRef = useRef(false);

  useEffect(() => {
    if (initialReelId) {
      // Deep-linked reel (e.g. opened from a share or profile grid) plays
      // first, with the rest of the feed shuffled behind it.
      const target = reels.find((r) => r.id === initialReelId);
      const rest = reels.filter((r) => r.id !== initialReelId);
      setLocalReels(target ? [target, ...shuffleReels(rest)] : shuffleReels(reels));
    } else {
      setLocalReels(shuffleReels(reels));
    }
    setCurrentIndex(0);
  }, [reels, initialReelId]);

  const currentReel = localReels[currentIndex] || localReels[0];
  const nextReel = localReels[currentIndex + 1];
  const nextNextReel = localReels[currentIndex + 2];
  const isFollowingCreator = !!currentReel && !!currentUser.followingIds?.includes(currentReel.userId);
  const isReelOwner = !!currentReel && currentReel.userId === currentUser.id;
  useScreenshotAlert('reel', currentReel?.id, !!currentReel && !isReelOwner);
  // may remove other people's content: the main admin, or an admin who was given the "moderate content" permission
  const isMasterAdmin = can(currentUser, 'moderate_content');

  useEffect(() => {
    for (const r of [currentReel, nextReel]) {
      if (!r || profileCacheRef.current.has(r.userId)) continue;
      fetchUserById(r.userId)
        .then((user) => {
          if (user) profileCacheRef.current.set(r.userId, user);
        })
        .catch(() => undefined);
    }
  }, [currentReel, nextReel]);

  useEffect(() => {
    if (currentReel) {
      recordReelView(currentReel.id).catch(console.error);
    }
    // Always start a freshly-shown reel playing, matching TikTok/Reels-style
    // auto-advance — otherwise a reel paused via tap would carry that paused
    // state into the next one, which reads as "the next reel is stuck."
    setIsPlaying(true);
    // A brand new <video> element mounts for each reel (key={currentReel.id}),
    // so its buffering state must reset too — otherwise a spinner from the
    // previous reel could stay hidden/shown incorrectly for this one.
    setIsVideoBuffering(true);
    setVideoFailed(false);
    setShowReelOptionsMenu(false);
  }, [currentIndex, currentReel]);

  // A broken video (the file itself is missing/corrupt, not just slow) moves on by itself after a moment — long enough to actually
  // read the message, short enough that one bad upload doesn't strand anyone on it.
  useEffect(() => {
    if (!videoFailed) return;
    const t = setTimeout(() => handleNextReel(), 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoFailed]);

  // Actually drive the <video> element from isPlaying — previously this
  // state only existed for the pause icon overlay and never touched
  // playback, so tapping to pause did nothing.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.play().catch(() => {
        // Browsers block autoplay WITH SOUND until the page has had a real
        // user gesture — the very first reel someone sees can hit this
        // before they've tapped anything, and used to just sit there
        // frozen on a black frame forever (isPlaying said "true" but the
        // element never actually started). Retry muted, which every
        // browser allows unconditionally, so the reel always visibly
        // plays. Tracked as "auto-muted" (not a real user choice) so the
        // very next tap/key/touch anywhere can switch sound back on by
        // itself — reels should default to audio-on, not require someone
        // to find and tap the volume icon every time they open the page.
        if (!video.muted) {
          video.muted = true;
          wasAutoMutedRef.current = true;
          setIsMuted(true);
          video.play().catch(() => {});
        }
      });
    } else {
      video.pause();
    }
  }, [isPlaying, currentReel?.id]);

  // The moment the browser registers ANY real user gesture, it will allow
  // unmuted playback — so retry with sound on right then, instead of
  // leaving the reel silently muted until someone notices and taps the
  // volume icon themselves.
  useEffect(() => {
    const unlockAudio = () => {
      if (!wasAutoMutedRef.current) return;
      wasAutoMutedRef.current = false;
      setIsMuted(false);
      const video = videoRef.current;
      if (video) {
        video.muted = false;
        video.play().catch(() => {
          // Still blocked for some reason — fall back to muted again
          // rather than leaving playback stalled.
          wasAutoMutedRef.current = true;
          video.muted = true;
          setIsMuted(true);
        });
      }
    };
    const events: (keyof DocumentEventMap)[] = ['pointerdown', 'touchstart', 'keydown'];
    events.forEach((evt) => document.addEventListener(evt, unlockAudio));
    return () => {
      events.forEach((evt) => document.removeEventListener(evt, unlockAudio));
    };
  }, []);

  // Load real comments for the currently-open reel instead of showing
  // static placeholder text.
  useEffect(() => {
    if (!showComments || !currentReel) return;
    let cancelled = false;
    setIsLoadingComments(true);
    fetchReelComments(currentReel.id)
      .then((list) => {
        if (!cancelled) setReelComments(list);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingComments(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showComments, currentReel]);

  const handleToggleLike = async () => {
    if (!currentReel) return;
    try {
      const res = await toggleLikeReel(currentReel.id);
      setLocalReels(
        localReels.map((r) =>
          r.id === currentReel.id ? { ...r, isLiked: res.isLiked, likesCount: res.likesCount } : r
        )
      );
    } catch (err) {
      console.error(err);
    }
  };

  const goToProfile = async (userId: string) => {
    if (!onNavigateToProfile) return;
    const cached = profileCacheRef.current.get(userId);
    if (cached) {
      onNavigateToProfile(cached);
      return;
    }
    const user = await fetchUserById(userId);
    if (user) onNavigateToProfile(user);
  };

  const handleDoubleTap = () => {
    if (!currentReel.isLiked) {
      handleToggleLike();
    }
    setShowHeartAnim(true);
    confetti({ particleCount: 30, spread: 60, origin: { y: 0.6 } });
    setTimeout(() => setShowHeartAnim(false), 800);
  };

  // One tap pauses/plays; a second tap arriving quickly upgrades it to a like instead (Instagram/TikTok style) — never both. The first
  // tap's pause is deliberately held back for this short window so a real double-tap never also flashes a pause icon on its way to liking.
  const lastTapAtRef = useRef(0);
  const pendingTapRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const DOUBLE_TAP_MS = 280;
  const handleTap = () => {
    const now = Date.now();
    if (pendingTapRef.current && now - lastTapAtRef.current < DOUBLE_TAP_MS) {
      clearTimeout(pendingTapRef.current);
      pendingTapRef.current = null;
      lastTapAtRef.current = 0;
      handleDoubleTap();
      return;
    }
    lastTapAtRef.current = now;
    pendingTapRef.current = setTimeout(() => {
      pendingTapRef.current = null;
      setIsPlaying((p) => !p);
    }, DOUBLE_TAP_MS);
  };

  const handleToggleSave = async () => {
    if (!currentReel) return;
    try {
      const res = await toggleSaveReel(currentReel.id);
      setLocalReels(
        localReels.map((r) =>
          r.id === currentReel.id ? { ...r, isSaved: res.isSaved, savesCount: res.savesCount } : r
        )
      );
    } catch (err) {
      console.error(err);
    }
  };

  const copyReelLink = async () => {
    if (!currentReel) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?reel=${encodeURIComponent(currentReel.id)}`;
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

  const handleToggleFollowCreator = async () => {
    if (!currentReel || !onToggleFollowUser) return;
    try {
      await onToggleFollowUser(currentReel.userId);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePostComment = async () => {
    if (!currentReel || !commentInput.trim() || isPostingComment) return;
    setCommentError('');
    try {
      setIsPostingComment(true);
      const comment = await addReelComment(currentReel.id, commentInput.trim(), replyingToComment?.topLevelId);
      if (!comment) throw new Error('Could not post the comment.');
      setReelComments((prev) => [comment, ...prev]);
      setLocalReels(
        localReels.map((r) =>
          r.id === currentReel.id ? { ...r, commentsCount: (r.commentsCount || 0) + 1 } : r
        )
      );
      setCommentInput('');
      if (replyingToComment) {
        setExpandedReplyThreads((prev) => (prev.includes(replyingToComment.topLevelId) ? prev : [...prev, replyingToComment.topLevelId]));
      }
      setReplyingToComment(null);
    } catch (err) {
      console.error(err);
      setCommentError(err instanceof Error ? err.message : 'Could not post the comment. Please try again.');
    } finally {
      setIsPostingComment(false);
    }
  };

  const handleNextReel = () => {
    if (currentIndex < localReels.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Finished a full pass with no repeats — reshuffle into a fresh
      // order for the next pass instead of replaying the same sequence.
      setLocalReels((prev: Reel[]) => {
        const reshuffled = shuffleReels(prev);
        // Avoid the last reel of this pass landing right back at the front,
        // which would read as an immediate repeat across the pass boundary.
        if (reshuffled.length > 1 && reshuffled[0].id === prev[prev.length - 1].id) {
          [reshuffled[0], reshuffled[1]] = [reshuffled[1], reshuffled[0]];
        }
        return reshuffled;
      });
      setCurrentIndex(0);
    }
  };

  const handlePrevReel = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleToggleReelComments = async () => {
    if (!currentReel) return;
    try {
      const res = await toggleCommentsReel(currentReel.id);
      if ('isCommentsDisabled' in res) {
        setLocalReels((prev) => prev.map((r) => (r.id === currentReel.id ? { ...r, isCommentsDisabled: res.isCommentsDisabled } : r)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleReelLikeCount = async () => {
    if (!currentReel) return;
    try {
      const res = await toggleLikeCountReel(currentReel.id);
      if ('isLikeCountHidden' in res) {
        setLocalReels((prev) => prev.map((r) => (r.id === currentReel.id ? { ...r, isLikeCountHidden: res.isLikeCountHidden } : r)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteReel = async () => {
    if (!currentReel) return;
    const deletedId = currentReel.id;
    try {
      const success = await deleteReel(deletedId);
      if (!success) return;
      setLocalReels((prev) => prev.filter((r) => r.id !== deletedId));
      // Deleting shifts every later reel down one slot, so clamp the index
      // rather than leaving it pointing past the new (shorter) array end.
      setCurrentIndex((prev) => Math.min(prev, Math.max(0, localReels.length - 2)));
    } catch (err) {
      console.error('Failed to delete reel:', err);
    }
  };

  // Swipe (touch) / scroll (wheel) / arrow-key navigation between reels.
  const touchStartY = useRef<number | null>(null);
  const isNavLockedRef = useRef(false);
  const anyModalOpen = showComments || showReelOptionsMenu || showLikesViewsSheet;

  const navigateWithCooldown = (direction: 'next' | 'prev') => {
    if (isNavLockedRef.current) return;
    isNavLockedRef.current = true;
    if (direction === 'next') handleNextReel();
    else handlePrevReel();
    setTimeout(() => {
      isNavLockedRef.current = false;
    }, 400);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  // Without this, the browser's own native scroll/rubber-band-bounce runs
  // at the same time as the swipe gesture, so the page visibly drags and
  // wobbles with your finger before the touchend below decides whether to
  // snap to the next/prev reel — the "loose, moves when I swipe" feel.
  // Blocking every touchmove here means the ONLY way to move between
  // reels is the deliberate snap below, never a free-scrolling page.
  //
  // React registers onTouchMove as a passive listener (preventDefault
  // inside it is silently ignored, with a console warning), so this has
  // to be a real addEventListener with passive:false — the touch-action
  // CSS on the player is a second line of defense, but Android WebView
  // versions vary in how reliably they honor it alone.
  useEffect(() => {
    const el = playerRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (anyModalOpen) return;
      e.preventDefault();
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, [anyModalOpen]);

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (anyModalOpen || touchStartY.current === null) return;
    const deltaY = touchStartY.current - e.changedTouches[0].clientY;
    touchStartY.current = null;
    const SWIPE_THRESHOLD = 50;
    if (deltaY > SWIPE_THRESHOLD) navigateWithCooldown('next');
    else if (deltaY < -SWIPE_THRESHOLD) navigateWithCooldown('prev');
    else {
      // Not a swipe — a tap. Handled here directly (with the browser's own click
      // suppressed) rather than through onClick/onDoubleClick, which on a real
      // phone is an unreliable way to tell a single tap from a double one.
      e.preventDefault();
      handleTap();
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (anyModalOpen) return;
    if (e.deltaY > 20) navigateWithCooldown('next');
    else if (e.deltaY < -20) navigateWithCooldown('prev');
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (anyModalOpen) return;
      if (e.key === 'ArrowDown') navigateWithCooldown('next');
      else if (e.key === 'ArrowUp') navigateWithCooldown('prev');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyModalOpen, currentIndex, localReels]);

  if (!currentReel || localReels.length === 0) {
    return (
      <div className="fixed inset-0 z-30 bg-black flex flex-col items-center justify-center text-center px-4 pb-20">
        {onGoBack && (
          <button
            onClick={onGoBack}
            className="absolute top-3 left-3 p-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-white/80 hover:text-white"
            title="Go back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div className="w-16 h-16 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4 text-[#00FF66]">
          <Film className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-white mb-1">No Reels Yet</h3>
        <p className="text-xs text-zinc-400 max-w-xs leading-relaxed">
          Be the first to record and share a reel with the NOOB community!
        </p>
      </div>
    );
  }

  return (
    // `fixed inset-0` anchors to the true viewport regardless of where this
    // component happens to sit in the page's normal flow — a height like
    // `calc(100vh-80px)` on a normally-flowing element only avoids the
    // floating bottom nav if that element starts at y=0, which it doesn't
    // here, so it still overlapped the nav until this switched to `fixed`.
    <div className="fixed inset-0 z-30 bg-black flex items-center justify-center pb-20">
      <div
        id="reels-page-container"
        className="relative w-full h-full max-h-[860px] max-w-[440px] mx-auto bg-black sm:rounded-2xl overflow-hidden flex items-center justify-center select-none shadow-2xl border border-neutral-800"
      >
      {/* 1. Main Vertical Video Player */}
      <div
        ref={playerRef}
        className="relative w-full h-full flex items-center justify-center cursor-pointer touch-none overscroll-none"
        onClick={handleTap}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
      >
        <video
          key={currentReel.id}
          ref={videoRef}
          src={currentReel.videoUrl}
          poster={currentReel.thumbnailUrl}
          loop
          playsInline
          preload="auto"
          muted={isMuted}
          onError={(e) => {
            // A missing/corrupt file on our end, not a slow network — the buffering spinner would otherwise spin forever on a
            // frozen black frame, which reads as "the app is broken" rather than "this one video can't be played."
            console.warn('Video failed to load source:', e);
            setIsVideoBuffering(false);
            setVideoFailed(true);
          }}
          onWaiting={() => setIsVideoBuffering(true)}
          onPlaying={() => setIsVideoBuffering(false)}
          onCanPlay={() => setIsVideoBuffering(false)}
          className="w-full h-full object-cover"
        />

        {/* Buffering spinner — without this, a slow-loading video just looks
            frozen on a black frame, which reads as broken rather than loading. */}
        {isVideoBuffering && !videoFailed && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <div className="w-10 h-10 rounded-full border-[3px] border-white/20 border-t-white animate-spin" />
          </div>
        )}

        {/* A missing/broken video file — clearly says so instead of a frozen black frame, and moves on by itself so nobody gets stuck. */}
        {videoFailed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none z-20 text-center px-8">
            <Film className="w-8 h-8 text-zinc-500" />
            <p className="text-xs text-zinc-400">This video couldn't be loaded.</p>
          </div>
        )}

        {/* Hidden preload of the next TWO reels in the deck so swiping doesn't stall while the browser starts fetching/decoding cold —
            one reel of lookahead alone still stalls for anyone swiping faster than the current one finishes buffering. */}
        {nextReel && (
          <video
            key={`preload-${nextReel.id}`}
            ref={nextVideoRef}
            src={nextReel.videoUrl}
            muted
            playsInline
            preload="auto"
            className="absolute w-px h-px opacity-0 pointer-events-none"
            aria-hidden="true"
          />
        )}
        {nextNextReel && (
          <video
            key={`preload2-${nextNextReel.id}`}
            src={nextNextReel.videoUrl}
            muted
            playsInline
            preload="auto"
            className="absolute w-px h-px opacity-0 pointer-events-none"
            aria-hidden="true"
          />
        )}

        {/* Double-tap heart animation */}
        {showHeartAnim && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 animate-ping">
            <Heart className="w-24 h-24 text-red-500 fill-red-500 drop-shadow-2xl" />
          </div>
        )}

        {/* Paused-state indicator — tap feedback for the play/pause toggle */}
        {!isPlaying && !showHeartAnim && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
            <div className="p-5 rounded-full bg-black/40 backdrop-blur-sm">
              <div className="w-0 h-0 border-y-[14px] border-y-transparent border-l-[22px] border-l-white ml-1" />
            </div>
          </div>
        )}

        {/* Top Control Bar */}
        <div
          className="absolute top-3 inset-x-3 z-30 flex items-center justify-between pointer-events-auto"
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2">
            {onGoBack && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onGoBack();
                }}
                className="p-1.5 bg-black/60 rounded-full text-white/80 hover:text-white backdrop-blur-md"
                title="Go back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <span className="text-sm font-extrabold text-white tracking-tight drop-shadow-md">
              Reels
            </span>
            {currentReel.isTrialReel && (
              <span className="px-2 py-0.5 bg-yellow-500/80 text-black text-[10px] font-bold rounded-full">
                Trial Reel
              </span>
            )}
          </div>

          {(isReelOwner || isMasterAdmin) && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowReelOptionsMenu((v) => !v);
                }}
                className="p-1.5 bg-black/60 rounded-full text-white/80 hover:text-white backdrop-blur-md cursor-pointer"
                title="Reel options"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {showReelOptionsMenu && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-9 z-40 w-52 bg-zinc-950/95 border border-white/10 rounded-2xl py-1.5 shadow-2xl backdrop-blur-xl"
                >
                  <button
                    onClick={() => {
                      setShowReelOptionsMenu(false);
                      setLikesViewsInitialTab('likes');
                      setShowLikesViewsSheet(true);
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800 flex items-center gap-2 cursor-pointer"
                  >
                    <Heart className="w-4 h-4 text-red-400" /> Likes{isReelOwner ? ' & Views' : ''}
                  </button>
                  {isReelOwner && (
                    <>
                      <button
                        onClick={() => {
                          setShowReelOptionsMenu(false);
                          handleToggleReelComments();
                        }}
                        className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800 flex items-center gap-2 cursor-pointer"
                      >
                        <MessageSquareOff className="w-4 h-4 text-purple-400" /> {currentReel.isCommentsDisabled ? 'Turn On Comments' : 'Turn Off Comments'}
                      </button>
                      <button
                        onClick={() => {
                          setShowReelOptionsMenu(false);
                          handleToggleReelLikeCount();
                        }}
                        className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800 flex items-center gap-2 cursor-pointer"
                      >
                        <EyeOff className="w-4 h-4 text-cyan-400" /> {currentReel.isLikeCountHidden ? 'Unhide Like Count' : 'Hide Like Count'}
                      </button>
                    </>
                  )}
                  {(isReelOwner || isMasterAdmin) && (
                    <button
                      onClick={() => {
                        setShowReelOptionsMenu(false);
                        handleDeleteReel();
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-zinc-800 flex items-center gap-2 border-t border-zinc-800 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" /> Delete Reel
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Left Creator Overlay */}
        <div
          className="absolute bottom-6 left-3 right-16 z-20 space-y-2 pointer-events-auto text-left"
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {/* Creator Profile & Follow (with Instagram-style Dual Overlapping Avatars) */}
          <div className="flex items-center gap-2 flex-wrap">
            <div
              className="relative flex items-center cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                goToProfile(currentReel.userId);
              }}
            >
              <img
                src={currentReel.userAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                alt={currentReel.username}
                className="w-9 h-9 rounded-full object-cover ring-2 ring-[#00FF66]"
                referrerPolicy="no-referrer"
              />
              {(currentReel.isCollab || currentReel.collabUsername || (currentReel.taggedUsers && currentReel.taggedUsers.length > 0)) && (
                <div className="relative -ml-3 mt-2 w-6 h-6 rounded-full ring-2 ring-black bg-zinc-800 overflow-hidden shadow-md">
                  <img
                    src={currentReel.collabUserAvatar || currentReel.taggedUsers?.[0]?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                    alt={currentReel.collabUsername || 'Tagged user'}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 flex-wrap">
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  goToProfile(currentReel.userId);
                }}
                className="text-xs font-bold text-white tracking-tight cursor-pointer hover:underline"
              >
                {currentReel.username}
              </span>
              {currentReel.isVerified && (
                <VerifiedBadge size="xs" />
              )}

              {(currentReel.isCollab || currentReel.collabUsername || (currentReel.taggedUsers && currentReel.taggedUsers.length > 0)) && (
                <>
                  <span className="text-[10px] text-zinc-400 font-normal">and</span>
                  <span className="text-xs font-bold text-[#00FF66] flex items-center gap-1">
                    @{currentReel.collabUsername || currentReel.taggedUsers?.[0]?.username}
                  </span>
                </>
              )}
            </div>

            {currentReel.userId !== currentUser.id && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleFollowCreator();
                }}
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                  isFollowingCreator
                    ? 'bg-black/50 border-neutral-700 text-gray-300'
                    : 'bg-[#00FF66] border-[#00FF66] text-black'
                }`}
              >
                {isFollowingCreator ? 'Following' : 'Follow'}
              </button>
            )}
          </div>

          {/* Caption */}
          <p translate="no" className="text-xs text-gray-200 line-clamp-2 leading-snug drop-shadow-md">
            {currentReel.caption}
          </p>

          {/* Outbound Web Link (Meta-Verified) */}
          {currentReel.webLink && (
            <a
              href={currentReel.webLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 bg-black/60 border border-[#00FF66]/40 px-2 py-0.5 rounded-full text-[10px] text-[#00FF66] font-medium"
            >
              <ExternalLink className="w-2.5 h-2.5" /> {currentReel.webLink}
            </a>
          )}

          {/* AI Voice Translation Button */}
          {currentReel.aiTranslationAvailable && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setAiVoiceTranslationActive(!aiVoiceTranslationActive);
              }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                aiVoiceTranslationActive
                  ? 'bg-[#00FF66] text-black border-[#00FF66]'
                  : 'bg-black/60 text-purple-300 border-purple-500/40'
              }`}
            >
              <Globe className="w-3 h-3" />
              <span>{aiVoiceTranslationActive ? 'AI Voice Dubbed (EN)' : 'AI Translate Voice'}</span>
            </button>
          )}

          {/* Audio Marquee */}
          <div className="flex items-center gap-2 bg-black/50 backdrop-blur-md rounded-full px-2.5 py-1 w-fit">
            <Music className="w-3 h-3 text-[#00FF66] animate-spin" />
            <span className="text-[10px] text-gray-300 font-medium truncate max-w-[200px]">
              {currentReel.audioTrack.title} • {currentReel.audioTrack.artist}
            </span>
          </div>
        </div>

        {/* Right Floating Engagement Buttons */}
        <div
          className="absolute bottom-6 right-2.5 z-20 flex flex-col items-center gap-4 pointer-events-auto"
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {/* Like */}
          <div className="flex flex-col items-center gap-1 group">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleToggleLike();
              }}
              className={`p-2.5 rounded-full bg-black/50 backdrop-blur-md group-hover:scale-110 transition-transform cursor-pointer ${
                currentReel.isLiked ? 'text-red-500' : 'text-white'
              }`}
            >
              <Heart className={`w-6 h-6 ${currentReel.isLiked ? 'fill-current' : ''}`} />
            </button>
            {!currentReel.isLikeCountHidden && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (currentReel.likesCount > 0) {
                    setLikesViewsInitialTab('likes');
                    setShowLikesViewsSheet(true);
                  }
                }}
                className="text-[10px] font-bold text-white drop-shadow cursor-pointer hover:underline disabled:hover:no-underline"
                disabled={currentReel.likesCount === 0}
              >
                {currentReel.likesCount.toLocaleString()}
              </button>
            )}
          </div>

          {/* Views (owner-only "seen by" list) */}
          {currentReel.userId === currentUser.id && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLikesViewsInitialTab('views');
                setShowLikesViewsSheet(true);
              }}
              className="flex flex-col items-center gap-1 group cursor-pointer"
            >
              <div className="p-2.5 rounded-full bg-black/50 backdrop-blur-md text-white group-hover:scale-110 transition-transform">
                <Eye className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-bold text-white drop-shadow">
                {currentReel.viewsCount.toLocaleString()}
              </span>
            </button>
          )}

          {/* Comment */}
          {!currentReel.isCommentsDisabled && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowComments(true);
              }}
              className="flex flex-col items-center gap-1 group cursor-pointer"
            >
              <div className="p-2.5 rounded-full bg-black/50 backdrop-blur-md text-white group-hover:scale-110 transition-transform">
                <MessageCircle className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-bold text-white drop-shadow">
                {currentReel.commentsCount}
              </span>
            </button>
          )}

          {/* Share */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowShareSheet(true);
            }}
            className="flex flex-col items-center gap-1 group cursor-pointer"
          >
            <div className="p-2.5 rounded-full bg-black/50 backdrop-blur-md text-white group-hover:scale-110 transition-transform">
              <Send className="w-5 h-5 -rotate-12" />
            </div>
            <span className="text-[10px] font-bold text-white drop-shadow">
              {currentReel.sharesCount}
            </span>
          </button>

          {/* Save / Bookmark */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggleSave();
            }}
            className="flex flex-col items-center gap-1 group cursor-pointer"
          >
            <div
              className={`p-2.5 rounded-full bg-black/50 backdrop-blur-md group-hover:scale-110 transition-transform ${
                currentReel.isSaved ? 'text-[#00FF66]' : 'text-white'
              }`}
            >
              <Bookmark className={`w-6 h-6 ${currentReel.isSaved ? 'fill-current' : ''}`} />
            </div>
          </button>

          {/* Audio Spinning Disc */}
          <div className="w-8 h-8 rounded-full border-2 border-neutral-700 overflow-hidden animate-spin bg-neutral-900 flex items-center justify-center">
            <Music className="w-4 h-4 text-[#00FF66]" />
          </div>
        </div>
      </div>

      {/* 4. Sliding Comments Sheet Overlay */}
      {showComments && (
        <div
          className="absolute inset-x-0 bottom-0 z-40 bg-[#0f0f0f]/95 backdrop-blur-md border-t border-neutral-800 rounded-t-2xl p-4 max-h-[60%] flex flex-col animate-in slide-in-from-bottom duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
            <h4 className="text-xs font-bold text-white">Reel Comments</h4>
            <button onClick={() => setShowComments(false)} className="text-gray-400 hover:text-white cursor-pointer">
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-3 space-y-1 text-xs text-gray-300">
            {isLoadingComments ? (
              <p className="text-center text-gray-500 py-6">Loading comments...</p>
            ) : reelComments.filter((c) => !c.parentId).length === 0 ? (
              <p className="text-center text-gray-500 py-6">No comments yet. Be the first to comment!</p>
            ) : (
              reelComments
                .filter((c) => !c.parentId)
                .map((c) => {
                  const replies = reelComments.filter((r) => r.parentId === c.id);
                  const isExpanded = expandedReplyThreads.includes(c.id);
                  return (
                    <div key={c.id} className="py-1">
                      <div translate="no" className="p-2 bg-neutral-900 rounded-lg">
                        <span className="font-bold text-[#00FF66]">@{c.username}:</span> {c.text}
                        <button
                          type="button"
                          onClick={() => setReplyingToComment({ topLevelId: c.id, username: c.username })}
                          className="block mt-1 text-[10px] font-bold text-gray-400 hover:text-white cursor-pointer"
                        >
                          Reply
                        </button>
                      </div>
                      {replies.length > 0 && (
                        <div className="ml-6 mt-1">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedReplyThreads((prev) =>
                                prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                              )
                            }
                            className="flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-white cursor-pointer mb-1"
                          >
                            <CornerDownRight className="w-3 h-3" />
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            {isExpanded ? 'Hide' : 'View'} {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                          </button>
                          {isExpanded && (
                            <div className="space-y-1.5">
                              {replies.map((r) => (
                                <div key={r.id} translate="no" className="p-2 bg-neutral-900/70 rounded-lg border-l border-neutral-800">
                                  {r.replyToUsername && r.replyToUsername !== r.username && (
                                    <span className="text-[#00FF66] font-semibold mr-1">@{r.replyToUsername}</span>
                                  )}
                                  <span className="font-bold text-[#00FF66]">@{r.username}:</span> {r.text}
                                  <button
                                    type="button"
                                    onClick={() => setReplyingToComment({ topLevelId: c.id, username: r.username })}
                                    className="block mt-1 text-[10px] font-bold text-gray-400 hover:text-white cursor-pointer"
                                  >
                                    Reply
                                  </button>
                                </div>
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
          {commentError && (
            <div className="mx-1 mb-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-400">
              {commentError}
            </div>
          )}
          {replyingToComment && (
            <div className="flex items-center justify-between px-1 pb-1.5">
              <span className="text-[11px] text-gray-400">
                Replying to <span className="text-[#00FF66] font-semibold">@{replyingToComment.username}</span>
              </span>
              <button type="button" onClick={() => setReplyingToComment(null)} className="text-[11px] text-gray-500 hover:text-white cursor-pointer">
                Cancel
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 pt-2 border-t border-neutral-800">
            <input
              type="text"
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handlePostComment();
              }}
              placeholder={replyingToComment ? `Reply to @${replyingToComment.username}...` : 'Add a comment...'}
              className="flex-1 bg-neutral-900 border border-neutral-800 rounded-full px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#00FF66]"
            />
            <button
              onClick={handlePostComment}
              disabled={!commentInput.trim() || isPostingComment}
              className="px-3 py-2 rounded-full bg-[#00FF66] text-black text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Post
            </button>
          </div>
        </div>
      )}

      {showLikesViewsSheet && (
        <LikesViewsSheet
          likes={{ label: 'Likes', fetchUsers: () => fetchReelLikers(currentReel.id) }}
          views={
            currentReel.userId === currentUser.id
              ? { label: 'Views', fetchUsers: () => fetchReelViewers(currentReel.id) }
              : undefined
          }
          viewsCount={currentReel.userId === currentUser.id ? currentReel.viewsCount : undefined}
          ownerUsername={currentReel.username}
          currentUserId={currentUser.id}
          onToggleFollowUser={onToggleFollowUser}
          onNavigateToUser={onNavigateToProfile}
          initialTab={likesViewsInitialTab}
          onClose={() => setShowLikesViewsSheet(false)}
        />
      )}

      {showShareSheet && currentReel && (
        <SharePostSheet
          type="reel"
          linkCopied={shareLinkCopied}
          onCopyLink={copyReelLink}
          onSendInChat={() => {
            setShowShareSheet(false);
            setShowShareToChat(true);
          }}
          onClose={() => setShowShareSheet(false)}
        />
      )}

      {showShareToChat && currentReel && (
        <SharePostToChatModal
          currentUser={currentUser}
          itemId={currentReel.id}
          itemType="reel"
          onClose={() => setShowShareToChat(false)}
        />
      )}
      </div>
    </div>
  );
};
