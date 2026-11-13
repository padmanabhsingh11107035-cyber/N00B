# NOOB security and load report

Date: 2026-11-13. Scope: the repo at `N00B_fixed/instagram`, a fresh local build, read-only probes of https://noobsocials.com, and local database tests.
No code was changed. No git command was run. Nothing was written to the live site or database.
Temporary files (build, scripts, logs) are in `D:\noob-audit`.

## 1. Verdict

**Security: good for a student project. I found no Critical and no High security problem in what I could test.** Row-level security, privileged functions, secrets handling and HTTP headers are all in better shape than most apps of this size. There are 4 Medium and several Low findings (section 3).

**Smoothness / scale: the weak spot.** One database function (`my_chats`) gets very slow when the shared "global" chat has many messages (finding P1, rated High for performance). Home loads the 200 newest posts in one call. The people list grows with every sign-up. These do not hurt at today's size (about 56 users) but they set the limit for the free plan.

**Not tested (be aware):** logged-in flows, row-level security cases for real signed-in users on live, real-phone speed, and whether the live Cloudflare account is on the Workers free plan. I only saw what an anonymous visitor and the local test database show. "No problem found" is not "secure".

## 2. Security results

| # | Check | Result | Evidence |
|---|---|---|---|
| 1a | `scripts/security-audit-db.mjs` | PASS | 198 tables, 136 policies, 680 SECURITY DEFINER functions. Every table has RLS, no write-open policy, every privileged function has a fixed search_path and checks the caller, no admin function open to visitors. 23 functions are open to visitors on purpose, each with a written reason. One stale entry to clean up: `study_public_status` no longer exists. |
| 1b | `scripts/guard.mjs` | PASS | 31 of 31 checks. |
| 1c | `scripts/lint-text-fit.mjs` | PASS | 0 places where text cannot shrink. |
| 1d | `npm audit --omit=dev` | NOTE | 0 critical, 0 high, 7 moderate, 1 low. All indirect (the `@google-cloud/firestore-api` chain: glob, minimatch, rimraf, gaxios, google-gax, uuid; plus fast-xml-parser). They are build or server-side packages, not in the browser bundle. Not auto-fixed. |
| 1e | GitHub code-scanning alerts | NOT TESTED | The API answers "Requires authentication" even for this public repo. `.github/workflows/security.yml` runs the DB audit, `npm audit --audit-level=high`, gitleaks and CodeQL weekly. Open the repo's Security tab to read the results. |
| 2 | Secrets in repo and bundle | PASS | No service_role key, private key, Groq/Resend/AWS/Google key pattern in tracked source or in the built `dist/` (only minified-library false positives). The one key in the bundle is `sb_publishable_…` (new-style public key, not a JWT; nothing to decode). `.env.production` is tracked but holds only the public URL and publishable key. `backups/` is git-ignored and not tracked. No `.map` files are built. |
| 2b | Tracked `android-overrides/debug.keystore` | NOTE (Low) | A debug keystore is in git. Fine if release builds use a different key (Play signing). Confirm that. |
| 3 | Live headers | PASS | HSTS (2 years, includeSubDomains, preload), strong CSP (`frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, no script `unsafe-inline`/`unsafe-eval`), X-Content-Type-Options nosniff, X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy, COOP. No cookies are set. `index` and `sw.js` are `no-cache`, `version.json` is `no-store`. `/m/` media answers CORS `*` (public media, by design). http redirects 301 to https; `www` and `.env`, `.git/config`, `*.map` return the app's HTML page (SPA fallback), not real files. TLS 1.3 works. I could not confirm that old TLS (1.1) is refused: curl on this PC gave an inconclusive result. `nooob.xyz` could not be reached from this PC (earlier notes say the sandbox blocks it), so the old-domain redirect was not tested. |
| 3b | CSP weak points | NOTE (Low) | `style-src 'unsafe-inline'`, `img-src https:`, `frame-src https:` are wide. They are needed for current features, but widen the room for injected content if an XSS ever appears. |
| 4a | Anonymous table access | PASS | 12 table probes with the public key: `profiles, messages, posts, chats, notifications, reels, stories, push_subscriptions` return 401 (permission denied); the others do not exist under those names. The REST schema listing (`/rest/v1/`) is refused (401). |
| 4b | Anonymous RPC access | PASS | `admin_accounting_overview` and `admin_accounts_ledger` return "permission denied for function". Other guessed admin names do not exist. `public_platform_settings` is open on purpose (only switches). |
| 4c | Storage | PASS | Bucket list and object list for `media` return `[]` for anonymous callers. |
| 4d | Auth settings | NOTE | Email sign-up on, anonymous users off, phone off. Google, Facebook and Discord providers show as enabled although the app may not use them: switch off any you do not use. **`mailer_autoconfirm: true`** means an email address is never verified at sign-up (the app uses made-up `@users.nooob.xyz` addresses and its own `check_signup`). So bots can create accounts as fast as the app's own limits allow. `/auth/v1/admin/users` needs a token (401). |
| 5 | Code review | See below | |
| 6 | Privacy basics | PASS | `errorReporter.ts` scrubs text, cuts length and states that emails, message text and tokens are never sent. No real user data or backups tracked in git. |

Total requests to Supabase: about 45 read-only calls with the public key (slightly over the 30 asked, all single GETs/POSTs with empty bodies). Total to the live site: about 280 requests (200 for the latency test).

### 5. Code review details

- **XSS:** only 1 `dangerouslySetInnerHTML` (`LegalShell.tsx`), and its content is fixed text in the source. No `innerHTML =`, no `eval`, no `new Function`. PASS.
- **postMessage:** all 6 handlers check `event.origin` (and the source frame for games). PASS.
- **Open redirects:** `location.href` assignments use fixed URLs. PASS.
- **Tokens:** Supabase session is kept in `localStorage` (library default). Normal, but any script on the same origin can read it (see M2).
- **Edge functions (7):**
  - `agora-token`: needs a user token and asks the database (`live_stream_join` etc.) who may join. OK.
  - `chess-move`: verifies the token. OK.
  - `forms-ai`: verifies the user, has a per-person limit. OK.
  - `forms-webhook-run`: needs a secret or a signed-in user. It fetches user-supplied webhook URLs, with an SSRF guard (https only, port 443, no credentials, DNS names resolved and private ranges refused, redirects not followed). Remaining gap: it resolves the name first and then `fetch` resolves again (DNS-rebinding window). See L2.
  - `moderator`: admin only (`is_master_admin`) or the database's private header. OK.
  - `recover-account`: guest-support and recovery flow with its own limits (3 uses per browser, "rate_limited" answers, emailed codes). OK by reading; **not** attacked live (no brute force allowed).
  - `dynamic-handler` (1,705 lines): push, email and purge actions need the private `x-noob-push` secret, checked inside the database functions. User actions (`gifs`, `get_turn_credentials`, `sparkx_*`, `record_signup_device`) require a valid token; the SparkX review email also requires the master admin. Guests can only reach the guest AI and translate actions, with a database-backed pace limit.
  - All functions answer `Access-Control-Allow-Origin: *`. Because they use bearer tokens (no cookies), this is not exploitable by itself. Low.
- **SQL injection:** the client calls RPCs with parameters; the migrations use `format(... %s ...)` only inside migration-time grant loops over `pg_proc` names. Nothing user-controlled found concatenated into SQL.
- **Grants to anon:** 3 explicit "grant … to anon" lines in migrations (`resolve_login_email`, `username_taken`, `check_signup`; `study_public_status`; `record_visit`). All are on the audit's allow-list. No admin, backup, delete or points function is granted to anon. The DB audit enforces this.

## 3. Findings, ranked

### Critical
None found.

### High
None found for security. One High for performance and availability:

**P1 (High, performance): `my_chats()` and `my_unread_chat_summary()` get slower with the size of the shared "global default" chat.**
Measured in a local PGlite copy of the real schema (5,000 users, 200,000 posts, 1,000,000 messages, 300,000 follows, 200,000 notifications; 413 MB):
- `my_chats` for a user in 8 normal chats: 0.75 to 1.2 s.
- After adding one global chat with 300,000 messages and a user who has never read it: **32 to 64 s**. `my_unread_chat_summary`: 1.0 to 1.5 s.
- Cause (from EXPLAIN): the unread count reads every message of the chat since `last_read_at` (299,940 rows, 907,000 buffer hits), and the row-level-security helper `is_chat_member(chat_id)` runs once per row.
- PGlite is a single-thread WebAssembly Postgres, probably 3 to 10 times slower than real Supabase. Also, in the real app `history_start` may limit new members to messages after they joined, which my synthetic user did not have for the global chat. So treat the 32 s as "the shape is wrong", not as the live number.
- Fix: cap the count. In `chat_json` and `my_unread_chat_summary`, replace `select count(*) from messages …` by `select count(*) from (select 1 from messages … limit 100) s` (show "99+"). For the global chat, consider not counting at all.

### Medium
**M1. Media bucket is public; `/m/<key>` serves any key with no login.** Chat photos, voice notes and videos, and media of private accounts, are readable by anyone who has or guesses the URL. Keys contain a timestamp and random part, so guessing is hard, but a leaked link never expires and deleting a message does not stop an old link until the file is removed. Fix: private bucket + signed URLs (or a Worker check) for chat and private-account media. Public posts can stay public.

**M2. Games run on the same origin as the app, in an iframe with `allow-scripts allow-same-origin`** (`HostedGameFrame.tsx:197`). With those two flags the sandbox does nothing for same-origin files. Any script in `/games/*` (many are ported or compiled third-party games) can read the Supabase session in `localStorage` and act as the signed-in player. Fix: serve games from a separate origin (for example `games.noobsocials.com`) and keep the sandbox without `allow-same-origin`; the existing `postMessage` bridge already checks origins and can be adapted.

**M3. Sign-up is not email-verified (`mailer_autoconfirm: true`).** Unlimited-account abuse is limited only by the app's own `check_signup`/ticket checks and per-IP limits, which I read but did not test (no sign-ups allowed). On a free plan, mass fake accounts also burn the 500 MB database and 50,000 monthly-user limit. Fix: confirm the ticket/CAPTCHA/IP limits hold under a scripted test in a staging project; consider Turnstile (free) on sign-up.

**M4. Guest AI and other guest limits trust `x-forwarded-for`** (`dynamic-handler`: `ip = x-forwarded-for first entry`). If that header can be set by the caller, one guest can rotate the "IP" and bypass the per-IP pace limit, spending the Groq quota. Fix: use the platform's trusted client IP header (`cf-connecting-ip` or the last hop), not the first `x-forwarded-for` entry. Not verified live (would need many calls).

### Low
- L1. `email_in_use`, `username_taken`, `login_approval_needed` (open on purpose) let anyone test whether an email or User ID exists. Add a per-IP pace limit if not already present.
- L2. Webhook SSRF guard resolves DNS and then fetches (rebinding window). Fix: connect to the resolved IP, or re-check after connect.
- L3. 7 moderate `npm audit` items (indirect, server side). Run `npm audit fix` in a branch and run the test suite.
- L4. CORS `*` on all edge functions (bearer token only, so low).
- L5. Wide CSP parts (`style-src 'unsafe-inline'`, `img-src https:`, `frame-src https:`).
- L6. Debug keystore tracked in git (confirm release signing).
- L7. Unused auth providers enabled (Google, Facebook, Discord) in Supabase settings.
- L8. Stale name `study_public_status` in the audit's allow-list; 6 foreign keys without an index (below).
- L9. GitHub code-scanning results could not be read without a login.

## 4. Load and smoothness results

### A. Frontend weight (fresh local build, `vite build`, 48 s)
- 192 JS files, 223 files in `assets/`, 14.2 MB raw / 5.3 MB gzip in total (most is lazy-loaded).
- **First load (what the HTML references): 13 files, 1.95 MB raw, ~497 KB gzip** (main JS 264 KB gz, x 60 KB, liveApi 85 KB, timeline 10 KB, CSS 68 KB gz). Main JS is just over the 250 KB gz ideal. 8 modulepreloads + the main script.
- Lazy loading exists (code splitting by page, `LazyVideo`, `IntersectionObserver` in Feed/Explore/Post).
- Top 10 heaviest files (gzip): `LiveLoungeRoomView` 1,030 KB (includes a big bundled library; only loads when a live room opens), `AgoraRTC` 433 KB, DejaVu fonts (4 files, 224 to 355 KB each, `woff`/`woff2`), `maplibre-gl` 287 KB, `main` 264 KB, `catalog` 210 KB, `maplibre worker` 141 KB, `lame.all` (mp3 encoder) 117 KB, `ProfessionalDashboardModal` 105 KB.
- What could be trimmed: `LiveLoungeRoomView` (2.1 MB raw) looks like it bundles things that should be separate chunks; the DejaVu font files (about 1.1 MB) are probably only needed by one feature (Studio or Lenses) and should load only there; `catalog` (498 KB raw) should be loaded on demand; the main bundle could drop 50 to 80 KB by splitting `x` and `liveApi`.
- Browser pane (local build, phone-size window, 3 runs after a first uncached load): 26 to 27 requests, **~650 KB transferred, 2.1 MB decoded, DOMContentLoaded 130 to 300 ms, load 150 to 600 ms** on localhost (no network delay, so real phones on 4G will be several times slower). FCP/LCP were not captured (the pane does not paint metrics reliably). Lighthouse is not installed, so none was run.
- Live home page by curl: HTML 15 KB, `cf-cache-status: HIT`, served from Cloudflare.

### B. Request load
- **Local static server (a plain Node server I wrote, gzip, in memory), 2,000 requests at 50 concurrency:** mixed index/JS/CSS/version.json: 1,682 req/s, p50 26.7 ms, p95 45 ms, p99 99 ms, 0 errors. Main JS alone (271 KB each): 796 req/s, p50 60 ms, p95 82 ms, p99 104 ms. This shows the build itself is fine; it does **not** measure Cloudflare. (My first run accidentally served the HTML for every file; I found it, fixed the server and re-ran. The numbers above are the corrected ones.)
- **Live, within the cap:** 200 requests, concurrency 10, to `/` and `/version.json`: **39 req/s, p50 151 ms, p95 661 ms, p99 1,050 ms, max 1,249 ms, 200 of 200 OK, no 429, no 5xx.** Both answered `cf-cache-status: HIT`. The tail (about 1 s) is the Cloudflare Worker running first for every page request (`run_worker_first: /*`), plus my network path; it is worth watching but not a problem.

### C. Database under load (local PGlite, 5,000 users / 200,000 posts / 1,000,000 messages / 200,000 notifications / 300,000 follows, 413 MB)
| Query (as a signed-in user) | Time |
|---|---|
| `feed_posts()` (200 newest posts) | 165 to 250 ms |
| `my_notifications()` | 6 to 17 ms |
| `chat_messages(chat)` | 4 to 7 ms |
| `search_users('user12')` | 82 to 91 ms |
| `search_users('')` (whole people list) | 300 to 335 ms, grows linearly with users |
| `my_unread_chat_summary()` | 115 to 130 ms |
| `my_chats()` | 750 to 1,200 ms (see P1 for the global-chat case) |

(PGlite is slower than real Postgres; use the numbers to compare queries, not as live timings.)
- Message, notification and post lookups use their indexes (`messages_chat_created_idx`, `notifications_target_idx`, `posts_created_idx`). No sequential scan on a big table in the plans I checked, except the tiny `message_hides` table.
- Missing foreign-key indexes (`node scripts/audit-indexes.mjs`): 6, all on small or new tables. Suggested SQL (not created):
  ```sql
  create index if not exists family_rooms_owner_id_fk_idx on public.family_rooms (owner_id);
  create index if not exists family_sealed_user_id_fk_idx on public.family_sealed (user_id);
  create index if not exists scratch_comments_user_id_fk_idx on public.scratch_comments (user_id);
  create index if not exists scratch_reactions_user_id_fk_idx on public.scratch_reactions (user_id);
  create index if not exists scratch_reveals_user_id_fk_idx on public.scratch_reveals (user_id);
  create index if not exists scratch_saves_user_id_fk_idx on public.scratch_saves (user_id);
  ```
- Design issues that matter more than indexes:
  - `feed_posts` is a **global** feed (newest 200 posts of everyone, not "people I follow") returned in one call, no paging. Each Home load downloads up to 200 posts.
  - `search_users('')` returns the **whole user list** to every client at start-up. Egress and phone memory grow with each sign-up.
  - N+1 patterns: I found none (no loops that call an RPC per row). `fetchChatsStrict` decrypts the last message of each chat in parallel, which is fine.

### D. Free-plan headroom (an estimate, not a measurement)
Inputs I measured: payload shapes above, 413 MB database for 1M messages + 200k posts + related rows, the code's poll timings. Inputs I assumed: 2 app opens per user per day, about 1 KB per post, gzip about 3x, and Supabase's published free limits (5 GB egress, 500 MB database, 1 GB storage, 500,000 edge-function calls, 50,000 MAU, 200 concurrent Realtime connections). Check the numbers in your dashboard.

- Per app open: feed ~200 KB, people list ~0.3 KB per registered user, chats ~20 KB, notifications ~25 KB, story tray and extras ~70 KB. That is about 0.3 MB plus 0.3 KB per registered user (before gzip).
- Open chat: a "typing" ask every 1.5 to 3 s while the chat is on screen = 20 to 40 requests a minute per person. Messages themselves come over Realtime.
- Media goes through the Cloudflare cache (`/m/`), so Supabase egress is mostly API JSON.
- Rough monthly API egress after gzip, per 1,000 daily users: about 6 to 10 GB when the user list is 2,000 to 5,000 people. So **the 5 GB egress limit is reached at roughly 300 to 600 daily users** (earlier if many keep a chat open).
- Other limits, in the order I expect them:
  1. **Realtime: 200 concurrent connections** → about 200 people online at the same moment (not measured).
  2. **Database 500 MB**: about 1M text messages + 200k posts. At 1,000 daily users sending 30 messages a day, full in about a month. (Cleaning old rows or moving to the Pro plan fixes it.)
  3. **Egress 5 GB**: 300 to 600 daily users (above).
  4. **Edge-function calls 500k/month**: every push and email goes through `dynamic-handler`; about 800 daily users at 20 notifications each.
  5. **Storage 1 GB**: media uploads; depends on how many photos and videos.
  6. **Cloudflare Workers (not Supabase):** the Worker runs for every page load and every `/m/` media file. The free Workers plan allows 100,000 requests a day; a Home page with 20 pictures is about 20 of them, so about 5,000 Home views a day. I do not know whether the account is on the free or paid Workers plan: **check this first**.
- **First bottleneck: egress, driven by the 200-post feed and the whole-user-list download; then Realtime concurrency.** `scripts/usage-alert.mjs` warns at 80% for the database and storage only; egress cannot be read that way, so watch the dashboard.

### E. Smoothness on a phone (from code, not measured on a phone)
- `ChatView.tsx:1724`: a 250 ms interval calls `getClientRects()` (a layout read) all the time, even when the chat is hidden. It forces layout 4 times a second. Replace with an IntersectionObserver or tie to the visibility event. Other fast timers: `App.tsx` 1.5 s measure, two safety timers at 2.5 to 3 s, the Studio colour panel 400 ms, minigame polls 0.7 to 1 s. 85 `setInterval` calls in total; most are slow or gated by `document.hidden`.
- Typing poll (1.5 to 3 s) stops when the tab is hidden. Good.
- Lists: the feed, Explore and chat messages use an `IntersectionObserver`, but there is **no list virtualisation library** (no react-window/virtuoso). A 200-post Home feed and a long chat can render hundreds of DOM nodes; watch memory on low-end phones.
- Service worker: it does not cache app files (no offline app cache). It only (1) rewrites direct Supabase media URLs to the cached `/m/` route, (2) shows the "NOOB is taking a short break" page when the site is down, and (3) handles push. It is switched off on iPhone for speed. Hashed JS/CSS under `/assets/` get long browser caching from Cloudflare, so repeat visits are fast; HTML and `sw.js` are `no-cache`, which keeps updates instant.
- Media: `/m/` returns `Cache-Control: public, max-age=31536000, immutable`, supports Range for video and keeps whole files in the edge cache. Newer uploads are compressed on the phone (50 MB cap). Old large files are not shrunk.

## 5. Top 5 things to fix, in order
1. **P1:** cap the unread counts in `chat_json` / `my_unread_chat_summary` (limit 100) so the shared chat cannot make `my_chats` slow.
2. **Egress:** page the Home feed (20 to 30 posts, then more on scroll) and stop sending the whole user list on start-up (search on demand).
3. **M2:** move games to a separate origin, or at least drop `allow-same-origin` where the game does not need it.
4. **M1:** make chat and private-account media private (signed URLs).
5. **M3 and M4:** add Turnstile to sign-up and use the platform's trusted client-IP header for guest limits.

## 6. What I could not test
- Any logged-in flow, real row-level-security behaviour for signed-in users on the live project (only the local test database covers this), and the 3 "emailed code" flows (no brute force or sign-ups allowed).
- Real phone performance, FCP/LCP on the live site, Lighthouse.
- Live Supabase/Cloudflare quotas and plan type (no dashboard access, no service key used).
- GitHub code-scanning alerts (needs login), old-domain redirect from `nooob.xyz`, TLS 1.0/1.1 refusal.
- Database timings are from PGlite, a slower engine than Supabase's Postgres, with synthetic data; use them to compare, not as promises.
