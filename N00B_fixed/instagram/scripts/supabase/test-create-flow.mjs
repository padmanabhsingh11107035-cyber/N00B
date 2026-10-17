// The "+" is a Create page like Instagram's: first WHAT to make (Post / Reel / Story / Video / Live / Thought), then for a Post or Reel three steps —
// pick, edit, details — with Instagram's tools (filters, adjustments, shape, a reel's cover, caption count, advanced settings).
// Usage: node --liftoff-only scripts/supabase/test-create-flow.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const app = read('src/App.tsx');
const chooser = read('src/components/PostCreation/CreateChooser.tsx');
const modal = read('src/components/PostCreation/PostCreationModal.tsx');
const card = read('src/components/Feed/PostCard.tsx');

const L = await import(pathToFileURL(path.resolve('src/utils/slideLook.ts')).href);

section('1. The chooser');
const kinds = [...chooser.matchAll(/\{ kind: '(\w+)', title: '([^']+)'/g)].map((m) => `${m[1]}:${m[2]}`);
check(kinds.join(',') === 'post:Post,reel:Reel,story:Story,video:Video,live:Live,thought:Thought', 'Post, Reel, Story, Video, Live and Thought', kinds.join(','));
check(/data-testid=\{`create-\$\{kind\}`\}/.test(chooser) && /e\.key === 'Escape'/.test(chooser), 'each row can be tested and Escape closes it');
check(/<CreateChooser\s*\n\s*onClose=\{\(\) => setShowPostCreationModal\(false\)\}/.test(app), '"+" (bottom bar, side menu, the Home bonus banner) opens the chooser');
check(/kind === 'post' \|\| kind === 'reel' \|\| kind === 'thought'\) setCreateKind\(kind\)/.test(app) && /kind === 'story'\) setShowCreateStoryModal\(true\)/.test(app) && /kind === 'video'\) setShowUploadVideoModal\(true\)/.test(app) && /kind === 'live'\) handleGoLiveTap\(\)/.test(app), 'each choice opens its own creator');
check(/<PostCreationModal\s*\n\s*key=\{createKind\}\s*\n\s*initialType=\{createKind\}/.test(app), 'a Post, Reel or Thought opens the creator on that type');

section('2. Three steps');
check(/useState<'select' \| 'edit' \| 'details' \| 'done'>\(initialType === 'thought' \? 'details' : 'select'\)/.test(modal), 'it starts on "select" (a Thought starts on the details)');
check(/if \(added > 0\) setStep\('edit'\)/.test(modal) && /if \(res\.url \|\| res\.objectKey\) setStep\('edit'\)/.test(modal), 'once the pictures or the video are in, it goes on to editing by itself');
check(/Select from device/.test(modal) && /Drag photos and videos here/.test(modal) && /onDrop=/.test(modal) && /capture="environment"/.test(modal), 'pick from the device, drag and drop, or the camera');
check(/or write a thought, with no picture/.test(modal), 'a picture-less thought is still possible');
check(/onClick=\{\(\) => setStep\('details'\)\}/.test(modal) && /\{isPublishing \? 'Sharing\.\.\.' : 'Share'\}/.test(modal) && /\{step === 'edit' && \(/.test(modal), '"Next" on the edit step and "Share" on the last one, in the header');
check(/window\.confirm\('Discard what you picked and start over\?'\)/.test(modal), 'going back from editing asks before throwing the pictures away');

section('3. The edit tools');
for (const t of ['Filters', 'Adjustments', 'Crop', 'Add']) check(modal.includes(`'${t}'`), `a "${t}" tab`);
const ids = (read('src/data/postFilters.ts').match(/export const POST_FILTERS = \[[\s\S]*?\];/) || [''])[0].match(/id: '(\w+)'/g) || [];
check(ids.length >= 14 && ['clarendon', 'gingham', 'moon', 'lark', 'reyes', 'juno', 'slumber', 'crema', 'ludwig', 'aden', 'perpetua'].every((n) => ids.some((i) => i.includes(`'${n}'`))), 'Instagram\'s eleven filters are all there, plus NOOB\'s own');
for (const w of ['Brightness', 'Contrast', 'Saturation', 'Temperature']) check(modal.includes(`'${w}'`), `an Adjustments slider: ${w}`);
check(/SLIDE_SHAPES\.map/.test(modal) && L.SLIDE_SHAPES.map((s) => s.id).join() === 'original,1:1,4:5,16:9', 'Crop: Original, 1:1, 4:5, 16:9');
check(/filter: s\.filter \|\| 'normal'/.test(modal) && !/selectedFilter/.test(modal), 'each picture keeps its OWN look (it used to be one filter for the whole post)');
check(/Use this filter on all/.test(modal), 'and one tap puts a filter on every picture');
check(/chooseCoverFrame/.test(modal) && /captureVideoFrames\(firstFile, 8, 96\)/.test(modal) && /Add from device/.test(modal), 'a reel\'s cover: a frame from a strip of eight, or a picture of your own');

section('4b. Crop and zoom, alt text, the shared screen, "Use this sound"');
check(/aria-label="Zoom"/.test(modal) && /aria-label="Move left or right"/.test(modal) && /aria-label="Move up or down"/.test(modal) && /Reset crop/.test(modal), 'crop: a zoom slider, and (zoomed in) move left / right and up / down');
check(/data-testid="create-alt"/.test(modal) && /maxLength=\{ALT_LIMIT\}/.test(modal) && /Alt text for picture/.test(modal), 'Accessibility: alt text for each picture');
check(/setStep\('done'\)/.test(modal) && /data-testid="share-other-apps"/.test(modal) && /navigator\.share\(\{ title: 'NOOB Socials', text, url: link \}\)/.test(modal) && /navigator\.clipboard\.writeText/.test(modal), 'after sharing: a screen with "Share to other apps" (the share sheet of the phone, or the link copied)');
check(/initialAudio\?: MusicSelection \| null;/.test(modal) && /useState<MusicSelection \| null>\(initialAudio\)/.test(modal), 'the creator can open with a sound already chosen');
const reelsView = read('src/components/Reels/ReelsView.tsx');
check(/data-testid="reel-use-sound"/.test(reelsView) && /currentReel\?\.audioTrack\?\.audioUrl/.test(reelsView) && /onUseSound=\{\(sound\) => \{ setCreateSound\(sound\); setCreateKind\('reel'\); \}\}/.test(app), 'the menu of a reel has "Use this sound" (only when the reel has its own song) and it opens the reel creator with that song');

section('4. The details');
check(/CAPTION_LIMIT = 2200/.test(modal) && /maxLength=\{CAPTION_LIMIT\}/.test(modal) && /data-testid="caption-count"/.test(modal), 'the caption holds 2,200 characters and shows how many are used');
check(/<EmojiPanel onPick=\{insertCaptionEmoji\}/.test(modal), 'an emoji button for the caption');
check(/placeholder="Add location"/.test(modal) && /Tag people/.test(modal) && /'Add music'/.test(modal) && /Advanced settings/.test(modal), 'location, tag people, music and advanced settings');
check(['Hide like and view counts', 'Turn off commenting', 'Label as AI generated'].every((t) => modal.includes(`label="${t}"`)) && /role="switch"/.test(modal), 'advanced settings are on / off switches');
check(/Schedule for later/.test(modal) && /placeholder="https:\/\/example\.com"/.test(modal), 'a link and a schedule');
check((modal.match(/\{creationType === 'post' && \(/g) || []).length >= 3 && /placeholder="Add location"/.test(modal), 'a reel only shows what a reel can keep (caption, music, category, hashtags): no location or advanced switches that would be ignored');
check(/disabled=\{!isReadyToSubmit \|\| isUploadingMedia \|\| isPublishing\}/.test(modal) && /Choose a category to share/.test(modal), 'the category is still required before Share');

section('5. A picture\'s look is saved in its filter text and read back');
check(L.parseLook('clarendon').preset === 'clarendon' && L.parseLook('clarendon').shape === 'original' && L.lookCss('clarendon') === 'contrast(1.25) saturate(1.25)', 'an older post (a bare filter id) reads exactly as before');
check(L.parseLook('nonsense|ar=9:9|b=abc').preset === 'normal' && L.parseLook('nonsense|ar=9:9|b=abc').shape === 'original' && L.parseLook('nonsense|ar=9:9|b=abc').brightness === 0 && L.parseLook('clarendon|b=500').brightness === 100 && L.parseLook('clarendon|b=-500').brightness === -100, 'garbage is ignored, numbers are held to -100..100');
const built = L.buildLook({ preset: 'moon', shape: '1:1', brightness: 20, contrast: -10, saturation: 0, warmth: 30 });
check(built === 'moon|ar=1:1|b=20|c=-10|w=30', 'a look is written compactly', built);
check(JSON.stringify(L.parseLook(built)) === JSON.stringify({ preset: 'moon', shape: '1:1', brightness: 20, contrast: -10, saturation: 0, warmth: 30, zoom: 1, fx: 50, fy: 50, alt: '' }), 'and read back exactly');
const zoomed = L.buildLook({ ...L.NO_LOOK, preset: 'moon', zoom: 1.8, fx: 30, fy: 60, alt: 'A red car | at night = cool ' });
check(zoomed === 'moon|z=1.8|fx=30|fy=60|alt=A%20red%20car%20%7C%20at%20night%20%3D%20cool%20', 'zoom, where it looks, and the alt text are written safely (a | or = in the alt text can not break the rest)', zoomed);
const back = L.parseLook(zoomed);
check(back.zoom === 1.8 && back.fx === 30 && back.fy === 60 && back.alt === 'A red car | at night = cool ', 'and read back exactly, spaces kept');
check(L.parseLook('x|z=9').zoom === 3 && L.parseLook('x|z=0.2').zoom === 1 && L.parseLook('x|alt=%E0%A4%A').alt === '' && L.lookAlt('clarendon') === '', 'zoom is held to 1..3 and a broken alt text is ignored');
check(JSON.stringify(L.lookStyle('moon|z=2|fx=25|fy=75')) === JSON.stringify({ filter: 'grayscale(1) contrast(1.1) brightness(1.1)', transform: 'scale(2)', transformOrigin: '25% 75%' }) && L.lookStyle('normal') === undefined, 'a zoom is a scale around the chosen point (the box hides the rest)');
check(L.buildLook(L.NO_LOOK) === 'normal', 'no look at all is just "normal", like every post before');
check(L.lookRatio('moon|ar=16:9') > 1.77 && L.lookRatio('moon|ar=4:5') === 0.8 && L.lookRatio('moon') === null, 'the shape is read back as a ratio (none = the picture\'s own)');
check(L.lookCss('normal|b=100').includes('brightness(1.5') && L.lookCss('normal|s=-100').includes('saturate(0.000)') && L.lookCss('normal') === '', 'adjustments turn into a CSS filter after the preset');

section('6. It shows the same everywhere the post is shown');
check(/lookStyle\(slide\.filter\)/.test(card) && /lookRatio\(currentSlide\.filter\)/.test(card), 'the feed card uses the look and the chosen shape');
const thumb = read('src/components/Common/PostThumbnailMedia.tsx');
check(/filter\?: string \| null;/.test(thumb) && (thumb.match(/lookStyle\(filter\)/g) || []).length === 2, 'grid thumbnails (profile, explore, saved) do too');
check((read('src/components/Profile/ProfileView.tsx').match(/filter=\{post\.slides\?\.\[0\]\?\.filter\}/g) || []).length === 4 && /filter=\{post\.slides\?\.\[0\]\?\.filter\}/.test(read('src/components/Explore/ExploreView.tsx')), 'every grid hands it the picture\'s filter text');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
