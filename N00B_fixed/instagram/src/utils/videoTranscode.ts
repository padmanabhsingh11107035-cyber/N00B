// Makes a phone video small enough to upload, on the phone itself, for Android (Chrome) and iPhone (Safari 16.4 and newer): the video is read in pieces, decoded by the phone's
// video chip, scaled, encoded again as H.264 and wrapped as an MP4 that plays everywhere. The sound is copied as it is. Nothing here loads a whole video into memory: the
// original (which can be several GB) is read a few MB at a time, and only the finished file (at most 48 MB) is kept.
//
// Anything this cannot do (a browser without video encoding, a video type it does not know, a sound it cannot copy) throws TranscodeUnsupported, and the caller sends the
// original instead; a video that is too long for one file throws VideoTooLongError. The size and the bitrate are decided by videoPlan.ts.
import { planEncoding, maxSecondsThatFit, MAX_UPLOAD_BYTES, type EncodingPlan } from './videoPlan';

export class TranscodeUnsupported extends Error {
  constructor(message: string) { super(message); this.name = 'TranscodeUnsupported'; }
}
export class VideoTooLongError extends Error {
  durationSec: number;
  maxSeconds: number;
  constructor(durationSec: number, maxSeconds: number) {
    super('This video is too long to upload as one file.');
    this.name = 'VideoTooLongError';
    this.durationSec = durationSec;
    this.maxSeconds = maxSeconds;
  }
}

/** Can this browser re-encode video at all? (Chrome on Android: yes. Safari on iPhone: from iOS 16.4.) */
export function canTranscode(): boolean {
  return (
    typeof VideoDecoder !== 'undefined' && typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined' &&
    typeof EncodedVideoChunk !== 'undefined' && typeof Blob !== 'undefined' && typeof Blob.prototype.slice === 'function'
  );
}

export interface VideoProbe {
  durationSec: number;
  /** As shown (a phone held upright reports 1080 x 1920 here, whatever the file's own layout is). */
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  fps: number;
  codec: string;
  videoBytes: number;
  videoBps: number;
  audio: null | { codec: string; sampleRate: number; channels: number; bytes: number; bps: number };
}

interface SampleLike { offset: number; size: number; cts: number; dts: number; duration: number; timescale: number; is_sync: boolean }
interface Opened {
  probe: VideoProbe;
  videoId: number;
  vSamples: SampleLike[];
  aSamples: SampleLike[];
  videoDescription?: Uint8Array;
  audioSpecificConfig?: Uint8Array;
  codedWidth: number;
  codedHeight: number;
}

const u8 = (buf: ArrayBuffer | ArrayBufferView): Uint8Array => (buf instanceof Uint8Array ? buf : ArrayBuffer.isView(buf) ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) : new Uint8Array(buf));

/** Reads the top-level boxes of an MP4 / MOV (a few bytes each) until the 'moov' box - the table of contents - and returns that box alone, wherever it sits in the file. */
async function readMoov(file: Blob): Promise<Uint8Array | null> {
  let pos = 0;
  const size = file.size;
  for (let guard = 0; guard < 64 && pos + 8 <= size; guard++) {
    const head = new DataView(await file.slice(pos, Math.min(size, pos + 16)).arrayBuffer());
    if (head.byteLength < 8) return null;
    let boxSize = head.getUint32(0);
    const type = String.fromCharCode(head.getUint8(4), head.getUint8(5), head.getUint8(6), head.getUint8(7));
    let headerSize = 8;
    if (boxSize === 1) {
      if (head.byteLength < 16) return null;
      boxSize = Number(head.getBigUint64(8));
      headerSize = 16;
    } else if (boxSize === 0) {
      boxSize = size - pos;
    }
    if (boxSize < headerSize || pos + boxSize > size) return null;
    if (type === 'moov') {
      if (boxSize > 96 * 1024 * 1024) return null;
      return new Uint8Array(await file.slice(pos, pos + boxSize).arrayBuffer());
    }
    pos += boxSize;
  }
  return null;
}

function findDescriptor(d: any, tag: number): any {
  if (!d) return null;
  if (d.tag === tag) return d;
  for (const c of d.descs || []) {
    const r = findDescriptor(c, tag);
    if (r) return r;
  }
  return null;
}

function rotationOf(matrix: ArrayLike<number> | undefined): 0 | 90 | 180 | 270 {
  if (!matrix || matrix.length < 5) return 0;
  const a = Number(matrix[0]), b = Number(matrix[1]);
  if (!a && !b) return 0;
  const deg = Math.round((Math.atan2(b, a) * 180) / Math.PI);
  const r = ((deg % 360) + 360) % 360;
  return (r === 90 || r === 180 || r === 270 ? r : 0) as 0 | 90 | 180 | 270;
}

/** Reads a video file's table of contents (not its pictures): length, size, frame rate, codecs. Null when it is not an MP4 / MOV this code understands. */
async function openMovie(file: Blob): Promise<Opened | null> {
  const moov = await readMoov(file);
  if (!moov) return null;
  const { createFile, MP4BoxBuffer, DataStream, Endianness } = await import('mp4box');
  const mp4 = createFile();
  let info: any = null;
  mp4.onReady = (i: any) => { info = i; };
  // The demuxer wants a 'ftyp' box in front of the 'moov' (it names the file type); the real one is not needed for reading the table of contents, so a plain one is put there.
  const ftyp = new Uint8Array([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0, 0x69, 0x73, 0x6f, 0x6d]);
  const joined = new Uint8Array(ftyp.length + moov.length);
  joined.set(ftyp, 0);
  joined.set(moov, ftyp.length);
  mp4.appendBuffer(MP4BoxBuffer.fromArrayBuffer(joined.buffer as ArrayBuffer, 0), true);
  try { mp4.flush(); } catch { /* nothing left to flush */ }
  if (!info || info.isFragmented) return null;
  const vt = info.videoTracks?.[0];
  if (!vt) return null;
  const at = info.audioTracks?.[0];
  const vSamples = (mp4.getTrackSamplesInfo(vt.id) as unknown as SampleLike[]).filter((s) => s.size > 0);
  const aSamples = at ? (mp4.getTrackSamplesInfo(at.id) as unknown as SampleLike[]).filter((s) => s.size > 0) : [];
  if (!vSamples.length) return null;

  const first = vSamples.reduce((m, s) => Math.min(m, s.cts / s.timescale), Infinity);
  const last = vSamples.reduce((m, s) => Math.max(m, (s.cts + s.duration) / s.timescale), 0);
  const durationSec = Math.max(0.1, last - first, 0);
  const codedWidth = vt.video?.width || vt.track_width || 0;
  const codedHeight = vt.video?.height || vt.track_height || 0;
  if (!codedWidth || !codedHeight) return null;
  const rotation = rotationOf(vt.matrix);
  const swap = rotation === 90 || rotation === 270;
  const videoBytes = vSamples.reduce((n, s) => n + s.size, 0);
  const audioBytes = aSamples.reduce((n, s) => n + s.size, 0);

  let videoDescription: Uint8Array | undefined;
  let audioSpecificConfig: Uint8Array | undefined;
  try {
    const trak = mp4.getTrackById(vt.id) as any;
    for (const entry of trak.mdia.minf.stbl.stsd.entries as any[]) {
      const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
      if (box) {
        const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
        box.write(stream);
        videoDescription = new Uint8Array(stream.buffer.slice(8, stream.getPosition()));
        break;
      }
    }
    if (at) {
      const atrak = mp4.getTrackById(at.id) as any;
      const entry = atrak.mdia.minf.stbl.stsd.entries[0] as any;
      const esds = entry.esds || entry.esdss?.[0];
      const dsi = findDescriptor(esds?.esd, 5);
      if (dsi?.data?.length) audioSpecificConfig = new Uint8Array(dsi.data);
    }
  } catch {
    /* handled below: a missing description means this video cannot be re-encoded */
  }

  return {
    probe: {
      durationSec,
      width: swap ? codedHeight : codedWidth,
      height: swap ? codedWidth : codedHeight,
      rotation,
      fps: vSamples.length / durationSec,
      codec: vt.codec,
      videoBytes,
      videoBps: (videoBytes * 8) / durationSec,
      audio: at ? { codec: at.codec, sampleRate: at.audio?.sample_rate || 44100, channels: at.audio?.channel_count || 2, bytes: audioBytes, bps: (audioBytes * 8) / durationSec } : null
    },
    videoId: vt.id,
    vSamples,
    aSamples,
    videoDescription,
    audioSpecificConfig,
    codedWidth,
    codedHeight
  };
}

/** Length, shape, codecs of a local video, without playing it (so it also works for formats the browser cannot show). Null when unknown. Never throws. */
export async function probeVideo(file: Blob): Promise<VideoProbe | null> {
  try {
    return (await openMovie(file))?.probe ?? null;
  } catch {
    return null;
  }
}

/** Reads pieces of a big file: a window of a few MB at a time, so the video's own interleaving of picture and sound costs one read, not thousands. */
class WindowReader {
  private start = 0;
  private buf: Uint8Array | null = null;
  constructor(private file: Blob, private windowSize = 4 * 1024 * 1024) {}
  async read(offset: number, size: number): Promise<Uint8Array> {
    const end = offset + size;
    if (!this.buf || offset < this.start || end > this.start + this.buf.length) {
      const len = Math.min(Math.max(this.windowSize, size), this.file.size - offset);
      this.buf = new Uint8Array(await this.file.slice(offset, offset + len).arrayBuffer());
      this.start = offset;
    }
    return this.buf.subarray(offset - this.start, end - this.start);
  }
}

function h264Candidates(pixels: number): string[] {
  if (pixels <= 921_600) return ['avc1.64001f', 'avc1.4d001f', 'avc1.42001f'];
  if (pixels <= 2_097_152) return ['avc1.640028', 'avc1.4d0028', 'avc1.64002a', 'avc1.42001f'];
  return ['avc1.640033', 'avc1.64002a', 'avc1.640028'];
}

export interface TranscodeOptions {
  targetBytes?: number;
  /** Files up to this size are returned as they are (default 6 MB). */
  skipBelowBytes?: number;
  /** 0..1 */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface TranscodeResult {
  file: File;
  plan: EncodingPlan;
  probe: VideoProbe;
  /** true: the original is returned as it is (it was already small and light). */
  unchanged: boolean;
}

const STALL_MS = 60_000;

async function encodeOnce(file: Blob, opened: Opened, plan: EncodingPlan, videoBps: number, opts: TranscodeOptions): Promise<ArrayBuffer> {
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
  const { probe } = opened;
  const audioOk = !!probe.audio && /^mp4a\.40\./i.test(probe.audio.codec) && !!opened.audioSpecificConfig;
  if (probe.audio && !audioOk) throw new TranscodeUnsupported('The sound of this video is in a format that cannot be copied.');
  if (!opened.videoDescription && !/^(vp0?8|vp0?9|av01)/i.test(probe.codec)) throw new TranscodeUnsupported('The picture of this video has no description to decode it with.');

  // Decoder
  const decoderConfig: VideoDecoderConfig = { codec: probe.codec, codedWidth: opened.codedWidth, codedHeight: opened.codedHeight, ...(opened.videoDescription ? { description: opened.videoDescription } : {}) };
  const decSupport = await VideoDecoder.isConfigSupported(decoderConfig).catch(() => null);
  if (!decSupport?.supported) throw new TranscodeUnsupported('This phone cannot play this video\'s format.');

  // Encoder
  const pixels = plan.width * plan.height;
  let encoderConfig: VideoEncoderConfig | null = null;
  for (const codec of h264Candidates(pixels)) {
    const cfg = { codec, width: plan.width, height: plan.height, bitrate: Math.round(videoBps), framerate: plan.fps, latencyMode: 'quality', bitrateMode: 'variable', avc: { format: 'avc' } } as VideoEncoderConfig;
    const sup = await VideoEncoder.isConfigSupported(cfg).catch(() => null);
    if (sup?.supported) { encoderConfig = cfg; break; }
  }
  if (!encoderConfig) throw new TranscodeUnsupported('This phone cannot make the smaller video.');

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: plan.width, height: plan.height },
    ...(audioOk ? { audio: { codec: 'aac' as const, numberOfChannels: probe.audio!.channels, sampleRate: probe.audio!.sampleRate } } : {}),
    fastStart: 'in-memory',
    firstTimestampBehavior: 'cross-track-offset'
  });
  const audioMeta: EncodedAudioChunkMetadata | undefined = audioOk
    ? { decoderConfig: { codec: 'mp4a.40.2', sampleRate: probe.audio!.sampleRate, numberOfChannels: probe.audio!.channels, description: opened.audioSpecificConfig } }
    : undefined;

  // Failure + stall guard: any error from the decoder or encoder, a stop of more than a minute without progress, or the caller's cancel
  let fail!: (e: unknown) => void;
  const failed = new Promise<never>((_, reject) => { fail = reject; });
  failed.catch(() => undefined);
  let failure: unknown = null;
  const setFailure = (e: unknown) => { if (!failure) { failure = e instanceof Error ? e : new Error(String(e)); fail(failure); } };
  const guard = <T,>(p: Promise<T>): Promise<T> => Promise.race([p, failed]);
  let lastActivity = performance.now();
  const stallTimer = setInterval(() => { if (performance.now() - lastActivity > STALL_MS) setFailure(new Error('The video stopped being processed.')); }, 2000);
  const onAbort = () => setFailure(new DOMException('Cancelled', 'AbortError'));
  if (opts.signal) { if (opts.signal.aborted) onAbort(); else opts.signal.addEventListener('abort', onAbort, { once: true }); }

  let wake: { release: () => Promise<void> } | null = null;
  try { wake = await (navigator as any).wakeLock?.request?.('screen'); } catch { wake = null; }

  const canvas: OffscreenCanvas | HTMLCanvasElement = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(plan.width, plan.height) : Object.assign(document.createElement('canvas'), { width: plan.width, height: plan.height });
  const ctx = canvas.getContext('2d', { alpha: false }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!ctx) throw new TranscodeUnsupported('No drawing surface is available.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const frameUs = 1e6 / plan.fps;
  const keyEvery = Math.max(1, Math.round(plan.fps * 2));
  let nextUs = -Infinity;
  let emitted = 0;
  let encoder: VideoEncoder | null = null;
  let decoder: VideoDecoder | null = null;

  const drawRotated = (frame: VideoFrame) => {
    const w = plan.width, h = plan.height;
    ctx.save();
    switch (probe.rotation) {
      case 90: ctx.translate(w, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(frame as unknown as CanvasImageSource, 0, 0, h, w); break;
      case 180: ctx.translate(w, h); ctx.rotate(Math.PI); ctx.drawImage(frame as unknown as CanvasImageSource, 0, 0, w, h); break;
      case 270: ctx.translate(0, h); ctx.rotate(-Math.PI / 2); ctx.drawImage(frame as unknown as CanvasImageSource, 0, 0, h, w); break;
      default: ctx.drawImage(frame as unknown as CanvasImageSource, 0, 0, w, h);
    }
    ctx.restore();
  };

  const onFrame = (frame: VideoFrame) => {
    try {
      if (failure) return;
      lastActivity = performance.now();
      const ts = frame.timestamp;
      if (ts < nextUs - frameUs * 0.25) return; // the frame rate is lower than the original's: this frame is skipped
      nextUs = (Number.isFinite(nextUs) && ts - nextUs < frameUs * 2 ? nextUs : ts) + frameUs;
      const key = emitted % keyEvery === 0;
      emitted++;
      if (probe.rotation === 0 && frame.displayWidth === plan.width && frame.displayHeight === plan.height) {
        encoder!.encode(frame, { keyFrame: key });
      } else {
        drawRotated(frame);
        const out = new VideoFrame(canvas as unknown as CanvasImageSource, { timestamp: ts, duration: Math.round(frameUs) });
        try { encoder!.encode(out, { keyFrame: key }); } finally { out.close(); }
      }
    } catch (e) {
      setFailure(e);
    } finally {
      frame.close();
    }
  };

  try {
    encoder = new VideoEncoder({
      output: (chunk, meta) => { lastActivity = performance.now(); try { muxer.addVideoChunk(chunk, meta); } catch (e) { setFailure(e); } },
      error: (e) => setFailure(e)
    });
    encoder.configure(encoderConfig);
    decoder = new VideoDecoder({ output: onFrame, error: (e) => setFailure(e) });
    decoder.configure(decoderConfig);

    const vReader = new WindowReader(file);
    const aReader = new WindowReader(file);
    let ai = 0;
    const feedAudio = async (untilSec: number) => {
      if (!audioOk) return;
      while (ai < opened.aSamples.length) {
        const s = opened.aSamples[ai];
        const t = s.cts / s.timescale;
        if (t > untilSec) break;
        const data = await guard(aReader.read(s.offset, s.size));
        muxer.addAudioChunkRaw(new Uint8Array(data), 'key', Math.round(t * 1e6), Math.round((s.duration * 1e6) / s.timescale), audioMeta);
        ai++;
      }
    };

    const firstTs = opened.vSamples.reduce((m, s) => Math.min(m, s.cts / s.timescale), Infinity);
    let seenKey = false;
    for (let i = 0; i < opened.vSamples.length; i++) {
      if (failure) throw failure;
      while (decoder.decodeQueueSize > 10 || encoder.encodeQueueSize > 10) {
        await guard(new Promise<void>((r) => setTimeout(r, 2)));
        if (failure) throw failure;
      }
      const s = opened.vSamples[i];
      if (!seenKey && !s.is_sync) continue;
      seenKey = true;
      const data = await guard(vReader.read(s.offset, s.size));
      decoder.decode(new EncodedVideoChunk({ type: s.is_sync ? 'key' : 'delta', timestamp: Math.round((s.cts * 1e6) / s.timescale), duration: Math.round((s.duration * 1e6) / s.timescale), data }));
      lastActivity = performance.now();
      await feedAudio(s.cts / s.timescale + 0.5);
      if (opts.onProgress && (i & 15) === 0) opts.onProgress(Math.min(0.99, (s.cts / s.timescale - firstTs) / probe.durationSec));
    }
    await guard(decoder.flush());
    await guard(encoder.flush());
    await feedAudio(Infinity);
    if (failure) throw failure;
    muxer.finalize();
    opts.onProgress?.(1);
    return target.buffer;
  } finally {
    clearInterval(stallTimer);
    opts.signal?.removeEventListener('abort', onAbort);
    try { decoder?.close(); } catch { /* already closed */ }
    try { encoder?.close(); } catch { /* already closed */ }
    try { void wake?.release(); } catch { /* ignore */ }
  }
}

/** Re-encodes a video so it fits `targetBytes` (default 48 MB) with as little visible change as the size allows. See the notes at the top of the file for what it throws. */
export async function transcodeVideo(file: File, opts: TranscodeOptions = {}): Promise<TranscodeResult> {
  if (!canTranscode()) throw new TranscodeUnsupported('This browser cannot re-encode video.');
  const opened = await openMovie(file);
  if (!opened) throw new TranscodeUnsupported('This is not a video file this code can read.');
  const { probe } = opened;
  const target = opts.targetBytes ?? MAX_UPLOAD_BYTES;
  const plan = planEncoding({
    durationSec: probe.durationSec,
    width: probe.width,
    height: probe.height,
    fps: probe.fps,
    audioBytes: probe.audio?.bytes ?? 0,
    sourceBytes: file.size,
    sourceVideoBps: probe.videoBps,
    targetBytes: target,
    smallBytes: opts.skipBelowBytes
  });
  if (!plan.fits) throw new VideoTooLongError(probe.durationSec, maxSecondsThatFit(probe.audio?.bps ?? 128_000, target));
  if (!plan.transcode) return { file, plan, probe, unchanged: true };

  let bps = plan.videoBps;
  let buffer = await encodeOnce(file, opened, plan, bps, opts);
  // The encoder aims at the bitrate but may overshoot; once more, lower, if the file is over the limit
  if (buffer.byteLength > target) {
    const audioBytes = probe.audio?.bytes ?? 0;
    const pictureNow = Math.max(1, buffer.byteLength - audioBytes);
    const pictureWanted = Math.max(1, target * 0.94 - audioBytes);
    bps = Math.max(80_000, Math.floor(bps * (pictureWanted / pictureNow)));
    buffer = await encodeOnce(file, opened, plan, bps, opts);
    if (buffer.byteLength > target) throw new VideoTooLongError(probe.durationSec, maxSecondsThatFit(probe.audio?.bps ?? 128_000, target));
  }
  const name = (file.name || 'video').replace(/\.[^/.]+$/, '') + '.mp4';
  return { file: new File([buffer], name, { type: 'video/mp4', lastModified: Date.now() }), plan: { ...plan, videoBps: bps }, probe, unchanged: false };
}

