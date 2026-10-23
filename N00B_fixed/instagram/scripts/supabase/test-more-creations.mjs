// Tests "More of our creations": a page of its own, opened from the three-line menu of Home (not drawn on Home itself), with one button per creation that opens its website in a new
// tab, and a note that the websites are not functional. An address that is not a plain web address is never made into a link. Bundled on the fly with esbuild: no browser needed.
//
// Usage: node scripts/supabase/test-more-creations.mjs
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const count = (s, re) => (s.match(re) || []).length;
const read = (p) => fs.readFileSync(path.resolve(p), 'utf8');

// next to the project (not in the temp folder) so that `react` resolves from node_modules; removed again at the end
const out = path.resolve('node_modules/.cache-more-creations-test.mjs');
buildSync({ entryPoints: [path.resolve('src/components/Feed/MoreCreationsPage.tsx')], bundle: true, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: out, logLevel: 'error' });
const { MoreCreationsPage } = await import(pathToFileURL(out).href);
const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
const draw = (items) => renderToStaticMarkup(React.createElement(MoreCreationsPage, { items, onClose: () => {} }));
const make = (n) => Array.from({ length: n }, (_, i) => ({ name: `Site ${i + 1}`, url: `https://site${i + 1}.example.com/`, logo: `site-${i + 1}.png` }));
const NOTE = 'Note: these websites are not functional. You can only visit and explore them.';

section('1. The page: title, back button, the buttons and the note');
const four = draw(make(4));
check(/role="dialog"/.test(four) && /aria-label="More of our creations"/.test(four) && /<h1[^>]*>More of our creations<\/h1>/.test(four), 'a page of its own titled "More of our creations"');
check(/data-testid="creations-close"/.test(four) && /aria-label="Close"/.test(four), 'with a back button to close it');
check(count(four, /data-testid="creation-link"/g) === 4, 'one button for each creation');
check(four.includes(NOTE) && /data-testid="creations-note"/.test(four), 'the note says that the websites are not functional and can only be visited and explored');
check(/fixed inset-0/.test(four) && /overflow-y-auto/.test(four), 'a full page that scrolls when there are many buttons');

section('2. Each button opens its website');
check(/href="https:\/\/site1\.example\.com\/"/.test(four) && /target="_blank"/.test(four) && /rel="noopener noreferrer"/.test(four), 'a button is a link to the website, in a new tab, without handing our page to it');
check(/src="\/creations\/site-1\.png"/.test(four) && four.includes('Site 1'), 'it shows the name, and the logo from /creations/ when it has one');
const nameOnly = draw([{ name: 'Only a name', url: 'https://example.com/' }]);
check(nameOnly.includes('Only a name') && !/<img/.test(nameOnly) && /href="https:\/\/example\.com\/"/.test(nameOnly), 'a creation without a logo is a button with its name alone (no broken picture)');
check(count(draw(make(12)), /data-testid="creation-link"/g) === 12, 'a long list is not cut off');

section('3. Only plain web addresses become links');
const bad = draw([{ name: 'Bad', url: 'javascript:alert(1)' }, { name: 'Good', url: 'example.com/page' }]);
check(!bad.includes('javascript:') && !bad.includes('Bad'), 'a javascript: address is not shown at all');
check(/href="https:\/\/example\.com\/page"/.test(bad), 'an address without https:// gets it in front');
const empty = draw([]);
check(empty.includes('More coming soon') && !empty.includes('not functional'), 'with nothing in the list the page says "More coming soon" (and no note about websites)');

section('4. The three-line menu opens it; Home itself does not show it');
const feed = read('src/components/Feed/FeedView.tsx');
check(/import \{ MoreCreationsPage \} from '\.\/MoreCreationsPage'/.test(feed) && count(feed, /<MoreCreationsPage/g) === 1, 'FeedView imports the page and draws it once');
check(/\{showCreations && <MoreCreationsPage onClose=\{\(\) => setShowCreations\(false\)\} \/>\}/.test(feed), 'it opens when showCreations is set and closes with the back button');
const entry = feed.match(/<MenuBanner tone="creations"[^\n]*/)?.[0] || '';
check(/title="More of our creations"/.test(entry) && /entryId="creations"/.test(entry) && /markMenuEntry\('creations'\)/.test(entry) && /setShowNoobMenu\(false\)/.test(entry) && /setShowCreations\(true\)/.test(entry), 'the three-line menu has an entry "More of our creations" that closes the menu and opens the page');
check(/const menuPageOpen = !!\(showAnonymous \|\| showOurTeam \|\| showCreations \|\|/.test(feed), 'it counts as a separate page (Home is hidden while it is open, and comes back as it was)');
check(!/<MoreCreations[\s/>]/.test(feed) && !fs.existsSync(path.resolve('src/components/Feed/MoreCreations.tsx')), 'nothing about it is drawn on the Home page itself (no block among the stories and posts)');
check(/'creations'/.test(read('src/components/Feed/MenuBanner.tsx')) && /creations: \{ border:/.test(read('src/components/Feed/MenuBanner.tsx')), 'the entry has its own colours in the menu');

section('5. The four websites are in the list');
const data = read('src/data/moreCreations.ts');
check(/export const MORE_CREATIONS: Creation\[\]/.test(data), 'the list of creations is in src/data/moreCreations.ts');
const wanted = [
  ['Mannerly', 'https://manvendravaghela.wixsite.com/mannerly'],
  ['Sizzle', 'https://manvendravaghela.wixsite.com/sizzle'],
  ['Saraah Robotics', 'https://padmanabhsingh1110.wixsite.com/my-site'],
  ['Noob Learners', 'https://padmanabhsingh1110.wixsite.com/the-noob-learners'],
];
check(wanted.every(([n, u]) => data.includes(`name: '${n}', url: '${u}'`)) && count(data, /\{ name:/g) === 4, 'Mannerly, Sizzle, Saraah Robotics and Noob Learners, each with its own website');
const live = draw(wanted.map(([name, url]) => ({ name, url })));
check(count(live, /data-testid="creation-link"/g) === 4 && wanted.every(([n, u]) => live.includes(`href="${u}"`) && live.includes(n)), 'drawn from those four, each button opens its own website');

fs.rmSync(out, { force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
