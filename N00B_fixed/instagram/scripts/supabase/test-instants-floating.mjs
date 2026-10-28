// Instants on the Chat page, the way Instagram shows them in the inbox: no strip across the top any more (it took about a fifth of the screen), a small grey "+" tab tucked at the right
// edge of the list instead, friends' tilted thumbnails stacked above it, "Your Instants" in the ⋮ menu. Usage: node scripts/supabase/test-instants-floating.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const stack = read('src/components/Chat/InstantsStack.tsx'), chat = read('src/components/Chat/ChatView.tsx');

check(/data-testid="instants-floating"/.test(stack) && /absolute right-0 bottom-\[110px\] z-30/.test(stack) && /pointer-events-none/.test(stack), 'the Instants are a floating piece at the right edge, above the bottom of the list, and take no room from the chats');
check(!/overflow-x-auto no-scrollbar/.test(stack) && !/border-b border-zinc-900 flex items-center gap-3/.test(stack), 'there is no strip across the top of the page any more');
check(/w-\[54px\] overflow-hidden/.test(stack) && /w-\[74px\] h-\[84px\] rounded-\[26px\] bg-zinc-700\/90/.test(stack), 'the grey "+" tab is wider than its frame, so part of it is tucked behind the edge, like Instagram');
check(/data-testid="instants-add"/.test(stack) && /onClick=\{onOpenCamera\}/.test(stack) && /<Plus className="w-8 h-8 text-white"/.test(stack), 'the "+" tab opens the camera');
check(/groups\.slice\(0, 3\)/.test(stack) && /onClick=\{\(\) => onOpenViewer\(group\.items\)\}/.test(stack) && /data-testid="instants-friend"/.test(stack) && /\+\{more\}/.test(stack), 'friends\' instants are stacked above the tab (three, then "+2"), a tap opens what that friend sent');
check(/rotate\(\$\{i % 2 \? 7 : -5\}deg\)/.test(stack) && /rotate-\[-7deg\]/.test(stack), 'the pieces are tilted, alternately');
check(/Group by sender/.test(stack) && /fetchInstantInbox\(\)\.then/.test(stack) && /\[refreshKey\]/.test(stack), 'the inbox is still read the same way, and again after an instant was sent or seen');

check(/<aside\s+className=\{`msg-page force-dark relative w-full md:max-w-2xl/.test(chat), 'the list column is the frame the tab floats in');
check(/<InstantsStack\s+onOpenCamera=\{\(\) => setShowInstantCamera\(true\)\}\s+onOpenViewer=\{\(queue\) => setInstantViewerQueue\(queue\)\}\s+refreshKey=\{instantsRefreshKey\}\s+\/>/.test(chat), 'the Chat page uses it');
check(/setShowInstantsArchive\(true\);\s*\}\}[^>]*data-testid="instants-archive-open"/.test(chat) && /<Archive className="w-4 h-4 text-amber-300" \/> Your Instants/.test(chat), '"Your Instants" (your own history) is in the ⋮ menu of the page');
check(/showInstantsArchive && \(\s*<InstantsArchive/.test(chat) && /showInstantCamera && \(\s*<InstantCamera/.test(chat) && /instantViewerQueue && \(\s*<InstantViewer/.test(chat), 'the camera, the viewer and the archive open as before');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
