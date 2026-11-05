// "Send to Calculator": a post, a reel or a video can be sent to the calculator from its Share sheet. Nothing opens: the kind of content is put in the calculator's list
// ("Reel sent to Calculator"), which is there the next time the calculator is opened. Kept on this phone, the last few only.
export type CalculatorItemType = 'post' | 'reel' | 'video';
export interface CalculatorItem { type: CalculatorItemType; itemId: string; at?: number }

export const CALC_TYPE_LABEL: Record<CalculatorItemType, string> = { post: 'Post', reel: 'Reel', video: 'Video' };
const KEY = 'noob.calc.sent.v1';
const KEEP = 8;

const valid = (x: unknown): x is CalculatorItem => !!x && typeof x === 'object' && !!CALC_TYPE_LABEL[(x as CalculatorItem).type] && typeof (x as CalculatorItem).itemId === 'string';

export function readCalculatorSent(): CalculatorItem[] {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(valid).slice(0, KEEP) : [];
  } catch { return []; }
}

export function sendToCalculator(item: CalculatorItem): void {
  if (!valid(item)) return;
  try {
    const rest = readCalculatorSent().filter((x) => !(x.type === item.type && x.itemId === item.itemId));
    localStorage.setItem(KEY, JSON.stringify([{ type: item.type, itemId: item.itemId, at: Date.now() }, ...rest].slice(0, KEEP)));
  } catch { /* storage not available: nothing is kept */ }
}

export function clearCalculatorSent(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
