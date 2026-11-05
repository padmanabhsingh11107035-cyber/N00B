import React, { useState } from 'react';
import { ScratchPost } from '../types/scratch';
import { ScratchCanvas } from './ScratchCanvas';
import { PostEngagementBar } from './PostEngagementBar';
import { ScratchTool, FoilType } from '../utils/scratchEngine';
import {
  ShieldCheck,
  Tag,
  Sparkles,
  RefreshCw,
  Eye,
} from 'lucide-react';

interface FeedPostCardProps {
  post: ScratchPost;
  currentTool: ScratchTool;
  brushMultiplier: number;
  foilType: FoilType;
  soundEnabled: boolean;
  onOpenComments: (post: ScratchPost) => void;
}

export const FeedPostCard: React.FC<FeedPostCardProps> = ({
  post,
  currentTool,
  brushMultiplier,
  foilType,
  soundEnabled,
  onOpenComments,
}) => {
  const [clearedPct, setClearedPct] = useState(0);
  const [resealCount, setResealCount] = useState(0);
  const [magicRevealCount, setMagicRevealCount] = useState(0);
  const [isPeeking, setIsPeeking] = useState(false);

  const handleReseal = () => {
    setResealCount((prev) => prev + 1);
    setClearedPct(0);
  };

  const handleMagicReveal = () => {
    setMagicRevealCount((prev) => prev + 1);
  };

  const handlePeek = () => {
    setIsPeeking(true);
    setTimeout(() => {
      setIsPeeking(false);
    }, 1500);
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = post.imageSrc;
    link.download = `noob-scratch-${post.id}.jpg`;
    link.target = '_blank';
    link.click();
  };

  return (
    <article className="w-full bg-[#0d0d12] border-2 border-white rounded-3xl p-4 sm:p-5 shadow-[5px_5px_0px_0px_#ffffff] transition-all mb-8">
      {/* Post Author Header */}
      <div className="flex items-center justify-between mb-3 select-none">
        <div className="flex items-center gap-3">
          <img
            src={post.authorAvatar}
            alt={post.authorName}
            className="w-10 h-10 rounded-full border-2 border-white object-cover"
          />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-marker text-sm text-white">
                {post.authorName}
              </span>
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="flex items-center gap-1.5 text-xs font-doodle text-zinc-400">
              <span>{post.authorHandle}</span>
              <span>•</span>
              <span>{post.timestamp}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {clearedPct === 100 && (
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400 text-[10px] font-marker text-emerald-300">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              Revealed
            </span>
          )}
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-black border border-white/40 text-xs font-mono text-zinc-300">
            <Tag className="w-3 h-3 text-yellow-300" />
            <span>{post.category}</span>
          </div>
        </div>
      </div>

      {/* Post Title & Hint */}
      <div className="mb-3 select-none">
        <h3 className="font-marker text-base text-white mb-0.5">{post.title}</h3>
        <p className="font-doodle text-xs text-yellow-300 flex items-center justify-between">
          <span>💡 {post.hint}</span>
          <span className="text-zinc-400 font-mono text-[11px]">
            {clearedPct === 100 ? '100% Unveiled' : 'Scratch a little to unveil'}
          </span>
        </p>
      </div>

      {/* Streamlined In-Card Controls (Peek, Reseal, Instant Reveal) */}
      <div className="w-full flex items-center justify-between gap-2 mb-2.5 select-none box-border">
        <div className="flex items-center gap-1.5 text-xs font-doodle text-zinc-300">
          <span className="text-yellow-400">★</span>
          <span>{clearedPct === 100 ? 'Photo Revealed!' : 'Scratch with finger or mouse'}</span>
        </div>

        {/* Right: Peek, Reseal, Instant Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Button: X-Ray Peek */}
          <button
            type="button"
            aria-label={`X-Ray Peek ${post.title}`}
            title="Sneak peek through foil for 1.5s"
            onClick={handlePeek}
            className="h-7 px-2.5 shape-chamfer bg-black border-2 border-white/60 text-[11px] font-marker text-cyan-300 hover:border-white active:scale-95 transition-all flex items-center gap-1 shadow-[1px_1px_0px_0px_#ffffff]"
          >
            <Eye className="w-3 h-3" />
            <span>Peek</span>
          </button>

          {/* Button: Reseal Card */}
          <button
            type="button"
            aria-label={`Reseal foil on ${post.title}`}
            title="Re-seal foil to scratch again"
            onClick={handleReseal}
            className="h-7 px-2.5 shape-octagon bg-black border-2 border-white/60 text-[11px] font-marker text-zinc-200 hover:border-white active:scale-95 transition-all flex items-center gap-1 shadow-[1px_1px_0px_0px_#ffffff]"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Reseal</span>
          </button>

          {/* Button: Magic Reveal */}
          <button
            type="button"
            aria-label={`Instant reveal ${post.title}`}
            title="Instant full scratch reveal"
            onClick={handleMagicReveal}
            className="h-7 px-2.5 shape-pill bg-yellow-400 text-black border-2 border-black text-[11px] font-marker active:scale-95 transition-all flex items-center gap-1 shadow-[1px_1px_0px_0px_#ffffff]"
          >
            <Sparkles className="w-3 h-3" />
            <span>Instant</span>
          </button>
        </div>
      </div>

      {/* The Interactive Scratch Canvas */}
      <div className="w-full">
        <ScratchCanvas
          imageSrc={post.imageSrc}
          tool={currentTool}
          brushMultiplier={brushMultiplier}
          foilType={foilType}
          soundEnabled={soundEnabled}
          isPeeking={isPeeking}
          onPercentageChange={setClearedPct}
          resealTrigger={resealCount}
          magicRevealTrigger={magicRevealCount}
        />
      </div>

      {/* Post Social Engagement Reactions Bar */}
      <PostEngagementBar
        post={post}
        onOpenComments={() => onOpenComments(post)}
        onDownloadCard={handleDownload}
      />
    </article>
  );
};
