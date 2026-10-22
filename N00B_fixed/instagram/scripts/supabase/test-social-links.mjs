// Social profiles on a profile are the apps' own icons as buttons (never the link), the log-in install button says just "Install NOOB", and the big logo of the side menu is drawn
// on the page itself so it shows in the middle. Usage: node scripts/supabase/test-social-links.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const S = await import(pathToFileURL(path.resolve('src/utils/socialLinks.ts')).href);
const t = S.socialTarget;

section('1. What a social field opens');
const full = t('instagram', 'https://www.instagram.com/nooob.xyz?igsh=abc123&utm_source=qr');
check(full && full.href.startsWith('https://www.instagram.com/nooob.xyz?') && full.official === true, 'a pasted Instagram link opens that link and gets the Instagram icon');
check(t('instagram', '@nooob.xyz').href === 'https://instagram.com/nooob.xyz' && t('instagram', 'nooob.xyz').href === 'https://instagram.com/nooob.xyz', 'a handle (with or without @) becomes the profile address');
check(t('instagram', 'instagram.com/nooob.xyz').href === 'https://instagram.com/nooob.xyz', 'a link without https:// works too');
check(t('youtube', 'https://youtube.com/@saraah_robotics?si=-ISUY-OxaG3TI1JF').official === true && t('youtube', 'https://youtu.be/abc').official === true, 'YouTube links, also the short youtu.be');
check(t('youtube', '@saraah_robotics').href === 'https://youtube.com/@saraah_robotics' && t('youtube', 'saraah_robotics').href === 'https://youtube.com/@saraah_robotics' && t('youtube', 'channel/UC123').href === 'https://youtube.com/channel/UC123', 'a YouTube channel name, @name or channel/id');
check(t('twitter', '@nooob').href === 'https://x.com/nooob' && t('twitter', 'https://twitter.com/nooob').official === true && t('twitter', 'https://x.com/nooob').official === true, 'X / Twitter: handle, twitter.com and x.com');
check(t('github', 'padmanabh').href === 'https://github.com/padmanabh' && t('github', 'https://github.com/padmanabh/N00B').official === true, 'GitHub: user name or link');

section('2. An icon never lies, a link is never unsafe');
const other = t('instagram', 'https://evil.example.com/login');
check(other && other.official === false && other.host === 'evil.example.com', 'an "Instagram" link that is on another site is marked as not official (it gets a plain link icon with the real address)');
check(t('instagram', 'https://instagram.com.evil.example.com/x').official === false && t('instagram', 'https://notinstagram.com/x').official === false, 'look-alike addresses are not official either');
check(t('instagram', 'javascript:alert(1)') === null && t('instagram', 'data:text/html,<b>x</b>') === null, 'javascript: and data: are never followed');
check(t('instagram', 'https://user:pass@instagram.com/x') === null, 'no address with a hidden login in it');
check(t('instagram', '') === null && t('instagram', '   ') === null && t('instagram', undefined) === null, 'an empty field shows nothing');
check(t('github', 'bad name with spaces') === null && t('twitter', '@@@') === null, 'a handle with spaces or strange letters shows nothing');

section('3. The profile');
const profile = read('src/components/Profile/ProfileView.tsx'), buttons = read('src/components/Profile/SocialLinkButtons.tsx');
check(/<SocialLinkButtons links=\{targetUser\.socialLinks\} \/>/.test(profile) && /import \{ SocialLinkButtons \}/.test(profile), 'the profile uses the icon buttons');
check(!/targetUser\.socialLinks\.(instagram|youtube|twitter|github)\}<\/span>/.test(profile) && !/<span>@\{targetUser\.socialLinks/.test(profile), 'and no longer prints the link or the handle as text');
check(/<a key=\{p\} href=\{t\.href\} target="_blank" rel="noopener noreferrer nofollow"/.test(buttons) && /aria-label=\{`Open \$\{label\}`\}/.test(buttons), 'each icon is a button that opens the link in a new tab (and says what it opens)');
check(/instagram: \{ Icon: Instagram/.test(buttons) && /Youtube/.test(buttons) && /Twitter/.test(buttons) && /Github/.test(buttons) && /Link2/.test(buttons), 'icons: Instagram, YouTube, X / Twitter, GitHub, and a plain link icon for any other address');
check(!/\{t\.href\}<\/|>\s*\{label\}\s*</.test(buttons.replace(/aria-label[^>]*>/g, '')), 'the link itself is not written on the page');
const edit = read('src/components/Profile/EditProfileModal.tsx');
check(/Instagram link or handle/.test(edit) && /YouTube link or channel/.test(edit) && /X \/ Twitter link or handle/.test(edit) && /GitHub link or username/.test(edit), 'the edit form says a link or a handle can be typed');

section('4. The install button of the log-in screen');
const auth = read('src/components/Auth/AuthView.tsx');
check(/\{installElsewhere \? 'Install the new NOOB app' : 'Install NOOB'\}/.test(auth), 'it says "Install NOOB" and nothing else');
check(!/Free · opens like a real app · 2 taps/.test(auth) && !/Opens Chrome to install · free · 2 taps/.test(auth), 'the second line ("Free · opens like a real app · 2 taps") is gone');
check(/installElsewhere && <span[^>]*>Now at noobsocials\.com/.test(auth), 'only the notice for people who must move to the new address keeps its line');

section('5. The big logo');
const box = read('src/components/Common/LogoLightbox.tsx');
check(/import \{ createPortal \} from 'react-dom'/.test(box) && /createPortal\(\s*<div className="fixed inset-0 z-\[300\]/.test(box) && /document\.body/.test(box), 'the popup is drawn on the page itself, so it is in the middle and dims everything, not only the side menu');
check(/logo-close/.test(box) && /key === 'Escape'/.test(box) && /w-\[min\(78vw,70vh,380px\)\]/.test(box), 'the cross, Escape and the size are as before');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
