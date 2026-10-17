// Shared between the post/reel creation form (the picker) and every place a
// post/reel is displayed (to render the chosen filter) — a single source so
// the two can never drift out of sync with each other.
export const POST_FILTERS = [
  { id: 'normal', name: 'Normal', css: '' },
  { id: 'clarendon', name: 'Clarendon', css: 'contrast(1.25) saturate(1.25)' },
  { id: 'gingham', name: 'Gingham', css: 'brightness(1.05) hue-rotate(-10deg)' },
  { id: 'moon', name: 'Moon', css: 'grayscale(1) contrast(1.1) brightness(1.1)' },
  { id: 'lark', name: 'Lark', css: 'contrast(0.9) brightness(1.15) saturate(1.2)' },
  { id: 'reyes', name: 'Reyes', css: 'sepia(0.22) brightness(1.1) contrast(0.85) saturate(0.75)' },
  { id: 'juno', name: 'Juno', css: 'contrast(1.15) saturate(1.4)' },
  { id: 'slumber', name: 'Slumber', css: 'saturate(0.66) brightness(1.05)' },
  { id: 'crema', name: 'Crema', css: 'sepia(0.5) contrast(1.25) brightness(1.15) saturate(0.9)' },
  { id: 'ludwig', name: 'Ludwig', css: 'sepia(0.25) contrast(1.05) brightness(1.05) saturate(2)' },
  { id: 'aden', name: 'Aden', css: 'hue-rotate(-20deg) contrast(0.9) saturate(0.85) brightness(1.2)' },
  { id: 'perpetua', name: 'Perpetua', css: 'contrast(1.1) brightness(1.25) saturate(1.1)' },
  { id: 'emerald', name: 'Emerald Glow', css: 'hue-rotate(60deg) contrast(1.25) saturate(1.5)' },
  { id: 'cyber', name: 'Cyber Neon', css: 'hue-rotate(180deg) contrast(1.5) brightness(1.1)' },
  { id: 'gala', name: 'GALA Preset', css: 'contrast(1.1) sepia(0.25) brightness(1.05)' },
  { id: 'monochrome', name: 'Monochrome', css: 'grayscale(1) contrast(1.25)' }
];
