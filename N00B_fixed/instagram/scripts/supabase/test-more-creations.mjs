// Tests the "More of our creations" block on the Home page, above the posts (the feed never ends, so a block under it could not be found): three lines (heading, one row of buttons,
// a note that the websites are not functional), one button per creation that opens its website in a new tab, nothing drawn while the list is empty, and an address that is not a plain web
// address is never made into a link. Bundled on the fly with esbuild: no browser needed.
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

// next to the project (not in the temp folder) so that `react` resolves from node_modules; removed again at the end
const out = path.resolve('node_modules/.cache-more-creations-test.mjs');
buildSync({ entryPoints: [path.resolve('src/components/Feed/MoreCreations.tsx')], bundle: true, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', outfile: out, logLevel: 'error' });
const { MoreCreations } = await import(pathToFileURL(out).href);
const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
const draw = (items) => renderToStaticMarkup(React.createElement(MoreCreations, { items }));
const make = (n) => Array.from({ length: n }, (_, i) => ({ name: `Site ${i + 1}`, url: `https://site${i + 1}.example.com/`, logo: `site-${i + 1}.png` }));
const NOTE = 'Note: these websites are not functional. You can only visit and explore them.';

section('1. Nothing in the list: nothing is drawn');
check(draw([]) === '', 'an empty list leaves no heading and no empty boxes on Home');
check(draw([{ name: 'Bad', url: 'javascript:alert(1)' }]) === '', 'a list with no usable address draws nothing either');

section('2. Three lines: heading, the buttons, the note');
const four = draw(make(4));
check(four.includes('More of our creations') && /<h2[^>]*>More of our creations<\/h2>/.test(four), 'line 1: the heading "More of our creations"');
check(count(four, /data-testid="creation-link"/g) === 4 && /flex flex-wrap justify-center/.test(four), 'line 2: one row with the four buttons (a row too wide for the phone goes on to a second line)');
check(four.includes(NOTE) && /data-testid="creations-note"/.test(four), 'line 3: the note that the websites are not functional and can only be visited and explored');

section('3. Each button opens its website');
check(/href="https:\/\/site1\.example\.com\/"/.test(four) && /target="_blank"/.test(four) && /rel="noopener noreferrer"/.test(four), 'a button is a link to the website, in a new tab, without handing our page to it');
check(/src="\/creations\/site-1\.png"/.test(four) && four.includes('Site 1'), 'it shows the name, and the logo from /creations/ when it has one');
const nameOnly = draw([{ name: 'Only a name', url: 'https://example.com/' }]);
check(nameOnly.includes('Only a name') && !/<img/.test(nameOnly) && /href="https:\/\/example\.com\/"/.test(nameOnly), 'a creation without a logo is a button with its name alone (no broken picture)');
check(count(draw(make(12)), /data-testid="creation-link"/g) === 12, 'a long list is not cut off');

section('4. Only plain web addresses become links');
const bad = draw([{ name: 'Bad', url: 'javascript:alert(1)' }, { name: 'Good', url: 'example.com/page' }]);
check(!bad.includes('javascript:') && !bad.includes('Bad'), 'a javascript: address is not shown at all');
check(/href="https:\/\/example\.com\/page"/.test(bad), 'an address without https:// gets it in front');

section('5. It is on the Home page above the posts, and the four websites are in the list');
const feed = fs.readFileSync(path.resolve('src/components/Feed/FeedView.tsx'), 'utf8');
const pills = feed.indexOf('3. Category Topic Filter Pills');
const posts = feed.indexOf('4. Feed Posts Stack');
const here = feed.indexOf('<MoreCreations');
check(pills > 0 && here > pills && here < posts, 'FeedView draws it under the stories and topic pills and above the posts (not under the endless posts)');
check(count(feed, /<MoreCreations/g) === 1 && /import \{ MoreCreations \} from '\.\/MoreCreations'/.test(feed), 'it is drawn once, and imported');
const data = fs.readFileSync(path.resolve('src/data/moreCreations.ts'), 'utf8');
check(/export const MORE_CREATIONS: Creation\[\]/.test(data), 'the list of creations is in src/data/moreCreations.ts');
const wanted = [
  ['Mannerly', 'https://manvendravaghela.wixsite.com/mannerly'],
  ['Sizzle', 'https://manvendravaghela.wixsite.com/sizzle'],
  ['Saraah Robotics', 'https://padmanabhsingh1110.wixsite.com/my-site'],
  ['Noob Learners', 'https://padmanabhsingh1110.wixsite.com/the-noob-learners'],
];
check(wanted.every(([n, u]) => data.includes(`name: '${n}', url: '${u}'`)) && count(data, /\{ name:/g) === 4, 'the four creations are in the list, each with its own website: Mannerly, Sizzle, Saraah Robotics, Noob Learners');
const live = draw(wanted.map(([name, url]) => ({ name, url })));
check(count(live, /data-testid="creation-link"/g) === 4 && wanted.every(([n, u]) => live.includes(`href="${u}"`) && live.includes(n)), 'drawn from those four, each button opens its own website');

fs.rmSync(out, { force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
