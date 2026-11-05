// The look of each Pro plan's card: real metals, from the cheapest to the dearest: titanium silver, bronze, rose gold, champagne gold, black with gold.
// A card is a sweep of light and dark bands (like polished metal) with a fine brushed grain, a streak of light and an engraved edge. Used on the Pro page and in the Wallet.
const metal = (c: string[]): string => `conic-gradient(from 205deg at 26% 16%, ${c[0]}, ${c[1]} 17%, ${c[2]} 31%, ${c[3]} 49%, ${c[4]} 66%, ${c[5]} 83%, ${c[0]})`;

export interface TierLook { bg: string; ink: string; chip: string; glow: string; sub: string; shade: string }

export const TIER_LOOK: Record<string, TierLook> = {
  starter: { bg: metal(['#f1f2f4', '#a4a9b1', '#e3e5e9', '#747a84', '#d8dbe0', '#9096a0']), ink: '#1b1f25', chip: 'linear-gradient(135deg,#fbfbfc,#9aa1ac)', glow: 'rgba(96,104,118,0.55)', sub: 'rgba(27,31,37,0.62)', shade: '0 1px 0 rgba(255,255,255,0.55), 0 -1px 0 rgba(0,0,0,0.18)' },
  plus: { bg: metal(['#e6c198', '#98582a', '#d6a272', '#5b3013', '#c68b55', '#874a1f']), ink: '#2a1507', chip: 'linear-gradient(135deg,#f3d6b3,#a96a37)', glow: 'rgba(140,80,34,0.6)', sub: 'rgba(42,21,7,0.64)', shade: '0 1px 0 rgba(255,226,190,0.45), 0 -1px 0 rgba(0,0,0,0.22)' },
  pro: { bg: metal(['#f5dbd3', '#b7766a', '#ecbcb0', '#7c4238', '#e1a99b', '#a5645a']), ink: '#35150e', chip: 'linear-gradient(135deg,#fbe8e3,#bd7f72)', glow: 'rgba(172,100,88,0.6)', sub: 'rgba(53,21,14,0.64)', shade: '0 1px 0 rgba(255,235,228,0.5), 0 -1px 0 rgba(0,0,0,0.2)' },
  elite: { bg: metal(['#f4e5ac', '#b6882a', '#eacf84', '#775510', '#e0bf66', '#a67a1b']), ink: '#281c05', chip: 'linear-gradient(135deg,#f9efc4,#bd9331)', glow: 'rgba(184,138,36,0.65)', sub: 'rgba(40,28,5,0.66)', shade: '0 1px 0 rgba(255,244,200,0.5), 0 -1px 0 rgba(0,0,0,0.22)' },
  ultimate: { bg: metal(['#4b4b53', '#111115', '#33333a', '#040406', '#2a2a31', '#0b0b0e']), ink: '#efce78', chip: 'linear-gradient(135deg,#f3d98e,#8a6d1f)', glow: 'rgba(0,0,0,0.7)', sub: 'rgba(239,206,120,0.7)', shade: '0 1px 2px rgba(0,0,0,0.75)' }
};

export const TIER_NAMES: Record<string, string> = { starter: 'Starter', plus: 'Plus', pro: 'Pro', elite: 'Elite', ultimate: 'Ultimate' };
