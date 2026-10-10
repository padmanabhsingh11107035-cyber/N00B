import React, { useState, useRef, useEffect } from 'react';
import { X, Sparkles, Check, MapPin, HelpCircle, ImagePlus, Loader2, Plus, Trash2, Type, Sticker as StickerIcon, AtSign, Hash, Link2, Search, Pencil, Highlighter, Eraser, Undo2, Timer, MessageCircleQuestion, Music as MusicIcon } from 'lucide-react';
import { Story, User } from '../../types';
import { uploadMediaFile } from '../../services/api';
import { EditableStickerLayer } from './EditableStickerLayer';
import { EmojiPanel } from '../Chat/EmojiPanel';
import { AnimatedStickerPanel, GifPanel } from '../Chat/StickerGifPanels';
import { AvatarMedia } from '../Common/AvatarMedia';
import { formatCountdown } from '../../utils/countdown';
import { MusicPicker, MusicSelection } from '../Common/MusicPicker';

const TEXT_COLORS = ['#FFFFFF', '#000000', '#00FF66', '#EF4444', '#3B82F6', '#F59E0B', '#EC4899'];

interface TextLayer {
  id: string;
  text: string;
  color: string;
  x: number;
  y: number;
  width: number;
  rotation: number;
}

interface StickerLayer {
  id: string;
  kind: 'emoji' | 'image';
  content: string; // an emoji character, or an image/GIF url
  x: number;
  y: number;
  width: number;
  rotation: number;
}

interface MentionLayer {
  id: string;
  userId: string;
  username: string;
  displayName?: string;
  avatar?: string;
  x: number;
  y: number;
  width: number;
  rotation: number;
}

interface HashtagLayer {
  id: string;
  tag: string;
  x: number;
  y: number;
  width: number;
  rotation: number;
}

interface LinkLayer {
  id: string;
  url: string;
  label: string;
  x: number;
  y: number;
  width: number;
  rotation: number;
}

// A freehand ink stroke. Points are percentages of the canvas (0-100), so they map straight
// onto an SVG viewBox="0 0 100 100" — no pixel-baking/re-upload needed, and it scales with
// whatever size the photo renders at, same as every other sticker's x/y.
interface DrawStroke {
  points: { x: number; y: number }[];
  color: string;
  width: number; // viewBox units
  mode: 'pen' | 'highlighter';
}

const DRAW_COLORS = ['#FFFFFF', '#000000', '#00FF66', '#EF4444', '#3B82F6', '#F59E0B', '#EC4899'];
const DRAW_SIZES = [0.6, 1.4, 2.6];
const ERASE_RADIUS = 4; // percentage units

interface CountdownLayer {
  id: string;
  label: string;
  targetIso: string;
  x: number;
  y: number;
  width: number;
  rotation: number;
}

interface QuestionLayer {
  id: string;
  prompt: string;
  x: number;
  y: number;
  width: number;
  rotation: number;
}

interface CreateStoryModalProps {
  onClose: () => void;
  // An array because a poll turns into its own second story "page" (a plain colour
  // background) that must be created right after the main one — see handlePublish.
  onSubmitStory: (storyData: Partial<Story>[]) => void;
  allUsers?: User[];
}

const POLL_BG_COLORS = ['#00FF66', '#7C3AED', '#EF4444', '#3B82F6', '#F59E0B', '#EC4899', '#000000', '#FFFFFF'];
// The person posting the poll writes its answers: at least 2, at most 8.
const MIN_POLL_OPTIONS = 2;
const MAX_POLL_OPTIONS = 8;
const MAX_OPTION_LENGTH = 40;

export const CreateStoryModal: React.FC<CreateStoryModalProps> = ({ onClose, onSubmitStory, allUsers = [] }) => {
  const [selectedImage, setSelectedImage] = useState<string>('');
  const [selectedImageObjectKey, setSelectedImageObjectKey] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [filter, setFilter] = useState<'none' | 'emerald' | 'cyber' | 'gala' | 'monochrome'>('none');
  const [isCloseFriends, setIsCloseFriends] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [showPollInput, setShowPollInput] = useState(false);
  const [pollBgColor, setPollBgColor] = useState(POLL_BG_COLORS[0]);
  const [pollOptions, setPollOptions] = useState<string[]>(['Yes 🔥', 'No 👎']);
  const cleanOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
  const pollOptionsError =
    cleanOptions.length < MIN_POLL_OPTIONS
      ? 'Write at least 2 answers for your poll.'
      : new Set(cleanOptions.map((o) => o.toLowerCase())).size !== cleanOptions.length
        ? 'Each answer must be different.'
        : '';
  const [locationTag, setLocationTag] = useState('');
  const [showLocationInput, setShowLocationInput] = useState(false);
  const [locationGeo, setLocationGeo] = useState({ x: 50, y: 75, width: 44, rotation: 0 });

  // Music sticker — one per story, like Instagram's real music sticker. Pick from NOOB's library
  // or record your own clip (MusicPicker); the viewer actually plays it while this story is shown.
  const [musicSelection, setMusicSelection] = useState<MusicSelection | null>(null);
  const [musicGeo, setMusicGeo] = useState({ x: 50, y: 80, width: 46, rotation: 0 });
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [pollGeo, setPollGeo] = useState({ x: 50, y: 50, width: 70, rotation: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const pollCanvasRef = useRef<HTMLDivElement>(null);

  // Re-renders every second so any Countdown layer's live "time left" text keeps ticking.
  const [, forceCountdownTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceCountdownTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Draggable/resizable/rotatable text layers placed on the photo (the first of the
  // "layered editor" sticker types — Stickers/Draw/Link/Mention/etc. build on the same
  // EditableStickerLayer engine in later passes).
  const [textLayers, setTextLayers] = useState<TextLayer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [isDraggingLayer, setIsDraggingLayer] = useState(false);
  const [isOverTrash, setIsOverTrash] = useState(false);
  const [textEditorId, setTextEditorId] = useState<string | 'new' | null>(null);
  const [draftText, setDraftText] = useState('');
  const [draftColor, setDraftColor] = useState(TEXT_COLORS[0]);

  // Emoji / animated-sticker / GIF layers — same drag/resize/rotate engine as text layers.
  const [stickerLayers, setStickerLayers] = useState<StickerLayer[]>([]);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [stickerTab, setStickerTab] = useState<'emoji' | 'animated' | 'gif' | 'upload'>('emoji');
  const [isUploadingSticker, setIsUploadingSticker] = useState(false);
  const [stickerUploadError, setStickerUploadError] = useState('');
  const stickerUploadInputRef = useRef<HTMLInputElement>(null);

  const handleUploadCustomSticker = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsUploadingSticker(true);
    setStickerUploadError('');
    try {
      const res = await uploadMediaFile(file, 'stickers');
      if (res.url) addStickerLayer('image', res.url);
      else setStickerUploadError('Upload failed. Please try again.');
    } catch {
      setStickerUploadError('Upload failed. Please try again.');
    } finally {
      setIsUploadingSticker(false);
    }
  };

  const addStickerLayer = (kind: StickerLayer['kind'], content: string) => {
    const id = `sticker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setStickerLayers((prev) => [
      ...prev,
      {
        id,
        kind,
        content,
        x: 50,
        y: 45 + Math.min(prev.length * 6, 20),
        width: kind === 'emoji' ? 26 : 42,
        rotation: 0
      }
    ]);
    setActiveLayerId(id);
    setShowStickerPicker(false);
  };

  const deleteStickerLayer = (id: string) => {
    setStickerLayers((prev) => prev.filter((s) => s.id !== id));
    setActiveLayerId((cur) => (cur === id ? null : cur));
  };

  // Mention layers — search the app's real users and drop an @username pill.
  const [mentionLayers, setMentionLayers] = useState<MentionLayer[]>([]);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const mentionResults = allUsers
    .filter((u) => {
      const q = mentionQuery.trim().toLowerCase();
      if (!q) return true;
      return u.username.toLowerCase().includes(q) || u.displayName?.toLowerCase().includes(q);
    })
    .slice(0, 30);

  const addMentionLayer = (user: User) => {
    const id = `mention-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setMentionLayers((prev) => [
      ...prev,
      {
        id,
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        x: 50,
        y: 45 + Math.min(prev.length * 6, 20),
        width: 42,
        rotation: 0
      }
    ]);
    setActiveLayerId(id);
    setShowMentionPicker(false);
    setMentionQuery('');
  };

  const deleteMentionLayer = (id: string) => {
    setMentionLayers((prev) => prev.filter((m) => m.id !== id));
    setActiveLayerId((cur) => (cur === id ? null : cur));
  };

  // Hashtag layers.
  const [hashtagLayers, setHashtagLayers] = useState<HashtagLayer[]>([]);
  const [hashtagEditorId, setHashtagEditorId] = useState<string | 'new' | null>(null);
  const [draftHashtag, setDraftHashtag] = useState('');

  const openNewHashtagLayer = () => {
    setDraftHashtag('');
    setHashtagEditorId('new');
  };

  const openEditHashtagLayer = (layer: HashtagLayer) => {
    setDraftHashtag(layer.tag);
    setHashtagEditorId(layer.id);
  };

  const commitHashtagEditor = () => {
    const tag = draftHashtag.trim().replace(/^#+/, '').replace(/\s+/g, '');
    if (!tag) {
      setHashtagEditorId(null);
      return;
    }
    if (hashtagEditorId === 'new') {
      const id = `hashtag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setHashtagLayers((prev) => [
        ...prev,
        { id, tag, x: 50, y: 40 + Math.min(prev.length * 6, 24), width: 40, rotation: 0 }
      ]);
      setActiveLayerId(id);
    } else if (hashtagEditorId) {
      setHashtagLayers((prev) => prev.map((h) => (h.id === hashtagEditorId ? { ...h, tag } : h)));
      setActiveLayerId(hashtagEditorId);
    }
    setHashtagEditorId(null);
  };

  const deleteHashtagLayer = (id: string) => {
    setHashtagLayers((prev) => prev.filter((h) => h.id !== id));
    setActiveLayerId((cur) => (cur === id ? null : cur));
  };

  // Link layers.
  const [linkLayers, setLinkLayers] = useState<LinkLayer[]>([]);
  const [linkEditorId, setLinkEditorId] = useState<string | 'new' | null>(null);
  const [draftLinkUrl, setDraftLinkUrl] = useState('');
  const [draftLinkLabel, setDraftLinkLabel] = useState('');

  const openNewLinkLayer = () => {
    setDraftLinkUrl('');
    setDraftLinkLabel('');
    setLinkEditorId('new');
  };

  const openEditLinkLayer = (layer: LinkLayer) => {
    setDraftLinkUrl(layer.url);
    setDraftLinkLabel(layer.label);
    setLinkEditorId(layer.id);
  };

  const commitLinkEditor = () => {
    let url = draftLinkUrl.trim();
    if (!url) {
      setLinkEditorId(null);
      return;
    }
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    let label = draftLinkLabel.trim();
    if (!label) {
      try { label = new URL(url).hostname.replace(/^www\./, ''); } catch { label = 'Visit link'; }
    }
    if (linkEditorId === 'new') {
      const id = `link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setLinkLayers((prev) => [
        ...prev,
        { id, url, label, x: 50, y: 40 + Math.min(prev.length * 6, 24), width: 46, rotation: 0 }
      ]);
      setActiveLayerId(id);
    } else if (linkEditorId) {
      setLinkLayers((prev) => prev.map((l) => (l.id === linkEditorId ? { ...l, url, label } : l)));
      setActiveLayerId(linkEditorId);
    }
    setLinkEditorId(null);
  };

  const deleteLinkLayer = (id: string) => {
    setLinkLayers((prev) => prev.filter((l) => l.id !== id));
    setActiveLayerId((cur) => (cur === id ? null : cur));
  };

  // Freehand drawing — pen/highlighter/eraser on a full-canvas SVG overlay.
  const [drawStrokes, setDrawStrokes] = useState<DrawStroke[]>([]);
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [drawTool, setDrawTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[2]);
  const [drawSize, setDrawSize] = useState(DRAW_SIZES[1]);
  const [currentStroke, setCurrentStroke] = useState<DrawStroke | null>(null);
  const drawSurfaceRef = useRef<HTMLDivElement>(null);

  const pointFromClient = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const rect = drawSurfaceRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100))
    };
  };

  const eraseAt = (p: { x: number; y: number }) => {
    setDrawStrokes((prev) =>
      prev.filter((s) => !s.points.some((sp) => Math.hypot(sp.x - p.x, sp.y - p.y) < ERASE_RADIUS))
    );
  };

  // Window-level pointermove/pointerup (not element-bound handlers or setPointerCapture, which
  // throws for a pointer the browser doesn't consider "active") — same pattern as
  // EditableStickerLayer's drag, so a stroke keeps extending even if the pointer briefly leaves
  // the drawing surface mid-gesture.
  const handleDrawPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const p = pointFromClient(e.clientX, e.clientY);
    if (!p) return;

    if (drawTool === 'eraser') {
      eraseAt(p);
      const handleMove = (ev: PointerEvent) => {
        const q = pointFromClient(ev.clientX, ev.clientY);
        if (q) eraseAt(q);
      };
      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
      return;
    }

    let stroke: DrawStroke = {
      points: [p],
      color: drawColor,
      width: drawTool === 'highlighter' ? drawSize * 2.2 : drawSize,
      mode: drawTool
    };
    setCurrentStroke(stroke);

    const handleMove = (ev: PointerEvent) => {
      const q = pointFromClient(ev.clientX, ev.clientY);
      if (!q) return;
      stroke = { ...stroke, points: [...stroke.points, q] };
      setCurrentStroke(stroke);
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      if (stroke.points.length > 1) setDrawStrokes((prev) => [...prev, stroke]);
      setCurrentStroke(null);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const strokeToPath = (s: DrawStroke) =>
    s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

  // Countdown layers — a visual "counting down to X" sticker. No reminder/notify backend
  // exists yet, so this is display-only (matches how Location's "weather" is also decorative).
  const [countdownLayers, setCountdownLayers] = useState<CountdownLayer[]>([]);
  const [countdownEditorId, setCountdownEditorId] = useState<string | 'new' | null>(null);
  const [draftCountdownLabel, setDraftCountdownLabel] = useState('');
  const [draftCountdownTarget, setDraftCountdownTarget] = useState('');

  const defaultCountdownTarget = () => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  const openNewCountdownLayer = () => {
    setDraftCountdownLabel('');
    setDraftCountdownTarget(defaultCountdownTarget());
    setCountdownEditorId('new');
  };

  const openEditCountdownLayer = (layer: CountdownLayer) => {
    setDraftCountdownLabel(layer.label);
    const d = new Date(layer.targetIso);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setDraftCountdownTarget(d.toISOString().slice(0, 16));
    setCountdownEditorId(layer.id);
  };

  const commitCountdownEditor = () => {
    if (!draftCountdownTarget) {
      setCountdownEditorId(null);
      return;
    }
    const targetIso = new Date(draftCountdownTarget).toISOString();
    const label = draftCountdownLabel.trim() || 'Countdown';
    if (countdownEditorId === 'new') {
      const id = `countdown-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setCountdownLayers((prev) => [
        ...prev,
        { id, label, targetIso, x: 50, y: 40 + Math.min(prev.length * 6, 24), width: 50, rotation: 0 }
      ]);
      setActiveLayerId(id);
    } else if (countdownEditorId) {
      setCountdownLayers((prev) => prev.map((c) => (c.id === countdownEditorId ? { ...c, label, targetIso } : c)));
      setActiveLayerId(countdownEditorId);
    }
    setCountdownEditorId(null);
  };

  const deleteCountdownLayer = (id: string) => {
    setCountdownLayers((prev) => prev.filter((c) => c.id !== id));
    setActiveLayerId((cur) => (cur === id ? null : cur));
  };

  // Question layers — viewers answer with free text; only you see the answers (see
  // answerStoryQuestion/fetchStoryQuestionResults, migration 20260930000001).
  const [questionLayers, setQuestionLayers] = useState<QuestionLayer[]>([]);
  const [questionEditorId, setQuestionEditorId] = useState<string | 'new' | null>(null);
  const [draftQuestionPrompt, setDraftQuestionPrompt] = useState('');

  const openNewQuestionLayer = () => {
    setDraftQuestionPrompt('');
    setQuestionEditorId('new');
  };

  const openEditQuestionLayer = (layer: QuestionLayer) => {
    setDraftQuestionPrompt(layer.prompt);
    setQuestionEditorId(layer.id);
  };

  const commitQuestionEditor = () => {
    const prompt = draftQuestionPrompt.trim();
    if (!prompt) {
      setQuestionEditorId(null);
      return;
    }
    if (questionEditorId === 'new') {
      const id = `question-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setQuestionLayers((prev) => [
        ...prev,
        { id, prompt, x: 50, y: 40 + Math.min(prev.length * 6, 24), width: 62, rotation: 0 }
      ]);
      setActiveLayerId(id);
    } else if (questionEditorId) {
      setQuestionLayers((prev) => prev.map((q) => (q.id === questionEditorId ? { ...q, prompt } : q)));
      setActiveLayerId(questionEditorId);
    }
    setQuestionEditorId(null);
  };

  const deleteQuestionLayer = (id: string) => {
    setQuestionLayers((prev) => prev.filter((q) => q.id !== id));
    setActiveLayerId((cur) => (cur === id ? null : cur));
  };

  const openNewTextLayer = () => {
    setDraftText('');
    setDraftColor(TEXT_COLORS[0]);
    setTextEditorId('new');
  };

  const openEditTextLayer = (layer: TextLayer) => {
    setDraftText(layer.text);
    setDraftColor(layer.color);
    setTextEditorId(layer.id);
  };

  const commitTextEditor = () => {
    const text = draftText.trim();
    if (!text) {
      setTextEditorId(null);
      return;
    }
    if (textEditorId === 'new') {
      const id = `text-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setTextLayers((prev) => [
        ...prev,
        { id, text, color: draftColor, x: 50, y: 40 + Math.min(prev.length * 6, 24), width: 60, rotation: 0 }
      ]);
      setActiveLayerId(id);
    } else if (textEditorId) {
      setTextLayers((prev) => prev.map((l) => (l.id === textEditorId ? { ...l, text, color: draftColor } : l)));
      setActiveLayerId(textEditorId);
    }
    setTextEditorId(null);
  };

  const deleteTextLayer = (id: string) => {
    setTextLayers((prev) => prev.filter((l) => l.id !== id));
    setActiveLayerId((cur) => (cur === id ? null : cur));
  };

  const handlePickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError('');
    try {
      const res = await uploadMediaFile(file, 'stories');
      if (res.url) {
        setSelectedImage(res.url);
        // The presigned URL expires in an hour — persist the durable object
        // key instead so the server can re-sign it for as long as the story lasts.
        setSelectedImageObjectKey(res.objectKey || '');
      } else {
        setUploadError('Upload failed. Please try again.');
      }
    } catch (err) {
      console.error('Story upload failed:', err);
      setUploadError('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  // A poll no longer overlays the photo — it gets its own following page instead: a
  // plain, user-chosen background colour with just the poll centered on it. Rendered
  // once as a real image (not a new story "kind") so it flows through the exact same
  // upload/storage/expiry/highlight path as every other story, with no schema change.
  const renderPollPageFile = (color: string): Promise<File> =>
    new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas unavailable')); return; }
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Could not render the poll page')); return; }
        resolve(new File([blob], 'poll-page.png', { type: 'image/png' }));
      }, 'image/png');
    });

  const handlePublish = async () => {
    if (!selectedImage || isPublishing) return;
    if (pollQuestion.trim() && pollOptionsError) {
      setUploadError(pollOptionsError);
      return;
    }
    setIsPublishing(true);
    setUploadError('');

    try {
      const mainStickers: any[] = [];
      if (locationTag.trim()) {
        mainStickers.push({
          type: 'location',
          data: { name: locationTag.trim(), weather: '24°C Sunny' },
          x: locationGeo.x,
          y: locationGeo.y,
          width: locationGeo.width,
          rotation: locationGeo.rotation
        });
      }
      textLayers.forEach((layer) => {
        mainStickers.push({
          type: 'text',
          data: { text: layer.text, color: layer.color },
          x: layer.x,
          y: layer.y,
          width: layer.width,
          rotation: layer.rotation
        });
      });
      stickerLayers.forEach((layer) => {
        mainStickers.push({
          type: 'sticker',
          data: { kind: layer.kind, content: layer.content },
          x: layer.x,
          y: layer.y,
          width: layer.width,
          rotation: layer.rotation
        });
      });
      mentionLayers.forEach((layer) => {
        mainStickers.push({
          type: 'mention',
          data: { userId: layer.userId, username: layer.username, displayName: layer.displayName, avatar: layer.avatar },
          x: layer.x,
          y: layer.y,
          width: layer.width,
          rotation: layer.rotation
        });
      });
      hashtagLayers.forEach((layer) => {
        mainStickers.push({
          type: 'hashtag',
          data: { tag: layer.tag },
          x: layer.x,
          y: layer.y,
          width: layer.width,
          rotation: layer.rotation
        });
      });
      linkLayers.forEach((layer) => {
        mainStickers.push({
          type: 'link',
          data: { url: layer.url, label: layer.label },
          x: layer.x,
          y: layer.y,
          width: layer.width,
          rotation: layer.rotation
        });
      });
      if (drawStrokes.length > 0) {
        mainStickers.push({
          type: 'draw',
          data: { strokes: drawStrokes },
          x: 50,
          y: 50,
          width: 100,
          rotation: 0
        });
      }
      countdownLayers.forEach((layer) => {
        mainStickers.push({
          type: 'countdown',
          data: { label: layer.label, targetIso: layer.targetIso },
          x: layer.x,
          y: layer.y,
          width: layer.width,
          rotation: layer.rotation
        });
      });
      questionLayers.forEach((layer) => {
        mainStickers.push({
          type: 'question',
          data: { prompt: layer.prompt },
          x: layer.x,
          y: layer.y,
          width: layer.width,
          rotation: layer.rotation
        });
      });
      if (musicSelection) {
        mainStickers.push({
          type: 'music',
          data: musicSelection,
          x: musicGeo.x,
          y: musicGeo.y,
          width: musicGeo.width,
          rotation: musicGeo.rotation
        });
      }

      const mainStory: Partial<Story> = {
        mediaUrl: selectedImageObjectKey || selectedImage,
        mediaType: 'image',
        filter,
        isCloseFriendsOnly: isCloseFriends,
        stickers: mainStickers
      };

      // The viewer walks a user's stories oldest-created first. So the poll page has to be
      // POSTED (and therefore timestamped) BEFORE the main photo for it to actually land as
      // the "next" page after the photo, even though it's built and uploaded second here.
      const stories: Partial<Story>[] = [];

      if (pollQuestion.trim()) {
        const pollFile = await renderPollPageFile(pollBgColor);
        const uploaded = await uploadMediaFile(pollFile, 'stories');
        if (!uploaded.url) throw new Error('Could not upload the poll page.');
        stories.push({
          mediaUrl: uploaded.objectKey || uploaded.url,
          mediaType: 'image',
          isCloseFriendsOnly: isCloseFriends,
          stickers: [
            {
              type: 'poll',
              data: { question: pollQuestion.trim(), options: cleanOptions.slice(0, MAX_POLL_OPTIONS) },
              x: pollGeo.x,
              y: pollGeo.y,
              width: pollGeo.width,
              rotation: pollGeo.rotation
            }
          ]
        });
      }

      stories.push(mainStory);

      onSubmitStory(stories);
      onClose();
    } catch (err) {
      console.error('Story publish failed:', err);
      setUploadError('Could not post your story. Please try again.');
      setIsPublishing(false);
    }
  };

  const getFilterStyle = () => {
    switch (filter) {
      case 'emerald':
        return 'hue-rotate-60 contrast-125 saturate-150';
      case 'cyber':
        return 'hue-rotate-180 contrast-150 brightness-110';
      case 'gala':
        return 'contrast-110 sepia-25 brightness-105';
      case 'monochrome':
        return 'grayscale contrast-125';
      default:
        return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="relative w-full max-w-md bg-zinc-900 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
          <h3 className="text-sm font-bold text-white tracking-tight">Create NOOB Story</h3>
          <button
            onClick={handlePublish}
            disabled={!selectedImage || isUploading || isPublishing}
            className="px-3.5 py-1 bg-noob text-black text-xs font-bold rounded-full hover:scale-105 transition-transform cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {isPublishing ? 'Sharing...' : 'Share'}
          </button>
        </div>

        {/* Story Preview Area */}
        <div
          ref={canvasRef}
          className="relative w-full aspect-[9/14] bg-black overflow-hidden flex items-center justify-center"
          style={{ containerType: 'inline-size' }}
          onPointerDown={() => setActiveLayerId(null)}
        >
          {selectedImage ? (
            <img
              src={selectedImage}
              alt="Preview"
              className={`w-full h-full object-contain transition-all duration-300 ${getFilterStyle()}`}
            />
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex flex-col items-center gap-3 text-zinc-400 hover:text-noob transition-colors cursor-pointer"
            >
              {isUploading ? (
                <Loader2 className="w-10 h-10 animate-spin" />
              ) : (
                <ImagePlus className="w-10 h-10" />
              )}
              <span className="text-xs font-bold">
                {isUploading ? 'Uploading...' : 'Select a photo from your gallery'}
              </span>
              {uploadError && <span className="text-[10px] text-red-400">{uploadError}</span>}
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePickImage}
            className="hidden"
          />

          {/* Location Tag Editor */}
          {selectedImage && showLocationInput && (
            <div
              className="absolute top-14 inset-x-8 bg-black/85 backdrop-blur-md border border-noob rounded-xl p-2 shadow-2xl z-20 flex items-center gap-2"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <MapPin className="w-4 h-4 text-noob shrink-0" />
              <input
                type="text"
                placeholder="Enter Location Tag..."
                value={locationTag}
                onChange={(e) => setLocationTag(e.target.value)}
                className="w-full bg-transparent text-xs text-white focus:outline-none"
                autoFocus
              />
              <button
                onClick={() => setShowLocationInput(false)}
                className="shrink-0 px-2 py-1 rounded-full bg-noob text-black text-[10px] font-bold cursor-pointer"
              >
                Done
              </button>
            </div>
          )}

          {/* Draggable / resizable / rotatable location pill */}
          {selectedImage && locationTag.trim() && (
            <EditableStickerLayer
              x={locationGeo.x}
              y={locationGeo.y}
              width={locationGeo.width}
              rotation={locationGeo.rotation}
              canvasRef={canvasRef}
              active={activeLayerId === 'location'}
              onSelect={() => setActiveLayerId('location')}
              onChange={(next) => setLocationGeo(next)}
              onTap={() => setShowLocationInput(true)}
              onDelete={() => {
                setLocationTag('');
                setShowLocationInput(false);
                setLocationGeo({ x: 50, y: 75, width: 44, rotation: 0 });
              }}
              onDragStateChange={(dragging, overTrash) => {
                setIsDraggingLayer(dragging);
                setIsOverTrash(overTrash);
              }}
              minWidthPct={20}
              maxWidthPct={80}
            >
              <div className="w-full flex items-center justify-center">
                <div
                  className="inline-flex items-center gap-1.5 bg-black/80 backdrop-blur-md border border-noob/40 rounded-full px-3 py-1.5 shadow-lg whitespace-nowrap"
                  style={{ fontSize: `${locationGeo.width * 0.1}cqw` }}
                >
                  <MapPin className="shrink-0 text-noob" style={{ width: '1.1em', height: '1.1em' }} />
                  <span className="font-semibold text-white" style={{ fontSize: '1em' }}>
                    {locationTag.trim()}
                  </span>
                </div>
              </div>
            </EditableStickerLayer>
          )}

          {selectedImage && !isUploading && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute top-3 right-3 z-20 p-2 bg-black/70 hover:bg-black/90 rounded-full text-white cursor-pointer"
              title="Choose a different photo"
            >
              <ImagePlus className="w-4 h-4" />
            </button>
          )}

          {/* Committed freehand drawing — always visible, like ink baked onto the photo */}
          {selectedImage && drawStrokes.length > 0 && !isDrawMode && (
            <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full z-10 pointer-events-none">
              {drawStrokes.map((s, i) => (
                <path
                  key={i}
                  d={strokeToPath(s)}
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
          )}

          {/* Draggable / resizable / rotatable text layers */}
          {selectedImage &&
            textLayers.map((layer) => (
              <EditableStickerLayer
                key={layer.id}
                x={layer.x}
                y={layer.y}
                width={layer.width}
                rotation={layer.rotation}
                canvasRef={canvasRef}
                active={activeLayerId === layer.id}
                onSelect={() => setActiveLayerId(layer.id)}
                onChange={(next) =>
                  setTextLayers((prev) => prev.map((l) => (l.id === layer.id ? { ...l, ...next } : l)))
                }
                onTap={() => openEditTextLayer(layer)}
                onDelete={() => deleteTextLayer(layer.id)}
                onDragStateChange={(dragging, overTrash) => {
                  setIsDraggingLayer(dragging);
                  setIsOverTrash(overTrash);
                }}
              >
                <p
                  className="font-extrabold text-center whitespace-pre-wrap break-words px-1"
                  style={{
                    color: layer.color,
                    fontSize: `${layer.width * 0.12}cqw`,
                    textShadow: '0 2px 6px rgba(0,0,0,0.6), 0 0 2px rgba(0,0,0,0.85)'
                  }}
                >
                  {layer.text}
                </p>
              </EditableStickerLayer>
            ))}

          {/* Draggable / resizable / rotatable emoji, animated-sticker & GIF layers */}
          {selectedImage &&
            stickerLayers.map((layer) => (
              <EditableStickerLayer
                key={layer.id}
                x={layer.x}
                y={layer.y}
                width={layer.width}
                rotation={layer.rotation}
                canvasRef={canvasRef}
                active={activeLayerId === layer.id}
                onSelect={() => setActiveLayerId(layer.id)}
                onChange={(next) =>
                  setStickerLayers((prev) => prev.map((s) => (s.id === layer.id ? { ...s, ...next } : s)))
                }
                onDelete={() => deleteStickerLayer(layer.id)}
                onDragStateChange={(dragging, overTrash) => {
                  setIsDraggingLayer(dragging);
                  setIsOverTrash(overTrash);
                }}
              >
                {layer.kind === 'emoji' ? (
                  <span
                    className="block text-center leading-none select-none"
                    style={{ fontSize: `${layer.width * 0.22}cqw` }}
                  >
                    {layer.content}
                  </span>
                ) : (
                  <img
                    src={layer.content}
                    alt=""
                    draggable={false}
                    className="w-full h-auto pointer-events-none select-none rounded-lg"
                  />
                )}
              </EditableStickerLayer>
            ))}

          {/* Draggable / resizable / rotatable mention layers */}
          {selectedImage &&
            mentionLayers.map((layer) => (
              <EditableStickerLayer
                key={layer.id}
                x={layer.x}
                y={layer.y}
                width={layer.width}
                rotation={layer.rotation}
                canvasRef={canvasRef}
                active={activeLayerId === layer.id}
                onSelect={() => setActiveLayerId(layer.id)}
                onChange={(next) =>
                  setMentionLayers((prev) => prev.map((m) => (m.id === layer.id ? { ...m, ...next } : m)))
                }
                onDelete={() => deleteMentionLayer(layer.id)}
                onDragStateChange={(dragging, overTrash) => {
                  setIsDraggingLayer(dragging);
                  setIsOverTrash(overTrash);
                }}
                minWidthPct={20}
                maxWidthPct={80}
              >
                <div className="w-full flex items-center justify-center">
                  <div
                    className="inline-flex items-center gap-1.5 bg-black/80 backdrop-blur-md border border-[#3B82F6]/50 rounded-full pl-1 pr-3 py-1 shadow-lg whitespace-nowrap"
                    style={{ fontSize: `${layer.width * 0.1}cqw` }}
                  >
                    <div className="rounded-full overflow-hidden shrink-0" style={{ width: '1.8em', height: '1.8em' }}>
                      <AvatarMedia src={layer.avatar} className="w-full h-full object-cover" />
                    </div>
                    <span className="font-semibold text-white" style={{ fontSize: '1em' }}>@{layer.username}</span>
                  </div>
                </div>
              </EditableStickerLayer>
            ))}

          {/* Draggable / resizable / rotatable hashtag layers */}
          {selectedImage &&
            hashtagLayers.map((layer) => (
              <EditableStickerLayer
                key={layer.id}
                x={layer.x}
                y={layer.y}
                width={layer.width}
                rotation={layer.rotation}
                canvasRef={canvasRef}
                active={activeLayerId === layer.id}
                onSelect={() => setActiveLayerId(layer.id)}
                onChange={(next) =>
                  setHashtagLayers((prev) => prev.map((h) => (h.id === layer.id ? { ...h, ...next } : h)))
                }
                onTap={() => openEditHashtagLayer(layer)}
                onDelete={() => deleteHashtagLayer(layer.id)}
                onDragStateChange={(dragging, overTrash) => {
                  setIsDraggingLayer(dragging);
                  setIsOverTrash(overTrash);
                }}
                minWidthPct={18}
                maxWidthPct={80}
              >
                <div className="w-full flex items-center justify-center">
                  <div
                    className="inline-flex items-center gap-1 bg-black/80 backdrop-blur-md border border-noob/40 rounded-full px-3 py-1.5 shadow-lg whitespace-nowrap"
                    style={{ fontSize: `${layer.width * 0.1}cqw` }}
                  >
                    <span className="font-semibold text-noob" style={{ fontSize: '1em' }}>#{layer.tag}</span>
                  </div>
                </div>
              </EditableStickerLayer>
            ))}

          {/* Draggable / resizable / rotatable link layers */}
          {selectedImage &&
            linkLayers.map((layer) => (
              <EditableStickerLayer
                key={layer.id}
                x={layer.x}
                y={layer.y}
                width={layer.width}
                rotation={layer.rotation}
                canvasRef={canvasRef}
                active={activeLayerId === layer.id}
                onSelect={() => setActiveLayerId(layer.id)}
                onChange={(next) =>
                  setLinkLayers((prev) => prev.map((l) => (l.id === layer.id ? { ...l, ...next } : l)))
                }
                onTap={() => openEditLinkLayer(layer)}
                onDelete={() => deleteLinkLayer(layer.id)}
                onDragStateChange={(dragging, overTrash) => {
                  setIsDraggingLayer(dragging);
                  setIsOverTrash(overTrash);
                }}
                minWidthPct={20}
                maxWidthPct={85}
              >
                <div className="w-full flex items-center justify-center">
                  <div
                    className="inline-flex items-center gap-1.5 bg-white text-black rounded-full px-3 py-1.5 shadow-lg whitespace-nowrap"
                    style={{ fontSize: `${layer.width * 0.09}cqw` }}
                  >
                    <Link2 className="shrink-0" style={{ width: '1.1em', height: '1.1em' }} />
                    <span className="font-bold" style={{ fontSize: '1em' }}>{layer.label}</span>
                  </div>
                </div>
              </EditableStickerLayer>
            ))}

          {/* Draggable / resizable / rotatable countdown layers */}
          {selectedImage &&
            countdownLayers.map((layer) => (
              <EditableStickerLayer
                key={layer.id}
                x={layer.x}
                y={layer.y}
                width={layer.width}
                rotation={layer.rotation}
                canvasRef={canvasRef}
                active={activeLayerId === layer.id}
                onSelect={() => setActiveLayerId(layer.id)}
                onChange={(next) =>
                  setCountdownLayers((prev) => prev.map((c) => (c.id === layer.id ? { ...c, ...next } : c)))
                }
                onTap={() => openEditCountdownLayer(layer)}
                onDelete={() => deleteCountdownLayer(layer.id)}
                onDragStateChange={(dragging, overTrash) => {
                  setIsDraggingLayer(dragging);
                  setIsOverTrash(overTrash);
                }}
                minWidthPct={30}
                maxWidthPct={90}
              >
                <div className="w-full flex items-center justify-center">
                  <div
                    className="flex flex-col items-center gap-0.5 bg-black/85 backdrop-blur-md border border-noob/40 rounded-xl px-4 py-2 shadow-lg whitespace-nowrap"
                    style={{ fontSize: `${layer.width * 0.075}cqw` }}
                  >
                    <span className="font-bold text-noob uppercase tracking-wide" style={{ fontSize: '0.6em' }}>
                      {layer.label}
                    </span>
                    <span className="font-extrabold text-white tabular-nums" style={{ fontSize: '1em' }}>
                      {formatCountdown(layer.targetIso)}
                    </span>
                  </div>
                </div>
              </EditableStickerLayer>
            ))}

          {/* Draggable / resizable / rotatable question layers */}
          {selectedImage &&
            questionLayers.map((layer) => (
              <EditableStickerLayer
                key={layer.id}
                x={layer.x}
                y={layer.y}
                width={layer.width}
                rotation={layer.rotation}
                canvasRef={canvasRef}
                active={activeLayerId === layer.id}
                onSelect={() => setActiveLayerId(layer.id)}
                onChange={(next) =>
                  setQuestionLayers((prev) => prev.map((q) => (q.id === layer.id ? { ...q, ...next } : q)))
                }
                onTap={() => openEditQuestionLayer(layer)}
                onDelete={() => deleteQuestionLayer(layer.id)}
                onDragStateChange={(dragging, overTrash) => {
                  setIsDraggingLayer(dragging);
                  setIsOverTrash(overTrash);
                }}
                minWidthPct={40}
                maxWidthPct={95}
              >
                <div
                  className="w-full bg-gradient-to-br from-fuchsia-500 via-purple-500 to-indigo-500 rounded-2xl p-3 shadow-lg text-center"
                  style={{ fontSize: `${layer.width * 0.06}cqw` }}
                >
                  <p className="font-bold text-white/80" style={{ fontSize: '0.75em' }}>Question</p>
                  <p className="font-extrabold text-white mt-0.5 line-clamp-3" style={{ fontSize: '1em' }}>
                    {layer.prompt}
                  </p>
                </div>
              </EditableStickerLayer>
            ))}

          {/* Draggable / resizable / rotatable music sticker (at most one, like Instagram's) */}
          {selectedImage && musicSelection && (
            <EditableStickerLayer
              x={musicGeo.x}
              y={musicGeo.y}
              width={musicGeo.width}
              rotation={musicGeo.rotation}
              canvasRef={canvasRef}
              active={activeLayerId === 'music'}
              onSelect={() => setActiveLayerId('music')}
              onChange={(next) => setMusicGeo(next)}
              onTap={() => setShowMusicPicker(true)}
              onDelete={() => setMusicSelection(null)}
              onDragStateChange={(dragging, overTrash) => {
                setIsDraggingLayer(dragging);
                setIsOverTrash(overTrash);
              }}
              minWidthPct={30}
              maxWidthPct={80}
            >
              <div className="w-full flex items-center justify-center">
                <div
                  className="inline-flex items-center gap-1.5 bg-black/80 backdrop-blur-md border border-white/20 rounded-full pl-1 pr-3 py-1 shadow-lg whitespace-nowrap"
                  style={{ fontSize: `${musicGeo.width * 0.08}cqw` }}
                >
                  {musicSelection.coverUrl ? (
                    <img src={musicSelection.coverUrl} alt="" className="rounded-full object-cover shrink-0" style={{ width: '1.8em', height: '1.8em' }} />
                  ) : (
                    <div className="rounded-full bg-neutral-800 flex items-center justify-center shrink-0" style={{ width: '1.8em', height: '1.8em' }}>
                      <MusicIcon style={{ width: '1em', height: '1em' }} className="text-white" />
                    </div>
                  )}
                  <span className="font-semibold text-white truncate" style={{ fontSize: '1em', maxWidth: '14em' }}>
                    {musicSelection.title}{musicSelection.artist ? ` · ${musicSelection.artist}` : ''}
                  </span>
                </div>
              </div>
            </EditableStickerLayer>
          )}

          {/* Trash drop zone — shown only while dragging a layer */}
          {isDraggingLayer && (
            <div
              className={`absolute inset-x-0 bottom-0 h-24 z-40 flex items-end justify-center pb-4 pointer-events-none transition-colors ${
                isOverTrash ? 'bg-red-500/25' : 'bg-black/40'
              }`}
            >
              <div
                className={`p-3 rounded-full transition-transform ${
                  isOverTrash ? 'bg-red-500 scale-110' : 'bg-black/70'
                }`}
              >
                <Trash2 className="w-5 h-5 text-white" />
              </div>
            </div>
          )}

          {/* Full-screen text composer */}
          {textEditorId !== null && (
            <div
              className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <button
                  onClick={() => setTextEditorId(null)}
                  className="p-1.5 rounded-full bg-black/60 text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
                {textEditorId !== 'new' && (
                  <button
                    onClick={() => {
                      deleteTextLayer(textEditorId);
                      setTextEditorId(null);
                    }}
                    className="p-1.5 rounded-full bg-black/60 text-red-400 cursor-pointer"
                    title="Delete text"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={commitTextEditor}
                  disabled={!draftText.trim()}
                  className="px-3.5 py-1 bg-noob text-black text-xs font-bold rounded-full cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Done
                </button>
              </div>
              <div className="flex-1 flex items-center justify-center p-6">
                <textarea
                  autoFocus
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  placeholder="Type something..."
                  maxLength={200}
                  rows={3}
                  className="w-full bg-transparent text-center font-extrabold text-2xl resize-none focus:outline-none placeholder:text-white/40"
                  style={{ color: draftColor, textShadow: '0 2px 6px rgba(0,0,0,0.6)' }}
                />
              </div>
              <div className="flex items-center justify-center gap-2.5 pb-6">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDraftColor(c)}
                    title={c}
                    className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                      draftColor === c ? 'border-white scale-110' : 'border-neutral-600 hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Sticker / emoji / GIF picker */}
          {showStickerPicker && (
            <div
              className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <button
                  onClick={() => setShowStickerPicker(false)}
                  className="p-1.5 rounded-full bg-black/60 text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1.5 bg-black/60 rounded-full p-1 overflow-x-auto no-scrollbar max-w-[70%]">
                  {(['emoji', 'animated', 'gif', 'upload'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setStickerTab(tab)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide transition-colors cursor-pointer shrink-0 ${
                        stickerTab === tab ? 'bg-noob text-black' : 'text-gray-300 hover:text-white'
                      }`}
                    >
                      {tab === 'emoji' ? 'Emoji' : tab === 'animated' ? 'Stickers' : tab === 'gif' ? 'GIF' : 'Upload'}
                    </button>
                  ))}
                </div>
                <div className="w-7" />
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-4">
                {stickerTab === 'emoji' && <EmojiPanel onPick={(emoji) => addStickerLayer('emoji', emoji)} />}
                {stickerTab === 'animated' && (
                  <AnimatedStickerPanel onPick={(url) => addStickerLayer('image', url)} />
                )}
                {stickerTab === 'gif' && <GifPanel curated={[]} onPick={(url) => addStickerLayer('image', url)} />}
                {stickerTab === 'upload' && (
                  <div className="flex flex-col items-center justify-center h-full gap-3 py-10">
                    <button
                      type="button"
                      onClick={() => stickerUploadInputRef.current?.click()}
                      disabled={isUploadingSticker}
                      className="flex flex-col items-center gap-2.5 px-6 py-8 rounded-2xl border-2 border-dashed border-neutral-700 hover:border-noob text-zinc-400 hover:text-noob transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isUploadingSticker ? <Loader2 className="w-8 h-8 animate-spin" /> : <ImagePlus className="w-8 h-8" />}
                      <span className="text-xs font-bold">
                        {isUploadingSticker ? 'Uploading...' : 'Upload your own sticker or GIF'}
                      </span>
                    </button>
                    {stickerUploadError && <p className="text-[11px] text-red-400 text-center">{stickerUploadError}</p>}
                    <input
                      ref={stickerUploadInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleUploadCustomSticker}
                      className="hidden"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Mention picker */}
          {showMentionPicker && (
            <div
              className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <button
                  onClick={() => { setShowMentionPicker(false); setMentionQuery(''); }}
                  className="p-1.5 rounded-full bg-black/60 text-white cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    autoFocus
                    value={mentionQuery}
                    onChange={(e) => setMentionQuery(e.target.value)}
                    placeholder="Search people to mention"
                    className="w-full bg-zinc-900 text-xs text-white pl-8 pr-2 py-2 rounded-xl border border-zinc-800 focus:border-noob outline-none placeholder:text-zinc-600"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
                {mentionResults.length === 0 && (
                  <p className="text-center text-[11px] text-zinc-500 py-6">No one found.</p>
                )}
                {mentionResults.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => addMentionLayer(u)}
                    className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-zinc-900 cursor-pointer text-left"
                  >
                    <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
                      <AvatarMedia src={u.avatar} className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{u.username}</p>
                      {u.displayName && <p className="text-[10px] text-zinc-400 truncate">{u.displayName}</p>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Hashtag composer */}
          {hashtagEditorId !== null && (
            <div
              className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <button
                  onClick={() => setHashtagEditorId(null)}
                  className="p-1.5 rounded-full bg-black/60 text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
                {hashtagEditorId !== 'new' && (
                  <button
                    onClick={() => { deleteHashtagLayer(hashtagEditorId); setHashtagEditorId(null); }}
                    className="p-1.5 rounded-full bg-black/60 text-red-400 cursor-pointer"
                    title="Delete hashtag"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={commitHashtagEditor}
                  disabled={!draftHashtag.trim()}
                  className="px-3.5 py-1 bg-noob text-black text-xs font-bold rounded-full cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Done
                </button>
              </div>
              <div className="flex-1 flex items-center justify-center p-6">
                <div className="w-full flex items-center justify-center gap-1 text-2xl font-extrabold text-noob">
                  <span>#</span>
                  <input
                    autoFocus
                    value={draftHashtag}
                    onChange={(e) => setDraftHashtag(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                    placeholder="hashtag"
                    maxLength={40}
                    className="bg-transparent text-center focus:outline-none placeholder:text-noob/40 min-w-0"
                    style={{ width: `${Math.max(3, draftHashtag.length || 8)}ch` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Link composer */}
          {linkEditorId !== null && (
            <div
              className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <button
                  onClick={() => setLinkEditorId(null)}
                  className="p-1.5 rounded-full bg-black/60 text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
                {linkEditorId !== 'new' && (
                  <button
                    onClick={() => { deleteLinkLayer(linkEditorId); setLinkEditorId(null); }}
                    className="p-1.5 rounded-full bg-black/60 text-red-400 cursor-pointer"
                    title="Delete link"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={commitLinkEditor}
                  disabled={!draftLinkUrl.trim()}
                  className="px-3.5 py-1 bg-noob text-black text-xs font-bold rounded-full cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Done
                </button>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
                <input
                  autoFocus
                  value={draftLinkUrl}
                  onChange={(e) => setDraftLinkUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full bg-white/10 text-center text-sm text-white p-2.5 rounded-lg border border-white/20 focus:border-noob outline-none placeholder:text-white/40"
                />
                <input
                  value={draftLinkLabel}
                  onChange={(e) => setDraftLinkLabel(e.target.value)}
                  placeholder="Label shown on the sticker (optional)"
                  maxLength={30}
                  className="w-full bg-white/10 text-center text-sm text-white p-2.5 rounded-lg border border-white/20 focus:border-noob outline-none placeholder:text-white/40"
                />
              </div>
            </div>
          )}

          {/* Draw mode — pen / highlighter / eraser on a full-canvas SVG surface */}
          {isDrawMode && (
            <div className="absolute inset-0 z-50 bg-black/40 flex flex-col" onPointerDown={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-3 py-2.5">
                <button
                  onClick={() => setIsDrawMode(false)}
                  className="p-1.5 rounded-full bg-black/60 text-white cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setDrawStrokes((prev) => prev.slice(0, -1))}
                    disabled={drawStrokes.length === 0}
                    className="p-1.5 rounded-full bg-black/60 text-white cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Undo last stroke"
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                  {(['pen', 'highlighter', 'eraser'] as const).map((tool) => (
                    <button
                      key={tool}
                      onClick={() => setDrawTool(tool)}
                      className={`p-1.5 rounded-full cursor-pointer ${
                        drawTool === tool ? 'bg-noob text-black' : 'bg-black/60 text-white'
                      }`}
                      title={tool}
                    >
                      {tool === 'pen' && <Pencil className="w-4 h-4" />}
                      {tool === 'highlighter' && <Highlighter className="w-4 h-4" />}
                      {tool === 'eraser' && <Eraser className="w-4 h-4" />}
                    </button>
                  ))}
                </div>
                <div className="w-7" />
              </div>

              <div
                ref={drawSurfaceRef}
                className="flex-1 relative touch-none"
                onPointerDown={handleDrawPointerDown}
              >
                <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
                  {drawStrokes.map((s, i) => (
                    <path
                      key={i}
                      d={strokeToPath(s)}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={s.width}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={s.mode === 'highlighter' ? 0.45 : 1}
                      style={s.mode === 'highlighter' ? { mixBlendMode: 'multiply' } : undefined}
                    />
                  ))}
                  {currentStroke && (
                    <path
                      d={strokeToPath(currentStroke)}
                      fill="none"
                      stroke={currentStroke.color}
                      strokeWidth={currentStroke.width}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={currentStroke.mode === 'highlighter' ? 0.45 : 1}
                      style={currentStroke.mode === 'highlighter' ? { mixBlendMode: 'multiply' } : undefined}
                    />
                  )}
                </svg>
              </div>

              {drawTool !== 'eraser' && (
                <div className="flex items-center justify-center gap-2.5 py-3">
                  {DRAW_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setDrawColor(c)}
                      title={c}
                      className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                        drawColor === c ? 'border-white scale-110' : 'border-neutral-600 hover:scale-105'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              )}
              <div className="flex items-center justify-center gap-3 pb-5">
                {DRAW_SIZES.map((sz, i) => (
                  <button
                    key={sz}
                    onClick={() => setDrawSize(sz)}
                    className={`rounded-full flex items-center justify-center cursor-pointer transition-colors ${
                      drawSize === sz ? 'bg-noob' : 'bg-neutral-700'
                    }`}
                    style={{ width: '32px', height: '32px' }}
                    title={['Thin', 'Medium', 'Thick'][i]}
                  >
                    <span
                      className="rounded-full bg-white"
                      style={{ width: `${4 + i * 4}px`, height: `${4 + i * 4}px` }}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Countdown composer */}
          {countdownEditorId !== null && (
            <div
              className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <button
                  onClick={() => setCountdownEditorId(null)}
                  className="p-1.5 rounded-full bg-black/60 text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
                {countdownEditorId !== 'new' && (
                  <button
                    onClick={() => { deleteCountdownLayer(countdownEditorId); setCountdownEditorId(null); }}
                    className="p-1.5 rounded-full bg-black/60 text-red-400 cursor-pointer"
                    title="Delete countdown"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={commitCountdownEditor}
                  disabled={!draftCountdownTarget}
                  className="px-3.5 py-1 bg-noob text-black text-xs font-bold rounded-full cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Done
                </button>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
                <input
                  autoFocus
                  value={draftCountdownLabel}
                  onChange={(e) => setDraftCountdownLabel(e.target.value)}
                  placeholder="What's counting down? (e.g. New Year)"
                  maxLength={30}
                  className="w-full bg-white/10 text-center text-sm text-white p-2.5 rounded-lg border border-white/20 focus:border-noob outline-none placeholder:text-white/40"
                />
                <input
                  type="datetime-local"
                  value={draftCountdownTarget}
                  onChange={(e) => setDraftCountdownTarget(e.target.value)}
                  className="w-full bg-white/10 text-center text-sm text-white p-2.5 rounded-lg border border-white/20 focus:border-noob outline-none [color-scheme:dark]"
                />
                {draftCountdownTarget && (
                  <p className="text-noob text-xs font-bold">{formatCountdown(new Date(draftCountdownTarget).toISOString())}</p>
                )}
              </div>
            </div>
          )}

          {/* Question composer */}
          {questionEditorId !== null && (
            <div
              className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <button
                  onClick={() => setQuestionEditorId(null)}
                  className="p-1.5 rounded-full bg-black/60 text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
                {questionEditorId !== 'new' && (
                  <button
                    onClick={() => { deleteQuestionLayer(questionEditorId); setQuestionEditorId(null); }}
                    className="p-1.5 rounded-full bg-black/60 text-red-400 cursor-pointer"
                    title="Delete question"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={commitQuestionEditor}
                  disabled={!draftQuestionPrompt.trim()}
                  className="px-3.5 py-1 bg-noob text-black text-xs font-bold rounded-full cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Done
                </button>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
                <div className="w-full max-w-xs bg-gradient-to-br from-fuchsia-500 via-purple-500 to-indigo-500 rounded-2xl p-4 text-center">
                  <p className="text-xs font-bold text-white/80">Question</p>
                  <textarea
                    autoFocus
                    value={draftQuestionPrompt}
                    onChange={(e) => setDraftQuestionPrompt(e.target.value)}
                    placeholder="Ask me a question..."
                    maxLength={120}
                    rows={2}
                    className="w-full bg-transparent text-center font-extrabold text-white text-lg resize-none focus:outline-none placeholder:text-white/60 mt-1"
                  />
                </div>
                <p className="text-[10px] text-gray-500 text-center">Only you will see the answers people send.</p>
              </div>
            </div>
          )}

          {/* Music picker */}
          {showMusicPicker && (
            <MusicPicker
              onClose={() => setShowMusicPicker(false)}
              onSelect={(selection) => {
                setMusicSelection(selection);
                setShowMusicPicker(false);
              }}
            />
          )}
        </div>

        {/* Tools & Filter Presets */}
        {selectedImage && (
          <div className="p-3 bg-neutral-900 border-t border-neutral-800 space-y-3">
            {uploadError && (
              <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-[11px]">
                {uploadError}
              </div>
            )}
            {/* Quick Interactive Sticker Toggles */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <button
                onClick={openNewTextLayer}
                className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors bg-neutral-800 text-gray-300 hover:bg-neutral-700"
              >
                <Type className="w-3.5 h-3.5" /> Text
              </button>
              <button
                onClick={() => setShowStickerPicker(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors bg-neutral-800 text-gray-300 hover:bg-neutral-700"
              >
                <StickerIcon className="w-3.5 h-3.5" /> Stickers
              </button>
              <button
                onClick={() => setShowMentionPicker(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors bg-neutral-800 text-gray-300 hover:bg-neutral-700"
              >
                <AtSign className="w-3.5 h-3.5" /> Mention
              </button>
              <button
                onClick={openNewHashtagLayer}
                className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors bg-neutral-800 text-gray-300 hover:bg-neutral-700"
              >
                <Hash className="w-3.5 h-3.5" /> Hashtag
              </button>
              <button
                onClick={openNewLinkLayer}
                className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors bg-neutral-800 text-gray-300 hover:bg-neutral-700"
              >
                <Link2 className="w-3.5 h-3.5" /> Link
              </button>
              <button
                onClick={() => setIsDrawMode(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors bg-neutral-800 text-gray-300 hover:bg-neutral-700"
              >
                <Pencil className="w-3.5 h-3.5" /> Draw
              </button>
              <button
                onClick={openNewCountdownLayer}
                className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors bg-neutral-800 text-gray-300 hover:bg-neutral-700"
              >
                <Timer className="w-3.5 h-3.5" /> Countdown
              </button>
              <button
                onClick={openNewQuestionLayer}
                className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors bg-neutral-800 text-gray-300 hover:bg-neutral-700"
              >
                <MessageCircleQuestion className="w-3.5 h-3.5" /> Questions
              </button>
              <button
                type="button"
                onClick={() => setShowMusicPicker(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors bg-neutral-800 text-gray-300 hover:bg-neutral-700"
              >
                <MusicIcon className="w-3.5 h-3.5" /> Music
              </button>
              <button
                onClick={() => setShowPollInput(!showPollInput)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  showPollInput ? 'bg-noob text-black font-bold' : 'bg-neutral-800 text-gray-300 hover:bg-neutral-700'
                }`}
              >
                <HelpCircle className="w-3.5 h-3.5" /> Poll Sticker
              </button>
              <button
                onClick={() => setShowLocationInput(!showLocationInput)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  showLocationInput ? 'bg-noob text-black font-bold' : 'bg-neutral-800 text-gray-300 hover:bg-neutral-700'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" /> Location
              </button>
              <button
                onClick={() => setIsCloseFriends(!isCloseFriends)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  isCloseFriends ? 'bg-emerald-500 text-black font-bold' : 'bg-neutral-800 text-gray-300 hover:bg-neutral-700'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" /> Close Friends Only
              </button>
            </div>

            {/* Poll Setup: this no longer overlays the photo — it becomes its own page
                right after this one, with a plain background in the color you pick. */}
            {showPollInput && (
              <div className="p-3 bg-neutral-950 border border-noob/30 rounded-xl space-y-2.5">
                <p className="text-[10px] text-gray-400">
                  Your poll appears as its own page, right after this photo — not on top of it.
                </p>
                <input
                  type="text"
                  placeholder="Ask a question for your poll..."
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  className="w-full bg-neutral-900 text-xs text-white p-2 rounded-lg border border-neutral-700 focus:border-noob outline-none text-center font-bold"
                />
                {/* The answers people can vote for: written by you, 2 to 8 of them */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Answers</span>
                    <span className="text-[10px] text-gray-500">{pollOptions.length}/{MAX_POLL_OPTIONS}</span>
                  </div>
                  {pollOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={opt}
                        maxLength={MAX_OPTION_LENGTH}
                        placeholder={`Answer ${i + 1}`}
                        onChange={(e) => setPollOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))}
                        className="flex-1 min-w-0 bg-neutral-900 text-xs text-white px-2.5 py-2 rounded-lg border border-neutral-700 focus:border-noob outline-none font-semibold"
                      />
                      {pollOptions.length > MIN_POLL_OPTIONS && (
                        <button
                          type="button"
                          onClick={() => setPollOptions((prev) => prev.filter((_, j) => j !== i))}
                          className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-neutral-800 transition-colors cursor-pointer"
                          aria-label={`Remove answer ${i + 1}`}
                          title="Remove this answer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < MAX_POLL_OPTIONS && (
                    <button
                      type="button"
                      onClick={() => setPollOptions((prev) => [...prev, ''])}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-neutral-700 text-[11px] font-bold text-gray-300 hover:border-noob hover:text-noob transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add answer
                    </button>
                  )}
                  {pollQuestion.trim() && pollOptionsError && (
                    <p className="text-[10px] text-red-400">{pollOptionsError}</p>
                  )}
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1.5">
                    Poll Page Background Color
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {POLL_BG_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setPollBgColor(c)}
                        title={c}
                        className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                          pollBgColor === c ? 'border-white scale-110' : 'border-neutral-700 hover:scale-105'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                {pollQuestion.trim() && (
                  <div className="mx-auto w-56">
                    <div
                      ref={pollCanvasRef}
                      className="relative aspect-[9/16] w-full rounded-lg shadow-lg overflow-hidden"
                      style={{ backgroundColor: pollBgColor, containerType: 'inline-size' }}
                      onPointerDown={() => setActiveLayerId(null)}
                    >
                      <EditableStickerLayer
                        x={pollGeo.x}
                        y={pollGeo.y}
                        width={pollGeo.width}
                        rotation={pollGeo.rotation}
                        canvasRef={pollCanvasRef}
                        active={activeLayerId === 'poll'}
                        onSelect={() => setActiveLayerId('poll')}
                        onChange={(next) => setPollGeo(next)}
                        minWidthPct={40}
                        maxWidthPct={95}
                      >
                        <div
                          className="w-full bg-black/85 border border-noob/40 rounded-md p-1.5"
                          style={{ fontSize: `${pollGeo.width * 0.045}cqw` }}
                        >
                          <p className="font-bold text-center text-white mb-1 line-clamp-2" style={{ fontSize: '1em' }}>
                            {pollQuestion}
                          </p>
                          <div className="space-y-0.5">
                            {cleanOptions.map((o, i) => (
                              <div
                                key={i}
                                className="bg-neutral-800 text-white font-semibold text-center py-0.5 rounded truncate px-0.5"
                                style={{ fontSize: '0.82em' }}
                              >
                                {o}
                              </div>
                            ))}
                          </div>
                        </div>
                      </EditableStickerLayer>
                    </div>
                    <p className="text-[9px] text-gray-500 text-center mt-1.5">
                      Drag to position on its page · use the handle to resize/rotate
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* AR / Classic Filters Selector */}
            <div>
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1.5">
                AR & Color Presets
              </span>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                {(['none', 'emerald', 'cyber', 'gala', 'monochrome'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize border transition-all ${
                      filter === f
                        ? 'border-noob bg-noob/10 text-noob'
                        : 'border-neutral-700 text-gray-400 hover:text-white'
                    }`}
                  >
                    {f === 'gala' ? '✨ GALA Preset' : f}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
