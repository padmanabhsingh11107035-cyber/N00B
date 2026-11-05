// The doodle pattern drawn faintly over every page, with a switch in Settings. Usage: node --liftoff-only scripts/supabase/test-doodle-background.mjs
import fs from 'node:fs';
let passed = 0, failed = 0;
const check = (c, l) => { if (c) { passed++; console.log(`  ok   ${l}`); } else { failed++; console.log(`  FAIL ${l}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split('\r').join('');
const css = read('src/index.css'), prefs = read('src/utils/devicePrefs.ts'), app = read('src/components/Settings/pages/app.tsx');
check(fs.existsSync('public/brand/doodle-white.webp') && fs.existsSync('public/brand/doodle-dark.webp') && fs.statSync('public/brand/doodle-white.webp').size < 150000, 'both pattern pictures (white for dark mode, dark for light mode) exist and are small');
check(/body::after \{[^}]*position: fixed;[^}]*inset: 0;[^}]*pointer-events: none;[^}]*doodle-white\.webp[^}]*490px/.test(css), 'one fixed layer over every page, taps go through it, the pattern is drawn small (490 px per mirrored tile)');
check(/body\.light::after \{[^}]*doodle-dark\.webp/.test(css) && /html\[data-doodle="off"\] body::after \{ display: none; \}/.test(css), 'dark doodles on the light theme; the switch turns it off');
const z = Number((/body::after \{[^}]*z-index: (-?\d+)/.exec(css) || [])[1]);
check(z === -1, 'it sits BEHIND the page content: never drawn over pictures, videos or text');
check(/doodleBackground: true/.test(prefs) && /set\('data-doodle', !p\.doodleBackground, 'off'\)/.test(prefs), 'on by default, kept on the device, applied as an attribute on the page');
check(/data-doodle|doodleBackground/.test(app) && /testId="doodle-background"/.test(app), 'Settings > App > Background has the switch');
const sys = read('src/components/Common/SystemPage.tsx'), lockGate = read('src/components/Common/AppLockGate.tsx');
check(/\.doodle-surface \{[^}]*doodle-white\.webp/.test(css) && /body\.light \.doodle-surface \{[^}]*doodle-dark\.webp/.test(css), 'a stronger version of the pattern for the full-screen pages, in the same two colours');
check(/doodle-surface/.test(sys) && /doodle-surface/.test(lockGate), 'the maintenance page (and the BRB page) and the lock screen wear it too');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
