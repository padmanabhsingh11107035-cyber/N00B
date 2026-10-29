// "Settings and activity", the premium look: a big title with a squiggle that draws itself, a mood card (dark or light with one tap, the new mood washed over the app by a circle), sections with a doodle
// and a stitched card, sticker-like icon tiles, springy switches, pages that slide in the way you went. The app's own black-and-white doodle theme stays: the colours come from the theme's variables.
// Usage: node --liftoff-only scripts/supabase/test-settings-look.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

const css = read('src/components/Settings/settings.css'), kit = read('src/components/Settings/kit.tsx'), hub = read('src/components/Settings/SettingsHub.tsx');

section('1. The style sheet');
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
const selectors = [...bare.matchAll(/(^|\n|\})\s*([^@{}\n][^{}]*)\{/g)].flatMap((m) => m[2].split(/,(?![^(]*\))/)).map((x) => x.trim()).filter(Boolean);
const loose = selectors.filter((x) => !/^(\.nst-|button\.nst-|\.is-stuck \.nst-|::view-transition|from|to|\d+%)/.test(x));
check(selectors.length > 80 && loose.length === 0, 'every rule starts with nst- (or is the view transition): nothing here can touch the rest of the app', loose.slice(0, 5).join(' | '));
check(!/#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/i.test(bare.replace(/#f87171|#fca5a5|#6ee7b7/gi, '')) && !/\b(blue|purple|pink|violet|indigo|cyan)\b/i.test(bare), 'no colour of its own besides the red and green of a warning and a good note: the black-and-white theme and its variables only');
check(/var\(--doodle-rgb\)/.test(css) && /var\(--color-zinc-900\)/.test(css) && /var\(--page\)/.test(css) && /var\(--color-noob\)/.test(css), 'it is made from the theme\'s variables, so Dark and Light both follow');
check(/prefers-reduced-motion: reduce/.test(css) && /animation-duration: 0\.01ms !important/.test(css) && /transition-duration: 0\.01ms !important/.test(css), 'people who asked for less motion get none');
check(['nst-rise', 'nst-draw', 'nst-in-fwd', 'nst-in-back'].every((k) => new RegExp(`@keyframes ${k}\\b`).test(css)) && /::view-transition-new\(root\)/.test(css) && /::view-transition-old\(root\)/.test(css), 'the animations exist: things rise in, the squiggle draws itself, pages slide in, the mood circle');
check(/\.nst-card::after \{[^}]*dashed/.test(css) && /\.nst-ico \{[^}]*box-shadow/.test(css) && /cubic-bezier\(0\.34, 1\.56, 0\.64, 1\)/.test(css), 'the doodle touches are there: a stitched edge on every card, sticker-like icon tiles, a springy curve');
check(/\.nst-switch i svg \{[^}]*stroke-dashoffset: 20/.test(css) && /\.nst-switch\[aria-checked="true"\] i svg[^}]*\{ stroke-dashoffset: 0/.test(css) && /\.nst-switch:active:not\(:disabled\) i \{ width: 32px/.test(css), 'a switch draws its tick and stretches its thumb under the finger');

section('2. The building blocks keep behaving, and look new');
check(/import '\.\/settings\.css'/.test(kit) && /className="nst-card"/.test(kit) && /className="nst-row/.test(kit) && /className="nst-switch"/.test(kit) && /className="nst-radio"/.test(kit) && /className="nst-header/.test(kit) && /className="nst-back"/.test(kit), 'pages, sections, rows, switches, choices and the bar are drawn with the new classes');
check(/role="switch"/.test(kit) && /aria-checked=\{on\}/.test(kit) && /role="radio"/.test(kit) && /aria-checked=\{on\}/.test(kit) && /aria-label="Back"/.test(kit) && /data-testid="settings-back"/.test(kit), 'switches, choices and the Back button are still announced properly');
check(/export function useStuck\(\)/.test(kit) && /IntersectionObserver/.test(kit) && /is-stuck/.test(kit), 'the bar on top gets its hairline and shadow only once the page has been scrolled');
check(/export const Section: React\.FC<\{ title\?: string; note\?: string; children: React\.ReactNode; index\?: number \}>/.test(kit) && /doodleFor\(title\)/.test(kit) && (kit.match(/^  '[Mm][^']{20,}',?$/gm) || []).length === 6, 'every section title has one of six small hand-drawn doodles in front of it (the same one for the same title)');
check(/navigator\.vibrate\?\.\(ms\)/.test(kit) && /const buzz = /.test(kit), 'a switch gives a short buzz under the finger on phones that can');
check(/data-tone=\{tone\}/.test(kit) && /\.nst-note\[data-tone="bad"\]/.test(css) && /\.nst-note\[data-tone="good"\]/.test(css), 'a note says whether it is good news or bad news');

section('3. The first screen');
check(/<h2 className="nst-big">Settings<\/h2>/.test(hub) && /className="nst-squiggle"/.test(hub) && /Settings and activity/.test(hub) && /className="nst-htitle nst-late"/.test(hub), 'a big title with a squiggle; the old title appears in the bar once the big one has scrolled away');
check(/className="nst-search"/.test(hub) && /data-testid="settings-search"/.test(hub) && /aria-label="Search settings"/.test(hub) && /className="nst-clear"/.test(hub), 'the search pill is there, with the same test id and a clear button');
check(/const MoodCard/.test(hub) && /data-testid="settings-mood"/.test(hub) && /role="switch"/.test(hub) && /subscribeToTheme/.test(hub) && /resolveTheme\(getThemePreference\(\)\)/.test(hub) && /\{!query\.trim\(\) && <MoodCard \/>\}/.test(hub), 'a mood card: dark or light with one tap, in step with the theme, hidden while searching');
check(/startViewTransition/.test(hub) && /circle\(0px at \$\{x\}px \$\{y\}px\)/.test(hub) && /pseudoElement: '::view-transition-new\(root\)'/.test(hub) && /prefers-reduced-motion: reduce/.test(hub) && /setThemePreference\(next\)/.test(hub), 'the new mood is washed over the whole app by a circle growing from the switch (and just changes where the browser has no such thing, or for people who asked for less motion)');
check(/<Section key=\{title\} index=\{section\+\+\} title=\{title\}>/.test(hub) && /let section = 0;/.test(hub), 'the sections come in one after the other');
check(/const goingBack = stack\.length < lastDepth\.current;/.test(hub) && /className=\{`nst-page\$\{goingBack \? ' back' : ''\}`\}/.test(hub), 'going deeper slides the page in from the right, going back from the left');
check(/useFullPage\(true\)/.test(hub) && /fixed inset-0 z-\[45\]/.test(hub) && /role="region" aria-label="Settings and activity"/.test(hub), 'it still fills the screen as one full page');
const pages = fs.readdirSync('src/components/Settings/pages').filter((f) => f.endsWith('.tsx')).map((f) => read(`src/components/Settings/pages/${f}`)).join('\n');
check(!/\b(bg-blue|text-blue|from-blue|bg-purple|from-purple|bg-pink|text-pink|bg-indigo|bg-violet)\b/.test(pages + kit + hub), 'no page brings a colour of its own');
check(/test-settings-look\.mjs/.test(read('package.json')), 'this test is part of the test chain');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
