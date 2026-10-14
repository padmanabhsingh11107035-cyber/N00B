// How the NOOB AI support assistant SPEAKS (in the voice call). Three jobs, kept apart from the screen so they can be tested:
//   1. prepareSpeech: turn the written answer into words a voice should say (no markdown, emoji, links; "NOOB" is a word, not four letters; "Rs 450" is
//      "450 rupees"; "end-to-end" is "end to end"),
//   2. splitForSpeech: cut it into short natural pieces with NO punctuation inside them (so no voice can ever read "comma" or "full stop" aloud) and a
//      pause length between them (so it still breathes like a person),
//   3. pickBestVoice / createSpeaker: choose the most human voice the phone has for the language of each piece, and say the pieces one after another.
// (No regex "look-behind" is used anywhere in this file: older iPhones refuse to load a page that contains one.)

// ---------------------------------------------------------------------------------------------------------------- 1. the words
// capital-letter words that ARE said letter by letter, written with spaces so every voice does it the same way
const SPELLED = ['AI', 'OTP', 'FAQ', 'PIN', 'UPI', 'ID', 'SMS', 'URL', 'PDF', 'USB', 'APK', 'GIF', 'QR', 'VPN', 'OS', 'UI', 'FB', 'IG', 'UK', 'USA', 'UAE', 'EU', 'TV', 'PC', 'HD', 'CEO', 'KYC', 'EMI', 'ATM', 'GST', 'API', 'NFC', 'DM'];
const spell = (w: string): string => w.split('').join(' ');
const NUM = '(\\d+(?:,\\d{3})*(?:\\.\\d+)?)';

export function prepareSpeech(input: string): string {
  let t = String(input ?? '');
  t = t.replace(/```[\s\S]*?```/g, ' ');
  t = t.replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, '$1');                                   // [text](link) -> text
  t = t.replace(/\bhttps?:\/\/\S+/gi, ' ').replace(/\bwww\.\S+/gi, ' ');                // links are never read out
  // abbreviations are said as the words they stand for (and their dots must not end a sentence)
  t = t.replace(/\be\.\s?g\./gi, 'for example').replace(/\bi\.\s?e\./gi, 'that is').replace(/\bvs\.?(?=\s)/gi, 'versus').replace(/\b(?:approx|approx\.)(?=\s)/gi, 'approximately')
    .replace(/\bMr\./g, 'Mister').replace(/\bMrs\./g, 'Missus').replace(/\bMs\./g, 'Miss').replace(/\bDr\./g, 'Doctor').replace(/\b([ap])\.m\./gi, '$1 m')
    .replace(/\betc\.(\s+(?=[A-Z\u0900-\u097F]))/g, 'and so on.$1').replace(/\betc\.?/gi, 'and so on');
  t = t.replace(/\(user id:[^)]*\)/gi, ' ').replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ' ');   // raw ids
  t = t.replace(/[\p{Extended_Pictographic}️‍⃣]/gu, ' ');              // emoji
  t = t.replace(/[’‘`´]/g, "'").replace(/[“”«»„]/g, '"');
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/^\s*>\s?/gm, '').replace(/^\s*([-*•·▪▸►]|\d+[.)])\s+/gm, '');   // headings, quotes, list marks
  t = t.replace(/[*_~|^]/g, ' ');                                                      // bold, italic, tables
  // money, percent, and the little symbols that voices either skip or read aloud by name
  t = t.replace(new RegExp('(?:₹|\\b(?:Rs\\.?|INR))\\s?' + NUM, 'gi'), '$1 rupees');
  t = t.replace(new RegExp('\\$\\s?' + NUM, 'g'), '$1 dollars');
  t = t.replace(/(\d)\s?%/g, '$1 percent');
  t = t.replace(/#(\d)/g, 'number $1');
  t = t.replace(/@(\w+)/g, (_m, n: string) => 'at ' + n.replace(/_/g, ' '));
  t = t.replace(/\b24\s?\/\s?7\b/g, '24 by 7');
  t = t.replace(/(\d)\s?\/\s?(\d)/g, '$1 by $2');
  t = t.replace(/\s&\s|&/g, ' and ').replace(/\s=\s|=/g, ' equals ');
  t = t.replace(/(^|[\s(])\+(?=\d)/g, '$1plus ').replace(/\s\+\s/g, ' plus ');
  t = t.replace(/(^|\s)-(?=\d)/g, '$1minus ');
  // numbers: 10,000,000 is one number (a comma inside it must not become a pause)
  for (let i = 0; i < 4; i++) t = t.replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
  // words written in capitals: "NOOB" is said as a word; real abbreviations are spelled out; longer capitals are just emphasis
  t = t.replace(/\bok\b/gi, 'okay');
  // A short word in capitals (NO, YES, NOT, ALL, NEW) is just that word said loudly, never its letters. Only the abbreviations listed above, and
  // capitals with no vowel at all (CCTV, SMS), are spelled out.
  t = t.replace(/\b[A-Z]{2,}\b/g, (w) => (w === 'NOOB' ? 'Noob' : SPELLED.includes(w) ? spell(w) : /[AEIOUY]/.test(w) ? w.charAt(0) + w.slice(1).toLowerCase() : spell(w)));
  // dashes and brackets
  t = t.replace(/\s[-–—]+\s/g, ', ').replace(/[–—]/g, ', ');
  t = t.replace(/(\p{L})-(?=\p{L})/gu, '$1 ');                                         // end-to-end -> end to end
  t = t.replace(/_/g, ' ').replace(/[(){}\[\]<>"\\/]/g, ' ');
  t = t.replace(/…|\.{2,}/g, ', ');
  t = t.replace(/[।॥]/g, '. ');
  t = t.replace(/(\d)-(?=\d)/g, '$1 to ');                                            // 10-20 -> 10 to 20
  // whatever symbol is still left on its own would be read out by name ("at", "hash", "dash"): only letters, numbers and the marks handled below stay
  t = t.replace(/[#@₹$%^`~|+=\-]/g, ' ');
  t = t.split('').map((c, i, a) => (c === "'" && !(/\p{L}/u.test(a[i - 1] || '') && /\p{L}/u.test(a[i + 1] || '')) ? ' ' : c)).join('');   // an apostrophe only inside a word
  t = t.replace(/[^\p{L}\p{M}\p{N}\s.,;:!?']/gu, ' ');                             // anything else (emoji of every kind, ticks, stars, arrows, signs) is not said
  t = t.replace(/\n+/g, '. ');
  return t.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').replace(/([,.;:!?])\1+/g, '$1').replace(/^[\s,.;:!?]+/, '').trim();
}

// ---------------------------------------------------------------------------------------------------------------- 2. the pieces
export interface Piece { text: string; pauseMs: number; question: boolean }
const LONG = 110;   // a sentence longer than this is also cut at its commas, the way a person would breathe
const isDigit = (c: string | undefined): boolean => !!c && c >= '0' && c <= '9';
// a "." "," ":" inside a number (3.5, 9:30) is part of the number, not a mark
const insideNumber = (s: string, i: number): boolean => isDigit(s[i - 1]) && isDigit(s[i + 1]);

// no voice can read a punctuation mark that is not there: only the dot inside a number (3.5) and the colon inside a time (9:30) stay
const stripMarks = (s: string): string => {
  let out = '';
  for (let i = 0; i < s.length; i++) out += '.,;:!?'.includes(s[i]) && !insideNumber(s, i) ? ' ' : s[i];
  return out.replace(/\s+/g, ' ').trim();
};

function sentencesOf(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    cur += ch;
    if ((ch === '.' || ch === '!' || ch === '?') && !(ch === '.' && insideNumber(text, i))) {
      while (i + 1 < text.length && '.!?'.includes(text[i + 1])) cur += text[++i];
      out.push(cur.trim());
      cur = '';
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}
function clausesOf(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if ((ch === ',' || ch === ';' || ch === ':') && !insideNumber(text, i)) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

export function splitForSpeech(prepared: string, maxLen = 220): Piece[] {
  const out: Piece[] = [];
  const text = String(prepared || '').trim();
  if (!text) return out;
  for (const sentence of sentencesOf(text)) {
    const end = /[.!?]+\s*$/.exec(sentence);
    const question = !!end && end[0].includes('?');
    const base = sentence.replace(/[.!?]+\s*$/, '');
    const clauses = base.length > LONG ? clausesOf(base) : [base];
    // join clauses that are too short to be said on their own with the next one
    const merged: string[] = [];
    for (const c of clauses) {
      if (merged.length && merged[merged.length - 1].length < 16) merged[merged.length - 1] += ' ' + c; else merged.push(c);
    }
    merged.forEach((c, i) => {
      let rest = stripMarks(c);
      if (!rest) return;
      // a very long clause with no comma: cut at a space near the limit
      while (rest.length > maxLen) {
        let cut = rest.lastIndexOf(' ', maxLen);
        if (cut < maxLen / 2) cut = maxLen;
        out.push({ text: rest.slice(0, cut).trim(), pauseMs: 60, question: false });
        rest = rest.slice(cut).trim();
      }
      const last = i === merged.length - 1;
      out.push({ text: rest, pauseMs: last ? 380 : 170, question: last && question });
    });
  }
  if (out.length) out[out.length - 1].pauseMs = 0;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- the language of a piece
const SCRIPTS: Array<[RegExp, string]> = [
  [/[ऀ-ॿ]/, 'hi-IN'], [/[઀-૿]/, 'gu-IN'], [/[஀-௿]/, 'ta-IN'], [/[ఀ-౿]/, 'te-IN'], [/[ঀ-৿]/, 'bn-IN'],
  [/[਀-੿]/, 'pa-IN'], [/[ಀ-೿]/, 'kn-IN'], [/[ഀ-ൿ]/, 'ml-IN'], [/[؀-ۿ]/, 'ar-SA']
];
// the language of a piece: by its script; Roman letters are English (the Indian accent is the best match for Hinglish too)
export function languageOf(text: string, fallback = 'en-IN'): string {
  for (const [re, lang] of SCRIPTS) if (re.test(text)) return lang;
  return fallback;
}

// ---------------------------------------------------------------------------------------------------------------- 3. the voice
export interface VoiceLike { name: string; lang: string; localService?: boolean; default?: boolean }
const NOVELTY = /\b(bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|albert|fred|kathy|ralph|junior|princess|deranged|hysterical|pipe organ|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i;
const FEMALE = /\b(female|aria|jenny|neerja|heera|swara|samantha|aditi|veena|priya|lekha|kalpana|zira|sonia|libby|natasha|ava|allison|susan|karen|moira|tessa|kavya|ananya|raveena|sangeeta|meera|nova)\b/i;
const MALE = /\b(male|ravi|prabhat|david|mark|rishi|daniel|james|alex|tom|thomas|arthur|oliver|aaron|gordon)\b/i;
const norm = (l: string): string => String(l || '').toLowerCase().replace('_', '-');
const baseOf = (l: string): string => l.split('-')[0];

// a higher score is a more human voice for this language; -Infinity = not this language at all
export function scoreVoice(v: VoiceLike, lang: string): number {
  const vl = norm(v.lang), want = norm(lang);
  if (baseOf(vl) !== baseOf(want)) return -Infinity;
  let s = vl === want ? 50 : 25;
  if (/natural|neural|online/i.test(v.name)) s += 45;            // Microsoft's natural voices (the same family NOOB AI uses on its server)
  if (/premium|enhanced|siri/i.test(v.name)) s += 38;            // Apple's better voices
  if (/google/i.test(v.name)) s += 28;                           // Chrome and Android network voices
  if (/microsoft/i.test(v.name)) s += 8;
  if (v.localService === false) s += 8;                          // a network voice is usually fuller than a built-in one
  if (FEMALE.test(v.name)) s += 24;                              // NOOB's voice is a woman's voice
  if (MALE.test(v.name) && !FEMALE.test(v.name)) s -= 24;
  if (NOVELTY.test(v.name)) s -= 300;                            // never the funny voices
  if (baseOf(want) === 'en' && vl === 'en-in') s += 6;           // the Indian accent for NOOB's own people
  return s;
}
export function pickBestVoice<T extends VoiceLike>(voices: T[], lang: string): T | null {
  let best: T | null = null, top = -Infinity;
  for (const v of voices) { const s = scoreVoice(v, lang); if (s > top) { top = s; best = v; } }
  return top > -100 ? best : null;
}

// ---------------------------------------------------------------------------------------------------------------- the speaker
export interface SpeakerDeps {
  synth: { speak(u: any): void; cancel(): void; getVoices(): VoiceLike[]; resume?(): void; speaking?: boolean; pending?: boolean };
  Utterance: new (text: string) => any;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (id: unknown) => void;
}
export interface SpeakOptions {
  onStart?: () => void; onEnd?: () => void; onVoice?: (v: { name: string; lang: string }) => void; startDelayMs?: number; rate?: number; volume?: number; lang?: string;
  voiceName?: string | null;   // a voice the person chose: used for every piece it can speak (the same language); the best voice for the others
  pitch?: number;              // the person's own pitch
  exactRate?: boolean;         // use `rate` as it is (the person chose it) instead of keeping it at a calm pace
}

// Says a whole answer, piece by piece, each in the best voice the phone has for its language. stop() ends it at once (and does not call onEnd: the one
// who stopped it already knows). onEnd is called exactly once when the answer is finished, or when a voice fails or goes quiet, so the screen never
// waits for a voice that has gone silent.
export function createSpeaker(deps: SpeakerDeps) {
  let run = 0;
  const alive: any[] = [];   // the pieces being said are kept here: Chrome forgets to report the end of a piece whose object has been thrown away
  const timers = new Set<unknown>();
  const later = (fn: () => void, ms: number) => { const id = deps.setTimer(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
  const clearTimers = () => { timers.forEach((id) => deps.clearTimer(id)); timers.clear(); };

  const stop = () => { run++; clearTimers(); alive.length = 0; try { deps.synth.cancel(); } catch { /* nothing was speaking */ } };

  const speak = (written: string, opts: SpeakOptions = {}): boolean => {
    stop();
    const pieces = splitForSpeech(prepareSpeech(written));
    if (!pieces.length) { opts.onEnd?.(); return false; }
    const mine = run;
    let finished = false, started = false;
    const finish = () => { if (finished) return; finished = true; opts.onEnd?.(); };
    const voices = (() => { try { return deps.synth.getVoices() || []; } catch { return []; } })();
    const baseLang = opts.lang || 'en-IN';
    const rate = opts.rate ?? 1;

    const sayPiece = (i: number) => {
      if (mine !== run || finished) return;
      if (i >= pieces.length) { finish(); return; }
      const p = pieces[i];
      const lang = languageOf(p.text, baseLang);
      const chosen = opts.voiceName ? voices.find((v) => v.name === opts.voiceName && baseOf(norm(v.lang)) === baseOf(norm(lang))) : undefined;
      const voice = chosen || pickBestVoice(voices, lang);
      opts.onVoice?.({ name: voice?.name || 'the phone\'s own voice', lang: voice?.lang || lang });   // so the screen can show which voice is speaking
      let moved = false, began = false, retried = false;
      const next = () => { if (moved) return; moved = true; if (mine !== run) return; later(() => sayPiece(i + 1), p.pauseMs); };
      const build = () => {
        const u = new deps.Utterance(p.text);
        u.lang = lang;
        if (voice) { u.voice = voice; u.lang = voice.lang || lang; }
        u.rate = opts.exactRate ? rate : /natural|neural|online/i.test(voice?.name || '') ? Math.min(1.05, rate) : Math.min(0.97, rate);
        u.pitch = opts.pitch ?? (p.question ? 1.04 : 1);
        u.volume = opts.volume ?? 1;
        u.onstart = () => { began = true; if (!started && mine === run) { started = true; opts.onStart?.(); } };
        u.onend = () => { if (!retried || began) next(); };
        u.onerror = (e: any) => { if (e && (e.error === 'canceled' || e.error === 'interrupted')) return; next(); };
        alive.push(u);
        if (alive.length > 6) alive.shift();
        return u;
      };
      try { deps.synth.resume?.(); deps.synth.speak(build()); } catch { finish(); return; }
      // some engines never report the end of a piece: look at the real state now and then, so the answer still moves on
      const watch = (waited: number) => {
        if (moved || mine !== run) return;
        const busy = !!(deps.synth.speaking || deps.synth.pending);
        // asked, but nothing started and nothing is waiting: the phone let the request fall; ask once more (after waking its voice)
        if (!began && !busy && !retried && waited >= 1750) {
          retried = true;
          try { deps.synth.cancel(); deps.synth.resume?.(); deps.synth.speak(build()); } catch { finish(); return; }
          later(() => watch(waited + 250), 250);
          return;
        }
        if (!busy && (began || waited >= 2500)) { next(); return; }       // it was said (or never started, and is not waiting any more)
        if (!began && waited >= 12000) { next(); return; }                // a voice that has not started in 12 seconds is not going to
        if (waited >= 45000) { next(); return; }
        later(() => watch(waited + 250), 250);
      };
      later(() => watch(250), 250);
    };
    // with no delay the first piece is said right now, inside the very tap that started it (an iPhone only lets a page speak when a tap asked for it)
    const delay = Math.max(0, opts.startDelayMs ?? 0);
    if (delay > 0) later(() => sayPiece(0), delay); else sayPiece(0);
    return true;
  };

  return { speak, stop };
}
