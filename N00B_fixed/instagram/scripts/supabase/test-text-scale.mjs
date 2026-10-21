// Bigger text all over the app: every small fixed size used by a class like text-[11px] has a rule that scales it with the text-size setting, the Tailwind sizes read their size
// from variables that do the same, and a bar that runs out of room (top bar, bottom bar ...) takes back some of the extra size instead of pushing one thing under another.
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
check(/html \{ --tx0: 1\.38; --tx: var\(--tx0\);/.test(css) && /--text-xs: calc\(0\.75rem \* var\(--tx\)\)/.test(css) && /--text-base: calc\(1rem \* var\(--tx\)\)/.test(css), 'the Tailwind sizes (xs to 3xl) are bigger by the same number');
check(/data-text-size="small"\] \{ --tx0: /.test(css) && /data-text-size="large"\] \{ --tx0: /.test(css) && /data-text-size="xlarge"\] \{ --tx0: /.test(css), 'and the Text size setting (small, large, extra large) moves that number');

// a bar that runs out of room takes back some of the extra size (utils/textFit.ts)
const fit = read('src/utils/textFit.ts');
check(/\[data-fit="1"\] \{ --tx: calc/.test(css) && /\[data-fit="2"\] \{ --tx: calc/.test(css) && /\[data-fit="3"\] \{ --tx: 1; \}/.test(css), 'a bar that runs out of room can take back the extra size in three steps');
check(/header, nav, \[data-fit\]/.test(fit) && /startTextFit\(\);/.test(read('src/main.tsx')), 'every top bar, bottom bar and anything marked data-fit is watched from the start');
check(/hidden\|auto\|scroll\|clip/.test(fit), 'rows that scroll or cut their text with "…" on purpose are left alone');
const feed = read('src/components/Feed/FeedView.tsx');
check((feed.match(/max-\[560px\]:hidden/g) || []).length === 2 && /Join our SparkX team<\/span>/.test(feed) && /Join the NOOB team<\/span>/.test(feed), 'on a phone the home bar keeps room for the Following switch: the two small icons live in the menu');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
