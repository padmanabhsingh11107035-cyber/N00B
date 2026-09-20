// The on-screen translator. It does not need any screen to be rewritten: it watches the page and, for every piece of text that
// is one of the app's own texts (see catalog.json), shows the translation in the person's language instead. Text people write
// (posts, comments, chats, names) is never in the catalog, so it is never changed. English is the source and the fallback: a
// text with no translation yet stays in English and is fetched in the background.
//
// Where translations come from, in order: this device's saved copy (instant, works offline) -> the server's stored copy (one call)
// -> the server translating the missing ones (once; then every person using that language gets them from the stored copy).
import { DEFAULT_LANGUAGE, cleanLanguageCode, findLanguage, isRtl } from './languages.ts';
import { buildIndex, isUsableTranslation, translateText, type Index } from './translator.ts';
import { normalizeText } from './textKey.ts';
import { fetchStoredTranslations, requestTranslations } from './remote.ts';

const LANG_KEY = 'noob_language_v1';
const CACHE_PREFIX = 'noob_i18n_v1_';
export const PSEUDO_LANGUAGE = 'pseudo'; // development only: wraps every catalog text in « » so untranslated text stands out

const TEXT_ATTRS = ['placeholder', 'title', 'aria-label', 'alt'] as const;
const ATTR_SELECTOR = TEXT_ATTRS.map((a) => `[${a}]`).join(',');
// Places that are never translated: text people write or edit, code, and anything marked translate="no".
const EXCLUDE = '[translate="no"],[data-no-translate],script,style,noscript,textarea,code,pre,[contenteditable=""],[contenteditable="true"]';
const BATCH = 30;

interface Shown { en: string; out: string; done: boolean }

let lang = DEFAULT_LANGUAGE;
let catalog: [string, string][] | null = null;
let catalogPromise: Promise<[string, string][]> | null = null;
let index: Index | null = null;
let sources = new Map<string, string>(); // id -> English text
let translations = new Map<string, string>();
const wanted = new Set<string>(); // texts on the screen that have no translation yet
const attempts = new Map<string, number>();
let installed = false;
let observer: MutationObserver | null = null;
let backgroundFill = false;
let filling = false;
let retryTimer: number | undefined;
let saveTimer: number | undefined;
let generation = 0; // bumped whenever the language changes, so slow answers for an old language are ignored

const textShown = new WeakMap<Text, Shown>();
const attrShown = new WeakMap<Element, Map<string, Shown>>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => { try { fn(); } catch { /* one listener failing must not stop the others */ } });

// ------------------------------------------------------------------------------------------------ saved copy on this device
function readSaved(): string {
  try { return cleanLanguageCode(localStorage.getItem(LANG_KEY)); } catch { return DEFAULT_LANGUAGE; }
}
function writeSaved(code: string) {
  try { if (code === DEFAULT_LANGUAGE) localStorage.removeItem(LANG_KEY); else localStorage.setItem(LANG_KEY, code); } catch { /* storage blocked */ }
}
function readCache(code: string): Map<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_PREFIX + code) || 'null');
    if (raw && typeof raw === 'object') return new Map(Object.entries(raw).filter(([, v]) => typeof v === 'string') as [string, string][]);
  } catch { /* nothing saved, or damaged */ }
  return new Map();
}
function writeCacheSoon() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      // keep only the current language on this device
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(CACHE_PREFIX) && k !== CACHE_PREFIX + lang) localStorage.removeItem(k);
      }
      if (lang !== DEFAULT_LANGUAGE && lang !== PSEUDO_LANGUAGE) localStorage.setItem(CACHE_PREFIX + lang, JSON.stringify(Object.fromEntries(translations)));
    } catch { /* storage full or blocked: the server copy still works */ }
  }, 800);
}

// ------------------------------------------------------------------------------------------------ the catalog
async function loadCatalog(): Promise<[string, string][]> {
  if (catalog) return catalog;
  catalogPromise ??= import('./catalog.json').then((m: any) => {
    const data = m.default ?? m;
    catalog = data.strings as [string, string][];
    index = buildIndex(catalog);
    sources = new Map(catalog);
    return catalog;
  });
  return catalogPromise;
}

// ------------------------------------------------------------------------------------------------ changing text on the screen
function excluded(el: Element | null): boolean {
  try { return !!el && !!el.closest(EXCLUDE); } catch { return false; }
}

function handleText(node: Text) {
  if (!index || lang === DEFAULT_LANGUAGE) return;
  const value = node.nodeValue ?? '';
  const shown = textShown.get(node);
  if (shown?.done && shown.out === value) return; // ours, unchanged
  const res = translateText(value, index, translations);
  if (res.id === null) { if (shown) textShown.delete(node); return; }
  if (excluded(node.parentElement)) return;
  if (res.text === null) {
    wanted.add(res.id);
    textShown.set(node, { en: value, out: value, done: false });
    return;
  }
  textShown.set(node, { en: value, out: res.text, done: true });
  if (res.text !== value) {
    pinOptionValue(node, value);
    node.nodeValue = res.text;
  }
}

// A drop-down choice written as <option>Hate Speech</option> has no value of its own: its visible text IS its value. If the
// text were translated, what the app reads back (a report reason, a ticket category...) would change, and the app's own
// selection (which is in English) would no longer match any choice. So the English text is pinned as its value first.
// (An option the app gave an explicit value is left alone; one we pinned earlier is re-pinned when its English text changes.)
function pinOptionValue(node: Text, english: string) {
  const parent = node.parentElement;
  if (!parent || parent.tagName !== 'OPTION') return;
  if (parent.hasAttribute('value') && !parent.hasAttribute('data-i18n-value')) return;
  parent.setAttribute('value', normalizeText(english));
  parent.setAttribute('data-i18n-value', '');
}

function handleAttr(el: Element, name: string) {
  if (!index || lang === DEFAULT_LANGUAGE) return;
  const value = el.getAttribute(name);
  if (value === null) return;
  let map = attrShown.get(el);
  const shown = map?.get(name);
  if (shown?.done && shown.out === value) return;
  const res = translateText(value, index, translations);
  if (res.id === null) { map?.delete(name); return; }
  if (excluded(el)) return;
  if (!map) attrShown.set(el, (map = new Map()));
  if (res.text === null) {
    wanted.add(res.id);
    map.set(name, { en: value, out: value, done: false });
    return;
  }
  map.set(name, { en: value, out: res.text, done: true });
  if (res.text !== value) el.setAttribute(name, res.text);
}

// Bring everything under `root` up to date. `restore` first puts English back wherever we had translated (used when the language changes).
function walk(root: Node, restore = false) {
  if (root.nodeType === 3) {
    const t = root as Text;
    if (restore) restoreText(t);
    handleText(t);
    return;
  }
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (restore) restoreText(n as Text);
    handleText(n as Text);
  }
  const scope = root as Element | Document;
  const els: Element[] = [];
  if (root.nodeType === 1 && (root as Element).matches?.(ATTR_SELECTOR)) els.push(root as Element);
  scope.querySelectorAll?.(ATTR_SELECTOR).forEach((e) => els.push(e));
  for (const el of els) {
    for (const name of TEXT_ATTRS) {
      if (restore) restoreAttr(el, name);
      handleAttr(el, name);
    }
  }
}

function restoreText(node: Text) {
  const s = textShown.get(node);
  if (s && s.done && node.nodeValue === s.out && s.en !== s.out) node.nodeValue = s.en;
  if (s) textShown.delete(node);
}
function restoreAttr(el: Element, name: string) {
  const s = attrShown.get(el)?.get(name);
  if (s && s.done && el.getAttribute(name) === s.out && s.en !== s.out) el.setAttribute(name, s.en);
  attrShown.get(el)?.delete(name);
}

function refreshScreen(restore = false) {
  if (!document.body) return;
  observer?.disconnect();
  try { walk(document.body, restore); } finally { observe(); }
}

function observe() {
  if (!installed || !document.body) return;
  observer ??= new MutationObserver((records) => {
    // handled straight away (before the next paint), so people never see a flash of English
    for (const r of records) {
      if (r.type === 'characterData') walk(r.target);
      else if (r.type === 'attributes') { if (r.target.nodeType === 1) handleAttr(r.target as Element, r.attributeName!); }
      else r.addedNodes.forEach((n) => walk(n));
    }
    // discard the records our own changes just caused
    observer!.takeRecords();
    if (wanted.size) void fillMissing();
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...TEXT_ATTRS] });
}

// alert() / confirm() / prompt() messages are app texts too
const nativeDialogs: Partial<Record<'alert' | 'confirm' | 'prompt', (...a: any[]) => any>> = {};
function patchDialogs(on: boolean) {
  for (const name of ['alert', 'confirm', 'prompt'] as const) {
    if (on && !nativeDialogs[name]) {
      const original = (window as any)[name].bind(window);
      nativeDialogs[name] = original;
      (window as any)[name] = (message?: any, ...rest: any[]) => original(typeof message === 'string' ? translateNow(message) : message, ...rest);
    } else if (!on && nativeDialogs[name]) {
      (window as any)[name] = nativeDialogs[name];
      delete nativeDialogs[name];
    }
  }
}

function install() {
  if (installed) return;
  installed = true;
  patchDialogs(true);
}
function uninstall() {
  installed = false;
  observer?.disconnect();
  observer = null;
  patchDialogs(false);
}

// ------------------------------------------------------------------------------------------------ getting the missing translations
function nextBatch(): string[] {
  const out: string[] = [];
  const take = (id: string) => {
    if (out.length >= BATCH || translations.has(id) || !sources.has(id) || (attempts.get(id) ?? 0) >= 3) return;
    out.push(id);
  };
  for (const id of wanted) take(id); // what is on the screen first
  if (!out.length && backgroundFill && catalog) for (const [id] of catalog) { take(id); if (out.length >= BATCH) break; } // then the rest, slowly
  return out;
}

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

async function fillMissing() {
  if (filling || lang === DEFAULT_LANGUAGE || lang === PSEUDO_LANGUAGE) return;
  filling = true;
  const mine = generation;
  let errors = 0;
  try {
    while (mine === generation) {
      const ids = nextBatch();
      if (!ids.length) break;
      let got: Record<string, string> = {};
      let busy = false;
      try {
        const reply = await requestTranslations(lang, ids.map((id) => ({ id, text: sources.get(id)! })));
        got = reply.translations;
        busy = reply.busy;
        errors = 0;
      } catch {
        errors++;
      }
      if (mine !== generation) return;
      let added = 0;
      for (const id of ids) {
        const t = got[id];
        if (t !== undefined && isUsableTranslation(sources.get(id)!, t)) {
          translations.set(id, t.trim());
          wanted.delete(id);
          added++;
        } else {
          attempts.set(id, (attempts.get(id) ?? 0) + (busy || errors ? 0 : 1)); // a busy server is not the text's fault
        }
      }
      if (added) { writeCacheSoon(); refreshScreen(); notify(); }
      if (busy || errors) {
        if (errors >= 4 || busy) { scheduleRetry(busy ? 45_000 : 90_000); break; }
        await sleep(1500 * 2 ** errors);
      } else {
        await sleep(document.visibilityState === 'hidden' ? 4000 : backgroundFill && !wanted.size ? 1200 : 150);
      }
    }
  } finally {
    filling = false;
  }
}

function scheduleRetry(ms: number) {
  window.clearTimeout(retryTimer);
  retryTimer = window.setTimeout(() => { if (lang !== DEFAULT_LANGUAGE) void fillMissing(); }, ms);
}

// ------------------------------------------------------------------------------------------------ public API
export function getLanguage(): string {
  return lang;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// How much of the app is available in the current language (for a small "translating..." hint).
export function getProgress(): { done: number; total: number } {
  const total = catalog?.length ?? 0;
  if (lang === DEFAULT_LANGUAGE) return { done: total, total };
  let done = 0;
  if (catalog) for (const [id] of catalog) if (translations.has(id)) done++;
  return { done, total };
}

export function getPercent(): number {
  const { done, total } = getProgress();
  return total ? Math.floor((done / total) * 100) : lang === DEFAULT_LANGUAGE ? 100 : 0;
}

// Let the translator keep translating the rest of the app quietly (only for signed-in people, so a visitor on the login page
// can only ever cause the texts on that page to be translated).
export function setBackgroundFill(on: boolean) {
  backgroundFill = on;
  if (on && lang !== DEFAULT_LANGUAGE) void fillMissing();
}

export async function setLanguage(code: string): Promise<void> {
  const next = code === PSEUDO_LANGUAGE ? PSEUDO_LANGUAGE : cleanLanguageCode(code);
  if (next === lang && (next === DEFAULT_LANGUAGE || installed)) return;
  const previous = lang;
  lang = next;
  generation++;
  wanted.clear();
  attempts.clear();
  window.clearTimeout(retryTimer);
  writeSaved(next === PSEUDO_LANGUAGE ? DEFAULT_LANGUAGE : next);
  applyDocumentLanguage(next);

  if (next === DEFAULT_LANGUAGE) {
    // back to English: put the original text back everywhere
    refreshScreenToEnglish();
    translations = new Map();
    uninstall();
    markReady();
    notify();
    return;
  }

  const mine = generation;
  await loadCatalog();
  if (mine !== generation) return;
  translations = next === PSEUDO_LANGUAGE ? new Map(catalog!.map(([id, s]) => [id, '«' + s + '»'])) : readCache(next);
  install();
  refreshScreen(previous !== DEFAULT_LANGUAGE); // from another language: start again from the English text
  markReady();
  notify();
  if (next === PSEUDO_LANGUAGE) return;

  // the server's stored copy (everything anybody has had translated so far)
  try {
    const stored = await fetchStoredTranslations(next);
    if (mine !== generation) return;
    let added = 0;
    for (const [id, t] of Object.entries(stored)) {
      const src = sources.get(id);
      if (src && isUsableTranslation(src, t) && translations.get(id) !== t) { translations.set(id, t); added++; }
    }
    if (added) { writeCacheSoon(); refreshScreen(); notify(); }
  } catch {
    // offline or the server is busy: what is saved on this device (and English) is shown
  }
  if (mine !== generation) return;
  void fillMissing();
}

function refreshScreenToEnglish() {
  observer?.disconnect();
  if (document.body) walk(document.body, true);
}

function applyDocumentLanguage(code: string) {
  const el = document.documentElement;
  el.setAttribute('lang', code === PSEUDO_LANGUAGE ? 'en' : code);
  el.setAttribute('dir', code !== PSEUDO_LANGUAGE && isRtl(code) ? 'rtl' : 'ltr');
  el.setAttribute('data-language', code);
}

function markReady() {
  document.documentElement.removeAttribute('data-i18n-loading');
}

// The saved language, applied as early as possible when the app starts (hides the page for a moment instead of flashing English).
export function initLanguage(): Promise<void> {
  const saved = readSaved();
  if (saved === DEFAULT_LANGUAGE) return Promise.resolve();
  document.documentElement.setAttribute('data-i18n-loading', '1');
  window.setTimeout(markReady, 1800); // never keep the page hidden if something is slow
  return setLanguage(saved);
}

// A text made in code (for example a message about to be shown), translated right now if we can.
export function translateNow(text: string): string {
  if (lang === DEFAULT_LANGUAGE || !index) return text;
  const res = translateText(text, index, translations);
  if (res.id !== null && res.text === null) { wanted.add(res.id); void fillMissing(); }
  return res.text ?? text;
}

export function languageName(code: string = lang): string {
  return findLanguage(code)?.name ?? 'English';
}

// For development: type  __noobLanguage('pseudo')  in the browser console to see which texts are covered.
if (typeof window !== 'undefined' && (import.meta as any).env?.DEV) (window as any).__noobLanguage = setLanguage;
