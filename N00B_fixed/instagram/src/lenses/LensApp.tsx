import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Download, ImagePlus, RotateCcw, Search, Send, Share2, SwitchCamera, X, Camera as CameraIcon } from 'lucide-react';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { DEFAULT_LENS, GROUPS, LENSES, lensById, lensMatches, lensesIn, needsFace } from './catalog.ts';
import type { Group } from './catalog.ts';
import { FaceSmoother, clamp } from './faceMath.ts';
import { RATIOS, outputSize, ratioById } from './frame.ts';
import { findInPhoto, findInVideo, loadTracker, reloadTrackerOnCpu } from './faceTracker.ts';
import { renderScene, lensThumb } from './scene.ts';
import { canvasToBlob, drawTag, loadLogo, photoName, savePhoto, sharePhoto } from './exportPhoto.ts';
import type { FaceFrame } from './types.ts';

// NOOB Lenses: the camera with face filters. Everything happens on this device (the camera picture, the face finder, the drawing and the saved file): nothing is uploaded.
// It is a page of its own (lenses.html, at /lenses) so it works without logging in, and the app shows it in a frame (?embed=1) with the extra "Story" and "Post" buttons.

type Phase = 'camera' | 'review';
type Cam = 'starting' | 'live' | 'denied' | 'nocam' | 'insecure' | 'failed';
interface Shot { file: File; url: string; w: number; h: number }

const PREVIEW_SHORT = 800, PREVIEW_LONG = 1400;   // the live picture is drawn with at most this many pixels on its short / long side; the saved picture is sharper
const EXPORT_SHORT = 1080, EXPORT_LONG = 1920;    // the largest size of the saved picture
const STRIDE = 84;                                // the distance between two lens pictures in the strip (68 wide + 16 apart, see lens.css)

const CAM_MESSAGE: Record<Exclude<Cam, 'starting' | 'live'>, string> = {
  denied: 'NOOB needs your camera for lenses. Allow the camera for this page in your browser settings, then try again. You can also use a photo instead.',
  nocam: 'No camera was found on this device. You can use a photo instead.',
  insecure: 'The camera only works on a secure (https) address.',
  failed: 'The camera could not be started. Close other apps that use it, then try again.'
};

export const LensApp: React.FC = () => {
  const embed = useMemo(() => { try { return new URLSearchParams(window.location.search).get('embed') === '1'; } catch { return false; } }, []);
  const [lensId, setLensId] = useState(DEFAULT_LENS);
  const [group, setGroup] = useState<Group | 'all'>('all');
  const [ratioId, setRatioId] = useState(() => (typeof window !== 'undefined' && window.innerHeight > window.innerWidth ? '9:16' : 'orig'));
  const [sheet, setSheet] = useState(false);
  const [phase, setPhase] = useState<Phase>('camera');
  const [cam, setCam] = useState<Cam>('starting');
  const [tries, setTries] = useState(0);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [still, setStill] = useState<HTMLCanvasElement | null>(null);
  const [finder, setFinder] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [shot, setShot] = useState<Shot | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [flash, setFlash] = useState(false);
  const [noFace, setNoFace] = useState(false);
  const [fit, setFit] = useState({ w: 0, h: 0 });
  const [ratio, setRatio] = useState(9 / 16);          // the shape of the picture on the screen
  const [srcAr, setSrcAr] = useState(3 / 4);           // the shape the camera gives
  const [cameras, setCameras] = useState(0);
  const [taught, setTaught] = useState(false);         // the first-time tip goes away after the first lens change or picture

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const trackerRef = useRef<FaceLandmarker | null>(null);
  const smoother = useRef(new FaceSmoother());
  const faces = useRef<FaceFrame[]>([]);
  const stillFaces = useRef<FaceFrame[]>([]);
  const logoRef = useRef<HTMLImageElement | null>(null);
  const noFaceRef = useRef(false);
  const lastFace = useRef(0);
  const fromRail = useRef(false);
  const cpuTried = useRef(false);
  const srcAspect = useRef(0);

  const lens = lensById(lensId);
  const lensRef = useRef(lens); lensRef.current = lens;
  const stillRef = useRef(still); stillRef.current = still;
  const ratioRef = useRef(ratioId); ratioRef.current = ratioId;
  const mirror = !still && facing === 'user';
  const mirrorRef = useRef(mirror); mirrorRef.current = mirror;
  const visible = useMemo(() => lensesIn(group), [group]);
  const visibleRef = useRef(visible); visibleRef.current = visible;
  const index = Math.max(0, visible.findIndex((l) => l.id === lensId));

  // ---- the face finder (starts at once; the camera does not wait for it)
  useEffect(() => {
    let live = true;
    loadTracker().then((tr) => { if (live) { trackerRef.current = tr; setFinder('ready'); } }).catch(() => { if (live) setFinder('failed'); });
    void loadLogo().then((l) => { logoRef.current = l; });
    return () => { live = false; };
  }, []);

  // ---- the little pictures of the lenses: drawn a few at a time after the first screen is up
  useEffect(() => {
    let i = 0, live = true;
    const out: Record<string, string> = {};
    const step = (): void => {
      if (!live) return;
      for (const end = Math.min(LENSES.length, i + 4); i < end; i++) { try { out[LENSES[i].id] = lensThumb(LENSES[i]); } catch { /* the lens shows as a coloured circle */ } }
      setThumbs({ ...out });
      if (i < LENSES.length) window.setTimeout(step, 16);
    };
    const id = window.setTimeout(step, 40);
    return () => { live = false; window.clearTimeout(id); };
  }, []);

  useEffect(() => { if (!note) return; const id = window.setTimeout(() => setNote(''), 2600); return () => window.clearTimeout(id); }, [note]);

  // ---- the camera
  useEffect(() => {
    if (phase !== 'camera' || still) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    setCam('starting');
    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setCam('insecure'); return; }
      try {
        const portrait = window.innerHeight > window.innerWidth;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing }, width: { ideal: portrait ? 1080 : 1280 }, height: { ideal: portrait ? 1920 : 720 } }
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        try { await v.play(); } catch { /* it starts on the next picture */ }
        setCam('live');
        try { const list = await navigator.mediaDevices.enumerateDevices(); if (!cancelled) setCameras(list.filter((d) => d.kind === 'videoinput').length); } catch { /* the switch button stays as it was */ }
      } catch (e) {
        if (cancelled) return;
        const n = (e as { name?: string })?.name;
        setCam(n === 'NotAllowedError' || n === 'SecurityError' ? 'denied' : n === 'NotFoundError' || n === 'OverconstrainedError' ? 'nocam' : 'failed');
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      const v = videoRef.current;
      if (v) v.srcObject = null;
    };
  }, [phase, facing, still, tries]);

  // ---- the screen stays on while the camera is open (best effort: not every browser has this)
  useEffect(() => {
    if (phase !== 'camera') return;
    type Lock = { release: () => Promise<void> };
    let lock: Lock | null = null;
    let live = true;
    const ask = (): void => {
      const wl = (navigator as unknown as { wakeLock?: { request: (kind: 'screen') => Promise<Lock> } }).wakeLock;
      if (!wl || document.visibilityState !== 'visible') return;
      wl.request('screen').then((l) => { if (live) lock = l; else void l.release().catch(() => undefined); }).catch(() => undefined);
    };
    ask();
    document.addEventListener('visibilitychange', ask);
    return () => { live = false; document.removeEventListener('visibilitychange', ask); void lock?.release().catch(() => undefined); };
  }, [phase]);

  // ---- a photo picked from the phone: find its faces once
  useEffect(() => {
    if (!still || finder !== 'ready' || !trackerRef.current) return;
    let live = true;
    findInPhoto(trackerRef.current, still).then((f) => { if (live) stillFaces.current = f; }).catch(() => { /* no face lenses on this photo */ });
    return () => { live = false; };
  }, [still, finder]);

  // ---- drawing, once for every picture the browser shows
  useEffect(() => {
    if (phase !== 'camera') return;
    let raf = 0;
    let lastVideoTime = -1;
    let skip = 0, slow = 0, fails = 0;   // a slow phone looks for faces in every other picture; a finder that keeps failing is started again on the processor
    const tick = (ms: number): void => {
      raf = requestAnimationFrame(tick);
      const cv = canvasRef.current;
      if (!cv) return;
      const st = stillRef.current, v = videoRef.current;
      let src: CanvasImageSource | null = null, sw = 0, sh = 0;
      if (st) { src = st; sw = st.width; sh = st.height; } else if (v && v.readyState >= 2 && v.videoWidth) { src = v; sw = v.videoWidth; sh = v.videoHeight; }
      if (!src) return;
      if (Math.abs(srcAspect.current - sw / sh) > 0.002) { srcAspect.current = sw / sh; setSrcAr(sw / sh); }
      const o = outputSize(sw, sh, ratioById(ratioRef.current).ar, PREVIEW_SHORT, PREVIEW_LONG);
      if (cv.width !== o.w || cv.height !== o.h) { cv.width = o.w; cv.height = o.h; setRatio(o.w / o.h); }
      const t = ms / 1000, L = lensRef.current;
      if (needsFace(L)) {
        const tr = trackerRef.current;
        if (st) faces.current = stillFaces.current;
        else if (tr && v && v.currentTime !== lastVideoTime) {
          lastVideoTime = v.currentTime;
          if (skip > 0) skip--;
          else {
            const t0 = performance.now();
            try { faces.current = smoother.current.update(findInVideo(tr, v, mirrorRef.current), t); fails = 0; }
            catch {
              if (++fails === 4 && !cpuTried.current) {
                cpuTried.current = true; trackerRef.current = null; setFinder('loading');
                reloadTrackerOnCpu().then((n) => { trackerRef.current = n; setFinder('ready'); }).catch(() => setFinder('failed'));
              }
            }
            slow = slow * 0.8 + (performance.now() - t0) * 0.2;
            skip = slow > 40 ? 1 : 0;
          }
        } else if (!tr) faces.current = [];
        if (faces.current.some((f) => f.seen > 0.5)) lastFace.current = t;
        const none = !!tr && t - lastFace.current > 1.4 && !faces.current.length;
        if (none !== noFaceRef.current) { noFaceRef.current = none; setNoFace(none); }
      } else {
        faces.current = [];
        if (noFaceRef.current) { noFaceRef.current = false; setNoFace(false); }
      }
      const c = cv.getContext('2d');
      if (c) renderScene(c, o.w, o.h, src, sw, sh, mirrorRef.current, faces.current, L, t);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // ---- the picture is as big as the room allows, in its own shape
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = (): void => {
      const bw = el.clientWidth - 24, bh = el.clientHeight;   // (24 = the space left and right of the picture)
      if (!bw || !bh) return;
      const w = Math.min(bw, bh * ratio);
      setFit({ w: Math.round(w), h: Math.round(w / ratio) });
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, [ratio, phase]);

  // ---- the strip of lenses (a phone): the one in the middle is the chosen one, and tapping it takes the picture
  const grow = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const x = rail.scrollLeft;
    const kids = rail.children;
    for (let n = 0; n < kids.length; n++) (kids[n] as HTMLElement).style.transform = `scale(${1 + 0.3 * Math.max(0, 1 - Math.abs(n * STRIDE - x) / STRIDE)})`;
  }, []);
  const onRail = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    grow();
    const list = visibleRef.current;
    const l = list[clamp(Math.round(rail.scrollLeft / STRIDE), 0, list.length - 1)];
    if (l && l.id !== lensRef.current.id) { fromRail.current = true; setLensId(l.id); setTaught(true); }
  }, [grow]);
  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail || !rail.clientWidth) return;
    if (fromRail.current) { fromRail.current = false; return; }
    if (Math.abs(rail.scrollLeft - index * STRIDE) > 2) rail.scrollTo({ left: index * STRIDE, behavior: phase === 'camera' && thumbs.none ? 'smooth' : 'auto' });
    grow();
  }, [index, visible, phase, grow, thumbs.none]);

  const pickGroup = (g: Group | 'all'): void => {
    setGroup(g);
    const list = lensesIn(g);
    if (!list.some((l) => l.id === lensRef.current.id)) setLensId(list.length > 1 ? list[1].id : 'none');   // the first lens of that group shows at once
  };

  // ---- taking the picture
  const capture = useCallback(async () => {
    const st = stillRef.current, v = videoRef.current;
    let src: CanvasImageSource, sw: number, sh: number;
    if (st) { src = st; sw = st.width; sh = st.height; } else if (v && v.videoWidth) { src = v; sw = v.videoWidth; sh = v.videoHeight; } else return;
    setFlash(true); setTaught(true); window.setTimeout(() => setFlash(false), 200);
    const o = outputSize(sw, sh, ratioById(ratioRef.current).ar, EXPORT_SHORT, EXPORT_LONG);
    const cv = document.createElement('canvas');
    cv.width = o.w; cv.height = o.h;
    const c = cv.getContext('2d');
    if (!c) return;
    renderScene(c, o.w, o.h, src, sw, sh, mirrorRef.current, faces.current, lensRef.current, performance.now() / 1000);
    drawTag(c, o.w, o.h, logoRef.current);
    try {
      const blob = await canvasToBlob(cv);
      const file = new File([blob], photoName(lensRef.current.id), { type: 'image/jpeg' });
      setShot((old) => { if (old) URL.revokeObjectURL(old.url); return { file, url: URL.createObjectURL(file), w: o.w, h: o.h }; });
      setPhase('review');
    } catch { setNote('The picture could not be made. Please try again.'); }
  }, []);

  const retake = useCallback(() => { setShot((old) => { if (old) URL.revokeObjectURL(old.url); return null; }); setPhase('camera'); }, []);

  const onShare = async (): Promise<void> => {
    if (!shot) return;
    const r = await sharePhoto(shot.file);
    if (r === 'unsupported') { savePhoto(shot.file); setNote('Saved. Open it from your downloads or photos to share it.'); }
  };
  const onSave = (): void => { if (shot) { savePhoto(shot.file); setNote('Saved to your device'); } };
  const toApp = useCallback((message: { type: 'use'; file: File; target: 'post' | 'story' } | { type: 'close' }): void => { try { window.parent.postMessage({ noobLens: true, ...message }, window.location.origin); } catch { /* not in the app */ } }, []);

  const pickPhoto = (file: File | undefined): void => {
    if (!file) return;
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.naturalWidth * k)); cv.height = Math.max(1, Math.round(img.naturalHeight * k));
      cv.getContext('2d')?.drawImage(img, 0, 0, cv.width, cv.height);
      stillFaces.current = [];
      smoother.current.reset();
      setStill(cv); setShot(null); setPhase('camera');
    };
    img.onerror = () => { URL.revokeObjectURL(url); setNote('That file could not be opened as a picture.'); };
    img.src = url;
  };

  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  // Escape: back to the camera from a finished picture, or out of the lenses when they are shown inside the app (and the size list closes first)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      if (sheet) setSheet(false);
      else if (phase === 'review') retake();
      else if (embed) toApp({ type: 'close' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet, phase, embed, retake, toApp]);

  const q = query.trim();
  const shown = q ? LENSES.filter((l) => lensMatches(l, q)) : visible;
  const failed = !still && cam !== 'starting' && cam !== 'live';
  const wait = needsFace(lens) && finder === 'loading';
  const canFlip = !still && (cameras > 1 || (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches));
  const chosen = ratioById(ratioId);

  const tabs = (
    <div className="lz-tabs" role="tablist" aria-label="Lens groups">
      {GROUPS.map((g) => <button key={g.id} role="tab" aria-selected={g.id === group} data-on={g.id === group} onClick={() => { setQuery(''); pickGroup(g.id); }}>{g.label}</button>)}
    </div>
  );

  return (
    <div className="lz" data-phase={phase}>
      <video ref={videoRef} className="lz-video" playsInline muted autoPlay />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />

      <header className="lz-top">
        {embed
          ? <button className="lz-round" aria-label="Close" onClick={() => toApp({ type: 'close' })}><X size={22} /></button>
          : <a className="lz-brand" href="/" aria-label="NOOB"><img src="/brand/noob-wordmark.png" alt="NOOB" /></a>}
        <span className="lz-title">Lenses</span>
        <div className="lz-actions">
          {phase === 'camera' && (
            <>
              <button className="lz-pill" aria-label="Picture size" data-testid="lens-size" onClick={() => setSheet(true)}>{chosen.id === 'orig' ? 'Auto' : chosen.label}</button>
              {still && <button className="lz-round" aria-label="Use the camera" onClick={() => setStill(null)}><CameraIcon size={20} /></button>}
              <button className="lz-round" aria-label="Use a photo" onClick={() => fileRef.current?.click()}><ImagePlus size={20} /></button>
              {canFlip && <button className="lz-round" aria-label="Switch camera" onClick={() => { smoother.current.reset(); setFacing((f) => (f === 'user' ? 'environment' : 'user')); }}><SwitchCamera size={20} /></button>}
            </>
          )}
        </div>
      </header>

      {phase === 'camera' ? (
        <>
          <div className="lz-stage" ref={stageRef}>
            <div className="lz-frame" style={{ width: fit.w || undefined, height: fit.h || undefined }}>
              <canvas ref={canvasRef} className="lz-canvas" data-testid="lens-canvas" />
              {flash && <div className="lz-flash" />}
              {!failed && cam === 'starting' && !still && <div className="lz-hint">Starting the camera…</div>}
              {!failed && wait && cam !== 'starting' && <div className="lz-hint">Getting lenses ready…</div>}
              {!failed && !wait && finder === 'failed' && needsFace(lens) && <div className="lz-hint">Face lenses do not work on this browser. The colour looks do.</div>}
              {!failed && !wait && noFace && finder === 'ready' && <div className="lz-hint">Show your face to the camera</div>}
              {note && <div className="lz-toast">{note}</div>}
            </div>
            {failed && (
              <div className="lz-card" role="alert">
                <p>{CAM_MESSAGE[cam as keyof typeof CAM_MESSAGE]}</p>
                <div className="lz-row">
                  {cam !== 'insecure' && cam !== 'nocam' && <button className="lz-btn lz-primary" onClick={() => setTries((n) => n + 1)}>Try again</button>}
                  <button className="lz-btn" onClick={() => fileRef.current?.click()}>Use a photo</button>
                </div>
                <small>Pictures are made on your device. Nothing is uploaded.</small>
              </div>
            )}
          </div>

          {/* a phone: the strip of lenses; the ring in the middle is the shutter */}
          <div className="lz-strip">
            {tabs}
            <div className="lz-name">{lens.name}</div>
            {!taught && <div className="lz-tip">Swipe for more lenses · tap the circle to take a picture</div>}
            <div className="lz-railbox">
              <div className="lz-ring" aria-hidden="true" />
              <div className="lz-rail" ref={railRef} onScroll={onRail} role="listbox" aria-label="Lenses">
                {visible.map((l, i) => (
                  <button
                    key={l.id}
                    className="lz-lens"
                    role="option"
                    aria-selected={i === index}
                    aria-label={i === index ? `Take a picture with ${l.name}` : l.name}
                    style={{ ['--glow' as string]: l.color }}
                    onClick={() => {
                      if (i === index) void capture();
                      else railRef.current?.scrollTo({ left: i * STRIDE, behavior: 'smooth' });
                    }}
                  >
                    {thumbs[l.id] ? <img src={thumbs[l.id]} alt="" draggable={false} /> : <span />}
                  </button>
                ))}
              </div>
            </div>
            <button className="lz-clear" aria-label="No lens" onClick={() => setLensId('none')}><X size={20} /></button>
          </div>

          {/* a computer: the picture of every lens in a grid, with groups and a search box, and a shutter button */}
          <div className="lz-panel">
            <button className="lz-shutter" aria-label="Take a picture" onClick={() => void capture()}><span /></button>
            <div className="lz-panelhead">
              {tabs}
              <label className="lz-search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search lenses (BTS, One Piece ...)" aria-label="Search lenses" /></label>
            </div>
            <div className="lz-grid">
              {shown.map((l) => (
                <button key={l.id} className="lz-tile" data-on={l.id === lensId} onClick={() => setLensId(l.id)} style={{ ['--glow' as string]: l.color }}>
                  {thumbs[l.id] ? <img src={thumbs[l.id]} alt="" draggable={false} /> : <span />}
                  <em>{l.name}</em>
                </button>
              ))}
              {!shown.length && <p className="lz-none">No lens has that name.</p>}
            </div>
          </div>
        </>
      ) : (
        shot && (
          <>
            <div className="lz-stage">
              <img className="lz-result" src={shot.url} alt="Your picture with the NOOB tag" />
              {note && <div className="lz-toast">{note}</div>}
            </div>
            <div className="lz-bar">
              <button className="lz-btn" onClick={retake}><RotateCcw size={18} /> Retake</button>
              <button className="lz-btn" onClick={onSave}><Download size={18} /> Save</button>
              <button className="lz-btn lz-primary" onClick={() => void onShare()}><Share2 size={18} /> Share</button>
              {embed && <button className="lz-btn" onClick={() => toApp({ type: 'use', file: shot.file, target: 'story' })}><Send size={18} /> Story</button>}
              {embed && <button className="lz-btn" onClick={() => toApp({ type: 'use', file: shot.file, target: 'post' })}><Send size={18} /> Post</button>}
            </div>
            <p className="lz-foot">{shot.w} × {shot.h} · Share it to any app, or touch and hold the picture to save it. The NOOB tag stays on it.</p>
          </>
        )
      )}

      {sheet && (
        <div className="lz-sheetback" onClick={() => setSheet(false)}>
          <div className="lz-sheet" role="dialog" aria-label="Picture size" onClick={(e) => e.stopPropagation()}>
            <h3>Picture size</h3>
            <p>Pick the shape that fits the app you will post it in.</p>
            {RATIOS.map((r) => {
              const a = r.ar || srcAr;
              return (
                <button key={r.id} className="lz-size" data-on={r.id === ratioId} onClick={() => { setRatioId(r.id); setSheet(false); }}>
                  <i style={{ width: Math.round(clamp(30 * a, 14, 54)), height: 30 }} />
                  <span><b>{r.id === 'orig' ? 'Auto' : r.label}</b><em>{r.apps}</em></span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
