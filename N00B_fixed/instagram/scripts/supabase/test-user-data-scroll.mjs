// The admin page "User's data" can be scrolled / slid with a touchpad, a mouse wheel and the keyboard. Usage: node scripts/supabase/test-user-data-scroll.mjs
import fs from 'node:fs';
let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const map = read('src/components/Modals/UserDataMap.tsx');
const css = read('src/components/Modals/adminUserData.css');

check(/overflow-y: auto/.test(css.slice(css.indexOf('.ud-root {'), css.indexOf('.ud-root {') + 700)), 'the page itself scrolls when the window is short');
check(/if \(!\(e\.ctrlKey \|\| e\.metaKey\)\) \{ setView\(\{ k: v\.k, tx: v\.tx - e\.deltaX/.test(map), 'wheel / two fingers on a touchpad slide the map; only Ctrl / Cmd + wheel or a pinch zooms');
check(/tabIndex=\{0\} onKeyDown=\{onKeyDown\}/.test(map) && /case 'ArrowLeft'/.test(map) && /case 'PageDown'/.test(map) && /case '\+': case '='/.test(map) && /case '0': case 'Home'/.test(map), 'the keyboard slides (arrows, PageUp / PageDown), zooms (+ -) and resets (0 / Home)');
check(/el\.focus\(\{ preventScroll: true \}\)/.test(map), 'the map takes the keyboard focus when the page opens');
check(/\.ud-root::before \{ content: ''; position: fixed/.test(css) && /\.ud-rain \{ position: fixed/.test(css) && /\.ud-head \{ position: sticky/.test(css), 'the scanlines, the code rain and the header stay in place while the page scrolls');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
