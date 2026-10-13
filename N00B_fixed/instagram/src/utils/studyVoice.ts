// NOOB STUDY: speaking with the tutor. Listening uses the device's own speech recognition when it has one (free, instant, the student sees and can
// fix the words), or a short recording sent for transcription when the server has that switched on. Reading aloud uses the device's own voices.
// Nothing is recorded unless the student taps the microphone, and nothing is kept: the sound is turned into words and thrown away.

export interface VoiceInfo { name: string; lang: string; default?: boolean; localService?: boolean }

export function recognitionCtor(): any | null {
  const w = typeof window !== 'undefined' ? (window as any) : null;
  return w ? w.SpeechRecognition || w.webkitSpeechRecognition || null : null;
}
export const canRecognize = (): boolean => !!recognitionCtor();
export const canSpeak = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof (window as any).SpeechSynthesisUtterance === 'function';
export const canRecord = (): boolean => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof (globalThis as any).MediaRecorder === 'function';

// What went wrong, in words a student can act on
export function describeVoiceError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
    case 'NotAllowedError': return 'The microphone is switched off for NOOB. You can turn it on in your browser or phone settings, or just type.';
    case 'no-speech': return 'I did not hear anything. Tap the microphone and try again.';
    case 'audio-capture':
    case 'NotFoundError': return 'No microphone was found on this device.';
    case 'network': return 'Voice typing needs the internet. Please check your connection, or type your question.';
    case 'aborted': return '';
    case 'unsupported': return 'Voice typing is not available in this browser. You can type your question.';
    default: return 'Voice typing did not work this time. Please try again or type.';
  }
}

// the best voice for a language (a voice the student chose first; else an exact match; else the same language; never a random other one)
export function pickVoice<T extends VoiceInfo>(voices: T[], lang: string, preferred?: string | null): T | null {
  if (preferred) { const v = voices.find((x) => x.name === preferred); if (v) return v; }
  const norm = (l: string) => l.toLowerCase().replace('_', '-');
  const want = norm(lang);
  const exact = voices.filter((v) => norm(v.lang) === want);
  const base = voices.filter((v) => norm(v.lang).split('-')[0] === want.split('-')[0]);
  const pool = exact.length ? exact : base;
  if (!pool.length) return null;
  return pool.find((v) => v.localService) || pool.find((v) => v.default) || pool[0];
}

const GREEK: Record<string, string> = { alpha: 'alpha', beta: 'beta', gamma: 'gamma', delta: 'delta', theta: 'theta', lambda: 'lambda', mu: 'mu', pi: 'pi', sigma: 'sigma', omega: 'omega', Delta: 'delta', Omega: 'omega', epsilon: 'epsilon', rho: 'rho', phi: 'phi' };
// Maths and Markdown are not read out symbol by symbol: "\frac{a}{b}" becomes "a over b", code is skipped, links are just their words.
export function cleanForSpeech(md: string): string {
  let t = String(md || '');
  t = t.replace(/```[\s\S]*?```/g, ' (a code example is shown on screen) ');
  t = t.replace(/\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|(?<![\p{L}\p{N}])\$([^$\n]{1,200}?)\$(?!\d)/gu, (_m, a, b, c, d) => ' ' + speakMath(a ?? b ?? c ?? d ?? '') + ' ');
  t = t.replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, '$1').replace(/`([^`]*)`/g, '$1').replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/^\s*>\s?/gm, '')
    .replace(/^\s*([-*+]|\d+[.)])\s+/gm, '').replace(/[*_~]{1,3}/g, '').replace(/\|/g, ' ').replace(/^-{3,}$/gm, '').replace(/\s*\n\s*/g, '. ').replace(/\s{2,}/g, ' ');
  return t.replace(/\.\s*\./g, '.').trim().slice(0, 4000);
}
function speakMath(m: string): string {
  let t = m;
  for (let k = 0; k < 4; k++) t = t.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1 over $2').replace(/\\sqrt\s*\{([^{}]*)\}/g, 'square root of $1');
  t = t.replace(/\^\s*\{?2\}?/g, ' squared').replace(/\^\s*\{?3\}?/g, ' cubed').replace(/\^\s*\{([^{}]*)\}/g, ' to the power $1').replace(/\^\s*(\w)/g, ' to the power $1')
    .replace(/_\s*\{([^{}]*)\}/g, ' $1').replace(/_\s*(\w)/g, ' $1')
    .replace(/\\times|\\cdot/g, ' times ').replace(/\\div/g, ' divided by ').replace(/\\pm/g, ' plus or minus ').replace(/\\approx/g, ' is about ').replace(/\\neq/g, ' is not equal to ')
    .replace(/\\leq?/g, ' is less than or equal to ').replace(/\\geq?/g, ' is greater than or equal to ').replace(/\\rightarrow|\\to/g, ' gives ').replace(/\\infty/g, ' infinity ')
    .replace(/\\(?:text|mathrm|mathbf|operatorname)\s*\{([^{}]*)\}/g, ' $1 ').replace(/\\([A-Za-z]+)/g, (_x, n) => ' ' + (GREEK[n] || n) + ' ')
    .replace(/=/g, ' equals ').replace(/\+/g, ' plus ').replace(/(?<=\w)\s*-\s*(?=\w)/g, ' minus ').replace(/\//g, ' divided by ').replace(/[{}]/g, ' ');
  return t.replace(/\s{2,}/g, ' ').trim();
}

// speech engines stop mid-way on long text: it is read in sentence-sized pieces
export function speechChunks(text: string, max = 180): string[] {
  const sentences = String(text || '').split(/(?<=[.!?।॥])\s+/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (s.length > max) {
      if (cur) { out.push(cur); cur = ''; }
      const words = s.split(/\s+/);
      let piece = '';
      for (const w of words) { if ((piece + ' ' + w).trim().length > max) { out.push(piece.trim()); piece = w; } else piece = (piece + ' ' + w).trim(); }
      if (piece) out.push(piece);
      continue;
    }
    if ((cur + ' ' + s).trim().length > max) { out.push(cur); cur = s; } else cur = (cur + ' ' + s).trim();
  }
  if (cur) out.push(cur);
  return out;
}

// ---- listening with the device's own recognition
export interface ListenCallbacks { onText: (text: string, final: boolean) => void; onEnd: () => void; onError: (code: string) => void }
export interface Listener { stop: () => void }
export function listen(lang: string, cb: ListenCallbacks): Listener | null {
  const Ctor = recognitionCtor();
  if (!Ctor) { cb.onError('unsupported'); return null; }
  const rec = new Ctor();
  rec.lang = lang; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  let finalText = '';
  rec.onresult = (e: any) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript + ' '; else interim += r[0].transcript;
    }
    cb.onText((finalText + interim).trim(), !interim);
  };
  rec.onerror = (e: any) => cb.onError(String(e?.error || 'error'));
  rec.onend = () => cb.onEnd();
  try { rec.start(); } catch { cb.onError('error'); return null; }
  return { stop: () => { try { rec.stop(); } catch { /* already stopped */ } } };
}

// ---- recording a few seconds for server transcription (only when the device has no recognition of its own)
export interface RecorderHandle { stop: () => Promise<{ base64: string; mime: string } | null>; cancel: () => void }
export async function record(maxMs = 45_000): Promise<RecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const MR: any = (globalThis as any).MediaRecorder;
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MR.isTypeSupported?.(m)) || '';
  const rec = new MR(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e: BlobEvent) => { if (e.data && e.data.size) chunks.push(e.data); };
  const off = () => stream.getTracks().forEach((t) => t.stop());   // the microphone light goes off the moment this ends
  const timer = setTimeout(() => { try { rec.stop(); } catch { /* done */ } }, maxMs);
  rec.start();
  return {
    cancel: () => { clearTimeout(timer); try { rec.stop(); } catch { /* done */ } off(); },
    stop: () => new Promise((resolve) => {
      clearTimeout(timer);
      rec.onstop = async () => {
        off();
        if (!chunks.length) return resolve(null);
        const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        resolve({ base64: btoa(bin), mime: blob.type || 'audio/webm' });
      };
      try { rec.stop(); } catch { off(); resolve(null); }
    })
  };
}

// ---- reading aloud
let speaking = false;
export const isSpeaking = (): boolean => speaking;
export function speak(text: string, lang: string, opts: { preferredVoice?: string | null; rate?: number; pitch?: number; onEnd?: () => void } = {}): void {
  if (!canSpeak()) { opts.onEnd?.(); return; }
  stopSpeaking();
  const chunks = speechChunks(cleanForSpeech(text));
  if (!chunks.length) { opts.onEnd?.(); return; }
  const synth = window.speechSynthesis;
  const voice = pickVoice(synth.getVoices() as unknown as VoiceInfo[], lang, opts.preferredVoice) as unknown as SpeechSynthesisVoice | null;
  speaking = true;
  chunks.forEach((c, i) => {
    const u = new SpeechSynthesisUtterance(c);
    u.lang = voice?.lang || lang; if (voice) u.voice = voice; u.rate = opts.rate || 0.95; u.pitch = opts.pitch || 1;
    u.onend = () => { if (i === chunks.length - 1) { speaking = false; opts.onEnd?.(); } };
    u.onerror = () => { speaking = false; opts.onEnd?.(); };
    synth.speak(u);
  });
}
export function stopSpeaking(): void {
  speaking = false;
  try { if (canSpeak()) window.speechSynthesis.cancel(); } catch { /* nothing was speaking */ }
}
