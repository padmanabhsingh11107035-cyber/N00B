// NOOB Studio (the photo and video editor): where it opens from, and the promises it keeps: everything is edited on the device (no network, no storage, no upload), nothing is
// published by the editor itself, and no existing data is touched. Usage: node scripts/supabase/test-studio.mjs
import fs from 'node:fs';
import path from 'node:path';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const dir = 'src/components/Studio';

section('1. The editor is all there');
const files = ['types.ts', 'filters.ts', 'gl.ts', 'assets.ts', 'render.ts', 'player.ts', 'export.ts', 'history.ts', 'emoji.ts', 'templates.ts', 'Stage.tsx', 'Timeline.tsx', 'ui.tsx', 'panels.tsx', 'panels2.tsx', 'ExportDialog.tsx', 'ColorPanel.tsx', 'MediaPool.tsx', 'strips.ts', 'StudioApp.tsx', 'StudioHost.tsx', 'StudioStandalone.tsx', 'studioStore.ts'];
for (const f of files) check(fs.existsSync(path.join(dir, f)), `${f} exists`);
const all = fs.readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => [f, read(path.join(dir, f))]);

section('2. Nothing leaves the device');
const forbidden = [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /supabase/i, /uploadMediaFile/, /localStorage|sessionStorage|indexedDB/, /\/api\//, /navigator\.share/];
for (const [f, src] of all) {
  const hit = forbidden.find((re) => re.test(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));
  check(!hit, `${f}: no network, storage or upload code`, hit ? String(hit) : '');
}
check(/URL\.createObjectURL/.test(read(`${dir}/assets.ts`)) && /revokeObjectURL/.test(read(`${dir}/assets.ts`)), 'files are opened as in-memory object URLs and let go again');
check(/assetsRef\.current\.forEach\(releaseAsset\)/.test(read(`${dir}/StudioApp.tsx`)) && /player\.destroy\(\)/.test(read(`${dir}/StudioApp.tsx`)), 'closing the editor releases every imported file');

section('3. Opens from the three-line menu, the Create sheet and /studio');
const feed = read('src/components/Feed/FeedView.tsx');
check(/data-testid="menu-studio"/.test(feed) && /openStudio\(\)/.test(feed), 'the Home menu has a NOOB Studio button');
const chooser = read('src/components/PostCreation/CreateChooser.tsx');
check(/kind: 'studio'/.test(chooser), 'the Create sheet has "Edit in Studio"');
const app = read('src/App.tsx');
check(/kind === 'studio'\) \{ if \(featOn\('studio'\)\) openStudio\(\); \}/.test(app), 'picking it opens the editor (unless the administrator switched the page off)');
check(/<StudioHost onUse=/.test(app), 'the editor is drawn once, by StudioHost, in the app');
check(/\^\\\/studio\\\/\?\$/.test(app), 'the address /studio opens the editor');
check(/clean === '\/studio'/.test(read('src/utils/routes.ts')), '/studio is a real page (not "page not found")');
check(/React\.lazy\(\(\) => import\('\.\/StudioApp'\)\)/.test(read(`${dir}/StudioHost.tsx`)), 'the editor code is fetched only when it is opened');

section('4. The editor never publishes by itself');
const handoff = app.slice(app.indexOf('<StudioHost onUse='), app.indexOf('<StudioHost onUse=') + 420);
check(/setStudioStoryFile\(file\)/.test(handoff) && /setStudioFile\(file\)/.test(handoff), 'a finished file only opens the Post / Reel / Story creator with it');
check(!/handleCreatePostOrReel|handleCreateStory|onSubmitPost|onSubmitStory/.test(handoff), 'the handoff does not publish anything');
const post = read('src/components/PostCreation/PostCreationModal.tsx');
const story = read('src/components/Stories/CreateStoryModal.tsx');
check(/initialFile/.test(post) && /initialFileUsed/.test(post), 'the Post / Reel creator opens with the file (once)');
check(/initialFile/.test(story) && /initialFileUsed/.test(story), 'the Story creator opens with the file (once)');
const exp = read(`${dir}/ExportDialog.tsx`);
check(/result\.kind === 'image' && <Btn onClick=\{\(\) => use\('story'\)/.test(exp), 'only a picture can go to a Story (stories are pictures)');

section('5. Its own address: editor.noobsocials.com');
const main = read('src/main.tsx');
check(/isEditorHost\(\)/.test(main) && /StudioStandalone/.test(main), 'on the editor address the whole page is the editor');
check(/\^editor\\\./.test(read(`${dir}/studioStore.ts`)), 'the editor address is recognised by its name (editor.…) or ?editor=1');
check(/\(ai\|coaching\|editor\)/.test(read('src/utils/siteUrl.ts')), 'links shared from the editor address still name the main site');
check(/<script src="\/editor-init\.js"><\/script>/.test(read('index.html')) && fs.existsSync('public/editor-init.js'), 'the editor address has its own tab name');
check(!/onUse/.test(read(`${dir}/StudioStandalone.tsx`)), 'the stand-alone page is download only (no account, nothing handed over)');

section('6. Real export, checked');
const ex = read(`${dir}/export.ts`);
check(/image\/jpeg/.test(ex) && /image\/png/.test(ex) && /image\/webp/.test(ex), 'pictures: JPEG, PNG, WebP');
check(/video\/mp4/.test(ex) && /video\/webm/.test(ex) && /isTypeSupported/.test(ex), 'videos: MP4 and WebM, only the ones this browser can really record');
check(/createImageBitmap\(blob\)/.test(ex) && /did not come out the right size/.test(ex), 'a saved picture is opened again and its size checked');
check(/could not be opened again, so it was not kept/.test(ex) && /came out empty/.test(ex), 'a saved video is opened again; an empty one is refused');
check(/AbortError/.test(ex) && /signal\.addEventListener\('abort'/.test(ex), 'an export can be cancelled');
check(/if \(ctl\.exporting\) return;/.test(read(`${dir}/Stage.tsx`)), 'the screen does not take the player back while a video is being made');

section('7. The tools');
const ui = [read(`${dir}/panels.tsx`), read(`${dir}/panels2.tsx`), read(`${dir}/StudioApp.tsx`)].join('\n');
for (const t of ["'media'", "'canvas'", "'adjust'", "'filters'", "'crop'", "'text'", "'stickers'", "'draw'", "'audio'", "'captions'", "'templates'", "'layers'"]) check(ui.includes(`id: ${t}`), `tool ${t}`);
const filters = read(`${dir}/filters.ts`);
check([...filters.matchAll(/\{ id: '/g)].length >= 18, 'at least 18 filters');
check(/SRT|\.srt/.test(read(`${dir}/panels2.tsx`)) && /parseSrt/.test(read(`${dir}/panels2.tsx`)), 'captions can be opened and saved as .srt');
check(/not switched on|needs a provider/.test(read(`${dir}/panels2.tsx`)), 'GIF search and automatic captions say honestly that they need a provider');
check(/force-dark/.test(read(`${dir}/StudioApp.tsx`)), 'the editor stays dark in the light theme');

section('8. Professional layout: media pool, colour grading, timeline');
const types = read(`${dir}/types.ts`), gl = read(`${dir}/gl.ts`), rend = read(`${dir}/render.ts`), color = read(`${dir}/ColorPanel.tsx`), pool = read(`${dir}/MediaPool.tsx`), tl = read(`${dir}/Timeline.tsx`), shell = read(`${dir}/StudioApp.tsx`), css = read('src/index.css');
check(/interface Grade/.test(types) && /grade\?: Grade/.test(types), 'a clip can carry a colour grade (optional, so older projects still open)');
check(/uLift/.test(gl) && /uGamma/.test(gl) && /uGain/.test(gl) && /uWash/.test(gl), 'the shader does lift / gamma / gain and a colour wash');
check(/grade: env\.original \? undefined : l\.grade/.test(rend) && /isPlainGrade\(l\.grade\)/.test(rend), 'the grade is drawn in the preview and both exports, and left out while comparing with the original');
check(/data-testid=\{testId\}/.test(color) && /wheel-lift/.test(color) && /wheel-gamma/.test(color) && /wheel-gain/.test(color), 'three colour wheels: shadows, midtones, highlights');
check(/color-spectrum/.test(color) && /color-histogram/.test(color) && /look-\$\{l\.id\}/.test(color) && /id: 'teal-orange'/.test(color), 'a colour spectrum, a live histogram and starting looks');
check(/onKeyDown=\{key\}/.test(color) && /colour wheel`\}/.test(color), 'the wheels can be used with the keyboard and are named for screen readers');
check(/ASSET_DRAG/.test(pool) && /draggable/.test(pool) && /data-testid=\{`bin-\$\{b\.id\}`\}/.test(pool), 'the media pool has folders and thumbnails that can be dragged');
check(/dropAsset/.test(tl) && /onDrop=\{lane/.test(tl) && /ASSET_DRAG/.test(tl), 'a thumbnail dropped on a track lands where it is dropped');
check(/useStrip/.test(tl) && /<Film /.test(tl) && /<Wave /.test(tl), 'clips show real frames along them and a waveform under the sound');
check(/'V1'/.test(tl) && /`A\$\{i \+ 1\}`/.test(tl) && /VolumeX/.test(tl) && /EyeOff/.test(tl) && /LockOpen/.test(tl), 'every track has a name and hide / lock / mute switches');
check(/data-testid="studio-snap"/.test(tl) && /snapTime/.test(tl), 'clips snap to the playhead and to each other (and it can be switched off)');
check(/\.studio-grid/.test(css) && /grid-template-areas: "nav panel stage props" "tl tl tl tl"/.test(css) && /className="studio-grid"/.test(shell), 'on a computer the timeline runs along the whole bottom');
check(/waveform\(list\[i\]\)/.test(shell), 'a video\'s own sound outline is worked out in the background');
check(/if \(l\.muted\) return 0;/.test(read(`${dir}/player.ts`)), 'a muted track is silent in the preview and in the export');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
