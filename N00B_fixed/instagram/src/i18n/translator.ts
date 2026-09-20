// The pure heart of the translation: given the app's list of texts (catalog) and the translations we have for one language,
// turn a piece of screen text into its translation. No browser, no network: tested on its own.
//
// Two kinds of catalog entries:
//   * plain texts ("Save changes")                      -> found by exact match;
//   * texts with slots ("{0} followers", "Hi {0}!")     -> the slot is whatever the screen shows there (a number, a name...).
// Anything that is not in the catalog (a post, a comment, a chat message, a name) is never touched.
import { normalizeText } from './textKey.ts';

export type CatalogEntry = [id: string, source: string];

export interface Pattern {
  id: string;
  source: string;
  anchor: string; // the longest fixed piece: a cheap "could this text match?" test before running the regular expression
  regex: RegExp;
}

export interface Index {
  byText: Map<string, string>; // source text -> id
  patterns: Pattern[];
}

const SLOT = /\{(\d+)\}/g;
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function buildIndex(entries: readonly CatalogEntry[]): Index {
  const byText = new Map<string, string>();
  const patterns: Pattern[] = [];
  for (const [id, source] of entries) {
    if (!/\{\d+\}/.test(source)) {
      byText.set(source, id);
      continue;
    }
    const pieces = source.split(SLOT).filter((_, i) => i % 2 === 0); // the fixed pieces between the slots
    const anchor = pieces.reduce((best, p) => (p.trim().length > best.length ? p.trim() : best), '');
    if (anchor.length < 2) continue; // "{0}" alone or "{0}:" would match nearly anything
    const body = source
      .split(SLOT)
      .map((part, i) => (i % 2 === 0 ? escapeRegex(part) : '(.+?)'))
      .join('');
    patterns.push({ id, source, anchor, regex: new RegExp(`^${body}$`, 's') });
  }
  // more specific patterns (longer fixed text) first, so "Hi {0}, welcome back!" wins over "Hi {0}"
  patterns.sort((a, b) => b.anchor.length - a.anchor.length);
  return { byText, patterns };
}

export interface Found {
  id: string;
  text: string | null; // the translation, or null when we do not have it yet
}

// Which catalog entry is this screen text, and what is its translation?  null = not app text at all.
export function lookup(rawText: string, index: Index, translations: ReadonlyMap<string, string>): Found | null {
  const core = normalizeText(rawText);
  if (!core) return null;
  const id = index.byText.get(core);
  if (id !== undefined) return { id, text: translations.get(id) ?? null };
  for (const p of index.patterns) {
    if (!core.includes(p.anchor)) continue;
    const m = p.regex.exec(core);
    if (!m) continue;
    const template = translations.get(p.id);
    return { id: p.id, text: template === undefined ? null : template.replace(SLOT, (whole, n: string) => m[Number(n) + 1] ?? whole) };
  }
  return null;
}

// The translation with the same leading and trailing spaces the screen text had (JSX text often starts or ends with one).
export function translateText(rawText: string, index: Index, translations: ReadonlyMap<string, string>): { text: string; id: string } | { text: null; id: string | null } {
  const found = lookup(rawText, index, translations);
  if (!found) return { text: null, id: null };
  if (found.text === null) return { text: null, id: found.id };
  const lead = /^\s*/.exec(rawText)![0];
  const trail = /\s*$/.exec(rawText)![0];
  return { text: lead + found.text + trail, id: found.id };
}

// Characters that are never part of a sentence (everything below a space except tab, line feed and carriage return).
function hasControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) return true;
  }
  return false;
}

// Is a translation coming back from the translator usable? It must keep every {0}-style slot exactly as often as the source,
// must not be empty, and must not be absurdly long (a sign the translator rambled).
export function isUsableTranslation(source: string, translated: unknown): translated is string {
  if (typeof translated !== 'string') return false;
  const t = translated.trim();
  if (!t) return false;
  if (t.length > source.length * 6 + 24) return false;
  if (hasControlChars(t)) return false;
  const slots = (s: string) => (s.match(SLOT) || []).sort().join(',');
  if (slots(source) !== slots(t)) return false;
  if (/<\/?[a-z][^>]*>/i.test(t) && !/<\/?[a-z][^>]*>/i.test(source)) return false; // no markup that was not there
  return true;
}
