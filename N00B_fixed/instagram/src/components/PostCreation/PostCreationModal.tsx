import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Plus,
  Image as ImageIcon,
  Video as VideoIcon,
  Sparkles,
  MapPin,
  Tag,
  Trash2,
  Sliders,
  Upload,
  Film,
  UserPlus,
  Users,
  Search,
  Check,
  Globe,
  Palette,
  Eye,
  EyeOff,
  MessageSquareOff,
  Link2,
  Calendar,
  Layers,
  Heart
} from 'lucide-react';
import { Post, PostSlide, Reel, User } from '../../types';
import { uploadMediaFile } from '../../services/api';
import { analyzeMediaFile } from '../../utils/mediaAnalyzer';
import confetti from 'canvas-confetti';
import { VerifiedBadge } from '../Common/VerifiedBadge';

interface PostCreationModalProps {
  currentUser: User;
  allUsers?: User[];
  onClose: () => void;
  onSubmitPost: (data: { isReel?: boolean; reelData?: Partial<Reel>; postData?: Partial<Post> }) => Promise<void>;
}

const FILTERS = [
  { id: 'normal', name: 'Normal', style: '' },
  { id: 'emerald', name: 'Emerald Glow', style: 'hue-rotate-60 contrast-125 saturate-150' },
  { id: 'cyber', name: 'Cyber Neon', style: 'hue-rotate-180 contrast-150 brightness-110' },
  { id: 'gala', name: 'GALA Preset', style: 'contrast-110 sepia-25 brightness-105' },
  { id: 'monochrome', name: 'Monochrome', style: 'grayscale contrast-125' },
  { id: 'clarendon', name: 'Clarendon', style: 'contrast-125 saturate-125' },
  { id: 'juno', name: 'Juno', style: 'contrast-115 saturate-140' }
];

const TEXT_BACKGROUNDS = [
  { id: 'clean', name: 'Default Dark', bgClass: 'bg-zinc-950 border-zinc-800 text-white' },
  { id: 'emerald', name: 'Emerald Cyber', bgClass: 'bg-gradient-to-br from-emerald-950 via-zinc-950 to-green-900/40 border-emerald-500/40 text-emerald-100' },
  { id: 'cyber', name: 'Neon Cyberpunk', bgClass: 'bg-gradient-to-br from-purple-950 via-zinc-950 to-cyan-950 border-cyan-500/40 text-cyan-100' },
  { id: 'flame', name: 'Sunset Flame', bgClass: 'bg-gradient-to-br from-rose-950 via-zinc-950 to-amber-950 border-rose-500/40 text-rose-100' },
  { id: 'slate', name: 'Obsidian Minimal', bgClass: 'bg-zinc-900 border-zinc-700 text-zinc-100' }
];

export const PostCreationModal: React.FC<PostCreationModalProps> = ({
  currentUser,
  allUsers = [],
  onClose,
  onSubmitPost
}) => {
  // Creation Mode: Post (Image Only) vs Reel (Video Only)
  const [creationType, setCreationType] = useState<'post' | 'reel'>('post');

  // Main text content / caption
  const [caption, setCaption] = useState('');
  
  // Media attachments
  const [mediaMode, setMediaMode] = useState<'text' | 'photos' | 'video'>('photos');
  const [slides, setSlides] = useState<PostSlide[]>([]);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState('normal');
  const [selectedTextBg, setSelectedTextBg] = useState('clean');
  
  // Video data (Reels)
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [videoObjectKey, setVideoObjectKey] = useState<string>('');
  const [musicTitle, setMusicTitle] = useState('Original Sound • ' + (currentUser.displayName || currentUser.username));
  
  // User Tagging / Instagram-style Collaboration
  const [taggedUser, setTaggedUser] = useState<User | null>(null);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [isTaggingOpen, setIsTaggingOpen] = useState(false);
  const [customTagUsername, setCustomTagUsername] = useState('');
  const [atMentionQuery, setAtMentionQuery] = useState<string | null>(null);
  const [atMentionCursorPos, setAtMentionCursorPos] = useState<number>(0);
  const captionTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Location & Metadata
  const [location, setLocation] = useState('');
  const [hashtags, setHashtags] = useState(''); // Cleared by default, completely optional
  const [category, setCategory] = useState<string>(''); // Blank by default, compulsory!
  const [categoryError, setCategoryError] = useState(false);
  
  // Advanced Controls / Additional Settings
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [webLink, setWebLink] = useState('');
  const [hideLikes, setHideLikes] = useState(false);
  const [disableComments, setDisableComments] = useState(false);
  const [hasAiLabel, setHasAiLabel] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');

  // Uploading state & UI feedback
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [uploadStatusMsg, setUploadStatusMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const activeSlide = slides[activeSlideIndex] || slides[0];

  // Filter users for tagging
  const availableUsersToTag = allUsers.filter(
    (u) =>
      u.id !== currentUser.id &&
      u.username !== currentUser.username &&
      (tagSearchQuery.trim() === '' ||
        u.username.toLowerCase().includes(tagSearchQuery.toLowerCase()) ||
        u.displayName?.toLowerCase().includes(tagSearchQuery.toLowerCase()))
  );

  const handleSelectTaggedUser = (user: User) => {
    setTaggedUser(user);
    setIsTaggingOpen(false);
    setTagSearchQuery('');
  };

  const handleApplyCustomTag = () => {
    if (customTagUsername.trim()) {
      const clean = customTagUsername.trim().replace(/^@/, '');
      setTaggedUser({
        id: `custom_${clean}`,
        username: clean,
        displayName: clean,
        avatar: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80`,
        accountType: 'public',
        isVerified: false,
        followersCount: 120,
        followingCount: 80,
        postsCount: 5,
        isBusiness: false,
        privacySettings: { hideTaggedPhotos: false, blockedWords: [] },
        bio: `Member @${clean}`
      });
      setIsTaggingOpen(false);
      setCustomTagUsername('');
    }
  };

  const handleRemoveTaggedUser = () => {
    setTaggedUser(null);
  };

  const handleDeviceMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>, forceType?: 'image' | 'video') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingMedia(true);
    setUploadStatusMsg('Processing media file...');

    try {
      const firstFile = files[0];
      const analysis = analyzeMediaFile(firstFile);

      if (forceType === 'video' || analysis.destination === 'reels' || analysis.mediaType === 'video') {
        // The file itself is authoritative — always route to Reels here even
        // if it was picked from the "Create Post" tab's file input (mobile
        // OS file pickers don't reliably honor the accept="image/*" filter).
        setCreationType('reel');
        setMediaMode('video');
        setUploadStatusMsg(`Verified video format (${analysis.mimeType}) • Ready for Reels`);
        const res = await uploadMediaFile(firstFile, 'reels');
        if (res.url) {
          setVideoUrl(res.url);
        }
        if (res.objectKey) {
          setVideoObjectKey(res.objectKey);
        }
      } else {
        setCreationType('post');
        setMediaMode('photos');
        setUploadStatusMsg(`Adding photo attachments (${files.length} file${files.length > 1 ? 's' : ''})`);
        
        for (let i = 0; i < files.length; i++) {
          if (slides.length + i >= 20) break;
          const file = files[i];
          const fileAnalysis = analyzeMediaFile(file);
          if (fileAnalysis.isValid) {
            const res = await uploadMediaFile(file, 'posts');
            if (res.url) {
              const newSlide: PostSlide = {
                id: `slide_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
                mediaUrl: res.url,
                objectKey: res.objectKey,
                mediaType: 'image',
                caption: ''
              };
              setSlides((prev) => [...prev, newSlide]);
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to upload file:', err);
      setUploadStatusMsg('Upload failed. Please try again.');
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleRemoveSlide = (index: number) => {
    const updated = slides.filter((_, i) => i !== index);
    setSlides(updated);
    if (updated.length === 0) {
      setMediaMode('text');
    } else {
      setActiveSlideIndex(Math.max(0, index - 1));
    }
  };

  const handleRemoveVideo = () => {
    setVideoUrl('');
    setVideoObjectKey('');
    setMediaMode('text');
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Content Category is blank but COMPULSORY
    if (!category || category.trim() === '') {
      setCategoryError(true);
      return;
    }
    setCategoryError(false);

    if (creationType === 'reel' && !videoObjectKey) {
      alert('Please upload a video file for your Reel.');
      return;
    }

    if (creationType === 'post' && !caption.trim() && slides.length === 0) {
      alert('Please add a photo or write a caption for your Post.');
      return;
    }

    const parsedHashtags = hashtags.trim()
      ? hashtags
          .split(' ')
          .filter((h) => h.trim().length > 0)
          .map((h) => (h.startsWith('#') ? h : `#${h}`))
      : [];

    setIsPublishing(true);
    try {
      // If Reel Mode -> Video only
      if (creationType === 'reel') {
        await onSubmitPost({
          isReel: true,
          reelData: {
          videoUrl: videoObjectKey,
          caption: caption.trim() || 'New Reel ✨',
          hashtags: parsedHashtags,
          category: category as any,
          musicTitle,
          likesCount: 0,
          commentsCount: 0,
          viewsCount: 1,
          isLiked: false,
          isSaved: false,
          isCollab: !!taggedUser,
          collabUsername: taggedUser?.username,
          collabUserAvatar: taggedUser?.avatar,
          collabUserDisplayName: taggedUser?.displayName,
          taggedUsers: taggedUser
            ? [
                {
                  userId: taggedUser.id,
                  username: taggedUser.username,
                  displayName: taggedUser.displayName,
                  avatar: taggedUser.avatar
                }
              ]
            : undefined,
          webLink: webLink.trim() || undefined
        }
      });
      } else {
        // Post Mode -> Image only
        await onSubmitPost({
          isReel: false,
          postData: {
          caption: caption.trim(),
          location: location.trim() || undefined,
          slides: slides.map((s) => ({
            ...s,
            mediaUrl: s.objectKey || s.mediaUrl,
            filter: selectedFilter
          })),
          hashtags: parsedHashtags,
          category: category as any,
          textBgStyle: mediaMode === 'text' ? selectedTextBg : undefined,
          webLink: webLink.trim() || undefined,
          isCollab: !!taggedUser,
          collabUsername: taggedUser?.username,
          collabUserAvatar: taggedUser?.avatar,
          collabUserDisplayName: taggedUser?.displayName,
          taggedUsers: taggedUser
            ? [
                {
                  userId: taggedUser.id,
                  username: taggedUser.username,
                  displayName: taggedUser.displayName,
                  avatar: taggedUser.avatar
                }
              ]
            : undefined,
          hasAiLabel,
          isLikeCountHidden: hideLikes,
          isCommentsDisabled: disableComments,
          scheduledFor: scheduledFor || undefined
          }
        });
      }

      confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });
      onClose();
    } catch (err: any) {
      alert(err?.message || 'Failed to publish. Please try again.');
    } finally {
      setIsPublishing(false);
    }
  };

  const isReadyToSubmit =
    category.trim().length > 0 &&
    (creationType === 'reel' ? !!videoUrl : caption.trim().length > 0 || slides.length > 0);

  return (
    <div
      id="post-creation-modal"
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4 md:p-6 overflow-y-auto"
    >
      <div className="w-full max-w-2xl bg-[#0f0f0f] border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[94vh] animate-in zoom-in-95 duration-200 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-800/80 bg-neutral-900/60 sticky top-0 z-20 backdrop-blur-md">
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1.5 rounded-full hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Cancel"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="text-center">
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center justify-center gap-1.5">
              <span>{creationType === 'reel' ? 'Create Reel' : 'Create Post'}</span>
              {creationType === 'reel' ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase tracking-wider">
                  🎬 Video Only
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#00FF66]/20 text-[#00FF66] border border-[#00FF66]/30 uppercase tracking-wider">
                  📸 Image Only
                </span>
              )}
            </h3>
          </div>

          <button
            onClick={handlePublish}
            disabled={!isReadyToSubmit || isUploadingMedia || isPublishing}
            className="px-4 py-1.5 bg-[#00FF66] disabled:opacity-40 disabled:hover:scale-100 text-black text-xs font-black rounded-full hover:scale-105 transition-all shadow-md shadow-[#00FF66]/30 cursor-pointer"
          >
            {isPublishing ? 'Publishing...' : creationType === 'reel' ? 'Share Reel' : 'Share Post'}
          </button>
        </div>

        {/* 2 Clear Options: Create Post (Image Only) vs Create Reel (Video Only) */}
        <div className="p-3 bg-neutral-950/80 border-b border-neutral-800/80 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setCreationType('post');
              setMediaMode(slides.length > 0 ? 'photos' : 'text');
            }}
            className={`flex-1 py-2.5 px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              creationType === 'post'
                ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border-2 border-[#00FF66] text-[#00FF66] shadow-md shadow-[#00FF66]/10'
                : 'bg-neutral-900 border border-neutral-800 text-zinc-400 hover:text-white hover:border-neutral-700'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>Create Post (Image Only)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCreationType('reel');
              setMediaMode('video');
            }}
            className={`flex-1 py-2.5 px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              creationType === 'reel'
                ? 'bg-gradient-to-r from-rose-500/20 to-orange-500/20 border-2 border-rose-500 text-rose-400 shadow-md shadow-rose-500/10'
                : 'bg-neutral-900 border border-neutral-800 text-zinc-400 hover:text-white hover:border-neutral-700'
            }`}
          >
            <Film className="w-4 h-4" />
            <span>Create Reel (Video Only)</span>
          </button>
        </div>

        {/* Scrollable Unified Body */}
        <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* User Profile & Dual Tagged Indicator (Instagram style) */}
          <div className="flex items-center justify-between bg-neutral-900/50 p-3 rounded-2xl border border-neutral-800/80">
            <div className="flex items-center gap-3">
              {/* Dual Overlapping Avatars (Instagram Style) */}
              <div className="relative flex items-center">
                <img
                  src={currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                  alt={currentUser.username}
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-[#00FF66]/60 shadow-md"
                  referrerPolicy="no-referrer"
                />
                {taggedUser && (
                  <div className="relative -ml-3.5 mt-2 ring-2 ring-black rounded-full overflow-hidden shadow-lg animate-in zoom-in-75">
                    <img
                      src={taggedUser.avatar}
                      alt={taggedUser.username}
                      className="w-7 h-7 rounded-full object-cover ring-1 ring-blue-400"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-white">
                    {currentUser.displayName || currentUser.username}
                  </span>
                  {currentUser.isVerified && <VerifiedBadge size="xs" />}
                  
                  {taggedUser && (
                    <>
                      <span className="text-xs text-zinc-400 font-medium">and</span>
                      <span className="text-xs font-bold text-[#00FF66] flex items-center gap-1">
                        @{taggedUser.username}
                        {taggedUser.isVerified && <VerifiedBadge size="xs" />}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-400">
                  <span>Audience: <strong>Public</strong></span>
                  <span>•</span>
                  <span>Category: <strong className="text-zinc-200 capitalize">{category}</strong></span>
                </div>
              </div>
            </div>

            {/* Tag Button / Remove Tag */}
            {taggedUser ? (
              <button
                type="button"
                onClick={handleRemoveTaggedUser}
                className="px-2.5 py-1 rounded-full bg-neutral-800 hover:bg-red-500/20 text-zinc-300 hover:text-red-400 border border-neutral-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Remove tagged partner"
              >
                <X className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Untag</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsTaggingOpen(!isTaggingOpen)}
                className="px-3 py-1.5 rounded-full bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border border-blue-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer hover:scale-105"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Tag User (Dual Profile)</span>
              </button>
            )}
          </div>

          {/* Instagram-Style User Tagging / Collaboration Dropdown Drawer */}
          {isTaggingOpen && (
            <div className="p-3.5 bg-neutral-900 border border-blue-500/40 rounded-2xl space-y-3 animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-blue-400" /> Tag another user / Add Co-Author
                </span>
                <span className="text-[10px] text-zinc-400">Both profiles will appear on post</span>
              </div>

              {/* Search User Input */}
              <div className="flex items-center bg-black border border-neutral-800 rounded-xl px-3 py-1.5 focus-within:border-blue-400">
                <Search className="w-3.5 h-3.5 text-zinc-400 mr-2" />
                <input
                  type="text"
                  placeholder="Search registered members..."
                  value={tagSearchQuery}
                  onChange={(e) => setTagSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-xs text-white focus:outline-none"
                  autoFocus
                />
              </div>

              {/* Suggested / Available Users list */}
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {availableUsersToTag.length > 0 ? (
                  availableUsersToTag.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleSelectTaggedUser(u)}
                      className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-neutral-800 transition-colors text-left cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5">
                        <img
                          src={u.avatar}
                          alt={u.username}
                          className="w-7 h-7 rounded-full object-cover ring-1 ring-neutral-700"
                        />
                        <div>
                          <div className="flex items-center gap-1 text-xs font-bold text-white group-hover:text-blue-400">
                            <span>{u.displayName || u.username}</span>
                            {u.isVerified && <VerifiedBadge size="xs" />}
                          </div>
                          <span className="text-[10px] text-zinc-400 block">@{u.username}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        Select
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="text-center py-2 text-xs text-zinc-500">
                    No members matching "{tagSearchQuery}"
                  </div>
                )}
              </div>

              {/* Or Enter Custom Username */}
              <div className="pt-2 border-t border-neutral-800 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Or enter @username..."
                  value={customTagUsername}
                  onChange={(e) => setCustomTagUsername(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleApplyCustomTag();
                    }
                  }}
                  className="flex-1 bg-black border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-400"
                />
                <button
                  type="button"
                  onClick={handleApplyCustomTag}
                  disabled={!customTagUsername.trim()}
                  className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Tag
                </button>
              </div>
            </div>
          )}

          {/* Unified Caption & Thoughts Box with @ Mention Trigger */}
          <div className="relative">
            <textarea
              ref={captionTextareaRef}
              rows={mediaMode === 'text' ? 5 : 3}
              placeholder="What's on your mind? Type @ to tag followers/following, write thoughts, or add captions..."
              value={caption}
              onChange={(e) => {
                const val = e.target.value;
                const cursorPos = e.target.selectionStart || 0;
                setCaption(val);
                setAtMentionCursorPos(cursorPos);

                const textBeforeCursor = val.slice(0, cursorPos);
                const match = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/);
                if (match) {
                  setAtMentionQuery(match[1]);
                } else {
                  setAtMentionQuery(null);
                }
              }}
              className="w-full bg-neutral-900/90 text-sm text-white p-3.5 rounded-2xl border border-neutral-800 focus:border-[#00FF66] outline-none leading-relaxed resize-none transition-all placeholder:text-zinc-500"
            />

            {/* Dynamic @ Mention Dropdown Triggered by typing '@' */}
            {atMentionQuery !== null && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-950/95 border border-[#00FF66]/40 rounded-2xl p-2 shadow-2xl z-30 max-h-48 overflow-y-auto backdrop-blur-xl animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-zinc-800">
                  <span className="text-[10px] font-bold text-[#00FF66] flex items-center gap-1">
                    <Users className="w-3 h-3" /> Tag a member (@{atMentionQuery || '...'})
                  </span>
                  <span className="text-[9px] text-zinc-400">Links profiles upon selection</span>
                </div>

                {allUsers
                  .filter(
                    (u) =>
                      u.id !== currentUser.id &&
                      (atMentionQuery === '' ||
                        u.username.toLowerCase().includes(atMentionQuery.toLowerCase()) ||
                        u.displayName?.toLowerCase().includes(atMentionQuery.toLowerCase()))
                  )
                  .map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        const textBeforeCursor = caption.slice(0, atMentionCursorPos);
                        const textAfterCursor = caption.slice(atMentionCursorPos);
                        const newTextBefore = textBeforeCursor.replace(/@([a-zA-Z0-9_]*)$/, `@${u.username} `);
                        setCaption(newTextBefore + textAfterCursor);
                        setTaggedUser(u);
                        setAtMentionQuery(null);
                        captionTextareaRef.current?.focus();
                      }}
                      className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-neutral-800/80 transition-colors text-left cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5">
                        <img
                          src={u.avatar}
                          alt={u.username}
                          className="w-6 h-6 rounded-full object-cover ring-1 ring-[#00FF66]/40"
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <div className="flex items-center gap-1 text-xs font-bold text-white group-hover:text-[#00FF66]">
                            <span>{u.displayName || u.username}</span>
                            {u.isVerified && <VerifiedBadge size="xs" />}
                          </div>
                          <span className="text-[10px] text-zinc-400 block">@{u.username}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-[#00FF66] opacity-80 group-hover:opacity-100">
                        Tag &amp; Link
                      </span>
                    </button>
                  ))}

                {allUsers.filter(
                  (u) =>
                    u.id !== currentUser.id &&
                    (atMentionQuery === '' ||
                      u.username.toLowerCase().includes(atMentionQuery.toLowerCase()) ||
                      u.displayName?.toLowerCase().includes(atMentionQuery.toLowerCase()))
                ).length === 0 && (
                  <div className="p-2 text-center text-xs text-zinc-500">
                    No members found matching "@{atMentionQuery}"
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Text-Only Background Preset Selector (When no photo or video attached) */}
          {mediaMode === 'text' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
                  <Palette className="w-3 h-3 text-purple-400" /> Thought Card Background Style
                </span>
                <span className="text-[10px] text-zinc-500">Custom style for text posts</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {TEXT_BACKGROUNDS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTextBg(t.id)}
                    className={`px-2.5 py-2 rounded-xl text-xs font-semibold border transition-all text-center ${
                      selectedTextBg === t.id
                        ? 'border-[#00FF66] scale-[1.02] shadow-sm shadow-[#00FF66]/20 ring-1 ring-[#00FF66]'
                        : 'border-neutral-800 opacity-70 hover:opacity-100 hover:border-neutral-700'
                    } ${t.bgClass}`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Attached Media Display Area (Photos Carousel or Video) */}
          {mediaMode === 'photos' && slides.length > 0 && (
            <div className="p-3.5 bg-neutral-950 border border-neutral-800 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-[#00FF66]" /> Photo Slide {activeSlideIndex + 1} of {slides.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[11px] text-[#00FF66] font-bold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add more
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSlides([]);
                      setMediaMode('text');
                    }}
                    className="text-[11px] text-red-400 font-bold hover:underline cursor-pointer"
                  >
                    Remove all
                  </button>
                </div>
              </div>

              {/* Active Image Preview with Filter */}
              <div className="relative aspect-video max-h-60 w-full rounded-xl overflow-hidden bg-black flex items-center justify-center border border-neutral-800">
                <img
                  src={activeSlide?.mediaUrl}
                  alt="Slide preview"
                  className={`w-full h-full object-contain ${
                    FILTERS.find((f) => f.id === selectedFilter)?.style || ''
                  }`}
                />
                <button
                  type="button"
                  onClick={() => handleRemoveSlide(activeSlideIndex)}
                  className="absolute top-2 right-2 p-1.5 bg-black/80 hover:bg-red-500 text-white rounded-lg transition-colors cursor-pointer"
                  title="Remove this photo"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Filter Presets */}
              <div>
                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block mb-1.5">
                  Color Filter
                </span>
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  {FILTERS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setSelectedFilter(f.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap border transition-all ${
                        selectedFilter === f.id
                          ? 'bg-[#00FF66]/20 text-[#00FF66] border-[#00FF66]'
                          : 'bg-neutral-900 text-zinc-400 border-neutral-800 hover:text-white'
                      }`}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Carousel Thumbnails */}
              {slides.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
                  {slides.map((s, idx) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setActiveSlideIndex(idx)}
                      className={`w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all relative ${
                        idx === activeSlideIndex ? 'border-[#00FF66] scale-105' : 'border-neutral-800 opacity-60'
                      }`}
                    >
                      <img src={s.mediaUrl} alt={`Slide ${idx + 1}`} className="w-full h-full object-cover" />
                      <span className="absolute bottom-0 right-0 bg-black/80 text-[8px] px-1 text-white font-bold">
                        {idx + 1}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Attached Video Display Area (Reels) */}
          {mediaMode === 'video' && videoUrl && (
            <div className="p-3.5 bg-neutral-950 border border-rose-500/30 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                  <Film className="w-4 h-4" /> Reel Video Attached
                </span>
                <button
                  type="button"
                  onClick={handleRemoveVideo}
                  className="text-[11px] text-red-400 font-bold hover:underline cursor-pointer"
                >
                  Remove video
                </button>
              </div>

              <div className="relative aspect-[9/16] max-h-56 mx-auto w-full max-w-[180px] rounded-xl overflow-hidden bg-black border border-neutral-800 shadow-lg">
                <video src={videoUrl} controls autoPlay loop muted className="w-full h-full object-cover" />
              </div>

              <div>
                <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block mb-1">
                  Audio / Music Sound Name
                </label>
                <input
                  type="text"
                  value={musicTitle}
                  onChange={(e) => setMusicTitle(e.target.value)}
                  placeholder="e.g. Cyberpunk Drill Beat"
                  className="w-full bg-neutral-900 text-xs text-white p-2.5 rounded-xl border border-neutral-800 focus:border-rose-500 outline-none"
                />
              </div>
            </div>
          )}

          {/* Quick Attach Toolbar (Dynamic based on Post / Reel Mode) */}
          <div className="flex items-center gap-2 pt-1 border-t border-neutral-800/80">
            {creationType === 'post' ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingMedia}
                className="px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-bold text-white flex items-center gap-2 transition-all cursor-pointer hover:border-[#00FF66]/50"
              >
                <ImageIcon className="w-4 h-4 text-[#00FF66]" />
                <span>Add Photos (Image Only)</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                disabled={isUploadingMedia}
                className="px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-bold text-white flex items-center gap-2 transition-all cursor-pointer hover:border-rose-500/50"
              >
                <VideoIcon className="w-4 h-4 text-rose-400" />
                <span>Add Reel Video (Video Only)</span>
              </button>
            )}

            {uploadStatusMsg && (
              <span className="text-[11px] text-zinc-400 ml-auto truncate max-w-[200px]">
                {uploadStatusMsg}
              </span>
            )}
          </div>

          {/* Hidden File Inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleDeviceMediaUpload(e, 'image')}
            className="hidden"
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            onChange={(e) => handleDeviceMediaUpload(e, 'video')}
            className="hidden"
          />

          {/* Location & Category Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neutral-800/80">
            {/* Location Tag */}
            <div>
              <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block mb-1">
                Location (Optional)
              </label>
              <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 focus-within:border-[#00FF66]">
                <MapPin className="w-3.5 h-3.5 text-[#00FF66] mr-2 shrink-0" />
                <input
                  type="text"
                  placeholder="e.g. Neo Tokyo, Akihabara..."
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full bg-transparent text-xs text-white focus:outline-none"
                />
              </div>
            </div>

            {/* Content Category Selector - BLANK by default & COMPULSORY */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                  Content Category <span className="text-rose-400 font-black">*Compulsory</span>
                </label>
              </div>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  if (e.target.value) setCategoryError(false);
                }}
                className={`w-full bg-neutral-900 text-xs text-white p-2.5 rounded-xl border outline-none cursor-pointer ${
                  categoryError
                    ? 'border-rose-500 bg-rose-950/20 ring-1 ring-rose-500'
                    : 'border-neutral-800 focus:border-[#00FF66]'
                }`}
              >
                <option value="" disabled>-- Select Content Category (Compulsory) --</option>
                <option value="gaming">🎮 Gaming &amp; Esports</option>
                <option value="tech">🤖 Tech &amp; Artificial Intelligence</option>
                <option value="code">💻 Code, Dev &amp; Software Engineering</option>
                <option value="robotics">🦾 Robotics &amp; Automation</option>
                <option value="cad">📐 CAD, 3D Printing &amp; Hardware</option>
                <option value="cybersecurity">🛡️ Cybersecurity &amp; Ethical Hacking</option>
                <option value="web3">⚡ Web3, Crypto &amp; Decentralized Tech</option>
                <option value="mobile">📱 Mobile Apps &amp; UI/UX Design</option>
                <option value="science">🔭 Science, Space &amp; Astronomy</option>
                <option value="art">🎨 Digital Art, CGI &amp; VFX</option>
                <option value="music">🎵 Music, Beats &amp; Audio Production</option>
                <option value="anime">✨ Anime, Manga &amp; Cyber Culture</option>
                <option value="fashion">👟 Fashion, Streetwear &amp; Aesthetics</option>
                <option value="tutorials">📚 Education &amp; Skill Tutorials</option>
                <option value="memes">😂 Memes &amp; Community Humor</option>
                <option value="others">🌐 Others / General Community</option>
              </select>
              {categoryError && (
                <p className="text-[11px] text-rose-400 font-semibold mt-1 flex items-center gap-1">
                  ⚠️ Category is compulsory. Please choose an option above.
                </p>
              )}
            </div>
          </div>

          {/* Hashtags (Clean, Optional, No '#' forced) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                Hashtags <span className="text-zinc-500 font-normal lowercase">(optional)</span>
              </label>
              {hashtags && (
                <button
                  type="button"
                  onClick={() => setHashtags('')}
                  className="text-[10px] text-zinc-400 hover:text-white cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
            <input
              type="text"
              placeholder="e.g. gaming, tech, clips (optional)"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              className="w-full bg-neutral-900 text-xs text-white p-2.5 rounded-xl border border-neutral-800 focus:border-[#00FF66] outline-none"
            />
          </div>

          {/* Additional Settings (Advanced Controls - Preserved as requested) */}
          <div className="pt-2 border-t border-neutral-800">
            <button
              type="button"
              onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
              className="text-xs font-bold text-[#00FF66] flex items-center gap-1.5 cursor-pointer hover:underline"
            >
              <Sliders className="w-3.5 h-3.5" />
              {isAdvancedOpen ? 'Hide Additional Settings' : 'Show Additional Settings (Links, Privacy, AI Label)'}
            </button>

            {isAdvancedOpen && (
              <div className="mt-3 space-y-3 p-3.5 bg-neutral-900/70 rounded-2xl border border-neutral-800 animate-in slide-in-from-top-2 duration-200">
                {/* External Link */}
                <div>
                  <label className="text-[10px] text-zinc-400 block mb-1 font-semibold flex items-center gap-1">
                    <Link2 className="w-3 h-3 text-[#00FF66]" /> External Project / Web Link
                  </label>
                  <input
                    type="url"
                    placeholder="https://example.com"
                    value={webLink}
                    onChange={(e) => setWebLink(e.target.value)}
                    className="w-full bg-black text-xs text-white p-2.5 rounded-xl border border-neutral-800 outline-none focus:border-[#00FF66]"
                  />
                </div>

                {/* Schedule Post */}
                <div>
                  <label className="text-[10px] text-zinc-400 block mb-1 font-semibold flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-cyan-400" /> Schedule for Later (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    className="w-full bg-black text-xs text-white p-2.5 rounded-xl border border-neutral-800 outline-none focus:border-[#00FF66]"
                  />
                </div>

                {/* Privacy & Engagement Toggles */}
                <div className="flex flex-col gap-2.5 pt-1">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hideLikes}
                      onChange={(e) => setHideLikes(e.target.checked)}
                      className="rounded border-neutral-700 bg-black text-[#00FF66] focus:ring-0 cursor-pointer"
                    />
                    <span className="text-xs text-zinc-300">Hide like and view counts on this post</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={disableComments}
                      onChange={(e) => setDisableComments(e.target.checked)}
                      className="rounded border-neutral-700 bg-black text-[#00FF66] focus:ring-0 cursor-pointer"
                    />
                    <span className="text-xs text-zinc-300">Turn off commenting</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasAiLabel}
                      onChange={(e) => setHasAiLabel(e.target.checked)}
                      className="rounded border-neutral-700 bg-black text-[#00FF66] focus:ring-0 cursor-pointer"
                    />
                    <span className="text-xs text-zinc-300">Label post as AI Generated / Augmented</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
