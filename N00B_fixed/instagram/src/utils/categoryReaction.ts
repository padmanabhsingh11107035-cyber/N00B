// Every content category already carries its own emoji in CONTENT_CATEGORIES' label ("🏎️ Cars, Bikes &
// Motorsport", "🍔 Food, Cooking & Recipes", ...) — this just pulls it out, so liking a car reel bursts with
// 🏎️, liking a food post bursts with 🍔, and so on, YouTube-Shorts-style. Content with no category (stories,
// highlights) falls back to a plain heart.
import { CONTENT_CATEGORIES } from '../data/mockData';

const FALLBACK_EMOJI = '❤️';

const emojiByCategory: Record<string, string> = Object.fromEntries(
  CONTENT_CATEGORIES.map((c) => [c.id, c.label.split(' ')[0] || FALLBACK_EMOJI])
);

export const reactionEmojiForCategory = (category?: string | null): string =>
  (category && emojiByCategory[category]) || FALLBACK_EMOJI;
