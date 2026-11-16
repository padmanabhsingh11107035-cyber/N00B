// 2026-11-16: no full-screen button on a post's video; the administrator can change any account's type, silently.
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
let passed = 0, failed = 0;
const check = (ok, name) => { if (ok) { passed++; console.log('  ok   ' + name); } else { failed++; console.log('  FAIL ' + name); } };
const card = read('src/components/Feed/PostCard.tsx'), sql = read('supabase/migrations/20261116000004_admin_set_account_type.sql'), modal = read('src/components/Modals/AdminControlModal.tsx'), api = read('src/services/supabaseApi.ts');
check(!/Maximize2/.test(card) && !/Open full video/.test(card), 'a post has no full-screen button on its video or picture');
check(/require_master_admin/.test(sql) && /in \('public', 'private', 'business'\)/.test(sql) && /is_business = \(p_type = 'business'\)/.test(sql), 'only the main administrator can do it, and only to public / private / business');
check(!/notify_user|queue_email|push/i.test(sql.replace(/--[^\n]*/g, '')), 'the person is not told: no notification, no e-mail, no push in the function');
check(/log_admin_action\('account_type_changed'/.test(sql) && /t\.id = public\.noob_admin_id\(\)/.test(sql), 'it is written to the admin log, and the official NOOB account keeps its type');
check(/rpc\('admin_set_account_type', \{ p_target: targetUserId, p_type: accountType \}\)/.test(api), 'the app calls the function');
check(/data-testid="admin-account-type"/.test(modal) && /\{main && \(\s*<div className="space-y-1\.5" data-testid="admin-account-type"/.test(modal) && /They will not be told/.test(modal), 'the Admin panel shows Public / Private / Business under the account, asks first and says the person is not told');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
