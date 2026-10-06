import React, { useState, useEffect, useRef } from 'react';
import { can } from '../../adminAccess';
import { X, ChevronLeft, ChevronRight, Heart, Send, Sparkles, MessageCircle, MapPin, Check, Volume2, VolumeX, Eye, MoreVertical, Trash2, Pencil, Link2, Music } from 'lucide-react';
import { Story, User } from '../../types';
import { recordStoryView, toggleStoryLike, fetchStoryById, addCommentToStory, fetchStoryViewers, fetchUserById, fetchStoryPollResults, voteStoryPoll, answerStoryQuestion, fetchStoryQuestionResults } from '../../services/api';
import type { StoryPollResult, StoryQuestionAnswer } from '../../services/api';
import { formatRelativeTime } from '../../utils/formatTime';
import { LikesViewsSheet } from '../Common/LikesViewsSheet';
import confetti from 'canvas-confetti';
import { useScreenshotAlert } from '../../utils/useScreenshotAlert';
import { navKey } from '../../utils/keyboardNav';
import { LikeReactionBurst } from '../Common/LikeReactionBurst';
import { reactionEmojiForCategory } from '../../utils/categoryReaction';
import { AvatarMedia } from '../Common/AvatarMedia';
import { formatCountdown } from '../../utils/countdown';

interface StoryViewerModalProps {
  stories: Story[];
  initialIndex: number;
  onClose: () => void;
  currentUser: User;
  onAddComment: (storyId: string, text: string) => void;
  // Patches the parent's own `stories` state so a like survives this viewer being closed and
  // reopened — without this, the fix below only ever worked within one open session, since the
  // viewer re-seeds likedStoryIds from the `stories` prop every time it mounts fresh, and nothing
  // ever told that prop a like had happened.
  onToggleLike?: (storyId: string, isLiked: boolean, likesCount: number) => void;
  onDeleteStory?: (storyId: string) => void;
  onNavigateToProfile?: (user: User) => void;
  // A hashtag sticker's tap-through — no dedicated hashtag page exists yet, so the caller is
  // expected to close this viewer and open Explore pre-filtered by the tag.
  onNavigateToHashtag?: (tag: string) => void;
  // True when playing back a Highlight instead of a live 24h story: same viewer, same sticker
  // rendering ("story and highlight are the same thing" per the 22 Sep redesign), but no view
  // recording, "seen by", comments or delete menu — those all need a live `stories` row, which a
  // highlight's older pages no longer have once the original story expires and is deleted.
  isHighlight?: boolean;
  // Only relevant with isHighlight: opens the highlight editor (rename / add / remove media) for
  // whichever highlight is currently being viewed. Omitted (or the viewer isn't its owner) hides
  // the edit pencil entirely — editing someone else's highlight isn't a thing.
  onEditHighlight?: () => void;
}

export const StoryViewerModal: React.FC<StoryViewerModalProps> = ({
  stories,
  initialIndex,
  onClose,
  currentUser,
  onAddComment,
  onToggleLike,
  onDeleteStory,
  onNavigateToProfile,
  onNavigateToHashtag,
  isHighlight = false,
  onEditHighlight
}) => {
  // Re-renders every second so any Countdown sticker's "time left" keeps ticking.
  const [, forceCountdownTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceCountdownTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [commentText, setCommentText] = useState('');
  // Keyed by story id (not a single shared boolean) — liking one story must never show as "liked"
  // on every other story in the same viewing session. Seeded from each story's own persisted
  // `isLiked` (see toggle_story_like / story_json) so a like survives closing and reopening the
  // viewer — it used to live only in this Set with nothing behind it, so it reset every time.
  const [likedStoryIds, setLikedStoryIds] = useState<Set<string>>(
    () => new Set(stories.filter((s) => s.isLiked).map((s) => s.id))
  );
  // Stories/highlights carry no content category, so this always bursts a plain heart — still the
  // same YouTube-Shorts-style delight on liking, just without a category to key the emoji off.
  const [likeBurstKey, setLikeBurstKey] = useState(0);
  // A highlight's items are a fixed snapshot (media/stickers/when it was posted) with no
  // comments/likes baked in — those keep changing after the fact, so they're fetched live per item
  // here and layered on top, keyed by story id so switching pages/reopening the same one is instant.
  const [liveById, setLiveById] = useState<Record<string, Story>>({});
  const [isMuted, setIsMuted] = useState(false);
  // Real poll results from the database, keyed `${storyId}:${stickerIndex}` (they used to be made up).
  const [pollResults, setPollResults] = useState<Record<string, StoryPollResult>>({});
  const [pollError, setPollError] = useState('');
  // Questions sticker: your own in-progress answer text, keyed the same way as pollResults, plus
  // which ones you've already sent. The owner instead sees `questionResults` — everyone else's
  // answers, fetched only when they tap their own question sticker (private, not preloaded).
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, string>>({});
  const [questionSent, setQuestionSent] = useState<Record<string, boolean>>({});
  const [questionError, setQuestionError] = useState('');
  const [openQuestionResultsKey, setOpenQuestionResultsKey] = useState<string | null>(null);
  const [questionResults, setQuestionResults] = useState<Record<string, StoryQuestionAnswer[]>>({});
  const [questionResultsLoading, setQuestionResultsLoading] = useState(false);
  const [quizSelected, setQuizSelected] = useState<number | null>(null);
  const [sliderVal, setSliderVal] = useState(75);
  const [showViewersSheet, setShowViewersSheet] = useState(false);
  const [showStoryOptionsMenu, setShowStoryOptionsMenu] = useState(false);
  // Kept fully separate from `isPaused` (the press-and-hold gesture) on purpose: the outer frame's
  // onTouchStart/onTouchEnd toggle `isPaused` based on raw touch coordinates, and on mobile Safari a
  // tap that focuses the comment input fires touchend (which un-pauses) up to ~300ms BEFORE the
  // input's own focus event lands (which re-pauses). In that gap the advance timer could tick past
  // 100 and skip to the next story right as someone tapped in to type. `isCommentFocused` is driven
  // only by the input's focus/blur, never by the container's touch handlers, so nothing can race it.
  const [isCommentFocused, setIsCommentFocused] = useState(false);

  const story = stories[currentIndex];
  const nextStory = stories[currentIndex + 1];
  // Once live data has arrived for this item, it's the source of truth for anything that can
  // change after the story was posted (comments, likes); everything else (media, stickers, who
  // posted it) is immutable, so the snapshot already showing it instantly is never overwritten.
  const effectiveStory = story && liveById[story.id] ? { ...story, ...liveById[story.id] } : story;
  const isOwnStory = !!story && story.userId === currentUser.id;
  const isLiked = !!story && likedStoryIds.has(story.id);
  // may remove other people's content: the main admin, or an admin who was given the "moderate content" permission
  const isMasterAdmin = can(currentUser, 'moderate_content');
  useScreenshotAlert('story', story?.id, !isOwnStory);

  useEffect(() => {
    setProgress(0);
    setPollError('');
    setQuizSelected(null);
  }, [currentIndex]);

  // Load this story's poll results (your own vote included) whenever a story with a poll comes up.
  useEffect(() => {
    if (!story || !story.stickers?.some((s) => s.type === 'poll')) return;
    let alive = true;
    const id = story.id;
    fetchStoryPollResults(id).then((res) => {
      if (!alive) return;
      setPollResults((prev) => {
        const next = { ...prev };
        for (const [idx, r] of Object.entries(res)) next[`${id}:${idx}`] = r;
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [story?.id]);

  // Record a view the moment this story becomes the active one — skipped
  // for the owner's own story, same as the reel view-recording pattern
  // (recordReelView on currentReel change).
  useEffect(() => {
    if (isHighlight || !story || story.userId === currentUser.id) return;
    recordStoryView(story.id).catch(() => {});
  }, [isHighlight, story?.id, currentUser.id]);

  // Highlights stay likeable/commentable forever (their original story row is kept, never
  // deleted — see migration 20260925000039), so this is what actually loads that live data; the
  // snapshot alone has no idea whether the viewer already liked it or what's been said about it.
  useEffect(() => {
    if (!isHighlight || !story || liveById[story.id]) return;
    let alive = true;
    fetchStoryById(story.id).then((live) => {
      if (!alive || !live) return;
      setLiveById((prev) => ({ ...prev, [live.id]: live }));
      if (live.isLiked) setLikedStoryIds((prev) => (prev.has(live.id) ? prev : new Set(prev).add(live.id)));
    });
    return () => {
      alive = false;
    };
  }, [isHighlight, story?.id]);

  // Preload the next story's media so advancing to it is instant instead of showing a blank/
  // loading frame while the browser only just starts fetching it.
  useEffect(() => {
    if (!nextStory?.mediaUrl) return;
    const img = new Image();
    img.src = nextStory.mediaUrl;
  }, [nextStory?.mediaUrl]);

  // Same prefetch-then-cache pattern as the Reels profile-tap fix: the author's card is fetched
  // in the background for the current and next story, so tapping the avatar/username navigates
  // instantly instead of waiting on a fresh network round trip.
  const profileCacheRef = useRef<Map<string, User>>(new Map());
  useEffect(() => {
    for (const s of [story, nextStory]) {
      if (!s || profileCacheRef.current.has(s.userId)) continue;
      fetchUserById(s.userId).then((user) => { if (user) profileCacheRef.current.set(s.userId, user); }).catch(() => undefined);
    }
  }, [story, nextStory]);

  const goToProfile = async (userId: string) => {
    if (!onNavigateToProfile) return;
    const cached = profileCacheRef.current.get(userId);
    if (cached) { onNavigateToProfile(cached); return; }
    const user = await fetchUserById(userId);
    if (user) onNavigateToProfile(user);
  };

  // Music sticker playback — at most one per story, muted/paused in step with the story's own
  // mute toggle and press-to-pause gesture (same isMuted/isPaused this file already drives the
  // video element with).
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const url = story?.stickers?.find((s) => s.type === 'music')?.data?.audioUrl;
    if (!url) return;
    const audio = new Audio(url);
    audio.loop = true;
    audio.muted = isMuted;
    audio.play().catch(() => undefined);
    musicAudioRef.current = audio;
    return () => {
      audio.pause();
      musicAudioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  useEffect(() => {
    if (musicAudioRef.current) musicAudioRef.current.muted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    if (!musicAudioRef.current) return;
    if (isPaused) musicAudioRef.current.pause();
    else musicAudioRef.current.play().catch(() => undefined);
  }, [isPaused]);

  useEffect(() => {
    if (isPaused || isCommentFocused || !story || showViewersSheet || showStoryOptionsMenu) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          if (currentIndex < stories.length - 1) {
            setCurrentIndex((c) => c + 1);
            return 0;
          } else {
            onClose();
            return 100;
          }
        }
        return prev + 1.25;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [isPaused, isCommentFocused, currentIndex, stories.length, onClose, story, showViewersSheet, showStoryOptionsMenu]);

  // On a computer: A / ← = previous story, D / → = next story (like tapping or swiping on a phone), Esc closes.
  // The one key listener calls the latest handlers through this ref (they are defined below).
  const keyActions = useRef({ next: () => {}, prev: () => {}, close: () => {} });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showViewersSheet || showStoryOptionsMenu) return;
      if (e.key === 'Escape' && !isCommentFocused) { keyActions.current.close(); return; }
      const dir = navKey(e);
      if (dir === 'right') { e.preventDefault(); keyActions.current.next(); }
      else if (dir === 'left') { e.preventDefault(); keyActions.current.prev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showViewersSheet, showStoryOptionsMenu, isCommentFocused]);

  if (!story) return null;

  const handleNext = () => {
    if (isCommentFocused) return;
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (isCommentFocused) return;
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  keyActions.current = { next: handleNext, prev: handlePrev, close: onClose };

  const handleSendComment = (e: React.FormEvent) => {
    e.preventDefault();
    const text = commentText.trim();
    if (!text) return;
    const id = story.id;
    if (isHighlight) {
      // Self-contained rather than routed through the parent's onAddComment (a no-op for
      // highlights — ProfileView has no live comments cache to append to for these), since this
      // viewer already holds the live data it just fetched for this exact item.
      addCommentToStory(id, text).then((newComment) => {
        if (!newComment || !newComment.id) return;
        setLiveById((prev) => {
          const base = prev[id] || story;
          return { ...prev, [id]: { ...base, comments: [...(base.comments || []), newComment] } };
        });
      });
    } else {
      onAddComment(id, text);
    }
    setCommentText('');
    setIsPaused(false);
    setIsCommentFocused(false);
    (document.activeElement as HTMLElement | null)?.blur();
    confetti({ particleCount: 35, spread: 60, origin: { y: 0.8 } });
  };

  const handleVotePoll = (stickerIndex: number, option: number, optionCount: number) => {
    const id = story.id;
    const key = `${id}:${stickerIndex}`;
    const before = pollResults[key];
    if (before?.myVote === option) return;
    // Show the vote straight away, then replace it with the saved numbers from the database.
    const counts = before?.counts?.length === optionCount ? [...before.counts] : new Array(optionCount).fill(0);
    let total = before?.total || 0;
    if (before && before.myVote !== null && before.myVote < counts.length) counts[before.myVote] = Math.max(0, counts[before.myVote] - 1);
    else total += 1;
    counts[option] += 1;
    setPollError('');
    setPollResults((prev) => ({ ...prev, [key]: { counts, total, myVote: option, voters: before?.voters || [] } }));
    if (!before || before.myVote === null) confetti({ particleCount: 40, spread: 50, origin: { y: 0.5 } });
    voteStoryPoll(id, stickerIndex, option).then((res) => {
      if (res.success && res.poll) {
        setPollResults((prev) => ({ ...prev, [key]: res.poll! }));
      } else {
        setPollResults((prev) => {
          const next = { ...prev };
          if (before) next[key] = before; else delete next[key];
          return next;
        });
        setPollError(res.error || 'Could not save your vote. Please try again.');
      }
    });
  };

  const handleSubmitQuestionAnswer = (stickerIndex: number) => {
    const id = story.id;
    const key = `${id}:${stickerIndex}`;
    const text = (questionDrafts[key] || '').trim();
    if (!text) return;
    setQuestionError('');
    answerStoryQuestion(id, stickerIndex, text).then((res) => {
      if (res.success) {
        setQuestionSent((prev) => ({ ...prev, [key]: true }));
        confetti({ particleCount: 30, spread: 50, origin: { y: 0.6 } });
      } else {
        setQuestionError(res.error || 'Could not send your answer. Please try again.');
      }
    });
  };

  const openQuestionResults = (stickerIndex: number) => {
    const key = `${story.id}:${stickerIndex}`;
    setOpenQuestionResultsKey((cur) => (cur === key ? null : key));
    if (questionResults[key]) return;
    setQuestionResultsLoading(true);
    fetchStoryQuestionResults(story.id).then((res) => {
      setQuestionResultsLoading(false);
      setQuestionResults((prev) => {
        const next = { ...prev };
        for (const [idx, answers] of Object.entries(res)) next[`${story.id}:${idx}`] = answers;
        return next;
      });
    });
  };

  const handleQuizAnswer = (index: number) => {
    setQuizSelected(index);
    if (index === 1) {
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.5 } });
    }
  };

  return (
    <div
      id="story-viewer-modal"
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center backdrop-blur-md select-none"
    >
      {/* Close button */}
      <button
        id="story-close-btn"
        onClick={onClose}
        className="absolute top-4 right-4 z-50 p-2 text-white/80 hover:text-white bg-black/40 rounded-full cursor-pointer hover:scale-110 transition-transform"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Navigation Arrows for Desktop */}
      {currentIndex > 0 && (
        <button
          onClick={handlePrev}
          className="hidden md:flex absolute left-8 top-1/2 -translate-y-1/2 z-40 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md cursor-pointer"
        >
          <ChevronLeft className="w-7 h-7" />
        </button>
      )}
      {currentIndex < stories.length - 1 && (
        <button
          onClick={handleNext}
          className="hidden md:flex absolute right-8 top-1/2 -translate-y-1/2 z-40 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md cursor-pointer"
        >
          <ChevronRight className="w-7 h-7" />
        </button>
      )}

      {/* Main Story Container Frame */}
      <div
        className="relative w-full max-w-[420px] h-full max-h-[92vh] sm:rounded-2xl overflow-hidden bg-neutral-900 border border-neutral-800 flex flex-col justify-between shadow-2xl"
        onMouseDown={() => setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        {/* Top Progress Bars */}
        <div className="absolute top-2 inset-x-2 z-30 flex items-center gap-1.5 px-2">
          {stories.map((s, idx) => (
            <div key={s.id} className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#00FF66] transition-all duration-75 ease-linear"
                style={{
                  width: idx === currentIndex ? `${progress}%` : idx < currentIndex ? '100%' : '0%'
                }}
              />
            </div>
          ))}
        </div>

        {/* Story Header */}
        <div className="absolute top-5 inset-x-3 z-30 flex items-center justify-between px-2 pt-1">
          <button
            type="button"
            onClick={() => {
              if (!onNavigateToProfile) return;
              goToProfile(story.userId);
              onClose();
            }}
            disabled={!onNavigateToProfile}
            className={`flex items-center gap-2.5 text-left ${onNavigateToProfile ? 'cursor-pointer' : ''}`}
          >
            <AvatarMedia
              src={story.userAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
              isLiveAvatar={story.authorIsLiveAvatar}
              liveAvatarVideoUrl={story.authorLiveAvatarVideoUrl}
              alt={story.username}
              className="w-9 h-9 rounded-full object-cover ring-2 ring-[#00FF66]"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-white tracking-tight">{story.username}</span>
                {story.isVerified && (
                  <span className="w-3.5 h-3.5 bg-[#00E5FF] text-black text-[9px] font-extrabold rounded-full flex items-center justify-center">
                    ✓
                  </span>
                )}
                {story.isCloseFriendsOnly && (
                  <span className="bg-[#00FF66]/20 border border-[#00FF66]/50 text-[#00FF66] text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                    ★ Close Friends
                  </span>
                )}
              </div>
              <span className="text-[11px] text-gray-300">{formatRelativeTime(story.createdAt)}</span>
            </div>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-1.5 rounded-full bg-black/40 text-white/80 hover:text-white"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            {isHighlight && isOwnStory && onEditHighlight && (
              <button
                onClick={onEditHighlight}
                className="p-1.5 rounded-full bg-black/40 text-white/80 hover:text-white"
                title="Edit this highlight"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
            {!isHighlight && (isOwnStory || isMasterAdmin) && (
              <div className="relative">
                <button
                  onClick={() => {
                    setShowStoryOptionsMenu((v) => {
                      const next = !v;
                      setIsPaused(next);
                      return next;
                    });
                  }}
                  className="p-1.5 rounded-full bg-black/40 text-white/80 hover:text-white"
                  title="More options"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {showStoryOptionsMenu && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-9 z-40 w-44 bg-zinc-950/95 border border-white/10 rounded-2xl py-1.5 shadow-2xl backdrop-blur-xl"
                  >
                    {isOwnStory && (
                      <button
                        onClick={() => {
                          setShowStoryOptionsMenu(false);
                          setShowViewersSheet(true);
                        }}
                        className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800 flex items-center gap-2 cursor-pointer"
                      >
                        <Eye className="w-4 h-4 text-emerald-400" /> Seen By
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setShowStoryOptionsMenu(false);
                        onDeleteStory?.(story.id);
                        onClose();
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-zinc-800 flex items-center gap-2 border-t border-zinc-800 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" /> Delete Story
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Story Media */}
        <div className="relative w-full h-full flex items-center justify-center bg-black" style={{ containerType: 'inline-size' }}>
          <img
            src={story.mediaUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80'}
            alt="Story content"
            className="w-full h-full object-contain"
            referrerPolicy="no-referrer"
          />

          {/* Interactive Stickers Overlay */}
          {story.stickers?.map((sticker, idx) => {
            // Shared position/size/rotation for every layer type. `x` was previously ignored
            // (every sticker forced to left: 50%) — safe to switch on, since every sticker ever
            // saved before this used x: 50 anyway.
            const layerStyle: React.CSSProperties = {
              top: `${sticker.y}%`,
              left: `${sticker.x}%`,
              width: sticker.width ? `${sticker.width}%` : undefined,
              transform: `translate(-50%, -50%) rotate(${sticker.rotation || 0}deg)`,
            };

            if (sticker.type === 'draw') {
              const strokes: { points: { x: number; y: number }[]; color: string; width: number; mode: string }[] =
                Array.isArray(sticker.data?.strokes) ? sticker.data.strokes : [];
              return (
                <svg key={idx} viewBox="0 0 100 100" className="absolute inset-0 w-full h-full z-10 pointer-events-none">
                  {strokes.map((s, i) => (
                    <path
                      key={i}
                      d={s.points.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={s.width}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={s.mode === 'highlighter' ? 0.45 : 1}
                      style={s.mode === 'highlighter' ? { mixBlendMode: 'multiply' } : undefined}
                    />
                  ))}
                </svg>
              );
            }

            if (sticker.type === 'countdown') {
              return (
                <div key={idx} className="absolute z-30 pointer-events-none" style={layerStyle}>
                  <div className="w-full flex items-center justify-center">
                    <div
                      className="flex flex-col items-center gap-0.5 bg-black/85 backdrop-blur-md border border-[#00FF66]/40 rounded-xl px-4 py-2 shadow-lg whitespace-nowrap"
                      style={{ fontSize: `${(sticker.width || 50) * 0.075}cqw` }}
                    >
                      <span className="font-bold text-[#00FF66] uppercase tracking-wide" style={{ fontSize: '0.6em' }}>
                        {sticker.data?.label}
                      </span>
                      <span className="font-extrabold text-white tabular-nums" style={{ fontSize: '1em' }}>
                        {formatCountdown(sticker.data?.targetIso)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }

            if (sticker.type === 'music') {
              const width = sticker.width || 46;
              return (
                <div key={idx} className="absolute z-30 pointer-events-none" style={layerStyle}>
                  <div className="w-full flex items-center justify-center">
                    <div
                      className="inline-flex items-center gap-1.5 bg-black/80 backdrop-blur-md border border-white/20 rounded-full pl-1 pr-3 py-1 shadow-lg whitespace-nowrap"
                      style={{ fontSize: `${width * 0.08}cqw` }}
                    >
                      {sticker.data?.coverUrl ? (
                        <img src={sticker.data.coverUrl} alt="" className="rounded-full object-cover shrink-0" style={{ width: '1.8em', height: '1.8em' }} />
                      ) : (
                        <div className="rounded-full bg-neutral-800 flex items-center justify-center shrink-0" style={{ width: '1.8em', height: '1.8em' }}>
                          <Music style={{ width: '1em', height: '1em' }} className="text-white" />
                        </div>
                      )}
                      <span className="font-semibold text-white truncate" style={{ fontSize: '1em', maxWidth: '14em' }}>
                        {sticker.data?.title}{sticker.data?.artist ? ` · ${sticker.data.artist}` : ''}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }

            if (sticker.type === 'question') {
              const key = `${story.id}:${idx}`;
              const sent = !!questionSent[key];
              const answers = questionResults[key] || [];
              const resultsOpen = openQuestionResultsKey === key;
              return (
                <div key={idx} className="absolute z-30 pointer-events-auto" style={layerStyle} onClick={(e) => e.stopPropagation()}>
                  <div
                    className="w-full bg-gradient-to-br from-fuchsia-500 via-purple-500 to-indigo-500 rounded-2xl p-3 shadow-lg text-center cursor-pointer"
                    style={{ fontSize: `${(sticker.width || 62) * 0.06}cqw` }}
                    onClick={() => isOwnStory && openQuestionResults(idx)}
                  >
                    <p className="font-bold text-white/80" style={{ fontSize: '0.75em' }}>Question</p>
                    <p className="font-extrabold text-white mt-0.5 line-clamp-3" style={{ fontSize: '1em' }}>
                      {sticker.data?.prompt}
                    </p>
                  </div>

                  {!isOwnStory && !sent && (
                    <div className="mt-1.5 flex items-center gap-1.5" style={{ fontSize: `${(sticker.width || 62) * 0.045}cqw` }}>
                      <input
                        value={questionDrafts[key] || ''}
                        onChange={(e) => setQuestionDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitQuestionAnswer(idx); }}
                        placeholder="Type your answer..."
                        maxLength={500}
                        className="flex-1 min-w-0 bg-black/70 backdrop-blur-md border border-white/20 rounded-full px-3 py-1.5 text-white outline-none focus:border-[#00FF66]"
                        style={{ fontSize: '1em' }}
                      />
                      <button
                        onClick={() => handleSubmitQuestionAnswer(idx)}
                        disabled={!(questionDrafts[key] || '').trim()}
                        className="p-2 rounded-full bg-[#00FF66] text-black disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
                      >
                        <Send style={{ width: '1em', height: '1em' }} />
                      </button>
                    </div>
                  )}
                  {!isOwnStory && sent && (
                    <p className="mt-1.5 text-center text-[#00FF66] font-bold" style={{ fontSize: `${(sticker.width || 62) * 0.045}cqw` }}>
                      Sent ✓
                    </p>
                  )}
                  {!isOwnStory && questionError && (
                    <p className="mt-1 text-center text-red-400" style={{ fontSize: `${(sticker.width || 62) * 0.04}cqw` }}>{questionError}</p>
                  )}

                  {isOwnStory && resultsOpen && (
                    <div className="mt-1.5 max-w-[260px] max-h-48 overflow-y-auto bg-black/90 backdrop-blur-md border border-white/20 rounded-xl p-2 space-y-1.5">
                      {questionResultsLoading && <p className="text-[10px] text-center text-white/60 py-2">Loading…</p>}
                      {!questionResultsLoading && answers.length === 0 && (
                        <p className="text-[10px] text-center text-white/60 py-2">No answers yet.</p>
                      )}
                      {answers.map((a) => (
                        <div key={a.id} className="flex items-start gap-1.5">
                          <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 mt-0.5">
                            <AvatarMedia src={a.avatar} className="w-full h-full object-cover" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold text-white/70">@{a.username}</p>
                            <p className="text-[11px] text-white break-words">{a.answer}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            if (sticker.type === 'text') {
              return (
                <div key={idx} className="absolute z-30 pointer-events-none" style={layerStyle}>
                  <p
                    className="font-extrabold text-center whitespace-pre-wrap break-words"
                    style={{
                      color: sticker.data?.color || '#FFFFFF',
                      fontSize: `${(sticker.width || 60) * 0.12}cqw`,
                      textShadow: '0 2px 6px rgba(0,0,0,0.6), 0 0 2px rgba(0,0,0,0.85)',
                    }}
                  >
                    {sticker.data?.text}
                  </p>
                </div>
              );
            }

            if (sticker.type === 'sticker') {
              const width = sticker.width || (sticker.data?.kind === 'emoji' ? 26 : 42);
              return (
                <div key={idx} className="absolute z-30 pointer-events-none" style={layerStyle}>
                  {sticker.data?.kind === 'emoji' ? (
                    <span className="block text-center leading-none" style={{ fontSize: `${width * 0.22}cqw` }}>
                      {sticker.data?.content}
                    </span>
                  ) : (
                    <img src={sticker.data?.content} alt="" className="w-full h-auto rounded-lg" />
                  )}
                </div>
              );
            }

            if (sticker.type === 'mention') {
              return (
                <div key={idx} className="absolute z-30 pointer-events-auto" style={layerStyle}>
                  <div className="w-full flex items-center justify-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); goToProfile(sticker.data?.userId); }}
                      className="inline-flex items-center gap-1.5 bg-black/80 backdrop-blur-md border border-[#3B82F6]/50 rounded-full pl-1 pr-3 py-1 shadow-lg whitespace-nowrap cursor-pointer"
                      style={{ fontSize: `${(sticker.width || 42) * 0.1}cqw` }}
                    >
                      <div className="rounded-full overflow-hidden shrink-0" style={{ width: '1.8em', height: '1.8em' }}>
                        <AvatarMedia src={sticker.data?.avatar} className="w-full h-full object-cover" />
                      </div>
                      <span className="font-semibold text-white" style={{ fontSize: '1em' }}>@{sticker.data?.username}</span>
                    </button>
                  </div>
                </div>
              );
            }

            if (sticker.type === 'hashtag') {
              return (
                <div key={idx} className="absolute z-30 pointer-events-auto" style={layerStyle}>
                  <div className="w-full flex items-center justify-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); onNavigateToHashtag?.(sticker.data?.tag); }}
                      className="inline-flex items-center gap-1 bg-black/80 backdrop-blur-md border border-[#00FF66]/40 rounded-full px-3 py-1.5 shadow-lg whitespace-nowrap cursor-pointer"
                      style={{ fontSize: `${(sticker.width || 40) * 0.1}cqw` }}
                    >
                      <span className="font-semibold text-[#00FF66]" style={{ fontSize: '1em' }}>#{sticker.data?.tag}</span>
                    </button>
                  </div>
                </div>
              );
            }

            if (sticker.type === 'link') {
              return (
                <div key={idx} className="absolute z-30 pointer-events-auto" style={layerStyle}>
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

            if (sticker.type === 'poll') {
              const options: string[] = Array.isArray(sticker.data?.options) ? sticker.data.options : [];
              const result = pollResults[`${story.id}:${idx}`];
              const myVote = result?.myVote ?? null;
              // Real numbers from the database: shown once you've voted (the owner always sees them).
              const showResults = !!result && (myVote !== null || isOwnStory);
              const total = result?.total || 0;
              const voters = isOwnStory ? result?.voters || [] : [];
              return (
                <div
                  key={idx}
                  className="absolute z-30 max-w-[260px] w-full bg-black/85 backdrop-blur-md border border-[#00FF66]/40 rounded-xl p-3 shadow-xl pointer-events-auto"
                  style={layerStyle}
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-xs font-bold text-center text-white mb-2.5">{sticker.data.question}</p>
                  <div className="space-y-1.5">
                    {options.map((opt: string, optIdx: number) => {
                      const count = result?.counts?.[optIdx] || 0;
                      const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                      const chosen = myVote === optIdx;
                      return (
                        <button
                          key={optIdx}
                          onClick={() => handleVotePoll(idx, optIdx, options.length)}
                          className={`relative overflow-hidden w-full py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                            chosen ? 'text-black ring-1 ring-white bg-neutral-800/90' : 'bg-neutral-800/90 text-white hover:bg-neutral-700'
                          }`}
                        >
                          {showResults && (
                            <span
                              aria-hidden
                              className={`absolute inset-y-0 left-0 transition-all duration-500 ${chosen ? 'bg-[#00FF66]' : 'bg-white/15'}`}
                              style={{ width: `${percentage}%` }}
                            />
                          )}
                          <span className={`relative ${chosen && percentage < 40 ? 'text-white' : ''}`}>{opt}</span>
                          {showResults && <span className={`relative ${chosen && percentage < 85 ? 'text-white' : ''}`}>{percentage}%</span>}
                        </button>
                      );
                    })}
                  </div>
                  {showResults && (
                    <p className="text-[10px] text-center text-white/60 mt-2">
                      {total === 1 ? '1 vote' : `${total} votes`}
                    </p>
                  )}
                  {voters.length > 0 && (
                    <div className="mt-2 max-h-24 overflow-y-auto space-y-0.5 border-t border-white/10 pt-1.5">
                      {voters.map((v, i) => (
                        <p key={i} className="text-[10px] text-white/80 flex justify-between gap-2">
                          <span className="truncate">@{v.username}</span>
                          <span className="text-white/50 truncate">{options[v.option] ?? ''}</span>
                        </p>
                      ))}
                    </div>
                  )}
                  {pollError && <p className="text-[10px] text-center text-red-400 mt-2">{pollError}</p>}
                </div>
              );
            }

            if (sticker.type === 'quiz') {
              return (
                <div
                  key={idx}
                  className="absolute z-30 max-w-[260px] w-full bg-black/85 backdrop-blur-md border border-purple-500/40 rounded-xl p-3 shadow-xl pointer-events-auto"
                  style={layerStyle}
                >
                  <span className="text-[10px] text-purple-400 font-bold uppercase tracking-wider block text-center mb-1">
                    Quiz Challenge
                  </span>
                  <p className="text-xs font-bold text-center text-white mb-2">{sticker.data.question}</p>
                  <div className="space-y-1.5">
                    {sticker.data.options.map((opt: string, oIdx: number) => (
                      <button
                        key={oIdx}
                        onClick={() => handleQuizAnswer(oIdx)}
                        className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold text-left transition-all ${
                          quizSelected === oIdx
                            ? oIdx === sticker.data.correctIndex
                              ? 'bg-[#00FF66] text-black'
                              : 'bg-red-500 text-white'
                            : 'bg-neutral-800/90 text-white hover:bg-neutral-700'
                        }`}
                      >
                        {String.fromCharCode(65 + oIdx)}. {opt}
                      </button>
                    ))}
                  </div>
                </div>
              );
            }

            if (sticker.type === 'add_yours') {
              return (
                <div
                  key={idx}
                  className="absolute z-30 bg-black/80 backdrop-blur-md border border-pink-500/40 rounded-xl px-3.5 py-2 shadow-lg flex items-center gap-2 pointer-events-auto"
                  style={layerStyle}
                >
                  <Sparkles className="w-4 h-4 text-pink-400 animate-pulse" />
                  <div>
                    <span className="text-[10px] font-bold text-pink-400 uppercase tracking-tight block">Add Yours</span>
                    <span className="text-xs text-white font-medium">{sticker.data.prompt}</span>
                  </div>
                </div>
              );
            }

            if (sticker.type === 'slider') {
              return (
                <div
                  key={idx}
                  className="absolute z-30 max-w-[220px] w-full bg-black/85 backdrop-blur-md border border-orange-500/40 rounded-xl p-3 shadow-xl pointer-events-auto text-center"
                  style={layerStyle}
                >
                  <p className="text-xs font-bold text-white mb-2">{sticker.data.question}</p>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={sliderVal}
                    onChange={(e) => setSliderVal(Number(e.target.value))}
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                  <span className="text-lg mt-1 inline-block">{sticker.data.emoji} {sliderVal}%</span>
                </div>
              );
            }

            if (sticker.type === 'location') {
              const locWidth = sticker.width || 44;
              return (
                <div key={idx} className="absolute z-30 pointer-events-auto" style={layerStyle}>
                  <div className="w-full flex items-center justify-center">
                    <div
                      className="inline-flex items-center gap-1.5 bg-black/80 backdrop-blur-md border border-[#00FF66]/40 rounded-full px-3 py-1.5 shadow-lg whitespace-nowrap"
                      style={{ fontSize: `${locWidth * 0.1}cqw` }}
                    >
                      <MapPin className="shrink-0 text-[#00FF66]" style={{ width: '1.1em', height: '1.1em' }} />
                      <span className="font-semibold text-white" style={{ fontSize: '1em' }}>
                        {sticker.data.name}
                      </span>
                      {sticker.data.weather && (
                        <span className="text-gray-300" style={{ fontSize: '0.8em' }}>({sticker.data.weather})</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            }

            return null;
          })}

          {/* Left/Right Tap Zones for Mobile Navigation */}
          <div
            className="absolute inset-y-0 left-0 w-1/3 z-20 cursor-pointer"
            onClick={handlePrev}
          />
          <div
            className="absolute inset-y-0 right-0 w-1/3 z-20 cursor-pointer"
            onClick={handleNext}
          />
        </div>

        {/* Existing Story Comments Overlay List */}
        {effectiveStory.comments && effectiveStory.comments.length > 0 && (
          <div className="absolute bottom-16 inset-x-3 z-30 max-h-24 overflow-y-auto space-y-1 pr-2 no-scrollbar">
            {effectiveStory.comments.filter(Boolean).map((c) => (
              <div key={c.id} className="bg-black/75 backdrop-blur-sm border border-neutral-800 rounded-lg px-2.5 py-1 text-xs text-gray-200 flex items-center gap-2">
                <span className="font-bold text-[#00FF66]">@{c.username}:</span>
                <span translate="no" className="truncate">{c.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Story Bottom Bar: reply input for a viewer, "Seen by" for the owner — works the same way
            for a highlight, since its original story row (and every like/comment on it) is kept
            forever now instead of being deleted with the rest of the live 24h tray. */}
        {isOwnStory ? (
          <div className="absolute bottom-3 inset-x-3 z-30">
            <button
              onClick={() => {
                setIsPaused(true);
                setShowViewersSheet(true);
              }}
              className="flex items-center gap-1.5 bg-black/80 backdrop-blur-md border border-neutral-700 rounded-full px-3.5 py-1.5 text-white/90 hover:text-white cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="text-xs font-semibold">Seen by {(effectiveStory.viewedBy?.length || 0).toLocaleString()}</span>
            </button>
          </div>
        ) : (
          <div className="absolute bottom-3 inset-x-3 z-30 flex items-center gap-2">
            <form onSubmit={handleSendComment} className="flex-1 flex items-center bg-black/80 backdrop-blur-md border border-neutral-700 rounded-full px-3.5 py-1.5 focus-within:border-[#00FF66]">
              <input
                type="text"
                placeholder={`Reply to ${story.username}...`}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onFocus={() => setIsCommentFocused(true)}
                onBlur={() => setIsCommentFocused(false)}
                className="w-full bg-transparent text-xs text-white placeholder-gray-400 focus:outline-none"
              />
              {commentText.trim() && (
                <button type="submit" className="text-[#00FF66] hover:text-emerald-400 ml-1.5 cursor-pointer">
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}
            </form>

            <button
              onClick={() => {
                if (!story) return;
                const id = story.id;
                const wasLiked = isLiked;
                setLikedStoryIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id); else next.add(id);
                  return next;
                });
                if (!wasLiked) {
                  confetti({ particleCount: 30, spread: 45, origin: { y: 0.85 } });
                  setLikeBurstKey((k) => k + 1);
                }
                toggleStoryLike(id).then((res) => {
                  if (!res.success) {
                    // Roll back — the server rejected it (story expired, no longer visible, etc.)
                    setLikedStoryIds((prev) => {
                      const next = new Set(prev);
                      if (wasLiked) next.add(id); else next.delete(id);
                      return next;
                    });
                    return;
                  }
                  // Tell the parent so its own `stories` state stays correct — otherwise this is
                  // only ever true until the viewer is closed and reopened.
                  onToggleLike?.(id, !!res.isLiked, res.likesCount ?? 0);
                });
              }}
              className={`relative p-2 rounded-full bg-black/80 backdrop-blur-md border border-neutral-700 cursor-pointer transition-transform ${
                isLiked ? 'text-red-500 scale-110' : 'text-white/80 hover:text-white'
              }`}
            >
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
              <LikeReactionBurst emoji={reactionEmojiForCategory(undefined)} burstKey={likeBurstKey} />
            </button>
          </div>
        )}

        {showViewersSheet && (
          <LikesViewsSheet
            views={{ label: 'Seen By', fetchUsers: () => fetchStoryViewers(story.id) }}
            onClose={() => {
              setShowViewersSheet(false);
              setIsPaused(false);
            }}
          />
        )}
      </div>
    </div>
  );
};
