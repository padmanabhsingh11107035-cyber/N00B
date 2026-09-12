import React, { useEffect, useRef, useState } from 'react';
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  MoreHorizontal,
  MapPin,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Volume2,
  Tag,
  ShieldCheck,
  Archive,
  MessageSquareOff,
  EyeOff,
  Trash2
} from 'lucide-react';
import { Post, User } from '../../types';
import confetti from 'canvas-confetti';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import { FullscreenAvatarModal } from '../Common/FullscreenAvatarModal';
import { LikesViewsSheet } from '../Common/LikesViewsSheet';
import { fetchPostLikers } from '../../services/api';

interface PostCardProps {
  post: Post;
  currentUser: User;
  onToggleLike: (postId: string) => void;
  onToggleSave: (postId: string) => void;
  onOpenComments: (post: Post) => void;
  onSharePost: (post: Post) => void;
  onToggleArchive: (postId: string) => void;
  onToggleComments: (postId: string) => void;
  onToggleLikeCount: (postId: string) => void;
  onDeletePost: (postId: string) => void;
  onHideAd?: (postId: string) => void;
  onSelectCategory?: (category: string) => void;
}

export const PostCard: React.FC<PostCardProps> = ({
  post,
  currentUser,
  onToggleLike,
  onToggleSave,
  onOpenComments,
  onSharePost,
  onToggleArchive,
  onToggleComments,
  onToggleLikeCount,
  onDeletePost,
  onHideAd,
  onSelectCategory
}) => {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showDoubleTapHeart, setShowDoubleTapHeart] = useState(false);
  const [isCaptionExpanded, setIsCaptionExpanded] = useState(false);
  const [showFullscreenAvatar, setShowFullscreenAvatar] = useState(false);
  const [showLikesSheet, setShowLikesSheet] = useState(false);

  const isOwner = post.userId === currentUser.id || post.username === currentUser.username;
  const hasSlides = post.slides && post.slides.length > 0 && post.slides[0]?.mediaUrl;
  const currentSlide = hasSlides ? (post.slides[currentSlideIndex] || post.slides[0]) : null;
  const [showTagPill, setShowTagPill] = useState(false);

  const primaryTaggedUser = post.taggedUsers && post.taggedUsers.length > 0 
    ? post.taggedUsers[0] 
    : post.collabUsername 
    ? {
        username: post.collabUsername,
        displayName: post.collabUserDisplayName || post.collabUsername,
        avatar: post.collabUserAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'
      }
    : null;

  // Only the current slide's <img> is ever mounted, so switching slides used
  // to mean a fresh network fetch on every arrow click, with the old image
  // stuck on screen until it landed — feeling "stuck"/slow on anything but a
  // fast connection. Warming the browser's image cache for every slide as
  // soon as the post renders means later clicks just paint an already-loaded
  // image instantly.
  useEffect(() => {
    if (!post.slides || post.slides.length <= 1) return;
    post.slides.forEach((slide) => {
      if (slide.mediaUrl && slide.mediaType !== 'video') {
        const img = new Image();
        img.src = slide.mediaUrl;
      }
    });
  }, [post.slides]);

  const handleDoubleTap = () => {
    if (!post.isLiked) {
      onToggleLike(post.id);
    }
    setShowDoubleTapHeart(true);
    confetti({ particleCount: 25, spread: 50, origin: { y: 0.6 } });
    setTimeout(() => {
      setShowDoubleTapHeart(false);
    }, 850);
  };

  const handleNextSlide = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (post.slides && currentSlideIndex < post.slides.length - 1) {
      setCurrentSlideIndex(currentSlideIndex + 1);
    }
  };

  const handlePrevSlide = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(currentSlideIndex - 1);
    }
  };

  // Swipe-to-navigate the carousel on touch devices — tracked entirely in a
  // ref (not state) so a drag never re-renders anything until the gesture
  // actually ends and the slide index changes just once. The axis is locked
  // on first move so a horizontal swipe claims the gesture (stopping it from
  // reaching FeedView's own vertical pull-to-refresh handler above it),
  // while a vertical drag is left alone to fall through to that handler.
  const SWIPE_THRESHOLD = 40;
  const carouselTouchRef = useRef<{ startX: number; startY: number; horizontal: boolean | null } | null>(null);

  const handleCarouselTouchStart = (e: React.TouchEvent) => {
    carouselTouchRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      horizontal: null
    };
  };
  const handleCarouselTouchMove = (e: React.TouchEvent) => {
    const t = carouselTouchRef.current;
    if (!t) return;
    const dx = e.touches[0].clientX - t.startX;
    const dy = e.touches[0].clientY - t.startY;
    if (t.horizontal === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      t.horizontal = Math.abs(dx) > Math.abs(dy);
    }
    if (t.horizontal) e.stopPropagation();
  };
  const handleCarouselTouchEnd = (e: React.TouchEvent) => {
    const t = carouselTouchRef.current;
    carouselTouchRef.current = null;
    if (!t || !t.horizontal || !post.slides) return;
    const dx = e.changedTouches[0].clientX - t.startX;
    if (dx <= -SWIPE_THRESHOLD && currentSlideIndex < post.slides.length - 1) {
      setCurrentSlideIndex(currentSlideIndex + 1);
    } else if (dx >= SWIPE_THRESHOLD && currentSlideIndex > 0) {
      setCurrentSlideIndex(currentSlideIndex - 1);
    }
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
      id={`post-card-${post.id}`}
      className="w-full bg-zinc-900/40 border border-white/5 rounded-3xl overflow-hidden mb-4 shadow-xl backdrop-blur-sm transition-all"
    >
      {/* 1. Post Header (Dual Overlapping Avatars for Tagged / Collab Posts - Instagram Style) */}
      <header className="flex items-center justify-between px-3.5 py-3 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          {/* Dual Overlapping Avatars Container */}
          <div className="relative flex items-center">
            <div
              onClick={() => setShowFullscreenAvatar(true)}
              className="w-9 h-9 rounded-full p-[1.5px] bg-gradient-to-tr from-green-500 via-blue-500 to-purple-500 cursor-pointer hover:scale-105 transition-transform"
              title="View full-size avatar"
            >
              <img
                src={post.userAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                alt={post.username}
                className="w-full h-full rounded-full object-cover"
                referrerPolicy="no-referrer"
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

          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-white tracking-tight hover:underline cursor-pointer">
                {post.displayName || post.username}
              </span>
              {post.isVerified && <VerifiedBadge size="sm" />}

              {/* Instagram-style joint author line */}
              {primaryTaggedUser && (
                <>
                  <span className="text-[11px] text-zinc-400 font-medium">and</span>
                  <span className="text-xs font-bold text-[#00FF66] flex items-center gap-1 hover:underline cursor-pointer">
                    @{primaryTaggedUser.username}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 text-[10px] text-zinc-400">
              {post.location ? (
                <div className="flex items-center gap-1">
                  <MapPin className="w-2.5 h-2.5 text-[#00FF66]" />
                  <span className="truncate max-w-[150px]">{post.location}</span>
                </div>
              ) : (
                <span>@{post.username}</span>
              )}

              {post.category && (
                <>
                  <span>•</span>
                  <span className="capitalize text-zinc-300 font-semibold">{post.category}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Options Menu Toggle */}
        <div className="relative">
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
              {isOwner && (
                <>
                  <button
                    onClick={() => {
                      onToggleArchive(post.id);
                      setShowOptionsMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800 flex items-center gap-2 cursor-pointer"
                  >
                    <Archive className="w-4 h-4 text-[#00FF66]" /> {post.isArchived ? 'Unarchive Post' : 'Archive Post'}
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
                  <button
                    onClick={() => {
                      onDeletePost(post.id);
                      setShowOptionsMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-zinc-800 flex items-center gap-2 border-t border-zinc-800 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" /> Delete Post
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(window.location.href);
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
          className="relative w-full aspect-[4/5] bg-black flex items-center justify-center overflow-hidden cursor-pointer select-none group"
          onDoubleClick={handleDoubleTap}
          onTouchStart={post.slides && post.slides.length > 1 ? handleCarouselTouchStart : undefined}
          onTouchMove={post.slides && post.slides.length > 1 ? handleCarouselTouchMove : undefined}
          onTouchEnd={post.slides && post.slides.length > 1 ? handleCarouselTouchEnd : undefined}
        >
          <img
            src={currentSlide.mediaUrl}
            alt={currentSlide.caption || post.caption}
            className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.01] ${currentSlide.filter || ''}`}
            referrerPolicy="no-referrer"
            loading="lazy"
          />

          {/* Double-tap animated heart pop */}
          {showDoubleTapHeart && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 animate-ping">
              <Heart className="w-24 h-24 text-red-500 fill-red-500 drop-shadow-2xl" />
            </div>
          )}

          {/* Tagged user floating button (Instagram style) */}
          {primaryTaggedUser && (
            <div className="absolute bottom-3 left-3 z-20">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTagPill(!showTagPill);
                }}
                className="px-2.5 py-1 rounded-full bg-black/80 hover:bg-black text-white text-[10px] font-bold backdrop-blur-md border border-white/20 flex items-center gap-1.5 shadow-lg transition-transform hover:scale-105"
              >
                <Tag className="w-3 h-3 text-[#00FF66]" />
                <span>@{primaryTaggedUser.username}</span>
              </button>

              {/* Tag popover bubble */}
              {showTagPill && (
                <div className="absolute bottom-9 left-0 bg-black/95 text-white p-2 rounded-xl border border-[#00FF66]/50 shadow-2xl backdrop-blur-xl flex items-center gap-2 min-w-[140px] animate-in zoom-in-90 duration-150">
                  <img
                    src={primaryTaggedUser.avatar}
                    alt={primaryTaggedUser.username}
                    className="w-6 h-6 rounded-full object-cover ring-1 ring-[#00FF66]"
                  />
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold block truncate">
                      {primaryTaggedUser.displayName || primaryTaggedUser.username}
                    </span>
                    <span className="text-[9px] text-[#00FF66] block">Tagged Profile</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Carousel Multi-slide Arrows (if > 1 slide) */}
          {post.slides && post.slides.length > 1 && (
            <>
              {currentSlideIndex > 0 && (
                <button
                  onClick={handlePrevSlide}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/70 hover:bg-black text-white backdrop-blur-md z-20 transition-transform hover:scale-110 border border-white/10"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              {currentSlideIndex < post.slides.length - 1 && (
                <button
                  onClick={handleNextSlide}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/70 hover:bg-black text-white backdrop-blur-md z-20 transition-transform hover:scale-110 border border-white/10"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}

              {/* Slide Index Badge (e.g. 1/3) */}
              <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md border border-white/10 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white z-20">
                {currentSlideIndex + 1}/{post.slides.length}
              </div>
            </>
          )}

          {/* Product / LiDAR Tag Indicator */}
          {currentSlide.productTags && currentSlide.productTags.length > 0 && (
            <div className="absolute bottom-3 right-3 bg-black/80 backdrop-blur-md border border-green-500/40 rounded-xl px-2.5 py-1 text-[10px] text-[#00FF66] flex items-center gap-1.5 shadow-lg">
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
          <p className="text-base sm:text-lg font-medium leading-relaxed whitespace-pre-line break-words">
            {post.caption}
          </p>

          {primaryTaggedUser && (
            <div className="mt-4 pt-3 border-t border-white/10 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-zinc-400">Co-authored with:</span>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-xs font-bold text-[#00FF66]">
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
              onClick={() => onToggleLike(post.id)}
              className={`transition-transform active:scale-125 cursor-pointer ${
                post.isLiked ? 'text-red-500' : 'text-white hover:text-zinc-300'
              }`}
              title={post.isLiked ? 'Unlike' : 'Like'}
            >
              <Heart className={`w-6 h-6 ${post.isLiked ? 'fill-current stroke-red-500' : 'stroke-current'}`} />
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

            {/* Share to Direct Messages */}
            <button
              id={`share-btn-${post.id}`}
              onClick={() => onSharePost(post)}
              className="text-white hover:text-zinc-300 transition-colors cursor-pointer"
              title="Share via Direct Message"
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
                    idx === currentSlideIndex ? 'w-4 bg-[#00FF66]' : 'w-1.5 bg-zinc-700'
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
              post.isSaved ? 'text-[#00FF66]' : 'text-white hover:text-zinc-300'
            }`}
            title={post.isSaved ? 'Remove from Saved' : 'Save to Collection'}
          >
            <Bookmark className={`w-6 h-6 ${post.isSaved ? 'fill-current stroke-[#00FF66]' : 'stroke-current'}`} />
          </button>
        </div>

        {/* Like Counts */}
        {!post.isLikeCountHidden && (
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
          <span className="font-bold text-white mr-1.5 cursor-pointer hover:underline">
            {post.username}
          </span>
          <span className={`whitespace-pre-line leading-relaxed ${!isCaptionExpanded ? 'line-clamp-2' : ''}`}>
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
          <div className="mt-1 text-[11px] text-[#00FF66] italic flex items-center gap-1">
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
                className="text-[11px] text-[#00FF66]/80 hover:text-[#00FF66] hover:underline cursor-pointer"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Outbound Link for Meta-Verified Users */}
        {post.webLink && (
          <a
            href={post.webLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-[#00FF66] hover:underline mt-1.5 font-medium"
          >
            <ExternalLink className="w-3 h-3" /> {post.webLink}
          </a>
        )}

        {/* Audio Track Tag */}
        {post.audioTrack && (
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 mt-2 bg-zinc-900/80 rounded-full px-2.5 py-1 w-fit border border-white/5">
            <Volume2 className="w-3 h-3 text-[#00FF66] animate-pulse" />
            <span className="truncate max-w-[220px]">{post.audioTrack}</span>
          </div>
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

        {/* Timestamp */}
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mt-1 pb-1">
          {post.createdAt}
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
          title="Liked by"
          fetchUsers={() => fetchPostLikers(post.id)}
          onClose={() => setShowLikesSheet(false)}
        />
      )}
    </article>
  );
};
