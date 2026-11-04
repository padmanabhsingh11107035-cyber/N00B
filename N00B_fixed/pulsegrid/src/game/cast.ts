import type { Outfit } from './dancer'
import type { Genre } from './dances'

/** The four performers from concept board 05 (YOU, NOVA, KAI, REMI). */
/** `genres`: AIST++ street-dance styles this performer grooves and shows off in. */
export type CastMember = { name: string; outfit: Outfit; style: number; genres: Genre[]; pos: [number, number, number] }

export const CAST: CastMember[] = [
  {
    name: 'YOU',
    style: 0,
    genres: ['LH', 'MH', 'HO', 'JS'],
    pos: [0, 0, 1],
    outfit: {
      body: 'f', skin: 'light', skinTint: '#ffffff', hair: 'long', hairColor: '#2a1c16',
      top: 'bomber', topColor: '#eeeae4', sleeveColor: '#eeeae4', trim: '#d9a53a', inner: '#141418',
      pants: 'cargo', pantsColor: '#1b1b20', shoe: '#f2f0ec', shoeAccent: '#d9a53a', rim: '#ffc94a',
    },
  },
  {
    name: 'NOVA',
    style: 1,
    genres: ['WA', 'JS', 'PO', 'JB'],
    pos: [-3.1, 0, -0.5],
    outfit: {
      body: 'f', skin: 'dark', skinTint: '#ffffff', hair: 'buns', hairColor: '#161013',
      top: 'holo', topColor: '#c9ccd6', sleeveColor: '#c9ccd6', trim: '#b9a2e8', inner: '#c9ccd6',
      pants: 'wide', pantsColor: '#a996d6', shoe: '#c8ccd4', shoeAccent: '#ff5fe0', rim: '#ff5fe0',
    },
  },
  {
    name: 'KAI',
    style: 2,
    genres: ['BR', 'KR', 'MH'],
    pos: [3.1, 0, -0.5],
    outfit: {
      body: 'm', skin: 'dark', skinTint: '#ffffff', hair: 'buzzed', hairColor: '#120d0b',
      top: 'varsity', topColor: '#b3202c', sleeveColor: '#ecebe6', trim: '#b3202c', inner: '#111114',
      pants: 'jogger', pantsColor: '#131317', shoe: '#b3202c', shoeAccent: '#f2f2f2', rim: '#28e0ff',
    },
  },
  {
    name: 'REMI',
    style: 3,
    genres: ['LO', 'PO', 'HO'],
    pos: [0, 0.55, -2.9],
    outfit: {
      body: 'm', skin: 'light', skinTint: '#ffffff', hair: 'parted', hairColor: '#3a2618',
      top: 'hoodie', topColor: '#1d8f8c', sleeveColor: '#1d8f8c', trim: '#e8e6e0', inner: '#1d8f8c',
      pants: 'cargo', pantsColor: '#5d6068', shoe: '#f2f0ec', shoeAccent: '#1d8f8c', rim: '#28e0ff',
    },
  },
]
