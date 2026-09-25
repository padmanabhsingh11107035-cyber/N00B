import React, { useState, useEffect, useRef } from 'react';
import { can } from '../../adminAccess';
import { X, ChevronLeft, ChevronRight, Heart, Send, Sparkles, MessageCircle, MapPin, Check, Volume2, VolumeX, Eye, MoreVertical, Trash2, Pencil } from 'lucide-react';
import { Story, User } from '../../types';
import { recordStoryView, toggleStoryLike, fetchStoryById, addCommentToStory, fetchStoryViewers, fetchUserById } from '../../services/api';
import { formatRelativeTime } from '../../utils/formatTime';
import { LikesViewsSheet } from '../Common/LikesViewsSheet';
import confetti from 'canvas-confetti';
import { useScreenshotAlert } from '../../utils/useScreenshotAlert';

interface StoryViewerModalProps {
  stories: Story[];
  initialIndex: number;
  onClose: () => void;
  currentUser: User;
  onAddComment: (storyId: string, text: string) => void;
  onDeleteStory?: (storyId: string) => void;
  onNavigateToProfile?: (user: User) => void;
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
  onDeleteStory,
  onNavigateToProfile,
  isHighlight = false,
  onEditHighlight
}) => {
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
  // A highlight's items are a fixed snapshot (media/stickers/when it was posted) with no
  // comments/likes baked in — those keep changing after the fact, so they're fetched live per item
  // here and layered on top, keyed by story id so switching pages/reopening the same one is instant.
  const [liveById, setLiveById] = useState<Record<string, Story>>({});
  const [isMuted, setIsMuted] = useState(false);
  const [pollVoted, setPollVoted] = useState<number | null>(null);
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
    setPollVoted(null);
    setQuizSelected(null);
  }, [currentIndex]);

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

  const handleVotePoll = (index: number) => {
    setPollVoted(index);
    confetti({ particleCount: 40, spread: 50, origin: { y: 0.5 } });
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
            <img
              src={story.userAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
              alt={story.username}
              className="w-9 h-9 rounded-full object-cover ring-2 ring-[#00FF66]"
              referrerPolicy="no-referrer"
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
        <div className="relative w-full h-full flex items-center justify-center bg-black">
          <img
            src={story.mediaUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80'}
            alt="Story content"
            className="w-full h-full object-contain"
            referrerPolicy="no-referrer"
          />

          {/* Interactive Stickers Overlay */}
          {story.stickers?.map((sticker, idx) => {
            if (sticker.type === 'poll') {
              return (
                <div
                  key={idx}
                  className="absolute z-30 max-w-[260px] w-full bg-black/85 backdrop-blur-md border border-[#00FF66]/40 rounded-xl p-3 shadow-xl pointer-events-auto"
                  style={{ top: `${sticker.y}%`, left: '50%', transform: 'translate(-50%, -50%)' }}
                >
                  <p className="text-xs font-bold text-center text-white mb-2.5">{sticker.data.question}</p>
                  <div className="space-y-1.5">
                    {sticker.data.options.map((opt: string, optIdx: number) => {
                      const percentage = pollVoted !== null ? (optIdx === pollVoted ? 68 : 32) : null;
                      return (
                        <button
                          key={optIdx}
                          onClick={() => handleVotePoll(optIdx)}
                          className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-between transition-all ${
                            pollVoted === optIdx
                              ? 'bg-[#00FF66] text-black ring-1 ring-white'
                              : 'bg-neutral-800/90 text-white hover:bg-neutral-700'
                          }`}
                        >
                          <span>{opt}</span>
                          {percentage !== null && <span>{percentage}%</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            }

            if (sticker.type === 'quiz') {
              return (
                <div
                  key={idx}
                  className="absolute z-30 max-w-[260px] w-full bg-black/85 backdrop-blur-md border border-purple-500/40 rounded-xl p-3 shadow-xl pointer-events-auto"
                  style={{ top: `${sticker.y}%`, left: '50%', transform: 'translate(-50%, -50%)' }}
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
                  style={{ top: `${sticker.y}%`, left: '50%', transform: 'translate(-50%, -50%)' }}
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
                  style={{ top: `${sticker.y}%`, left: '50%', transform: 'translate(-50%, -50%)' }}
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
              return (
                <div
                  key={idx}
                  className="absolute z-30 bg-black/80 backdrop-blur-md border border-[#00FF66]/40 rounded-full px-3 py-1 shadow-lg flex items-center gap-1.5 pointer-events-auto"
                  style={{ top: `${sticker.y}%`, left: '50%', transform: 'translate(-50%, -50%)' }}
                >
                  <MapPin className="w-3.5 h-3.5 text-[#00FF66]" />
                  <span className="text-xs font-semibold text-white">{sticker.data.name}</span>
                  {sticker.data.weather && <span className="text-[10px] text-gray-300">({sticker.data.weather})</span>}
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
                }
                toggleStoryLike(id).then((res) => {
                  if (!res.success) {
                    // Roll back — the server rejected it (story expired, no longer visible, etc.)
                    setLikedStoryIds((prev) => {
                      const next = new Set(prev);
                      if (wasLiked) next.add(id); else next.delete(id);
                      return next;
                    });
                  }
                });
              }}
              className={`p-2 rounded-full bg-black/80 backdrop-blur-md border border-neutral-700 cursor-pointer transition-transform ${
                isLiked ? 'text-red-500 scale-110' : 'text-white/80 hover:text-white'
              }`}
            >
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
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
