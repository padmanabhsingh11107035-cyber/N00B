import React from 'react';

// The coloured pictures of the NOOB help desk: one for each way to get help (the tiles of the "Need help?" screen) and the five faces of the rating at the end of a chat.
// They are drawn here as small svg files of their own (flat colour with a little light, no outline), so they look the same in the light and dark theme of the app.
type P = { className?: string };

export const ChatTileIcon: React.FC<P> = ({ className }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
    <path d="M7 8h25a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H19l-8 7v-7H7a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4z" fill="#2fb457" />
    <path d="M7 8h25a4 4 0 0 1 4 4v3H3v-3a4 4 0 0 1 4-4z" fill="#46c96c" />
    <path d="M20 19h21a4 4 0 0 1 4 4v13a4 4 0 0 1-4 4h-3v6l-8-6H20a4 4 0 0 1-4-4V23a4 4 0 0 1 4-4z" fill="#ffc83d" />
    <path d="M20 19h21a4 4 0 0 1 4 4v2H16v-2a4 4 0 0 1 4-4z" fill="#ffd966" />
    <circle cx="24.500" cy="31" r="2" fill="#7a5a00" /><circle cx="30.500" cy="31" r="2" fill="#7a5a00" /><circle cx="36.500" cy="31" r="2" fill="#7a5a00" />
  </svg>
);

export const CallTileIcon: React.FC<P> = ({ className }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="sdi-call" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4aa3ff" /><stop offset="1" stopColor="#1769e0" /></linearGradient>
    </defs>
    <path d="M13.800 6.500c1.200-1.200 3.200-.8 4 .7l2.600 5.200c.6 1.200.3 2.600-.7 3.500l-2.200 1.900c2.200 4.200 5.600 7.700 9.900 9.900l1.900-2.200c.9-1 2.300-1.300 3.500-.7l5.200 2.600c1.500.8 1.900 2.800.7 4-3.200 3.600-8 4.200-13.600 1.600C18.200 33.600 11.800 27 8.700 20.300 6.100 14.700 6.500 9.900 10.100 7.100z" fill="url(#sdi-call)" />
    <path d="M30 9.500a10 10 0 0 1 8.500 8.500" fill="none" stroke="#ff9f43" strokeWidth="3.200" strokeLinecap="round" />
    <path d="M30.500 3.500A16 16 0 0 1 44.500 17.500" fill="none" stroke="#ffc83d" strokeWidth="3.200" strokeLinecap="round" />
  </svg>
);

export const FaqTileIcon: React.FC<P> = ({ className }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
    <path d="M9 7h27a5 5 0 0 1 5 5v17a5 5 0 0 1-5 5H24l-9 8v-8H9a5 5 0 0 1-5-5V12a5 5 0 0 1 5-5z" fill="#8b5cf6" />
    <path d="M9 7h27a5 5 0 0 1 5 5v4H4v-4a5 5 0 0 1 5-5z" fill="#a284fb" />
    <path d="M18.500 17.500c0-3.200 2.200-5 5.200-5 3 0 5.200 1.800 5.200 4.600 0 4.200-5.200 4.200-5.200 8" fill="none" stroke="#fff" strokeWidth="3.200" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="23.700" cy="28.800" r="2" fill="#fff" />
    <circle cx="40" cy="11" r="6" fill="#ff6fa8" /><path d="M40 7.500l1 2.300 2.500.2-1.900 1.600.6 2.400-2.200-1.300-2.200 1.300.6-2.400-1.900-1.600 2.500-.2z" fill="#fff" />
  </svg>
);

export const ReportTileIcon: React.FC<P> = ({ className }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
    <path d="M24 3.500l16 5.500v12.500c0 11.500-7 19.500-16 23.500C15 41 8 33 8 21.500V9z" fill="#ef4444" />
    <path d="M24 3.500v41C15 41 8 33 8 21.500V9z" fill="#ff6b5e" />
    <rect x="22.200" y="13" width="3.600" height="15" rx="1.800" fill="#fff" />
    <circle cx="24" cy="33.200" r="2.300" fill="#fff" />
    <circle cx="39" cy="38" r="6.500" fill="#ffc83d" /><path d="M36.500 38l1.800 1.800 3.400-3.600" fill="none" stroke="#7a5a00" strokeWidth="2.200" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const TicketTileIcon: React.FC<P> = ({ className }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
    <path d="M5 13a3 3 0 0 1 3-3h32a3 3 0 0 1 3 3v6a5 5 0 0 0 0 10v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-6a5 5 0 0 0 0-10z" fill="#fb923c" />
    <path d="M5 13a3 3 0 0 1 3-3h32a3 3 0 0 1 3 3v3H5z" fill="#fdad63" />
    <path d="M32 12v24" stroke="#fff" strokeWidth="2.400" strokeDasharray="3.200 3.200" strokeLinecap="round" />
    <path d="M17.500 17l2.300 4.700 5.200.7-3.800 3.600.9 5.200-4.600-2.500-4.600 2.500.9-5.200L10 22.400l5.200-.7z" fill="#ffe27a" />
    <rect x="35.500" y="19" width="5" height="3" rx="1.500" fill="#fff" /><rect x="35.500" y="25" width="5" height="3" rx="1.500" fill="#fff" />
  </svg>
);

export const PaymentTileIcon: React.FC<P> = ({ className }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
    <circle cx="17" cy="11" r="7" fill="#facc15" /><path d="M17 7.500v7M14.500 9.700c.4-1.300 4.600-1.700 5 .1.400 2-4.800 1.100-4.600 3.200.2 1.500 4 1.400 4.700.1" fill="none" stroke="#a16207" strokeWidth="1.500" strokeLinecap="round" />
    <rect x="5" y="14" width="38" height="28" rx="6" fill="#14b8a6" />
    <path d="M5 20a6 6 0 0 1 6-6h26a6 6 0 0 1 6 6v2H5z" fill="#2dd4bf" />
    <rect x="29" y="25" width="17" height="11" rx="5.500" fill="#0d9488" />
    <circle cx="35" cy="30.500" r="2.600" fill="#fde047" />
  </svg>
);

export const IdeaTileIcon: React.FC<P> = ({ className }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
    <path d="M24 4a14 14 0 0 0-8 25.500V34a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4.500A14 14 0 0 0 24 4z" fill="#ffc83d" />
    <path d="M24 4a14 14 0 0 0-14 14h28A14 14 0 0 0 24 4z" fill="#ffdc7a" />
    <rect x="17" y="37.500" width="14" height="4" rx="2" fill="#9ca3af" /><rect x="19.500" y="42" width="9" height="3" rx="1.500" fill="#6b7280" />
    <path d="M20 22l4 5 4-5" fill="none" stroke="#a16207" strokeWidth="2.200" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ------------------------------------------------------------------ the five faces of the rating (1 = angry ... 5 = loves it)
export type FaceKind = 'angry' | 'sad' | 'okay' | 'happy' | 'love';
const FACE_FILL: Record<FaceKind, [string, string]> = {
  angry: ['#ff7a6e', '#e93b2f'],
  sad: ['#ffb468', '#f07f1a'],
  okay: ['#ffe071', '#f5b800'],
  happy: ['#cde87a', '#8fc83a'],
  love: ['#6fe08f', '#22b455']
};
const INK = '#3a2a1c';

export const RatingFace: React.FC<{ kind: FaceKind; className?: string }> = ({ kind, className }) => {
  const [a, b] = FACE_FILL[kind];
  const id = `sdf-${kind}`;
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={id} cx="35%" cy="28%" r="80%"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></radialGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill={`url(#${id})`} />
      {kind === 'angry' && (<>
        <path d="M11.500 14.500l10 4.500M36.500 14.500l-10 4.500" stroke={INK} strokeWidth="2.800" strokeLinecap="round" />
        <circle cx="17" cy="23" r="2.300" fill={INK} /><circle cx="31" cy="23" r="2.300" fill={INK} />
        <path d="M15.500 35c5-6 12-6 17 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      </>)}
      {kind === 'sad' && (<>
        <path d="M12 17l8-2.500M36 17l-8-2.500" stroke={INK} strokeWidth="2.400" strokeLinecap="round" />
        <circle cx="17" cy="22.500" r="2.300" fill={INK} /><circle cx="31" cy="22.500" r="2.300" fill={INK} />
        <path d="M16.500 34.500c4.500-4.500 10.500-4.500 15 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        <path d="M34.500 27.500c1.800 2.600 2.400 4 .2 4.700-2.100-.7-2.100-2.100-.2-4.700z" fill="#6cb8ff" />
      </>)}
      {kind === 'okay' && (<>
        <circle cx="17" cy="21.500" r="2.300" fill={INK} /><circle cx="31" cy="21.500" r="2.300" fill={INK} />
        <path d="M16.500 32.500h15" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      </>)}
      {kind === 'happy' && (<>
        <circle cx="17" cy="21" r="2.300" fill={INK} /><circle cx="31" cy="21" r="2.300" fill={INK} />
        <path d="M15.500 28.500c3.200 7.500 13.800 7.500 17 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        <circle cx="11.500" cy="29" r="2.800" fill="#ff8aa0" opacity=".45" /><circle cx="36.500" cy="29" r="2.800" fill="#ff8aa0" opacity=".45" />
      </>)}
      {kind === 'love' && (<>
        <path d="M17 26.500c-4.600-3.200-5.500-6.200-3.600-8.200 1.500-1.500 3.100-1 3.600.4.500-1.400 2.100-1.900 3.600-.4 1.900 2 1 5-3.600 8.200z" fill="#e5254a" />
        <path d="M31 26.500c-4.600-3.200-5.500-6.200-3.600-8.200 1.500-1.500 3.100-1 3.600.4.500-1.400 2.100-1.900 3.600-.4 1.900 2 1 5-3.600 8.200z" fill="#e5254a" />
        <path d="M14.500 30c1.200 8 17.800 8 19 0z" fill={INK} />
        <path d="M19 35.500c2.800-2.200 7.200-2.200 10 0-2.800 2.400-7.200 2.400-10 0z" fill="#ff7a8a" />
      </>)}
    </svg>
  );
};

export const FACES: Array<{ value: 1 | 2 | 3 | 4 | 5; kind: FaceKind; label: string }> = [
  { value: 1, kind: 'angry', label: 'Very bad' },
  { value: 2, kind: 'sad', label: 'Bad' },
  { value: 3, kind: 'okay', label: 'Okay' },
  { value: 4, kind: 'happy', label: 'Good' },
  { value: 5, kind: 'love', label: 'Loved it!' }
];
