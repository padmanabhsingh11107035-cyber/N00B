// NOOB Studio: the project is plain data (this file). Everything the editor shows or exports is drawn from it by render.ts, so the preview and the exported file always agree,
// and undo / redo is just going back to an earlier copy of it. The imported files themselves are never changed: they live next to the project (Asset) and stay on the device.

export type Aspect = '9:16' | '4:5' | '1:1' | '16:9' | '4:3';

/** Size of the canvas in "design pixels" (every position and size in the project is in these). */
export const ASPECTS: Record<Aspect, { w: number; h: number; label: string; hint: string }> = {
  '9:16': { w: 1080, h: 1920, label: '9:16', hint: 'Reels, Stories' },
  '4:5': { w: 1080, h: 1350, label: '4:5', hint: 'Portrait post' },
  '1:1': { w: 1080, h: 1080, label: '1:1', hint: 'Square post' },
  '16:9': { w: 1920, h: 1080, label: '16:9', hint: 'Landscape video' },
  '4:3': { w: 1440, h: 1080, label: '4:3', hint: 'Classic' }
};

export interface Adjust {
  brightness: number; contrast: number; exposure: number; highlights: number; shadows: number;
  saturation: number; vibrance: number; temperature: number; tint: number; hue: number;
  fade: number; vignette: number; grain: number; sharpness: number; blur: number;
}
export const NO_ADJUST: Adjust = {
  brightness: 0, contrast: 0, exposure: 0, highlights: 0, shadows: 0, saturation: 0, vibrance: 0, temperature: 0, tint: 0, hue: 0,
  fade: 0, vignette: 0, grain: 0, sharpness: 0, blur: 0
};
export const isPlain = (a: Adjust): boolean => (Object.keys(NO_ADJUST) as Array<keyof Adjust>).every((k) => a[k] === 0);

export type Anim = 'none' | 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'zoom' | 'pop' | 'bounce' | 'rotate' | 'shake' | 'typewriter';
export type TransitionType = 'cut' | 'fade' | 'dissolve' | 'slide' | 'zoom' | 'wipe' | 'blur';

interface Base {
  id: string;
  name: string;
  hidden: boolean;
  locked: boolean;
  /** centre of the layer, in design pixels */
  x: number;
  y: number;
  /** design pixels per source pixel (media) or a plain multiplier (text, sticker) */
  scale: number;
  rotation: number;
  opacity: number;
  flipX: boolean;
  flipY: boolean;
  /** seconds on the timeline */
  start: number;
  duration: number;
  animIn: Anim;
  animOut: Anim;
  animDur: number;
}

export interface MediaLayer extends Base {
  type: 'media';
  assetId: string;
  /** the main track is the story of the video, one clip after another; overlay clips float above it (picture in picture, collages) */
  track: 'main' | 'overlay';
  /** the part of the picture that is kept, as fractions (0..1) of the source */
  crop: { x: number; y: number; w: number; h: number };
  adjust: Adjust;
  filter: string;
  filterAmount: number;
  /** video: the part of the source that is used, in seconds */
  trimIn: number;
  trimOut: number;
  speed: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  /** how this clip comes in over the one before it (main track) */
  transition: { type: TransitionType; duration: number };
  fit: 'contain' | 'cover';
  radius: number;
}

export interface TextLayer extends Base {
  type: 'text';
  text: string;
  font: string;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right';
  letter: number;
  lineHeight: number;
  stroke: number;
  strokeColor: string;
  shadow: number;
  shadowColor: string;
  glow: number;
  bg: string;
  bgOpacity: number;
  bgRadius: number;
}

export interface StickerLayer extends Base {
  type: 'sticker';
  kind: 'emoji' | 'shape' | 'image';
  /** the emoji, the shape's name, or (image) the asset id */
  content: string;
  size: number;
  color: string;
}

export interface Stroke {
  kind: 'pen' | 'highlighter' | 'line' | 'arrow' | 'rect' | 'ellipse';
  points: Array<[number, number]>;
  color: string;
  size: number;
  opacity: number;
}
export interface DrawLayer extends Base { type: 'draw'; strokes: Stroke[] }

export interface AudioLayer extends Base {
  type: 'audio';
  assetId: string;
  label: 'music' | 'voice';
  trimIn: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

export interface Cue { id: string; start: number; end: number; text: string }
export interface CaptionLayer extends Base {
  type: 'captions';
  cues: Cue[];
  size: number;
  color: string;
  bg: string;
  bgOpacity: number;
  stroke: number;
  bold: boolean;
  /** how far from the top, 0..1 */
  y01: number;
  font: string;
}

export type Layer = MediaLayer | TextLayer | StickerLayer | DrawLayer | AudioLayer | CaptionLayer;

export interface Project {
  v: 1;
  name: string;
  aspect: Aspect;
  bgColor: string;
  /** behind a picture that does not fill the canvas: a blurred copy of the main clip instead of the plain colour */
  bgBlur: boolean;
  mode: 'photo' | 'video';
  layers: Layer[];
}

/** A file the person imported. Lives only in memory on this device. */
export interface Asset {
  id: string;
  kind: 'image' | 'video' | 'audio';
  name: string;
  size: number;
  mime: string;
  url: string;
  width: number;
  height: number;
  duration: number;
  thumb: string;
  /** decoded picture (images) */
  bitmap?: ImageBitmap | HTMLImageElement;
  /** loudness outline for audio and video clips, 0..1 */
  peaks?: number[];
}

export const uid = (p = 'l'): string => `${p}-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;

export const emptyProject = (aspect: Aspect = '9:16'): Project => ({ v: 1, name: 'Untitled', aspect, bgColor: '#000000', bgBlur: true, mode: 'photo', layers: [] });

const baseLayer = (name: string): Base => ({
  id: uid(), name, hidden: false, locked: false, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, flipX: false, flipY: false,
  start: 0, duration: 4, animIn: 'none', animOut: 'none', animDur: 0.5
});

export function newMediaLayer(asset: Asset, project: Project, track: 'main' | 'overlay', start = 0): MediaLayer {
  const size = ASPECTS[project.aspect];
  const isVideo = asset.kind === 'video';
  const duration = isVideo ? Math.max(0.1, asset.duration) : 3;
  const b = baseLayer(asset.name);
  const layer: MediaLayer = {
    ...b, type: 'media', assetId: asset.id, track, x: size.w / 2, y: size.h / 2, start, duration,
    crop: { x: 0, y: 0, w: 1, h: 1 }, adjust: { ...NO_ADJUST }, filter: 'none', filterAmount: 100,
    trimIn: 0, trimOut: isVideo ? asset.duration : duration, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0,
    transition: { type: 'cut', duration: 0.5 }, fit: 'contain', radius: 0
  };
  return fitLayer(layer, asset, project, track === 'main' ? 'contain' : 'contain');
}

/** Make a media layer fill (cover) or fit (contain) the canvas, centred. Overlay clips are placed at 60% of the canvas. */
export function fitLayer(layer: MediaLayer, asset: Asset, project: Project, fit: 'contain' | 'cover'): MediaLayer {
  const size = ASPECTS[project.aspect];
  const cw = Math.max(1, asset.width * layer.crop.w);
  const ch = Math.max(1, asset.height * layer.crop.h);
  const k = layer.track === 'main' ? 1 : 0.6;
  const scale = (fit === 'cover' ? Math.max(size.w / cw, size.h / ch) : Math.min(size.w / cw, size.h / ch)) * k;
  return { ...layer, fit, scale, x: size.w / 2, y: size.h / 2, rotation: 0 };
}

export function newTextLayer(project: Project, text = 'Your text', start = 0, duration = 4): TextLayer {
  const size = ASPECTS[project.aspect];
  return {
    ...baseLayer('Text'), type: 'text', x: size.w / 2, y: size.h / 2, start, duration, text, font: 'Plus Jakarta Sans', size: 96, color: '#ffffff',
    bold: true, italic: false, underline: false, align: 'center', letter: 0, lineHeight: 1.15, stroke: 0, strokeColor: '#000000',
    shadow: 12, shadowColor: 'rgba(0,0,0,0.55)', glow: 0, bg: '#000000', bgOpacity: 0, bgRadius: 24
  };
}

export function newStickerLayer(project: Project, kind: StickerLayer['kind'], content: string, start = 0, duration = 4): StickerLayer {
  const size = ASPECTS[project.aspect];
  return { ...baseLayer(kind === 'emoji' ? content : kind === 'shape' ? content : 'Sticker'), type: 'sticker', kind, content, size: 260, color: '#ff4d6d', x: size.w / 2, y: size.h / 2, start, duration };
}

export function newDrawLayer(project: Project, start = 0, duration = 4): DrawLayer {
  const size = ASPECTS[project.aspect];
  return { ...baseLayer('Drawing'), type: 'draw', strokes: [], x: size.w / 2, y: size.h / 2, start, duration };
}

export function newAudioLayer(asset: Asset, start: number, label: 'music' | 'voice'): AudioLayer {
  return { ...baseLayer(asset.name), type: 'audio', assetId: asset.id, label, start, duration: Math.max(0.1, asset.duration), trimIn: 0, volume: 1, fadeIn: 0, fadeOut: 0 };
}

export function newCaptionLayer(project: Project): CaptionLayer {
  const size = ASPECTS[project.aspect];
  return { ...baseLayer('Captions'), type: 'captions', cues: [], size: 64, color: '#ffffff', bg: '#000000', bgOpacity: 0.55, stroke: 0, bold: true, y01: 0.78, font: 'Plus Jakarta Sans', x: size.w / 2, y: size.h / 2, start: 0, duration: 3600 };
}

export const mainClips = (p: Project): MediaLayer[] =>
  (p.layers.filter((l) => l.type === 'media' && l.track === 'main') as MediaLayer[]).sort((a, b) => a.start - b.start);

/** The timeline's length: the end of the last thing that shows or plays (captions and blank space do not count). */
export function projectDuration(p: Project): number {
  if (p.mode === 'photo') return 0;
  let end = 0;
  for (const l of p.layers) {
    if (l.type === 'captions') continue;
    end = Math.max(end, l.start + l.duration);
  }
  return end;
}

/** Main-track clips follow each other from 0; a transition makes a clip start earlier, overlapping the one before it. */
export function normalizeMain(p: Project): Project {
  const clips = mainClips(p);
  if (clips.length === 0) return p;
  const starts = new Map<string, number>();
  let cursor = 0;
  clips.forEach((c, i) => {
    const t = i > 0 && c.transition.type !== 'cut' ? Math.min(c.transition.duration, c.duration * 0.9, clips[i - 1].duration * 0.9) : 0;
    const start = Math.max(0, cursor - t);
    starts.set(c.id, start);
    cursor = start + c.duration;
  });
  return { ...p, layers: p.layers.map((l) => (l.type === 'media' && l.track === 'main' ? { ...l, start: starts.get(l.id) ?? l.start } : l)) };
}

/** What a video clip's length on the timeline is, from its trim and speed. */
export const clipLength = (l: MediaLayer): number => Math.max(0.1, (l.trimOut - l.trimIn) / Math.max(0.05, l.speed));
