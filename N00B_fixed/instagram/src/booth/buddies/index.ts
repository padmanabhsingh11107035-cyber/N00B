// All the buddies, by field.
import type { StickerDef } from '../kit.ts';
import { ANIME_BUDDIES } from './anime.ts';
import { CUTE_BUDDIES } from './cute.ts';
import { DRAMA_BUDDIES } from './drama.ts';
import { FUN_BUDDIES } from './fun.ts';
import { KPOP_BUDDIES } from './kpop.ts';
import { MOVIE_BUDDIES } from './movie.ts';

export const BUDDIES: ReadonlyArray<StickerDef> = [...KPOP_BUDDIES, ...DRAMA_BUDDIES, ...MOVIE_BUDDIES, ...ANIME_BUDDIES, ...CUTE_BUDDIES, ...FUN_BUDDIES];
