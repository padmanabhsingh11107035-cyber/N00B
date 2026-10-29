// "Go to the previous page": a page that is opened from another page must NOT close it; it opens on top, and closing it (the cross, Back) comes back to the page it was opened from, exactly as it was.
// The pages the app lists as layers (profiles, Fun pages: src/utils/pageLayers.tsx) and the pages opened from the Home menu (src/utils/menuReturn.ts) already worked that way. This checks the other
// places found by scanning the whole app (Support -> Terms / Privacy Policy, Our Team -> a profile, the comments -> a profile, the video lists -> a video, the profile's pages, the chat's
// encryption pages, the food stall's cart -> checkout, the live picture -> upgrade), and scans the whole source for a handler that closes one page and opens another, so a new one can not slip in.
// Usage: node scripts/supabase/test-previous-page.mjs
import fs from 'node:fs';
import path from 'node:path';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const C = 'src/components/';
/** the z-index numbers of the full-screen layers drawn by a file, in the order they appear */
const zs = (f) => [...read(C + f).matchAll(/fixed inset-0 z-(?:\[(\d+)\]|(\d+))/g)].map((m) => Number(m[1] ?? m[2]));
/** the body of the handler that starts at `marker` (up to the first line that closes it) */
const around = (src, marker, len = 330) => { const i = src.indexOf(marker); return i < 0 ? '' : src.slice(i, i + len); };

section('1. Support -> Terms / Privacy Policy: the cross comes back to Support');
const modal = read(C + 'Support/CustomerSupportModal.tsx');
check(/React\.lazy\(\(\) => import\('\.\.\/Legal\/TermsAndConditions'\)/.test(modal) && /React\.lazy\(\(\) => import\('\.\.\/Legal\/PrivacyPolicy'\)/.test(modal), 'the help desk draws the Terms and the Privacy Policy itself');
check(modal.indexOf('<TermsAndConditions') > modal.indexOf('data-testid="support-page"') && !/leaveTo|onOpenTerms\?|onOpenPrivacy\?/.test(modal), 'on top of itself (drawn after it), and it no longer closes itself first');
check(/setLegal\('terms'\)/.test(modal) && /setLegal\('privacy'\)/.test(modal) && /onClose=\{\(\) => setLegal\(null\)\}/.test(modal), 'opening one only sets what is on top; closing it only clears that');
check(/zs\b/.test('zs') && zs('Legal/TermsAndConditions.tsx')[0] === 50 && zs('Legal/PrivacyPolicy.tsx')[0] === 50, 'they are full-screen layers like the help desk, drawn later, so they cover it');
for (const [f, label] of [['App.tsx', 'App'], ['Profile/ProfileView.tsx', 'the profile page'], ['Feed/FeedView.tsx', 'Home']]) {
  const src = read(f.startsWith('App') ? 'src/App.tsx' : C + f);
  const use = around(src, '<CustomerSupportModal', 400);
  check(use && !/onOpenTerms|onOpenPrivacy/.test(use), `${label}: opens the help desk without a "close it, then open Terms" hand-over`);
}

section('2. Our Team -> a member, the comments -> a commenter');
const feed = read(C + 'Feed/FeedView.tsx');
const team = around(feed, 'onOpenProfile={(m) => {', 420);
check(/onNavigateToProfile\(/.test(team) && !/setShowOurTeam\(false\)/.test(team), 'a team member\'s profile opens on top of the team page (Back comes back to the team)');
const cs = read(C + 'Feed/CommentsSheet.tsx');
check(/if \(user\) onNavigateToProfile\(user\);/.test(cs) && !/onClose\(\); onNavigateToProfile/.test(cs), 'a commenter\'s profile opens on top of the comments (Back comes back to the comments)');

section('3. The video lists -> a video');
const hv = read(C + 'Videos/HomeVideoFeedView.tsx');
check((hv.match(/onOpenVideo=\{\(v\) => setOpenVideo\(v\)\}/g) || []).length === 4 && !/setShowHistory\(false\); setOpenVideo|setShowLikedVideos\(false\); setOpenVideo|setShowPlaylists\(false\); setOpenVideo/.test(hv), 'watch history, liked videos and playlists stay open when a video is opened from them');
const listZ = [...zs('Videos/WatchHistoryPage.tsx').slice(0, 1), ...zs('Videos/LongVideoListPage.tsx').slice(0, 1), ...zs('Videos/LongVideoPlaylistsView.tsx')];
check(listZ.length === 4 && listZ.every((z) => z === 49) && zs('Videos/VideoWatchPage.tsx')[0] === 50, 'and the video is drawn above them (the lists are one layer lower)', listZ.join());

section('4. The profile page\'s pages');
const pv = read(C + 'Profile/ProfileView.tsx');
check(/onOpenEncryption=\{\(\) => setShowEncryptionSettings\(true\)\}/.test(pv) && pv.indexOf('<EncryptionSettingsModal') > pv.indexOf('<DevicesModal'), 'devices -> encryption keys: devices stays open underneath (and the keys page is drawn after it)');
check(zs('Profile/DevicesModal.tsx')[0] === 130 && zs('Chat/EncryptionModals.tsx').includes(130), 'at the same height, so the later one covers the earlier');
check(/onSendInChat=\{\(\) => setShowShareToChatModal\(true\)\}/.test(pv) && zs('Profile/ShareToChatModal.tsx')[0] === 96 && zs('Profile/ProfileQrModal.tsx')[0] === 95, 'the QR code -> share in a chat: the QR code stays open underneath, the share page is one layer higher');
check(/onNavigateToProfile=\{\(u\) => onNavigateToUserProfile\?\.\(u\)\}/.test(pv) && !/setWatchVideoPost\(null\); onNavigateToUserProfile/.test(pv), 'a video\'s owner: the video stays open underneath the profile');
const lp = read(C + 'Profile/LiveProfilePictureModal.tsx');
check(/onClick=\{onUpgradeClick\}/.test(lp) && !/onClose\(\);\s*onUpgradeClick\(\)/.test(lp) && Math.min(...zs('Profile/ProFeaturesModal.tsx')) > zs('Profile/LiveProfilePictureModal.tsx')[0], 'the live picture -> upgrade: the picture page stays open and the upgrade page is above it');

section('5. The chat\'s encryption pages and the food stall');
const chat = read(C + 'Chat/ChatView.tsx');
check(/onOpenSettings=\{\(\) => setShowEncryptionSettings\(true\)\}/.test(chat) && zs('Chat/EncryptionModals.tsx').join() === '125,130', 'what the lock means -> my keys: the first page stays underneath, the second is above it');
const food = read(C + 'Store/FoodStallView.tsx');
check(/onClick=\{\(\) => setShowCheckout\(true\)\}/.test(food) && zs('Store/FoodStallView.tsx').includes(90) && zs('Store/FoodStallView.tsx').includes(95), 'the cart -> checkout: the cart stays open underneath (the checkout is above it)');
check(/persistCart\(\{\}\);\s*setShowCheckout\(false\);\s*setShowCart\(false\);/.test(food), 'and when the order is placed both close (nothing is left open behind the confirmation)');

section('6. Scan of the whole source: a handler that closes one page and opens another');
// A reviewed pair is listed here with the reason it is meant to close. Anything else found is a page that closed the page it was opened from: keep the first one open and draw the second
// above it (a higher z-index, or later in the same place), the way the pairs above do. Popup menus (a name with "Menu" in it) close themselves when a choice is made: not pages.
const REVIEWED = new Set([
  // the state of a screen, not a page: a flag set to false and another set to true (a loading flag, a step of one form)
  'Draw/NoobDrawPage.tsx|setConfirming|setSpinning(true)', 'Feed/CommentMediaComposer.tsx|setPanel|setIsUploading(true)', 'Fun/PollsPage.tsx|setArmed|setBusy(true)',
  'Games/minigames/CyberSnakeGame.tsx|setResumable|setIsPlaying(true)', 'Games/minigames/RockPaperScissorsGame.tsx|setRoundResult|setAwaitingPlayer2(true)',
  'LiveStream/LiveLoungeRoomView.tsx|setNeedRegister|setBusy(true)', 'Modals/AdminTeamPanel.tsx|setError|setUploading(true)', 'NoobRooms/GuessTheSongView.tsx|setPlaying|setOptionsRevealed(true)',
  'Profile/LiveProfilePictureModal.tsx|setPickedFile|setIsUploading(true)', 'Profile/ShareToChatModal.tsx|setSending|setDone(true)', 'Reels/ReelsView.tsx|setIsVideoBuffering|setVideoFailed(true)',
  'Team/TeamJoinPage.tsx|setError|setUploading(true)', 'Videos/VideoPlayer.tsx|setPlaying|setShowControls(true)', 'Videos/VideoPlayer.tsx|setFailed|setBuffering(true)',
  'src/context/MusicPlayerContext.tsx|setPlaybackError|setIsPlaying(true)', 'Games/GamePlayModal.tsx|setGameResult|setRematchRequested(true)',
  'Family/FamilyMap.tsx|setProblem|setShare(true)', 'Support/GuestSupport.tsx|setConfirmEnd|setBusy(true)', // Family Map: the message about the location is cleared and sharing is on again; Guest support: the end-chat question is answered and the call is sent
  // a hand-over to something that cannot sit underneath
  'Chat/ChatView.tsx|setCallIsOutgoing|setShowCallModal(true)',                            // an incoming call replaces what was on screen
  'src/App.tsx|setLiveLoungeMeetingId|setShowLiveLoungeUpsell(true)',                      // a notification opens a page of another tab: the notification list closes (the tab is under it)
  'Stories/StoryTray.tsx|setSelectedNoteViewer|onOpenStatusNoteModal(',                    // the note viewer plays a song by itself: it must stop while the note is edited
  'Profile/ProfileView.tsx|setActiveHighlightForViewer|setShowHighlightManager(true)',    // the highlight viewer plays stories by itself: it must stop while the highlight is edited
  'Profile/ProfileView.tsx|setEditingHighlight|setShowHighlightManager(true)',            // a new highlight: nothing was open
  'Profile/ProfileView.tsx|setShowSettingsHub|onOpenProfessionalDashboard(',              // the Settings hub walks the browser history itself (its own back stack)
  'Profile/ProfileView.tsx|setShowSettingsHub|setShowAvatarPicker(true)',                 // the avatar page replaces the Settings hub (which walks its own history)
]);
const pat = /(?:(set[A-Z]\w*)\((?:false|null)\)|\b(onClose)\(\))\s*;\s*(?:\n\s*)?(set[A-Z]\w*\(true\)|on(?:Open|Navigate|Upgrade|Select)\w*\()/g;
const found = [];
for (const f of walk('src').filter((x) => /\.tsx$/.test(x))) {
  const src = read(f);
  for (const m of src.matchAll(pat)) {
    const first = m[1] || 'onClose';
    if (first.includes('Menu')) continue;
    found.push(`${f.replace(/\\/g, '/').replace('src/components/', '')}|${first}|${m[3]}`);
  }
}
const unreviewed = found.filter((k) => !REVIEWED.has(k));
check(unreviewed.length === 0, `${found.length} places close one thing and open another; every one is reviewed (a flag of a screen, or a hand-over that has to close)`, 'NOT REVIEWED: ' + [...new Set(unreviewed)].join('  '));
const stale = [...REVIEWED].filter((k) => !found.includes(k));
check(stale.length === 0, 'and the list holds nothing that is gone from the source', stale.join('  '));
check(!/onClose\(\);\s*on(?:OpenTerms|OpenPrivacy)/.test(walk('src').filter((x) => /\.tsx$/.test(x)).map(read).join('\n')), 'nothing closes a page to open the Terms or the Privacy Policy');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
