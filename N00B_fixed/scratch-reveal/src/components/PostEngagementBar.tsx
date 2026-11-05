import React, { useState } from 'react';
import {
  Heart,
  ThumbsUp,
  Flame,
  Rocket,
  Skull,
  MessageCircle,
  Bookmark,
  Share2,
  Download,
  Check,
} from 'lucide-react';
import { ScratchPost } from '../types/scratch';

interface PostEngagementBarProps {
  post: ScratchPost;
  onOpenComments: () => void;
  onDownloadCard: () => void;
}

export const PostEngagementBar: React.FC<PostEngagementBarProps> = ({
  post,
  onOpenComments,
  onDownloadCard,
}) => {
  const [likes, setLikes] = useState(post.likes);
  const [hasLiked, setHasLiked] = useState(false);

  const [thumbsUp, setThumbsUp] = useState(post.thumbsUp);
  const [hasThumbed, setHasThumbed] = useState(false);

  const [flames, setFlames] = useState(post.flames);
  const [hasFlamed, setHasFlamed] = useState(false);

  const [rockets, setRockets] = useState(post.rockets);
  const [hasRocketed, setHasRocketed] = useState(false);

  const [skulls, setSkulls] = useState(post.skulls);
  const [hasSkulled, setHasSkulled] = useState(false);

  const [isSaved, setIsSaved] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleLike = () => {
    setLikes((prev) => (hasLiked ? prev - 1 : prev + 1));
    setHasLiked(!hasLiked);
  };

  const handleThumb = () => {
    setThumbsUp((prev) => (hasThumbed ? prev - 1 : prev + 1));
    setHasThumbed(!hasThumbed);
  };

  const handleFlame = () => {
    setFlames((prev) => (hasFlamed ? prev - 1 : prev + 1));
    setHasFlamed(!hasFlamed);
  };

  const handleRocket = () => {
    setRockets((prev) => (hasRocketed ? prev - 1 : prev + 1));
    setHasRocketed(!hasRocketed);
  };

  const handleSkull = () => {
    setSkulls((prev) => (hasSkulled ? prev - 1 : prev + 1));
    setHasSkulled(!hasSkulled);
  };

  const handleSave = () => {
    setIsSaved(!isSaved);
  };

  const handleShare = () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(window.location.href).catch(() => {});
      }
    } catch {
      // ignore
    }
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="w-full flex flex-col gap-2.5 mt-3 select-none">
      {/* Primary Interaction Row (5 Equal, Cleanly Organized Reaction Buttons in Distinct Shapes) */}
      <div className="grid grid-cols-5 gap-1.5 p-1.5 bg-[#121217] rounded-2xl border-2 border-white shadow-[3px_3px_0px_0px_#ffffff] box-border overflow-hidden">
        {/* Button 1: Heart Reaction (Shape Pebble 1) */}
        <button
          type="button"
          aria-label="React with Heart"
          title="Give Love"
          onClick={handleLike}
          className={`h-9 w-full flex items-center justify-center gap-1 shape-pebble-1 border-2 transition-all active:scale-95 ${
            hasLiked
              ? 'bg-rose-500 border-white text-white shadow-[1px_1px_0px_0px_#ffffff]'
              : 'bg-black border-zinc-700 text-zinc-300 hover:border-white'
          }`}
        >
          <Heart className={`w-3.5 h-3.5 shrink-0 ${hasLiked ? 'fill-current text-white' : 'text-rose-400'}`} />
          <span className="text-[11px] font-marker leading-none">{likes}</span>
        </button>

        {/* Button 2: Thumbs Up Reaction (Shape Pebble 2) */}
        <button
          type="button"
          aria-label="React with Thumbs Up"
          title="Approve"
          onClick={handleThumb}
          className={`h-9 w-full flex items-center justify-center gap-1 shape-pebble-2 border-2 transition-all active:scale-95 ${
            hasThumbed
              ? 'bg-emerald-500 border-white text-black shadow-[1px_1px_0px_0px_#ffffff]'
              : 'bg-black border-zinc-700 text-zinc-300 hover:border-white'
          }`}
        >
          <ThumbsUp className={`w-3.5 h-3.5 shrink-0 ${hasThumbed ? 'fill-current text-black' : 'text-emerald-400'}`} />
          <span className="text-[11px] font-marker leading-none">{thumbsUp}</span>
        </button>

        {/* Button 3: Flame Reaction (Shape Shield - Strictly Bounded) */}
        <button
          type="button"
          aria-label="React with Lit Flame"
          title="Hot Reveal"
          onClick={handleFlame}
          className={`h-9 w-full flex items-center justify-center gap-1 shape-shield border-2 transition-all active:scale-95 ${
            hasFlamed
              ? 'bg-amber-500 border-white text-black shadow-[1px_1px_0px_0px_#ffffff]'
              : 'bg-black border-zinc-700 text-zinc-300 hover:border-white'
          }`}
        >
          <Flame className={`w-3.5 h-3.5 shrink-0 ${hasFlamed ? 'fill-current text-black' : 'text-amber-400'}`} />
          <span className="text-[11px] font-marker leading-none">{flames}</span>
        </button>

        {/* Button 4: Rocket Reaction (Shape Pill / Capsule) */}
        <button
          type="button"
          aria-label="React with Rocket"
          title="To The Moon"
          onClick={handleRocket}
          className={`h-9 w-full flex items-center justify-center gap-1 shape-pill border-2 transition-all active:scale-95 ${
            hasRocketed
              ? 'bg-indigo-600 border-white text-white shadow-[1px_1px_0px_0px_#ffffff]'
              : 'bg-black border-zinc-700 text-zinc-300 hover:border-white'
          }`}
        >
          <Rocket className={`w-3.5 h-3.5 shrink-0 ${hasRocketed ? 'fill-current text-white' : 'text-indigo-400'}`} />
          <span className="text-[11px] font-marker leading-none">{rockets}</span>
        </button>

        {/* Button 5: Skull Reaction (Shape Chamfer Polygon) */}
        <button
          type="button"
          aria-label="React with Skull"
          title="Dead / Funny"
          onClick={handleSkull}
          className={`h-9 w-full flex items-center justify-center gap-1 shape-chamfer border-2 transition-all active:scale-95 ${
            hasSkulled
              ? 'bg-zinc-300 border-white text-black shadow-[1px_1px_0px_0px_#ffffff]'
              : 'bg-black border-zinc-700 text-zinc-300 hover:border-white'
          }`}
        >
          <Skull className={`w-3.5 h-3.5 shrink-0 ${hasSkulled ? 'text-black' : 'text-zinc-400'}`} />
          <span className="text-[11px] font-marker leading-none">{skulls}</span>
        </button>
      </div>

      {/* Secondary Action Row: Comments, Bookmark, Share, Download (Unified Heights, Distinct Shapes) */}
      <div className="flex items-center gap-2">
        {/* Button 6: Comments / Notes Button (Shape Squircle) */}
        <button
          type="button"
          aria-label="Open Scratch Comments Drawer"
          title="View and leave chalk notes"
          onClick={onOpenComments}
          className="flex-1 h-10 px-3 bg-[#121217] hover:bg-zinc-800 text-white shape-squircle border-2 border-white shadow-[2px_2px_0px_0px_#ffffff] flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <MessageCircle className="w-4 h-4 text-cyan-300 shrink-0" />
          <span className="text-xs font-marker leading-none">
            {post.comments.length} Notes
          </span>
        </button>

        {/* Button 7: Bookmark Button (Shape Octagon) */}
        <button
          type="button"
          aria-label={isSaved ? 'Remove from Saved Cards' : 'Save to Scratchbook'}
          title="Save card"
          onClick={handleSave}
          className={`w-10 h-10 shrink-0 flex items-center justify-center shape-octagon border-2 transition-all ${
            isSaved
              ? 'bg-yellow-400 text-black border-white shadow-[2px_2px_0px_0px_#ffffff]'
              : 'bg-[#121217] text-zinc-300 hover:text-white border-white shadow-[2px_2px_0px_0px_#ffffff]'
          } active:scale-95`}
        >
          <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
        </button>

        {/* Button 8: Share Link Button (Shape Hexagon) */}
        <button
          type="button"
          aria-label="Share Scratch Card Link"
          title="Copy link"
          onClick={handleShare}
          className="w-10 h-10 shrink-0 flex items-center justify-center shape-hexagon bg-[#121217] hover:bg-zinc-800 text-zinc-300 hover:text-white border-2 border-white shadow-[2px_2px_0px_0px_#ffffff] active:scale-95 transition-all"
        >
          {copiedLink ? (
            <Check className="w-4 h-4 text-emerald-400" />
          ) : (
            <Share2 className="w-4 h-4 text-white" />
          )}
        </button>

        {/* Button 9: Download Postcard Button (Shape Stamp) */}
        <button
          type="button"
          aria-label="Download Scratch Card Image"
          title="Download photo"
          onClick={onDownloadCard}
          className="w-10 h-10 shrink-0 flex items-center justify-center shape-stamp bg-[#121217] hover:bg-zinc-800 text-amber-300 hover:text-amber-200 border-2 border-white shadow-[2px_2px_0px_0px_#ffffff] active:scale-95 transition-all"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {copiedLink && (
        <div className="text-center text-[11px] font-doodle text-emerald-300 py-1 bg-emerald-950/60 border border-emerald-400 rounded-lg animate-in fade-in">
          ✓ Link copied to clipboard!
        </div>
      )}
    </div>
  );
};
