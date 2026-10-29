import type { Freshness } from './geo.ts';

// NOOB Family Map: the pin of a person on the map: their profile picture in a round frame standing exactly on the place, a dot on the exact spot and the first name under it.
// Built with plain DOM (MapLibre markers are elements). Names and addresses come from other people, so they only ever go in as text / as a picture address, never as HTML.
export interface PinData {
  id: string; name: string; avatar: string; lat: number; lng: number; state: Exclude<Freshness, 'none'>; me: boolean; moving: boolean; hue: number; initial: string;
}

const span = (cls: string): HTMLSpanElement => { const e = document.createElement('span'); e.className = cls; return e; };

function fillBubble(bubble: HTMLElement, d: PinData): void {
  bubble.textContent = '';
  const letter = (): void => { bubble.textContent = d.initial; bubble.style.background = `hsl(${d.hue} 62% 46%)`; bubble.classList.add('fm-pin-letter'); };
  if (!d.avatar) { letter(); return; }
  bubble.classList.remove('fm-pin-letter'); bubble.style.background = '';
  const img = document.createElement('img');
  img.alt = ''; img.decoding = 'async'; img.draggable = false; img.referrerPolicy = 'no-referrer';
  img.onerror = () => letter();
  img.src = d.avatar;
  bubble.appendChild(img);
}

export function refreshPin(el: HTMLElement, d: PinData): void {
  el.className = `fm-pin fm-pin--${d.state}${d.me ? ' fm-pin--me' : ''}${d.moving ? ' fm-pin--moving' : ''}`;
  el.style.zIndex = String(d.me ? 30 : d.state === 'live' ? 20 : d.state === 'recent' ? 10 : 5);
  el.setAttribute('aria-label', `${d.me ? 'You' : d.name}`);
  const bubble = el.querySelector('.fm-pin-bubble') as HTMLElement | null;
  if (bubble && el.dataset.avatar !== d.avatar) { el.dataset.avatar = d.avatar; fillBubble(bubble, d); }
  const label = el.querySelector('.fm-pin-name');
  if (label) label.textContent = d.me ? 'You' : d.name;
}

export function buildPin(d: PinData, onTap: (id: string) => void): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('role', 'button'); el.tabIndex = 0; el.dataset.id = d.id;
  el.append(span('fm-pin-pulse'), span('fm-pin-bubble'), span('fm-pin-dot'), span('fm-pin-name'));
  refreshPin(el, d);
  el.addEventListener('click', (e) => { e.stopPropagation(); onTap(d.id); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(d.id); } });
  return el;
}
