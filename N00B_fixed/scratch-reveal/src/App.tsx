/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { DoodleBackground } from './components/DoodleBackground';
import { FeedPostCard } from './components/FeedPostCard';
import { CommentsDrawer } from './components/CommentsDrawer';
import { UploadModal } from './components/UploadModal';
import { INITIAL_POSTS } from './data/mockPosts';
import { ScratchPost, BrushSize } from './types/scratch';
import { SCRATCH_TOOLS, ScratchTool, FoilType } from './utils/scratchEngine';
import { Sparkles, Plus, Share2, Check, Volume2, VolumeX, Coins, Key, Wand2, Disc } from 'lucide-react';

export default function App() {
  const [posts, setPosts] = useState<ScratchPost[]>(INITIAL_POSTS);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [copiedFeedLink, setCopiedFeedLink] = useState(false);

  // Scratch card settings
  const [currentTool, setCurrentTool] = useState<ScratchTool>(SCRATCH_TOOLS.coin);
  const [brushSize] = useState<BrushSize>('medium');
  const [foilType] = useState<FoilType>('doodle');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Modals state
  const [activeCommentsPost, setActiveCommentsPost] = useState<ScratchPost | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const brushMultiplier =
    brushSize === 'small' ? 0.6 : brushSize === 'large' ? 1.9 : 1.0;

  const categories = ['All', 'Music', 'Fashion', 'Cute', 'Photography'];

  const filteredPosts =
    selectedCategory === 'All'
      ? posts
      : posts.filter((p) =>
          p.category.toLowerCase().includes(selectedCategory.toLowerCase())
        );

  const handleAddPost = (newPost: ScratchPost) => {
    setPosts([newPost, ...posts]);
  };

  const handleShareFeed = () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(window.location.href).catch(() => {});
      }
    } catch {
      // ignore
    }
    setCopiedFeedLink(true);
    setTimeout(() => setCopiedFeedLink(false), 2000);
  };

  const handleAddComment = (text: string) => {
    if (!activeCommentsPost) return;
    const newComment = {
      id: `c-${Date.now()}`,
      author: 'You',
      avatar:
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80',
      text,
      time: 'Just now',
    };

    setPosts((prevPosts) =>
      prevPosts.map((p) =>
        p.id === activeCommentsPost.id
          ? {
              ...p,
              commentsCount: p.commentsCount + 1,
              comments: [newComment, ...p.comments],
            }
          : p
      )
    );

    setActiveCommentsPost((prev) =>
      prev
        ? {
            ...prev,
            commentsCount: prev.commentsCount + 1,
            comments: [newComment, ...prev.comments],
          }
        : null
    );
  };

  return (
    <div className="min-h-screen bg-black text-white relative flex flex-col font-sans selection:bg-white selection:text-black">
      {/* Background with chalkboard doodle pattern */}
      <DoodleBackground />

      {/* Main Page Container (Native In-App Feed) */}
      <main className="relative z-10 flex-1 flex flex-col items-center pt-4 pb-12 px-3 sm:px-6 max-w-2xl w-full mx-auto">
        {/* TOP HEADER BANNER (with Plus, Share, and Sound Controls) */}
        <header className="w-full mb-3 p-3 sm:p-4 bg-[#111116] border-2 border-white rounded-2xl shadow-[4px_4px_0px_0px_#ffffff] flex items-center justify-between gap-2.5 box-border overflow-hidden">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <span className="text-xl sm:text-2xl text-amber-300 drop-shadow-[0_0_8px_rgba(252,211,77,0.6)] shrink-0">
              ✦
            </span>
            <div className="min-w-0">
              <h1 className="font-marker text-[11px] sm:text-sm text-white tracking-wide uppercase leading-tight">
                NOOB SOCIALS: SCRATCH-TO-REVEAL ENGINE
              </h1>
              <p className="font-doodle text-[10px] sm:text-xs text-zinc-300 mt-0.5 leading-snug">
                Swipe your finger or mouse over the foil to unveil secret photos
              </p>
            </div>
          </div>

          {/* Right Header Action Buttons: Plus Icon, Share Button, Sound Toggle, and Interactive Badge */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 select-none">
            {/* Sound FX Toggle Button (Shape Squircle) */}
            <button
              type="button"
              aria-label={soundEnabled ? "Mute scratch sounds" : "Enable scratch sounds"}
              title={soundEnabled ? "Mute scratch sound FX" : "Enable scratch sound FX"}
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center shape-squircle bg-black text-zinc-300 hover:text-white border-2 border-white shadow-[2px_2px_0px_0px_#ffffff] active:scale-95 transition-all"
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-zinc-500" />
              )}
            </button>

            {/* Plus Icon Button to upload/post (Shape Octagon) */}
            <button
              type="button"
              aria-label="Upload New Mystery Photo"
              title="Post a new scratch photo card"
              onClick={() => setIsUploadOpen(true)}
              className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center shape-octagon bg-white text-black font-marker border-2 border-white shadow-[2px_2px_0px_0px_#ffffff] hover:bg-zinc-200 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
            </button>

            {/* Share Feed Button (Shape Chamfer) */}
            <button
              type="button"
              aria-label="Share Feed"
              title="Share Feed"
              onClick={handleShareFeed}
              className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center shape-chamfer bg-black text-white border-2 border-white shadow-[2px_2px_0px_0px_#ffffff] hover:bg-zinc-800 active:scale-95 transition-all"
            >
              {copiedFeedLink ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Share2 className="w-4 h-4 text-white" />
              )}
            </button>

            {/* Interactive Badge */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-yellow-400 text-black font-marker text-xs rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_#ffffff]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>INTERACTIVE</span>
            </div>
          </div>
        </header>

        {/* Toast indicator for Share */}
        {copiedFeedLink && (
          <div className="w-full mb-3 py-1.5 px-3 bg-emerald-950/80 border-2 border-emerald-400 rounded-xl text-center text-xs font-doodle text-emerald-300 shadow-[2px_2px_0px_0px_#10b981] animate-in fade-in">
            ✓ Feed link copied! Share with your friends.
          </div>
        )}

        {/* FEED FILTER & SCRATCH EDGE SELECTOR STRIP */}
        <div className="w-full mb-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 select-none">
          {/* Categories */}
          <nav
            aria-label="Feed filter"
            className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none"
          >
            <span className="text-[11px] font-marker uppercase text-zinc-400 whitespace-nowrap mr-0.5">
              FEED:
            </span>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                aria-label={`Filter by ${cat}`}
                onClick={() => setSelectedCategory(cat)}
                className={`h-8 px-3 rounded-full border-2 text-xs whitespace-nowrap transition-all active:scale-95 ${
                  selectedCategory === cat
                    ? 'bg-white text-black border-white shadow-[2px_2px_0px_0px_#ffffff] font-marker'
                    : 'bg-[#121217] text-zinc-300 border-zinc-700 hover:border-white font-sans'
                }`}
              >
                <strong className="font-marker uppercase">{cat}</strong>
              </button>
            ))}
          </nav>

          {/* Quick Tool Edge Picker (Hexagon, Teardrop, Diamond, Pick) */}
          <div className="flex items-center justify-end gap-1.5 shrink-0 bg-[#121217] px-2.5 py-1 rounded-2xl border-2 border-white shadow-[2px_2px_0px_0px_#ffffff]">
            <span className="text-[10px] font-marker uppercase text-zinc-400 mr-1">
              EDGE:
            </span>
            <button
              type="button"
              aria-label="Select Lucky Coin Edge"
              title="Lucky Coin (Wide)"
              onClick={() => setCurrentTool(SCRATCH_TOOLS.coin)}
              className={`w-7 h-7 flex items-center justify-center shape-hexagon border-2 transition-all active:scale-95 ${
                currentTool.id === 'coin'
                  ? 'bg-amber-400 text-black border-white shadow-[1px_1px_0px_0px_#ffffff]'
                  : 'bg-black text-zinc-400 border-zinc-700 hover:border-white hover:text-white'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label="Select Brass Car Key Edge"
              title="Car Key (Sharp)"
              onClick={() => setCurrentTool(SCRATCH_TOOLS.key)}
              className={`w-7 h-7 flex items-center justify-center shape-teardrop border-2 transition-all active:scale-95 ${
                currentTool.id === 'key'
                  ? 'bg-cyan-400 text-black border-white shadow-[1px_1px_0px_0px_#ffffff]'
                  : 'bg-black text-zinc-400 border-zinc-700 hover:border-white hover:text-white'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label="Select Magic Wand Edge"
              title="Magic Wand (Sparkle)"
              onClick={() => setCurrentTool(SCRATCH_TOOLS.magic_wand)}
              className={`w-7 h-7 flex items-center justify-center shape-diamond border-2 transition-all active:scale-95 ${
                currentTool.id === 'magic_wand'
                  ? 'bg-purple-400 text-black border-white shadow-[1px_1px_0px_0px_#ffffff]'
                  : 'bg-black text-zinc-400 border-zinc-700 hover:border-white hover:text-white'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label="Select Celluloid Guitar Pick Edge"
              title="Guitar Pick (Smooth)"
              onClick={() => setCurrentTool(SCRATCH_TOOLS.guitar_pick)}
              className={`w-7 h-7 flex items-center justify-center shape-pick border-2 transition-all active:scale-95 ${
                currentTool.id === 'guitar_pick'
                  ? 'bg-pink-400 text-black border-white shadow-[1px_1px_0px_0px_#ffffff]'
                  : 'bg-black text-zinc-400 border-zinc-700 hover:border-white hover:text-white'
              }`}
            >
              <Disc className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* THE VERTICAL SCRATCH PHOTO FEED */}
        <section aria-label="Scratch card feed" className="w-full flex flex-col">
          {filteredPosts.map((post) => (
            <FeedPostCard
              key={post.id}
              post={post}
              currentTool={currentTool}
              brushMultiplier={brushMultiplier}
              foilType={foilType}
              soundEnabled={soundEnabled}
              onOpenComments={(p) => setActiveCommentsPost(p)}
            />
          ))}

          {filteredPosts.length === 0 && (
            <div className="text-center py-12 p-6 rounded-3xl bg-[#0d0d12] border-2 border-white shadow-[4px_4px_0px_0px_#ffffff]">
              <p className="font-marker text-sm text-white mb-1">
                No secret cards in this category yet!
              </p>
              <p className="font-doodle text-xs text-zinc-400 mb-4">
                Be the first to upload and seal a photo with mystery foil.
              </p>
              <button
                type="button"
                onClick={() => setIsUploadOpen(true)}
                className="px-4 py-2 bg-yellow-400 text-black font-marker text-xs rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_#ffffff]"
              >
                + Post a Scratch Card
              </button>
            </div>
          )}
        </section>
      </main>

      {/* Comments Drawer */}
      {activeCommentsPost && (
        <CommentsDrawer
          post={activeCommentsPost}
          isOpen={Boolean(activeCommentsPost)}
          onClose={() => setActiveCommentsPost(null)}
          onAddComment={handleAddComment}
        />
      )}

      {/* Custom Photo Upload Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onAddPost={handleAddPost}
      />
    </div>
  );
}
