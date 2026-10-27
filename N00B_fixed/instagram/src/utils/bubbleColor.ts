// The colour of the messages you send (Chat): a smooth two-colour gradient made from the chat's accent colour, with white text. The default (no colour chosen, or plain white, which would hide
// the white text) is NOOB green. Pure, so it can be tested.
const HEX = /^#([0-9a-f]{6})$/i;

export const DEFAULT_BUBBLE = '#10b981';

/** a usable accent: a 6-digit colour that white text can be read on (white and near-white are not) */
export function bubbleAccent(color?: string | null): string {
  const c = String(color || '').trim();
  const m = HEX.exec(c);
  if (!m) return DEFAULT_BUBBLE;
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.82 ? DEFAULT_BUBBLE : c.toLowerCase();
}

/** mixes a colour with white (amount 0 to 1) */
export function lighten(hex: string, amount: number): string {
  const m = HEX.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.round(v + (255 - v) * Math.max(0, Math.min(1, amount)));
  return '#' + [ch((n >> 16) & 255), ch((n >> 8) & 255), ch(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function bubbleStyle(color?: string | null): { background: string; boxShadow: string } {
  const a = bubbleAccent(color);
  return { background: `linear-gradient(135deg, ${a} 0%, ${lighten(a, 0.28)} 100%)`, boxShadow: `0 6px 18px ${a}40` };
}
