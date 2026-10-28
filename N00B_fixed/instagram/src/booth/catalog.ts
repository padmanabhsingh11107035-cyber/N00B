// Every sticker of the Sticker Booth, in packs. Each one is drawn in code (see kit.ts), so there are no picture files to load, and each one moves.
import type { FieldId, PackId, StickerDef } from './kit.ts';
import { BUDDIES } from './buddies/index.ts';
import { KDRAMA } from './packs/kdrama.ts';
import { KMOVIE } from './packs/kmovie.ts';
import { ANIME } from './packs/anime.ts';
import { PINK, PURPLE } from './packs/kpop.ts';
import { FLAIR } from './packs/flair.ts';

export interface PackDef {
  id: PackId;
  name: string;
  /** the colour of the pack's tab */
  accent: string;
  /** the sticker shown as the pack's picture */
  cover: string;
}

export const PACKS: ReadonlyArray<PackDef> = [
  { id: 'kdrama', name: 'K-Drama', accent: '#ff4f8b', cover: 'kd-saranghae' },
  { id: 'kmovie', name: 'K-Movie', accent: '#f2a900', cover: 'km-clapper' },
  { id: 'anime', name: 'Anime', accent: '#4da6ff', cover: 'an-eyes' },
  { id: 'purple', name: 'K-Pop Purple', accent: '#9b4dff', cover: 'pp-lightstick' },
  { id: 'pink', name: 'K-Pop Pink', accent: '#ff4fb0', cover: 'pk-crown' },
  { id: 'flair', name: 'Flair', accent: '#ffd34d', cover: 'fl-sparkles' }
];

export const STICKERS: ReadonlyArray<StickerDef> = [...KDRAMA, ...KMOVIE, ...ANIME, ...PURPLE, ...PINK, ...FLAIR];

// ------------------------------------------------------------------ buddies: life-size characters that stand next to the person (see buddies/)
export { BUDDIES };
export interface FieldDef { id: FieldId; name: string; accent: string }
/** the "fields" the buddies come from (the tabs of the buddy list) */
export const FIELDS: ReadonlyArray<FieldDef> = [
  { id: 'kpop', name: 'K-Pop', accent: '#9b4dff' },
  { id: 'kdrama', name: 'K-Drama', accent: '#ff4f8b' },
  { id: 'movies', name: 'Movies', accent: '#f2a900' },
  { id: 'anime', name: 'Anime', accent: '#4da6ff' },
  { id: 'cute', name: 'Cute', accent: '#ff8fb1' },
  { id: 'fun', name: 'Fun', accent: '#2fcf9b' }
];
export const buddiesIn = (field: FieldId): StickerDef[] => BUDDIES.filter((b) => b.buddy?.field === field);

const byId = new Map<string, StickerDef>([...STICKERS, ...BUDDIES].map((s) => [s.id, s]));
export const stickerById = (id: string): StickerDef | undefined => byId.get(id);
export const stickersIn = (pack: PackId): StickerDef[] => STICKERS.filter((s) => s.pack === pack);

/** the first tab: the best of every pack */
export const FEATURED: ReadonlyArray<string> = [
  'kd-saranghae', 'pp-lightstick', 'an-eyes', 'pk-crown', 'kd-umbrella', 'an-sakura', 'pk-photocard', 'km-clapper', 'kd-daebak', 'fl-sparkles', 'pp-heart', 'kd-ramyeon', 'an-don', 'pk-bow', 'km-popcorn', 'fl-rainbow'
];

/** the words people may search with: BTS / Blackpink / anime names lead to the packs that hold their kind of sticker (no real band or show name is used in the stickers themselves) */
const ALIASES: ReadonlyArray<readonly [RegExp, PackId]> = [
  [/\b(bts|army|purple|borahae)\b/i, 'purple'],
  [/\b(blackpink|blink|pink)\b/i, 'pink'],
  [/\b(anime|manga|naruto|one piece|dragon ball|goku|luffy|japan)\b/i, 'anime'],
  [/\b(drama|k-?drama|korean drama|crash landing|goblin)\b/i, 'kdrama'],
  [/\b(movie|film|cinema|squid|parasite|busan)\b/i, 'kmovie']
];
const FIELD_WORDS: ReadonlyArray<readonly [RegExp, FieldId]> = [
  [/(bts|army|blackpink|blink|idol|k-?pop|kpop|singer|concert)/i, 'kpop'],
  [/(drama|k-?drama|korean drama|romance|rain)/i, 'kdrama'],
  [/(movie|movies|film|cinema|popcorn|director|bollywood|hollywood)/i, 'movies'],
  [/(anime|manga|ninja|naruto|japan|japanese|kawaii|fox)/i, 'anime'],
  [/(cute|kawaii|pet|animal)/i, 'cute'],
  [/(fun|fantasy)/i, 'fun']
];
/** the buddies that match a search: their name, what they are, or the field the words belong to */
export function searchBuddies(q: string): StickerDef[] {
  const text = q.trim().toLowerCase();
  if (!text) return [...BUDDIES];
  const fields = new Set(FIELD_WORDS.filter(([re]) => re.test(text)).map(([, f]) => f));
  return BUDDIES.filter((b) => fields.has(b.buddy?.field as FieldId) || b.name.toLowerCase().includes(text) || (b.buddy?.tagline || '').toLowerCase().includes(text) || (b.words || '').toLowerCase().includes(text));
}

export function searchStickers(q: string): StickerDef[] {
  const text = q.trim().toLowerCase();
  if (!text) return [];
  const packs = new Set(ALIASES.filter(([re]) => re.test(text)).map(([, p]) => p));
  return STICKERS.filter((s) => packs.has(s.pack) || s.name.toLowerCase().includes(text) || (s.words || '').toLowerCase().includes(text));
}
