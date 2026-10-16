import React, { useState, useRef, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { BurgerLoading } from '../Common/BurgerLoading';
import { orderUnseenFirst } from '../../utils/seenContent';
import { navKey } from '../../utils/keyboardNav';
import { can, isMainAdmin } from '../../adminAccess';
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
  ArrowLeft,
  Trash2,
  MoreVertical,
  Link2,
  Pin,
  MessageSquareOff,
  EyeOff,
  CornerDownRight,
  ChevronDown,
  ChevronUp,
  Volume2,
  VolumeX
} from 'lucide-react';
import { Reel, User } from '../../types';
import { LikeReactionBurst } from '../Common/LikeReactionBurst';
import { reactionEmojiForCategory } from '../../utils/categoryReaction';
import { AvatarMedia } from '../Common/AvatarMedia';
import { LiveStreamBar } from '../LiveStream/LiveStreamBar';
import { CommentMediaComposer, CommentAttachmentPreview, CommentMediaView, type CommentAttachment } from '../Feed/CommentMediaComposer';
// Lazy-loaded: pulls in the Agora SDK, only needed once someone actually opens a live stream —
// shares the same chunk as App.tsx's own dynamic import() of this component.
const LiveStreamView = React.lazy(() => import('../LiveStream/LiveStreamView').then((m) => ({ default: m.LiveStreamView })));
import type { LiveStreamSummary } from '../../services/api';
import { likeCountHiddenFor, useSetting } from '../../services/settingsApi';
import { sendLike } from '../../utils/likeSync';
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
import { getReelPlayer, releaseReelPlayer, getSoundPreference, setSoundPreference, playReel, unmuteInTap, onRealTap } from '../../utils/reelAudio';
import { getSongPlayer, loadSong, pauseSong, stopSong } from '../../utils/songSound';
import { usePinnedFeedItems, toggleFeedPin } from '../../services/pinnedFeed';
import { usePageHidden } from '../../utils/pageLayers';

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
  const hideOthersCounts = useSetting('likes.hideOthers');
  const [currentIndex, setCurrentIndex] = useState(0);
  // Sound: on unless the person switched it off. `soundBlocked` = the browser refused sound (no real tap yet), so the reel plays silently and
  // "Tap for sound" shows until the next real tap (see src/utils/reelAudio.ts for why).
  const [soundWanted, setSoundWanted] = useState(() => getSoundPreference());
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  // A profile opened over the reels (the author's name was tapped): the reel waits where it is, silent, and carries on when "Go to previous page" brings the reels back.
  const pageHidden = usePageHidden();
  const pageHiddenRef = useRef(pageHidden);
  pageHiddenRef.current = pageHidden;
  const playing = isPlaying && !pageHidden;
  const [isVideoBuffering, setIsVideoBuffering] = useState(true);
  const [videoFailed, setVideoFailed] = useState(false);
  const [showHeartAnim, setShowHeartAnim] = useState(false);
  const [likeBurstKey, setLikeBurstKey] = useState(0);
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
  const [commentAttachment, setCommentAttachment] = useState<CommentAttachment | null>(null);
  const [liveOverlay, setLiveOverlay] = useState<{ stream: LiveStreamSummary } | null>(null);
  // What the touch / wheel / key handlers (put on the page once) need to see of the latest render.
  const live = useRef<{
    currentIndex: number;
    localReels: Reel[];
    anyModalOpen: boolean;
    handleTap: () => void;
    slideTo: (dir: 1 | -1) => void;
    snapBack: () => void;
  }>({ currentIndex: 0, localReels: [], anyModalOpen: false, handleTap: () => undefined, slideTo: () => undefined, snapBack: () => undefined });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const nextVideoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  // Tapping a creator's name/avatar needs their full profile, which the reel itself only carries a
  // denormalized sliver of (username, avatar) — fetching it only ON tap means a real network wait
  // before the profile even starts to open. Instead, the creator of the reel someone is CURRENTLY
  // watching (and the very next one, so a fast swiper is covered too) is looked up quietly in the
  // background the moment it's shown; by the time anyone actually taps, it's usually already in hand.
  const profileCacheRef = useRef<Map<string, User>>(new Map());

  useEffect(() => {
    if (initialReelId) {
      // Deep-linked reel (e.g. opened from a share or profile grid) plays
      // first, with the rest of the feed shuffled behind it.
      const target = reels.find((r) => r.id === initialReelId);
      const rest = reels.filter((r) => r.id !== initialReelId);
      setLocalReels(target ? [target, ...orderUnseenFirst(rest, currentUser.id, 'reels')] : orderUnseenFirst(reels, currentUser.id, 'reels'));
    } else {
      // Reels this person hasn't watched yet come first (newest first), the rest shuffled behind them.
      setLocalReels(orderUnseenFirst(reels, currentUser.id, 'reels'));
    }
    setCurrentIndex(0);
  }, [reels, initialReelId]);

  const currentReel = localReels[currentIndex] || localReels[0];
  const nextReel = localReels[currentIndex + 1];
  const nextNextReel = localReels[currentIndex + 2];
  // The NEXT reel is only downloaded ahead of time once the person has stayed on this one for a moment, and only on a fast connection
  // that is not set to save data. Skimming past reels used to download every one of them in full (the biggest source of wasted data).
  const [nextWarm, setNextWarm] = useState(false);
  useEffect(() => {
    setNextWarm(false);
    const t = setTimeout(() => setNextWarm(true), 2000);
    return () => clearTimeout(t);
  }, [currentReel?.id]);
  const connection = (typeof navigator !== 'undefined' ? (navigator as any).connection : undefined) as { saveData?: boolean; effectiveType?: string } | undefined;
  const fastConnection = !connection || (!connection.saveData && (!connection.effectiveType || connection.effectiveType === '4g'));
  const nextPreload: 'auto' | 'metadata' = nextWarm && fastConnection ? 'auto' : 'metadata';
  const isFollowingCreator = !!currentReel && !!currentUser.followingIds?.includes(currentReel.userId);
  const isReelOwner = !!currentReel && currentReel.userId === currentUser.id;
  useScreenshotAlert('reel', currentReel?.id, !!currentReel && !isReelOwner);
  // may remove other people's content: the main admin, or an admin who was given the "moderate content" permission
  const isMasterAdmin = can(currentUser, 'moderate_content');
  const pinnedItems = usePinnedFeedItems();

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
    const t = setTimeout(() => live.current.slideTo(1), 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoFailed]);

  // Every reel plays through ONE video element that lives for the whole session (see src/utils/reelAudio.ts): the phone gives the permission to
  // make sound to that element, so once it has it, every reel can have sound without asking again.
  const playerHostRef = useRef<HTMLDivElement>(null);
  const hasReels = !!currentReel;
  const soundBlockedRef = useRef(false);
  const soundWantedRef = useRef(soundWanted);
  soundWantedRef.current = soundWanted;
  const tapUnmutedAtRef = useRef(0);
  // The song attached to this reel (a NOOB Songs pick or a recording) is its sound: the picture plays silently and the song plays in its place, from the
  // start, starting over each time the video loops (see src/utils/songSound.ts). A reel with no song just plays its own sound.
  const songUrl = currentReel?.audioTrack?.audioUrl || '';
  const songUrlRef = useRef('');
  songUrlRef.current = songUrl;
  const setBlocked = (blocked: boolean) => {
    soundBlockedRef.current = blocked;
    setSoundBlocked(blocked);
  };

  // put the shared element on the page, and listen to it
  useEffect(() => {
    const host = playerHostRef.current;
    if (!host) return;
    const video = getReelPlayer();
    host.appendChild(video);
    videoRef.current = video;
    const onWaiting = () => setIsVideoBuffering(true);
    const onReady = () => setIsVideoBuffering(false);
    const onError = (e: Event) => {
      // A missing/corrupt file on our end, not a slow network — the buffering spinner would otherwise spin forever on a
      // frozen black frame, which reads as "the app is broken" rather than "this one video can't be played."
      if (!video.getAttribute('src')) return; // the element was just emptied between two reels
      console.warn('Video failed to load source:', e);
      setIsVideoBuffering(false);
      setVideoFailed(true);
    };
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onReady);
    video.addEventListener('canplay', onReady);
    video.addEventListener('error', onError);
    let lastTime = 0;
    const onTime = () => {
      const t = video.currentTime;
      if (progressRef.current && video.duration > 0) progressRef.current.style.width = `${Math.min(100, (t / video.duration) * 100)}%`;
      if (songUrlRef.current && t + 0.4 < lastTime) loadSong(songUrlRef.current, true);   // the video started over: so does its song
      lastTime = t;
    };
    video.addEventListener('timeupdate', onTime);
    return () => {
      video.removeEventListener('timeupdate', onTime);
      stopSong();
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onReady);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('error', onError);
      videoRef.current = null;
      releaseReelPlayer();
    };
  }, [hasReels]);

  // a new reel: load it into the element
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentReel) return;
    const bar = progressRef.current;
    if (bar) {
      bar.style.transition = 'none';
      bar.style.width = '0%';
      void bar.offsetWidth;
      bar.style.transition = '';
    }
    video.removeAttribute('src');
    video.load();
    if (currentReel.thumbnailUrl) video.poster = currentReel.thumbnailUrl;
    else video.removeAttribute('poster');
    video.src = currentReel.videoUrl;
  }, [currentReel?.id]);

  // play / pause: always asks for sound first, and plays silently when the browser refuses (so a reel never sits on a frozen frame)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const withSong = !!songUrl;
    if (!playing) {
      video.pause();
      if (withSong) pauseSong();
      return;
    }
    let live = true;
    const startVideoSound = () =>
      playReel(video, soundWantedRef.current).then((result) => {
        if (!live) return;
        if (result === 'sound') setBlocked(false);
        else if (result === 'silent' && soundWantedRef.current) setBlocked(true);
      });
    if (withSong) {
      // the picture plays silently; the song is the sound (or asks for a tap, like a video does)
      const song = loadSong(songUrl);
      void playReel(video, false);
      playReel(song, soundWantedRef.current).then((result) => {
        if (!live) return;
        if (result === 'sound') setBlocked(false);
        else if (result === 'silent' && soundWantedRef.current) setBlocked(true);
        else if (result === 'failed') {
          stopSong();   // the song file cannot be played: fall back to the video's own sound
          void startVideoSound();
        }
      });
    } else {
      stopSong();
      void startVideoSound();
    }
    return () => {
      live = false;
    };
  }, [playing, currentReel?.id]);

  // While sound is refused, the next REAL tap (touchend / click / key, not touchstart or pointerdown) switches it on, right inside that tap.
  useEffect(
    () =>
      onRealTap(() => {
        const target = songUrlRef.current ? getSongPlayer() : videoRef.current;
        if (!target || !soundBlockedRef.current || !soundWantedRef.current || pageHiddenRef.current) return;   // not while a profile is open over the reels
        tapUnmutedAtRef.current = Date.now();
        unmuteInTap(target).then((on) => {
          if (on) setBlocked(false);
        });
      }),
    []
  );

  const toggleSound = () => {
    if (soundWantedRef.current && Date.now() - tapUnmutedAtRef.current < 700) return; // this very tap already switched the sound on
    const video = videoRef.current;
    const next = !soundWanted;
    setSoundWanted(next);
    soundWantedRef.current = next;
    setSoundPreference(next);
    if (!video) return;
    const target = songUrlRef.current ? getSongPlayer() : video;   // a reel with a song: the song is what the speaker button controls
    if (!next) {
      target.muted = true;
      setBlocked(false);
      return;
    }
    unmuteInTap(target).then((on) => setBlocked(!on));
  };

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

  const handleToggleLike = () => {
    if (!currentReel) return;
    const before = currentReel;
    const want = !before.isLiked;
    if (want) setLikeBurstKey((k) => k + 1);
    const show = (isLiked: boolean, likesCount: number) =>
      setLocalReels((prev) => prev.map((r) => (r.id === before.id ? { ...r, isLiked, likesCount } : r)));
    show(want, Math.max(0, before.likesCount + (want ? 1 : -1)));
    sendLike(`reel:${before.id}`, want, () => toggleLikeReel(before.id), (r) => show(r.isLiked, r.likesCount), () => show(before.isLiked, before.likesCount));
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
    if (now - tapUnmutedAtRef.current < 700) return; // this tap only switched the sound on
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
    if (!currentReel || (!commentInput.trim() && !commentAttachment) || isPostingComment) return;
    setCommentError('');
    try {
      setIsPostingComment(true);
      const media = commentAttachment
        ? { url: commentAttachment.objectKey || commentAttachment.url, type: commentAttachment.type, duration: commentAttachment.duration }
        : undefined;
      const comment = await addReelComment(currentReel.id, commentInput.trim(), replyingToComment?.topLevelId, media);
      if (!comment) throw new Error('Could not post the comment.');
      setReelComments((prev) => [comment, ...prev]);
      setLocalReels(
        localReels.map((r) =>
          r.id === currentReel.id ? { ...r, commentsCount: (r.commentsCount || 0) + 1 } : r
        )
      );
      setCommentInput('');
      setCommentAttachment(null);
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
  //
  // The reels move WITH the finger (like a normal scrolling list): while it drags, the reel before and the reel after are already there, so the next one slides
  // up under the finger and its top is seen before it is chosen. Letting go far enough (or with a flick) finishes the slide to that reel; letting go early
  // slides back. The track below holds the reel before / this reel / the reel after, one screen apart, and is moved by hand (not through React) while dragging.
  const SLIDE_MS = 260;
  const SLOT_GAP = 4;   // the reels before / after wait a hair further away, so not even a sliver of them shows at rest
  const pagerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const animatingRef = useRef(false);
  const wheelLockRef = useRef(0);
  const anyModalOpen = showComments || showReelOptionsMenu || showLikesViewsSheet;

  const snapBack = () => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = 'transform 220ms cubic-bezier(0.22, 0.8, 0.22, 1)';
    track.style.transform = 'translate3d(0, 0, 0)';
  };

  const slideTo = (dir: 1 | -1) => {
    const track = trackRef.current;
    const pager = pagerRef.current;
    const target = currentIndex + dir;
    if (!track || !pager || animatingRef.current) return;
    if (target < 0 || target >= localReels.length) {
      snapBack();
      return;
    }
    animatingRef.current = true;
    wheelLockRef.current = Date.now() + SLIDE_MS + 300;
    track.style.transition = `transform ${SLIDE_MS}ms cubic-bezier(0.22, 0.8, 0.22, 1)`;
    track.style.transform = `translate3d(0, ${-dir * (pager.clientHeight + SLOT_GAP)}px, 0)`;
    window.setTimeout(() => {
      // the new reel is put in the middle slot and the track goes back to rest in the same moment, so nothing flashes in between
      flushSync(() => setCurrentIndex(target));
      track.style.transition = 'none';
      track.style.transform = 'translate3d(0, 0, 0)';
      animatingRef.current = false;
    }, SLIDE_MS + 20);
  };

  live.current = { currentIndex, localReels, anyModalOpen, handleTap, slideTo, snapBack };

  // The list never ends: a little before the last reel, the whole set is added again in a fresh order (never starting with the reel just shown),
  // so the next reel is always there to be seen under the finger.
  useEffect(() => {
    if (localReels.length < 2 || currentIndex < localReels.length - 2) return;
    setLocalReels((prev) => {
      const unique: Reel[] = Array.from(new Map<string, Reel>(prev.map((r) => [r.id, r] as [string, Reel])).values());
      if (unique.length < 2) return prev;
      const pass = shuffleReels(unique);
      if (pass[0].id === prev[prev.length - 1].id) [pass[0], pass[1]] = [pass[1], pass[0]];
      return [...prev, ...pass];
    });
  }, [currentIndex, localReels.length]);

  useEffect(() => {
    const el = pagerRef.current;
    if (!el) return;
    let active = false;
    let locked = false;
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let lastT = 0;
    let vy = 0;
    let onControl = false;
    let onVideo = false;

    const onStart = (e: TouchEvent) => {
      if (live.current.anyModalOpen || animatingRef.current || e.touches.length !== 1) {
        active = false;
        return;
      }
      const t = e.touches[0];
      const target = e.target as Element | null;
      active = true;
      locked = false;
      startX = t.clientX;
      startY = lastY = t.clientY;
      lastT = performance.now();
      vy = 0;
      onControl = !!target?.closest('button, a, input, textarea');
      onVideo = !!target?.closest('[data-reel-tap]');
    };

    // A touchmove has to be a real (non-passive) listener to be allowed to stop the page from scrolling by itself with the reels.
    const onMove = (e: TouchEvent) => {
      if (!active) return;
      const t = e.touches[0];
      const dy = t.clientY - startY;
      const dx = t.clientX - startX;
      if (!locked) {
        if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return; // still could be a tap
        if (Math.abs(dx) > Math.abs(dy)) {
          active = false; // sideways: not for the reels
          return;
        }
        locked = true;
      }
      e.preventDefault();
      const now = performance.now();
      const dt = now - lastT;
      if (dt > 0) vy = 0.6 * vy + 0.4 * ((t.clientY - lastY) / dt);
      lastY = t.clientY;
      lastT = now;
      const L = live.current;
      let y = dy;
      if ((y > 0 && L.currentIndex === 0) || (y < 0 && !L.localReels[L.currentIndex + 1])) y *= 0.25; // nothing there: it only gives a little
      const track = trackRef.current;
      if (!track) return;
      track.style.transition = 'none';
      track.style.transform = `translate3d(0, ${y}px, 0)`;
    };

    const onEnd = (e: TouchEvent) => {
      if (!active) return;
      active = false;
      const L = live.current;
      if (!locked) {
        // Not a swipe — a tap. Handled here directly (with the browser's own click suppressed) rather than through onClick/onDoubleClick, which on a real
        // phone is an unreliable way to tell a single tap from a double one. Taps on the buttons are left to the buttons.
        if (onVideo && !onControl) {
          e.preventDefault();
          L.handleTap();
        }
        return;
      }
      e.preventDefault();
      const dy = lastY - startY;
      const h = el.clientHeight || 1;
      const speed = performance.now() - lastT > 80 ? 0 : vy;
      const fast = Math.abs(speed) > 0.45;
      const dir: 1 | -1 = fast ? (speed < 0 ? 1 : -1) : dy < 0 ? 1 : -1;
      if (fast || Math.abs(dy) > h * 0.22) L.slideTo(dir);
      else L.snapBack();
    };

    const onCancel = () => {
      if (active && locked) live.current.snapBack();
      active = false;
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: false });
    el.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
    };
  }, [hasReels]);

  const handleWheel = (e: React.WheelEvent) => {
    if (anyModalOpen || Date.now() < wheelLockRef.current) return;
    if (e.deltaY > 20) slideTo(1);
    else if (e.deltaY < -20) slideTo(-1);
  };

  useEffect(() => {
    // On a computer: S / ↓ = next reel, W / ↑ = previous (like swiping up / down on a phone).
    const handleKeyDown = (e: KeyboardEvent) => {
      if (anyModalOpen || Date.now() < wheelLockRef.current) return;
      const dir = navKey(e);
      if (dir === 'down') { e.preventDefault(); slideTo(1); }
      else if (dir === 'up') { e.preventDefault(); slideTo(-1); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyModalOpen, currentIndex, localReels]);

  if (!currentReel || localReels.length === 0) {
    return (
      <div className="fixed inset-0 z-30 bg-black media-dark flex flex-col items-center justify-center text-center px-4 pb-20">
        {onGoBack && (
          <button
            onClick={onGoBack}
            className="absolute top-3 left-3 p-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-white/80 hover:text-white"
            title="Go back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div className="w-16 h-16 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4 text-noob">
          <Film className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-white mb-1">No Reels Yet</h3>
        <p className="text-xs text-zinc-400 max-w-xs leading-relaxed">
          Be the first to record and share a reel with the NOOB community!
        </p>
      </div>
    );
  }

  // One reel as a page (laid out like Roblox's Moments): the picture as wide as the screen and sitting right above the writing (a wide video leaves room
  // above it), the like / comment / share / save buttons on its bottom edge, then who posted it, the caption, the likes, how far the video has played, and its
  // sound with the Follow button. The reel before and the reel after are drawn the same way (without the live video), so while a finger drags, the next
  // reel is already there under it.
  const renderCard = (reel: Reel, isCur: boolean) => {
    const countHidden = likeCountHiddenFor(reel.isLikeCountHidden, reel.userId, currentUser.id, hideOthersCounts);
    const hasCollab = !!(reel.isCollab || reel.collabUsername || (reel.taggedUsers && reel.taggedUsers.length > 0));
    const own = reel.userId === currentUser.id;
    const following = !!currentUser.followingIds?.includes(reel.userId);
    const likeEmoji = reactionEmojiForCategory(reel.category);
    const cover = reel.audioTrack?.coverUrl;
    const soundCover = (size: string) => (
      <span className={`${size} rounded-lg overflow-hidden bg-[#1d1e23] flex items-center justify-center shrink-0`}>
        {cover ? <img src={cover} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" draggable={false} /> : <Music className="w-1/2 h-1/2 text-zinc-400" />}
      </span>
    );
    return (
      <div className={`absolute inset-0 flex flex-col ${isCur ? '' : 'pointer-events-none'}`} data-testid={isCur ? 'reel-card' : 'reel-card-peek'}>
        {/* The picture. Tapping it pauses / plays (twice: likes). */}
        <div data-reel-tap className="relative flex-1 min-h-0 overflow-hidden cursor-pointer" onClick={isCur ? handleTap : undefined}>
          {reel.thumbnailUrl && (
            <img
              src={reel.thumbnailUrl}
              alt=""
              draggable={false}
              referrerPolicy="no-referrer"
              className={`absolute inset-0 w-full h-full object-contain object-bottom transition-opacity duration-150 ${isCur && !isVideoBuffering ? 'opacity-0' : ''}`}
            />
          )}
          {isCur && <div ref={playerHostRef} className="absolute inset-0 w-full h-full" />}

          {/* Buffering spinner — without this, a slow-loading video just looks frozen on a black frame, which reads as broken rather than loading. */}
          {isCur && isVideoBuffering && !videoFailed && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
              <div className="w-10 h-10 rounded-full border-[3px] border-white/20 border-t-white animate-spin" />
            </div>
          )}

          {/* A missing/broken video file — clearly says so instead of a frozen black frame, and moves on by itself so nobody gets stuck. */}
          {isCur && videoFailed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none z-20 text-center px-8">
              <Film className="w-8 h-8 text-zinc-500" />
              <p className="text-xs text-zinc-400">This video couldn't be loaded.</p>
            </div>
          )}

          {/* Double-tap heart animation */}
          {isCur && showHeartAnim && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 animate-ping">
              <Heart className="w-24 h-24 text-red-500 fill-red-500 drop-shadow-2xl" />
            </div>
          )}

          {/* Paused-state indicator — tap feedback for the play/pause toggle */}
          {isCur && !isPlaying && !showHeartAnim && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
              <div className="p-5 rounded-full bg-black/40 backdrop-blur-sm">
                <div className="w-0 h-0 border-y-[14px] border-y-transparent border-l-[22px] border-l-white ml-1" />
              </div>
            </div>
          )}

          {isCur && soundBlocked && soundWanted && (
            <div className="absolute top-3 inset-x-0 z-30 flex justify-center pointer-events-none" data-testid="reel-tap-for-sound">
              <span className="px-3 py-1.5 rounded-full bg-black/65 text-white text-xs font-bold backdrop-blur-md flex items-center gap-1.5">
                <VolumeX className="w-3.5 h-3.5" /> Tap for sound
              </span>
            </div>
          )}

          {/* Like / comment / share / save: plain icons on the bottom right edge of the picture */}
          <div className="absolute right-3.5 bottom-3 z-20 flex flex-col items-center gap-5 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]" data-testid="reel-actions">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleLike();
              }}
              className={`relative cursor-pointer active:scale-90 transition-transform ${reel.isLiked ? 'text-red-500' : 'text-white'}`}
              aria-label={reel.isLiked ? 'Unlike' : 'Like'}
              data-testid="reel-like-button"
            >
              <Heart className={`w-7 h-7 ${reel.isLiked ? 'fill-current' : ''}`} strokeWidth={1.7} />
              {isCur && <LikeReactionBurst emoji={likeEmoji} burstKey={likeBurstKey} />}
            </button>
            {!reel.isCommentsDisabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowComments(true);
                }}
                className="flex flex-col items-center gap-1 cursor-pointer active:scale-90 transition-transform"
                aria-label="Comments"
              >
                <MessageCircle className="w-7 h-7" strokeWidth={1.7} />
                <span className="text-[13px] font-semibold leading-none">{reel.commentsCount}</span>
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowShareSheet(true);
              }}
              className="flex flex-col items-center gap-1 cursor-pointer active:scale-90 transition-transform"
              aria-label="Share"
            >
              <Send className="w-[26px] h-[26px] -rotate-12" strokeWidth={1.7} />
              <span className="text-[13px] font-semibold leading-none">{reel.sharesCount}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleSave();
              }}
              className={`cursor-pointer active:scale-90 transition-transform ${reel.isSaved ? 'text-noob' : 'text-white'}`}
              aria-label={reel.isSaved ? 'Remove from saved' : 'Save'}
            >
              <Bookmark className={`w-7 h-7 ${reel.isSaved ? 'fill-current' : ''}`} strokeWidth={1.7} />
            </button>
          </div>
        </div>

        <div className="shrink-0 px-5 pt-3 pb-3">
          {/* who posted it */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goToProfile(reel.userId);
              }}
              className="relative flex items-center shrink-0 cursor-pointer"
              aria-label={`Open ${reel.username}'s profile`}
            >
              <AvatarMedia
                src={reel.userAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                isLiveAvatar={reel.authorIsLiveAvatar}
                liveAvatarVideoUrl={reel.authorLiveAvatarVideoUrl}
                alt={reel.username}
                className="w-[34px] h-[34px] rounded-full object-cover"
              />
              {hasCollab && (
                <span className="-ml-3 mt-3 w-5 h-5 rounded-full ring-2 ring-[#0f0f11] bg-zinc-800 overflow-hidden">
                  <img
                    src={reel.collabUserAvatar || reel.taggedUsers?.[0]?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                    alt={reel.collabUsername || 'Tagged user'}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </span>
              )}
            </button>
            <div className="min-w-0 flex-1 flex items-center gap-1.5">
              <span
                translate="no"
                onClick={(e) => {
                  e.stopPropagation();
                  goToProfile(reel.userId);
                }}
                className="text-[16px] font-bold text-white truncate cursor-pointer"
              >
                {reel.username}
              </span>
              {reel.isVerified && <VerifiedBadge size="xs" />}
              {hasCollab && (
                <>
                  <span className="text-[13px] text-zinc-400 shrink-0">and</span>
                  <span translate="no" className="text-[15px] font-bold text-white truncate">
                    @{reel.collabUsername || reel.taggedUsers?.[0]?.username}
                  </span>
                </>
              )}
              {isCur && reel.isTrialReel && <span className="px-2 py-0.5 bg-yellow-500/80 text-black text-[10px] font-bold rounded-full shrink-0">Trial Reel</span>}
            </div>
            {soundCover('w-[26px] h-[26px]')}
          </div>

          {/* caption */}
          {reel.caption && (
            <p translate="no" className="mt-1.5 text-[15px] leading-snug text-zinc-200 line-clamp-2">
              {reel.caption}
            </p>
          )}

          {/* Outbound Web Link (Meta-Verified) */}
          {reel.webLink && (
            <a
              href={reel.webLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-1.5 inline-flex items-center gap-1 bg-white/5 border border-noob/40 px-2 py-0.5 rounded-full text-[11px] text-noob font-medium max-w-full"
            >
              <ExternalLink className="w-3 h-3 shrink-0" /> <span className="truncate">{reel.webLink}</span>
            </a>
          )}

          {/* AI Voice Translation Button */}
          {reel.aiTranslationAvailable && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setAiVoiceTranslationActive(!aiVoiceTranslationActive);
              }}
              className={`mt-1.5 flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                aiVoiceTranslationActive ? 'bg-noob text-black border-noob' : 'bg-white/5 text-purple-300 border-purple-500/40'
              }`}
            >
              <Globe className="w-3 h-3" />
              <span>{aiVoiceTranslationActive ? 'AI Voice Dubbed (EN)' : 'AI Translate Voice'}</span>
            </button>
          )}

          {/* likes, and the reel's own menu */}
          <div className="mt-2.5 flex items-center gap-2">
            <span className="flex items-center -space-x-1.5 shrink-0" aria-hidden="true">
              <span className="w-[22px] h-[22px] rounded-full bg-[#26272c] ring-2 ring-[#0f0f11] flex items-center justify-center text-[12px] leading-none">❤️</span>
              {likeEmoji !== '❤️' && (
                <span className="w-[22px] h-[22px] rounded-full bg-[#26272c] ring-2 ring-[#0f0f11] flex items-center justify-center text-[12px] leading-none">{likeEmoji}</span>
              )}
            </span>
            {!countHidden && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (reel.likesCount > 0) {
                    setLikesViewsInitialTab('likes');
                    setShowLikesViewsSheet(true);
                  }
                }}
                disabled={reel.likesCount === 0}
                className="text-[15px] text-zinc-400 cursor-pointer disabled:cursor-default"
              >
                {reel.likesCount === 0 ? 'No likes yet' : `${reel.likesCount.toLocaleString()} ${reel.likesCount === 1 ? 'like' : 'likes'}`}
              </button>
            )}
            <div className="relative ml-auto">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowReelOptionsMenu((v) => !v);
                }}
                className="p-1 -mr-1 text-white cursor-pointer"
                aria-label="Reel options"
                title="Reel options"
              >
                <MoreVertical className="w-5 h-5" />
              </button>

              {isCur && showReelOptionsMenu && (
                <>
                  <div className="absolute -inset-[200vmax] z-30" onClick={(e) => { e.stopPropagation(); setShowReelOptionsMenu(false); }} />
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 bottom-9 z-40 w-52 bg-zinc-950/95 border border-white/10 rounded-2xl py-1.5 shadow-2xl backdrop-blur-xl"
                  >
                    <button
                      onClick={() => {
                        setShowReelOptionsMenu(false);
                        copyReelLink();
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800 flex items-center gap-2 cursor-pointer"
                    >
                      <Link2 className="w-4 h-4 text-sky-400" /> {shareLinkCopied ? 'Link copied' : 'Copy link'}
                    </button>
                    {(isReelOwner || isMasterAdmin) && (
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
                    )}
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
                    {isMainAdmin(currentUser) && (
                      <button
                        onClick={async () => {
                          setShowReelOptionsMenu(false);
                          const res = await toggleFeedPin('reel', currentReel.id);
                          if (!res.success) alert(res.error || 'Could not change the pin.');
                        }}
                        className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800 flex items-center gap-2 cursor-pointer"
                      >
                        <Pin className="w-4 h-4 text-noob" /> {pinnedItems.some((p) => p.kind === 'reel' && p.itemId === currentReel.id) ? 'Unpin from Feed' : 'Pin to Feed'}
                      </button>
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
                </>
              )}
            </div>
          </div>

          {/* how far the video has played */}
          <div className="mt-3 h-[3px] rounded-full bg-[#1b1b20] overflow-hidden" data-testid={isCur ? 'reel-progress' : undefined}>
            <div ref={isCur ? progressRef : undefined} className="h-full rounded-full bg-[#bcbcc8] transition-[width] duration-300 ease-linear" style={{ width: '0%' }} />
          </div>

          {/* its sound, and Follow */}
          <div className="mt-3 flex items-center gap-3" data-testid={isCur ? 'reel-sound-bar' : undefined}>
            {soundCover('w-[42px] h-[42px]')}
            <div className="min-w-0 flex-1 leading-tight">
              <p translate="no" className="text-[15px] font-bold text-white truncate">{reel.audioTrack?.title || 'Original audio'}</p>
              <p translate="no" className="text-[14px] text-zinc-400 truncate">{reel.audioTrack?.artist || reel.username}</p>
            </div>
            {!own && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleFollowCreator();
                }}
                className={`h-[42px] px-5 rounded-lg text-[15px] font-semibold cursor-pointer active:scale-95 transition-transform ${
                  following ? 'bg-white/10 text-zinc-200' : 'bg-[#335fff] text-white'
                }`}
              >
                {following ? 'Following' : 'Follow'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
    {/* `fixed inset-0` anchors to the true viewport regardless of where this
        component happens to sit in the page's normal flow — a height like
        `calc(100vh-80px)` on a normally-flowing element only avoids the
        floating bottom nav if that element starts at y=0, which it doesn't
        here, so it still overlapped the nav until this switched to `fixed`. */}
    <div className="fixed inset-0 z-30 bg-[#0f0f11] media-dark flex items-center justify-center pb-20">
      <div
        id="reels-page-container"
        className="relative w-full h-full max-h-[860px] max-w-[440px] mx-auto bg-[#0f0f11] sm:rounded-2xl overflow-hidden flex flex-col select-none shadow-2xl border border-neutral-800"
      >
      <LiveStreamBar onOpenLive={(s) => setLiveOverlay({ stream: s })} />

      {/* Title bar: Back, "Reels", and the sound button */}
      <div className="relative z-30 shrink-0 h-14 px-4 flex items-center justify-between" style={{ marginTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-3 min-w-0">
          {onGoBack && (
            <button type="button" onClick={onGoBack} className="p-1 -ml-1 text-white cursor-pointer" title="Go back" aria-label="Go back">
              <ArrowLeft className="w-6 h-6" />
            </button>
          )}
          <h2 className="text-[26px] leading-none font-bold tracking-tight text-white">Reels</h2>
        </div>
        <button
          type="button"
          onClick={toggleSound}
          className="p-1 -mr-1 text-white cursor-pointer"
          title={soundWanted && !soundBlocked ? 'Sound on' : 'Sound off'}
          aria-label={soundWanted && !soundBlocked ? 'Turn sound off' : 'Turn sound on'}
          data-testid="reel-sound-button"
        >
          {soundWanted && !soundBlocked ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
        </button>
      </div>

      {/* The reels: the one before, this one, the one after — one screen apart, moved together by the finger */}
      <div ref={pagerRef} className="relative flex-1 min-h-0 overflow-hidden touch-none overscroll-none" onWheel={handleWheel} data-testid="reels-pager">
        <div ref={trackRef} className="absolute inset-0 will-change-transform" data-testid="reels-track">
          <div className="absolute inset-0" style={{ transform: `translateY(calc(-100% - ${SLOT_GAP}px))` }}>
            {localReels[currentIndex - 1] ? renderCard(localReels[currentIndex - 1], false) : null}
          </div>
          <div className="absolute inset-0">{renderCard(currentReel, true)}</div>
          <div className="absolute inset-0" style={{ transform: `translateY(calc(100% + ${SLOT_GAP}px))` }}>
            {nextReel ? renderCard(nextReel, false) : null}
          </div>
        </div>

        {/* Hidden preload of the next reel so swiping doesn't stall while the browser starts fetching/decoding cold.
            The one after that only gets its metadata (duration/dimensions), not a full download — fully buffering
            two whole videos in the background at once was competing for bandwidth with the one actually playing,
            which is exactly what made media feel slow to load on a real phone connection. */}
        {nextReel && (
          <video
            key={`preload-${nextReel.id}`}
            ref={nextVideoRef}
            src={nextReel.videoUrl}
            muted
            playsInline
            preload={nextPreload}
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
            preload="metadata"
            className="absolute w-px h-px opacity-0 pointer-events-none"
            aria-hidden="true"
          />
        )}
      </div>

      {/* 4. Sliding Comments Sheet Overlay */}
      {showComments && (
        <div
          className="absolute inset-x-0 bottom-0 z-40 bg-zinc-950/95 backdrop-blur-md border-t border-neutral-800 rounded-t-2xl p-4 max-h-[60%] flex flex-col animate-in slide-in-from-bottom duration-200"
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
                        <span className="font-bold text-noob">@{c.username}:</span> {c.text}
                        {c.mediaUrl && c.mediaType && <CommentMediaView url={c.mediaUrl} type={c.mediaType} duration={c.mediaDuration} />}
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
                                    <span className="text-noob font-semibold mr-1">@{r.replyToUsername}</span>
                                  )}
                                  <span className="font-bold text-noob">@{r.username}:</span> {r.text}
                                  {r.mediaUrl && r.mediaType && <CommentMediaView url={r.mediaUrl} type={r.mediaType} duration={r.mediaDuration} />}
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
                Replying to <span className="text-noob font-semibold">@{replyingToComment.username}</span>
              </span>
              <button type="button" onClick={() => setReplyingToComment(null)} className="text-[11px] text-gray-500 hover:text-white cursor-pointer">
                Cancel
              </button>
            </div>
          )}
          {commentAttachment && <CommentAttachmentPreview attachment={commentAttachment} onRemove={() => setCommentAttachment(null)} />}
          <div className="pt-2 border-t border-neutral-800">
            <CommentMediaComposer onAttachmentChange={setCommentAttachment} onInsertEmoji={(emoji) => setCommentInput((prev) => prev + emoji)} />
            <div className="flex items-center gap-2 mt-2">
              <input
                type="text"
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handlePostComment();
                }}
                placeholder={replyingToComment ? `Reply to @${replyingToComment.username}...` : 'Add a comment...'}
                className="flex-1 bg-neutral-900 border border-neutral-800 rounded-full px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-noob"
              />
              <button
                onClick={handlePostComment}
                disabled={(!commentInput.trim() && !commentAttachment) || isPostingComment}
                className="px-3 py-2 rounded-full bg-noob text-black text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Post
              </button>
            </div>
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

    {liveOverlay && (
      <React.Suspense fallback={<BurgerLoading />}>
        <LiveStreamView
          currentUser={currentUser}
          mode="view"
          stream={liveOverlay.stream}
          onClose={() => setLiveOverlay(null)}
        />
      </React.Suspense>
    )}
    </>
  );
};
