// The "Rotating Story" (the trend from Instagram's Ray-Ban Meta stories): the picture of a story turns while people watch it. Three ways, chosen when the story is made:
//   spin  = it turns slowly all the way round
//   swing = it swings from side to side like a pendulum
//   tilt  = it tilts in 3D, as if held in a hand
// The choice travels with the story as one more "sticker" of the type 'effect', so no database change is needed, and a phone that does not know it simply shows a still picture.
import type { Story } from '../types';

type StorySticker = NonNullable<Story['stickers']>[number];

export type RotateMode = 'off' | 'spin' | 'swing' | 'tilt';
export const ROTATE_MODES: { id: RotateMode; label: string; hint: string }[] = [
  { id: 'off', label: 'Still', hint: 'The picture stays as it is' },
  { id: 'spin', label: 'Spin', hint: 'Turns slowly all the way round' },
  { id: 'swing', label: 'Swing', hint: 'Swings from side to side' },
  { id: 'tilt', label: 'Tilt 3D', hint: 'Tilts like it is held in a hand' }
];

/** The sticker to add to a story for this choice (nothing for "still"). */
export function rotateSticker(mode: RotateMode): StorySticker | null {
  return mode === 'off' ? null : { type: 'effect', data: { kind: 'rotate', mode }, x: 50, y: 50 };
}

/** Which rotation a story has, from its stickers ('off' when none, or when the value is not one we know). */
export function rotateModeOf(stickers: ReadonlyArray<{ type?: string; data?: any }> | null | undefined): RotateMode {
  const s = (stickers || []).find((x) => x && x.type === 'effect' && x.data?.kind === 'rotate');
  const m = s?.data?.mode;
  return m === 'spin' || m === 'swing' || m === 'tilt' ? m : 'off';
}

/** The class that plays the turning (defined in index.css); empty for a still picture. */
export function rotateClass(mode: RotateMode): string {
  return mode === 'off' ? '' : `noob-rotate-${mode}`;
}
