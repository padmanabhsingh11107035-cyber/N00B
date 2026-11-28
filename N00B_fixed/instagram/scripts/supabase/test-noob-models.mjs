// NOOB Models: the three-line-menu page of curved boxes with a 3D model in each.
// Usage: node --liftoff-only scripts/supabase/test-noob-models.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

const feed = read('src/components/Feed/FeedView.tsx'), app = read('src/App.tsx'), feat = read('src/utils/features.ts');
const page = read('src/components/Models/NoobModelsPage.tsx'), box = read('src/components/Models/ModelBox3D.tsx'), css = read('src/components/Models/noobModels.css'), data = read('src/data/noobModels.ts');
const entry = feed.match(/featOn\('models'\) && \{[^\n]*/)?.[0] || '';
check(/label: 'NOOB Models'/.test(entry) && /entryId: 'models'/.test(entry) && /go\('models', openNoobModels\)/.test(entry), 'the three-line menu has an entry "NOOB Models" that closes the menu and opens the page');
check(/key: 'models'/.test(feat) && /featuresOff\.has\('models'\)\) closeNoobModels\(\)/.test(app) && /<ModelsHost \/>/.test(app), 'the administrator can switch the page off (Pages tab), and the page is drawn once by App');
check(/NOOB_MODELS\.map/.test(page) && /nm-box/.test(page) && /<ModelBox3D/.test(page) && /Escape/.test(page), 'every model of the list gets a box with the model inside; Escape and the back button close the page');
check(/\.nm-box \{[^}]*border-radius: 28px/.test(css) && /:root\[data-theme="light"\] \.nm-root/.test(css) && /repeat\(3, 1fr\)/.test(css), 'curved boxes, in a grid (1, 2 or 3 across), dark and light');
check(/IntersectionObserver/.test(box) && /renderer\.dispose\(\)/.test(box) && /touch-action:pan-y/.test(box) && /autoRotate = true/.test(box) && /enableZoom = false/.test(box), 'a model is drawn only while its box is on screen, turns by itself, turns by hand, and up/down still scrolls the page; all released afterwards');
check(/id: 'ball'/.test(data) && /build: 'ball-eyes'/.test(data) && /ball-eyes/.test(read('src/components/Models/ballBuddy.ts')) && !/id: 'nova'/.test(data) && /nova/.test(read('src/data/avatars.ts')), 'the boxes: Noob Ball (black sphere, bulging eyes, made in code); Nova is on the Avatars page, not here');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
