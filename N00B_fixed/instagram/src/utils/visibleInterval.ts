// A setInterval that rests while the page is hidden (another tab, a locked phone, the app in the background).
//
// A plain setInterval keeps asking the server every few seconds even when nobody is looking at the screen, which is pure wasted
// traffic (and database work). This one:
//   * skips its turn while the page is hidden,
//   * the moment the page is shown again, runs once straight away if the last run was longer ago than the interval, so what the
//     person sees is fresh again without waiting for the next tick.
// Returns a function that stops it. Do NOT use this for a heartbeat that has to keep going in the background (presence in a room).

export function setVisibleInterval(run: () => void, ms: number): () => void {
  let last = Date.now();
  const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
  const fire = () => { last = Date.now(); run(); };
  const timer = setInterval(() => { if (!hidden()) fire(); }, ms);
  const onShow = () => { if (!hidden() && Date.now() - last >= ms) fire(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onShow);
  return () => {
    clearInterval(timer);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onShow);
  };
}
