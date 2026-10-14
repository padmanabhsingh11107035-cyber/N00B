// A small search engine for NOOB's videos, reels and posts, built to behave like the search box on YouTube instead of "the title must contain exactly what I typed":
//   * every word is matched on its own (order does not matter), in the title, the uploader's name and the description, with the title counting most,
//   * typing is forgiving: capital letters, accents and punctuation do not matter, "vidoe" still finds "video", "mus" finds "music" (as you type),
//   * word endings are ignored (game / games / gaming / gamer-ish), and RELATED words match too (song ~ music ~ gaana, funny ~ comedy ~ meme, ...),
//   * results are ranked: all the words together beat one word, a title beats a description, the exact phrase beats loose words, and among equally
//     good results the popular and the fresh come first,
//   * it can suggest what to type (from the titles and names that exist), remember recent searches, and say "showing results for ..." for a typo.
// Plain functions with no screen code, so they are tested on their own. (No regex look-behind anywhere in this file: older iPhones refuse to load a page with one.)

// ---------------------------------------------------------------------------------------------------------------- words
const STOP = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'is', 'are', 'was', 'be', 'by', 'with', 'at', 'from', 'this', 'that', 'it', 'my', 'me', 'you', 'your', 'i',
  'how', 'what', 'ka', 'ki', 'ke', 'hai', 'ko', 'se', 'me', 'mein', 'aur', 'ek', 'ye', 'yeh', 'wala', 'wali'
]);

/** Lower case, no accents, no punctuation: "Café, Müsic!!" -> "cafe music". Letters of every script stay (Hindi, Gujarati, ...). */
export function normalize(s: string): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC')   // accents on Latin letters only (Devanagari marks are not in this range)
    .toLowerCase()
    .replace(/[#@_]/g, ' ')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();
}

export function tokens(s: string): string[] {
  const n = normalize(s);
  return n ? n.split(' ') : [];
}

/** Light word-ending removal, the same on both sides of a match: games, gaming, gamed -> gam; cities -> city; making, makes -> mak. */
export function stem(w: string): string {
  if (w.length <= 3 || /[^a-z]/.test(w)) return w;      // short words, numbers and other scripts are left alone
  let r = w;
  if (r.endsWith('ies') && r.length > 4) r = r.slice(0, -3) + 'y';
  else if (/(sses|shes|ches|xes|zes)$/.test(r)) r = r.slice(0, -2);
  else if (r.endsWith('ing') && r.length > 5) { r = r.slice(0, -3); if (/(.)\1$/.test(r)) r = r.slice(0, -1); }
  else if (r.endsWith('ed') && r.length > 4) { r = r.slice(0, -2); if (/(.)\1$/.test(r)) r = r.slice(0, -1); }
  else if (r.endsWith('s') && !r.endsWith('ss') && r.length > 3) r = r.slice(0, -1);
  if (r.endsWith('e') && r.length > 3) r = r.slice(0, -1);
  return r;
}

// Words that mean nearly the same thing for someone looking for a video (English and the Hinglish words people really type).
const GROUPS: string[][] = [
  ['song', 'music', 'audio', 'track', 'gaana', 'gana', 'tune', 'beat', 'lofi', 'remix', 'mashup', 'singer', 'singing'],
  ['funny', 'comedy', 'meme', 'joke', 'laugh', 'lol', 'mazak', 'hasi', 'roast', 'humor', 'humour'],
  ['movie', 'film', 'cinema', 'trailer', 'bollywood', 'hollywood', 'teaser', 'web series', 'series'],
  ['tutorial', 'learn', 'lesson', 'course', 'class', 'teach', 'guide', 'howto', 'explain', 'padhai', 'study', 'education', 'tips', 'tricks'],
  ['game', 'gaming', 'gameplay', 'gamer', 'play', 'playthrough', 'walkthrough', 'esports', 'pubg', 'minecraft', 'bgmi'],
  ['cook', 'recipe', 'food', 'kitchen', 'chef', 'khana', 'dish', 'bake', 'snack', 'dessert', 'biryani'],
  ['travel', 'trip', 'tour', 'vlog', 'journey', 'explore', 'adventure', 'yatra', 'safari', 'holiday', 'vacation'],
  ['dance', 'choreography', 'nach', 'moves', 'dancing'],
  ['workout', 'gym', 'fitness', 'exercise', 'yoga', 'training', 'health', 'diet'],
  ['news', 'update', 'headline', 'breaking', 'khabar', 'report'],
  ['tech', 'technology', 'gadget', 'phone', 'mobile', 'review', 'unboxing', 'laptop', 'smartphone', 'android', 'iphone'],
  ['car', 'bike', 'auto', 'drive', 'driving', 'ride', 'riding', 'motorcycle', 'scooter'],
  ['cricket', 'ipl', 'match', 'sport', 'football', 'soccer', 'kabaddi', 'tennis'],
  ['art', 'draw', 'drawing', 'paint', 'painting', 'sketch', 'design', 'craft', 'diy'],
  ['live', 'livestream', 'stream', 'streaming', 'broadcast'],
  ['kid', 'child', 'cartoon', 'bachche', 'baby', 'rhyme', 'rhymes'],
  ['love', 'romantic', 'romance', 'pyar', 'couple', 'dil', 'shayari'],
  ['motivation', 'motivational', 'inspiration', 'inspirational', 'success', 'mindset', 'speech', 'quotes'],
  ['short', 'reel', 'clip'],
  ['prank', 'challenge', 'dare', 'trend', 'trending', 'viral']
];
const GROUP_OF = new Map<string, number[]>();
GROUPS.forEach((g, i) => g.forEach((w) => {
  const k = stem(w);
  const list = GROUP_OF.get(k) || [];
  if (!list.includes(i)) list.push(i);
  GROUP_OF.set(k, list);
}));
const related = (a: string, b: string): boolean => {
  const ga = GROUP_OF.get(a);
  const gb = GROUP_OF.get(b);
  return !!ga && !!gb && ga.some((x) => gb.includes(x));
};

/** Edit distance (insert, delete, change, swap two neighbours) that gives up past `max`: returns max + 1 then. */
export function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2: number[] = [];
  let prev: number[] = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}
const allowedTypos = (len: number): number => (len >= 8 ? 2 : len >= 4 ? 1 : 0);

// ---------------------------------------------------------------------------------------------------------------- one word against one word
/** How well a typed word matches a word of a document: 0 (not at all) to 1 (the same word). */
export function wordScore(q: string, d: string): number {
  if (q === d) return 1;
  const sq = stem(q), sd = stem(d);
  if (sq === sd) return 0.95;
  if (q.length >= 2 && d.startsWith(q)) return 0.78;                    // typing "mus" finds "music"
  if (sq.length >= 3 && sd.startsWith(sq)) return 0.72;
  if (related(sq, sd)) return 0.58;                                      // song ~ music
  if (q.length >= 3 && d.length >= 3 && d.includes(q)) return 0.5;      // "sic" inside "music"
  if (d.length >= 4 && q.startsWith(d)) return 0.45;
  const max = Math.min(allowedTypos(q.length), allowedTypos(d.length) || 0);
  if (max > 0) {
    const dist = Math.min(editDistance(q, d, max), editDistance(sq, sd, max));
    if (dist <= max) return 0.7 - 0.12 * dist;                          // "vidoe" -> "video"
  }
  return 0;
}

// ---------------------------------------------------------------------------------------------------------------- the index
export interface SearchDoc<T> {
  item: T;
  /** the text to search and how much a hit in it counts (title 5, name 3, description 1.5) */
  fields: { text: string; weight: number }[];
  /** 0 to 1: how popular / fresh it is. Only breaks ties between equally relevant results. */
  boost?: number;
}
interface IndexedDoc<T> { item: T; fields: { norm: string; words: string[]; weight: number }[]; boost: number }
export type SearchIndex<T> = { docs: IndexedDoc<T>[]; vocab: Map<string, number> };

export function buildIndex<T>(docs: SearchDoc<T>[]): SearchIndex<T> {
  const vocab = new Map<string, number>();
  const out = docs.map((d) => ({
    item: d.item,
    boost: Math.max(0, Math.min(1, d.boost ?? 0)),
    fields: d.fields.map((f) => {
      const words = tokens(f.text);
      for (const w of words) if (w.length >= 2) vocab.set(w, (vocab.get(w) || 0) + 1);
      return { norm: words.join(' '), words, weight: f.weight };
    })
  }));
  return { docs: out, vocab };
}

/** The words of a typed search that are worth matching (small joining words are dropped, unless that would leave nothing). */
export function queryWords(query: string): string[] {
  const all = tokens(query);
  const kept = all.filter((w) => !STOP.has(w));
  return kept.length ? kept : all;
}

export interface SearchHit<T> { item: T; score: number }

export function searchIndex<T>(query: string, index: SearchIndex<T>, opts: { limit?: number } = {}): SearchHit<T>[] {
  const words = queryWords(query);
  if (!words.length) return [];
  const phrase = words.join(' ');
  const need = words.length;
  const hits: SearchHit<T>[] = [];
  for (const doc of index.docs) {
    let total = 0, matched = 0, phraseBonus = 0;
    for (const w of words) {
      const perField: number[] = [];
      for (const f of doc.fields) {
        let best = 0;
        for (const d of f.words) { const s = wordScore(w, d); if (s > best) { best = s; if (s === 1) break; } }
        if (best > 0) perField.push(best * f.weight);
      }
      if (perField.length) {
        perField.sort((a, b) => b - a);
        total += perField[0] + 0.25 * perField.slice(1).reduce((a, b) => a + b, 0);   // a second field that also matches adds a little
        matched++;
      }
    }
    if (!matched) continue;
    if (need >= 2) for (const f of doc.fields) if (f.norm.includes(phrase)) phraseBonus = Math.max(phraseBonus, f.weight * 1.5 + (f.norm.startsWith(phrase) ? 1 : 0));
    if (need === 1) for (const f of doc.fields) if (f.words[0] === phrase) phraseBonus = Math.max(phraseBonus, 0.8);   // the name begins with it
    const coverage = matched / need;
    // the more of the typed words are found, the higher it ranks: all of them beats half of them by a wide margin
    const score = (total + phraseBonus) * (0.35 + 0.65 * coverage * coverage) * (1 + 0.12 * doc.boost);
    hits.push({ item: doc.item, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return opts.limit ? hits.slice(0, opts.limit) : hits;
}

export function search<T>(query: string, docs: SearchDoc<T>[], opts: { limit?: number } = {}): SearchHit<T>[] {
  return searchIndex(query, buildIndex(docs), opts);
}

// ---------------------------------------------------------------------------------------------------------------- "did you mean"
/** If a typed word is not a word anyone used but a nearby one is, the corrected search ("vidoe tutoral" -> "video tutorial"); otherwise null. */
export function didYouMean(query: string, vocab: Map<string, number>): string | null {
  const words = tokens(query);
  if (!words.length) return null;
  let changed = false;
  const fixed = words.map((w) => {
    if (STOP.has(w) || vocab.has(w) || w.length < 4) return w;
    for (const k of vocab.keys()) if (k.startsWith(w) || stem(k) === stem(w)) return w;      // a word still being typed, or another form of a real word
    const max = allowedTypos(w.length);
    let best: string | null = null, bestDist = max + 1, bestCount = 0;
    for (const [k, count] of vocab) {
      if (Math.abs(k.length - w.length) > max) continue;
      const d = editDistance(w, k, max);
      if (d < bestDist || (d === bestDist && count > bestCount)) { best = k; bestDist = d; bestCount = count; }
    }
    if (best && bestDist <= max) { changed = true; return best; }
    return w;
  });
  return changed ? fixed.join(' ') : null;
}

// ---------------------------------------------------------------------------------------------------------------- suggestions while typing
/** Up to `limit` titles / names to offer under the search box: the ones that BEGIN with what is typed first, then the ones with a word that does. */
export function suggest(query: string, candidates: string[], limit = 6): string[] {
  const q = normalize(query);
  if (!q) return [];
  const qw = q.split(' ');
  const last = qw[qw.length - 1];
  const seen = new Set<string>();
  const first: string[] = [], second: string[] = [];
  for (const raw of candidates) {
    const text = String(raw || '').replace(/\s+/g, ' ').trim();
    const n = normalize(text);
    if (!n || n === q || seen.has(n)) continue;
    if (n.startsWith(q)) { seen.add(n); first.push(text); continue; }
    const words = n.split(' ');
    const rest = qw.slice(0, -1);
    if (rest.every((r) => words.includes(r)) && words.some((w) => w.startsWith(last))) { seen.add(n); second.push(text); }
  }
  return [...first, ...second].slice(0, limit).map((t) => (t.length > 70 ? t.slice(0, 67).trimEnd() + '…' : t));
}

// ---------------------------------------------------------------------------------------------------------------- a score for "popular and fresh"
/** 0 to 1: well watched and liked, and not too old. Only a tie-breaker (see SearchDoc.boost). */
export function popularity(v: { views?: number; likes?: number; comments?: number; createdAt?: string }, now = Date.now()): number {
  const engagement = Math.log10(1 + (v.views || 0) + 3 * (v.likes || 0) + 5 * (v.comments || 0));       // 0..~4
  const t = v.createdAt ? new Date(v.createdAt).getTime() : NaN;
  const ageDays = Number.isFinite(t) ? Math.max(0, (now - t) / 86_400_000) : 365;
  const fresh = Math.exp(-ageDays / 30);                                                               // 1 today, 0.37 after a month
  return Math.max(0, Math.min(1, engagement / 4 * 0.7 + fresh * 0.3));
}

// ---------------------------------------------------------------------------------------------------------------- recent searches (kept on this device)
const HISTORY_KEY = 'noob_recent_searches';
const memory: Record<string, string[]> = {};
export function recentSearches(key = HISTORY_KEY): string[] {
  try {
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list)) return list.filter((x) => typeof x === 'string').slice(0, 8);
  } catch {
    return memory[key] || [];
  }
  return [];
}
export function rememberSearch(query: string, key = HISTORY_KEY): string[] {
  const text = String(query || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (normalize(text).length < 2) return recentSearches(key);
  const list = [text, ...recentSearches(key).filter((x) => normalize(x) !== normalize(text))].slice(0, 8);
  memory[key] = list;
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* kept until the app is closed */ }
  return list;
}
export function forgetSearch(query: string, key = HISTORY_KEY): string[] {
  const list = recentSearches(key).filter((x) => normalize(x) !== normalize(query));
  memory[key] = list;
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* kept until the app is closed */ }
  return list;
}
export function clearSearches(key = HISTORY_KEY): void {
  memory[key] = [];
  try { localStorage.removeItem(key); } catch { /* nothing saved */ }
}
