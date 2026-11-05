// "Send to Calculator": a post, a reel or a video can be sent to the calculator from its Share sheet. The calculator opens and says what was sent (the kind of content), nothing more.
// The Share sheet is drawn on many pages, so it only calls sendToCalculator; the App listens once and opens the calculator on top of everything.
export type CalculatorItemType = 'post' | 'reel' | 'video';
export interface CalculatorItem { type: CalculatorItemType; itemId: string }

export const CALC_SEND_EVENT = 'noob:send-to-calculator';
export const CALC_TYPE_LABEL: Record<CalculatorItemType, string> = { post: 'Post', reel: 'Reel', video: 'Video' };

export function sendToCalculator(item: CalculatorItem): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<CalculatorItem>(CALC_SEND_EVENT, { detail: item }));
}

/** Calls `cb` whenever something is sent to the calculator; returns the way to stop listening. */
export function onCalculatorSend(cb: (item: CalculatorItem) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const h = (e: Event) => { const d = (e as CustomEvent<CalculatorItem>).detail; if (d && CALC_TYPE_LABEL[d.type]) cb(d); };
  window.addEventListener(CALC_SEND_EVENT, h);
  return () => window.removeEventListener(CALC_SEND_EVENT, h);
}
