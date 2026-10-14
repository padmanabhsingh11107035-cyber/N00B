// The Translator: turns TEXT that people wrote (captions, comments, bios, notes you type in) into the language the person chose. The app's own menus and buttons
// are handled by engine.ts; this is for everything else. It never touches pictures or videos (they are not text), it never stores anything on the
// server (the text is translated and handed back), and it never translates private chats on its own: those are end-to-end encrypted, so only the one
// message a person presses "Translate" on is sent.
//
// Two ways to use it:
//   * translateMany / translateOne: give it texts, get the translations back (the Translator page and any "translate this" button),
//   * startAutoTranslate: translates the text you can see on the screen, as you scroll, and puts the original back when it is switched off.
// (No regex look-behind anywhere in this file: older iPhones refuse to load a page with one.)
import { supabase } from '../services/supabase';
import { findLanguage, DEFAULT_LANGUAGE } from './languages.ts';
import { isAppText } from './engine.ts';

const FUNCTION_NAME = 'dynamic-handler';
const AUTO_KEY = 'noob_translate_content_v1';
const CACHE_PREFIX = 'noob_utx_v1_';
const CACHE_MAX = 600;
const BATCH_TEXTS = 12;
const BATCH_CHARS = 5000;
const MAX_TEXT = 1500;

// ---------------------------------------------------------------------------------------------------------------- which texts are worth translating
export type Script = 'latin' | 'devanagari' | 'gujarati' | 'tamil' | 'telugu' | 'bengali' | 'gurmukhi' | 'kannada' | 'malayalam' | 'arabic' | 'cyrillic' | 'greek' | 'thai' | 'hebrew' | 'cjk' | 'other';
const RANGES: [number, number, Script][] = [
  [0x0041, 0x024f, 'latin'], [0x1e00, 0x1eff, 'latin'], [0x0900, 0x097f, 'devanagari'], [0x0a80, 0x0aff, 'gujarati'], [0x0b80, 0x0bff, 'tamil'],
  [0x0c00, 0x0c7f, 'telugu'], [0x0980, 0x09ff, 'bengali'], [0x0a00, 0x0a7f, 'gurmukhi'], [0x0c80, 0x0cff, 'kannada'], [0x0d00, 0x0d7f, 'malayalam'],
  [0x0600, 0x06ff, 'arabic'], [0x0750, 0x077f, 'arabic'], [0x0400, 0x04ff, 'cyrillic'], [0x0370, 0x03ff, 'greek'], [0x0e00, 0x0e7f, 'thai'],
  [0x0590, 0x05ff, 'hebrew'], [0x3040, 0x30ff, 'cjk'], [0x3400, 0x4dbf, 'cjk'], [0x4e00, 0x9fff, 'cjk'], [0xac00, 0xd7af, 'cjk']
];
const isLetter = (ch: string): boolean => /\p{L}/u.test(ch);

/** The script most of the letters are written in. */
export function scriptOf(text: string): Script {
  const counts = new Map<Script, number>();
  for (const ch of text) {
    if (!isLetter(ch)) continue;
    const c = ch.codePointAt(0)!;
    let found: Script = 'other';
    for (const [a, b, name] of RANGES) if (c >= a && c <= b) { found = name; break; }
    counts.set(found, (counts.get(found) || 0) + 1);
  }
  let best: Script = 'other', top = 0;
  for (const [k, v] of counts) if (v > top) { top = v; best = k; }
  return best;
}

const TARGET_SCRIPT: Record<string, Script> = {
  hi: 'devanagari', mr: 'devanagari', ne: 'devanagari', sa: 'devanagari', doi: 'devanagari', kok: 'devanagari', mai: 'devanagari', gu: 'gujarati', ta: 'tamil', te: 'telugu',
  bn: 'bengali', as: 'bengali', pa: 'gurmukhi', kn: 'kannada', ml: 'malayalam', ar: 'arabic', ur: 'arabic', fa: 'arabic', ps: 'arabic', sd: 'arabic', ru: 'cyrillic', uk: 'cyrillic',
  bg: 'cyrillic', sr: 'cyrillic', be: 'cyrillic', mk: 'cyrillic', el: 'greek', th: 'thai', he: 'hebrew', iw: 'hebrew', zh: 'cjk', ja: 'cjk', ko: 'cjk'
};
export function targetScript(lang: string): Script {
  return TARGET_SCRIPT[String(lang || '').split('-')[0].toLowerCase()] || 'latin';
}

const ENGLISH = new Set(['the', 'and', 'is', 'to', 'of', 'in', 'it', 'you', 'that', 'for', 'on', 'with', 'this', 'are', 'was', 'i', 'my', 'me', 'be', 'have', 'so', 'but', 'not', 'what', 'we',
  'your', 'just', 'love', 'good', 'nice', 'great', 'thanks', 'thank', 'how', 'when', 'where', 'who', 'can', 'will', 'all', 'at', 'from', 'they', 'he', 'she', 'his', 'her', 'our', 'about',
  'out', 'up', 'if', 'do', 'no', 'yes', 'very', 'too', 'much', 'more', 'like', 'get', 'got', 'had', 'has', 'were', 'been', 'would', 'could', 'should', 'there', 'here', 'now', 'today', 'day',
  'happy', 'birthday', 'wow', 'best', 'amazing', 'beautiful', 'awesome', 'bro', 'guys', 'video', 'post', 'follow', 'new', 'one', 'time', 'life', 'friends', 'friend', 'always', 'never', 'really']);

/** Does this text look like it is English already? (a quick guess, only used to avoid translating English into English) */
export function looksEnglish(text: string): boolean {
  const words = text.toLowerCase().match(/[a-z']+/g) || [];
  if (!words.length) return false;
  const hits = words.filter((w) => ENGLISH.has(w)).length;
  return hits >= 2 && hits / words.length >= 0.2 ? true : words.length <= 3 && hits >= 1;
}

/** Is this text already in the language it would be translated to (so nothing needs to be done)? */
export function alreadyInLanguage(text: string, lang: string): boolean {
  const base = String(lang || DEFAULT_LANGUAGE).split('-')[0].toLowerCase();
  const mine = scriptOf(text);
  const want = targetScript(base);
  if (mine === 'other') return true;                        // no letters we can read: nothing to translate
  if (mine !== want) return false;                          // another script than the language uses: it needs translating
  if (want !== 'latin') return true;                        // same non-Latin script: already there
  return base === 'en' ? looksEnglish(text) : false;      // Latin to Latin: for English a guess; other languages are left to the translator ("unchanged" if already)
}

/** Is it a piece of writing worth sending to the translator (not a number, a link, a @name, a time, a single word)? */
export function worthTranslating(text: string, opts: { minWords?: number } = {}): boolean {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length < 2 || t.length > MAX_TEXT) return false;
  const letters = Array.from(t).filter(isLetter).length;
  if (letters < 2 || letters / t.length < 0.4) return false;
  if (/^(https?:\/\/|www\.)\S+$/i.test(t) || /^[@#][\w.]+$/.test(t)) return false;
  if (/^\d{1,2}[:.]\d{2}\s?(am|pm)?$/i.test(t)) return false;
  const words = t.split(' ').length;
  return words >= (opts.minWords ?? 1);
}

// ---------------------------------------------------------------------------------------------------------------- the saved copy
const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
/** A short fingerprint of a text (FNV-1a), so the saved copy does not keep the whole text as a key. */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  const t = norm(text);
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36) + '.' + t.length.toString(36);
}

const memory = new Map<string, Map<string, string>>();
function cacheFor(lang: string): Map<string, string> {
  let m = memory.get(lang);
  if (m) return m;
  m = new Map();
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_PREFIX + lang) || 'null');
    if (Array.isArray(raw)) for (const [k, v] of raw) if (typeof k === 'string' && typeof v === 'string') m.set(k, v);
  } catch { /* nothing saved, or damaged */ }
  memory.set(lang, m);
  return m;
}
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function saveSoon(lang: string) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const m = cacheFor(lang);
      while (m.size > CACHE_MAX) m.delete(m.keys().next().value as string);      // the oldest go first
      localStorage.setItem(CACHE_PREFIX + lang, JSON.stringify(Array.from(m.entries())));
    } catch { /* storage full or blocked: the translations still work for now */ }
  }, 1200);
}
export function clearTranslationCache(): void {
  memory.clear();
  try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k); } } catch { /* nothing saved */ }
}

// ---------------------------------------------------------------------------------------------------------------- asking the server
export interface BatchReply { translations: (string | null)[]; busy: boolean }

/** One call: up to BATCH_TEXTS texts at a time. `busy` = the server said "not now" (too many requests, translator unavailable). */
export async function requestBatch(lang: string, texts: string[]): Promise<BatchReply> {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body: { action: 'translate-batch', lang, texts } });
  if (error) {
    const status = (error as any)?.context?.status;
    if (status === 429 || status === 503 || status === 502 || status === 504) return { translations: texts.map(() => null), busy: true };
    throw new Error(error.message);
  }
  const list = Array.isArray((data as any)?.translations) ? ((data as any).translations as unknown[]) : [];
  return { translations: texts.map((_, i) => (typeof list[i] === 'string' && (list[i] as string).trim() ? (list[i] as string).trim() : null)), busy: !!(data as any)?.busy };
}

export function chunkTexts(texts: string[], maxTexts = BATCH_TEXTS, maxChars = BATCH_CHARS): string[][] {
  const out: string[][] = [];
  let cur: string[] = [], size = 0;
  for (const t of texts) {
    if (cur.length && (cur.length >= maxTexts || size + t.length > maxChars)) { out.push(cur); cur = []; size = 0; }
    cur.push(t); size += t.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

export interface ManyResult { translations: (string | null)[]; busy: boolean }

/** Translates texts into `lang`. Saved ones come back at once; the rest are asked for in batches. null = could not be translated (the original stays). */
export async function translateMany(texts: string[], lang: string, ask: (lang: string, texts: string[]) => Promise<BatchReply> = requestBatch): Promise<ManyResult> {
  const cache = cacheFor(lang);
  const out: (string | null)[] = texts.map(() => null);
  const missing = new Map<string, number[]>();          // text -> where it is wanted
  texts.forEach((raw, i) => {
    const t = norm(raw);
    if (!t) return;
    if (alreadyInLanguage(t, lang)) { out[i] = raw; return; }
    const hit = cache.get(fingerprint(t));
    if (hit !== undefined) { out[i] = hit; return; }
    const at = missing.get(t) || [];
    at.push(i);
    missing.set(t, at);
  });
  let busy = false;
  for (const group of chunkTexts(Array.from(missing.keys()))) {
    if (busy) break;
    let reply: BatchReply;
    try { reply = await ask(lang, group); } catch { busy = true; break; }
    if (reply.busy) busy = true;
    group.forEach((t, k) => {
      const got = reply.translations[k];
      if (got) {
        cache.set(fingerprint(t), got);
        for (const i of missing.get(t) || []) out[i] = got;
      }
    });
  }
  if (missing.size) saveSoon(lang);
  return { translations: out, busy };
}

export async function translateOne(text: string, lang: string): Promise<{ text: string | null; busy: boolean }> {
  const r = await translateMany([text], lang);
  return { text: r.translations[0], busy: r.busy };
}

// ---------------------------------------------------------------------------------------------------------------- the on/off switch
export function getAutoTranslate(): boolean {
  try { return localStorage.getItem(AUTO_KEY) === '1'; } catch { return false; }
}
export function setAutoTranslateSaved(on: boolean): void {
  try { if (on) localStorage.setItem(AUTO_KEY, '1'); else localStorage.removeItem(AUTO_KEY); } catch { /* storage blocked: it lasts until the app is closed */ }
}

// ---------------------------------------------------------------------------------------------------------------- translating the screen
// Never translated on their own: places the person types in, code, private chats (end-to-end encrypted: they would have to be sent to a server),
// the private study notes and tutor, and anything marked translate="no" (names, handles).
const EXCLUDE = '[translate="no"],[data-no-translate],[data-private],script,style,noscript,textarea,input,select,option,code,pre,svg,[contenteditable=""],[contenteditable="true"],#chat-view-container,.st-root';
const MIN_WORDS_ON_SCREEN = 3;     // on the screen only real writing is translated (a name or a button is one or two words)

interface Shown { src: string; out: string }
const shown = new WeakMap<Text, Shown>();
const candidates = new Set<Text>();
let autoLang: string | null = null;
let observer: MutationObserver | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let working = false;
let pausedUntil = 0;
let generation = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => { try { f(); } catch { /* one listener failing must not stop the others */ } });
export function subscribeAuto(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function isAutoRunning(): boolean { return autoLang !== null; }
export function autoLanguage(): string | null { return autoLang; }
let translatedCount = 0;
export function translatedOnScreen(): number { return translatedCount; }

const inExcluded = (el: Element | null): boolean => { try { return !!el && !!el.closest(EXCLUDE); } catch { return false; } };

function consider(node: Text) {
  if (!autoLang) return;
  const value = node.nodeValue ?? '';
  const s = shown.get(node);
  if (s && s.out === value) return;                  // ours, unchanged
  if (s) shown.delete(node);                         // the app wrote something new here
  if (!worthTranslating(value, { minWords: MIN_WORDS_ON_SCREEN })) return;
  if (alreadyInLanguage(value, autoLang)) return;
  if (isAppText(value)) return;                      // the app's own text: the language engine does that one
  const parent = node.parentElement;
  if (!parent || inExcluded(parent)) return;
  candidates.add(node);
}

function scan(root: Node) {
  if (root.nodeType === 3) { consider(root as Text); return; }
  if (root.nodeType !== 1) return;
  if (inExcluded(root as Element)) return;
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) consider(n as Text);
}

const nearScreen = (node: Text): boolean => {
  const el = node.parentElement;
  if (!el || !el.isConnected) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  return r.bottom > -600 && r.top < window.innerHeight + 900;
};

function scheduleFlush(ms = 350) {
  if (flushTimer || !autoLang) return;
  flushTimer = setTimeout(() => { flushTimer = null; void flush(); }, ms);
}

async function flush() {
  if (!autoLang || working) return;
  if (Date.now() < pausedUntil) { scheduleFlush(Math.min(5000, pausedUntil - Date.now() + 50)); return; }
  const lang = autoLang;
  const mine = generation;
  const batch: Text[] = [];
  for (const n of candidates) {
    if (!n.isConnected) { candidates.delete(n); continue; }
    if (nearScreen(n)) { batch.push(n); if (batch.length >= 24) break; }
  }
  if (!batch.length) return;
  working = true;
  try {
    const texts = batch.map((n) => n.nodeValue ?? '');
    const res = await translateMany(texts, lang);
    if (mine !== generation || !autoLang) return;
    observer?.disconnect();
    try {
      batch.forEach((node, i) => {
        const src = texts[i];
        const out = res.translations[i];
        if (!out && res.busy) return;                                         // the server said "not now": it stays on the list for later
        candidates.delete(node);
        if (!node.isConnected || node.nodeValue !== src) return;             // it changed while we were away
        if (out && out !== src) {
          shown.set(node, { src, out });
          node.nodeValue = out;
          translatedCount++;
        }
      });
    } finally { observe(); }
    notify();
    if (res.busy) pausedUntil = Date.now() + 45_000;
  } finally {
    working = false;
    if (candidates.size && autoLang) scheduleFlush(retryDelay());
  }
}
const retryDelay = () => (Date.now() < pausedUntil ? 2000 : 400);

function observe() {
  if (!autoLang || !document.body) return;
  observer ??= new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') consider(r.target as Text);
      else r.addedNodes.forEach((n) => scan(n));
    }
    observer!.takeRecords();
    scheduleFlush();
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
}

let scrollBound = false;
let lastScroll = 0;
const onScroll = () => {
  const now = Date.now();
  if (now - lastScroll < 300) return;
  lastScroll = now;
  scheduleFlush(200);
};

/** Starts translating the text on the screen (and what scrolls into view) into `lang`. */
export function startAutoTranslate(lang: string): void {
  const next = String(lang || DEFAULT_LANGUAGE);
  if (autoLang === next) return;
  if (autoLang) stopAutoTranslate(false);
  autoLang = next;
  generation++;
  translatedCount = 0;
  if (typeof document === 'undefined' || !document.body) return;
  scan(document.body);
  observe();
  if (!scrollBound) { window.addEventListener('scroll', onScroll, { passive: true, capture: true }); scrollBound = true; }
  scheduleFlush(50);
  notify();
}

/** Stops, and puts every original text back. */
export function stopAutoTranslate(announce = true): void {
  generation++;
  autoLang = null;
  observer?.disconnect();
  observer = null;
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  candidates.clear();
  if (typeof document !== 'undefined' && document.body) {
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const s = shown.get(n as Text);
      if (s && (n as Text).nodeValue === s.out) (n as Text).nodeValue = s.src;
      if (s) shown.delete(n as Text);
    }
  }
  if (scrollBound) { window.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions); scrollBound = false; }
  translatedCount = 0;
  if (announce) notify();
}

/** Called when the app language changes: restarts for the new language if it is switched on. */
export function syncAutoTranslate(appLanguage: string): void {
  if (getAutoTranslate()) startAutoTranslate(appLanguage); else if (autoLang) stopAutoTranslate();
}

export function languageLabel(code: string): string {
  return findLanguage(code)?.name ?? 'English';
}
