// Static check: no edge function may trust the FIRST x-forwarded-for entry (a caller can write it). Cloudflare's cf-connecting-ip, else the last entry.
import fs from 'node:fs';
import path from 'node:path';
const root = 'supabase/functions';
let bad = 0;
for (const d of fs.readdirSync(root)) {
  const f = path.join(root, d, 'index.ts');
  if (!fs.existsSync(f)) continue;
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((l, i) => {
    if (/x-forwarded-for/i.test(l) && /split\(','\)\s*\[0\]/.test(l)) { console.log(`FAIL ${f}:${i + 1} trusts the first x-forwarded-for entry`); bad++; }
  });
}
if (bad) process.exit(1);
console.log('OK: no edge function trusts the first x-forwarded-for entry');
