# NOOB security re-test, 2026-11-13

Scope: repo `N00B_fixed/instagram` at HEAD (after `1d4dedd1`), a fresh local build (`D:\noob-audit\dist`), read-only probes of https://noobsocials.com (about 20 requests) and of Supabase (about 28 requests: GETs, RPC calls that must be refused, one OPTIONS, one POST to `recover-account` without a token, as allowed). No code changed, no git command except `git ls-files` / `git grep` / `git log`/`git diff` (read only), nothing written to live, no login, no sign-up. Compared with `docs/SECURITY-AND-LOAD-REPORT.md`.

## 1. Verdict

**Still good for a student project; no Critical and no new High found in what was tested.** The fixes from the last audit that were meant to be done are done and tested (P1, M4, the FK indexes, Turnstile on the sign-up code). The locked chat attachments are well built: a sound cipher design, a tight storage policy, and the database tests prove the key claims.

Two things I would act on first:
1. **M2 (games on the same address as the app) is now worse than when it was written, because the chat private keys live in the same browser storage.** Any game script can read both the Supabase session *and* the end-to-end chat keys (`noob_e2ee_ring_v1_<id>` in localStorage and IndexedDB `noob-e2ee`). So the "locked" chats are only as safe as the least trusted game file. Nothing is switched on yet: the games-origin groundwork is only code, and no game has `isolated: true` in `types.ts`.
2. **A delivered locked attachment can vanish two days later** if the follow-up call `attach_sealed_media` failed (new finding N1, Medium, a data-loss type of bug, not a leak).

Not tested: anything that needs a login (see section 9). "No problem found" is not "secure".

## 2. Results of the checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1a | `scripts/security-audit-db.mjs` | PASS | 199 tables, 136 policies, 683 SECURITY DEFINER functions; RLS on every table, no write-open policy, fixed search_path, no admin function open to visitors, 23 open on purpose. Same stale entry as before: `study_public_status` in `OPEN_TO_VISITORS` no longer exists. |
| 1b | `scripts/guard.mjs` | PASS | 34 of 34 checks (was 31). |
| 1c | `scripts/lint-text-fit.mjs` | PASS | 0 places. |
| 1d | `npm audit --omit=dev` | NOTE | 0 critical, 0 high, 7 moderate, 1 low. Same set as before (firestore-api chain: gaxios, google-gax, minimatch, uuid ...). Server/build side, not in the browser bundle. |
| 1e | New tests | PASS | `test-e2ee-media` 71/71, `test-sealed-media-db` 26/26, `test-turnstile` 30/30, `test-games-origin` 14/14, `test-chat-counts-capped` all ok (20,000 messages in the global chat: `my_chats` 69 ms, summary 3 ms), `test-no-xff-first-trust` OK (no function trusts the first x-forwarded-for entry). |
| 2 | Secrets | PASS | No service_role/`sb_secret_`, private key, Groq/Resend/AWS/GitHub token pattern in tracked source or in the new `dist` (hits are minified library bytes in game `physics-*.js` and wasm/model files, and the code string `startsWith("sb_secret_")` that only refuses such a key). The Turnstile **secret** appears nowhere (only the name `TURNSTILE_SECRET_KEY` in comments and `Deno.env.get`). The live bundle contains the Turnstile **site** key `0x4AAAA...` (public by design) and the `sb_publishable_` key. Tracked env files: `.env.example`, `.env.production` (public URL + publishable key only). No `.map` files built; live `*.map` returns the app's HTML page. Tracked `android-overrides/debug.keystore` (see L6). |
| 3 | Live headers | PASS | See section 3. |
| 4 | Anonymous Supabase | PASS | See section 4. |
| 5 | Chat encryption | PASS with notes | Section 5. |
| 6 | Turnstile | PASS with notes | Section 6. |
| 7 | Functions, CORS, XSS, postMessage, games, SW, 3rd party | See section 7 | |
| 8 | Diff review since 3c7247b9 | See section 8 | |

## 3. Live headers (curl, noobsocials.com)

- Home: HSTS `max-age=63072000; includeSubDomains; preload`, CSP with `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`; `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, Permissions-Policy, COOP `same-origin-allow-popups`. `Cache-Control: no-cache` on `/` and `/sw.js`, `no-store` on `/version.json`. No cookies.
- **CSP script-src** is `'self' blob: https://static.cloudflareinsights.com https://www.youtube.com https://challenges.cloudflare.com`. The only addition since last time is `challenges.cloudflare.com`; no `unsafe-inline`/`unsafe-eval` for scripts. Diff of `_headers` confirms only that host was added to the main rule. (`frame-src https:` already allows Turnstile's iframe.)
- `/m/chat/test.sealed` (GET): **404**, body `Not found`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, plain text: nothing leaks. NOTE (Low): the same path with **HEAD** answers `400` (Supabase's status is passed through for a missing object on HEAD); harmless, but 404 would be consistent.
- Media responses from the Worker carry `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`, nosniff, CORP cross-origin (read in `worker/index.js`): an uploaded SVG/HTML opened directly cannot run script. Sealed files are served as `application/octet-stream` (ciphertext).
- `/games/underhall/`: `frame-ancestors 'self' https://noobsocials.com https://www.noobsocials.com`, nosniff, `script-src 'self'`; no `X-Frame-Options` any more (CSP does the job; browsers that ignore CSP frame-ancestors are practically gone). `/lenses`: `frame-ancestors 'self'`, `X-Frame-Options: SAMEORIGIN`.
- NOTE (Low): a missing hashed file such as `/assets/nonexist.js` returns **200 text/html with `immutable`, one-year cache** (the SPA fallback inherits the asset cache rule). A stale chunk request after a deploy can therefore be cached by a browser as HTML for a year at that URL (the URL is hashed, so only a broken old tab is hurt, but it is a classic cause of "white screen until I clear data"). Fix: let the Worker answer 404 (no immutable) for `/assets/*` misses.
- `games.noobsocials.com` does not resolve yet (curl error): the separate games address is not switched on. `www.noobsocials.com` answers 200 (not a redirect to the apex; SEO duplicate only). `http://` redirects 301. `nooob.xyz` unreachable from this PC (as before), so the old-domain redirect is untested.

## 4. Anonymous Supabase probes (28 requests)

- 9 tables with the publishable key: `sealed_media` (new), `messages`, `profiles`, `chats`, `profile_private`, `signup_tickets`, `media_trash`, `client_errors`, `family_rooms` all **401 / 42501 permission denied**. `sealed_media` answering 401 (not 404) also proves migration 20261113000002 is applied live.
- RPCs as anon, all **401 permission denied**: `register_sealed_media`, `attach_sealed_media`, `discard_sealed_media`, `my_chats`, `my_unread_chat_summary`, `admin_accounting_overview`, `media_unused_candidates`. (`is_chat_member`, `purge_media` do not exist as public RPCs: 404.)
- Storage: `POST /storage/v1/object/list/media` with prefix `chat` returns `[]`. Anonymous upload of an octet-stream to `chat/....sealed` is refused (`new row violates row-level security policy`). Nothing was written.
- `recover-account` with `signup-otp-request` and **no token**: `HTTP 400 {"error":"Please complete the security check ...","code":"captcha_failed"}`. This proves the secret is set and enforcement is live, and that the refusal happens before any email. CORS preflight: `Access-Control-Allow-Origin: *`, headers `authorization, x-client-info, apikey, content-type`, methods `POST, OPTIONS` (bearer-token API, no cookies; Low).

### Reading the new migration (20261113000002) carefully

- **Who may upload `application/octet-stream`?** The bucket now lists it, and a RESTRICTIVE insert policy `media_sealed_only` (for `authenticated`) requires, for any octet-stream object in bucket `media`, the name to match `^chat/[A-Za-z0-9._~@+=-]{1,160}\.sealed$`. Restrictive policies are ANDed with `media_upload` (folder allow-list), so octet-stream is accepted only at `chat/<name>.sealed`; every other folder is unchanged. There is no UPDATE policy on `storage.objects` for `media`, so an existing object cannot be overwritten or re-typed (the app also sends `x-upsert: false`). `test-sealed-media-db` proves the other-folder refusal. Not covered by the test (hardening, Low): the comparison is case-sensitive (`'application/octet-stream'`), so a mixed-case mime string would skip the restriction **if** the storage service accepted it against the bucket list; the worst result is a stray octet-stream file in another folder, still served nosniff + sandbox. Suggest `lower(...)`.
- **Anyone logged in can still upload unlimited `.sealed` files** into `chat/` without registering them (storage quota abuse; same as every other upload folder). Unregistered files are not tracked by `sealed_media`, so only the existing unused-file sweep could catch them.
- **Register another user's file?** `register_sealed_media` needs `is_chat_member(p_chat)`, a key matching the pattern, and a `storage.objects` row with `owner_id = auth.uid()`. So a user can register only files they uploaded themselves, into chats they belong to. `sealed_media` has `key` as primary key and `on conflict do nothing`, so nobody can take over an existing registration.
- **Attach to another user's message or another chat?** `attach_sealed_media` requires `s.owner_id = me`, `message_id is null`, the message `m.sender_id = me`, `m.e2ee is not null` and `m.chat_id = s.chat_id`. A different user's message, a different chat, a plain message, or a second attach all give "does not belong to this message". `discard_sealed_media` deletes only the caller's unattached rows. All three are `security definer` with `search_path = public`, `auth.uid()` checked, revoked from public/anon, granted to authenticated (live anon probe confirms).
- **Table access:** RLS on, `revoke all ... from anon, authenticated`: neither anon nor logged-in users can read or write `sealed_media` (live anon probe 401; tests prove both read and write refused). Only the functions touch it.
- The delete trigger queues the file into `media_trash` for 24 hours (then the normal purge). Message, chat or account deletion cascades, so deleted messages do not leave the ciphertext behind.

## 5. Chat encryption review (code reading)

What is sound:
- **Cipher design (`src/e2ee/media.ts`):** a new random 256-bit AES-GCM key per file plus a random 64-bit nonce prefix; nonce = prefix + 32-bit chunk index, so a nonce never repeats under one key. 1 MiB chunks, each authenticated with additional data = label + chunk number + chunk count + total size + chunk size, so chunks cannot be reordered, repeated, dropped or truncated. Opening checks the stored size first, decrypts everything and only then returns a Blob; a failed chunk throws and nothing partial is shown. The descriptor (key, nonce, size, mime) is validated (`parseDescriptor`), mime restricted to image/video/audio and not svg/html/xml/javascript (a malicious sender cannot make the receiver render an active file). 71 tests.
- **Key travels only inside the E2EE payload** (`messages.ts` puts it in `Payload.s`); the server sees `chat/<random>.sealed`, octet-stream, and the size.
- **Blob URLs:** `SealedAttachment.tsx` creates the object URL on open and revokes it when the component unmounts; decrypted blobs are kept in an in-memory Map only (size-capped) and cleared when leaving the chats (`ChatView.tsx:1452`). Nothing readable is written to disk by the code.
- **Previews:** chat list and quotes use `sealedLabel()` / `quoteOf()` ("Photo", "Video", "Voice message"), never the file; the push/notification text for a locked message is `@user: 🔒 New message` (server side, migration 20260921000015); `send_message` blanks `text`/`media_url` for locked messages, so server-side search and previews have nothing to index.
- **A locked chat never downgrades silently:** `prepareSend` throws instead of sending a plain file into a lockable chat; `prepareChatAttachment` throws if locking fails; nothing readable is uploaded as a fallback.
- **Edit/delete:** `prepareEdit` re-encrypts and keeps the `s` descriptor, so a caption edit keeps the attachment (tested). Delete cascades through `sealed_media` to the 24 h file queue. There is no "forward" feature in `ChatView`, so no path copies a file key to another chat.
- **Old clients:** an old app version cannot open a locked attachment (it sees a locked message placeholder, as it already does for locked text). Old plain messages still open in the new app (tested).

Weaknesses, honestly stated:
- **E1 (Medium). The decrypted chat is cached in plaintext in `localStorage`, including each attachment's file key.** `ChatView.tsx` writes `noob_msgs_cache_<userId>_<chatId>` (the whole unlocked message list: text, `sealed.key` and `sealed.desc.k` = the AES key of every photo/video/voice note) and `noob_chats_cache_<userId>` (chat list with unlocked last-message text) with `safeLocalStorageSet`. These keys are never removed on logout (`logoutUser` clears the feed cache but not these; no other code references them). So: anyone with access to the browser profile after logout (shared PC, family phone browser), any script on the same origin (games, M2) or an XSS gets readable chats and can fetch+open the public ciphertext files. This is the same pre-existing weakness that already exists for text, but attachments add the file keys. It makes the "private keys never leave the device" promise weaker than the docs sound. **Fix:** do not cache locked messages at all (skip caching when `m.encrypted`, or strip `text`/`sealed`/`mediaUrl` before writing, show a skeleton until the fetch returns), and delete `noob_msgs_cache_*`, `noob_chats_cache_*` on logout. Cheap (a few lines) and removes most of the risk.
- **E2 (High when combined with M2). The device private key ring is plain JWK in localStorage and IndexedDB** (`keyring.ts`: `privateJwk`, stored in both stores on purpose for durability). Same-origin scripts can read it. It is the design for web E2EE without a lock screen, but with 25 games on the same origin it is the real exposure. Fix path: finish M2 (separate games origin) first; later make the private key a non-extractable CryptoKey in IndexedDB and wrap the exported backup with the passphrase only.
- **E3 (Low/NOTE). What the server and anyone with storage access still see:** who talks to whom, when, message counts, sizes (stored size = file size + 16 per MiB, so approximate file size and type of attachment), the order of messages, the public key directory (a server operator could in principle substitute a key; the app uses first-seen memory and shows a changed-key warning, `peer.changed`), the fact that a message is locked, and the file's storage time. The ciphertext files are in a **public** bucket and in the Cloudflare cache for a year (useless without the key, but they are not removed from the edge cache when the message is deleted; the origin file is purged after 24 h).
- **E4 (NOTE). Not locked at all:** the public Lounge and the AI chat (server refuses locking there); groups are locked only when **every** member has opened the updated app (otherwise the whole group falls back to unlocked, by design in `service.ts`); shared posts/profiles/tracks/game invites in chats (`prepareSend` returns null, the server needs to read them); GIFs/stickers are links to other sites; custom stickers; anything sent by an old client (the server cannot refuse a plain message into a lockable chat, so a modified or old client can always send plain, and the other side sees it as plain); text before the migration; Family map data is a separate scheme. A person with no keys yet (never opened the new app) pulls their whole chat down to unlocked.
- **E5 (Low). Memory:** the opened file is held as a Blob twice at peak (up to 48 MB); fine. The `sealedCache` is released when leaving chats but not explicitly on logout (page reload clears it).

## 6. Turnstile

- **Design (`recover-account`, `verifyTurnstile`):** active only when `TURNSTILE_SECRET_KEY` is set (it is, live proof above). Checked first for `signup-otp-request`, before any lookup, allowance or email. Missing/oversized (>2048) token: refused. Cloudflare `success:true`: pass. `error-codes` `missing-input-response`, `invalid-input-response`, `timeout-or-duplicate`, `bad-request` or none: refused (so a reused token is refused; Cloudflare tokens are single-use, and the client resets the widget after each request). Cloudflare unreachable, HTTP error, or error codes about our own set-up (`invalid-input-secret`, `internal-error` ...): **fail open** with a log warning. That choice is stated and the per-IP/per-email limits in `signup_otp_request` remain as backstop. Risk of fail-open: if the secret is ever rotated wrongly, the check silently switches off (watch the function log for "turnstile:" warnings). `remoteip` is sent (from `cf-connecting-ip`), which lets Cloudflare bind the token to the network. 5 s timeout. Token and secret are not logged.
- **Login and others unaffected:** the login handler does not mention it (tested); `login-approval-start`, `otp-request` (emailed login code), recovery questions, guest-support and `welcome` were not changed. Guest support keeps its own limits (3 uses per browser, code limits, pace limit using the Cloudflare IP).
- **Every route that creates an account or sends an emailed code:**

| Route | Sends email / creates account | Protection |
|---|---|---|
| `recover-account` `signup-otp-request` (also used by the Google profile completion screen `CompleteOAuthProfile`) | sign-up code email | **Turnstile** + per-IP and per-email limits + email-domain MX check |
| `signup-otp-verify` | creates the account | needs the emailed code; limits on attempts; ticket required by trigger |
| Direct `auth.signUp` / `signInWithOtp` to Supabase Auth | would create a login | refused by the `signup_tickets` trigger (migration 20261027), only the function can create a ticket. `mailer_autoconfirm` stays on but is neutralised by this. I could not test it live (sign-ups forbidden). |
| Google/other OAuth sign-in | creates an `auth.users` row at the provider's word | no Turnstile; a profile still needs `oauth-complete-signup`, which needs the emailed code (Turnstile-protected request). A bot with Google accounts can only leave profile-less rows. |
| `otp-request` (login code to an existing user's email) | email to a known user | rate limits only (3 per hour per account, cooldown, per IP). Can annoy a victim with emails; user names are enumerable ("No account found"). |
| `login-approval-start` | "Is this you?" email | needs the correct password first, per-IP limit |
| `guest-support-*` | emailed code | 3 uses per browser/IP, own limits |
| `welcome`, `delete-account`, `dynamic-handler` email actions | emails | need a valid user token or the private push secret |

  What a bot can still do: enumerate user names/emails (L1), trigger login-code emails to a chosen existing username up to the rate limit, and pass the check by buying human solves. Turnstile is not a rate limit; the database limits are the real floor.

## 7. Other checks

- **Edge functions changed since last audit** (`dynamic-handler`, `recover-account`): the only auth-relevant change is the client IP: `cf-connecting-ip` first, else the **last** `x-forwarded-for` entry (both functions, both lines read; guest support uses the Cloudflare header only). The source test passes. This is correct as long as the function stays behind Cloudflare (Supabase's edge is). A live spoof test needs many calls and was not done. `moderator`, `agora-token`, `chess-move`, `forms-*` unchanged.
- **XSS/eval:** one `dangerouslySetInnerHTML` (`LegalShell`, fixed text), no `innerHTML =`/`eval`/`new Function` in `src`. **postMessage:** 6 `message` listeners (HelixFall, HostedGameFrame x3, LensHost, NoobAiPage), each with an origin check (HostedGameFrame 5 checks, the others 1 each). `TurnstileBox` loads only `https://challenges.cloudflare.com/turnstile/...` and only when a site key is built in.
- **Third-party scripts:** none added except Turnstile (`script-src`); Cloudflare Insights and YouTube were already there.
- **Service worker:** unchanged in this session's diff (no app-file caching, rewrites media to `/m/`, push, down page).
- **Games isolation status:** NOT switched on. Facts: `VITE_GAMES_ORIGIN` empty, `games.noobsocials.com` does not resolve, no entry in `types.ts` sets `isolated: true` (the docs mention Royal Ludo as a candidate), `noob_run_3d` and `critter_kart` are `sameOriginOnly`. So **all 25 hosted games run in a frame with `allow-scripts allow-same-origin` on the app's own address and can read: the Supabase session, the E2EE key ring (localStorage + IndexedDB), the cached decrypted chats (E1)**. The CSP of the games (`script-src 'self'`, `connect-src 'self'`) stops them from sending data to other sites, which is a real mitigation: a malicious game could read, but exfiltration is limited to same-origin endpoints, `postMessage` to the parent, or any channel not covered by the CSP (navigation to an external URL via `top` is not possible due to the sandbox without `allow-top-navigation`, but `img-src`/`frame` tricks within `connect-src 'self'` are hard). One game (`unsafe-inline`/`unsafe-eval` in its own CSP) is looser. Treat this as "high impact, low likelihood" until isolation is done. The new Worker rule (404 for non-`/games/` paths on the games host) and the `frame-ancestors` change are correct and tested.
- **InAppBrowser** frame uses `sandbox="allow-scripts allow-same-origin ..."` for external links; safe for cross-origin pages, but an in-app link to a same-origin URL would be same-origin with the app (Low; only `https:` links, check it refuses `noobsocials.com` URLs).
- **Rate limits on OTP/login:** database-backed per-IP and per-account (`recovery_otp_request`, `signup_otp_request`, `login_approval_check`, `*_verify` attempt counters). Read, not attacked.

## 8. Diff review since 3c7247b9 (security-relevant files)

- `supabase/migrations/20261113000001_chat_counts_capped.sql`: count capped by `limit 100` subqueries, grants unchanged, 6 FK indexes. OK.
- `20261113000002_sealed_chat_media.sql`: reviewed line by line in section 4. One functional problem (N1), one hardening note.
- `20261112000006_client_errors.sql`: new open-to-visitors function `report_client_error` (text lengths cut, 30 per hour per user, **300 per hour shared by all anonymous callers**, 30-day purge, tables locked). Note: an attacker can use up the shared anonymous bucket so real visitor error reports are dropped (harmless), and writes up to ~1.5 MB/hour of junk (low). Admin read function is admin-checked. OK.
- `20261112000004/5` (reposts, chat mute): authenticated only, tables locked. `expire_chat_mutes()` is callable by any logged-in user (expires only due mutes; harmless).
- `public/_headers`: Turnstile host added to the main rule only; 15+ games' `X-Frame-Options: SAMEORIGIN` removed and `frame-ancestors` widened to the app's own two hostnames. Same-origin today, so no new exposure; when the games move, the game pages can be framed only by the app. `/f/*`, `/lenses`, `/family` unchanged.
- `worker/index.js`: games-host guard only. OK.
- `recover-account`: Turnstile block, IP change. `dynamic-handler`: IP change. `supabaseApi.ts`: sealed upload/open, token sent with sign-up request. The upload sends `x-upsert: false` and the user's access token. No secret handling changed.
- No new `eval`, `innerHTML`, wildcard `postMessage`, or token logging.

## 9. Findings

### Status of last audit's findings

| ID | Was | Status now | Why |
|---|---|---|---|
| P1 | `my_chats` slow with the global chat (High, performance) | **Fixed** | Counts capped at 100 in `chat_json` and `my_unread_chat_summary`; test: 20,000 global messages, `my_chats` 69 ms. Live definition not inspected, function exists live (401 for anon). |
| M1 | Public media bucket, no auth on `/m/` | **Partly** | New chat photos/videos/voice notes are ciphertext, so the public link is useless. Still public: old chat media, media of private accounts, unlocked chats (Lounge, AI, groups with un-updated members), shared posts. |
| M2 | Games same-origin with allow-same-origin | **Open** | Groundwork and docs only, nothing switched on; severity raised because E2EE keys and cached chats share the origin (E1, E2). |
| M3 | Sign-up not email-verified / bots | **Partly** | Turnstile live on the sign-up code request (proven 400). Ticket trigger blocks direct `auth.signUp` (by reading; not tested live). Google path and login-code emails rely on rate limits only. |
| M4 | Guest limits trust first x-forwarded-for | **Fixed** (code + test) | `cf-connecting-ip`, else last x-forwarded-for, in both functions. Live spoofing not tested. |
| L1 | Enumeration RPCs/messages | **Open** | `No account found...` still distinct; limits exist but are not per-endpoint verified. |
| L2 | Webhook SSRF DNS-rebinding window | **Open** | `forms-webhook-run` unchanged. |
| L3 | 7 moderate npm audit | **Open** | Same 7 moderate + 1 low. |
| L4 | CORS `*` on functions | **Open** (accepted) | Bearer tokens only. |
| L5 | Wide CSP parts | **Open** (accepted) | `style-src 'unsafe-inline'`, `img-src https:`, `frame-src https:`. |
| L6 | Debug keystore tracked | **Open** | Still tracked; `android/app/build.gradle` release has no signingConfig in that file, so the release signing comes from elsewhere (Play signing/CI): confirm. |
| L7 | Unused auth providers enabled | **Not re-tested** | Needs the Supabase dashboard / auth settings (token). |
| L8 | Stale `study_public_status`, 6 missing FK indexes | **Partly** | Indexes added by migration 20261113000001; the stale allow-list name is still there. |
| L9 | Code-scanning alerts unreadable | **Not tested** | Needs GitHub login. |

### New findings, ranked

| # | Sev | Finding | Fix |
|---|---|---|---|
| N0 | High (conditional) | Same-origin games can read the E2EE private key ring and the cached chats (E1, E2, M2 combined). | Switch on the games origin (docs/GAMES-ORIGIN.md steps), isolate games that can be isolated; until then treat any new game file as trusted code. |
| N1 | Medium (data loss) | `attach_sealed_media` is a separate call after `send_message`. If it fails 3 times (offline, app closed, phone locked), the registration stays unattached; at the owner's next `register_sealed_media`, rows older than 2 days are deleted and the file goes to the 24 h trash and is purged. The delivered message then shows "no longer available". | Make it atomic: pass the key in `send_message` (`p->'sealedKey'`) and insert/attach in the same transaction; or only drop unattached rows whose chat has no message from that sender after the upload time; keep retrying `attach` on app start (queue in IndexedDB). |
| N2 | Medium | Decrypted messages and attachment file keys stored in localStorage and never removed at logout (E1). | Do not cache locked messages; wipe `noob_msgs_cache_*` and `noob_chats_cache_*` on logout. |
| N3 | Low | `media_sealed_only` compares the mime case-sensitively; unregistered `.sealed` uploads are untracked and unlimited per user. | `lower(coalesce(metadata->>'mimetype',''))`; per-user storage quota or a sweep for `chat/*.sealed` objects with no `sealed_media` row older than 2 days. |
| N4 | Low | Missing `/assets/*` files return 200 HTML with a one-year immutable cache. | Worker/`_headers`: 404 and `no-store` for unknown `/assets/*`. |
| N5 | Low | `/m/` HEAD for a missing object answers 400 instead of 404. | Map 400 to 404 in the HEAD branch. |
| N6 | Low | Turnstile fails open on our own mis-configuration, silently. | Add an admin alert/log check for `turnstile:` warnings; test the key after every secret rotation. |
| N7 | Low | `report_client_error` shared anonymous bucket of 300/hour can be exhausted by one caller. | Per-IP bucket if abuse appears. |
| N8 | Info | `www.noobsocials.com` serves the site (no redirect to the apex). | 301 to the apex in the Worker. |

## 10. What is left for the owner

1. Plan and switch on the games address (M2/N0), because it also protects the chat keys. Test on a phone after (saves start empty there).
2. Ask for the small chat fixes: stop caching locked messages + wipe on logout (N2), atomic attach (N1).
3. Keep checking `turnstile:` warnings in the `recover-account` log after changes.
4. Dashboard-only items I cannot see: Supabase auth providers (L7), `mailer_autoconfirm`, Cloudflare Workers plan, Security tab alerts (L9), release signing key (L6), whether the old `nooob.xyz` redirects.
5. Optional hardening: `npm audit fix` in a branch (L3), drop `study_public_status` from the audit allow-list.

## 11. What I could not test

- Anything that needs a login: real RLS behaviour for signed-in users on live, calling the new functions as an authenticated user (not allowed), the real encrypt/send/open flow on a phone, and the attach race (N1 is from reading the SQL and the client code).
- A live spoof test of the IP header (M4), a live direct `auth.signUp` against the ticket trigger, rate-limit behaviour under load, and Turnstile with a valid token (would need a real person solving the widget).
- Whether the live `my_chats` definition equals the repo file (only that the function exists and is refused for anon).
- TLS version negotiation, the `nooob.xyz` redirect, `games.noobsocials.com` behaviour (does not resolve yet), the Cloudflare/Supabase dashboards and GitHub code-scanning.
- Mixed-case mime handling by the storage service (N3), and whether Cloudflare's edge cache can be purged for deleted sealed files.
