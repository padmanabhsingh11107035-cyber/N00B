import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Zap, ZapOff, SwitchCamera, Timer, Image as ImageIcon, Infinity as InfinityIcon, LayoutGrid, Sparkles, Settings, ChevronDown, ChevronUp, Grid3x3 } from 'lucide-react';
import './storyCamera.css';

// The first screen of "Story", drawn like Instagram's: the camera fills a rounded card, close at the top left, the flash in the middle and the settings at the right; a tool column on the left
// (Aa for a words-only story, Boomerang, Layout, Effects, and a chevron that opens the timer); the big round shutter (a tap takes a picture, holding it records a video); the gallery square at the bottom left,
// the words POST / STORY / INSTANT in the middle and the camera switch at the right. What is taken (or chosen) goes on to the story editor (CreateStoryModal) as a file.
type ShotMode = 'normal' | 'boomerang' | 'layout';
export interface StoryCameraProps {
  onClose: () => void;
  /** a photo, boomerang or video was made, or a picture / video was picked from the phone */
  onFile: (file: File) => void;
  /** POST or INSTANT was tapped */
  onSwitchMode: (mode: 'post' | 'instant') => void;
}

const GRADIENTS: Array<[string, string]> = [['#8b5cf6', '#ec4899'], ['#0ea5e9', '#22c55e'], ['#f97316', '#ef4444'], ['#111827', '#6366f1'], ['#f59e0b', '#db2777']];
const EFFECTS: Array<{ id: string; label: string; css: string }> = [
  { id: 'none', label: 'Normal', css: 'none' },
  { id: 'warm', label: 'Warm', css: 'sepia(0.25) saturate(1.3) hue-rotate(-10deg)' },
  { id: 'cool', label: 'Cool', css: 'saturate(1.1) hue-rotate(15deg) brightness(1.05)' },
  { id: 'mono', label: 'Mono', css: 'grayscale(1) contrast(1.05)' },
  { id: 'vivid', label: 'Vivid', css: 'saturate(1.7) contrast(1.1)' },
  { id: 'fade', label: 'Fade', css: 'contrast(0.85) brightness(1.1) saturate(0.8)' },
  { id: 'retro', label: 'Retro', css: 'sepia(0.8) contrast(1.05)' }
];
const MAX_RECORD_MS = 30000;
const SETTINGS_KEY = 'noob_story_camera';

/** a plain coloured picture (the background of a words-only story) */
function gradientFile(): Promise<File | null> {
  return new Promise((resolve) => {
    try {
      const c = document.createElement('canvas');
      c.width = 1080; c.height = 1920;
      const ctx = c.getContext('2d');
      if (!ctx) { resolve(null); return; }
      const [a, b] = GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)];
      const g = ctx.createLinearGradient(0, 0, 1080, 1920);
      g.addColorStop(0, a); g.addColorStop(1, b);
      ctx.fillStyle = g; ctx.fillRect(0, 0, 1080, 1920);
      c.toBlob((blob) => resolve(blob ? new File([blob], 'words-story.jpg', { type: 'image/jpeg' }) : null), 'image/jpeg', 0.9);
    } catch { resolve(null); }
  });
}

const pickRecorderType = (): string => {
  const list = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  try { for (const t of list) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t; } catch { /* none */ }
  return '';
};
const extFor = (mime: string) => (mime.includes('mp4') ? 'mp4' : 'webm');

export const StoryCameraScreen: React.FC<StoryCameraProps> = ({ onClose, onFile, onSwitchMode }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pickRef = useRef<HTMLInputElement | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const [camError, setCamError] = useState('');
  const [torchOk, setTorchOk] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [timerOn, setTimerOn] = useState(false);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState('');
  const [shot, setShot] = useState<ShotMode>('normal');
  const [effect, setEffect] = useState('none');
  const [showEffects, setShowEffects] = useState(false);
  const [moreTools, setMoreTools] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [grid, setGrid] = useState(() => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}').grid === true; } catch { return false; } });
  const [saveCopy, setSaveCopy] = useState(() => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}').save === true; } catch { return false; } });
  const [layoutFirst, setLayoutFirst] = useState<HTMLCanvasElement | null>(null);
  const [recording, setRecording] = useState(false);
  const [recMs, setRecMs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const holdTimer = useRef<number | undefined>(undefined);
  const heldRef = useRef(false);
  const recTick = useRef<number | undefined>(undefined);
  const effectCss = EFFECTS.find((e) => e.id === effect)?.css || 'none';

  useEffect(() => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ grid, save: saveCopy })); } catch { /* not remembered */ } }, [grid, saveCopy]);

  const stop = useCallback(() => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; }, []);
  const start = useCallback(async (f: 'user' | 'environment') => {
    stop(); setCamError(''); setTorchOn(false); setTorchOk(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: f, width: { ideal: 1080 }, height: { ideal: 1920 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play().catch(() => undefined); }
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() || {}) as { torch?: boolean };
      setTorchOk(!!caps.torch);
    } catch {
      setCamError('The camera is not available. You can still choose a picture or video from your phone with the square at the bottom left.');
    }
  }, [stop]);
  useEffect(() => { void start(facing); return stop; }, [facing, start, stop]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.clearTimeout(holdTimer.current); window.clearInterval(recTick.current); };
  }, [onClose]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try { await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] }); setTorchOn((v) => !v); } catch { /* this camera has no flash */ }
  };

  /** draws the current camera picture (with the chosen effect, selfies the way they were seen) into a canvas of the given size, cropped to fill */
  const drawFrame = (w: number, h: number): HTMLCanvasElement | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const scale = Math.max(w / v.videoWidth, h / v.videoHeight);
    const dw = v.videoWidth * scale, dh = v.videoHeight * scale;
    try { if (effectCss !== 'none' && 'filter' in ctx) (ctx as CanvasRenderingContext2D & { filter: string }).filter = effectCss; } catch { /* no filters on this browser */ }
    if (facing === 'user') { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return c;
  };
  const toFile = (c: HTMLCanvasElement, name: string): Promise<File | null> => new Promise((r) => c.toBlob((b) => r(b ? new File([b], name, { type: 'image/jpeg' }) : null), 'image/jpeg', 0.92));
  const keepCopy = (file: File) => {
    if (!saveCopy) return;
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(a.href), 4000); } catch { /* not saved */ }
  };
  const finish = (file: File) => { keepCopy(file); stop(); onFile(file); };

  const snapPhoto = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = drawFrame(v.videoWidth, v.videoHeight);
    const f = c ? await toFile(c, `story-${Date.now()}.jpg`) : null;
    if (f) finish(f);
  };

  // Layout: two pictures, one above the other
  const snapLayout = async () => {
    const c = drawFrame(1080, 960);
    if (!c) return;
    if (!layoutFirst) { setLayoutFirst(c); return; }
    const out = document.createElement('canvas');
    out.width = 1080; out.height = 1920;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1080, 1920);
    ctx.drawImage(layoutFirst, 0, 0); ctx.drawImage(c, 0, 960);
    setLayoutFirst(null);
    const f = await toFile(out, `story-layout-${Date.now()}.jpg`);
    if (f) finish(f);
  };

  // Boomerang: about a second of pictures, played forward and back a few times, saved as a short video
  const snapBoomerang = async () => {
    const type = pickRecorderType();
    if (!type || typeof HTMLCanvasElement.prototype.captureStream !== 'function') { setCamError('Boomerang is not available on this phone. Taking a picture instead.'); window.setTimeout(() => setCamError(''), 2500); await snapPhoto(); return; }
    setBusy('Recording your boomerang…');
    const frames: HTMLCanvasElement[] = [];
    for (let i = 0; i < 12; i++) { const c = drawFrame(540, 960); if (c) frames.push(c); await new Promise((r) => window.setTimeout(r, 80)); }
    if (frames.length < 4) { setBusy(''); return; }
    setBusy('Making your boomerang…');
    const out = document.createElement('canvas');
    out.width = 540; out.height = 960;
    const ctx = out.getContext('2d');
    if (!ctx) { setBusy(''); return; }
    const rec = new MediaRecorder(out.captureStream(30), { mimeType: type, videoBitsPerSecond: 3_000_000 });
    const parts: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    const done = new Promise<void>((r) => { rec.onstop = () => r(); });
    rec.start();
    const seq = [...frames, ...frames.slice().reverse()];
    for (let loop = 0; loop < 3; loop++) for (const fr of seq) { ctx.drawImage(fr, 0, 0); await new Promise((r) => window.setTimeout(r, 70)); }
    rec.stop();
    await done;
    const blob = new Blob(parts, { type: type.split(';')[0] });
    setBusy('');
    if (blob.size > 0) finish(new File([blob], `boomerang-${Date.now()}.${extFor(type)}`, { type: blob.type }));
  };

  // Holding the shutter records a video (with sound), up to 30 seconds; the ring fills while it records
  const startRecording = async () => {
    const base = streamRef.current;
    const type = pickRecorderType();
    if (!base || !type) return;
    let audio: MediaStreamTrack | null = null;
    try { const a = await navigator.mediaDevices.getUserMedia({ audio: true }); audio = a.getAudioTracks()[0] || null; } catch { /* a video without sound */ }
    const mix = new MediaStream([...base.getVideoTracks(), ...(audio ? [audio] : [])]);
    chunksRef.current = [];
    const rec = new MediaRecorder(mix, { mimeType: type, videoBitsPerSecond: 4_000_000 });
    recorderRef.current = rec;
    rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      audio?.stop();
      window.clearInterval(recTick.current);
      setRecording(false); setRecMs(0);
      const blob = new Blob(chunksRef.current, { type: type.split(';')[0] });
      if (blob.size > 2000) finish(new File([blob], `story-${Date.now()}.${extFor(type)}`, { type: blob.type }));
    };
    rec.start(500);
    setRecording(true);
    const t0 = Date.now();
    recTick.current = window.setInterval(() => { const ms = Date.now() - t0; setRecMs(ms); if (ms >= MAX_RECORD_MS) stopRecording(); }, 100);
  };
  const stopRecording = () => { const r = recorderRef.current; if (r && r.state !== 'inactive') r.stop(); recorderRef.current = null; };

  const tap = () => {
    if (shot === 'boomerang') void snapBoomerang();
    else if (shot === 'layout') void snapLayout();
    else void snapPhoto();
  };
  const onShutterDown = () => {
    if (busy || camError) return;
    heldRef.current = false;
    if (shot !== 'normal' || timerOn) return;
    holdTimer.current = window.setTimeout(() => { heldRef.current = true; void startRecording(); }, 380);
  };
  const onShutterUp = () => {
    window.clearTimeout(holdTimer.current);
    if (heldRef.current) { stopRecording(); heldRef.current = false; return; }
    if (busy || camError) return;
    if (timerOn) {
      let n = 3; setCount(n);
      const id = window.setInterval(() => { n -= 1; if (n <= 0) { window.clearInterval(id); setCount(0); tap(); } else setCount(n); }, 1000);
      return;
    }
    tap();
  };

  const ring = Math.min(1, recMs / MAX_RECORD_MS);

  return (
    <div className="sc-root" role="dialog" aria-modal="true" aria-label="Story camera" data-noob-keep="1" data-testid="story-camera">
      <div className="sc-card">
        <video ref={videoRef} className={`sc-video ${facing === 'user' ? 'is-mirror' : ''}`} style={{ filter: effectCss === 'none' ? undefined : effectCss }} playsInline muted autoPlay />
        {grid && <div className="sc-grid" aria-hidden="true"><i /><i /><b /><b /></div>}
        {camError && <p className="sc-err" role="alert">{camError}</p>}
        {busy && <div className="sc-busy" role="status">{busy}</div>}
        {layoutFirst && <div className="sc-hint" role="status">Picture 1 of 2 taken. Now take the second one.</div>}

        <button type="button" className="sc-ico sc-close" onClick={onClose} aria-label="Close" data-testid="story-camera-close"><X /></button>
        {torchOk && <button type="button" className="sc-ico sc-flash" onClick={() => void toggleTorch()} aria-pressed={torchOn} aria-label="Flash">{torchOn ? <Zap /> : <ZapOff />}</button>}
        <button type="button" className="sc-ico sc-gear" onClick={() => setShowSettings((v) => !v)} aria-label="Camera settings" aria-expanded={showSettings} data-testid="story-camera-settings"><Settings /></button>

        {showSettings && (
          <div className="sc-pop" role="group" aria-label="Camera settings">
            <button type="button" role="switch" aria-checked={grid} onClick={() => setGrid((v) => !v)}><span><Grid3x3 />Grid lines</span><em className={grid ? 'on' : ''} /></button>
            <button type="button" role="switch" aria-checked={saveCopy} onClick={() => setSaveCopy((v) => !v)}><span><ImageIcon />Save a copy to my phone</span><em className={saveCopy ? 'on' : ''} /></button>
          </div>
        )}

        <div className="sc-tools">
          <button type="button" className="sc-tool" onClick={async () => { const f = await gradientFile(); if (f) { stop(); onFile(f); } }} aria-label="Words only story" data-testid="story-camera-aa"><span className="sc-aa">Aa</span></button>
          <button type="button" className={`sc-tool ${shot === 'boomerang' ? 'is-on' : ''}`} onClick={() => { setShot((s) => (s === 'boomerang' ? 'normal' : 'boomerang')); setLayoutFirst(null); }} aria-pressed={shot === 'boomerang'} aria-label="Boomerang" data-testid="story-camera-boomerang"><InfinityIcon /></button>
          <button type="button" className={`sc-tool ${shot === 'layout' ? 'is-on' : ''}`} onClick={() => { setShot((s) => (s === 'layout' ? 'normal' : 'layout')); setLayoutFirst(null); }} aria-pressed={shot === 'layout'} aria-label="Layout" data-testid="story-camera-layout"><LayoutGrid /></button>
          <button type="button" className={`sc-tool ${showEffects || effect !== 'none' ? 'is-on' : ''}`} onClick={() => setShowEffects((v) => !v)} aria-pressed={showEffects} aria-label="Effects" data-testid="story-camera-effects"><Sparkles /></button>
          <button type="button" className="sc-tool" onClick={() => setMoreTools((v) => !v)} aria-expanded={moreTools} aria-label="More tools">{moreTools ? <ChevronUp /> : <ChevronDown />}</button>
          {moreTools && <button type="button" className={`sc-tool ${timerOn ? 'is-on' : ''}`} onClick={() => setTimerOn((v) => !v)} aria-pressed={timerOn} aria-label="3 second timer"><Timer /></button>}
        </div>

        {count > 0 && <div className="sc-count" aria-live="assertive">{count}</div>}

        {showEffects && (
          <div className="sc-effects" role="listbox" aria-label="Effects">
            {EFFECTS.map((e) => (
              <button key={e.id} type="button" role="option" aria-selected={effect === e.id} className={effect === e.id ? 'is-on' : ''} onClick={() => setEffect(e.id)}>{e.label}</button>
            ))}
          </div>
        )}

        <button
          type="button"
          className={`sc-shutter ${recording ? 'is-rec' : ''}`}
          onPointerDown={onShutterDown}
          onPointerUp={onShutterUp}
          onPointerCancel={() => { window.clearTimeout(holdTimer.current); if (heldRef.current) { stopRecording(); heldRef.current = false; } }}
          onContextMenu={(e) => e.preventDefault()}
          disabled={!!busy || !!camError}
          aria-label={shot === 'boomerang' ? 'Make a boomerang' : shot === 'layout' ? 'Take a layout picture' : 'Take a photo, hold to record a video'}
          data-testid="story-camera-shutter"
          style={recording ? ({ ['--rec' as string]: String(ring) } as React.CSSProperties) : undefined}
        ><span /></button>
        {recording && <div className="sc-rec" role="status"><i />{Math.floor(recMs / 1000)}s</div>}
      </div>

      <div className="sc-bottom">
        <button type="button" className="sc-gallery" onClick={() => pickRef.current?.click()} aria-label="Choose from your phone" data-testid="story-camera-gallery"><ImageIcon /></button>
        <input ref={pickRef} type="file" accept="image/*,video/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { stop(); onFile(f); } }} />
        <div className="sc-modes" role="tablist" aria-label="What to make">
          <button type="button" role="tab" aria-selected={false} onClick={() => { stop(); onSwitchMode('post'); }}>POST</button>
          <button type="button" role="tab" aria-selected className="is-on">STORY</button>
          <button type="button" role="tab" aria-selected={false} onClick={() => { stop(); onSwitchMode('instant'); }}>INSTANT</button>
        </div>
        <button type="button" className="sc-flip" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} aria-label="Switch camera" data-testid="story-camera-flip"><SwitchCamera /></button>
      </div>
    </div>
  );
};
