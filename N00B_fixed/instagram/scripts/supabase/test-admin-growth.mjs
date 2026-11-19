// The admin's growth card: the total is always the REAL number of accounts; today / week / month count only real join dates; the milestone moves up as the total grows.
// Usage: node scripts/supabase/test-admin-growth.mjs
import fs from 'node:fs';
const G = await import('../../src/utils/growth.ts');
let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };

const now = new Date('2026-11-19T15:00:00').getTime();
const ago = (h) => new Date(now - h * 3600000).toISOString();
const g = G.growthStats([ago(1), ago(5), ago(30), ago(24 * 6), ago(24 * 20), ago(24 * 90), undefined, 'not a date'], now);
check(g.total === 8, 'the total is the number of accounts in the list, nothing added', JSON.stringify(g));
check(g.today === 2 && g.week === 4 && g.month === 5, 'today, last 7 days and last 30 days count only real join dates', JSON.stringify(g));
check(G.growthStats([], now).total === 0, 'an empty list shows 0, not a made-up number');
check(G.nextMilestone(63) === 100 && G.nextMilestone(100) === 250 && G.nextMilestone(49999) === 50000 && G.nextMilestone(50000) === 100000, 'the next milestone moves up as the total grows');
check(G.LONG_GOAL === 50000, 'the long-term goal is shown as a goal, never as the count');
const card = fs.readFileSync('src/components/Modals/AdminGrowth.tsx', 'utf8');
check(/Real users/.test(card) && /Goal \{nf\(LONG_GOAL\)\}/.test(card), 'the card says "Real users" and shows the goal as a goal');
const modal = fs.readFileSync('src/components/Modals/AdminControlModal.tsx', 'utf8');
check(/growthStats\(usersList\.map/.test(modal) && !/50063|50,063/.test(modal + card), 'the card is fed by the real account list, and no made-up total exists in the code');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
