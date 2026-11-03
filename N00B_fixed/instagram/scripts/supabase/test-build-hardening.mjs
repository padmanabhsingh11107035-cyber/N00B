// The built app gives away as little as it can: no source maps, no debugger statements, no comments, the app's script can not be embedded by another site, no key that is not public by design.
// Usage: node --liftoff-only scripts/supabase/test-build-hardening.mjs
import fs from 'node:fs';
let passed = 0, failed = 0;
const check = (c, l, d = '') => { if (c) { passed++; console.log(`  ok   ${l}`); } else { failed++; console.log(`  FAIL ${l} ${d}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split('\r').join('');
const vite = read('vite.config.ts'), headers = read('public/_headers');
check(/sourcemap: false/.test(vite) && /minify: 'esbuild'/.test(vite), 'no source maps are built, and the code is minified');
check(/drop: \['debugger'\]/.test(vite) && /pure: \['console\.log', 'console\.debug', 'console\.info'\]/.test(vite) && /legalComments: 'none'/.test(vite), 'debugger statements, plain console lines and comments are cut out');
check(/\/assets\/\*\n  Cache-Control: public, max-age=31536000, immutable\n  Cross-Origin-Resource-Policy: same-site/.test(headers), 'the app\'s script and style files can not be loaded by a page of another site');
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = d + '/' + e.name; if (e.isDirectory()) { if (!['node_modules', 'dist', '.git', 'games'].includes(e.name)) walk(p); } else files.push(p); } };
walk('src');
const bad = files.filter((f) => /\.(ts|tsx)$/.test(f)).filter((f) => /(service_role|SUPABASE_SERVICE|sk_live_|AKIA[0-9A-Z]{12}|BEGIN [A-Z ]*PRIVATE KEY|GROQ_API_KEY\s*=\s*['"]\w)/.test(read(f)));
check(bad.length === 0, 'no private key or service key is written in the app\'s source', bad.join(', '));
check(!fs.existsSync('dist') || !fs.readdirSync('dist/assets').some((f) => f.endsWith('.map')), 'a finished build has no .map file next to its scripts');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
