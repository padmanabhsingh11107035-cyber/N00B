// The colour of the top of the Messages page. Yellow (the opening screen's) unless the person picked another of the 30 in the three-dots menu.
// Kept on this device, per account (it is only a look: nothing is sent anywhere).
import { useEffect, useState } from 'react';

export const DEFAULT_HEAD_COLOUR = '#F8CB46';
/** Thirty different colours, no names. The first one is the default. */
export const HEAD_COLOURS: readonly string[] = [
  '#F8CB46', '#FFB020', '#FF8A3D', '#FF6B4A', '#F0483E', '#E23744',
  '#D81B60', '#F06292', '#FF8FAB', '#C2185B', '#9C27B0', '#B388FF',
  '#7C4DFF', '#5E35B1', '#3F51B5', '#5C7CFA', '#2979FF', '#29B6F6',
  '#00B8D4', '#26C6DA', '#00BFA5', '#07ECA8', '#2ECC71', '#7CB342',
  '#C0CA33', '#0E4B37', '#1F2937', '#0A0A0A', '#8D6E63', '#F5F5F7'
];
const EVENT = 'noob:chat-head-colour';
const key = (userId: string) => `noob_chat_head:${userId}`;
const valid = (c: unknown): c is string => typeof c === 'string' && HEAD_COLOURS.includes(c);

export function getHeadColour(userId: string): string {
  try { const c = localStorage.getItem(key(userId)); return valid(c) ? c : DEFAULT_HEAD_COLOUR; } catch { return DEFAULT_HEAD_COLOUR; }
}
export function setHeadColour(userId: string, colour: string): void {
  const c = valid(colour) ? colour : DEFAULT_HEAD_COLOUR;
  try { if (c === DEFAULT_HEAD_COLOUR) localStorage.removeItem(key(userId)); else localStorage.setItem(key(userId), c); } catch { /* storage blocked: the colour lasts until the page is closed */ }
  memory.set(userId, c);
  try { window.dispatchEvent(new Event(EVENT)); } catch { /* nothing listens */ }
}
const memory = new Map<string, string>();
const read = (userId: string) => memory.get(userId) ?? getHeadColour(userId);

/** Black on a light colour, white on a dark one (WCAG relative luminance), so the title, names and buttons can always be read. */
export function inkFor(colour: string): '#0A0A0A' | '#FFFFFF' {
  const n = parseInt(colour.slice(1), 16);
  const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.18 ? '#0A0A0A' : '#FFFFFF';   // 0.18 is where black and white are equally readable: each colour gets the one that reads better
}

/** The chosen colour, kept up to date when it is changed anywhere on the page. */
export function useHeadColour(userId: string): string {
  const [c, setC] = useState(() => read(userId));
  useEffect(() => {
    const on = () => setC(read(userId));
    on();
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [userId]);
  return c;
}
