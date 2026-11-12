// Usage alert logic: percentages and the 80% line (pure, no network).
import { evaluateUsage, LIMITS } from './usage-core.mjs';

let bad = 0;
const check = (name, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) bad++; };
const MB = 1048576;

let r = evaluateUsage({ db_bytes: 100 * MB, storage_bytes: 100 * MB });
check('low usage: no warning', !r.warn);
check('db percent is 20', Math.abs(r.items[0].pct - 20) < 1e-9);
check('storage percent about 9.77', Math.abs(r.items[1].pct - (100 / 1024) * 100) < 1e-9);

r = evaluateUsage({ db_bytes: 400 * MB, storage_bytes: 0 });
check('database exactly 80%: warns', r.warn && r.items[0].warn && !r.items[1].warn);
r = evaluateUsage({ db_bytes: 400 * MB - 1, storage_bytes: 0 });
check('just under 80%: no warning', !r.warn);
r = evaluateUsage({ db_bytes: 0, storage_bytes: Math.ceil(LIMITS.storage_bytes * 0.8) });
check('storage 80%: warns', r.warn && r.items[1].warn);
r = evaluateUsage({ db_bytes: 600 * MB, storage_bytes: 2048 * MB });
check('over 100%: warns, percent above 100', r.warn && r.items[0].pct > 100 && r.items[1].pct === 200);
r = evaluateUsage({ db_bytes: '419430400', storage_bytes: '0' });
check('numbers as strings work (bigint from JSON)', r.warn);

for (const badProbe of [null, {}, { db_bytes: 'x', storage_bytes: 1 }, { db_bytes: -1, storage_bytes: 1 }]) {
  let threw = false;
  try { evaluateUsage(badProbe); } catch { threw = true; }
  check(`bad probe ${JSON.stringify(badProbe)} is an error, not a silent "all fine"`, threw);
}
process.exit(bad ? 1 : 0);
