# NOOB security re-test, 2026-11-14

Scope: repo `N00B_fixed/instagram` at HEAD (after `367271aa`), a fresh build on D: (`D:\noob-audit\dist-r2`), the live bundle downloaded from noobsocials.com, read-only probes of noobsocials.com and games.noobsocials.com (about 55 requests), Supabase (about 30 requests: GETs, RPC calls that must be refused, list calls, one token-less `recover-account` POST) and the code and SQL of everything that changed since the last re-test (`SECURITY-RETEST-2026-11-13.md`). Nothing was changed, nothing uploaded, no login, no sign-up, no row created (the `record_visit` probe used an invalid visitor id, which the function ignores). Note: I used read-only `git log` and `git ls-files` once at the start to list commits; no other git command. TEMP/TMP pointed at `D:\noob-audit\tmp`; the build went to D:.

## 1. Verdict

**Still good for a student project: no Critical and no High found in what I could test.** Since the last re-test the right things were done and they hold: the chat-file gate is ON and works (a chat file without a sign-in token is 401, a fake token is 401, the private bucket is not publicly readable, listing is empty), the chat-cache problems are fixed and live, anonymous visitors are refused everywhere I probed, Turnstile still refuses a token-less sign-up request, every test passes, `npm audit` is down from 8 findings to 2, and no secret is in the repo or in a fresh build.

Three things I would act on first, all **Medium**:
1. **The games address also serves the whole NOOB app** (N9). `games.noobsocials.com/assets/main-*.js` answers 200 and an unknown `/games/<anything>/` address answers 200 with the app's page. The point of the separate address was that no app and no sign-in exist there. I did not open it in a browser (that would create a visit row), so I do not know if the app fully starts there, but the files are served.
2. **The live app most likely still uploads plain (unlocked-chat) files into the public bucket** (N10). The chat gate only protects `/m/...`; the direct Supabase address of a file in the public `media` bucket is not gated.
3. **Any logged-in person can read every profile row and the whole follow graph straight from the tables** (N11, found by reading the SQL, not tested logged in), skipping "hide my profile from X" and private-account rules that exist only in the functions.

Not tested: everything behind a login, real phones, the Supabase / Cloudflare / GitHub dashboards (section 10). "No problem found" is not "secure".

## 2. Results of the checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1a | `scripts/security-audit-db.mjs` | PASS | 201 tables, 136 policies, 694 SECURITY DEFINER functions, RLS everywhere, no write-open policy, fixed search_path, no admin function open to visitors, 23 open on purpose. Same stale name `study_public_status` in the allow-list (L8). |
| 1b | `node scripts/guard.mjs` | PASS | 48 of 48 checks. |
| 1c | `lint-text-fit` | PASS | 0 places. |
| 1d | `npm audit --omit=dev` | PASS/NOTE | 0 critical, 0 high, **2 moderate** (uuid via gaxios; was 7 moderate + 1 low). Server/build side only. |
| 1e | New tests | PASS | e2ee-media 71/71, sealed-media-db 28/28, chat-media-access 46/46, chat-media-client 32/32, chat-media-migration 35/35, chat-media-worker 39/39, turnstile 30/30, games-origin 33/33, games-site 41/41, feed-paging 91/91, feed-variety 15/15, admin-user-locations 41/41, admin-content-paging 29/29, admin-content-videos-instants 17/17, deleted-accounts-cleanup 34/34, people-refresh 6/6, plus e2ee 43, e2ee-service 92, e2ee-db 69. 0 failures. |
| 2 | Secrets | PASS | Tracked source and the new build: no `sb_secret_`/service_role key, no private key, no Groq/Resend/AWS/GitHub/Slack/Google token. Only hits: minified bytes in game `physics-*.js` files (same as before). Only JWT-looking string in the repo is a dummy test token (`sub: 1234567890`). Turnstile **secret** appears nowhere (only its name in comments and `Deno.env.get`). Live bundle has the Turnstile **site** key (public by design) and the `sb_publishable_` key. No `.map` files in the build or live. Tracked: `.env.example`, `.env.production` (public values only), `android-overrides/debug.keystore` (L6). |
| 3 | Live headers | PASS with notes | Section 3. |
| 4 | Anonymous Supabase | PASS | Section 4. |
| 5 | New code review | PASS with notes | Section 5. |
| 6 | E2EE map | see section 8 | |
| 7 | Privacy / RLS | NOTES | N11, N12, N15. |
| 8 | Diff since last re-test | see section 9 | |

## 3. Live headers

- noobsocials.com `/`: HSTS preload, CSP (script-src without unsafe-inline/eval, `frame-ancestors 'none'`, `object-src 'none'`), nosniff, `X-Frame-Options: DENY`, referrer policy, permissions policy, COOP. Unchanged and good.
- **games.noobsocials.com `/`** (hub): strict CSP (`default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `connect-src 'self'`, `frame-ancestors 'none'`, `form-action 'none'`), DENY, nosniff. Good. **`/games/underhall/`**: `frame-ancestors 'self' https://noobsocials.com https://www.noobsocials.com`, `script-src 'self'`. Good. Unknown paths (`/profile`, `/m/...`, `/__geo`, `/games-site/`) are 404 with `no-store`. On noobsocials.com `/games-site/` is also 404.
- `/m/chat/<x>.jpg` with no token: **401** (`no-store`). With a made-up token: **401**. `/media/chat/...` (old address): 401 too. `/m/chat/<x>.sealed` missing: 404. `/m/posts/<missing>`: 404. `/m/Chat/<x>` (capital) 404. `POST` 405. `OPTIONS` 204 (CORS `*`, allows `Authorization, apikey, Range`; no cookies are used, so fine).
- No source maps (`/assets/main-*.js.map` returns the app page, no `sourceMappingURL`).
- **N4 still open:** `/assets/nonexist.js` = 200 `text/html`, `Cache-Control: public, max-age=31536000, immutable`.
- **N5 still open:** `HEAD /m/<missing>` = 400, not 404.
- **N8 still open:** `https://www.noobsocials.com/` = 200 (no redirect); `http://` = 301.
- `/__geo`: `{"city","region","country","latitude","longitude"}` of the **caller's own connection** (read from `request.cf`; nothing is stored or accepted from the caller). `Access-Control-Allow-Origin: *`, `no-store`. Another website can make your browser fetch it, but it only learns what that website already sees (your IP and its city). NOTE only.
- **N9 (new, Medium):** `https://games.noobsocials.com/assets/main-jkQjkiV4.js` = 200 `text/javascript`; `https://games.noobsocials.com/games/nonexistent-x/` = 200 with the app's `index.html` and the app's CSP (`connect-src` includes Supabase). Cause: `wrangler.jsonc` `run_worker_first` excludes `/assets/*` and the game folders, so Cloudflare serves those static files without running `routeFor`, and the SPA fallback for `/games/*` is passed through by the Worker.

## 4. Anonymous Supabase probes

- Tables with the publishable key, all **401 permission denied**: `messages`, `profiles`, `chats`, `profile_private`, `sealed_media`, `chat_media_index` (exists, so migration 20261114000001 is live), `site_visits`, `login_history`, `follows`, `noob_rooms`, `noob_room_chat`, `song_guess_scores`, `noob_draw_packs`.
- RPCs as anon, all **401 permission denied**: `can_read_chat_media`, `register_sealed_media`, `attach_sealed_media`, `discard_sealed_media`, `admin_user_locations`, `admin_content_page`, `admin_site_visits`, `feed_posts_page` (exists, so 20261114000003 is live), `my_chats`, `chat_media_key_of`.
- **N14 (new, Info/functional): migration 20261114000006 (deleted-account clean-up) is NOT applied live.** `account_is_gone`, `gone_account_ids`, `purge_gone_accounts` and the table `deleted_accounts_cleanup_backup` do not exist (PGRST202/205). The app side that refreshes people lists is live, but the database side that makes deleted accounts vanish from lists is not. `index_chat_media_from_message` (a trigger function) is correctly not callable.
- `record_visit` with an invalid visitor id: 204, nothing stored. `site_visits` is not readable (401 above).
- Storage: `list` on `media` (prefix `chat` and empty prefix) and on `chatmedia`: `[]`. Bucket list: `[]`. `GET /storage/v1/object/public/chatmedia/...`: "Bucket not found" (not public). Anonymous `authenticated/chatmedia/...`: "Object not found".
- **Upload policy (read, not tested live; nothing uploaded):** `media_upload` allows authenticated inserts into `posts, reels, stories, avatars, music, covers, stickers, products, chat, instants, comments, videos, daily, songs, team, ads`. The RESTRICTIVE `media_sealed_only` refuses `application/octet-stream` (compared with `lower()`, N3 fixed) unless the name is `chat/<name>.sealed`. `chatmedia_upload` allows only `chat/<name>` and has the same restrictive guard; `chatmedia_select` allows the uploader and members of the chat (`can_read_chat_media`). No update/delete policy for people. Tests `sealed-media-db` and `chat-media-access` prove these.
- `recover-account` `signup-otp-request` without token: **400 `captcha_failed`** (Turnstile enforced).

## 5. New code review

**Worker chat gate (`worker/index.js`) - sound.**
- Token: `Authorization: Bearer <jwt>` only, regex-limited; the Worker holds no secret and no service key; it asks the database `can_read_chat_media(key)` *with the caller's own token*, so the database decides. Missing token/apikey 401; token rejected 401; database unreachable 503 (never opens the file); "no" gives 404 (same as a missing file, so existence is not revealed).
- Key handling: `mediaKey` decodes once, refuses `..`, empty parts, control characters, backslashes, more than 8 parts; the check is on the `chat/` prefix case-sensitively; `/m/` and `/media/` share the code path. The SQL key pattern is strict (`^chat/[A-Za-z0-9._~@+=-]{1,160}$`) and the function strips `?`, `#` and prefixes, so URL tricks give null = false.
- Caching: a gated answer is `Cache-Control: private, no-store`, `Vary: Authorization`, and never comes from or goes to the shared `/m/` cache. The old-bucket fallback is fetched only after the check, with `cf.cacheEverything` for a day: only reachable after a "yes", so no poisoning path. The decision memo is per (sha-256 of token + key): 60 s for yes, 15 s for no, so a person removed from a chat can still fetch for up to 60 s (NOTE).
- Range: passed to the upstream unchanged as a header value (no injection possible with the Headers API); 416 handled.
- Open redirect / header injection: none (no redirect, no user value in a response header).
- Logging: `chatGate`/`origin` log lines contain the file key and a verdict, never the token, IP or coordinates.
- `/__geo`: answers only about the caller, rounds to 3 decimals, fixed fields.
- `routeFor` host logic is correct for what it covers; the gap is that it never runs for `/assets/*` and the game folders (N9).

**Database functions (read in full).**
- `can_read_chat_media`: security definer, `auth.uid()` required, member of the indexed chat, not "deleted for me", not before the person joined; granted to `authenticated` only (anon refused live).
- `chat_media_index` triggers index a file for a message only if the sender uploaded it or already can open it (nobody can claim another person's file by typing its name). Minor: the "already can open it" branch does not re-check "deleted for me" / joined-after (NOTE; keys are random).
- `admin_user_locations` (v1 and v2), `admin_content_page`: `require_master_admin()` / `is_master_admin()` first; revoked from public/anon; granted to authenticated (they refuse non-admins in the body). **The IP appears only in `admin_user_locations` v2 and in `admin_site_visits` (admin only);** I found no non-admin function returning `site_visits.ip`, `lat` or `lng`.
- `record_visit`: lat/lng accepted only as real numbers inside -90..90 / -180..180, errors swallowed. But the coordinates are **client-supplied** (the page copies `/__geo`), so a user can store any coordinates for their own visit row (admin map shows a wrong dot; integrity only). The IP comes from `cf-connecting-ip`, falling back to the **first** `x-forwarded-for` entry (spoofable only if `cf-connecting-ip` is missing, which Supabase's edge normally sets). See N13.
- `feed_posts_page`: plain (security invoker) function, so the `posts_select` RLS rules decide; limit capped at 100. OK.
- `purge_gone_accounts`, `gone_account_ids`: service_role only (not live yet anyway).

**Front end.** `dangerouslySetInnerHTML`: one place (`LegalShell`, fixed text). `innerHTML =` once in `UserDataFeeds.tsx` (admin page, text built from numbers and own constants). No `eval`/`new Function`/`document.write`. postMessage listeners: HelixFall, HostedGameFrame x3 (each requires `e.source` = the frame's window and `e.origin === plan.origin`, a game id match and type checks; every `postMessage` to a game uses the exact origin, never `*`), LensHost, NoobAiPage, and the games hub (`e.source` = its frame and `e.origin === location.origin`). The hub builds all text with `textContent`, opens only ids present in `games.json`, and sandboxes games `allow-scripts allow-same-origin allow-pointer-lock allow-popups` (safe because the games address is meant to hold no sign-in, subject to N9). The multiplayer relay uses public Supabase broadcast channels `noob-mp-<game>-<ROOM>`: anyone logged in can join any room code and read/send (by design, NOTE). Tokens: the app sends the user token to `${origin}/m/...` only (`authedMedia.ts`, `credentials: 'omit'`, bytes kept in memory only).

## 6. Status of earlier findings

| ID | Was | Status now | Why |
|---|---|---|---|
| N0 | Same-origin games can read E2EE keys and caches | **Mostly fixed, with a gap (N9)** | Games run on games.noobsocials.com, a different origin from the app, so the app's keys/session are out of reach. But that host also serves the app files (N9). |
| N1 | Delivered locked file could be purged | **Fixed** | Migration 20261113000003; function exists live; test passes. Not verifiable end to end (needs login). |
| N2 | Decrypted chat + file keys cached in localStorage | **Fixed and live** | `cacheSafeMessages` stores a bare placeholder for locked messages; `wipeChatCaches` runs at logout; both are in the live bundle. The key ring itself is deliberately kept (see section 8). |
| N3 | Mime compared case-sensitively | **Fixed** | `lower()` in both buckets' policies; test proves capitals refused. |
| N4 | Missing `/assets/*` = 200 HTML immutable | **Open** | Verified live. |
| N5 | HEAD on missing `/m/` = 400 | **Open** | Verified live. |
| N6 | Turnstile fails open on bad config | **Open (unchanged)** | By design; token-less request refused today. |
| N7 | Shared anonymous bucket in `report_client_error` | **Open (unchanged)** | |
| N8 | www does not redirect | **Open** | www = 200. |
| M1 | Public bucket / `/m/` no auth | **Mostly fixed** | Gate ON; private bucket works; but see N10 (public bucket still receives plain chat files; direct URL not gated). Media of posts and private accounts stays public by design. |
| M2 | Games same origin | **Fixed for the games; see N9** | |
| M3 | Sign-up bots / not verified | **Partly** | Turnstile live (proven). Google path and login-code emails rely on rate limits. |
| M4 | First x-forwarded-for trust | **Fixed in functions** | Test passes. `record_visit` still falls back to the first entry (N13, low). |
| L1 | Enumeration | **Open** | Plus new angles in N12 and N15. |
| L2 | Webhook SSRF rebinding window | **Open** (not re-tested) | |
| L3 | npm audit | **Better** | 2 moderate, was 7 + 1. |
| L4 | CORS `*` on functions | **Open (accepted)** | |
| L5 | Wide CSP parts | **Open (accepted)** | `style-src 'unsafe-inline'`, `img-src https:`, `frame-src https:`. |
| L6 | Debug keystore tracked | **Open** | File still tracked; confirm release signing is separate. |
| L7 | Unused auth providers | **Not tested** | Needs Supabase dashboard. |
| L8 | Stale allow-list name | **Open** | `study_public_status`. |
| L9 | Code-scanning alerts | **Not tested** | Needs GitHub login. |

(The earlier list had M1 to M4 and L1 to L9 and N0 to N8; all are covered above.)

## 7. New findings, ranked

| # | Sev | Finding | Fix |
|---|---|---|---|
| N9 | Medium | **The games address serves the app.** `games.noobsocials.com/assets/*` (the full app bundle) and the app page at any unknown `/games/<x>/` answer 200. If a person logs in on that address, the session and chat key ring would live on the origin where game code runs. Not tested in a browser. | In the app's entry script: if `location.hostname` is a games host, redirect to noobsocials.com before anything loads. In the Worker: on a games host, answer 404 for a `/games/*` path that is not a real game file (check the asset response, not the SPA `index.html`). |
| N10 | Medium | **Plain chat files are probably still uploaded to the public bucket.** The live main bundle does not contain the `chatmedia` bucket name (the build flag `VITE_CHAT_PRIVATE_BUCKET=1` is off by default and is not in the repo's env files), and `media_upload` still lists `chat`. So files of unlocked chats (Lounge, AI, groups with un-updated members) and anything from old app versions land in the public `media` bucket, readable by anyone with the direct Supabase address (the Worker gate does not apply there). Moderate confidence (bundle reading, not an upload test). | Set `VITE_CHAT_PRIVATE_BUCKET=1` in the Cloudflare build and rebuild; later remove `chat` from `media_upload` except `.sealed` (after old apps age out); re-run `scripts/migrate-chat-media.mjs` for files uploaded since. |
| N11 | Medium (privacy, by reading SQL) | **Whole-table reads for any logged-in person.** `profiles_select using (true)` with every column granted except the four Pro/shop ones: `city`, `privacy_settings`, `extra`, `noob_points`, `is_suspended`, `social_links`, `status_note`, `pronouns`, etc. for every account, including people who hid their profile from the reader, suspended accounts and (until N14 is applied) deleted ones: "hide from me" and suspension are enforced only in the functions, not in the table. `follows_select` only hides people who hid from you, so **private accounts' follower lists are readable directly**. Email, phone, birth date, IP are NOT here (they are in `profile_private`, owner/admin only). | Narrow the column grants (drop `privacy_settings`, `extra`, `is_suspended`, `city` unless the app needs them); make `profiles_select` use `not is_hidden_from_me(id)` and suspension; make `follows_select` respect private accounts. Test with a second test user. |
| N12 | Low/Medium | **`match_contacts`** lets any logged-in person send up to 2,000 phone numbers per call, with no visible rate limit, and get back the matching accounts (name, bio, counts), also ones who hid from them. A phone-number-to-account lookup at scale. | Rate-limit per user per day; skip hidden/suspended accounts. |
| N13 | Low | **`record_visit` is open to anyone and unbounded.** Anyone can create unlimited `site_visits` rows with random ids (free-plan DB size). Rows (IP, user agent, now coordinates) are **never deleted** and the Privacy Policy says IP and "approximate place" are kept but not that coordinates are, nor for how long. Coordinates are client-supplied. | Per-IP/hour cap, purge old/bot rows after N days; mention "approximate coordinates" and the retention time in the Privacy Policy; use the server's own location headers instead of client `lat/lng`. |
| N14 | Info/functional | Migration 20261114000006 (deleted-account clean-up) not applied live (section 4). | Run it (dry run of `purge_gone_accounts(true)` first). |
| N15 | Low | Re-check `resolve_login_email` (open to visitors by design): it returns the sign-in address for a username, but only a made-up `@users.nooob.xyz` one or one that belongs to an account with a password. If any account has a real email **and** a password, that real email is given to a visitor who types the username. | One SQL count to confirm no password account has a real address; otherwise return the alias only. |
| N16 | Low | Media backup workflow: encrypted with `openssl aes-256-cbc -pbkdf2 -iter 600000` (good), but the repo is public, so the artifact is downloadable by any logged-in GitHub user; its secrecy is exactly the passphrase's strength (24+ characters enforced). The backup holds old plain chat files and the database. | Keep the passphrase long and random; consider storing backups off GitHub later. |

## 8. Honest end-to-end encryption map

**Locked end to end (the server stores ciphertext only):**
- One-to-one chats and private groups (up to 100 members), when **every** member has a device key (opened the updated app once). Locked: message text, GIF/sticker link, **photos, videos and voice notes** (each file encrypted on the sender's phone with its own AES-GCM key; the key travels only inside the locked message; the file in storage is `chat/<random>.sealed`, octet-stream), captions, quoted text, edits.
- The device's private keys never go to the server (the server refuses one). The passphrase backup is encrypted on the device (PBKDF2-SHA256 600,000 rounds + AES-GCM, minimum 10 characters) before it is stored.
- Family Map places (migration `family_sealed`; not re-reviewed in depth today).
- Push text for a locked message is "New message" with no content; `send_message` blanks `text`/`media_url` for locked messages, so server search and previews have nothing.

**NOT end to end encrypted:**
- The public Lounge, the AI chat, support / guest-support chats, Daily NOOB, comments, posts, reels, stories (the server and admins can read them).
- Any group over 100 people, and any chat where even one member has no key yet (the whole chat falls back to **unlocked**, by design; the app says so).
- Shared posts, profiles, tracks and game invites inside chats (the server must read them); GIFs/stickers are links to other sites.
- Anything sent by an old app version or a modified client: the server cannot refuse a plain message into a lockable chat.
- **Plain chat files in the public bucket** (N10); the 10 old files copied to the private bucket are readable by chat members only now.
- **Metadata:** who talks to whom, when, how often, message order and sizes (a locked file's stored size = file size + 16 bytes per MiB, so approximate size and kind), that a message is locked, the public-key directory.

**Where plaintext or keys can leak on a device:**
- The device private key ring is **plain JWK in localStorage and IndexedDB `noob-e2ee`** (on purpose, for durability) and is **not removed at logout**: anyone with the browser profile can read it, as can any script on the app's own origin. Games now run on another origin, so this is limited to the app's own code (and to N9 if someone logs in on the games host).
- Saved chat lists/message lists in localStorage: locked messages are stored as empty placeholders and wiped at logout (fixed, live). Plain chats (Lounge, AI, unlocked) are still saved readable. Decrypted attachments live in memory only (size-capped), blob URLs revoked on leaving; the service worker does not cache chat media (a test proves it); the Worker serves chat files `private, no-store`.
- Logs: Worker logs hold file keys only; I found no message text, token or coordinates in Worker or function logs.

**Design limits (stated by the app itself):** no forward secrecy (static device keys: a stolen key opens old messages the thief also holds); the server could hand out a wrong public key unless people compare security codes (first-seen memory and a "keys changed" warning exist). **Backup and recovery:** if a person loses all devices and has no passphrase backup, locked history is gone; if the database leaks, the backup blob is only as strong as the passphrase (a 10-character minimum is low against an offline attack); clearing site data without a backup is the same as losing the keys.

## 9. Diff review of what changed since the last re-test

Migrations 20261113000003 to 20261114000008, `worker/index.js`, `worker/gamesSite.js`, `public/_headers`, `public/games-site/*`, `src/services/authedMedia.ts`, `chatCache.ts`, `supabaseApi.ts` (cache wipe, upload bucket), the workflows. Reviewed in sections 4 and 5. No new `eval`/`innerHTML` from user data, no wildcard postMessage, no token logging, no auth-relevant change in `supabase/functions` that I could find (from the commit titles; I did not diff the files). `_headers` is at 89 of 100 rules. Dependabot config is sensible (no automatic major upgrades). Workflows: `permissions: contents: read`, secrets passed as env, the backup encrypts before upload and runs a decrypt self-test; `security.yml` has gitleaks and CodeQL.

## 10. What I could not test, and what the owner should check by hand

Could not test: anything behind a login (real RLS behaviour for N11 and N12, the attach race, a real send/open of a locked file, the gate with a real member token: only the Worker unit test covers that, not live), real phones (Android/iOS apps, push, camera), whether the app boots on the games address (N9), uploading a file to confirm N10 and the storage policies, TLS versions, the old `nooob.xyz` redirect, the dashboards.

Please check by hand:
1. Open `https://games.noobsocials.com/games/zzz/` in a private window and see whether the NOOB login screen appears (N9); then add the redirect.
2. In the Cloudflare build variables: is `VITE_CHAT_PRIVATE_BUCKET` = 1? In the Supabase SQL editor: `select bucket_id, count(*) from storage.objects where name like 'chat/%' group by 1;` to see whether plain files still land in `media`.
3. Supabase dashboard: Auth providers and `mailer_autoconfirm` (L7), API rate limits, whether `record_visit` traffic looks normal.
4. As a normal test user, try `select city, privacy_settings, extra from profiles limit 5;` and `select * from follows limit 5;` through the API to confirm N11.
5. Run migration 20261114000006 when ready (N14), dry run first.
6. GitHub > Security: code-scanning and Dependabot alerts (L9); keep the backup passphrase long and stored outside GitHub too.
7. Confirm the Android release signing key is not the tracked debug keystore (L6).
