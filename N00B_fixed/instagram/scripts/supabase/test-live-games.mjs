// Online games feel live: matchmaking hears the newcomer at once, and the games where both players play their own round show the other's score live.
// Usage: node --liftoff-only scripts/supabase/test-live-games.mjs
import fs from 'node:fs';
let passed = 0, failed = 0;
const check = (c, l) => { if (c) { passed++; console.log(`  ok   ${l}`); } else { failed++; console.log(`  FAIL ${l}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split('\r').join('');
const modal = read('src/components/Games/GamePlayModal.tsx'), live = read('src/utils/liveScore.ts');

console.log('\n1. Matchmaking');
check(/pingRoom\(`mm-\$\{game\.id\}`\)/.test(modal) && /listenRoom\(`mm-\$\{game\.id\}`, checkMatch\)/.test(modal) && /setInterval\(checkMatch, 1000\)/.test(modal), 'the player who joins last pokes the one waiting, who looks at once (the 1 s check is only a safety net)');
check(/matchmakingListenRef\.current\(\)/.test(modal), 'the listening stops with the search');

console.log('\n2. Live scores');
for (const [file, v] of [['SpeedMathGame', 'score'], ['ColorRushGame', 'score'], ['CyberSnakeGame', 'score'], ['MemoryMatchGame', 'matchesFound'], ['RockPaperScissorsGame', 'playerScore']]) {
  const s = read(`src/components/Games/minigames/${file}.tsx`);
  check(/onProgress\?: \(score: number\) => void/.test(s) && s.includes(`onProgress?.(${v})`), `${file} reports its score as it changes`);
}
check((modal.match(/onProgress=\{reportLive\}/g) || []).length === 5 && /data-testid="live-opponent"/.test(modal), 'the five games are wired and the other player\'s score is shown');
check(/event: 'score'/.test(live) && /noob-live-\$\{code\}/.test(live) && /250/.test(live), 'a Realtime channel per room carries the score, at most about 4 times a second');
check(/status === 'finished' && res\.room\.outcome|getGameRoom/.test(modal) && !/liveScore[^\n]*outcome/.test(live), 'the result still comes from the room in the database; the live score is only for show');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
