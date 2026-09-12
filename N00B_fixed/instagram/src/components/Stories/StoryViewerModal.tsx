import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Heart, Send, Sparkles, MessageCircle, MapPin, Check, Volume2, VolumeX, Eye, MoreVertical } from 'lucide-react';
import { Story, User } from '../../types';
import { recordStoryView, fetchStoryViewers } from '../../services/api';
import { LikesViewsSheet } from '../Common/LikesViewsSheet';
import confetti from 'canvas-confetti';

interface StoryViewerModalProps {
  stories: Story[];
  initialIndex: number;
  onClose: () => void;
  currentUser: User;
  onAddComment: (storyId: string, text: string) => void;
}

export const StoryViewerModal: React.FC<StoryViewerModalProps> = ({
  stories,
  initialIndex,
  onClose,
  currentUser,
  onAddComment
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isLiked, setIsLiked] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [pollVoted, setPollVoted] = useState<number | null>(null);
  const [quizSelected, setQuizSelected] = useState<number | null>(null);
  const [sliderVal, setSliderVal] = useState(75);
  const [showViewersSheet, setShowViewersSheet] = useState(false);

  const story = stories[currentIndex];
  const isOwnStory = !!story && story.userId === currentUser.id;

  useEffect(() => {
    setProgress(0);
    setPollVoted(null);
    setQuizSelected(null);
  }, [currentIndex]);

  // Record a view the moment this story becomes the active one — skipped
  // for the owner's own story, same as the reel view-recording pattern
  // (recordReelView on currentReel change).
  useEffect(() => {
    if (!story || story.userId === currentUser.id) return;
    recordStoryView(story.id).catch(() => {});
  }, [story?.id, currentUser.id]);

  useEffect(() => {
    if (isPaused || !story || showViewersSheet) return;

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
  }, [isPaused, currentIndex, stories.length, onClose, story, showViewersSheet]);

  if (!story) return null;

  const handleNext = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleSendComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    onAddComment(story.id, commentText.trim());
    setCommentText('');
    setIsPaused(false);
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
          <div className="flex items-center gap-2.5">
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
              <span className="text-[11px] text-gray-300">{story.createdAt}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-1.5 rounded-full bg-black/40 text-white/80 hover:text-white"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            {isOwnStory && (
              <button
                onClick={() => {
                  setIsPaused(true);
                  setShowViewersSheet(true);
                }}
                className="p-1.5 rounded-full bg-black/40 text-white/80 hover:text-white"
                title="Seen By"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Story Media */}
        <div className="relative w-full h-full flex items-center justify-center bg-black">
          <img
            src={story.mediaUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80'}
            alt="Story content"
            className="w-full h-full object-cover"
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
        {story.comments && story.comments.length > 0 && (
          <div className="absolute bottom-16 inset-x-3 z-30 max-h-24 overflow-y-auto space-y-1 pr-2 no-scrollbar">
            {story.comments.filter(Boolean).map((c) => (
              <div key={c.id} className="bg-black/75 backdrop-blur-sm border border-neutral-800 rounded-lg px-2.5 py-1 text-xs text-gray-200 flex items-center gap-2">
                <span className="font-bold text-[#00FF66]">@{c.username}:</span>
                <span className="truncate">{c.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Story Bottom Bar: reply input for a viewer, "Seen by" for the owner */}
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
              <span className="text-xs font-semibold">Seen by {(story.viewedBy?.length || 0).toLocaleString()}</span>
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
                onFocus={() => setIsPaused(true)}
                onBlur={() => setIsPaused(false)}
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
                setIsLiked(!isLiked);
                if (!isLiked) {
                  confetti({ particleCount: 30, spread: 45, origin: { y: 0.85 } });
                }
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
