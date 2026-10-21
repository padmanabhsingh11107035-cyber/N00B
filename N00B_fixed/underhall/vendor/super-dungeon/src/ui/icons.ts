/** Inline SVG icons (24×24, stroke-based) so the HUD never depends on font glyph coverage. */
const P: Record<string, string> = {
  fist: '<path d="M7 11V7.5a1.5 1.5 0 0 1 3 0V11m0-4.5V6a1.5 1.5 0 0 1 3 0v5m0-4a1.5 1.5 0 0 1 3 0v4m0-2.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-6-6v-2.5A1.5 1.5 0 0 1 7 11"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  dash: '<path d="M4 7h7M2 12h9M4 17h7"/><path d="M13 5l7 7-7 7"/>',
  star: '<path d="m12 2 2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z"/>',
  quake: '<path d="M2 20h20M5 20l3-7 3 4 3-9 3 6 2-3"/>',
  heart: '<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/>',
  split: '<path d="M12 21V12M12 12 5 4M12 12l7-8M12 12V3"/>',
  battery: '<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M22 11v2M11 9l-2 3h4l-2 3"/>',
  wing: '<path d="M3 16c4 0 8-2 11-6l7-6-2 8c-2 5-7 8-16 8z"/><path d="M8 15c2-1 4-3 5-5"/>',
  spark: '<path d="M12 2v6M12 16v6M2 12h6M16 12h6M5 5l3.5 3.5M15.5 15.5 19 19M5 19l3.5-3.5M15.5 8.5 19 5"/>',
  shield: '<path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z"/>',
  shieldCrest: '<path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z"/><path d="m12 7 1.5 3.2 3.5.4-2.6 2.3.8 3.5L12 14.6l-3.2 1.8.8-3.5L7 10.6l3.5-.4z"/>',
  plus: '<path d="M12 5v14M5 12h14"/><circle cx="12" cy="12" r="10"/>',
  armor: '<path d="M6 3h12l2 5-3 13H7L4 8z"/><path d="M9 3v6h6V3"/>',
  crit: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
  skull: '<path d="M12 2a8 8 0 0 0-8 8c0 3 1.5 5 3 6v3h10v-3c1.5-1 3-3 3-6a8 8 0 0 0-8-8z"/><circle cx="9" cy="11" r="1.6"/><circle cx="15" cy="11" r="1.6"/><path d="M10 19v-2M14 19v-2"/>',
  gem: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M12 21 8 9l4-6 4 6z"/>',
  hand: '<path d="M8 13V5a1.5 1.5 0 0 1 3 0v6m0-1V3.5a1.5 1.5 0 0 1 3 0V11m0-5.5a1.5 1.5 0 0 1 3 0V12m0-3.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1.5a6 6 0 0 1-5-2.7L3 15.5a1.5 1.5 0 0 1 2.5-1.7L8 16"/>',
}

export function icon(name: string): string {
  const body = P[name] ?? P.star
  return `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
}
