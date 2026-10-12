// NOOB Draw (weekly prize spins): the shapes the server sends, the rarity look, and the pure rules for the spinning reel and the countdown.
// Kept apart from the screens so they can be tested without a browser (scripts/supabase/test-noob-draw-ui.mjs).

export type DrawRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type DrawKind = 'points' | 'pro' | 'verified' | 'live_avatar' | 'stickers';

export interface DrawPrize {
  id: string;
  kind: DrawKind;
  label: string;
  subtitle: string;
  rarity: DrawRarity;
  odds: number;               // percent, e.g. 12.5
  amount: number | null;
  ref: string | null;
}

export interface DrawPack {
  id: string;
  name: string;
  tagline: string;
  price: number;              // NOOB Points for one more spin once the free one is used
  availableAt: string | null; // null: the free spin is open now; otherwise when it comes back
  lastSpinAt: string | null;
  prizes: DrawPrize[];
}

export interface DrawHistoryItem { pack: string; packName: string | null; label: string; rarity: DrawRarity; kind: DrawKind; message: string | null; paid?: boolean; cost?: number; at: string }
export interface DrawTickerItem { username: string; label: string; rarity: DrawRarity; packName: string | null; at: string }
export interface DrawUnlockedAvatar { id: string; name: string; url: string }

export interface DrawState {
  now: string;
  freePeriod?: 'week' | 'month';   // how often the free spin of each pack comes back
  packs: DrawPack[];
  history: DrawHistoryItem[];
  ticker: DrawTickerItem[];
  unlockedAvatars: DrawUnlockedAvatar[];
}

export interface DrawWonPrize extends Omit<DrawPrize, 'odds'> {
  odds?: number;
  applied: 'ok' | 'fallback';
  message: string;
  presetId?: string;
  endsAt?: string;
  fallbackPoints?: number;
}

export interface DrawSpinResult {
  success: boolean;
  error?: string;
  availableAt?: string;
  paid?: boolean;
  cost?: number;
  price?: number;
  needPoints?: number;          // a paid spin was refused: this many points are needed
  freeReady?: boolean;          // a paid spin was refused: the free one is still waiting
  prize?: DrawWonPrize;
  user?: unknown;
}

// ---- rarity look
export const RARITY_ORDER: DrawRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

export const RARITY: Record<DrawRarity, { label: string; color: string; soft: string; rank: number }> = {
  common:    { label: 'Common',    color: '#a3acbd', soft: 'rgba(163,172,189,0.16)', rank: 0 },
  uncommon:  { label: 'Uncommon',  color: '#4ade80', soft: 'rgba(74,222,128,0.16)',  rank: 1 },
  rare:      { label: 'Rare',      color: '#38bdf8', soft: 'rgba(56,189,248,0.18)',  rank: 2 },
  epic:      { label: 'Epic',      color: '#a78bfa', soft: 'rgba(167,139,250,0.2)',  rank: 3 },
  legendary: { label: 'Legendary', color: '#fbbf24', soft: 'rgba(251,191,36,0.22)',  rank: 4 },
  mythic:    { label: 'Mythic',    color: '#fb7185', soft: 'rgba(251,113,133,0.24)', rank: 5 }
};

export const rarityOf = (r: string | null | undefined): DrawRarity => (r && r in RARITY ? (r as DrawRarity) : 'common');

// the best prizes first
export const byRarityDesc = (a: DrawPrize, b: DrawPrize): number => RARITY[b.rarity].rank - RARITY[a.rarity].rank || (a.odds - b.odds);

// ---- what a prize looks like (an image where there is one)
const kebab = (s: string) => s.replace(/_/g, '-');
export const livePictureUrl = (presetId: string): string => `/live-avatars/${kebab(presetId)}.svg`;
export const firstStickerUrl = (ref: string | null | undefined): string => {
  const first = String(ref || '').split(',').map((x) => x.trim()).find(Boolean);
  return first ? `/draw-stickers/${first}.svg` : '';
};

// "5,000,000 Points" -> "5M"; used where space is tight
export function pointsShort(n: number | null | undefined): string {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '';
  const fmt = (x: number, unit: string) => `${Number.isInteger(x) ? x : x.toFixed(1).replace(/\.0$/, '')}${unit}`;
  if (v >= 1e9) return fmt(v / 1e9, 'B');
  if (v >= 1e6) return fmt(v / 1e6, 'M');
  if (v >= 1e3) return fmt(v / 1e3, 'K');
  return String(v);
}

// ---- the reel: a long strip of prize cards that slows down and stops with the won prize under the marker
export interface ReelOptions { length?: number; winnerIndex?: number; rng?: () => number }

// Filler cards follow the real odds (so the strip looks like what is really inside), the won prize sits at winnerIndex.
export function buildReel(prizes: DrawPrize[], winnerId: string | null, opts: ReelOptions = {}): DrawPrize[] {
  const { length = 56, winnerIndex = 46, rng = Math.random } = opts;
  if (!prizes.length) return [];
  const weight = (p: DrawPrize) => Math.max(0.01, p.odds);
  const pick = (not: string | null): DrawPrize => {
    const pool = prizes.length > 1 && not ? prizes.filter((p) => p.id !== not) : prizes;
    let t = rng() * pool.reduce((s, p) => s + weight(p), 0);
    for (const p of pool) { t -= weight(p); if (t <= 0) return p; }
    return pool[pool.length - 1];
  };
  const strip: DrawPrize[] = [];
  // never the same card twice in a row: it reads as a stutter
  for (let i = 0; i < length; i++) strip.push(pick(strip.length ? strip[strip.length - 1].id : null));
  const winner = winnerId ? prizes.find((p) => p.id === winnerId) : undefined;
  if (winner && winnerIndex >= 0 && winnerIndex < length) strip[winnerIndex] = winner;
  return strip;
}

// How far (px, negative = to the left) the strip must be moved so card `index` sits under the marker in the middle of a viewport of
// width `viewport`. `jitter` (-0.4 .. 0.4, share of a card) lands the marker a little off the card's centre, like a real reel.
export function reelOffset(cardWidth: number, gap: number, index: number, viewport: number, jitter = 0): number {
  const centreOfCard = index * (cardWidth + gap) + cardWidth / 2 + jitter * cardWidth;
  return Math.round(viewport / 2 - centreOfCard);
}

// which card is under the marker for a given strip offset
export function cardAtMarker(cardWidth: number, gap: number, offset: number, viewport: number): number {
  return Math.floor((viewport / 2 - offset) / (cardWidth + gap));
}

// ---- time
export function msUntil(iso: string | null | undefined, now: number = Date.now()): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.max(0, t - now) : 0;
}

// "6d 23h", "4h 12m", "12m 05s", "9s"
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

export const isPackOpen = (pack: Pick<DrawPack, 'availableAt'>, now: number = Date.now()): boolean => !pack.availableAt || msUntil(pack.availableAt, now) <= 0;

// ---- sound and vibration: what is played (the engine that plays it is src/components/Draw/drawFx.ts)
export const SPIN_MS = 6400;                // how long the reel runs
export const TICK_BUZZ_MS = 9;              // one short buzz for every card that passes the marker
export const MIN_TICK_GAP_MS = 38;          // at the very start cards fly past faster than this: not every one gets a click

export interface Tone { f: number; at: number; dur: number; gain: number; type: 'sine' | 'triangle' | 'square' | 'sawtooth'; slideTo?: number }

// the click of a card passing the marker: high and light while the reel is fast, lower and heavier as it slows (progress 0 to 1)
export const tickFreq = (progress: number): number => Math.round(1500 - 650 * Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0)));
export const tickGapOk = (now: number, last: number, gap: number = MIN_TICK_GAP_MS): boolean => now - last >= gap;

const SCALE = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98, 2093];   // C5 E5 G5 C6 E6 G6 C7: always consonant

// The winning sound, different (longer, richer) for every rarity: a rising run of notes, then for the better prizes a deep thump, a
// chord and sparkles. Fixed notes, so the same prize always sounds the same.
export function winTones(rarity: DrawRarity): Tone[] {
  const rank = RARITY[rarity].rank;
  const start = rank === 0 ? 1 : 0;
  const notes = SCALE.slice(start, start + 2 + rank);
  const gap = 0.115 - rank * 0.008;
  const tones: Tone[] = notes.map((f, i) => ({ f, at: i * gap, dur: 0.34, gain: 0.2, type: 'triangle' }));
  const end = notes.length * gap;
  if (rank >= 2) tones.push({ f: 120, slideTo: 40, at: 0, dur: 0.24, gain: 0.5, type: 'sine' });
  if (rank >= 3) for (const f of [SCALE[2], SCALE[3], SCALE[4]]) tones.push({ f, at: end + 0.04, dur: 0.9 + 0.25 * (rank - 3), gain: 0.14, type: 'sine' });
  if (rank >= 2) for (let k = 0; k <= rank; k++) tones.push({ f: 2349 + 260 * k, at: end + 0.1 + k * 0.07, dur: 0.14, gain: 0.07, type: 'sine' });
  return tones.sort((a, b) => a.at - b.at);
}

// the vibration pattern when the reel stops (milliseconds: buzz, pause, buzz, ...)
export function winBuzz(rarity: DrawRarity): number[] {
  const rank = RARITY[rarity].rank;
  if (rank >= 5) return [40, 50, 40, 50, 40, 50, 160];
  if (rank >= 4) return [30, 60, 30, 60, 90];
  if (rank >= 2) return [30, 50, 30];
  return [25];
}

// ---- paying for another spin
export const periodWord = (period: string | undefined): 'week' | 'month' => (period === 'week' ? 'week' : 'month');
export const canAfford = (balance: number | null | undefined, price: number): boolean => Number.isFinite(Number(balance)) && Number(balance) >= price && price > 0;
export const pointsNeeded = (balance: number | null | undefined, price: number): number => Math.max(0, price - (Number.isFinite(Number(balance)) ? Number(balance) : 0));
// "100,000,000" -> "100M"
export const priceShort = (price: number): string => pointsShort(price) || String(price);
