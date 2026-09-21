// The rules behind the chat's emoji and sticker pickers, kept apart from the screens so they can be tested without a browser.

// [emoji, name, search words, group number, Unicode version, the five skin-tone versions (or 0)]
export type EmojiEntry = [string, string, string, number, number, string[] | 0];

export interface EmojiData {
  groups: string[];
  emoji: EmojiEntry[];
}

// The skin tones people can choose: none (the default yellow), then five.
export const TONES = ['', '🏻', '🏼', '🏽', '🏾', '🏿'];

// The emoji to show for the chosen skin tone (0 = default). Emoji without tones are never changed.
export function withTone(entry: EmojiEntry, tone: number): string {
  const skins = entry[5];
  return tone >= 1 && tone <= 5 && skins ? skins[tone - 1] : entry[0];
}

const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

// Emoji matching what was typed: every typed word must start a word of the emoji's name or search words. Names that start with the
// typed text come first.
export function searchEmoji(data: EmojiData, query: string, limit = 120): EmojiEntry[] {
  const q = words(query);
  if (!q.length) return [];
  const hits: { e: EmojiEntry; score: number }[] = [];
  for (const e of data.emoji) {
    const nameWords = words(e[1]);
    const all = [...nameWords, ...e[2].split(' ')];
    if (!q.every((w) => all.some((x) => x.startsWith(w)))) continue;
    hits.push({ e, score: nameWords[0]?.startsWith(q[0]) ? 0 : nameWords.some((x) => x.startsWith(q[0])) ? 1 : 2 });
  }
  hits.sort((a, b) => a.score - b.score);
  return hits.slice(0, limit).map((h) => h.e);
}

export function emojiInGroup(data: EmojiData, group: number): EmojiEntry[] {
  return data.emoji.filter((e) => e[3] === group);
}

// "Recently used": the newest first, no repeats, at most `max`.
export function pushRecent(list: string[], emoji: string, max = 32): string[] {
  return [emoji, ...list.filter((x) => x !== emoji)].slice(0, max);
}

// ------------------------------------------------------------------------------------------------ animated stickers
// [Unicode code point(s) of the emoji, category, a word describing it]
export type StickerEntry = [string, string, string];

const BASE = 'https://fonts.gstatic.com/s/e/notoemoji/latest/';

// The moving picture that is sent, and the small still picture shown in the grid (light, so a screen of stickers loads fast).
export const stickerUrl = (codepoint: string): string => `${BASE}${codepoint}/512.webp`;
export const stickerPreviewUrl = (codepoint: string): string => `${BASE}${codepoint}/128.png`;

// Is this address one of the animated stickers? (Used to show it at sticker size.)
export const isAnimatedStickerUrl = (url?: string | null): boolean => !!url && /^https:\/\/fonts\.gstatic\.com\/s\/e\/notoemoji\/latest\/[0-9a-f_]+\/512\.webp$/.test(url);

export function searchStickers(list: StickerEntry[], query: string, category?: string | null): StickerEntry[] {
  const q = words(query);
  return list.filter((s) => (!category || s[1] === category) && q.every((w) => words(s[2]).some((x) => x.startsWith(w)) || s[1].toLowerCase().startsWith(w)));
}

export const stickerCategories = (list: StickerEntry[]): string[] => [...new Set(list.map((s) => s[1]))];
