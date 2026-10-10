import { PlayerColor, TokenState } from '../types';

export interface GridCoord {
  x: number;
  y: number;
}

// 15x15 Standard Ludo Track Coordinates (52 cells)
export const TRACK_COORDINATES_4P: GridCoord[] = [
  { x: 1, y: 6 },  // 0  Red Start (Safe)
  { x: 2, y: 6 },  // 1
  { x: 3, y: 6 },  // 2
  { x: 4, y: 6 },  // 3
  { x: 5, y: 6 },  // 4
  { x: 6, y: 5 },  // 5
  { x: 6, y: 4 },  // 6
  { x: 6, y: 3 },  // 7
  { x: 6, y: 2 },  // 8  Safe Star
  { x: 6, y: 1 },  // 9
  { x: 6, y: 0 },  // 10
  { x: 7, y: 0 },  // 11
  { x: 8, y: 0 },  // 12
  { x: 8, y: 1 },  // 13 Green Start (Safe)
  { x: 8, y: 2 },  // 14
  { x: 8, y: 3 },  // 15
  { x: 8, y: 4 },  // 16
  { x: 8, y: 5 },  // 17
  { x: 9, y: 6 },  // 18
  { x: 10, y: 6 }, // 19
  { x: 11, y: 6 }, // 20
  { x: 12, y: 6 }, // 21 Safe Star
  { x: 13, y: 6 }, // 22
  { x: 14, y: 6 }, // 23
  { x: 14, y: 7 }, // 24
  { x: 14, y: 8 }, // 25
  { x: 13, y: 8 }, // 26 Yellow Start (Safe)
  { x: 12, y: 8 }, // 27
  { x: 11, y: 8 }, // 28
  { x: 10, y: 8 }, // 29
  { x: 9, y: 8 },  // 30
  { x: 8, y: 9 },  // 31
  { x: 8, y: 10 }, // 32
  { x: 8, y: 11 }, // 33
  { x: 8, y: 12 }, // 34 Safe Star
  { x: 8, y: 13 }, // 35
  { x: 8, y: 14 }, // 36
  { x: 7, y: 14 }, // 37
  { x: 6, y: 14 }, // 38
  { x: 6, y: 13 }, // 39 Blue Start (Safe)
  { x: 6, y: 12 }, // 40
  { x: 6, y: 11 }, // 41
  { x: 6, y: 10 }, // 42
  { x: 6, y: 9 },  // 43
  { x: 5, y: 8 },  // 44
  { x: 4, y: 8 },  // 45
  { x: 3, y: 8 },  // 46
  { x: 2, y: 8 },  // 47 Safe Star
  { x: 1, y: 8 },  // 48
  { x: 0, y: 8 },  // 49
  { x: 0, y: 7 },  // 50
  { x: 0, y: 6 },  // 51
];

// Home Path Coordinates (5 steps leading into center home triangle for each color)
export const HOME_PATHS_4P: Record<PlayerColor, GridCoord[]> = {
  red: [
    { x: 1, y: 7 },
    { x: 2, y: 7 },
    { x: 3, y: 7 },
    { x: 4, y: 7 },
    { x: 5, y: 7 },
  ],
  green: [
    { x: 7, y: 1 },
    { x: 7, y: 2 },
    { x: 7, y: 3 },
    { x: 7, y: 4 },
    { x: 7, y: 5 },
  ],
  yellow: [
    { x: 13, y: 7 },
    { x: 12, y: 7 },
    { x: 11, y: 7 },
    { x: 10, y: 7 },
    { x: 9, y: 7 },
  ],
  blue: [
    { x: 7, y: 13 },
    { x: 7, y: 12 },
    { x: 7, y: 11 },
    { x: 7, y: 10 },
    { x: 7, y: 9 },
  ],
  purple: [
    { x: 4, y: 7 },
    { x: 5, y: 7 },
    { x: 6, y: 7 },
    { x: 7, y: 7 },
    { x: 7, y: 7 },
  ],
  orange: [
    { x: 10, y: 7 },
    { x: 9, y: 7 },
    { x: 8, y: 7 },
    { x: 7, y: 7 },
    { x: 7, y: 7 },
  ],
};

// Safe track indexes
export const SAFE_TRACK_INDEXES_4P = new Set<number>([
  0,  // Red Start
  8,  // Red Star
  13, // Green Start
  21, // Green Star
  26, // Yellow Start
  34, // Yellow Star
  39, // Blue Start
  47, // Blue Star
]);

// Color start indices on 4P track
export const COLOR_START_INDEX_4P: Record<PlayerColor, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
  purple: 0,
  orange: 26,
};

// Yard token slots (4 slots per color yard, symmetrically centered in 6x6 quadrants)
export const YARD_SLOTS_4P: Record<PlayerColor, GridCoord[]> = {
  red: [
    { x: 1.5, y: 1.5 },
    { x: 3.5, y: 1.5 },
    { x: 1.5, y: 3.5 },
    { x: 3.5, y: 3.5 },
  ],
  green: [
    { x: 10.5, y: 1.5 },
    { x: 12.5, y: 1.5 },
    { x: 10.5, y: 3.5 },
    { x: 12.5, y: 3.5 },
  ],
  yellow: [
    { x: 10.5, y: 10.5 },
    { x: 12.5, y: 10.5 },
    { x: 10.5, y: 12.5 },
    { x: 12.5, y: 12.5 },
  ],
  blue: [
    { x: 1.5, y: 10.5 },
    { x: 3.5, y: 10.5 },
    { x: 1.5, y: 12.5 },
    { x: 3.5, y: 12.5 },
  ],
  purple: [
    { x: 1.5, y: 6.5 },
    { x: 3.5, y: 6.5 },
    { x: 1.5, y: 8.5 },
    { x: 3.5, y: 8.5 },
  ],
  orange: [
    { x: 10.5, y: 6.5 },
    { x: 12.5, y: 6.5 },
    { x: 10.5, y: 8.5 },
    { x: 12.5, y: 8.5 },
  ],
};

// 4 distinct celebration victory slots inside center victory triangle for each player
export const CENTER_HOME_SLOTS_4P: Record<PlayerColor, GridCoord[]> = {
  red: [
    { x: 5.8, y: 6.6 },
    { x: 5.8, y: 7.4 },
    { x: 6.4, y: 6.8 },
    { x: 6.4, y: 7.2 },
  ],
  green: [
    { x: 6.6, y: 5.8 },
    { x: 7.4, y: 5.8 },
    { x: 6.8, y: 6.4 },
    { x: 7.2, y: 6.4 },
  ],
  yellow: [
    { x: 8.2, y: 6.6 },
    { x: 8.2, y: 7.4 },
    { x: 7.6, y: 6.8 },
    { x: 7.6, y: 7.2 },
  ],
  blue: [
    { x: 6.6, y: 8.2 },
    { x: 7.4, y: 8.2 },
    { x: 6.8, y: 7.6 },
    { x: 7.2, y: 7.6 },
  ],
  purple: [
    { x: 6.0, y: 6.8 },
    { x: 6.0, y: 7.2 },
    { x: 6.5, y: 6.8 },
    { x: 6.5, y: 7.2 },
  ],
  orange: [
    { x: 7.5, y: 6.8 },
    { x: 7.5, y: 7.2 },
    { x: 8.0, y: 6.8 },
    { x: 8.0, y: 7.2 },
  ],
};

// Center home triangle default coordinates (fallback)
export const CENTER_HOME_COORDS_4P: Record<PlayerColor, GridCoord> = {
  red: { x: 6.2, y: 7 },
  green: { x: 7, y: 6.2 },
  yellow: { x: 7.8, y: 7 },
  blue: { x: 7, y: 7.8 },
  purple: { x: 6.5, y: 7.5 },
  orange: { x: 7.5, y: 6.5 },
};

// Convert a token's status and position to exact percentage / grid coordinates
export function getTokenScreenCoord(token: TokenState): GridCoord {
  if (token.status === 'yard') {
    const slots = YARD_SLOTS_4P[token.color] || YARD_SLOTS_4P.red;
    return slots[token.id % slots.length];
  }

  if (token.status === 'home') {
    const slots = CENTER_HOME_SLOTS_4P[token.color] || CENTER_HOME_SLOTS_4P.red;
    return slots[token.id % slots.length];
  }

  if (token.status === 'home_path') {
    const path = HOME_PATHS_4P[token.color] || HOME_PATHS_4P.red;
    const idx = Math.min(Math.max(token.position, 0), path.length - 1);
    return path[idx];
  }

  // token.status === 'track'
  const trackIdx = token.position % TRACK_COORDINATES_4P.length;
  return TRACK_COORDINATES_4P[trackIdx];
}
