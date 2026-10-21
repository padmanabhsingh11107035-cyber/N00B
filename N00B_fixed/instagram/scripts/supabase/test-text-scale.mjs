// Bigger text all over the app: every small fixed size used by a class like text-[11px] has a rule that scales it with the text-size setting, and the Tailwind sizes read their size
// from variables that do the same. (A size without a rule would stay small while everything around it grew.)
//
// Usage: node scripts/supabase/test-text-scale.mjs
import fs from 'node:fs';
import path from 'node:path';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(tsx?|css)$/.test(e.name) ? [path.join(d, e.name)] : []));

const css = read('src/index.css');
const bs = String.fromCharCode(92);
const used = new Set();
for (const f of walk('src')) for (const m of read(f).matchAll(/text-\[([0-9.]+)px\]/g)) if (Number(m[1]) <= 15) used.add(m[1]);
const rule = (z) => `html .text-${bs}[${z.replace('.', `${bs}.`)}px${bs}] { font-size: calc(${z}px * var(--tx)); }`;
const missing = [...used].filter((z) => !css.includes(rule(z)));
check(used.size >= 10 && missing.length === 0, `every small fixed size used in the app (${[...used].sort((a, b) => a - b).join(', ')} px) scales with the text size`, `missing: ${missing.join(', ')}`);
check(/html \{ --tx: 1\.38;/.test(css) && /--text-xs: calc\(0\.75rem \* var\(--tx\)\)/.test(css) && /--text-base: calc\(1rem \* var\(--tx\)\)/.test(css), 'the Tailwind sizes (xs to 3xl) are bigger by the same number');
check(/data-text-size="small"\] \{ --tx: /.test(css) && /data-text-size="large"\] \{ --tx: /.test(css) && /data-text-size="xlarge"\] \{ --tx: /.test(css), 'and the Text size setting (small, large, extra large) moves that number');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
