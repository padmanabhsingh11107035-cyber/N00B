import { warmCanyonFiles } from './canyonWarmup';
import { warmCritterFiles } from './critterWarmup';
import { warmRogueFiles } from './rogueWarmup';
import { warmUnderhallFiles } from './underhallWarmup';

// The big hosted games (their frame is only created when Play is pressed) fetch their files quietly as soon as the game's own page opens, each in its own way.
export function warmHostedGame(id: string): void {
  if (id === 'canyon_rush_circuit') void warmCanyonFiles('race');
  else if (id === 'critter_kart') void warmCritterFiles('race');
  else if (id === 'the_rogue_shadowfall') void warmRogueFiles('race');
  else if (id === 'underhall_after_curfew') void warmUnderhallFiles();
}
