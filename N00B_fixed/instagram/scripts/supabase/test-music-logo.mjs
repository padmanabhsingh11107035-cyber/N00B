// NOOB Music's own picture (a chalk drawing of a disc player) is the logo at the top of the Music Hub. Usage: node scripts/supabase/test-music-logo.mjs
import fs from 'node:fs';
let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const hub = fs.readFileSync('src/components/Music/MusicHubView.tsx', 'utf8');
check(fs.existsSync('public/noob-music-logo.jpg') && fs.statSync('public/noob-music-logo.jpg').size < 120 * 1024, 'the picture is a file in the site, small enough to load at once');
check(/<img\s+src="\/noob-music-logo\.jpg"\s+alt="NOOB Music logo"/.test(hub) && /data-testid="music-logo"/.test(hub), 'the Music Hub header shows it');
check(!/conic-gradient/.test(hub) && !/Disc3/.test(hub), 'the old rainbow icon with the spinning disc is gone');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
