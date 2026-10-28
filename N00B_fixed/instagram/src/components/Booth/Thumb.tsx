import React, { useEffect, useRef } from 'react';
import { drawSticker } from '../../booth/scene';

// The little moving pictures of the Booth (a buddy on its card, a sticker on its button). One shared clock draws all of them, about 12 times a second, and only the ones that are on
// the screen, so a list of fifty moving stickers costs the phone very little.
interface Entry { cv: HTMLCanvasElement; id: string; on: boolean }
const entries = new Set<Entry>();
const byEl = new WeakMap<Element, Entry>();
let timer = 0;

function paint(e: Entry, t: number): void {
  const c = e.cv.getContext('2d');
  if (!c) return;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, e.cv.width, e.cv.height);
  drawSticker(c, e.id, e.cv.width / 2, e.cv.height / 2, e.cv.width * 0.98, 0, false, t);
}
const tick = (): void => {
  if (document.hidden) return;
  const t = performance.now() / 1000;
  entries.forEach((e) => { if (e.on) paint(e, t); });
};
const watcher = typeof IntersectionObserver !== 'undefined'
  ? new IntersectionObserver((list) => { for (const it of list) { const e = byEl.get(it.target); if (e) e.on = it.isIntersecting; } })
  : null;

function add(e: Entry): void {
  entries.add(e); byEl.set(e.cv, e); watcher?.observe(e.cv);
  paint(e, performance.now() / 1000);
  if (!timer) timer = window.setInterval(tick, 83);
}
function remove(e: Entry): void {
  entries.delete(e); byEl.delete(e.cv); watcher?.unobserve(e.cv);
  if (!entries.size && timer) { window.clearInterval(timer); timer = 0; }
}

export const Thumb: React.FC<{ id: string; size: number; className?: string }> = ({ id, size, className }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const e: Entry = { cv, id, on: true };
    add(e);
    return () => remove(e);
  }, [id]);
  return <canvas ref={ref} width={size * 2} height={size * 2} className={className} style={{ width: size, height: size }} aria-hidden="true" />;
};
