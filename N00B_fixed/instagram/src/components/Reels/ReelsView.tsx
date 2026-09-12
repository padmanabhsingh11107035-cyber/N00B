import React, { useState, useRef, useEffect } from 'react';
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  Music,
  Sliders,
  History,
  Volume2,
  VolumeX,
  ExternalLink,
  Sparkles,
  Globe,
  Share2,
  Check,
  Film,
  Eye
} from 'lucide-react';
import { Reel, User } from '../../types';
import {
  toggleLikeReel,
  toggleSaveReel,
  recordReelView,
  fetchReelComments,
  addReelComment,
  fetchReelLikers,
  fetchReelViewers
} from '../../services/api';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import { LikesViewsSheet } from '../Common/LikesViewsSheet';
import confetti from 'canvas-confetti';

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
  onNavigateToChat: () => void;
  initialReelId?: string;
  onToggleFollowUser?: (userId: string) => Promise<ToggleFollowResult | void>;
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
  onNavigateToChat,
  initialReelId,
  onToggleFollowUser
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isVideoBuffering, setIsVideoBuffering] = useState(true);
  const [showHeartAnim, setShowHeartAnim] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showAlgorithmModal, setShowAlgorithmModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showLikesSheet, setShowLikesSheet] = useState(false);
  const [showViewersSheet, setShowViewersSheet] = useState(false);
  const [algorithmWeights, setAlgorithmWeights] = useState({
    robotics: 85,
    code: 90,
    cad: 70,
    gaming: 60,
    synth: 75
  });
  const [aiVoiceTranslationActive, setAiVoiceTranslationActive] = useState(false);
  const [localReels, setLocalReels] = useState<Reel[]>(reels);
  const [reelComments, setReelComments] = useState<any[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const nextVideoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);

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
  const isFollowingCreator = !!currentReel && !!currentUser.followingIds?.includes(currentReel.userId);

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
  }, [currentIndex, currentReel]);

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
        // plays; the volume button still lets them unmute by hand.
        if (!video.muted) {
          video.muted = true;
          setIsMuted(true);
          video.play().catch(() => {});
        }
      });
    } else {
      video.pause();
    }
  }, [isPlaying, currentReel?.id]);

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

  const handleDoubleTap = () => {
    if (!currentReel.isLiked) {
      handleToggleLike();
    }
    setShowHeartAnim(true);
    confetti({ particleCount: 30, spread: 60, origin: { y: 0.6 } });
    setTimeout(() => setShowHeartAnim(false), 800);
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
    try {
      setIsPostingComment(true);
      const comment = await addReelComment(currentReel.id, commentInput.trim());
      if (comment) {
        setReelComments((prev) => [comment, ...prev]);
        setLocalReels(
          localReels.map((r) =>
            r.id === currentReel.id ? { ...r, commentsCount: (r.commentsCount || 0) + 1 } : r
          )
        );
        setCommentInput('');
      }
    } catch (err) {
      console.error(err);
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

  // Swipe (touch) / scroll (wheel) / arrow-key navigation between reels.
  const touchStartY = useRef<number | null>(null);
  const isNavLockedRef = useRef(false);
  const anyModalOpen = showComments || showAlgorithmModal || showHistoryModal || showLikesSheet || showViewersSheet;

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
        onClick={() => setIsPlaying(!isPlaying)}
        onDoubleClick={handleDoubleTap}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
      >
        <video
          key={currentReel.id}
          ref={videoRef}
          src={currentReel.videoUrl}
          loop
          autoPlay
          playsInline
          preload="auto"
          muted={isMuted}
          onError={(e) => {
            console.warn('Video failed to load source:', e);
            setIsVideoBuffering(false);
          }}
          onWaiting={() => setIsVideoBuffering(true)}
          onPlaying={() => setIsVideoBuffering(false)}
          onCanPlay={() => setIsVideoBuffering(false)}
          className="w-full h-full object-cover"
        />

        {/* Buffering spinner — without this, a slow-loading video just looks
            frozen on a black frame, which reads as broken rather than loading. */}
        {isVideoBuffering && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <div className="w-10 h-10 rounded-full border-[3px] border-white/20 border-t-white animate-spin" />
          </div>
        )}

        {/* Hidden preload of the next reel in the deck so swiping to it
            doesn't stall while the browser starts fetching/decoding cold */}
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
        <div className="absolute top-3 inset-x-3 z-30 flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold text-white tracking-tight drop-shadow-md">
              Reels
            </span>
            {currentReel.isTrialReel && (
              <span className="px-2 py-0.5 bg-yellow-500/80 text-black text-[10px] font-bold rounded-full">
                Trial Reel
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Your Algorithm Tuner Button */}
            <button
              id="your-algorithm-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowAlgorithmModal(true);
              }}
              className="flex items-center gap-1 px-2.5 py-1 bg-black/60 hover:bg-[#00FF66]/20 border border-[#00FF66]/50 rounded-full text-[10px] text-[#00FF66] font-bold backdrop-blur-md transition-colors cursor-pointer"
              title="Tune Algorithm Recommendations"
            >
              <Sliders className="w-3 h-3 text-[#00FF66]" />
              <span>Your Algorithm</span>
            </button>

            {/* Watch History */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowHistoryModal(true);
              }}
              className="p-1.5 bg-black/60 rounded-full text-white/80 hover:text-white backdrop-blur-md"
              title="Watch History Log"
            >
              <History className="w-4 h-4" />
            </button>

            {/* Audio Mute */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsMuted(!isMuted);
              }}
              className="p-1.5 bg-black/60 rounded-full text-white/80 hover:text-white backdrop-blur-md"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Left Creator Overlay */}
        <div className="absolute bottom-6 left-3 right-16 z-20 space-y-2 pointer-events-auto text-left">
          {/* Creator Profile & Follow (with Instagram-style Dual Overlapping Avatars) */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex items-center">
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
              <span className="text-xs font-bold text-white tracking-tight">{currentReel.username}</span>
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
          <p className="text-xs text-gray-200 line-clamp-2 leading-snug drop-shadow-md">
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
        <div className="absolute bottom-6 right-2.5 z-20 flex flex-col items-center gap-4 pointer-events-auto">
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
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (currentReel.likesCount > 0) setShowLikesSheet(true);
              }}
              className="text-[10px] font-bold text-white drop-shadow cursor-pointer hover:underline disabled:hover:no-underline"
              disabled={currentReel.likesCount === 0}
            >
              {currentReel.likesCount.toLocaleString()}
            </button>
          </div>

          {/* Views (owner-only "seen by" list) */}
          {currentReel.userId === currentUser.id && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowViewersSheet(true);
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

          {/* Share */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNavigateToChat();
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

      {/* 2. Your Algorithm Tuning Modal */}
      {showAlgorithmModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#121212] border border-[#00FF66]/40 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#00FF66]" />
                <h3 className="text-sm font-bold text-white">Your Reel Algorithm Controls</h3>
              </div>
              <button onClick={() => setShowAlgorithmModal(false)} className="text-gray-400 hover:text-white">
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-400 leading-relaxed">
              Fine-tune the recommendation weight for specific content topics in your Reels feed.
            </p>

            <div className="space-y-3">
              {Object.entries(algorithmWeights).map(([key, val]) => (
                <div key={key} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold capitalize text-gray-200">
                    <span>{key} Topics</span>
                    <span className="text-[#00FF66]">{val}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={val}
                    onChange={(e) =>
                      setAlgorithmWeights({ ...algorithmWeights, [key]: Number(e.target.value) })
                    }
                    className="w-full accent-[#00FF66]"
                  />
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                setShowAlgorithmModal(false);
                confetti({ particleCount: 30, spread: 50, origin: { y: 0.6 } });
              }}
              className="w-full py-2 bg-[#00FF66] text-black font-bold text-xs rounded-xl cursor-pointer"
            >
              Apply Algorithm Preferences
            </button>
          </div>
        </div>
      )}

      {/* 3. Watch History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#121212] border border-neutral-800 rounded-2xl p-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[#00FF66]" />
                <h3 className="text-sm font-bold text-white">Reel Watch History</h3>
              </div>
              <button onClick={() => setShowHistoryModal(false)} className="text-gray-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="py-3 space-y-2 max-h-60 overflow-y-auto">
              {localReels.map((r, i) => (
                <div
                  key={r.id}
                  onClick={() => {
                    setCurrentIndex(i);
                    setShowHistoryModal(false);
                  }}
                  className="p-2 bg-neutral-900/80 rounded-xl flex items-center gap-2.5 hover:bg-neutral-800 cursor-pointer"
                >
                  <img src={r.userAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'} alt="" className="w-7 h-7 rounded-full object-cover" />
                  <div className="truncate flex-1">
                    <span className="text-xs font-bold text-white block">@{r.username}</span>
                    <span className="text-[10px] text-gray-400 truncate block">{r.caption}</span>
                  </div>
                  <span className="text-[10px] text-[#00FF66] font-semibold">{r.viewsCount} views</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
          <div className="flex-1 overflow-y-auto py-3 space-y-2 text-xs text-gray-300">
            {isLoadingComments ? (
              <p className="text-center text-gray-500 py-6">Loading comments...</p>
            ) : reelComments.length === 0 ? (
              <p className="text-center text-gray-500 py-6">No comments yet. Be the first to comment!</p>
            ) : (
              reelComments.map((c) => (
                <div key={c.id} className="p-2 bg-neutral-900 rounded-lg">
                  <span className="font-bold text-[#00FF66]">@{c.username}:</span> {c.text}
                </div>
              ))
            )}
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-neutral-800">
            <input
              type="text"
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handlePostComment();
              }}
              placeholder="Add a comment..."
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

      {showLikesSheet && (
        <LikesViewsSheet
          title="Liked by"
          fetchUsers={() => fetchReelLikers(currentReel.id)}
          onClose={() => setShowLikesSheet(false)}
        />
      )}

      {showViewersSheet && (
        <LikesViewsSheet
          title="Viewed by"
          fetchUsers={() => fetchReelViewers(currentReel.id)}
          onClose={() => setShowViewersSheet(false)}
        />
      )}
      </div>
    </div>
  );
};
