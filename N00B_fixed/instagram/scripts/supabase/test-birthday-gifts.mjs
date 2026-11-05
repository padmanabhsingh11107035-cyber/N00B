// Birthday gifts managed from the Admin panel (Gifts tab): a list of gifts, add-ons that come with them, and a history of who got what and when; the prizes are much bigger.
// Checked against the real SQL and source files (no database or browser needed).
// Usage: node scripts/supabase/test-birthday-gifts.mjs
import fs from 'node:fs';

let passed = 0, failed = 0;
const check = (cond, label) => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label}`); } };
const section = (t) => console.log(`\n${t}`);
const read = (p) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13)).join('');
const sql = read('supabase/migrations/20261105000002_birthday_gifts_admin.sql');

section('1. The tables and the bigger prizes');
check(/create table if not exists public\.birthday_gifts/.test(sql) && /create table if not exists public\.birthday_addons/.test(sql), 'a list of gifts and a list of add-ons');
check(/revoke all on public\.birthday_gifts, public\.birthday_addons from anon, authenticated/.test(sql) && /enable row level security/.test(sql), 'nobody but the functions below can read or change them (users never see the list)');
const seed = sql.slice(sql.indexOf('insert into public.birthday_gifts'), sql.indexOf('where not exists (select 1 from public.birthday_gifts)'));
const points = [...seed.matchAll(/\('points',\s*'(\d+)'/g)].map((m) => Number(m[1]));
check(points.length >= 6 && Math.min(...points) >= 10_000_000 && Math.max(...points) >= 1_000_000_000, `the points gifts start at 10 million and the jackpot is 1 billion (was 100 - 7,000 and a 100,000 jackpot): ${points.length} of them`);
check(/where not exists \(select 1 from public\.birthday_gifts\)/.test(sql), 'the first list is only put in when there is none (running the SQL again never undoes the administrator\'s changes)');
check(/ \('coupon',\s*'100'/.test(sql) && /\('shop_item',\s*null/.test(sql), 'shop items and coupons are still in the list');

section('2. Picking and giving');
check(/function public\.pick_birthday_gift\(\)/.test(sql) && /sum\(weight\)/.test(sql) && /random\(\) \* total/.test(sql) && /where active and weight > 0/.test(sql), 'the gift is chosen by weight among the active ones');
check(/random\(\) \* 100 < a\.chance_percent/.test(sql) && /'addons'/.test(sql), 'each active add-on comes along when its chance comes up');
check(/if total = 0 then/.test(sql), 'with no gift at all, a person still gets 10,000,000 points');
check(/function public\.give_birthday_item/.test(sql) && /perform public\.give_birthday_item\(me, g\)/.test(sql) && /jsonb_array_elements\(g->'addons'\)/.test(sql), 'scratching gives the gift and every add-on');
check(/already owned/.test(sql) && /'BDAY'/.test(sql), 'an owned shop item becomes points, a coupon is made for the person (as before)');
check(/revoke execute on function public\.pick_birthday_gift\(\) from public, anon, authenticated/.test(sql) && /revoke execute on function public\.give_birthday_item\(uuid, jsonb\) from public, anon, authenticated/.test(sql), 'users can not call the picking or giving functions themselves');

section('3. The administrator\'s functions');
for (const fn of ['admin_birthday_overview(integer)', 'admin_birthday_save_gift(jsonb)', 'admin_birthday_delete_gift(uuid)', 'admin_birthday_save_addon(jsonb)', 'admin_birthday_delete_addon(uuid)']) {
  const name = fn.split('(')[0];
  const body = sql.slice(sql.indexOf(`function public.${name}`), sql.indexOf(`revoke execute on function public.${fn}`));
  check(body.includes('public.is_master_admin()') && new RegExp(`grant execute on function public\\.${fn.replace(/[()]/g, '\\$&')} to authenticated`).test(sql), `${name}: only the main administrator`);
}
check(/log_admin_action\('birthday_gift_saved'/.test(sql) && /log_admin_action\('birthday_addon_saved'/.test(sql) && /log_admin_action\('birthday_gift_removed'/.test(sql), 'every change is written to the admin log');
check(/Points must be a whole number/.test(sql) && /A coupon is 1 to 100 percent off/.test(sql) && /That shop item does not exist/.test(sql) && /must be from 0 to 10000/.test(sql) && /chance must be from 1 to 100/.test(sql), 'wrong values are refused with a plain sentence');
check(/'history'/.test(sql) && /'givenAt', c\.created_at/.test(sql) && /'revealedAt', c\.revealed_at/.test(sql) && /from public\.scratch_cards c left join public\.profiles p/.test(sql), 'the history lists who, which gift (with add-ons), the date and time given and when it was scratched');

section('4. The page');
const panel = read('src/components/Modals/AdminBirthdayPanel.tsx'), modal = read('src/components/Modals/AdminControlModal.tsx'), api = read('src/services/supabaseApi.ts'), apiExports = read('src/services/api.ts');
check(/data-testid="admin-tab-gifts"/.test(modal) && /activeTab === 'gifts' && main \? \(\s*<AdminBirthdayPanel \/>/.test(modal) && /\| 'gifts' \|/.test(modal), 'a "Gifts" tab in the admin panel, for the main administrator');
check(/'birthday-gifts'/.test(panel) && /'birthday-addons'/.test(panel) && /data-testid="birthday-history"/.test(panel) && /birthday-add-gift/.test(panel) && /birthday-add-addon/.test(panel), 'it shows the gifts, the add-ons and the history, each with an Add button');
check(/aria-label=\{`Edit \$\{item\.label\}`\}/.test(panel) && /aria-label=\{`Remove \$\{item\.label\}`\}/.test(panel) && /role="switch"/.test(panel), 'every gift and add-on can be edited, removed, switched on or off');
check(/Given \{when\(h\.givenAt\)\}/.test(panel) && /scratched \$\{when\(h\.revealedAt\)\}/.test(panel) && /not scratched yet/.test(panel), 'the history shows the date and time of giving and of scratching');
check(!/const (Row|Section|HistoryRow): React\.FC/.test(panel), 'the rows are drawn by plain functions (a component made inside a component would lose the typing focus)');
check(['fetchBirthdayOverview', 'saveBirthdayGift', 'deleteBirthdayGift', 'saveBirthdayAddon', 'deleteBirthdayAddon'].every((n) => api.includes(`export const ${n}`) && apiExports.includes(`${n},`)), 'the calls exist and are exported');
check(/needs the latest SQL \(20261105000002_birthday_gifts_admin\)/.test(api), 'before the SQL is run the page says so plainly');
check(/\(gift\?\.addons \|\| \[\]\)\.map/.test(read('src/components/Modals/ScratchCardModal.tsx')), 'the scratch card shows the add-ons under the gift');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
