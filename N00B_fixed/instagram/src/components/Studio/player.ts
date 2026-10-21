import { Asset, AudioLayer, MediaLayer, Project, projectDuration } from './types';

// The player keeps one playing copy of every video clip and every sound, follows the playhead, and mixes all the sound (each clip's own sound and the music / voice-over) through
// one audio graph. The picture is drawn by render.ts at the time the player says; for the video export the same player runs the timeline once while the result is recorded.

type MediaEl = HTMLVideoElement | HTMLAudioElement;
interface Node { src: MediaElementAudioSourceNode; gain: GainNode }

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

export class Player {
  project: Project;
  assets: Map<string, Asset>;
  t = 0;
  playing = false;
  /** called for every frame while playing, and after a seek has finished */
  onFrame: (t: number) => void = () => undefined;
  onState: () => void = () => undefined;
  private videos = new Map<string, HTMLVideoElement>();
  private sounds = new Map<string, HTMLAudioElement>();
  private nodes = new Map<MediaEl, Node>();
  private actx: AudioContext | null = null;
  private master: GainNode | null = null;
  private streamDest: MediaStreamAudioDestinationNode | null = null;
  private raf = 0;
  private wall0 = 0;
  private t0 = 0;
  private endHandler: (() => void) | null = null;

  constructor(project: Project, assets: Map<string, Asset>) {
    this.project = project;
    this.assets = assets;
    this.sync();
  }

  get duration(): number { return projectDuration(this.project); }

  setProject(p: Project, assets: Map<string, Asset>): void {
    this.project = p;
    this.assets = assets;
    this.sync();
    this.applyMedia(this.t, false);
  }

  videoFor = (layerId: string): HTMLVideoElement | null => this.videos.get(layerId) || null;

  // ---- the set of playing copies follows the project
  private sync(): void {
    const wantV = new Set<string>();
    const wantA = new Set<string>();
    for (const l of this.project.layers) {
      if (l.type === 'media') {
        const a = this.assets.get(l.assetId);
        if (a?.kind === 'video') {
          wantV.add(l.id);
          const cur = this.videos.get(l.id);
          if (!cur || cur.dataset.asset !== a.id) {
            if (cur) this.dispose(cur);
            const v = document.createElement('video');
            v.preload = 'auto'; v.playsInline = true; v.crossOrigin = 'anonymous'; v.dataset.asset = a.id; v.src = a.url;
            v.addEventListener('seeked', () => this.onFrame(this.t));
            v.addEventListener('loadeddata', () => this.onFrame(this.t));
            this.videos.set(l.id, v);
          }
        }
      } else if (l.type === 'audio') {
        const a = this.assets.get(l.assetId);
        if (a) {
          wantA.add(l.id);
          const cur = this.sounds.get(l.id);
          if (!cur || cur.dataset.asset !== a.id) {
            if (cur) this.dispose(cur);
            const s = document.createElement('audio');
            s.preload = 'auto'; s.dataset.asset = a.id; s.src = a.url;
            this.sounds.set(l.id, s);
          }
        }
      }
    }
    for (const [id, v] of this.videos) if (!wantV.has(id)) { this.dispose(v); this.videos.delete(id); }
    for (const [id, s] of this.sounds) if (!wantA.has(id)) { this.dispose(s); this.sounds.delete(id); }
  }

  private dispose(el: MediaEl): void {
    try { el.pause(); } catch { /* gone */ }
    const n = this.nodes.get(el);
    if (n) { try { n.src.disconnect(); n.gain.disconnect(); } catch { /* gone */ } this.nodes.delete(el); }
    el.removeAttribute('src'); el.load();
  }

  // ---- audio graph
  private ensureAudio(): void {
    if (this.actx) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.actx = new Ctx();
    this.master = this.actx.createGain();
    this.master.connect(this.actx.destination);
    try { this.streamDest = this.actx.createMediaStreamDestination(); this.master.connect(this.streamDest); } catch { this.streamDest = null; }
  }

  private nodeFor(el: MediaEl): Node | null {
    this.ensureAudio();
    if (!this.actx || !this.master) return null;
    let n = this.nodes.get(el);
    if (!n) {
      try {
        const src = this.actx.createMediaElementSource(el);
        const gain = this.actx.createGain();
        src.connect(gain); gain.connect(this.master);
        n = { src, gain };
        this.nodes.set(el, n);
      } catch { return null; }
    }
    return n;
  }

  /** The stream of all the sound, for the export. Null when the browser has no way to give it. */
  audioStream(): MediaStream | null { this.ensureAudio(); return this.streamDest ? this.streamDest.stream : null; }
  /** Hear it while it plays (off during an export, which is silent on the speakers). */
  setMonitor(on: boolean): void {
    this.ensureAudio();
    if (!this.actx || !this.master) return;
    try { if (on) this.master.connect(this.actx.destination); else this.master.disconnect(this.actx.destination); } catch { /* already so */ }
  }
  hasSound(): boolean {
    return this.project.layers.some((l) => (l.type === 'audio') || (l.type === 'media' && l.track && this.assets.get(l.assetId)?.kind === 'video' && l.volume > 0 && !l.hidden));
  }

  // ---- following the playhead
  private gainAt(l: MediaLayer | AudioLayer, t: number): number {
    if (l.muted) return 0;
    let g = l.volume;
    if (l.fadeIn > 0) g *= clamp((t - l.start) / l.fadeIn);
    if (l.fadeOut > 0) g *= clamp((l.start + l.duration - t) / l.fadeOut);
    return g;
  }

  private place(el: MediaEl, want: number, playing: boolean, rate: number): void {
    el.playbackRate = rate;
    const drift = Math.abs(el.currentTime - want);
    if (!playing) { if (drift > 0.03) el.currentTime = want; if (!el.paused) el.pause(); return; }
    if (drift > 0.35 || (el.paused && drift > 0.05)) el.currentTime = want;
    if (el.paused) void el.play().catch(() => undefined);
  }

  /** Puts every video and sound where the playhead says (and starts or stops it). */
  private applyMedia(t: number, playing: boolean): void {
    const still = this.project.mode === 'photo';
    for (const l of this.project.layers) {
      if (l.type === 'media') {
        const v = this.videos.get(l.id);
        if (!v) continue;
        const active = !l.hidden && !still && t >= l.start - 0.001 && t < l.start + l.duration;
        if (!active) { if (!v.paused) v.pause(); continue; }
        const want = Math.min(l.trimOut, l.trimIn + (t - l.start) * l.speed);
        this.place(v, want, playing, l.speed);
        const n = this.nodeFor(v);
        if (n) n.gain.gain.value = this.gainAt(l, t);
      } else if (l.type === 'audio') {
        const s = this.sounds.get(l.id);
        if (!s) continue;
        const active = !l.hidden && t >= l.start - 0.001 && t < l.start + l.duration;
        if (!active) { if (!s.paused) s.pause(); continue; }
        this.place(s, l.trimIn + (t - l.start), playing, 1);
        const n = this.nodeFor(s);
        if (n) n.gain.gain.value = this.gainAt(l, t);
      }
    }
  }

  seek(t: number): void {
    this.t = clamp(t, 0, Math.max(0, this.duration));
    if (this.playing) { this.t0 = this.t; this.wall0 = performance.now(); }
    this.applyMedia(this.t, this.playing);
    this.onFrame(this.t);
  }

  play(): void {
    if (this.playing || this.duration <= 0) return;
    this.ensureAudio();
    void this.actx?.resume();
    if (this.t >= this.duration - 0.05) this.t = 0;
    this.playing = true; this.t0 = this.t; this.wall0 = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    this.onState();
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.applyMedia(this.t, false);
    this.onState();
  }

  private loop = (): void => {
    if (!this.playing) return;
    const t = this.t0 + (performance.now() - this.wall0) / 1000;
    if (t >= this.duration) {
      this.t = this.duration;
      this.applyMedia(this.t, false);
      this.playing = false;
      this.onFrame(this.t);
      this.onState();
      const done = this.endHandler; this.endHandler = null; done?.();
      return;
    }
    this.t = t;
    this.applyMedia(t, true);
    this.onFrame(t);
    this.raf = requestAnimationFrame(this.loop);
  };

  /** Plays the timeline once from the start (the video export records it). Resolves when it has finished or was stopped. */
  runOnce(): { finished: Promise<void>; stop: () => void } {
    let resolve: () => void = () => undefined;
    const finished = new Promise<void>((r) => { resolve = r; });
    this.pause();
    this.t = 0;
    this.applyMedia(0, false);
    this.endHandler = resolve;
    // give the first frame of every clip a moment to be ready
    window.setTimeout(() => { this.playing = false; this.play(); }, 350);
    return { finished, stop: () => { this.endHandler = null; this.pause(); resolve(); } };
  }

  /** Lets go of everything: playing copies, the audio graph. */
  destroy(): void {
    this.pause();
    for (const v of this.videos.values()) this.dispose(v);
    for (const s of this.sounds.values()) this.dispose(s);
    this.videos.clear(); this.sounds.clear();
    try { void this.actx?.close(); } catch { /* closed */ }
    this.actx = null; this.master = null; this.streamDest = null;
  }
}

// ---------- voice-over
export class VoiceRecorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  startedAt = 0;

  static supported(): boolean { return !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'; }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.start(250);
    this.startedAt = performance.now();
  }

  stop(): Promise<File | null> {
    return new Promise((resolve) => {
      const rec = this.rec;
      if (!rec) { resolve(null); return; }
      rec.onstop = () => {
        this.stream?.getTracks().forEach((t) => t.stop());
        const type = rec.mimeType || 'audio/webm';
        const blob = new Blob(this.chunks, { type });
        this.rec = null; this.stream = null;
        resolve(blob.size > 500 ? new File([blob], `Voice-over.${type.includes('mp4') ? 'm4a' : 'webm'}`, { type }) : null);
      };
      try { rec.stop(); } catch { resolve(null); }
    });
  }

  cancel(): void { try { this.rec?.stop(); } catch { /* stopped */ } this.stream?.getTracks().forEach((t) => t.stop()); this.rec = null; this.stream = null; }
}
