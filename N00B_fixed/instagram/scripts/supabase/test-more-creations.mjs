// Tests the "More of our creations" section at the very bottom of Home: one button (name, and logo when it has one) per creation that opens its website in a new tab, three to a line,
// a note that the websites are not functional, empty places while no link is added, and an address that is not a plain web address is never made into a link. Bundled on the fly with esbuild: no browser needed.
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

section('1. Nothing added yet: the section is there, with three lines of empty places');
const none = draw([]);
check(none.includes('More of our creations'), 'the heading is "More of our creations"');
check(count(none, /data-testid="creation-empty"/g) === 9 && count(none, /data-testid="creation-link"/g) === 0, 'nine empty places (three lines of three), no link');
check(/grid-cols-3/.test(none), 'three to a line');
check(none.includes('More coming soon'), 'a small "More coming soon" line tells that links are on the way');

section('2. Creations are shown as buttons that open their website');
const four = draw(make(4));
check(count(four, /data-testid="creation-link"/g) === 4 && count(four, /data-testid="creation-empty"/g) === 0, 'four buttons, no empty places once there are links');
check(/href="https:\/\/site1\.example\.com\/"/.test(four) && /target="_blank"/.test(four) && /rel="noopener noreferrer"/.test(four), 'a button is a link to the website, in a new tab, without handing our page to it');
check(/src="\/creations\/site-1\.png"/.test(four) && four.includes('Site 1'), 'it shows the logo from /creations/ and the name');
check(!four.includes('More coming soon'), 'the "More coming soon" line goes once there is a link');
const ten = draw(make(10));
check(count(ten, /data-testid="creation-link"/g) === 10, 'more than nine: another line is added, no creation is cut off');
const nameOnly = draw([{ name: 'Only a name', url: 'https://example.com/' }]);
check(nameOnly.includes('Only a name') && !/<img/.test(nameOnly) && /href="https:\/\/example\.com\/"/.test(nameOnly), 'a creation without a logo is a button with its name alone (no broken picture)');
check(/w-\[calc\(\(100%-1\.25rem\)\/3\)\]/.test(four) && /flex-wrap justify-center/.test(four), 'a third of the line each, three to a line, a shorter last line is centred');

section('2b. The note that the websites are not functional');
check(four.includes('Note: these websites are not functional. You can only visit and explore them.') && /data-testid="creations-note"/.test(four), 'under the buttons a note says the websites are not functional and can only be visited and explored');
check(!none.includes('not functional'), 'no note while there is nothing to visit');

section('3. Only plain web addresses become links');
const bad = draw([{ name: 'Bad', url: 'javascript:alert(1)', logo: 'x.png' }, { name: 'Good', url: 'example.com/page', logo: 'y.png' }]);
check(!bad.includes('javascript:') && !bad.includes('Bad'), 'a javascript: address is not shown at all');
check(/href="https:\/\/example\.com\/page"/.test(bad), 'an address without https:// gets it in front');

section('4. It is the last thing on Home, and the list file is in place');
const feed = fs.readFileSync(path.resolve('src/components/Feed/FeedView.tsx'), 'utf8');
const mainEnd = feed.indexOf('</main>', feed.indexOf('4. Feed Posts Stack'));
const here = feed.indexOf('<MoreCreations');
const sheet = feed.indexOf('{/* 5. Comments Sheet Modal */}');
check(here > mainEnd && here < sheet && mainEnd > 0, 'FeedView draws it right after the posts');
check(/import \{ MoreCreations \} from '\.\/MoreCreations'/.test(feed), 'FeedView imports it');
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
