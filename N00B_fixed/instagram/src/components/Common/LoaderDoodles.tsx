import React from 'react';

// The big, colourful doodles of the loading page (Common/NoobStackLoader.tsx): flat bright colours with a thick dark outline, drawn in code (no picture files), so they are sharp on every screen.
// Each one is an inline picture 100 x 100; the loading page puts six of them in a loose group that gently bobs. Nothing here moves by itself: the movement is the CSS of .nl-doodle.
const INK = '#17171c';
const S = { stroke: INK, strokeWidth: 3.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const Heart = (): React.ReactElement => (
  <>
    <path d="M50 88 C8 60 6 30 27 21 C40 16 50 25 50 34 C50 25 60 16 73 21 C94 30 92 60 50 88Z" fill="#FF4D6D" {...S} />
    <path d="M24 36 C26 30 32 28 36 31" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" opacity=".85" />
  </>
);
const Star = (): React.ReactElement => (
  <>
    <path d="M50 8 L61 36 L92 38 L68 57 L76 88 L50 71 L24 88 L32 57 L8 38 L39 36Z" fill="#FFC62E" {...S} />
    <circle cx="44" cy="44" r="3" fill={INK} /><circle cx="58" cy="44" r="3" fill={INK} />
    <path d="M44 55 C48 60 54 60 58 55" fill="none" {...S} strokeWidth="2.6" />
  </>
);
const Note = (): React.ReactElement => (
  <>
    <path d="M38 22 L82 12 L82 66 L38 76Z" fill="#8B5CF6" {...S} />
    <ellipse cx="28" cy="78" rx="14" ry="11" fill="#FF8AC6" {...S} />
    <ellipse cx="72" cy="68" rx="14" ry="11" fill="#FF8AC6" {...S} />
    <path d="M42 36 L78 28" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".8" />
  </>
);
const Camera = (): React.ReactElement => (
  <>
    <rect x="9" y="28" width="82" height="58" rx="14" fill="#2EC4B6" {...S} />
    <path d="M30 28 L36 16 L64 16 L70 28Z" fill="#1FA79A" {...S} />
    <circle cx="50" cy="57" r="19" fill="#fff" {...S} />
    <circle cx="50" cy="57" r="10" fill="#4DA3FF" {...S} />
    <circle cx="44" cy="52" r="3" fill="#fff" />
    <circle cx="80" cy="40" r="4" fill="#FFC62E" stroke={INK} strokeWidth="2" />
  </>
);
const Controller = (): React.ReactElement => (
  <>
    <path d="M24 30 H76 C90 30 96 46 94 62 C92 78 82 84 74 76 L66 66 H34 L26 76 C18 84 8 78 6 62 C4 46 10 30 24 30Z" fill="#FF8A3D" {...S} />
    <path d="M25 48 H39 M32 41 V55" stroke={INK} strokeWidth="5" strokeLinecap="round" />
    <circle cx="66" cy="44" r="5" fill="#FFC62E" stroke={INK} strokeWidth="2.4" />
    <circle cx="77" cy="53" r="5" fill="#4DA3FF" stroke={INK} strokeWidth="2.4" />
  </>
);
const Chat = (): React.ReactElement => (
  <>
    <path d="M18 14 H82 C90 14 94 20 94 28 V56 C94 64 90 70 82 70 H52 L30 90 V70 H18 C10 70 6 64 6 56 V28 C6 20 10 14 18 14Z" fill="#4DA3FF" {...S} />
    <circle cx="30" cy="42" r="5.5" fill="#fff" stroke={INK} strokeWidth="2.4" />
    <circle cx="50" cy="42" r="5.5" fill="#fff" stroke={INK} strokeWidth="2.4" />
    <circle cx="70" cy="42" r="5.5" fill="#fff" stroke={INK} strokeWidth="2.4" />
  </>
);
const Rocket = (): React.ReactElement => (
  <>
    <path d="M50 6 C70 20 74 46 68 68 H32 C26 46 30 20 50 6Z" fill="#FF5C8A" {...S} />
    <circle cx="50" cy="38" r="9" fill="#BDEBFF" {...S} />
    <path d="M32 54 L14 74 L32 70Z M68 54 L86 74 L68 70Z" fill="#8B5CF6" {...S} />
    <path d="M40 68 C44 84 50 94 50 94 C50 94 56 84 60 68Z" fill="#FFC62E" {...S} />
  </>
);
const IceCream = (): React.ReactElement => (
  <>
    <path d="M30 50 L50 94 L70 50Z" fill="#F2A65A" {...S} />
    <path d="M38 62 L58 70 M44 76 L56 62" stroke={INK} strokeWidth="2.2" strokeLinecap="round" opacity=".55" />
    <circle cx="50" cy="38" r="22" fill="#FF8FB1" {...S} />
    <path d="M30 44 C34 54 42 52 46 56 C52 52 60 56 70 44" fill="#FFF3D6" {...S} strokeWidth="2.8" />
    <circle cx="50" cy="12" r="6" fill="#FF3B5C" {...S} strokeWidth="2.6" />
  </>
);
const Balloon = (): React.ReactElement => (
  <>
    <path d="M50 8 C74 8 84 28 80 46 C76 62 62 68 50 68 C38 68 24 62 20 46 C16 28 26 8 50 8Z" fill="#7BD88F" {...S} />
    <path d="M44 68 L50 76 L56 68Z" fill="#4BB866" {...S} strokeWidth="2.6" />
    <path d="M50 76 C42 82 58 86 50 94" fill="none" {...S} strokeWidth="2.6" />
    <path d="M32 24 C34 18 40 15 45 16" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" opacity=".85" />
  </>
);
const Bolt = (): React.ReactElement => (
  <path d="M58 6 L22 54 H46 L38 94 L80 40 H55Z" fill="#FFD23F" {...S} />
);
const Smile = (): React.ReactElement => (
  <>
    <circle cx="50" cy="50" r="40" fill="#FFC62E" {...S} />
    <circle cx="36" cy="42" r="5" fill={INK} /><circle cx="64" cy="42" r="5" fill={INK} />
    <path d="M30 58 C38 76 62 76 70 58Z" fill="#fff" {...S} strokeWidth="2.8" />
    <circle cx="26" cy="56" r="6" fill="#FF8AA0" opacity=".7" /><circle cx="74" cy="56" r="6" fill="#FF8AA0" opacity=".7" />
  </>
);
const Gift = (): React.ReactElement => (
  <>
    <rect x="12" y="42" width="76" height="46" rx="6" fill="#FF5C8A" {...S} />
    <rect x="8" y="30" width="84" height="16" rx="5" fill="#FF7FA6" {...S} />
    <path d="M50 30 V88" stroke={INK} strokeWidth="3.2" />
    <rect x="43" y="30" width="14" height="58" fill="#FFC62E" stroke={INK} strokeWidth="3" />
    <path d="M50 30 C34 8 18 20 34 30Z M50 30 C66 8 82 20 66 30Z" fill="#FFC62E" {...S} />
  </>
);

export const LOADER_DOODLES: { id: string; Art: () => React.ReactElement }[] = [
  { id: 'heart', Art: Heart }, { id: 'star', Art: Star }, { id: 'note', Art: Note }, { id: 'camera', Art: Camera }, { id: 'controller', Art: Controller }, { id: 'chat', Art: Chat },
  { id: 'rocket', Art: Rocket }, { id: 'icecream', Art: IceCream }, { id: 'balloon', Art: Balloon }, { id: 'bolt', Art: Bolt }, { id: 'smile', Art: Smile }, { id: 'gift', Art: Gift }
];

/** one doodle as a picture of its own (aria-hidden: they are decoration) */
export const Doodle: React.FC<{ id: string; className?: string; style?: React.CSSProperties }> = ({ id, className, style }) => {
  const d = LOADER_DOODLES.find((x) => x.id === id);
  if (!d) return null;
  return <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden="true" focusable="false"><d.Art /></svg>;
};
