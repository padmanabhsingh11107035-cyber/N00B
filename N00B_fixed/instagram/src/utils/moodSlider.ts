// The Mood slider (components/Fun/MoodPage.tsx): one face and one colour for each of the eight moods, in the order of the slider (from low to high), and the maths that blends
// two neighbouring moods while the finger is between them. Pure, so it can be tested without a screen.

export const MOOD_SAVE_DELAY_MS = 700;   // after letting go of the slider; a quick second drag cancels the save

type Face = {
  color: string;
  blg: number; blr: number; brg: number; brr: number;            // left / right brow: gap above the eye, tilt in degrees
  eyeW: number; eyeH: number; pupil: number; pdx: number; pdy: number;
  mouthW: number; mouthH: number; mouthRot: number; mouthY: number; tongue: number; teeth: number;
};

// order = the order of MOODS in utils/moods.ts after sorting them for the slider: angry, sad, tired, bored, confident, happy, excited, loved
export const SLIDER_ORDER = ['angry', 'sad', 'tired', 'bored', 'confident', 'happy', 'excited', 'loved'] as const;

export const moodStops: ReadonlyArray<Face> = [
  /* angry     */ { color: '#d40d0d', blg: 3, blr: 14, brg: 3, brr: -14, eyeW: 86, eyeH: 34, pupil: 8, pdx: 0, pdy: 0, mouthW: 78, mouthH: 42, mouthRot: -5, mouthY: 222, tongue: 0, teeth: 1 },
  /* sad       */ { color: '#ee8d12', blg: 14, blr: -12, brg: 14, brr: 12, eyeW: 78, eyeH: 72, pupil: 22, pdx: 0, pdy: 4, mouthW: 54, mouthH: 30, mouthRot: 5, mouthY: 224, tongue: 0, teeth: 1 },
  /* tired     */ { color: '#e6b30a', blg: 8, blr: 0, brg: 8, brr: 0, eyeW: 80, eyeH: 42, pupil: 20, pdx: 0, pdy: 7, mouthW: 38, mouthH: 26, mouthRot: 0, mouthY: 226, tongue: 0, teeth: 0 },
  /* bored     */ { color: '#f4e10d', blg: 16, blr: 0, brg: 10, brr: 10, eyeW: 88, eyeH: 88, pupil: 22, pdx: -9, pdy: -4, mouthW: 34, mouthH: 34, mouthRot: 8, mouthY: 224, tongue: 0, teeth: 0 },
  /* confident */ { color: '#8fe62a', blg: 14, blr: -6, brg: 18, brr: 8, eyeW: 86, eyeH: 82, pupil: 24, pdx: 6, pdy: 0, mouthW: 66, mouthH: 34, mouthRot: 0, mouthY: 218, tongue: 0.4, teeth: 0 },
  /* happy     */ { color: '#22f23c', blg: 18, blr: -4, brg: 18, brr: 4, eyeW: 92, eyeH: 92, pupil: 26, pdx: 0, pdy: 4, mouthW: 88, mouthH: 60, mouthRot: 0, mouthY: 216, tongue: 1, teeth: 0 },
  /* excited   */ { color: '#22f5a8', blg: 24, blr: -6, brg: 30, brr: 8, eyeW: 100, eyeH: 100, pupil: 28, pdx: 4, pdy: -2, mouthW: 112, mouthH: 78, mouthRot: -3, mouthY: 214, tongue: 1, teeth: 0 },
  /* loved     */ { color: '#ff6fa6', blg: 16, blr: -10, brg: 16, brr: 10, eyeW: 92, eyeH: 92, pupil: 36, pdx: 0, pdy: 0, mouthW: 84, mouthH: 56, mouthRot: 0, mouthY: 216, tongue: 1, teeth: 0 }
];

const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return `rgb(${Math.round(lerp(x[0], y[0], t))},${Math.round(lerp(x[1], y[1], t))},${Math.round(lerp(x[2], y[2], t))})`; };

/** Which of the moods the value (0 to 1) is nearest to. */
export function nearestMood(v: number, last = moodStops.length - 1): number {
  return Math.min(last, Math.max(0, Math.round(v * last)));
}

/** The face and the colour for a value between 0 and 1 (the moods blended where the finger is between two). */
export function moodAt(v: number) {
  const last = moodStops.length - 1;
  const f = Math.min(last, Math.max(0, v * last));
  const i = Math.min(last - 1, Math.floor(f));
  const t = f - i;
  const a = moodStops[i], b = moodStops[i + 1];
  const n = (k: keyof Face) => lerp(a[k] as number, b[k] as number, t);
  return {
    color: mix(a.color, b.color, t),
    browL: { gap: n('blg'), rot: n('blr') }, browR: { gap: n('brg'), rot: n('brr') },
    eyeW: n('eyeW'), eyeH: n('eyeH'), pupil: n('pupil'), pdx: n('pdx'), pdy: n('pdy'),
    mouthW: n('mouthW'), mouthH: n('mouthH'), mouthRot: n('mouthRot'), mouthY: n('mouthY'), tongue: n('tongue'), teeth: n('teeth')
  };
}
