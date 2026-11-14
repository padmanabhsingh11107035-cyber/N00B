// Messages > three dots > Header colour: 30 different colours for the top of the Messages page only, readable text on every one, kept per account on the device.
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
let passed = 0, failed = 0;
const check = (ok, name, extra = '') => { if (ok) { passed++; console.log('  ok   ' + name); } else { failed++; console.log('  FAIL ' + name + ' ' + extra); } };
const util = read('src/utils/chatHeadColour.ts'), page = read('src/components/Chat/HeadColourPage.tsx'), list = read('src/components/Chat/MessagesList.tsx'), css = read('src/components/Chat/headColour.css'), mcss = read('src/components/Chat/messagesList.css');
const colours = [...util.slice(util.indexOf('HEAD_COLOURS'), util.indexOf('];')).matchAll(/'(#[0-9A-Fa-f]{6})'/g)].map((m) => m[1].toUpperCase());
check(colours.length === 30 && new Set(colours).size === 30 && colours[0] === '#F8CB46', 'exactly 30 colours, all different, the first is the yellow of the opening screen', String(colours.length));
// the same rule as inkFor(): the text colour chosen for every one of the 30 must have a contrast of at least 4.5 : 1
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }; return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const bad = colours.filter((c) => ratio(c, lum(c) > 0.18 ? '#0A0A0A' : '#FFFFFF') < 4.5);
check(/return L > 0\.18 \? '#0A0A0A' : '#FFFFFF'/.test(util) && bad.length === 0, 'the title and buttons can be read on every colour (contrast 4.5 : 1 or more)', bad.join(' '));
check(/localStorage\.setItem\(key\(userId\), c\)/.test(util) && /const key = \(userId: string\) => `noob_chat_head:\$\{userId\}`/.test(util) && /valid\(c\) \? c : DEFAULT_HEAD_COLOUR/.test(util), 'kept on the device for this account; anything that is not one of the 30 falls back to yellow');
check(/role="radiogroup"/.test(page) && /role="radio"/.test(page) && /aria-label=\{`Colour \$\{i \+ 1\} of \$\{HEAD_COLOURS\.length\}`\}/.test(page) && !/Yellow|Red|Blue|Green|Purple|Pink|Orange/.test(page.replace(/Reset to yellow/g, '')), 'the circles have no colour names (only "Colour 3 of 30" for a screen reader)');
check(/\.hc-dot \{[^}]*border-radius: 50%/.test(css) && /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/.test(css) && /:root\[data-theme="light"\] \.hc-root/.test(css) && /prefers-reduced-motion/.test(css), 'round circles, six in a row, a dark and a light look, still when the phone asks for less motion');
check(/data-testid="messages-head-colour"/.test(list) && /setShowHeadColour\(true\)/.test(list) && /'--head': headColour, '--head-ink': inkFor\(headColour\)/.test(list), 'the three-dots menu of Messages opens it, and the page takes the colour at once');
check(/html \.msg-page \.msg-head \{ --mint: var\(--head-ink\)/.test(mcss) && !/\.msg-sheet[^{]*\{[^}]*var\(--head\)/.test(mcss), 'only the top part takes the colour: the chat sheet under it does not use it');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
