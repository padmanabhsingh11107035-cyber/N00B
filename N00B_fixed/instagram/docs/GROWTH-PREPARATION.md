# Growth preparation (2026-11-14)

Rule: free plans only (Supabase Free, Cloudflare Workers Free and Pages, GitHub Actions), zero cost.
This is research only. No code, no migration, no live service was touched. Every number below is either from the repo (with the source named) or marked **estimate**. Where the repo has no number, it says "unknown".

## 1. Where NOOB stands today

| Fact | Value | Source |
| --- | --- | --- |
| Registered accounts | about 56 (email sent to 56 users, 2026-10-14); 79 logins and 63 profiles on 2026-10-28 | `docs/SECURITY-AND-LOAD-REPORT.md` ("about 56 users"), owner's data check of 2026-10-28 |
| Daily active users | unknown (not stored in the repo) | |
| Database | 39 MB on 2026-10-28 (202 public tables, 30,648 rows in all); 17% of the free 500 MB on 2026-11-13 | data check 2026-10-28; usage page 2026-11-13 |
| File storage | 501 files, 302 MB on 2026-10-28; 32% of 1 GB on 2026-11-13 | same |
| Egress (API) | 2.73 of 5 GB in the Oct cycle (projected 4.2); 16% on 2026-11-13 | usage pages |
| Cached Egress | 12.1 of 5.5 GB in the Oct cycle (**over the limit, project was restricted until the cycle reset on the 5th**); fixed by serving all media from the Worker's own cache (`/m/<key>`); the current cycle's number is **unknown, read it** | `worker/index.js`, owner's notes |
| Cloudflare Workers | Free plan, 100,000 requests a day | owner's note 2026-11-13 |
| Realtime | 4 channels per signed-in app (notifications, chat, message_hides, device_sessions), all over one connection | `src/services/supabaseApi.ts` lines 1051, 1659, 3575 to 3587 |
| Edge function calls | one `dynamic-handler` call for every new notification row (database trigger `notifications_push`), plus emails and purges | `20260919000008_staff_permissions_group_policy_push.sql:720` |

Free limits as quoted in the load report (check them in the dashboard, they can change): egress 5 GB, database 500 MB, storage 1 GB, edge function calls 500,000 a month, monthly active users 50,000, Realtime 200 concurrent connections, Workers 100,000 requests a day.

## 2. How the estimates were made

* "10x" and "100x" mean 10 and 100 times today's accounts and activity. The first break point is found by scaling today's percentage up in a straight line. Real growth is not straight (new users upload more than old ones; old content keeps costing egress), so treat every "reached at" as **an estimate, +/- 2x**.
* From the load report (section 4D): per app open about 0.3 MB plus 0.3 KB per registered user (before gzip, **estimate**), 2 opens per user per day (**assumption**), gzip about 3x.
* The people list (`search_users('')`) is capped at 300 accounts (`20261022000005`), so its size stops growing after about 300 accounts; after that egress grows only with the number of people opening the app.

## 3. What breaks first (ranked)

| Rank | Resource (free limit) | Today | At 10x (estimate) | At 100x (estimate) | Reached at about | Why |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **File storage** (1 GB) | 32% | 320%: over | far over | **3x** (about 180 to 250 accounts) | 302 MB for 79 logins is about 4 MB per login; photos, reels and videos (up to 48 MB each, `src/utils/videoPlan.ts:9`) |
| 2 | **Database size** (500 MB) | 17% | 170%: over | far over | **6x** | 1M messages + 200k posts measured as 413 MB in the load test; messages, notifications and the points ledger (1,691 rows in 40 days) are never deleted. The 17% may include fixed overhead, so the real slope may be lower (estimate) |
| 3 | **API egress** (5 GB) | 16% | 160%: over | far over | **6x**, earlier if many keep a chat open | feed, people list, chats, notifications on every open; load report: limit at roughly 300 to 600 daily users |
| 4 | **Cached Egress** (5 GB) | unknown now | depends on unique media bytes x Cloudflare data centres | same | unknown | Oct cycle was 12.1 GB before the Worker fix. Read the Usage page every week |
| 5 | **Realtime connections** (200 at once) | far below | about 33% of 600 people online at once to reach it: unlikely | **reached** (about 3% of 6,000 online at once) | about 100x | one connection per open app; `messages` changes are checked against every listener's row rule (cost grows with listeners; **estimate**, not measured) |
| 6 | **Edge function calls** (500,000 a month) | about 0.3% (1,964 notifications in 40 days for 79 logins, one call each; **estimate** of the share) | about 3% | about 30%, more if chat is heavy | beyond 100x | every notification (a chat message also rings the phone) calls `dynamic-handler`; the load report puts the limit at about 800 daily users with 20 notifications each |
| 7 | **Cloudflare Worker requests** (100,000 a day) | unknown (not measured) | **estimate** under 20% | over | about 5,000 Home views a day (load report) | the Worker runs first for every page, picture, video and song (`run_worker_first` in `wrangler.jsonc`); `/assets/*` and the big game folders skip it |
| 8 | **Auth and notification emails** | unknown plan | | | see below | all emails go out through Resend from `recover-account` / `dynamic-handler` (sign-up code, welcome, login approval, receipts, Pro ending). The repo does not say which Resend plan is used. **External fact, verify:** Resend's free plan is limited to about 100 emails a day and 3,000 a month. A sign-up costs about 2 emails (code + welcome), so about 50 new accounts a day |
| 9 | Monthly active users (50,000) | tiny | tiny | about 12% | not a problem | |

Database CPU is not on the usage page but matters: the load test found one function (`my_chats`) taking 32 to 64 s with a 300,000-message shared chat; it was fixed by capping unread counts at 100 (`20261113000001_chat_counts_capped.sql`, run). The other slow shape is the full people list (300 to 335 ms at 5,000 users in the slower test engine).

Where the biggest egress costs come from today (all from the code):
* Home feed: paging is ON live (`VITE_FEED_PAGING=1`, first 40 then 30 per scroll; `src/App.tsx:247`, `feed_posts_page`). Other callers of `feed_posts` still default to 200.
* People list: refreshed at app open, when the tab becomes visible (at most every 45 s) and every 5 minutes while visible (`src/App.tsx:1040 to 1054`), each time up to 300 accounts with their full public card including `followingIds`.
* Heartbeat `touch_in_front` every 15 s while the app is open (`src/services/supabaseApi.ts:3540`): small, but 240 API calls an hour per open app.
* Notifications list returns up to 150 (`my_notifications`), `active_stories` up to 300, `chat_messages` up to 500.
* No limit at all: `list_music_tracks`, `post_comments`, `reel_comments`, `my_chats`.

## 4. Cheapest safe measures, ranked by value and risk

Value = how much headroom it buys. Risk = chance of breaking something visible. Every SQL item is a new migration file (small, `create or replace`, nothing deleted).

| # | Measure | Value | Risk | Exact file(s) |
| --- | --- | --- | --- | --- |
| 1 | **Watch, do not build:** read the Usage page weekly, set the GitHub warning (already daily for database and storage), confirm Cloudflare is on the Workers Free plan | high | none | no file; Section 5 |
| 2 | **Make storage last longer.** Storage is the first wall (about 3x). Look at the admin Storage tab for the biggest files, delete test uploads, keep the 24-hour rule for Daily NOOB and Instants (already in place), and shrink old large pictures. Compression of new uploads exists for video (`src/utils/mediaCompressor.ts`) and is used in the story, video and avatar flows; **check that every image path (post creation, chat) also resizes before upload** | high | low | `src/utils/mediaCompressor.ts`, `src/components/PostCreation/PostCreationModal.tsx`, `src/components/Chat/*` upload code; admin Storage tab already exists |
| 3 | **Per-person storage cap** (the retest note N3 asks for it): refuse uploads once a person has used a fixed amount (for example 50 MB for ordinary accounts). Stops one person eating the 1 GB | high | medium (a visible refusal message is needed) | new migration (a check in the upload policy / registered-file function); message in `src/services/supabaseApi.ts` near line 1777 (`MAX_UPLOAD_BYTES`) |
| 4 | **People list: refresh less.** Raise the periodic refresh from 5 minutes to 15 and the visibility refresh from 45 s to 3 minutes; keep the forced refresh when a person follows someone or opens Explore | medium-high | low (counts can be a few minutes old) | `src/App.tsx` lines 1042 (45,000) and 1054 (`5 * 60 * 1000`) |
| 5 | **People list: lighter rows.** The list gives every person's `followingIds` (who they follow). That is the heaviest part of each row and a privacy topic (Gap A). Use a slimmer row for the list and load follow lists only when a profile is opened. Needs care: Followers lists and "follows you" read these ids today | high | medium-high | new function next to `user_public_json` (`20261114000010_privacy_gaps.sql`); `src/services/supabaseApi.ts` (`fetchUsersStrict` line 1232, `mapUser`); `FollowListPage`, `ProfileView`, chat eligibility |
| 6 | **Cap the unbounded lists:** `list_music_tracks`, `post_comments`, `reel_comments`, `my_chats` get a limit (for example 100 / 50 first, "load more") | medium | low-medium (needs a "more" button for comments) | new migration redefining them (latest definitions: `20260919000004_stories_reels_music.sql`, `20261017000001_settings_hub.sql`, `20260919000005_chat.sql`); UI in the music, post and reel comment screens |
| 7 | **Lower the other defaults:** `feed_posts` default 200 (other callers), `active_stories` 300, `my_notifications` 150 | medium | low | `20260919000002_phase1_auth_profiles_posts.sql`, `20260919000004_stories_reels_music.sql`, `20261105000001_chat_alerts_phone_only.sql` (as redefined latest), callers in `src/services/supabaseApi.ts` (`fetchPosts` line 1346) |
| 8 | **Stop the 15 s heartbeat when nothing changed** and make it 30 s | low-medium | low | `src/services/supabaseApi.ts:3540` (`startInFrontHeartbeat`); the database forgets after 25 s (`20261105000003`), so keep it under 25 s or widen that window |
| 9 | **Index to add (only one is missing).** I ran `scripts/audit-indexes.mjs` on the full migration set: 272 foreign keys, **1 without an index: `sealed_media.chat_id`**. The 6 indexes named in the load report (family_rooms, family_sealed, scratch_*) **already exist** (`20261113000001_chat_counts_capped.sql`), and the main ones exist too: `messages_chat_created_idx`, `notifications_target_idx`, `posts_created_idx`, `posts_created_id_idx`, `follows_followee_idx` (primary key covers follower), `chat_members_user_idx`, `profile_hides_hidden_idx`, foreign-key set `20261027000008_foreign_key_indexes.sql`. No trigram index exists, and none is needed under the 300-row search cap | low | very low | new migration for `sealed_media (chat_id)` |
| 10 | **Retention of growing tables.** Already purged: `site_visits` (90 days, bots 30), `client_errors` (30 days), `api_rate_limits` (3 days), instants (24 h). Never purged: `notifications` (delete the very old read ones), `messages`, the points ledger. Decide a rule with the owner first (data safety is the top priority; never delete chats or the ledger without a backup) | medium (database size) | medium | new migration; precedent `20261114000009_privacy_hardening.sql` lines 165 to 173 |
| 11 | **Caching headers.** Media (`/m/`) is already `immutable`, 1 year, 90 days in the Worker cache (`worker/index.js:37`, `KEEP_SECONDS`); hashed `/assets/*` skip the Worker. Possible extra: add other static root files to the `run_worker_first` exclusions to save Worker requests | low | low | `wrangler.jsonc` (`run_worker_first` list), `public/_headers` |
| 12 | **Media off Supabase.** If storage stays the wall, Cloudflare R2 is the usual free destination (**external fact, verify the free allowance and card requirement before relying on it**). This is a large change and a data-safety risk: do it only with a verified copy | high | high | `worker/index.js`, `src/services/supabase.ts` (`resolveMedia`), `scripts/backup-supabase.mjs` |

Suggested order: 1, 2, 4, 9, 3, 6, 7, 5, 10, 8, 11. Items 12 and 5 are "when needed" items.

## 5. Monitoring checklist (owner, takes about 10 minutes a week)

### Supabase dashboard (project abffssydapumuhwgzeck)
Billing or Settings > Usage (the exact menu name varies):
- [ ] Egress (uncached) for the current cycle: act at 60%, alarm at 80% of 5 GB.
- [ ] **Cached Egress** for the current cycle: this was the metric that stopped the project in October. Compare against the previous week.
- [ ] Database size (limit 500 MB). The daily GitHub check opens "Supabase free limit warning" at 80%; also look yourself.
- [ ] Storage size and file count (limit 1 GB).
- [ ] Realtime: peak concurrent connections (limit 200) and message count.
- [ ] Edge Functions: invocations this month (limit 500,000), per function (`dynamic-handler`, `recover-account`, `moderator`).
- [ ] Monthly active users.
- [ ] The date the quota resets (the 5th) and any "Urgent action" email.
Reports and logs:
- [ ] Reports > API: error rate, slowest requests (a rise in `my_chats`, `feed_posts_page`, `search_users` timings).
- [ ] Database > Query Performance: top queries by total time.
- [ ] Advisors: Performance and Security lists (should stay empty or known).
- [ ] Logs > Edge Functions: errors of `dynamic-handler` and `recover-account` (a failing email shows up here).

### Cloudflare dashboard
- [ ] Workers & Pages > n00b > Metrics: requests per day (free limit 100,000), errors, CPU time. Alarm at 60,000 a day.
- [ ] Workers & Pages > Plans: confirm "Free" (the load report could not tell).
- [ ] Workers & Pages > n00b > Logs: look for JSON lines with `origin: whole`, `fill` or `piece` = files fetched from Supabase (these cost Cached Egress); the same files repeated mean the cache is not holding.
- [ ] Analytics > Traffic: unusual spikes, bot share. Security > Events: blocked requests, Turnstile.
- [ ] Build status of the last deployment (Workers Builds: n00b).

### Other
- [ ] Resend dashboard: emails sent today and this month against the plan; bounces.
- [ ] GitHub: Actions runs (weekly Backup Supabase, monthly with media, daily usage alert) green; no open "Supabase free limit warning" issue.
- [ ] The admin panel "User's data" and Storage tabs: new accounts per week, biggest files.

### When to act
| Signal | Action |
| --- | --- |
| Storage over 60% | run measures 2 and 3 before anything else |
| Egress or Cached Egress over 60% before the 20th of the cycle | measures 4, 5, 7, read the Worker logs for the repeated files |
| Database over 60% | measure 10 (after a verified backup), look at the biggest tables in the usage alert |
| Realtime peak over 120 | plan a lighter chat listener (listen only while the chat screen is open) |
| Edge function calls over 300,000 | review which notifications really need a push |
| Worker requests over 60,000 a day | measure 11; check bots in Analytics |
| Resend over 70 a day | slow down sign-up emails or move to another free sender |

## 6. What I could not find

Daily active users, Worker requests per day, the current Cached Egress, the Resend plan and the real live database growth rate are not in the repo. The weekly checklist above fills these in; update Section 1 when you have them and the ranking in Section 3 can be redone with real slopes instead of straight lines.
