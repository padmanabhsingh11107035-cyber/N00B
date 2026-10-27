// The free NOOB avatars and the "Choose an avatar" page. Usage: node --liftoff-only scripts/supabase/test-avatars.mjs
import fs from 'node:fs';
import { AVATARS, avatarUrl, avatarIdOf } from '../../src/data/avatars.ts';

let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');

console.log('1. The characters');
check(AVATARS.length === 20 && new Set(AVATARS.map((a) => a.id)).size === 20 && new Set(AVATARS.map((a) => a.name)).size === 20, 'twenty avatars, each with its own id and name (no repeats)');
check(AVATARS.every((a) => /^#[0-9a-f]{6}$/i.test(a.bg) && a.role && a.tagline && a.intro.length > 120 && a.clothing.length === 3 && a.extras.length >= 2 && a.traits.length === 3 && a.info.age >= 18 && a.info.height && a.info.from && a.info.colour), 'every avatar has a colour, a role, an introduction, three clothes, extras, three traits and its info');
check(AVATARS.every((a) => ['', 'top', 'pants', 'boots'].every((k) => fs.existsSync(`public${avatarUrl(a.id, k)}`))), 'every avatar has its picture and the three close-ups of the clothes');
check(AVATARS.every((a) => fs.statSync(`public${avatarUrl(a.id)}`).size < 200_000), 'and the pictures are small enough for a phone (under 200 KB)');
check(avatarIdOf('https://noobsocials.com/avatars/nova.webp') === 'nova' && avatarIdOf('/avatars/zane.webp?x=1') === 'zane' && avatarIdOf('/avatars/hacker.webp') === null && avatarIdOf(null) === null, 'a saved profile picture is recognised as an avatar (and only a real one)');

console.log('\n2. The page and where it is opened');
const page = read('src/components/Avatars/AvatarPicker.tsx');
check(/scrollSnapType: 'x mandatory'/.test(page) && /data-testid="avatar-more"/.test(page) && /SNAP_OPEN = 0\.3/.test(page), 'swipe sideways through the characters; an arrow lifts the sheet over 70 % of the page');
check(/Math\.max\(0, Math\.min\(H\.current, d\.startPos \+ \(e\.clientY - d\.startY\)\)\)/.test(page) && /transition = animate && !calm/.test(page), 'the sheet follows the finger exactly, can not go past full or closed, and settles smoothly on release');
check(/data-noob-keep=""/.test(page) && /prefers-reduced-motion/.test(page) && /aria-modal="true"/.test(page), 'the page keeps its own design, respects "reduce motion" and is a proper dialog');
check(/id: 'avatars'[^}]*action: 'openAvatars'/.test(read('src/components/Settings/registry.ts')) && /openAvatars: \(\) => void;/.test(read('src/components/Settings/types.ts')), 'Choose an avatar is in the three dots of the profile (Settings and activity)');
const prof = read('src/components/Profile/ProfileView.tsx');
check(/openAvatars: \(\) => \{ setShowSettingsHub\(false\); setShowAvatarPicker\(true\); \}/.test(prof) && /updateFullProfile\(\{ avatar: avatarStoredUrl\(a\.id\) \}/.test(prof), 'choosing saves it as the profile picture (the full address, so it works in emails and the Android app too)');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
