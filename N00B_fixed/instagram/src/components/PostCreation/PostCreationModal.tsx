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
  Heart,
  Radio,
  Type,
  Sticker as StickerIcon,
  AtSign,
  Hash,
  Music as MusicIcon,
  Loader2,
  ArrowLeft,
  Smile,
  Camera,
  ChevronRight,
  ChevronDown,
  Share2
} from 'lucide-react';
import { Post, PostSlide, Reel, User } from '../../types';
import { uploadMediaFile } from '../../services/api';
import { analyzeMediaFile } from '../../utils/mediaAnalyzer';
import { captureVideoThumbnail, captureVideoFrames } from '../../utils/videoThumbnail';
import { parseLook, buildLook, lookStyle, lookRatio, SLIDE_SHAPES, SlideLook, ALT_LIMIT } from '../../utils/slideLook';
import { siteOrigin } from '../../utils/siteUrl';
import { readVideoDuration, describeLength, REEL_MAX_SECONDS } from '../../utils/videoDuration';
import { POST_FILTERS, CONTENT_CATEGORIES } from '../../data/mockData';
import confetti from 'canvas-confetti';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import { EditableStickerLayer } from '../Stories/EditableStickerLayer';
import { EmojiPanel } from '../Chat/EmojiPanel';
import { AnimatedStickerPanel, GifPanel } from '../Chat/StickerGifPanels';
import { AvatarMedia } from '../Common/AvatarMedia';
import { MusicPicker, MusicSelection } from '../Common/MusicPicker';

type PostSticker = NonNullable<PostSlide['stickers']>[number];
type PostTaggedPerson = NonNullable<PostSlide['taggedUsers']>[number];
const STICKER_TEXT_COLORS = ['#FFFFFF', '#000000', '#00FF66', '#EF4444', '#3B82F6', '#F59E0B', '#EC4899'];
const MAX_TAGGED_PEOPLE = 68;

interface PostCreationModalProps {
  currentUser: User;
  allUsers?: User[];
  onClose: () => void;
  onSubmitPost: (data: { isReel?: boolean; reelData?: Partial<Reel>; postData?: Partial<Post> }) => Promise<void>;
  onGoLive?: () => void;
  // What the chooser sent the person here to make. 'thought' opens straight on the writing step.
  initialType?: 'post' | 'reel' | 'thought';
  // "Use this sound" on a reel: the sound is already chosen when the creator opens
  initialAudio?: MusicSelection | null;
}

const FILTERS = POST_FILTERS;
const CAPTION_LIMIT = 2200;   // Instagram's caption limit

const TEXT_BACKGROUNDS = [
  { id: 'clean', name: 'Default Dark', bgClass: 'bg-zinc-950 border-zinc-800 text-white' },
  { id: 'emerald', name: 'Emerald Cyber', bgClass: 'bg-gradient-to-br from-emerald-950 via-zinc-950 to-green-900/40 border-emerald-500/40 text-emerald-100' },
  { id: 'cyber', name: 'Neon Cyberpunk', bgClass: 'bg-gradient-to-br from-purple-950 via-zinc-950 to-cyan-950 border-cyan-500/40 text-cyan-100' },
  { id: 'flame', name: 'Sunset Flame', bgClass: 'bg-gradient-to-br from-rose-950 via-zinc-950 to-amber-950 border-rose-500/40 text-rose-100' },
  { id: 'slate', name: 'Obsidian Minimal', bgClass: 'bg-zinc-900 border-zinc-700 text-zinc-100' }
];

// An on / off switch (Instagram's style) for the advanced settings
const Switch: React.FC<{ on: boolean; onChange: (on: boolean) => void; label: string }> = ({ on, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={() => onChange(!on)}
    className={`relative w-11 h-6 rounded-full shrink-0 transition-colors cursor-pointer ${on ? 'bg-blue-500' : 'bg-zinc-700'}`}
  >
    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
  </button>
);

export const PostCreationModal: React.FC<PostCreationModalProps> = ({
  currentUser,
  allUsers = [],
  onClose,
  onSubmitPost,
  initialType = 'post',
  initialAudio = null
}) => {
  // Creation Mode: Post (Image Only) vs Reel (Video Only)
  const [creationType, setCreationType] = useState<'post' | 'reel'>(initialType === 'reel' ? 'reel' : 'post');
  // Three steps, like Instagram: pick the picture(s) or video, edit them, then write the details and share
  const [step, setStep] = useState<'select' | 'edit' | 'details' | 'done'>(initialType === 'thought' ? 'details' : 'select');
  const [isAltOpen, setIsAltOpen] = useState(false);
  const [shareNote, setShareNote] = useState('');
  const [editTab, setEditTab] = useState<'filters' | 'adjust' | 'shape' | 'add'>('filters');
  const [dragOver, setDragOver] = useState(false);
  const [showCaptionEmoji, setShowCaptionEmoji] = useState(false);

  // Main text content / caption
  const [caption, setCaption] = useState('');
  
  // Media attachments
  const [mediaMode, setMediaMode] = useState<'text' | 'photos' | 'video'>(initialType === 'reel' ? 'video' : initialType === 'thought' ? 'text' : 'photos');
  const [slides, setSlides] = useState<PostSlide[]>([]);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [selectedTextBg, setSelectedTextBg] = useState('clean');
  
  // Video data (Reels)
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [videoObjectKey, setVideoObjectKey] = useState<string>('');
  const [thumbnailObjectKey, setThumbnailObjectKey] = useState<string>('');
  // the reel's cover: a frame the person picks from a strip, or a picture of their own
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [coverFrames, setCoverFrames] = useState<{ time: number; url: string }[]>([]);
  const [coverPick, setCoverPick] = useState<number | 'custom' | null>(null);
  const [coverPreview, setCoverPreview] = useState('');
  const [isSettingCover, setIsSettingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  // Shared between Post and Reel mode (mutually exclusive) — pick from NOOB's song library or
  // record your own clip. Fixes a real bug: the old free-text musicTitle field was never actually
  // read by createReel/createPost (both expect an audioTrack object), so anything typed there was
  // silently discarded and every reel got "Original Sound" regardless of user input.
  const [audioSelection, setAudioSelection] = useState<MusicSelection | null>(initialAudio);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  
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

  // Layered photo editor (text / stickers / mention / hashtag / link), same drag/pinch-resize/
  // rotate engine as Stories (EditableStickerLayer), stored directly on the active slide.
  const postCanvasRef = useRef<HTMLDivElement>(null);
  const activeStickers: PostSticker[] = activeSlide?.stickers || [];
  const [activeStickerIndex, setActiveStickerIndex] = useState<number | null>(null);
  const [isDraggingStickerLayer, setIsDraggingStickerLayer] = useState(false);
  const [isStickerOverTrash, setIsStickerOverTrash] = useState(false);

  // The look of a picture (filter, shape, adjustments) is kept per picture, in the slide's own `filter` text (see utils/slideLook.ts)
  const look = parseLook(activeSlide?.filter);
  const [naturalRatio, setNaturalRatio] = useState<Record<string, number>>({});   // each picture's own width / height, read when it loads
  const previewRatio = lookRatio(activeSlide?.filter) ?? Math.min(1.91, Math.max(0.8, naturalRatio[activeSlide?.id || ''] || 1));
  const updateLook = (patch: Partial<SlideLook>) => {
    if (!activeSlide) return;
    setSlides((prev) => prev.map((sl) => (sl.id === activeSlide.id ? { ...sl, filter: buildLook({ ...parseLook(sl.filter), ...patch }) } : sl)));
  };
  const applyFilterToAll = () => setSlides((prev) => prev.map((sl) => ({ ...sl, filter: buildLook({ ...parseLook(sl.filter), preset: look.preset }) })));

  const updateActiveSlide = (patch: Partial<PostSlide>) => {
    if (!activeSlide) return;
    setSlides((prev) => prev.map((s) => (s.id === activeSlide.id ? { ...s, ...patch } : s)));
  };
  const addSticker = (sticker: PostSticker) => {
    updateActiveSlide({ stickers: [...activeStickers, sticker] });
    setActiveStickerIndex(activeStickers.length);
  };
  const updateStickerAt = (index: number, patch: Partial<PostSticker>) => {
    updateActiveSlide({ stickers: activeStickers.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  };
  const deleteStickerAt = (index: number) => {
    updateActiveSlide({ stickers: activeStickers.filter((_, i) => i !== index) });
    setActiveStickerIndex((cur) => (cur === index ? null : cur));
  };

  const [textEditor, setTextEditor] = useState<number | 'new' | null>(null);
  const [draftPostText, setDraftPostText] = useState('');
  const [draftPostTextColor, setDraftPostTextColor] = useState(STICKER_TEXT_COLORS[0]);
  const openNewPostText = () => { setDraftPostText(''); setDraftPostTextColor(STICKER_TEXT_COLORS[0]); setTextEditor('new'); };
  const openEditPostText = (index: number, sticker: PostSticker) => {
    setDraftPostText(sticker.data?.text || ''); setDraftPostTextColor(sticker.data?.color || STICKER_TEXT_COLORS[0]); setTextEditor(index);
  };
  const commitPostText = () => {
    const text = draftPostText.trim();
    if (!text) { setTextEditor(null); return; }
    if (textEditor === 'new') {
      addSticker({ type: 'text', data: { text, color: draftPostTextColor }, x: 50, y: 40 + Math.min(activeStickers.length * 6, 24), width: 55, rotation: 0 });
    } else if (typeof textEditor === 'number') {
      updateStickerAt(textEditor, { data: { text, color: draftPostTextColor } });
    }
    setTextEditor(null);
  };

  const [hashtagEditor, setHashtagEditor] = useState<number | 'new' | null>(null);
  const [draftPostHashtag, setDraftPostHashtag] = useState('');
  const openNewPostHashtag = () => { setDraftPostHashtag(''); setHashtagEditor('new'); };
  const openEditPostHashtag = (index: number, sticker: PostSticker) => { setDraftPostHashtag(sticker.data?.tag || ''); setHashtagEditor(index); };
  const commitPostHashtag = () => {
    const tag = draftPostHashtag.trim().replace(/^#+/, '').replace(/\s+/g, '');
    if (!tag) { setHashtagEditor(null); return; }
    if (hashtagEditor === 'new') {
      addSticker({ type: 'hashtag', data: { tag }, x: 50, y: 40 + Math.min(activeStickers.length * 6, 24), width: 40, rotation: 0 });
    } else if (typeof hashtagEditor === 'number') {
      updateStickerAt(hashtagEditor, { data: { tag } });
    }
    setHashtagEditor(null);
  };

  const [linkEditor, setLinkEditor] = useState<number | 'new' | null>(null);
  const [draftPostLinkUrl, setDraftPostLinkUrl] = useState('');
  const [draftPostLinkLabel, setDraftPostLinkLabel] = useState('');
  const openNewPostLink = () => { setDraftPostLinkUrl(''); setDraftPostLinkLabel(''); setLinkEditor('new'); };
  const openEditPostLink = (index: number, sticker: PostSticker) => {
    setDraftPostLinkUrl(sticker.data?.url || ''); setDraftPostLinkLabel(sticker.data?.label || ''); setLinkEditor(index);
  };
  const commitPostLink = () => {
    let url = draftPostLinkUrl.trim();
    if (!url) { setLinkEditor(null); return; }
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    let label = draftPostLinkLabel.trim();
    if (!label) { try { label = new URL(url).hostname.replace(/^www\./, ''); } catch { label = 'Visit link'; } }
    if (linkEditor === 'new') {
      addSticker({ type: 'link', data: { url, label }, x: 50, y: 40 + Math.min(activeStickers.length * 6, 24), width: 46, rotation: 0 });
    } else if (typeof linkEditor === 'number') {
      updateStickerAt(linkEditor, { data: { url, label } });
    }
    setLinkEditor(null);
  };

  const [showPostStickerPicker, setShowPostStickerPicker] = useState(false);
  const [postStickerTab, setPostStickerTab] = useState<'emoji' | 'animated' | 'gif' | 'upload'>('emoji');
  const [isUploadingPostSticker, setIsUploadingPostSticker] = useState(false);
  const [postStickerUploadError, setPostStickerUploadError] = useState('');
  const postStickerUploadInputRef = useRef<HTMLInputElement>(null);
  const addEmojiOrImageSticker = (kind: 'emoji' | 'image', content: string) => {
    addSticker({ type: 'sticker', data: { kind, content }, x: 50, y: 45, width: kind === 'emoji' ? 26 : 42, rotation: 0 });
    setShowPostStickerPicker(false);
  };
  const handleUploadCustomPostSticker = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsUploadingPostSticker(true);
    setPostStickerUploadError('');
    try {
      const res = await uploadMediaFile(file, 'stickers');
      if (res.url) addEmojiOrImageSticker('image', res.url);
      else setPostStickerUploadError('Upload failed. Please try again.');
    } catch {
      setPostStickerUploadError('Upload failed. Please try again.');
    } finally {
      setIsUploadingPostSticker(false);
    }
  };

  const [showPostMentionPicker, setShowPostMentionPicker] = useState(false);
  const [postMentionQuery, setPostMentionQuery] = useState('');
  const postMentionResults = allUsers
    .filter((u) => {
      const q = postMentionQuery.trim().toLowerCase();
      if (!q) return true;
      return u.username.toLowerCase().includes(q) || u.displayName?.toLowerCase().includes(q);
    })
    .slice(0, 30);
  const addMentionSticker = (u: User) => {
    addSticker({
      type: 'mention',
      data: { userId: u.id, username: u.username, displayName: u.displayName, avatar: u.avatar },
      x: 50, y: 45, width: 42, rotation: 0
    });
    setShowPostMentionPicker(false);
    setPostMentionQuery('');
  };

  // Tag People — up to 68 pins per slide, separate from the sticker layers above (a distinct
  // post feature, matching Instagram's tap-to-tag rather than the visible "Mention" sticker).
  const [showTagPeoplePicker, setShowTagPeoplePicker] = useState(false);
  const [tagPeopleQuery, setTagPeopleQuery] = useState('');
  const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null);
  const activeTaggedPeople: PostTaggedPerson[] = activeSlide?.taggedUsers || [];
  const tagPeopleResults = allUsers
    .filter((u) => {
      if (activeTaggedPeople.some((t) => t.userId === u.id)) return false;
      const q = tagPeopleQuery.trim().toLowerCase();
      if (!q) return true;
      return u.username.toLowerCase().includes(q) || u.displayName?.toLowerCase().includes(q);
    })
    .slice(0, 30);
  const addTaggedPerson = (u: User) => {
    if (activeTaggedPeople.length >= MAX_TAGGED_PEOPLE) return;
    updateActiveSlide({
      taggedUsers: [
        ...activeTaggedPeople,
        { userId: u.id, username: u.username, displayName: u.displayName, avatar: u.avatar, x: 50, y: 45 + Math.min(activeTaggedPeople.length * 5, 30) }
      ]
    });
  };
  const updateTaggedPersonAt = (index: number, patch: Partial<PostTaggedPerson>) => {
    updateActiveSlide({ taggedUsers: activeTaggedPeople.map((t, i) => (i === index ? { ...t, ...patch } : t)) });
  };
  const deleteTaggedPersonAt = (index: number) => {
    updateActiveSlide({ taggedUsers: activeTaggedPeople.filter((_, i) => i !== index) });
    setActiveTagIndex((cur) => (cur === index ? null : cur));
  };

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

  const handleDeviceMediaUpload = (e: React.ChangeEvent<HTMLInputElement>, forceType?: 'image' | 'video') => {
    const picked: File[] = e.target.files ? Array.from(e.target.files as FileList) : [];
    e.target.value = '';   // so the same file can be picked again
    if (picked.length > 0) void uploadPicked(picked, forceType);
  };

  const uploadPicked = async (files: File[], forceType?: 'image' | 'video') => {
    if (files.length === 0) return;

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
        // A reel is at most 70 seconds: checked on the phone, before anything is uploaded
        const length = await readVideoDuration(firstFile);
        if (Number.isFinite(length) && length > REEL_MAX_SECONDS) {
          setUploadStatusMsg(`A reel can be up to ${REEL_MAX_SECONDS} seconds. This video is ${describeLength(length)} long — pick a shorter one, or share it as a Video instead.`);
          return;
        }
        setUploadStatusMsg(`Verified video format (${analysis.mimeType}) • Ready for Reels`);
        const res = await uploadMediaFile(firstFile, 'reels');
        if (res.url) {
          setVideoUrl(res.url);
        }
        if (res.objectKey) {
          setVideoObjectKey(res.objectKey);
        }
        setVideoFile(firstFile);
        setCoverPick(null);
        setCoverPreview('');
        void captureVideoFrames(firstFile, 8, 96).then(setCoverFrames).catch(() => setCoverFrames([]));
        if (res.url || res.objectKey) setStep('edit');

        // Grab an actual frame from this exact video for its thumbnail —
        // best-effort: a reel with no thumbnail still falls back cleanly to
        // its own video element everywhere it's displayed, so a failure
        // here (an unsupported codec in this browser, e.g.) never blocks
        // publishing.
        try {
          const thumbFile = await captureVideoThumbnail(firstFile);
          if (thumbFile) {
            const thumbRes = await uploadMediaFile(thumbFile, 'reels');
            if (thumbRes.objectKey) {
              setThumbnailObjectKey(thumbRes.objectKey);
            }
          }
        } catch (thumbErr) {
          console.error('Thumbnail capture failed:', thumbErr);
        }
      } else {
        setCreationType('post');
        setMediaMode('photos');
        setUploadStatusMsg(`Adding photo attachments (${files.length} file${files.length > 1 ? 's' : ''})`);
        
        // Each photo gets its own try/catch — one bad file in a multi-select (an unsupported
        // format, a network blip) used to abort the whole batch, discarding the status of photos
        // that had already uploaded fine right before it.
        let failed = 0;
        let added = 0;
        let lastError = '';
        for (let i = 0; i < files.length; i++) {
          if (slides.length + i >= 20) break;
          const file = files[i];
          const fileAnalysis = analyzeMediaFile(file);
          if (!fileAnalysis.isValid) continue;
          try {
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
              added++;
            }
          } catch (err) {
            failed++;
            lastError = err instanceof Error ? err.message : 'Upload failed.';
            console.error('Failed to upload one file in the batch:', err);
          }
        }
        setUploadStatusMsg(
          failed === 0
            ? ''
            : failed === files.length
              ? lastError
              : `${files.length - failed} of ${files.length} added — ${lastError}`
        );
        if (added > 0) setStep('edit');
      }
    } catch (err) {
      console.error('Failed to upload file:', err);
      setUploadStatusMsg(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleRemoveSlide = (index: number) => {
    const updated = slides.filter((_, i) => i !== index);
    setSlides(updated);
    if (updated.length === 0) {
      discardMedia();
    } else {
      setActiveSlideIndex(Math.max(0, index - 1));
    }
  };

  const handleRemoveVideo = () => discardMedia();

  // Back to the first step with nothing picked
  const discardMedia = () => {
    setSlides([]);
    setActiveSlideIndex(0);
    setVideoUrl('');
    setVideoObjectKey('');
    setThumbnailObjectKey('');
    setVideoFile(null);
    setCoverFrames([]);
    setCoverPick(null);
    setCoverPreview('');
    setUploadStatusMsg(null);
    setMediaMode(creationType === 'reel' ? 'video' : 'photos');
    setStep('select');
  };

  // The cover of a reel: a frame from the strip (cut out of the video on this phone and uploaded) ...
  const chooseCoverFrame = async (index: number) => {
    if (!videoFile || isSettingCover) return;
    setCoverPick(index);
    setCoverPreview('');
    setIsSettingCover(true);
    try {
      const thumb = await captureVideoThumbnail(videoFile, coverFrames[index]?.time);
      if (thumb) {
        const res = await uploadMediaFile(thumb, 'reels');
        if (res.objectKey) setThumbnailObjectKey(res.objectKey);
      }
    } catch (err) {
      console.error('Setting the cover failed:', err);
    } finally {
      setIsSettingCover(false);
    }
  };
  // ... or a picture of their own
  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsSettingCover(true);
    try {
      const res = await uploadMediaFile(file, 'reels');
      if (res.objectKey) {
        setThumbnailObjectKey(res.objectKey);
        setCoverPick('custom');
        setCoverPreview(URL.createObjectURL(file));
      }
    } catch (err) {
      console.error('Uploading the cover failed:', err);
    } finally {
      setIsSettingCover(false);
    }
  };

  // After sharing: pass it on to other apps (the phone's own share sheet) or copy the link to the profile it was shared on
  const shareToOtherApps = async () => {
    const link = `${siteOrigin()}/?profile=${encodeURIComponent(currentUser.username)}`;
    const text = creationType === 'reel' ? `I just shared a reel on NOOB Socials: @${currentUser.username}` : `I just shared a post on NOOB Socials: @${currentUser.username}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'NOOB Socials', text, url: link });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${link}`);
      setShareNote('Link copied.');
    } catch {
      /* the person closed the share sheet */
    }
  };

  const goBack = () => {
    if (step === 'details') {
      if (mediaMode === 'text') { setMediaMode('photos'); setStep('select'); } else setStep('edit');
    } else if (step === 'edit') {
      if (window.confirm('Discard what you picked and start over?')) discardMedia();
    }
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
          thumbnailUrl: thumbnailObjectKey,
          caption: caption.trim() || 'New Reel ✨',
          hashtags: parsedHashtags,
          category: category as any,
          audioTrack: audioSelection
            ? {
                title: audioSelection.title,
                artist: audioSelection.artist || currentUser.displayName || currentUser.username,
                coverUrl: audioSelection.coverUrl,
                audioUrl: audioSelection.audioUrl,
                trackId: audioSelection.trackId
              }
            : undefined,
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
            filter: s.filter || 'normal'
          })),
          hashtags: parsedHashtags,
          category: category as any,
          textBgStyle: mediaMode === 'text' ? selectedTextBg : undefined,
          audioTrack: audioSelection
            ? {
                title: audioSelection.title,
                artist: audioSelection.artist || currentUser.displayName || currentUser.username,
                coverUrl: audioSelection.coverUrl,
                audioUrl: audioSelection.audioUrl,
                trackId: audioSelection.trackId
              }
            : undefined,
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
      setStep('done');
    } catch (err: any) {
      alert(err?.message || 'Failed to publish. Please try again.');
    } finally {
      setIsPublishing(false);
    }
  };

  const isReadyToSubmit =
    category.trim().length > 0 &&
    (creationType === 'reel' ? !!videoUrl : caption.trim().length > 0 || slides.length > 0);

  const kindWord = creationType === 'reel' ? 'reel' : mediaMode === 'text' ? 'thought' : 'post';
  const stepTitle = step === 'select' ? `Create new ${kindWord}` : step === 'edit' ? 'Edit' : step === 'done' ? 'Shared' : `New ${kindWord}`;

  const insertCaptionEmoji = (emoji: string) => {
    const el = captionTextareaRef.current;
    const at = el ? el.selectionStart ?? caption.length : caption.length;
    const end = el ? el.selectionEnd ?? at : at;
    const next = (caption.slice(0, at) + emoji + caption.slice(end)).slice(0, CAPTION_LIMIT);
    setCaption(next);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = Math.min(at + emoji.length, next.length);
      el?.setSelectionRange(pos, pos);
    });
  };

  return (
    <div
      id="post-creation-modal"
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-stretch sm:items-center justify-center sm:p-6"
    >
      <div className="relative w-full sm:max-w-xl bg-zinc-950 sm:border sm:border-neutral-800 sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[100dvh] sm:h-auto sm:max-h-[94vh] animate-in zoom-in-95 duration-200">
        {/* Header: the step's name in the middle, back on the left, Next / Share on the right (like Instagram) */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center px-3 py-3 border-b border-neutral-800 bg-zinc-950 shrink-0">
          <div className="justify-self-start">
            {step === 'select' || step === 'done' ? (
              <button type="button" onClick={onClose} className="p-1.5 rounded-full text-zinc-300 hover:text-white hover:bg-zinc-900 cursor-pointer" aria-label="Close" title="Close">
                <X className="w-5 h-5" />
              </button>
            ) : (
              <button type="button" onClick={goBack} className="p-1.5 rounded-full text-zinc-300 hover:text-white hover:bg-zinc-900 cursor-pointer" aria-label="Back" title="Back">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
          </div>
          <h3 className="text-sm font-bold text-white tracking-tight" data-testid="create-step-title">{stepTitle}</h3>
          <div className="justify-self-end">
            {step === 'edit' && (
              <button
                type="button"
                onClick={() => setStep('details')}
                disabled={isUploadingMedia || isSettingCover}
                className="px-2 py-1 text-sm font-bold text-blue-400 hover:text-blue-300 disabled:opacity-40 cursor-pointer"
              >
                Next
              </button>
            )}
            {step === 'details' && (
              <button
                type="button"
                onClick={handlePublish}
                disabled={!isReadyToSubmit || isUploadingMedia || isPublishing}
                className="px-2 py-1 text-sm font-bold text-blue-400 hover:text-blue-300 disabled:opacity-40 cursor-pointer"
              >
                {isPublishing ? 'Sharing...' : 'Share'}
              </button>
            )}
          </div>
        </div>

        {uploadStatusMsg && (
          <div className="px-4 py-1.5 text-[11px] text-amber-300 bg-amber-500/10 border-b border-amber-500/20 shrink-0">{uploadStatusMsg}</div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {/* Step 1 — pick what to share (drop it here, or choose it from the phone / computer, or take it with the camera) */}
          {step === 'select' && (
            <div
              data-testid="create-select"
              className={`min-h-full flex flex-col items-center justify-center text-center px-6 py-10 gap-5 transition-colors ${dragOver ? 'bg-zinc-900' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const dropped: File[] = Array.from((e.dataTransfer.files || []) as FileList);
                if (creationType === 'reel') {
                  const video = dropped.find((f) => f.type.startsWith('video/'));
                  if (video) void uploadPicked([video], 'video');
                } else if (dropped.length > 0) {
                  void uploadPicked(dropped, 'image');
                }
              }}
            >
              <div className="flex items-center gap-1 p-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => { setCreationType('post'); setMediaMode('photos'); }}
                  className={`px-4 py-1.5 rounded-full cursor-pointer transition-colors ${creationType === 'post' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}
                >
                  Post
                </button>
                <button
                  type="button"
                  onClick={() => { setCreationType('reel'); setMediaMode('video'); }}
                  className={`px-4 py-1.5 rounded-full cursor-pointer transition-colors ${creationType === 'reel' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}
                >
                  Reel
                </button>
              </div>

              <div className="relative w-28 h-24" aria-hidden="true">
                <ImageIcon className="absolute left-0 top-3 w-16 h-16 text-zinc-300 -rotate-6" strokeWidth={1.2} />
                <Film className="absolute right-0 bottom-0 w-16 h-16 text-zinc-300 rotate-6" strokeWidth={1.2} />
              </div>
              <div>
                <p className="text-xl font-light text-white">{creationType === 'reel' ? 'Select a video for your reel' : 'Drag photos and videos here'}</p>
                <p className="text-xs text-zinc-500 mt-1.5">
                  {creationType === 'reel' ? 'Up to 70 seconds. It plays full screen, with music and a cover you choose.' : 'Up to 20 pictures in one post. A video you pick becomes a reel (up to 70 seconds).'}
                </p>
              </div>

              {isUploadingMedia ? (
                <div className="flex items-center gap-2 text-sm text-zinc-300"><Loader2 className="w-5 h-5 animate-spin" /> {uploadStatusMsg || 'Uploading...'}</div>
              ) : (
                <div className="flex flex-col items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => (creationType === 'reel' ? videoInputRef : fileInputRef).current?.click()}
                    className="px-5 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold cursor-pointer transition-colors"
                  >
                    Select from device
                  </button>
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="px-5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white text-sm font-semibold cursor-pointer transition-colors flex items-center gap-2"
                  >
                    <Camera className="w-4 h-4" /> {creationType === 'reel' ? 'Record with camera' : 'Use camera'}
                  </button>
                  {creationType === 'post' && (
                    <button
                      type="button"
                      onClick={() => { setMediaMode('text'); setStep('details'); }}
                      className="mt-2 text-xs font-semibold text-zinc-400 hover:text-white underline underline-offset-4 cursor-pointer"
                    >
                      or write a thought, with no picture
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2 — edit the pictures */}
          {step === 'edit' && mediaMode === 'photos' && slides.length > 0 && (
            <div className="pb-4" data-testid="create-edit">
              <div className="relative bg-black">
              {/* Active Image Preview with Filter */}
              <div
                ref={postCanvasRef}
                className="relative mx-auto overflow-hidden bg-black flex items-center justify-center"
                style={{ containerType: 'inline-size', aspectRatio: previewRatio, width: `min(100%, ${(56 * previewRatio).toFixed(1)}vh)` }}
                onPointerDown={() => { setActiveStickerIndex(null); setActiveTagIndex(null); }}
              >
                <img
                  src={activeSlide?.mediaUrl}
                  alt="Slide preview"
                  className="w-full h-full object-cover"
                  style={lookStyle(activeSlide?.filter)}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (activeSlide && img.naturalWidth && img.naturalHeight) {
                      const r = img.naturalWidth / img.naturalHeight;
                      setNaturalRatio((n) => (n[activeSlide.id] === r ? n : { ...n, [activeSlide.id]: r }));
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleRemoveSlide(activeSlideIndex)}
                  className="absolute top-2 right-2 p-1.5 bg-black/80 hover:bg-red-500 text-white rounded-lg transition-colors cursor-pointer"
                  title="Remove this photo"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                {/* Draggable / resizable / rotatable sticker layers on this slide */}
                {activeStickers.map((sticker, idx) => (
                  <EditableStickerLayer
                    key={idx}
                    x={sticker.x}
                    y={sticker.y}
                    width={sticker.width || 40}
                    rotation={sticker.rotation || 0}
                    canvasRef={postCanvasRef}
                    active={activeStickerIndex === idx}
                    onSelect={() => setActiveStickerIndex(idx)}
                    onChange={(next) => updateStickerAt(idx, next)}
                    onTap={() => {
                      if (sticker.type === 'text') openEditPostText(idx, sticker);
                      else if (sticker.type === 'hashtag') openEditPostHashtag(idx, sticker);
                      else if (sticker.type === 'link') openEditPostLink(idx, sticker);
                    }}
                    onDelete={() => deleteStickerAt(idx)}
                    onDragStateChange={(dragging, overTrash) => { setIsDraggingStickerLayer(dragging); setIsStickerOverTrash(overTrash); }}
                    minWidthPct={16}
                    maxWidthPct={90}
                  >
                    {sticker.type === 'text' && (
                      <p
                        className="font-extrabold text-center whitespace-pre-wrap break-words px-1"
                        style={{ color: sticker.data?.color, fontSize: `${(sticker.width || 55) * 0.12}cqw`, textShadow: '0 2px 6px rgba(0,0,0,0.6), 0 0 2px rgba(0,0,0,0.85)' }}
                      >
                        {sticker.data?.text}
                      </p>
                    )}
                    {sticker.type === 'sticker' && sticker.data?.kind === 'emoji' && (
                      <span className="block text-center leading-none select-none" style={{ fontSize: `${(sticker.width || 26) * 0.22}cqw` }}>
                        {sticker.data?.content}
                      </span>
                    )}
                    {sticker.type === 'sticker' && sticker.data?.kind === 'image' && (
                      <img src={sticker.data?.content} alt="" draggable={false} className="w-full h-auto pointer-events-none select-none rounded-lg" />
                    )}
                    {sticker.type === 'mention' && (
                      <div className="w-full flex items-center justify-center">
                        <div className="inline-flex items-center gap-1.5 bg-black/80 backdrop-blur-md border border-[#3B82F6]/50 rounded-full pl-1 pr-3 py-1 shadow-lg whitespace-nowrap" style={{ fontSize: `${(sticker.width || 42) * 0.1}cqw` }}>
                          <div className="rounded-full overflow-hidden shrink-0" style={{ width: '1.8em', height: '1.8em' }}>
                            <AvatarMedia src={sticker.data?.avatar} className="w-full h-full object-cover" />
                          </div>
                          <span className="font-semibold text-white" style={{ fontSize: '1em' }}>@{sticker.data?.username}</span>
                        </div>
                      </div>
                    )}
                    {sticker.type === 'hashtag' && (
                      <div className="w-full flex items-center justify-center">
                        <div className="inline-flex items-center gap-1 bg-black/80 backdrop-blur-md border border-noob/40 rounded-full px-3 py-1.5 shadow-lg whitespace-nowrap" style={{ fontSize: `${(sticker.width || 40) * 0.1}cqw` }}>
                          <span className="font-semibold text-noob" style={{ fontSize: '1em' }}>#{sticker.data?.tag}</span>
                        </div>
                      </div>
                    )}
                    {sticker.type === 'link' && (
                      <div className="w-full flex items-center justify-center">
                        <div className="inline-flex items-center gap-1.5 bg-white text-black rounded-full px-3 py-1.5 shadow-lg whitespace-nowrap" style={{ fontSize: `${(sticker.width || 46) * 0.09}cqw` }}>
                          <Link2 className="shrink-0" style={{ width: '1.1em', height: '1.1em' }} />
                          <span className="font-bold" style={{ fontSize: '1em' }}>{sticker.data?.label}</span>
                        </div>
                      </div>
                    )}
                  </EditableStickerLayer>
                ))}

                {/* Draggable tagged-people pins */}
                {activeTaggedPeople.map((person, idx) => (
                  <EditableStickerLayer
                    key={`tag-${idx}`}
                    x={person.x}
                    y={person.y}
                    width={12}
                    rotation={0}
                    canvasRef={postCanvasRef}
                    active={activeTagIndex === idx}
                    onSelect={() => setActiveTagIndex(idx)}
                    onChange={(next) => updateTaggedPersonAt(idx, { x: next.x, y: next.y })}
                    onDelete={() => deleteTaggedPersonAt(idx)}
                    onDragStateChange={(dragging, overTrash) => { setIsDraggingStickerLayer(dragging); setIsStickerOverTrash(overTrash); }}
                    minWidthPct={12}
                    maxWidthPct={12}
                  >
                    <div className="w-6 h-6 rounded-full border-2 border-white bg-black/60 shadow-lg flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-white" />
                    </div>
                  </EditableStickerLayer>
                ))}

                {/* Trash drop zone — shown only while dragging a layer or pin */}
                {isDraggingStickerLayer && (
                  <div className={`absolute inset-x-0 bottom-0 h-16 z-40 flex items-end justify-center pb-2 pointer-events-none transition-colors ${isStickerOverTrash ? 'bg-red-500/25' : 'bg-black/40'}`}>
                    <div className={`p-2 rounded-full transition-transform ${isStickerOverTrash ? 'bg-red-500 scale-110' : 'bg-black/70'}`}>
                      <Trash2 className="w-4 h-4 text-white" />
                    </div>
                  </div>
                )}

                {/* Text composer */}
                {textEditor !== null && (
                  <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col" onPointerDown={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <button onClick={() => setTextEditor(null)} className="p-1 rounded-full bg-black/60 text-white cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                      {textEditor !== 'new' && (
                        <button onClick={() => { deleteStickerAt(textEditor as number); setTextEditor(null); }} className="p-1 rounded-full bg-black/60 text-red-400 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                      <button onClick={commitPostText} disabled={!draftPostText.trim()} className="px-2.5 py-0.5 bg-noob text-black text-[10px] font-bold rounded-full cursor-pointer disabled:opacity-40">Done</button>
                    </div>
                    <div className="flex-1 flex items-center justify-center p-3">
                      <textarea
                        autoFocus
                        value={draftPostText}
                        onChange={(e) => setDraftPostText(e.target.value)}
                        placeholder="Type something..."
                        maxLength={200}
                        rows={2}
                        className="w-full bg-transparent text-center font-extrabold text-sm resize-none focus:outline-none placeholder:text-white/40"
                        style={{ color: draftPostTextColor }}
                      />
                    </div>
                    <div className="flex items-center justify-center gap-1.5 pb-2">
                      {STICKER_TEXT_COLORS.map((c) => (
                        <button key={c} type="button" onClick={() => setDraftPostTextColor(c)} className={`w-4 h-4 rounded-full border-2 cursor-pointer ${draftPostTextColor === c ? 'border-white scale-110' : 'border-neutral-600'}`} style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Hashtag composer */}
                {hashtagEditor !== null && (
                  <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col" onPointerDown={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <button onClick={() => setHashtagEditor(null)} className="p-1 rounded-full bg-black/60 text-white cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                      {hashtagEditor !== 'new' && (
                        <button onClick={() => { deleteStickerAt(hashtagEditor as number); setHashtagEditor(null); }} className="p-1 rounded-full bg-black/60 text-red-400 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                      <button onClick={commitPostHashtag} disabled={!draftPostHashtag.trim()} className="px-2.5 py-0.5 bg-noob text-black text-[10px] font-bold rounded-full cursor-pointer disabled:opacity-40">Done</button>
                    </div>
                    <div className="flex-1 flex items-center justify-center gap-1 text-lg font-extrabold text-noob">
                      <span>#</span>
                      <input
                        autoFocus
                        value={draftPostHashtag}
                        onChange={(e) => setDraftPostHashtag(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                        placeholder="hashtag"
                        maxLength={40}
                        className="bg-transparent text-center focus:outline-none placeholder:text-noob/40 min-w-0"
                        style={{ width: `${Math.max(3, draftPostHashtag.length || 6)}ch` }}
                      />
                    </div>
                  </div>
                )}

                {/* Link composer */}
                {linkEditor !== null && (
                  <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col" onPointerDown={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <button onClick={() => setLinkEditor(null)} className="p-1 rounded-full bg-black/60 text-white cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                      {linkEditor !== 'new' && (
                        <button onClick={() => { deleteStickerAt(linkEditor as number); setLinkEditor(null); }} className="p-1 rounded-full bg-black/60 text-red-400 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                      <button onClick={commitPostLink} disabled={!draftPostLinkUrl.trim()} className="px-2.5 py-0.5 bg-noob text-black text-[10px] font-bold rounded-full cursor-pointer disabled:opacity-40">Done</button>
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-center gap-2 p-3">
                      <input autoFocus value={draftPostLinkUrl} onChange={(e) => setDraftPostLinkUrl(e.target.value)} placeholder="https://example.com" className="w-full bg-white/10 text-center text-xs text-white p-1.5 rounded-lg border border-white/20 focus:border-noob outline-none" />
                      <input value={draftPostLinkLabel} onChange={(e) => setDraftPostLinkLabel(e.target.value)} placeholder="Label (optional)" maxLength={30} className="w-full bg-white/10 text-center text-xs text-white p-1.5 rounded-lg border border-white/20 focus:border-noob outline-none" />
                    </div>
                  </div>
                )}

                {/* Sticker / emoji / GIF picker */}
                {showPostStickerPicker && (
                  <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col" onPointerDown={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <button onClick={() => setShowPostStickerPicker(false)} className="p-1 rounded-full bg-black/60 text-white cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                      <div className="flex items-center gap-1 bg-black/60 rounded-full p-0.5 overflow-x-auto no-scrollbar max-w-[75%]">
                        {(['emoji', 'animated', 'gif', 'upload'] as const).map((tab) => (
                          <button key={tab} onClick={() => setPostStickerTab(tab)} className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase cursor-pointer shrink-0 ${postStickerTab === tab ? 'bg-noob text-black' : 'text-gray-300'}`}>
                            {tab === 'emoji' ? 'Emoji' : tab === 'animated' ? 'Stickers' : tab === 'gif' ? 'GIF' : 'Upload'}
                          </button>
                        ))}
                      </div>
                      <div className="w-5" />
                    </div>
                    <div className="flex-1 overflow-y-auto px-2 pb-2">
                      {postStickerTab === 'emoji' && <EmojiPanel onPick={(emoji) => addEmojiOrImageSticker('emoji', emoji)} />}
                      {postStickerTab === 'animated' && <AnimatedStickerPanel onPick={(url) => addEmojiOrImageSticker('image', url)} />}
                      {postStickerTab === 'gif' && <GifPanel curated={[]} onPick={(url) => addEmojiOrImageSticker('image', url)} />}
                      {postStickerTab === 'upload' && (
                        <div className="flex flex-col items-center justify-center h-full gap-2.5 py-8">
                          <button
                            type="button"
                            onClick={() => postStickerUploadInputRef.current?.click()}
                            disabled={isUploadingPostSticker}
                            className="flex flex-col items-center gap-2 px-5 py-6 rounded-2xl border-2 border-dashed border-neutral-700 hover:border-noob text-zinc-400 hover:text-noob transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {isUploadingPostSticker ? <Loader2 className="w-7 h-7 animate-spin" /> : <ImageIcon className="w-7 h-7" />}
                            <span className="text-[11px] font-bold">
                              {isUploadingPostSticker ? 'Uploading...' : 'Upload your own sticker or GIF'}
                            </span>
                          </button>
                          {postStickerUploadError && <p className="text-[10px] text-red-400 text-center">{postStickerUploadError}</p>}
                          <input
                            ref={postStickerUploadInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleUploadCustomPostSticker}
                            className="hidden"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Mention picker */}
                {showPostMentionPicker && (
                  <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col" onPointerDown={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5 px-2 py-1.5">
                      <button onClick={() => { setShowPostMentionPicker(false); setPostMentionQuery(''); }} className="p-1 rounded-full bg-black/60 text-white cursor-pointer shrink-0"><X className="w-3.5 h-3.5" /></button>
                      <div className="relative flex-1">
                        <Search className="w-3 h-3 text-zinc-500 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input autoFocus value={postMentionQuery} onChange={(e) => setPostMentionQuery(e.target.value)} placeholder="Search people" className="w-full bg-zinc-900 text-[11px] text-white pl-6 pr-2 py-1.5 rounded-xl border border-zinc-800 focus:border-noob outline-none" />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
                      {postMentionResults.map((u) => (
                        <button key={u.id} onClick={() => addMentionSticker(u)} className="w-full flex items-center gap-2 p-1.5 rounded-xl hover:bg-zinc-900 cursor-pointer text-left">
                          <div className="w-6 h-6 rounded-full overflow-hidden shrink-0"><AvatarMedia src={u.avatar} className="w-full h-full object-cover" /></div>
                          <p className="text-[11px] font-bold text-white truncate">{u.username}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tag People picker */}
                {showTagPeoplePicker && (
                  <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col" onPointerDown={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5 px-2 py-1.5">
                      <button onClick={() => { setShowTagPeoplePicker(false); setTagPeopleQuery(''); }} className="p-1 rounded-full bg-black/60 text-white cursor-pointer shrink-0"><X className="w-3.5 h-3.5" /></button>
                      <div className="relative flex-1">
                        <Search className="w-3 h-3 text-zinc-500 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input autoFocus value={tagPeopleQuery} onChange={(e) => setTagPeopleQuery(e.target.value)} placeholder="Search people to tag" className="w-full bg-zinc-900 text-[11px] text-white pl-6 pr-2 py-1.5 rounded-xl border border-zinc-800 focus:border-noob outline-none" />
                      </div>
                      <span className="text-[10px] text-zinc-400 shrink-0">{activeTaggedPeople.length}/{MAX_TAGGED_PEOPLE}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
                      {activeTaggedPeople.length >= MAX_TAGGED_PEOPLE && (
                        <p className="text-center text-[10px] text-amber-400 py-1">You've tagged the max of {MAX_TAGGED_PEOPLE} people.</p>
                      )}
                      {tagPeopleResults.map((u) => (
                        <button key={u.id} onClick={() => addTaggedPerson(u)} disabled={activeTaggedPeople.length >= MAX_TAGGED_PEOPLE} className="w-full flex items-center gap-2 p-1.5 rounded-xl hover:bg-zinc-900 cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed">
                          <div className="w-6 h-6 rounded-full overflow-hidden shrink-0"><AvatarMedia src={u.avatar} className="w-full h-full object-cover" /></div>
                          <p className="text-[11px] font-bold text-white truncate">{u.username}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              </div>
              {/* The pictures of this post: tap one to edit it; + adds more */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar px-3 pt-3">
                {slides.map((sl, idx) => (
                  <button
                    key={sl.id}
                    type="button"
                    onClick={() => setActiveSlideIndex(idx)}
                    className={`w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all relative cursor-pointer ${
                      idx === activeSlideIndex ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                    aria-label={`Picture ${idx + 1}`}
                  >
                    <img src={sl.mediaUrl} alt="" className="w-full h-full object-cover" style={lookStyle(sl.filter)} />
                  </button>
                ))}
                {slides.length < 20 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingMedia}
                    className="w-14 h-14 rounded-lg flex-shrink-0 border border-dashed border-zinc-600 text-zinc-300 hover:text-white hover:border-white flex items-center justify-center cursor-pointer"
                    aria-label="Add more pictures"
                    title="Add more pictures"
                  >
                    {isUploadingMedia ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                  </button>
                )}
              </div>

              {/* Filters / Adjustments / Shape / Add — like Instagram's edit step */}
              <div className="mt-3 flex items-center border-b border-neutral-800 px-1" role="tablist">
                {([['filters', 'Filters'], ['adjust', 'Adjustments'], ['shape', 'Crop'], ['add', 'Add']] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={editTab === id}
                    onClick={() => setEditTab(id)}
                    className={`flex-1 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${editTab === id ? 'border-white text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="p-3">
                {editTab === 'filters' && (
                  <div>
                    <div className="flex items-start gap-2.5 overflow-x-auto no-scrollbar pb-1">
                      {FILTERS.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => updateLook({ preset: f.id })}
                          className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer"
                          aria-pressed={look.preset === f.id}
                        >
                          <span className={`block w-[72px] h-[72px] rounded-md overflow-hidden border-2 ${look.preset === f.id ? 'border-white' : 'border-transparent'}`}>
                            <img src={activeSlide?.mediaUrl} alt="" className="w-full h-full object-cover" style={f.css ? { filter: f.css } : undefined} />
                          </span>
                          <span className={`text-[11px] ${look.preset === f.id ? 'text-white font-bold' : 'text-zinc-500'}`}>{f.name}</span>
                        </button>
                      ))}
                    </div>
                    {slides.length > 1 && (
                      <button type="button" onClick={applyFilterToAll} className="mt-2 text-[11px] font-bold text-blue-400 hover:text-blue-300 cursor-pointer">
                        Use this filter on all {slides.length} pictures
                      </button>
                    )}
                  </div>
                )}

                {editTab === 'adjust' && (
                  <div className="space-y-4" data-testid="create-adjustments">
                    {([['brightness', 'Brightness'], ['contrast', 'Contrast'], ['saturation', 'Saturation'], ['warmth', 'Temperature']] as const).map(([key, label]) => (
                      <div key={key}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-semibold text-zinc-200">{label}</span>
                          <span className="text-zinc-500 tabular-nums w-10 text-right">{look[key] > 0 ? `+${look[key]}` : look[key]}</span>
                        </div>
                        <input
                          type="range"
                          min={-100}
                          max={100}
                          step={1}
                          value={look[key]}
                          onChange={(e) => updateLook({ [key]: Number(e.target.value) } as Partial<SlideLook>)}
                          className="w-full accent-white cursor-pointer"
                          aria-label={label}
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => updateLook({ brightness: 0, contrast: 0, saturation: 0, warmth: 0 })}
                      className="text-[11px] font-bold text-blue-400 hover:text-blue-300 cursor-pointer"
                    >
                      Reset adjustments
                    </button>
                  </div>
                )}

                {editTab === 'shape' && (
                  <div className="flex items-center gap-2.5 flex-wrap" data-testid="create-shapes">
                    {SLIDE_SHAPES.map((sh) => (
                      <button
                        key={sh.id}
                        type="button"
                        onClick={() => updateLook({ shape: sh.id })}
                        aria-pressed={look.shape === sh.id}
                        className={`flex flex-col items-center gap-1.5 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${look.shape === sh.id ? 'border-white text-white bg-zinc-900' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'}`}
                      >
                        <span
                          className="block border-2 border-current rounded-sm"
                          style={{ width: sh.ratio ? Math.round(28 * Math.min(1, sh.ratio)) + 6 : 26, height: sh.ratio ? Math.round(28 / Math.max(1, sh.ratio)) + 6 : 32 }}
                        />
                        <span className="text-[11px] font-bold">{sh.label}</span>
                      </button>
                    ))}
                    <div className="w-full space-y-3 pt-2" data-testid="create-zoom">
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-semibold text-zinc-200">Zoom</span>
                          <span className="text-zinc-500 tabular-nums">{Math.round(look.zoom * 100)}%</span>
                        </div>
                        <input type="range" min={100} max={300} step={5} value={Math.round(look.zoom * 100)} onChange={(e) => updateLook({ zoom: Number(e.target.value) / 100 })} className="w-full accent-white cursor-pointer" aria-label="Zoom" />
                      </div>
                      {look.zoom > 1 && (
                        <>
                          <div>
                            <div className="text-xs font-semibold text-zinc-200 mb-1">Move left / right</div>
                            <input type="range" min={0} max={100} step={1} value={look.fx} onChange={(e) => updateLook({ fx: Number(e.target.value) })} className="w-full accent-white cursor-pointer" aria-label="Move left or right" />
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-zinc-200 mb-1">Move up / down</div>
                            <input type="range" min={0} max={100} step={1} value={look.fy} onChange={(e) => updateLook({ fy: Number(e.target.value) })} className="w-full accent-white cursor-pointer" aria-label="Move up or down" />
                          </div>
                        </>
                      )}
                      <button type="button" onClick={() => updateLook({ shape: 'original', zoom: 1, fx: 50, fy: 50 })} className="text-[11px] font-bold text-blue-400 hover:text-blue-300 cursor-pointer">
                        Reset crop
                      </button>
                      <p className="text-[11px] text-zinc-500">The shape crops from the middle; zoom in and move to choose which part stays.</p>
                    </div>
                  </div>
                )}

                {editTab === 'add' && (
                  <div>
              {/* Layer Tools */}
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={openNewPostText} className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 bg-zinc-900 border border-zinc-800 text-gray-200 hover:bg-zinc-800"><Type className="w-3.5 h-3.5" /> Text</button>
                <button type="button" onClick={() => setShowPostStickerPicker(true)} className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 bg-zinc-900 border border-zinc-800 text-gray-200 hover:bg-zinc-800"><StickerIcon className="w-3.5 h-3.5" /> Stickers</button>
                <button type="button" onClick={() => setShowPostMentionPicker(true)} className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 bg-zinc-900 border border-zinc-800 text-gray-200 hover:bg-zinc-800"><AtSign className="w-3.5 h-3.5" /> Mention</button>
                <button type="button" onClick={openNewPostHashtag} className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 bg-zinc-900 border border-zinc-800 text-gray-200 hover:bg-zinc-800"><Hash className="w-3.5 h-3.5" /> Hashtag</button>
                <button type="button" onClick={openNewPostLink} className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 bg-zinc-900 border border-zinc-800 text-gray-200 hover:bg-zinc-800"><Link2 className="w-3.5 h-3.5" /> Link</button>
                <button type="button" onClick={() => setShowTagPeoplePicker(true)} className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 bg-zinc-900 border border-zinc-800 text-gray-200 hover:bg-zinc-800">
                  <UserPlus className="w-3.5 h-3.5" /> Tag People {activeTaggedPeople.length > 0 && `(${activeTaggedPeople.length})`}
                </button>
              </div>

                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2 — the reel: watch it, choose its cover */}
          {step === 'edit' && mediaMode === 'video' && videoUrl && (
            <div className="p-4 space-y-5" data-testid="create-edit-reel">
              <div className="relative mx-auto aspect-[9/16] w-full max-w-[240px] rounded-xl overflow-hidden bg-black border border-neutral-800 shadow-lg">
                <video src={videoUrl} controls autoPlay loop muted playsInline className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={handleRemoveVideo}
                  className="absolute top-2 right-2 p-1.5 bg-black/80 hover:bg-red-500 text-white rounded-lg transition-colors cursor-pointer"
                  title="Remove this video"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div data-testid="create-cover">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-white">Cover</span>
                  {isSettingCover && <span className="text-[11px] text-zinc-400 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Setting cover...</span>}
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                  {coverFrames.map((fr, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => chooseCoverFrame(idx)}
                      className={`shrink-0 w-14 aspect-[9/16] rounded-md overflow-hidden border-2 cursor-pointer ${coverPick === idx ? 'border-white' : 'border-transparent opacity-70 hover:opacity-100'}`}
                      aria-label={`Use frame ${idx + 1} as the cover`}
                    >
                      <img src={fr.url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                  {coverFrames.length === 0 && <span className="text-[11px] text-zinc-500">The first moment of the video is used as the cover.</span>}
                </div>
                <div className="flex items-center gap-3 mt-2">
                  {coverPick === 'custom' && coverPreview && <img src={coverPreview} alt="" className="w-10 aspect-[9/16] rounded object-cover border-2 border-white" />}
                  <button type="button" onClick={() => coverInputRef.current?.click()} className="text-xs font-bold text-blue-400 hover:text-blue-300 cursor-pointer">
                    Add from device
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — the details, then Share */}
          {step === 'details' && (
            <div className="p-4 space-y-4" data-testid="create-details">
              {creationType === 'post' && (
              <>
          {/* User Profile & Dual Tagged Indicator (Instagram style) */}
          <div className="flex items-center justify-between bg-neutral-900/50 p-3 rounded-2xl border border-neutral-800/80">
            <div className="flex items-center gap-3">
              {/* Dual Overlapping Avatars (Instagram Style) */}
              <div className="relative flex items-center">
                <img
                  src={currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                  alt={currentUser.username}
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-noob/60 shadow-md"
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
                      <span className="text-xs font-bold text-noob flex items-center gap-1">
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

              </>
              )}

              {/* the caption (with a small picture of what is being shared), emoji and the count */}
              <div className="rounded-2xl border border-neutral-800 bg-zinc-900/60 p-3">
                <div className="flex gap-3">
                  {mediaMode !== 'text' && (
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-black shrink-0 border border-neutral-800">
                      {mediaMode === 'photos' && slides[0] ? (
                        <img src={slides[0].mediaUrl} alt="" className="w-full h-full object-cover" style={lookStyle(slides[0].filter)} />
                      ) : coverPick === 'custom' && coverPreview ? (
                        <img src={coverPreview} alt="" className="w-full h-full object-cover" />
                      ) : typeof coverPick === 'number' && coverFrames[coverPick] ? (
                        <img src={coverFrames[coverPick].url} alt="" className="w-full h-full object-cover" />
                      ) : videoUrl ? (
                        <video src={videoUrl} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                      ) : null}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                  {/* Unified Caption & Thoughts Box with @ Mention Trigger */}
                  <div className="relative">
                    <textarea
                      ref={captionTextareaRef}
                      rows={mediaMode === 'text' ? 6 : 5}
                      maxLength={CAPTION_LIMIT}
                      placeholder={mediaMode === 'text' ? "What's on your mind? Type @ to tag someone." : "Write a caption... Type @ to tag someone."}
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
                      className="w-full bg-transparent text-sm text-white p-0 outline-none leading-relaxed resize-none placeholder:text-zinc-500"
                    />

                    {/* Dynamic @ Mention Dropdown Triggered by typing '@' */}
                    {atMentionQuery !== null && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-950/95 border border-noob/40 rounded-2xl p-2 shadow-2xl z-30 max-h-48 overflow-y-auto backdrop-blur-xl animate-in fade-in slide-in-from-top-1 duration-150">
                        <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-zinc-800">
                          <span className="text-[10px] font-bold text-noob flex items-center gap-1">
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
                                  className="w-6 h-6 rounded-full object-cover ring-1 ring-noob/40"
                                  referrerPolicy="no-referrer"
                                />
                                <div>
                                  <div className="flex items-center gap-1 text-xs font-bold text-white group-hover:text-noob">
                                    <span>{u.displayName || u.username}</span>
                                    {u.isVerified && <VerifiedBadge size="xs" />}
                                  </div>
                                  <span className="text-[10px] text-zinc-400 block">@{u.username}</span>
                                </div>
                              </div>
                              <span className="text-[10px] font-bold text-noob opacity-80 group-hover:opacity-100">
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


                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-neutral-800">
                  <button type="button" onClick={() => setShowCaptionEmoji((v) => !v)} className="p-1 text-zinc-400 hover:text-white cursor-pointer" aria-label="Emoji" title="Emoji">
                    <Smile className="w-5 h-5" />
                  </button>
                  <span className={`text-[11px] tabular-nums ${caption.length > CAPTION_LIMIT - 100 ? 'text-amber-400' : 'text-zinc-500'}`} data-testid="caption-count">
                    {caption.length.toLocaleString()}/{CAPTION_LIMIT.toLocaleString()}
                  </span>
                </div>
                {showCaptionEmoji && (
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-neutral-800">
                    <EmojiPanel onPick={insertCaptionEmoji} />
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
                        ? 'border-noob scale-[1.02] shadow-sm shadow-noob/20 ring-1 ring-noob'
                        : 'border-neutral-800 opacity-70 hover:opacity-100 hover:border-neutral-700'
                    } ${t.bgClass}`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}


              {/* the list of options, like Instagram's */}
              <div>
                {creationType === 'post' && (
                  <div className="flex items-center gap-3 py-3 border-t border-neutral-800/80">
                    <MapPin className="w-5 h-5 text-zinc-300 shrink-0" />
                    <input
                      type="text"
                      placeholder="Add location"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-white focus:outline-none"
                    />
                  </div>
                )}

                {creationType === 'post' && mediaMode === 'photos' && (
                  <button
                    type="button"
                    onClick={() => { setEditTab('add'); setShowTagPeoplePicker(true); setStep('edit'); }}
                    className="w-full flex items-center gap-3 py-3 border-t border-neutral-800/80 text-left cursor-pointer"
                  >
                    <UserPlus className="w-5 h-5 text-zinc-300 shrink-0" />
                    <span className="flex-1 text-sm text-white">Tag people</span>
                    {slides.some((sl) => (sl.taggedUsers || []).length > 0) && (
                      <span className="text-[11px] text-zinc-400">{slides.reduce((n, sl) => n + (sl.taggedUsers || []).length, 0)} tagged</span>
                    )}
                    <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowMusicPicker(true)}
                  className="w-full flex items-center gap-3 py-3 border-t border-neutral-800/80 text-left cursor-pointer"
                >
                  {audioSelection?.coverUrl ? (
                    <img src={audioSelection.coverUrl} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                  ) : (
                    <MusicIcon className="w-5 h-5 text-zinc-300 shrink-0" />
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-white truncate">{audioSelection ? audioSelection.title : 'Add music'}</span>
                    {audioSelection?.artist && <span className="block text-[11px] text-zinc-500 truncate">{audioSelection.artist}</span>}
                  </span>
                  <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
                </button>

                <div className="py-3 border-t border-neutral-800/80">
                  <label className="text-xs text-zinc-400 block mb-1.5">
                    Content category <span className="text-rose-400 font-bold">*required</span>
                  </label>
                  <select
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      if (e.target.value) setCategoryError(false);
                    }}
                    className={`w-full bg-neutral-900 text-sm text-white p-2.5 rounded-xl border outline-none cursor-pointer ${
                      categoryError ? 'border-rose-500 bg-rose-950/20 ring-1 ring-rose-500' : 'border-neutral-800 focus:border-white'
                    }`}
                  >
                    <option value="" disabled>Choose a category</option>
                    {CONTENT_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                  {categoryError && <p className="text-[11px] text-rose-400 font-semibold mt-1.5">Choose a category to share.</p>}
                </div>

                <div className="flex items-center gap-3 py-3 border-t border-neutral-800/80">
                  <Hash className="w-5 h-5 text-zinc-300 shrink-0" />
                  <input
                    type="text"
                    placeholder="Add hashtags (optional): gaming, tech"
                    value={hashtags}
                    onChange={(e) => setHashtags(e.target.value)}
                    className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-white focus:outline-none"
                  />
                </div>

                {creationType === 'post' && (
                  <div className="border-t border-neutral-800/80">
                    <button type="button" onClick={() => setIsAdvancedOpen(!isAdvancedOpen)} className="w-full flex items-center justify-between py-3 cursor-pointer" aria-expanded={isAdvancedOpen}>
                      <span className="text-sm text-white">Advanced settings</span>
                      <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isAdvancedOpen && (
                      <div className="pb-3 space-y-1 animate-in slide-in-from-top-2 duration-200" data-testid="create-advanced">
                        <div className="flex items-center justify-between gap-3 py-2.5">
                          <span>
                            <span className="block text-sm text-white">Hide like and view counts on this post</span>
                            <span className="block text-[11px] text-zinc-500">Only you will see the total number of likes and views.</span>
                          </span>
                          <Switch on={hideLikes} onChange={setHideLikes} label="Hide like and view counts" />
                        </div>
                        <div className="flex items-center justify-between gap-3 py-2.5">
                          <span>
                            <span className="block text-sm text-white">Turn off commenting</span>
                            <span className="block text-[11px] text-zinc-500">You can change this later from the post's menu.</span>
                          </span>
                          <Switch on={disableComments} onChange={setDisableComments} label="Turn off commenting" />
                        </div>
                        <div className="flex items-center justify-between gap-3 py-2.5">
                          <span>
                            <span className="block text-sm text-white">Label as AI generated</span>
                            <span className="block text-[11px] text-zinc-500">Shows an "AI Enhanced" label on the picture.</span>
                          </span>
                          <Switch on={hasAiLabel} onChange={setHasAiLabel} label="Label as AI generated" />
                        </div>
                        <div className="py-2.5">
                          <label className="text-sm text-white flex items-center gap-2 mb-1.5"><Link2 className="w-4 h-4 text-zinc-300" /> Link</label>
                          <input
                            type="url"
                            placeholder="https://example.com"
                            value={webLink}
                            onChange={(e) => setWebLink(e.target.value)}
                            className="w-full bg-black text-sm text-white p-2.5 rounded-xl border border-neutral-800 outline-none focus:border-white"
                          />
                        </div>
                        <div className="py-2.5">
                          <label className="text-sm text-white flex items-center gap-2 mb-1.5"><Calendar className="w-4 h-4 text-zinc-300" /> Schedule for later</label>
                          <input
                            type="datetime-local"
                            value={scheduledFor}
                            onChange={(e) => setScheduledFor(e.target.value)}
                            className="w-full bg-black text-sm text-white p-2.5 rounded-xl border border-neutral-800 outline-none focus:border-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Accessibility: a description of each picture for people who can not see it (read out by screen readers) */}
              {creationType === 'post' && mediaMode === 'photos' && slides.length > 0 && (
                <div className="border-t border-neutral-800/80" data-testid="create-alt">
                  <button type="button" onClick={() => setIsAltOpen((v) => !v)} className="w-full flex items-center justify-between py-3 cursor-pointer" aria-expanded={isAltOpen}>
                    <span className="text-sm text-white">Accessibility</span>
                    <span className="flex items-center gap-2 text-[11px] text-zinc-500">
                      {slides.some((sl) => parseLook(sl.filter).alt) ? 'Alt text added' : 'Write alt text'}
                      <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${isAltOpen ? 'rotate-180' : ''}`} />
                    </span>
                  </button>
                  {isAltOpen && (
                    <div className="pb-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
                      <p className="text-[11px] text-zinc-500">Alt text describes your pictures for people who use a screen reader or have a slow connection.</p>
                      {slides.map((sl, idx) => (
                        <div key={sl.id} className="flex items-start gap-3">
                          <img src={sl.mediaUrl} alt="" className="w-12 h-12 rounded-md object-cover shrink-0" style={lookStyle(sl.filter)} />
                          <input
                            type="text"
                            maxLength={ALT_LIMIT}
                            value={parseLook(sl.filter).alt}
                            onChange={(e) => {
                              const v = e.target.value;
                              setSlides((prev) => prev.map((x) => (x.id === sl.id ? { ...x, filter: buildLook({ ...parseLook(x.filter), alt: v }) } : x)));
                            }}
                            placeholder={slides.length > 1 ? `Describe picture ${idx + 1}` : 'Describe this picture'}
                            aria-label={`Alt text for picture ${idx + 1}`}
                            className="flex-1 min-w-0 bg-black text-sm text-white p-2.5 rounded-xl border border-neutral-800 outline-none focus:border-white"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 4 — it is shared: pass it on, or finish */}
          {step === 'done' && (
            <div className="min-h-full flex flex-col items-center justify-center text-center px-6 py-12 gap-4" data-testid="create-done">
              <div className="w-20 h-20 rounded-full border-2 border-white flex items-center justify-center">
                <Check className="w-10 h-10 text-white" strokeWidth={2} />
              </div>
              <div>
                <p className="text-xl font-light text-white">{scheduledFor ? `Your ${kindWord} is scheduled.` : `Your ${kindWord} has been shared.`}</p>
                <p className="text-xs text-zinc-500 mt-1.5">Share it with friends on other apps too.</p>
              </div>
              <div className="flex flex-col items-center gap-2.5 mt-2">
                <button
                  type="button"
                  onClick={shareToOtherApps}
                  data-testid="share-other-apps"
                  className="px-5 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold cursor-pointer transition-colors flex items-center gap-2"
                >
                  <Share2 className="w-4 h-4" /> Share to other apps
                </button>
                <button type="button" onClick={onClose} className="px-5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white text-sm font-semibold cursor-pointer transition-colors">
                  Done
                </button>
                {shareNote && <p className="text-[11px] text-zinc-400" role="status">{shareNote}</p>}
              </div>
            </div>
          )}

        </div>

        {/* Hidden file inputs: pictures (a video picked here becomes a reel), a video, the camera, a reel's own cover */}
        <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={(e) => handleDeviceMediaUpload(e, 'image')} className="hidden" />
        <input ref={videoInputRef} type="file" accept="video/*" onChange={(e) => handleDeviceMediaUpload(e, 'video')} className="hidden" />
        <input
          ref={cameraInputRef}
          type="file"
          accept={creationType === 'reel' ? 'video/*' : 'image/*,video/*'}
          capture="environment"
          onChange={(e) => handleDeviceMediaUpload(e, creationType === 'reel' ? 'video' : 'image')}
          className="hidden"
        />
        <input ref={coverInputRef} type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />

        {/* Music picker */}
        {showMusicPicker && (
          <MusicPicker
            currentUsername={currentUser.displayName || currentUser.username}
            onClose={() => setShowMusicPicker(false)}
            onSelect={(selection) => {
              setAudioSelection(selection);
              setShowMusicPicker(false);
            }}
          />
        )}
      </div>
    </div>
  );
};
