import { ASPECTS, Aspect, Asset, MediaLayer, Project, Layer, emptyProject, newMediaLayer, newStickerLayer, newTextLayer } from './types';

// Starting points: each one builds a real project (the same layers you can edit afterwards), using the pictures already imported where it has frames to fill.
export interface Template { id: string; name: string; hint: string; emoji: string; aspect: Aspect; mode: 'photo' | 'video'; needsImages: number; build: (images: Asset[]) => Project }

type Cell = [number, number, number, number];   // x, y, w, h as fractions of the canvas

export const COLLAGES: Array<{ id: string; name: string; cells: Cell[] }> = [
  { id: 'side', name: 'Side by side', cells: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] },
  { id: 'stack', name: 'Stacked', cells: [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]] },
  { id: 'grid4', name: 'Grid 2 × 2', cells: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
  { id: 'one-two', name: 'One and two', cells: [[0, 0, 1, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
  { id: 'strips3', name: 'Three strips', cells: [[0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]] },
  { id: 'hero3', name: 'Hero and three', cells: [[0, 0, 1, 0.6], [0, 0.6, 1 / 3, 0.4], [1 / 3, 0.6, 1 / 3, 0.4], [2 / 3, 0.6, 1 / 3, 0.4]] }
];

/** A picture that fills a rectangle of the canvas exactly: cropped to its shape (centre), no distortion. */
export function fillCell(base: MediaLayer, asset: Asset, project: Project, cell: Cell, gap: number, radius = 0): MediaLayer {
  const size = ASPECTS[project.aspect];
  const cx = cell[0] * size.w + gap, cy = cell[1] * size.h + gap;
  const cw = Math.max(10, cell[2] * size.w - gap * 2), ch = Math.max(10, cell[3] * size.h - gap * 2);
  const ra = asset.width / asset.height, rc = cw / ch;
  const crop = ra > rc ? { w: rc / ra, h: 1, x: (1 - rc / ra) / 2, y: 0 } : { w: 1, h: ra / rc, x: 0, y: (1 - ra / rc) / 2 };
  const scale = cw / (asset.width * crop.w);
  return { ...base, track: 'overlay', crop, scale, x: cx + cw / 2, y: cy + ch / 2, rotation: 0, radius, fit: 'cover', name: asset.name };
}

export function collage(project: Project, images: Asset[], layoutId: string, gap = 16, radius = 0): Project {
  const layout = COLLAGES.find((c) => c.id === layoutId) || COLLAGES[0];
  const keep: Layer[] = project.layers.filter((l) => !(l.type === 'media' && l.track === 'overlay' && l.name.startsWith('Collage')));
  if (images.length === 0) return project;
  const media = layout.cells.map((cell, i) => {
    const a = images[i % images.length];
    const l = fillCell(newMediaLayer(a, project, 'overlay'), a, project, cell, gap, radius);
    return { ...l, name: `Collage ${i + 1}` } as MediaLayer;
  });
  return { ...project, layers: [...keep, ...media] };
}

const mk = (aspect: Aspect, bg: string, mode: Project['mode'] = 'photo'): Project => ({ ...emptyProject(aspect), bgColor: bg, bgBlur: false, mode });

const put = (p: Project, l: Layer): Project => ({ ...p, layers: [...p.layers, l] });
const text = (p: Project, t: string, o: Partial<ReturnType<typeof newTextLayer>> = {}) => put(p, { ...newTextLayer(p, t), ...o });
const stick = (p: Project, e: string, o: Partial<ReturnType<typeof newStickerLayer>> = {}) => put(p, { ...newStickerLayer(p, 'emoji', e), ...o });
const cellsOf = (project: Project, images: Asset[], layout: string, gap = 12) => collage(project, images, layout, gap);

export const TEMPLATES: Template[] = [
  { id: 'blank-post', name: 'Blank post', hint: '4:5', emoji: '⬜', aspect: '4:5', mode: 'photo', needsImages: 0, build: () => mk('4:5', '#111111') },
  { id: 'blank-reel', name: 'Blank reel', hint: '9:16 video', emoji: '🎬', aspect: '9:16', mode: 'video', needsImages: 0, build: () => mk('9:16', '#000000', 'video') },
  {
    id: 'quote', name: 'Quote', hint: 'Big words on a colour', emoji: '💬', aspect: '4:5', mode: 'photo', needsImages: 0,
    build: () => { let p = mk('4:5', '#1d1b3a'); p = text(p, '“Your words\nfit here.”', { y: 640, size: 120, color: '#ffe38a', font: 'Serif', italic: true, bold: false, shadow: 0 }); p = text(p, '— someone wise', { y: 1010, size: 52, color: '#ffffff', bold: false, shadow: 0 }); return stick(p, '✨', { x: 920, y: 200, size: 200 }); }
  },
  {
    id: 'birthday', name: 'Birthday', hint: 'Cake and confetti', emoji: '🎂', aspect: '1:1', mode: 'photo', needsImages: 0,
    build: () => { let p = mk('1:1', '#ff4d6d'); p = text(p, 'Happy\nBirthday!', { y: 470, size: 170, color: '#ffffff', font: 'Pacifico', bold: false, stroke: 8, strokeColor: '#b3123a' }); p = stick(p, '🎂', { x: 540, y: 850, size: 300 }); p = stick(p, '🎉', { x: 150, y: 150, size: 200 }); p = stick(p, '🎈', { x: 930, y: 150, size: 200 }); return stick(p, '🎁', { x: 930, y: 880, size: 160 }); }
  },
  {
    id: 'announcement', name: 'Announcement', hint: 'Bold news', emoji: '📣', aspect: '1:1', mode: 'photo', needsImages: 0,
    build: () => { let p = mk('1:1', '#00c2a8'); p = text(p, 'BIG NEWS', { y: 400, size: 190, color: '#0b1b1a', letter: 6 }); p = text(p, 'Something new is coming', { y: 640, size: 70, color: '#0b1b1a', bold: false, shadow: 0, bg: '#ffffff', bgOpacity: 0.85, bgRadius: 40 }); return stick(p, '📣', { x: 540, y: 880, size: 220 }); }
  },
  {
    id: 'story-title', name: 'Story title', hint: 'Title over your photo', emoji: '📖', aspect: '9:16', mode: 'photo', needsImages: 1,
    build: (imgs) => { let p = mk('9:16', '#000000'); if (imgs[0]) { const l = newMediaLayer(imgs[0], p, 'main'); p = { ...p, layers: [{ ...l, fit: 'cover', scale: Math.max(1080 / imgs[0].width, 1920 / imgs[0].height) } as Layer] }; } p = text(p, 'My Day', { y: 330, size: 200, font: 'Pacifico', bold: false, stroke: 6, strokeColor: 'rgba(0,0,0,0.6)', animIn: 'pop' }); return p; }
  },
  {
    id: 'before-after', name: 'Before & after', hint: 'Two pictures side by side', emoji: '↔️', aspect: '1:1', mode: 'photo', needsImages: 2,
    build: (imgs) => { let p = mk('1:1', '#111111'); p = cellsOf(p, imgs.slice(0, 2), 'side', 8); p = text(p, 'BEFORE', { x: 270, y: 80, size: 54, bg: '#000000', bgOpacity: 0.6, letter: 4 }); return text(p, 'AFTER', { x: 810, y: 80, size: 54, bg: '#000000', bgOpacity: 0.6, letter: 4 }); }
  },
  { id: 'collage-4', name: 'Collage 2 × 2', hint: 'Four pictures', emoji: '🔲', aspect: '1:1', mode: 'photo', needsImages: 4, build: (imgs) => cellsOf(mk('1:1', '#ffffff'), imgs, 'grid4', 10) },
  { id: 'collage-hero', name: 'Collage: hero + 3', hint: 'One big, three small', emoji: '🖼️', aspect: '4:5', mode: 'photo', needsImages: 4, build: (imgs) => cellsOf(mk('4:5', '#111111'), imgs, 'hero3', 8) },
  {
    id: 'travel', name: 'Travel', hint: 'Postcard from…', emoji: '✈️', aspect: '9:16', mode: 'photo', needsImages: 1,
    build: (imgs) => { let p = mk('9:16', '#102a43'); if (imgs[0]) { const l = newMediaLayer(imgs[0], p, 'main'); p = { ...p, layers: [{ ...l, filter: 'warm', filterAmount: 80, fit: 'cover', scale: Math.max(1080 / imgs[0].width, 1920 / imgs[0].height) } as Layer] }; } p = text(p, 'Postcard from…', { y: 1500, size: 110, font: 'Caveat', bold: true, stroke: 5, strokeColor: 'rgba(0,0,0,0.5)' }); p = stick(p, '✈️', { x: 880, y: 300, size: 220 }); return stick(p, '🌴', { x: 200, y: 340, size: 220 }); }
  },
  {
    id: 'cinematic', name: 'Cinematic', hint: 'Wide bars and a grade', emoji: '🎞️', aspect: '16:9', mode: 'photo', needsImages: 1,
    build: (imgs) => { let p = mk('16:9', '#000000'); if (imgs[0]) { const l = newMediaLayer(imgs[0], p, 'main'); p = { ...p, layers: [{ ...l, filter: 'cinematic', filterAmount: 100, fit: 'cover', scale: Math.max(1920 / imgs[0].width, 1080 / imgs[0].height) } as Layer] }; } p = put(p, { ...newStickerLayer(p, 'shape', 'square'), x: 960, y: 70, size: 1, scale: 1, color: '#000000' }); return p; }
  },
  {
    id: 'minimal', name: 'Minimal', hint: 'A picture and one line', emoji: '◻️', aspect: '4:5', mode: 'photo', needsImages: 1,
    build: (imgs) => { let p = mk('4:5', '#f5f5f4'); if (imgs[0]) { const l = fillCell(newMediaLayer(imgs[0], p, 'main'), imgs[0], p, [0.08, 0.06, 0.84, 0.76], 0, 0); p = { ...p, layers: [{ ...l, track: 'main', radius: 24 } as Layer] }; } return text(p, 'a quiet moment', { y: 1210, size: 64, color: '#1c1917', font: 'Serif', italic: true, bold: false, shadow: 0 }); }
  },
  {
    id: 'music-edit', name: 'Music edit', hint: 'Video with a beat', emoji: '🎵', aspect: '9:16', mode: 'video', needsImages: 0,
    build: () => { let p = mk('9:16', '#0a0a14', 'video'); p = text(p, 'NOW PLAYING', { y: 300, size: 90, color: '#7ef9ff', letter: 8, animIn: 'typewriter', start: 0.3, duration: 5 }); p = stick(p, '🎧', { x: 540, y: 900, size: 400, animIn: 'bounce', duration: 6 }); return stick(p, '🎶', { x: 880, y: 1450, size: 200, animIn: 'pop', start: 1, duration: 5 }); }
  }
];

export function applyTemplate(t: Template, images: Asset[]): Project {
  return { ...t.build(images), name: t.name };
}
