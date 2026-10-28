import React, { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { ArrowLeft, BringToFront, Camera, CameraOff, Check, Copy, FlipHorizontal2, Frame as FrameIcon, Image as ImageIcon, Loader2, Search, Shuffle, Sparkles, SwitchCamera, Trash2, Undo2, Users, X } from 'lucide-react';
import { BUDDIES, FEATURED, FIELDS, PACKS, buddiesIn, searchBuddies, stickerById, stickersIn } from '../../booth/catalog';
import type { FieldId, PackId } from '../../booth/kit';
import { FRAMES, frameById, windowOf } from '../../booth/frames';
import type { FrameId, Logo } from '../../booth/frames';
import { MAX_BUDDIES, MAX_STICKERS, SHAPES, START_SIZE, addPlaced, guideSpot, isBuddy, reflow, renderScene, shapeById, sizeLimits, startSpot, toFront } from '../../booth/scene';
import type { Placed, Pt, Scene, ShapeId } from '../../booth/scene';
import { dragHandle, moved, panned, pickHandle, pickTop, pinched, zoomed } from '../../booth/gestures';
import { cameraProblem, cameraSupported, countCameras, keepAwake, openStream, stopStream } from '../../booth/camera';
import type { CamState, Facing } from '../../booth/camera';
import { loadLogo, loadPhoto, snapshot } from '../../booth/media';
import { Thumb } from './Thumb';
import { ResultSheet } from './ResultSheet';
import type { BoothTarget } from './BoothHost';
import './booth.css';

type Panel = null | 'buddies' | 'filters' | 'frame';
type FilterTab = 'featured' | 'recent' | PackId;

const PREFS_SLOT = 'noob_booth_prefs_v1';
const RECENT_SLOT = 'noob_stickers_recent_v1';
const TIP_SLOT = 'noob_booth_tip_v1';

interface Prefs { shape: ShapeId; frame: FrameId }
function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_SLOT) || '{}') as Partial<Prefs>;
    return { shape: shapeById(p.shape || '').id, frame: frameById(p.frame || '').id };
  } catch { return { shape: '4:5', frame: 'pearl' }; }
}
function savePrefs(p: Prefs): void { try { localStorage.setItem(PREFS_SLOT, JSON.stringify(p)); } catch { /* the choice is simply not remembered */ } }
function loadRecent(): string[] {
  try { const l = JSON.parse(localStorage.getItem(RECENT_SLOT) || '[]') as unknown; return Array.isArray(l) ? l.filter((id): id is string => typeof id === 'string' && !!stickerById(id) && !isBuddy(id)).slice(0, 16) : []; } catch { return []; }
}
function saveRecent(l: string[]): void { try { localStorage.setItem(RECENT_SLOT, JSON.stringify(l)); } catch { /* not remembered */ } }

const emptyScene = (p: Prefs): Scene => ({ shape: p.shape, frame: p.frame, photo: null, zoom: 1, panX: 0, panY: 0, stickers: [], mirror: false, tag: true });

type Gesture =
  | { kind: 'none' }
  | { kind: 'drag'; uid: number; p0: Placed; start: Pt; moved: boolean; before: Placed[] }
  | { kind: 'handle'; uid: number; p0: Placed; start: Pt; before: Placed[] }
  | { kind: 'pinch'; uid: number; p0: Placed; ids: [number, number]; a0: Pt; b0: Pt; before: Placed[] }
  | { kind: 'zoom'; ids: [number, number]; z0: number; d0: number }
  | { kind: 'pan'; start: Pt; pan0: Pt };

const CAM_TEXT: Record<Exclude<CamState, 'idle' | 'starting' | 'live'>, { title: string; body: string }> = {
  denied: { title: 'The camera is blocked', body: 'Allow the camera for this site in your browser settings and try again, or pick a photo instead.' },
  nocam: { title: 'No camera found', body: 'You can still pick a photo from your gallery.' },
  insecure: { title: 'The camera is not available here', body: 'Use the camera app of your phone, or pick a photo from your gallery.' },
  failed: { title: 'The camera could not start', body: 'Try again, or pick a photo instead.' }
};

const BuddyBooth: React.FC<{ onClose: () => void; onUse: (file: File, target: BoothTarget) => void }> = ({ onClose, onUse }) => {
  const prefs = useRef<Prefs>(loadPrefs());
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [screen, setScreen] = useState<'pick' | 'stage'>('pick');
  const [mode, setMode] = useState<'camera' | 'edit'>('camera');
  const [source, setSource] = useState<'camera' | 'gallery'>('camera');
  const [panel, setPanel] = useState<Panel>(null);
  const [selected, setSelectedState] = useState<number | null>(null);
  const [facing, setFacing] = useState<Facing>('environment');
  const [cam, setCam] = useState<CamState>('idle');
  const [cameras, setCameras] = useState(1);
  const [tries, setTries] = useState(0);
  const [toast, setToast] = useState('');
  const [flash, setFlash] = useState(false);
  const [fit, setFit] = useState({ w: 300, h: 375 });
  const [result, setResult] = useState<Scene | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [field, setField] = useState<FieldId | 'all'>('all');
  const [tab, setTab] = useState<FilterTab>('featured');
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [guideOn, setGuideOn] = useState(true);
  const [tip, setTip] = useState('');

  const sceneRef = useRef<Scene>(emptyScene(prefs.current));
  const selectedRef = useRef<number | null>(null);
  const undoRef = useRef<Placed[][]>([]);
  const uidRef = useRef(1);
  const modeRef = useRef(mode); modeRef.current = mode;
  const guideRef = useRef(guideOn); guideRef.current = guideOn;
  const pausedRef = useRef(false); pausedRef.current = !!result;
  const logoRef = useRef<Logo | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const appRef = useRef<HTMLInputElement>(null);
  const ptrs = useRef(new Map<number, Pt>());
  const gest = useRef<Gesture>({ kind: 'none' });

  const sc = sceneRef.current;
  const shape = shapeById(sc.shape);
  const buddies = sc.stickers.filter((p) => isBuddy(p.id));
  const sel = selected == null ? null : sc.stickers.find((p) => p.uid === selected) || null;
  const selDef = sel ? stickerById(sel.id) : undefined;

  const say = useCallback((m: string) => setToast(m), []);
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(''), 2600); return () => window.clearTimeout(id); }, [toast]);
  const setSelected = useCallback((uid: number | null) => { selectedRef.current = uid; setSelectedState(uid); }, []);
  const setScene = useCallback((next: Scene) => { sceneRef.current = next; bump(); }, []);
  const pushUndo = useCallback((before: ReadonlyArray<Placed>) => { undoRef.current = [...undoRef.current.slice(-29), [...before]]; }, []);
  const changeList = useCallback((list: Placed[]) => { pushUndo(sceneRef.current.stickers); setScene({ ...sceneRef.current, stickers: list }); }, [pushUndo, setScene]);

  // ---- the logo, the page's own scroll, the first tip
  useEffect(() => { void loadLogo().then((l) => { logoRef.current = l; }); }, []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ---- the camera (only while someone is looking through it)
  useEffect(() => {
    if (screen !== 'stage' || mode !== 'camera') return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    setCam('starting');
    (async () => {
      if (!cameraSupported()) { setCam('insecure'); return; }
      try {
        stream = await openStream(facing);
        const v = videoRef.current;
        if (cancelled || !v) { stopStream(stream); return; }
        v.srcObject = stream;
        try { await v.play(); } catch { /* it starts with the next picture */ }
        if (cancelled) return;
        setCam('live');
        void countCameras().then((n) => { if (!cancelled) setCameras(n); });
      } catch (e) {
        if (!cancelled) setCam(cameraProblem(e));
      }
    })();
    return () => { cancelled = true; stopStream(stream); const v = videoRef.current; if (v) v.srcObject = null; };
  }, [screen, mode, facing, tries]);
  useEffect(() => { if (screen === 'stage' && mode === 'camera') { sceneRef.current = { ...sceneRef.current, mirror: facing === 'user' }; } }, [screen, mode, facing]);
  useEffect(() => { if (screen !== 'stage') return; return keepAwake(); }, [screen]);
  useEffect(() => {
    const again = (): void => { if (document.visibilityState === 'visible' && screen === 'stage' && modeRef.current === 'camera') setTries((n) => n + 1); };
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, [screen]);

  // ---- a tip, once (the first time the camera opens)
  useEffect(() => {
    if (screen !== 'stage' || mode !== 'camera' || cam !== 'live') return;
    let seen = false;
    try { seen = sessionStorage.getItem(TIP_SLOT) === '1'; sessionStorage.setItem(TIP_SLOT, '1'); } catch { /* the tip may show again */ }
    if (seen) return;
    setTip('Ask a friend to stand in the box. For a selfie, switch the camera.');
    const id = window.setTimeout(() => setTip(''), 5200);
    return () => window.clearTimeout(id);
  }, [screen, mode, cam]);

  // ---- drawing: once for every picture the screen shows (the photo, or the camera, with the buddies and stickers on it)
  useEffect(() => {
    let raf = 0, last = -1000;
    const tick = (ms: number): void => {
      raf = requestAnimationFrame(tick);
      if (pausedRef.current || document.hidden || ms - last < 28) return;   // 30 pictures a second are enough (the camera and the saved video do not give more) and spare the battery
      last = ms;
      const cv = canvasRef.current;
      const c = cv?.getContext('2d');
      if (!cv || !c) return;
      const s = sceneRef.current;
      let photo = s.photo;
      if (modeRef.current === 'camera') { const v = videoRef.current; photo = v && v.readyState >= 2 && v.videoWidth ? { img: v, w: v.videoWidth, h: v.videoHeight } : null; }
      const view: Scene = photo === s.photo ? s : { ...s, photo };
      const guide = modeRef.current === 'camera' && guideRef.current ? guideSpot(s.stickers, s.shape, s.frame) : null;
      renderScene(c, view, cv.width, cv.height, { t: ms / 1000, logo: logoRef.current, selected: selectedRef.current, guides: true, guide, unit: cv.width / Math.max(1, cv.clientWidth) });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- the picture is as big as the room allows, in its own shape
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = (): void => {
      const bw = el.clientWidth - 24, bh = el.clientHeight - 8;
      if (bw < 40 || bh < 40) return;
      const w = Math.min(bw, (bh * shape.w) / shape.h);
      setFit({ w: Math.round(w), h: Math.round((w * shape.h) / shape.w) });
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, [screen, shape.w, shape.h, panel]);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = Math.max(240, Math.min(mode === 'camera' ? 900 : 1080, Math.round(fit.w * dpr))), ch = Math.round((cw * shape.h) / shape.w);
  useLayoutEffect(() => {
    const cv = canvasRef.current;
    if (cv && (cv.width !== cw || cv.height !== ch)) { cv.width = cw; cv.height = ch; }
  }, [cw, ch, screen]);

  // ---- adding, removing and changing what stands on the picture
  const nextUid = (): number => uidRef.current++;
  const addBuddy = useCallback((id: string) => {
    const cur = sceneRef.current;
    const count = cur.stickers.filter((p) => isBuddy(p.id)).length;
    if (count >= MAX_BUDDIES) { say(`${MAX_BUDDIES} buddies is the most for one picture`); return; }
    const side: -1 | 1 = count % 2 === 0 ? -1 : 1;
    const spot = startSpot(id, cur.shape, cur.frame, side);
    const p: Placed = { uid: nextUid(), id, x: spot.x, y: spot.y, s: spot.s * (count > 1 ? 0.88 : 1), r: 0, flip: side === 1 };
    pushUndo(cur.stickers);
    setScene({ ...cur, stickers: addPlaced(cur.stickers, p) });
    setSelected(p.uid);
  }, [pushUndo, say, setScene, setSelected]);

  const addSticker = useCallback((id: string) => {
    const cur = sceneRef.current;
    if (cur.stickers.filter((p) => !isBuddy(p.id)).length >= MAX_STICKERS) { say(`${MAX_STICKERS} stickers is the most for one picture`); return; }
    const win = windowOf(frameById(cur.frame), shapeById(cur.shape).w, shapeById(cur.shape).h), sh = shapeById(cur.shape);
    const n = cur.stickers.length;
    const p: Placed = { uid: nextUid(), id, x: (win.x + win.w * (0.5 + ((n % 5) - 2) * 0.05)) / sh.w, y: (win.y + win.h * (0.38 + ((n % 4) - 1.5) * 0.04)) / sh.h, s: START_SIZE, r: ((n % 3) - 1) * 0.06, flip: false };
    pushUndo(cur.stickers);
    setScene({ ...cur, stickers: addPlaced(cur.stickers, p) });
    setSelected(p.uid);
    setRecent((old) => { const next = [id, ...old.filter((x) => x !== id)].slice(0, 16); saveRecent(next); return next; });
  }, [pushUndo, say, setScene, setSelected]);

  const removeSelected = useCallback(() => {
    const cur = sceneRef.current, uid = selectedRef.current;
    if (uid == null) return;
    changeList(cur.stickers.filter((p) => p.uid !== uid));
    setSelected(null);
  }, [changeList, setSelected]);

  const editSelected = useCallback((fn: (p: Placed, list: ReadonlyArray<Placed>) => Placed[]) => {
    const cur = sceneRef.current, p = cur.stickers.find((q) => q.uid === selectedRef.current);
    if (p) changeList(fn(p, cur.stickers));
  }, [changeList]);
  const flipSelected = (): void => editSelected((p, l) => l.map((q) => (q.uid === p.uid ? { ...q, flip: !q.flip } : q)));
  const frontSelected = (): void => editSelected((p, l) => toFront(l, p.uid));
  const copySelected = (): void => {
    const cur = sceneRef.current, p = cur.stickers.find((q) => q.uid === selectedRef.current);
    if (!p) return;
    if (isBuddy(p.id)) { addBuddy(p.id); return; }
    if (cur.stickers.filter((q) => !isBuddy(q.id)).length >= MAX_STICKERS) { say(`${MAX_STICKERS} stickers is the most for one picture`); return; }
    const q: Placed = { ...p, uid: nextUid(), x: Math.min(0.95, p.x + 0.06), y: Math.min(0.95, p.y + 0.04) };
    changeList(addPlaced(cur.stickers, q));
    setSelected(q.uid);
  };
  const undo = (): void => {
    const last = undoRef.current[undoRef.current.length - 1];
    if (!last) return;
    undoRef.current = undoRef.current.slice(0, -1);
    setScene({ ...sceneRef.current, stickers: last });
    if (selectedRef.current != null && !last.some((p) => p.uid === selectedRef.current)) setSelected(null);
  };

  const setShape = (id: ShapeId): void => {
    const cur = sceneRef.current;
    if (cur.shape === id) return;
    setScene({ ...cur, shape: id, stickers: reflow(cur.stickers, cur, { shape: id, frame: cur.frame }) });
    prefs.current = { ...prefs.current, shape: id }; savePrefs(prefs.current);
  };
  const setFrame = (id: FrameId): void => {
    const cur = sceneRef.current;
    if (cur.frame === id) return;
    setScene({ ...cur, frame: id, stickers: reflow(cur.stickers, cur, { shape: cur.shape, frame: id }) });
    prefs.current = { ...prefs.current, frame: id }; savePrefs(prefs.current);
  };

  // ---- the first screen: pick a buddy
  const startWith = (id: string): void => {
    sceneRef.current = emptyScene(prefs.current);
    undoRef.current = [];
    setSelected(null);
    setSource('camera'); setMode('camera'); setPanel(null); setScreen('stage'); setCam('starting');
    addBuddy(id);
    setSelected(null);
  };
  const randomBuddy = (): void => { const b = BUDDIES[Math.floor(Math.random() * BUDDIES.length)]; if (b) startWith(b.id); };

  const onPhotoPicked = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setLoading(true);
    try {
      const photo = await loadPhoto(file);
      const cur = screen === 'pick' ? emptyScene(prefs.current) : sceneRef.current;
      if (screen === 'pick') { undoRef.current = []; }
      sceneRef.current = { ...cur, photo, mirror: false, zoom: 1, panX: 0, panY: 0 };
      setSelected(null);
      setSource('gallery'); setMode('edit'); setScreen('stage');
      setPanel(cur.stickers.some((p) => isBuddy(p.id)) ? 'filters' : 'buddies');
      bump();
    } catch (e) {
      say((e as Error)?.message || 'That picture could not be opened.');
    } finally {
      setLoading(false);
    }
  };

  // ---- the camera: take the picture, or go back to the camera
  const shutter = (): void => {
    const v = videoRef.current, shot = v ? snapshot(v) : null;
    if (!shot) { say('The camera is not ready yet. Try again in a second.'); return; }
    setFlash(true); window.setTimeout(() => setFlash(false), 240);
    try { navigator.vibrate?.(12); } catch { /* no buzz */ }
    sceneRef.current = { ...sceneRef.current, photo: shot, mirror: facing === 'user' };
    setSelected(null); setMode('edit'); setPanel('filters'); bump();
  };
  const retake = (): void => {
    sceneRef.current = { ...sceneRef.current, photo: null, zoom: 1, panX: 0, panY: 0 };
    setSelected(null); setSource('camera'); setMode('camera'); setPanel(null); bump();
  };
  const toPick = (): void => {
    sceneRef.current = emptyScene(prefs.current);
    undoRef.current = [];
    setSelected(null); setPanel(null); setScreen('pick'); setMode('camera'); setCam('idle'); bump();
  };
  const back = (): void => {
    if (screen === 'pick') { onClose(); return; }
    if (mode === 'edit' && source === 'camera') { retake(); return; }
    toPick();
  };
  const done = (): void => { if (sceneRef.current.photo) { setSelected(null); setResult({ ...sceneRef.current }); } };
  const use = (file: File, target: BoothTarget): void => { onUse(file, target); };

  // ---- fingers and the mouse on the picture
  const toCanvas = (e: { clientX: number; clientY: number }): Pt => {
    const cv = canvasRef.current as HTMLCanvasElement, r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * cv.width) / r.width, y: ((e.clientY - r.top) * cv.height) / r.height };
  };
  const placedOf = (uid: number): Placed | undefined => sceneRef.current.stickers.find((p) => p.uid === uid);
  const put = (uid: number, next: Placed): void => { sceneRef.current = { ...sceneRef.current, stickers: sceneRef.current.stickers.map((p) => (p.uid === uid ? next : p)) }; };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const cv = e.currentTarget;
    if (cv.width < 1) return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch { /* the pointer is followed anyway */ }
    const pt = toCanvas(e), W = cv.width, H = cv.height, s = sceneRef.current;
    ptrs.current.set(e.pointerId, pt);
    if (ptrs.current.size === 1) {
      const cur = selectedRef.current == null ? undefined : placedOf(selectedRef.current);
      if (cur) {
        const hit = pickHandle(cur, pt.x, pt.y, W, H, e.pointerType === 'touch', W / Math.max(1, cv.clientWidth));
        if (hit === 'del') { removeSelected(); ptrs.current.clear(); gest.current = { kind: 'none' }; return; }
        if (hit === 'turn') { gest.current = { kind: 'handle', uid: cur.uid, p0: cur, start: pt, before: [...s.stickers] }; return; }
      }
      const uid = pickTop(s.stickers, pt.x, pt.y, W, H);
      if (uid != null) {
        setSelected(uid);
        gest.current = { kind: 'drag', uid, p0: placedOf(uid) as Placed, start: pt, moved: false, before: [...s.stickers] };
      } else {
        setSelected(null);
        gest.current = { kind: 'pan', start: pt, pan0: { x: s.panX, y: s.panY } };
      }
    } else if (ptrs.current.size === 2) {
      const ids = [...ptrs.current.keys()].slice(0, 2) as [number, number], a = ptrs.current.get(ids[0]) as Pt, b = ptrs.current.get(ids[1]) as Pt, g = gest.current;
      const uid = g.kind === 'drag' || g.kind === 'handle' || g.kind === 'pinch' ? g.uid : selectedRef.current;
      const p = uid == null ? undefined : placedOf(uid);
      if (p) gest.current = { kind: 'pinch', uid: p.uid, p0: p, ids, a0: a, b0: b, before: g.kind === 'drag' || g.kind === 'handle' || g.kind === 'pinch' ? g.before : [...s.stickers] };
      else gest.current = { kind: 'zoom', ids, z0: s.zoom, d0: Math.hypot(b.x - a.x, b.y - a.y) || 1 };
    }
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!ptrs.current.has(e.pointerId)) return;
    const cv = e.currentTarget, W = cv.width, H = cv.height, pt = toCanvas(e), g = gest.current;
    ptrs.current.set(e.pointerId, pt);
    if (g.kind === 'drag') {
      const dx = pt.x - g.start.x, dy = pt.y - g.start.y;
      if (!g.moved && Math.hypot(dx, dy) < 4) return;
      g.moved = true;
      put(g.uid, moved(g.p0, dx, dy, W, H));
    } else if (g.kind === 'handle') {
      const r = dragHandle(g.p0, g.start, pt, W, H);
      put(g.uid, { ...g.p0, s: r.s, r: r.r });
    } else if (g.kind === 'pinch') {
      const a = ptrs.current.get(g.ids[0]), b = ptrs.current.get(g.ids[1]);
      if (a && b) put(g.uid, pinched(g.p0, g.a0, g.b0, a, b, W, H));
    } else if (g.kind === 'zoom') {
      const a = ptrs.current.get(g.ids[0]), b = ptrs.current.get(g.ids[1]), s = sceneRef.current;
      if (a && b && (s.photo || modeRef.current === 'camera')) sceneRef.current = { ...s, zoom: zoomed(g.z0, (Math.hypot(b.x - a.x, b.y - a.y) || 1) / g.d0) };
    } else if (g.kind === 'pan') {
      const s = sceneRef.current;
      if (modeRef.current !== 'edit' || !s.photo) return;
      const win = windowOf(frameById(s.frame), W, H), p = panned(s.photo, win, s.zoom, g.pan0.x, g.pan0.y, pt.x - g.start.x, pt.y - g.start.y);
      sceneRef.current = { ...s, panX: p.panX, panY: p.panY };
    }
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.delete(e.pointerId);
    const g = gest.current;
    const changed = (before: Placed[]): boolean => before.length !== sceneRef.current.stickers.length || before.some((p, i) => p !== sceneRef.current.stickers[i]);
    if (ptrs.current.size === 0) {
      if ((g.kind === 'drag' && g.moved) || g.kind === 'handle' || g.kind === 'pinch') { if (changed(g.before)) pushUndo(g.before); }
      gest.current = { kind: 'none' };
      bump();
    } else if (ptrs.current.size === 1 && (g.kind === 'pinch' || g.kind === 'zoom')) {
      // one finger stays: carry on as a drag (or a pan)
      const pt = [...ptrs.current.values()][0], s = sceneRef.current;
      if (g.kind === 'pinch') {
        if (changed(g.before)) pushUndo(g.before);
        const p = placedOf(g.uid);
        gest.current = p ? { kind: 'drag', uid: p.uid, p0: p, start: pt, moved: false, before: [...s.stickers] } : { kind: 'none' };
      } else gest.current = { kind: 'pan', start: pt, pan0: { x: s.panX, y: s.panY } };
    }
  };

  // the wheel: zoom the photo, or resize the picked one
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const k = Math.exp(-e.deltaY * 0.0015), s = sceneRef.current, uid = selectedRef.current, p = uid == null ? undefined : s.stickers.find((q) => q.uid === uid);
      if (p) { const lim = sizeLimits(p.id); sceneRef.current = { ...s, stickers: s.stickers.map((q) => (q.uid === p.uid ? { ...q, s: Math.min(lim.max, Math.max(lim.min, q.s * k)) } : q)) }; }
      else if (s.photo || modeRef.current === 'camera') sceneRef.current = { ...s, zoom: zoomed(s.zoom, k) };
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
  }, [screen]);

  // the keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (result) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) { if (e.key === 'Escape') (t as HTMLInputElement).blur(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRef.current != null) { e.preventDefault(); removeSelected(); }
      else if (e.key === 'Escape') {
        e.preventDefault();
        if (panel) setPanel(null); else if (selectedRef.current != null) setSelected(null); else back();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---- what is shown
  const visibleBuddies = query.trim() ? searchBuddies(query) : field === 'all' ? [...BUDDIES] : buddiesIn(field);
  const picked = buddies[0] ? stickerById(buddies[0].id) : undefined;
  const filterList = tab === 'featured' ? FEATURED.map((id) => stickerById(id)).filter((d): d is NonNullable<typeof d> => !!d)
    : tab === 'recent' ? recent.map((id) => stickerById(id)).filter((d): d is NonNullable<typeof d> => !!d)
      : stickersIn(tab);
  const togglePanel = (p: Exclude<Panel, null>): void => setPanel((cur) => (cur === p ? null : p));
  const camProblem = cam === 'denied' || cam === 'nocam' || cam === 'insecure' || cam === 'failed' ? CAM_TEXT[cam] : null;

  const photoInput = (
    <>
      <input ref={fileRef} type="file" accept="image/*" hidden data-testid="booth-file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void onPhotoPicked(f); }} />
      <input ref={appRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void onPhotoPicked(f); }} />
    </>
  );

  // ================================================================== the first screen
  if (screen === 'pick') {
    const suggestions = BUDDIES.slice(0, 5);
    return (
      <div className="bb-root force-dark" role="dialog" aria-modal="true" aria-label="Buddy Booth" data-testid="booth-root">
        <div className="bb-top">
          <button type="button" className="bb-icon-btn" onClick={onClose} aria-label="Close" data-testid="booth-close"><X size={22} /></button>
          <div className="bb-title"><span className="bb-logo" aria-hidden="true">N</span> Buddy Booth</div>
          <span className="bb-icon-btn ghost" aria-hidden="true" />
        </div>
        <div className="bb-pick">
          <h2 className="bb-h">Pick a buddy to take a photo with</h2>
          <label className="bb-search">
            <Search size={16} aria-hidden="true" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a buddy or a field" aria-label="Search a buddy" data-testid="booth-search" />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear"><X size={14} /></button>}
          </label>
          {!query && (
            <>
              <div className="bb-label">Suggestions</div>
              <div className="bb-sugg">
                <button type="button" className="bb-dice" onClick={randomBuddy} aria-label="A surprise buddy"><Shuffle size={22} /><span>Surprise</span></button>
                {suggestions.map((b) => (
                  <button type="button" key={b.id} className="bb-circle" onClick={() => startWith(b.id)} aria-label={b.name} style={{ ['--ac' as string]: b.buddy?.accent }}><Thumb id={b.id} size={50} /><span>{b.name}</span></button>
                ))}
              </div>
              <div className="bb-chips" role="tablist" aria-label="Fields">
                <button type="button" role="tab" aria-selected={field === 'all'} className={field === 'all' ? 'on' : ''} onClick={() => setField('all')}>All</button>
                {FIELDS.map((f) => <button type="button" role="tab" aria-selected={field === f.id} key={f.id} className={field === f.id ? 'on' : ''} onClick={() => setField(f.id)} style={{ ['--ac' as string]: f.accent }}>{f.name}</button>)}
              </div>
            </>
          )}
          <div className="bb-grid" data-testid="booth-grid">
            {visibleBuddies.map((b) => (
              <button type="button" key={b.id} className="bb-card" onClick={() => startWith(b.id)} data-testid={`booth-buddy-${b.id}`} style={{ ['--ac' as string]: b.buddy?.accent }}>
                <Thumb id={b.id} size={92} />
                <b>{b.name}</b>
                <small>{b.buddy?.tagline}</small>
              </button>
            ))}
            {!visibleBuddies.length && <p className="bb-empty">No buddy has that name yet. Try “cat”, “anime” or “dragon”.</p>}
          </div>
        </div>
        <div className="bb-foot">
          <button type="button" className="bb-wide" onClick={() => fileRef.current?.click()} disabled={loading} data-testid="booth-gallery">{loading ? <Loader2 className="bb-spin" size={18} /> : <ImageIcon size={18} />} Use a photo from my gallery</button>
        </div>
        {toast && <div className="bb-toast" role="status">{toast}</div>}
        {photoInput}
      </div>
    );
  }

  // ================================================================== the camera and the editor
  const inCamera = mode === 'camera';
  return (
    <div className="bb-root force-dark" role="dialog" aria-modal="true" aria-label="Buddy Booth" data-testid="booth-root">
      <div className="bb-top">
        <button type="button" className="bb-icon-btn" onClick={back} aria-label={inCamera ? 'Back to the buddies' : source === 'camera' ? 'Retake' : 'Back'} data-testid="booth-back"><ArrowLeft size={22} /></button>
        <div className="bb-title">{picked ? <>with <b>{picked.name}{buddies.length > 1 ? ` +${buddies.length - 1}` : ''}</b></> : 'Buddy Booth'}</div>
        {inCamera ? (
          cameras > 1 ? <button type="button" className="bb-icon-btn" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} aria-label="Switch the camera" data-testid="booth-switch"><SwitchCamera size={22} /></button> : <span className="bb-icon-btn ghost" aria-hidden="true" />
        ) : (
          <div className="bb-top-r">
            <button type="button" className="bb-icon-btn" onClick={undo} disabled={!undoRef.current.length} aria-label="Undo" data-testid="booth-undo"><Undo2 size={20} /></button>
            <button type="button" className="bb-done" onClick={done} data-testid="booth-done"><Check size={16} /> Done</button>
          </div>
        )}
      </div>

      <div className="bb-stage" ref={stageRef}>
        <div className="bb-wrap" style={{ width: fit.w, height: fit.h }}>
          <canvas ref={canvasRef} className="bb-canvas" width={cw} height={ch} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} data-testid="booth-canvas" aria-label="Your picture: drag a buddy or a sticker to move it" />
          {flash && <div className="bb-flash" />}
          {inCamera && cam === 'starting' && <div className="bb-cover"><Loader2 className="bb-spin" size={26} /><p>Starting the camera…</p></div>}
          {inCamera && camProblem && (
            <div className="bb-cover" data-testid="booth-cam-problem">
              <CameraOff size={30} />
              <h3>{camProblem.title}</h3>
              <p>{camProblem.body}</p>
              <div className="bb-cover-btns">
                {cam !== 'insecure' && <button type="button" className="bb-pill" onClick={() => setTries((n) => n + 1)}>Try again</button>}
                <button type="button" className="bb-pill" onClick={() => appRef.current?.click()}>Use the camera app</button>
                <button type="button" className="bb-pill" onClick={() => fileRef.current?.click()}>Choose a photo</button>
              </div>
            </div>
          )}
          {sel && selDef && (
            <div className="bb-sel" role="toolbar" aria-label="The picked one">
              {!selDef.text && <button type="button" onClick={flipSelected} aria-label="Flip"><FlipHorizontal2 size={17} /><span>Flip</span></button>}
              <button type="button" onClick={copySelected} aria-label="Copy"><Copy size={17} /><span>Copy</span></button>
              <button type="button" onClick={frontSelected} aria-label="Bring to front"><BringToFront size={17} /><span>Front</span></button>
              <button type="button" className="del" onClick={removeSelected} aria-label="Delete" data-testid="booth-delete"><Trash2 size={17} /><span>Delete</span></button>
            </div>
          )}
        </div>
        {(tip || toast) && <div className="bb-toast" role="status">{toast || tip}</div>}
        <video ref={videoRef} className="bb-video" playsInline muted autoPlay />
      </div>

      {panel === 'buddies' && (
        <div className="bb-tray" data-testid="booth-tray-buddies">
          <div className="bb-chips">
            <button type="button" className={field === 'all' ? 'on' : ''} onClick={() => setField('all')}>All</button>
            {FIELDS.map((f) => <button type="button" key={f.id} className={field === f.id ? 'on' : ''} onClick={() => setField(f.id)} style={{ ['--ac' as string]: f.accent }}>{f.name}</button>)}
          </div>
          <div className="bb-row">
            {(field === 'all' ? [...BUDDIES] : buddiesIn(field)).map((b) => (
              <button type="button" key={b.id} className="bb-mini" onClick={() => addBuddy(b.id)} aria-label={`Add ${b.name}`} data-testid={`booth-add-${b.id}`} style={{ ['--ac' as string]: b.buddy?.accent }}><Thumb id={b.id} size={64} /><span>{b.name}</span></button>
            ))}
          </div>
        </div>
      )}
      {panel === 'filters' && (
        <div className="bb-tray" data-testid="booth-tray-filters">
          <div className="bb-chips">
            <button type="button" className={tab === 'featured' ? 'on' : ''} onClick={() => setTab('featured')}>Featured</button>
            {recent.length > 0 && <button type="button" className={tab === 'recent' ? 'on' : ''} onClick={() => setTab('recent')}>Recent</button>}
            {PACKS.map((p) => <button type="button" key={p.id} className={tab === p.id ? 'on' : ''} onClick={() => setTab(p.id)} style={{ ['--ac' as string]: p.accent }}>{p.name}</button>)}
          </div>
          <div className="bb-row">
            {filterList.map((d) => (
              <button type="button" key={d.id} className="bb-mini sticker" onClick={() => addSticker(d.id)} aria-label={`Add ${d.name}`} data-testid={`booth-sticker-${d.id}`}><Thumb id={d.id} size={64} /></button>
            ))}
          </div>
        </div>
      )}
      {panel === 'frame' && (
        <div className="bb-tray" data-testid="booth-tray-frame">
          <div className="bb-chips" role="radiogroup" aria-label="Shape">
            {SHAPES.map((s) => <button type="button" role="radio" aria-checked={sc.shape === s.id} key={s.id} className={sc.shape === s.id ? 'on' : ''} onClick={() => setShape(s.id)} data-testid={`booth-shape-${s.id}`}>{s.label} <small>{s.note}</small></button>)}
          </div>
          <div className="bb-row frames" role="radiogroup" aria-label="Frame">
            {FRAMES.map((f) => (
              <button type="button" role="radio" aria-checked={sc.frame === f.id} key={f.id} className={`bb-frame${sc.frame === f.id ? ' on' : ''}`} onClick={() => setFrame(f.id)} aria-label={f.name} data-testid={`booth-frame-${f.id}`}>
                <i style={{ background: `linear-gradient(135deg, ${f.swatch[0]}, ${f.swatch[1]} 55%, ${f.swatch[2]})` }} /><span>{f.name}</span>
              </button>
            ))}
          </div>
          <div className="bb-toggles">
            <label><input type="checkbox" checked={sc.tag !== false} onChange={(e) => setScene({ ...sceneRef.current, tag: e.target.checked })} /> Name tag</label>
            {inCamera && <label><input type="checkbox" checked={guideOn} onChange={(e) => setGuideOn(e.target.checked)} /> “Stand here” box</label>}
          </div>
        </div>
      )}

      <div className="bb-dock">
        <button type="button" className={`bb-dk${panel === 'buddies' ? ' on' : ''}`} onClick={() => togglePanel('buddies')} data-testid="booth-tab-buddies"><Users size={22} /><span>Buddies</span></button>
        <button type="button" className={`bb-dk${panel === 'filters' ? ' on' : ''}`} onClick={() => togglePanel('filters')} data-testid="booth-tab-filters"><Sparkles size={22} /><span>Filters</span></button>
        {inCamera
          ? <button type="button" className="bb-shutter" onClick={shutter} disabled={cam !== 'live'} aria-label="Take the photo" data-testid="booth-shutter"><i /></button>
          : <button type="button" className="bb-retake" onClick={retake} aria-label={source === 'camera' ? 'Retake' : 'Use the camera'} data-testid="booth-retake"><Camera size={24} /></button>}
        <button type="button" className={`bb-dk${panel === 'frame' ? ' on' : ''}`} onClick={() => togglePanel('frame')} data-testid="booth-tab-frame"><FrameIcon size={22} /><span>Frame</span></button>
        <button type="button" className="bb-dk" onClick={() => fileRef.current?.click()} disabled={loading} data-testid="booth-gallery-2">{loading ? <Loader2 className="bb-spin" size={22} /> : <ImageIcon size={22} />}<span>Gallery</span></button>
      </div>

      {result && <ResultSheet scene={result} logo={logoRef.current} onClose={() => setResult(null)} onUse={use} />}
      {photoInput}
    </div>
  );
};

export default BuddyBooth;
