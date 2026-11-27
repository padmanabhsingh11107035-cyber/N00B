// Home page (2026-11-16): anonymous thoughts and public polls are mixed in between the posts; their two pages left the menu; "Feed" is a button in the top bar.
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
let passed = 0, failed = 0;
const check = (ok, name) => { if (ok) { passed++; console.log('  ok   ' + name); } else { failed++; console.log('  FAIL ' + name); } };
const feed = read('src/components/Feed/FeedView.tsx'), mix = read('src/components/Feed/HomeMix.tsx'), chooser = read('src/components/PostCreation/CreateChooser.tsx'), app = read('src/App.tsx'), css = read('src/components/Feed/home.css'), poll = read('src/components/Feed/PollComposer.tsx');
check(!/feed-videos-button|hv-feed-btn/.test(feed + css) && !/FeedIcon/.test(read('src/components/Navigation/FloatingNavBar.tsx')), 'the Feed icon is gone from the top bar of Home and from the bottom bar (its videos and live streams are on Home)');
check(/@media \(max-width: 430px\) \{\s*header\.hv-top \{ gap: 3px !important;/.test(css), 'on a narrow phone the top bar buttons get smaller so nothing overlaps');
check(/const mixOn = activeFeedFilter === 'foryou' && activeCategory === 'All';/.test(feed) && /mixOn \? mixView\.slots\.indexOf\(i\) : -1/.test(feed) && /mixView\.items\[slot\]/.test(feed), 'thoughts and polls sit between the posts of the plain For You feed only');
check(!/id: 'anonymous', entryId/.test(feed) && /f\.id !== 'polls'\)/.test(feed) && !/id: 'report', entryId/.test(feed), 'the two pages (and "Report a problem", now in Customer Support) are gone from the three-line menu for everyone');
check(/useHomeMix\(featOn\('anonymous'\), featOn\('fun-polls'\), refreshNonce, featOn\('videos'\), featOn\('live'\)\)/.test(feed), 'the page switches of the administrator still decide whether they show, and a refresh of Home loads them again');
check(!/username|displayName|avatar/.test(mix.slice(mix.indexOf('const AnonCard'), mix.indexOf('const PollCard'))) && /<p className="hm-body[^>]*>\{m\.body\}<\/p>/.test(mix), 'an anonymous card has nothing of its author to show, and its text is drawn as plain text');
check(/kind: 'anon', title: 'Anonymous post'/.test(chooser) && /kind: 'poll', title: 'Poll'/.test(chooser) && /useFeatureOn\('fun-polls'\)/.test(chooser) && /kind === 'anon' \|\| kind === 'poll'\) \{ setActiveTab\('feed'\); setHomeCompose\(kind\); \}/.test(app), 'the Create sheet makes both; the result lands on Home');
check(/announceMixItem\(\{ kind: 'poll'/.test(poll) && /announceMixItem\(\{ kind: 'anon'/.test(mix) && /postingRef\.current \|\| !canPublish/.test(mix), 'a new one shows on Home at once; a double tap can not publish twice');
check(/:root\[data-theme="light"\] \.hm-sheet/.test(css) && /prefers-reduced-motion: reduce\) \{ \.hm-scrim/.test(css), 'dark and light, still when the phone asks for less motion');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
