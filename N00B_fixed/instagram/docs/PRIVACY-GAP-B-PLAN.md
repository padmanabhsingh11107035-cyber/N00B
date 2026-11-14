# Privacy Gap B: staged plan (2026-11-14)

Status UPDATE 2026-11-14 (later): stages 0 to 4 are written and tested (migrations 20261114000020 to 24, harness, live-check SQL) and stage 5 is written as hand-run files, NOT registered; see `docs/PRIVACY-GAP-B-LIVE-CHECK.md` for what was built and the exact order. Decisions D1 to D3 were taken by the owner (nothing blanked, search unchanged).
Original status: PLAN ONLY. Nothing was changed: no migration written, no app code touched, no live service touched, no git state changed.
Everything below was read from the repository (242 files in `supabase/migrations`, `src/`, `supabase/functions/`, `worker/`, `scripts/`). The one local run was `node --liftoff-only scripts/audit-indexes.mjs` on a throwaway in-memory database.
Start from `docs/PRIVACY-HARDENING-2026-11-14.md` ("Gaps closed") and `docs/SECURITY-AND-LOAD-REPORT.md`.

## 1. The gap in one paragraph

Any signed-in person who talks to the API directly (not through the app) can run `select username, display_name, avatar, bio, followers_count ... from profiles`. The table rule `profiles_select` is `using (true)` (`20260919000001_core_schema.sql:661`). So they can:
* read the basic fields of an account that **hid from them** (`profile_hides`) or that is **suspended**;
* list every account, with no 300-row cap (the app's own people list, `search_users`, is capped at 300 and skips hidden accounts).

The sensitive columns (city, extra, privacy_settings, noob_points, is_suspended, Pro and shop fields) are already closed (migrations 20261022000005 and 20261114000009). Gap B is only the "basic public card".

## 2. What the inventory found (exact numbers)

How it was counted: for each function name plus argument list I took its **latest** definition across all 242 migrations (991 definitions), plus `alter function` lines (only one exists: `get_my_user() security definer`, 20261022000005).

| What | Count |
| --- | --- |
| Migration files that mention `profiles` | 178 of 242 |
| Latest function definitions | 991 |
| ... that read the `profiles` table | 301 |
| ... of those, `security definer` (run with the owner's rights, a row rule does NOT apply) | 284 |
| ... of those, **invoker** (run with the caller's rights, a row rule WOULD apply) | **17** |
| Policies (146 in total) that read `profiles` | 0 (only the 3 policies ON `profiles`) |
| Views | 0 |
| Triggers (75) that call one of the 17 | 0 |
| Realtime channels on `profiles` in the app | 0 (the app listens to notifications, messages, chat_members, message_hides, device_sessions, live and room tables) |
| App reads of the table `profiles` (`src/**`) | 2, both of the person's OWN row: `src/services/supabaseApi.ts:1128` (old fallback of the suspension check) and `:3370` |
| Edge function reads of `profiles` | 3 in `recover-account` (service key, unaffected) |

So the earlier worry ("159 migration files' worth of functions") is much smaller in practice: **17 functions** read the table with the caller's rights, and only **24 functions** can actually run as the caller and reach them (5 called directly by the app, 19 entry points). The other 284 readers run as the owner and ignore any row rule.

### 2.1 The 17 invoker functions (latest definition, how they are reached)

| # | Function (latest file) | Reads profiles for | Reached as the caller by |
| --- | --- | --- | --- |
| 1 | `search_users` (20261022000005) | where-clause on username, display_name, **bio**; the id list | app RPC (`supabaseApi.ts:1232`) |
| 2 | `user_by_id` (20261022000005) | one row by id | app RPC |
| 3 | `mutual_followers` (20260923000032) | names of mutual follows | app RPC |
| 4 | `post_likers` (20261022000005) | join to get liker ids | app RPC |
| 5 | `reel_likers` (20261022000005) | join to get liker ids | app RPC |
| 6 | `post_json` (20261007000013) | author name, avatar, badge, live avatar | `feed_posts`, `feed_posts_page`, `liked_posts`, `saved_posts`, `archived_posts`, `feed_video_up_next`, `user_feed_videos`, `pinned_feed_items` (8); also 9 definer callers |
| 7 | `reel_json` (20260930000003) | author card | `feed_reels`, `reel_history`, `pinned_feed_items` (3); 8 definer callers |
| 8 | `story_json` (20260928000002) | author card + names of story commenters (2 reads) | `active_stories` (1); 6 definer callers |
| 9 | `music_json` (20260919000004) | uploader name, avatar | `list_music_tracks` (1); 3 definer callers |
| 10 | `long_video_json` (20261020000004) | author card | `feed_long_videos`, `saved_long_videos`, `get_long_video`, `liked_long_videos`, `fetch_long_video_playlist_items`, `user_long_videos`, `pinned_feed_items` (7); 5 definer callers |
| 11 | `message_json` (20261017000001) | sender name, avatar, badge (left join) | `chat_json` (1); 5 definer callers (`chat_messages` etc.) |
| 12 | `chat_json` (20261113000001) | only the id of the admin account named noob (line 11) | `my_chats` (1); 8 definer callers |
| 13 | `user_public_json` (20261114000010) | `profiles q` to see whether a followed account is private | only definer callers (`user_public_json_by_id`, `get_my_user`, 4 more) |
| 14 | `comment_json` (20261010000008) | author + reply-to name | only 6 definer callers (`post_comments`, `add_comment`, `reel_comments`, ...) |
| 15 | `team_application_json` (20260924000038) | applicant + reviewer name | only 3 definer callers (admin) |
| 16 | `sparkx_application_json` (20260925000043) | applicant + reviewer name | only 3 definer callers (admin) |
| 17 | `story_poll_json` (20260927000001) | voters' usernames (owner only) | only 2 definer callers |

The 19 entry points (invoker, they call #6 to #12 as the caller): feed_posts, feed_posts_page, liked_posts, saved_posts, archived_posts, feed_video_up_next, user_feed_videos, pinned_feed_items, feed_reels, reel_history, active_stories, list_music_tracks, my_chats, feed_long_videos, saved_long_videos, get_long_video, liked_long_videos, fetch_long_video_playlist_items, user_long_videos.

Important correction to the earlier note: `comment_json`, the notification builders (`my_notifications`) and `chat_messages` are **not** reached as the caller. Their entry points are `security definer`. What really breaks with a plain row rule is posts, reels, stories, music, long videos, `my_chats` (last-message sender), the likers lists, search and "Followed by". Hidden accounts' posts are already filtered out by `can_view_author`, so the visible damage would be: a hidden or suspended person's name/avatar in a liked/saved/pinned post, in the last message of a chat, in a "who liked" list, and (for search) a hidden account's bio matching the search.

Functions that take a `profiles` **row as an argument** (`user_list_json`, `instant_sender_json`, `admin_user_view`) do not read the table; they are fine.

### 2.2 Things outside the database

* `src`: nothing else touches `profiles` (no embedded `profiles(...)` selects).
* Manual scripts that will see a different answer once the rule changes: `scripts/live-check-phase4.mjs:163` (reads another person's row), `scripts/verify-supabase.mjs:92` (expects an ordinary user to see ALL profile cards; this is exactly the behaviour we are removing), `scripts/supabase/test-privacy-gaps.mjs` section 4 (pins the gap as "unchanged"; it must be flipped on purpose). `scripts/supabase/supabase-adapter.mjs:47` reads the counters with whatever key the migration run uses (check: if it is the service key it is unaffected).
* Live may differ from the repo. Migration `20261114000006` (it redefines `is_hidden_from_me`) was recorded as not run at one point; Stage 4 below checks the real live function list before anything is switched on.

## 3. The design in one idea

Do **not** make the 17 big functions `security definer`. That would also lift the row rules on everything else they read (likes, comments, story views, chat members, follows) and could leak more than it fixes (for example `mutual_followers` would list the mutual follows of a private account, undoing the follow-table protection from migration 20261114000009).

Instead, change only the **profile read** inside each function, and leave the function itself as it is:

1. Add two tiny `security definer` helpers (fixed `search_path`, `stable`, execute for `authenticated` only, no anonymous access):
   * `profile_brief(uuid)`: returns only username, display_name, avatar, is_verified, is_live_avatar, live_avatar_video_url, bio (nothing sensitive), with **no hidden/suspended filter** (exactly what the builders show today).
   * `profile_row_visible(uuid)`: "may the caller read this row directly": own row, or administrator, or (not hidden from the caller and not suspended). It can also read one switch (a row in `internal_config`, default OFF) so the rule can be turned off with one UPDATE, no schema change.
2. Each of the 13 functions that need a profile card (#1 to #12 plus #14) gets its `from public.profiles ...` replaced by the helper. Their output is byte-for-byte the same.
3. Only then replace the table rule. Nothing that runs as the caller reads the table any more, so the rule can be strict.

Why a definer helper is safe: it returns six harmless card fields and nothing else, it does the one thing the builders already did, and it needs a uuid. What each caller still has to filter itself is unchanged (posts: `can_view_author` and the `posts` row rule; chats: membership; likers: `post_likes` row rule; search: `not is_hidden_from_me(id)`; user_by_id: `not is_hidden_from_me(id)`; mutual_followers: its own `follows` rows, still read with the caller's rights).

Honest limit of this design: because the builders must keep showing the author's name for content the reader may see, `profile_brief` can be called with any uuid it is given (also by forging the row argument of a builder). So a person who **already knows** a hidden or suspended account's id can still get its card. What the plan closes is **finding and listing** such accounts. Closing the known-id lookup needs a product decision (Section 8, D2).

## 4. Stages

Rule for every stage: one migration file per stage, `create or replace` or additive only, safe to run twice, nothing deleted, data untouched. Every stage has a PGlite before/after test and a rollback that is one statement or one file. Never run two stages in the same sitting; look at the live app between stages.

| Stage | What | Changes behaviour? | Exposure left afterwards |
| --- | --- | --- | --- |
| 0 | Test harness and baseline (no database change) | no | Gap B fully open |
| 1 | Add the two helpers (new functions only) | no | Gap B fully open |
| 2a | Re-point the 6 direct-RPC functions | no (answers identical) | fully open |
| 2b | Re-point the 7 builders and `chat_json` | no (answers identical) | fully open |
| 3 | Scripts and the audit (no database change) | no | fully open |
| 4 | Live drift check (read-only query, you run it) | no | fully open |
| 5 | Switch the row rule on, variant 1 (hidden and suspended rows only), behind the OFF/ON switch | yes, only for direct API reads | Hidden and suspended rows closed. Still readable: everyone else's card, whole list, uncapped |
| 6 | Row rule variant 2 (own row only, plus administrator) | yes, direct API reads | Nothing readable straight from the table except your own row. Left: known-id lookups through `profile_brief` and forged builder rows; `search_users('')` (up to 300, by design) |
| 7 | Product decisions (optional) | yes | see Section 8 |

### Stage 0. Harness and baseline (no database change)
* New script `scripts/supabase/test-privacy-gap-b.mjs` (written later, not now), same pattern as `test-privacy-hardening.mjs`: `createTestDb({ upTo: '20261114000010_privacy_gaps.sql' })`, nine readers (the existing fixture: ann the reader, bob public, cat private followed, cyd private not followed, dan suspended, eve hid from ann, fay, gus, admin noob).
* Add fixtures the old tests do not have: a post, reel, story (with a comment from a hidden person), music track, long video and a comment from each of dan and eve; a DM and a group where the last message is from eve and from dan; a post liked by eve and dan; a saved post by eve; a pinned item; likers lists.
* The snapshot calls all 24 caller-rights functions (5 direct, 19 entry points) plus `chat_messages`, `post_comments`, `my_notifications` for every reader and stores the JSON.
* Record the baseline once. Effort: 1 day.

### Stage 1. Helpers (new functions only)
* Adds `profile_brief`, `profile_row_visible` and the OFF switch row. No existing function is touched.
* Test: calling the helpers as each reader gives the expected answers; `scripts/security-audit-db.mjs` still passes (definer with fixed `search_path`, not open to visitors); the baseline snapshot is unchanged.
* Rollback: `drop function` the two helpers (nothing uses them yet) and delete the switch row.
* Effort: 0.5 day.

### Stage 2a. Direct-RPC functions (6)
`search_users`, `user_by_id`, `mutual_followers`, `post_likers`, `reel_likers`, `user_public_json`.
* `search_users`: the id list and where-clause on username, display_name, bio move into a definer helper (or the function becomes definer: safe because it already filters `not is_hidden_from_me(id)` itself, reads nothing else, and calls only definer helpers). Keep the order, the 300 limit and the pin logic exactly. Decision D1 (suspended accounts) is NOT taken here: the answer must stay identical, suspended accounts included.
* `user_by_id`: same (filters `not is_hidden_from_me` itself).
* `mutual_followers`: stays invoker (so the `follows` rule from 20261114000009 keeps applying); only the name join uses the helper.
* `post_likers`, `reel_likers`: take the user ids straight from `post_likes` / `reel_likes` (the join to `profiles` goes away); the existing `user_list_json_by_id` (definer) already builds the entry. If the join stayed, a hidden liker would silently vanish from the list once the rule is on.
* `user_public_json`: the inner `profiles q` check ("is this followed account private") moves to a definer helper, otherwise a hidden private account would stop being left out of `followingIds` (a leak of Gap A's rule).
* Test: baseline snapshot of the 5 RPCs for 9 readers equals the after snapshot (bytes). Effort: 1 day.
* Rollback: run the previous definition of each function (files in the table of Section 2.1) in one transaction. Keep a ready-made rollback file extracted from the current definitions before the stage runs.

### Stage 2b. Builders (7) and `chat_json`
`post_json`, `reel_json`, `story_json` (two reads), `music_json`, `long_video_json`, `message_json`, `chat_json` (replace the admin lookup with the existing `noob_admin_id()`), plus for consistency `comment_json`, `team_application_json`, `sparkx_application_json`, `story_poll_json` (these four only run under definer callers today, so this part is optional; do it so a forged call cannot behave differently).
* Output stays identical, including `null` where the author row does not exist (the old `from profiles a where a.id = ...` returned no row; the helper must also return no row).
* Do it in 3 small migrations (post/reel/long-video, story/music, chat/message/comment) so a problem is easy to find.
* Test: the full Stage-0 snapshot (all 24 functions plus the definer entry points) is byte-identical for 9 readers. Effort: 2 days including test debugging.
* Rollback: previous definitions, same as 2a.

### Stage 3. Scripts and audit (no database change)
* Update `scripts/live-check-phase4.mjs:163`, `scripts/verify-supabase.mjs:92`, `test-privacy-gaps.mjs` section 4 (the check "a hidden account's username is still readable" must become "not readable").
* `scripts/security-audit-db.mjs`: add a check that no policy on `profiles` is `using (true)`, and that no invoker function outside an allow-list reads `profiles` (the 17 minus the ones moved). Guard registration in `scripts/guard.mjs`.
* Effort: 0.5 day.

### Stage 4. Live drift check (read-only, one query, run by the owner in the SQL editor)
Because live may not have every repo migration, compare live to this inventory first. The query only reads the catalog:
`select p.proname, p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosrc ilike '%profiles%' and not p.prosecdef order by 1;`
Expected after Stages 1 to 2: **none of the 17 reading the table directly** (they only use the helpers). Before Stage 2 expect exactly the 17 names. Also read `select policyname, cmd, qual from pg_policies where tablename = 'profiles';` (expect the 3 policies of Section 2). Any extra name = stop and read it before Stage 5.

### Stage 5. Row rule, variant 1, behind the switch
* Replace `profiles_select` (`using (true)`) by one rule: own row, or administrator, or `profile_row_visible(id)`. The helper returns true when the switch is OFF, so running the migration changes nothing; the owner then flips the switch to ON in a separate step and watches.
* The update rules (`profiles_update`, `profiles_admin_update`) are separate and untouched; foreign-key checks and triggers that run as the owner ignore the rule.
* Test (PGlite, tests both switch states):
  * switch OFF: all 24 functions plus direct table reads equal the baseline;
  * switch ON: a direct `select` as ann returns bob, cat, cyd, fay, gus, ann, admin, and NOT eve (hid from ann) and NOT dan (suspended); as admin returns all; as eve and dan returns their own row; all 24 caller-rights functions still equal the baseline (this is the proof that Stages 2a/2b were complete);
  * writes: own profile update with `returning` works; admin update works; sign-up trigger creates a profile; follow and unfollow still change counters; account deletion cleanup still runs; hiding and un-hiding a person flips direct visibility immediately.
* Rollback, fastest first: set the switch OFF (one UPDATE, answers return to today's); or recreate `profiles_select using (true)` (one statement).
* Live check after switching ON (use two real test accounts, never real users): the Home feed, a hidden test account's old comment, the last message of a chat, "who liked", search, "Followed by", a profile of a suspended test account ("This account has been suspended" still shows because `is_account_suspended` is definer). Watch the `client_errors` table and Cloudflare logs for a day.
* Effort: 1 day plus the live watch.

### Stage 6. Variant 2, own row only
After a week of Stage 5 with no errors: the rule becomes "own row, or administrator". Possible only because Stages 2 and 3 removed every caller-rights reader, which the Stage 4 query and the Stage 0 snapshot prove. Closes the enumeration part of the gap (nobody can list profiles through the table any more; the 300-row `search_users` stays the only list, as designed).
* Test: same as Stage 5 plus: a direct select as ann returns only ann.
* Rollback: back to the Stage 5 rule or the switch OFF.
* Effort: 0.5 day. Skip this stage if any doubt remains; Stage 5 already closes the hidden and suspended rows.

## 5. Order, in short
0 (tests) then 1 (helpers) then 2a then 2b (each followed by the equality test and one day of live use) then 3 (scripts) then 4 (live drift check) then 5 (rule behind the switch, OFF, then ON) then 6. Either order of SQL and app is safe because the app does not change at all in this plan.

## 6. Effort estimate

| Stage | Work | Estimate (mine, not measured) |
| --- | --- | --- |
| 0 harness + baseline | one new test script, fixtures | 1 day |
| 1 helpers | one small migration + test | 0.5 day |
| 2a | 6 functions | 1 day |
| 2b | 7 to 11 functions, 3 migrations | 2 days |
| 3 scripts and audit | 3 scripts + audit check | 0.5 day |
| 4 live drift check | owner runs two queries | 0.25 day |
| 5 rule behind the switch | migration + test + live watch | 1 day + 1 day watching |
| 6 variant 2 | one policy change | 0.5 day |
| Total | | about 7 working days plus 2 days of watching live |

The full suite takes 25+ minutes, so run only `test-privacy-gap-b.mjs`, `test-privacy-hardening.mjs`, `test-privacy-gaps.mjs`, `scripts/security-audit-db.mjs`, `tsc` and the build before each push (as the owner prefers); run the whole suite once in the background before Stage 5.

## 7. Risks and how the plan answers them

| Risk | Answer |
| --- | --- |
| A function that reads `profiles` was missed | Stage 4 queries the live catalog; Stage 0 snapshots 24 functions plus the definer entry points; the switch is OFF when first deployed |
| Result differs in a corner (a deleted author, a missing row) | Fixtures include an author with no profile row; helper returns no row, same as before |
| Slower queries | After Stage 2 nothing scans `profiles` as the caller except own-row reads; the rule costs nothing for them. Helper is one indexed lookup per row; `search_users` stays at 300 rows (PGlite measured 82 to 91 ms for a search and 300 to 335 ms for the full list with 5,000 users, in the load report) |
| Policy rule breaks sign-up or counters | Triggers and sign-up run as the owner; Stage 5 test covers them |
| Data loss | None possible: no step deletes, updates or rewrites a row |
| An old app tab calls an old path | The app is not changed by this plan |

## 8. Decisions only the owner can take (optional Stage 7)

* D1. Should suspended accounts still appear in `search_users` and `user_by_id`? Today they do (`is_hidden_from_me` does not test `is_suspended`; the profile page shows "This account has been suspended"). Hiding them changes what people see, so it is not part of the equality stages.
* D2. Should `profile_brief` return nothing for a suspended or hidden account when the content is old (comment, chat)? That would show a blank name in old chats. It would close the known-id lookup. Needs a product answer (for example show "NOOB user").
* D3. `search_users('')` returns the newest 300 accounts to everybody by design. Require 2 characters or add a rate limit if you want to slow list-scraping.

## 9. What is exposed after each stage (plain words)

| After | A signed-in person using the API directly can still... |
| --- | --- |
| today to Stage 4 | list every account, including hidden and suspended ones, with name, bio, avatar and counters |
| Stage 5 | list every account except those hidden from them and suspended ones |
| Stage 6 | read only their own row from the table; get up to 300 newest, non-hidden accounts from `search_users`; get a card by id for an id they already know (also a hidden or suspended one, until D2) |

## 10. Files this plan will touch later

New: `supabase/migrations/<stage files>`, `scripts/supabase/test-privacy-gap-b.mjs`. Edited: `scripts/live-check-phase4.mjs`, `scripts/verify-supabase.mjs`, `scripts/supabase/test-privacy-gaps.mjs`, `scripts/security-audit-db.mjs`, `scripts/guard.mjs`, `docs/PRIVACY-HARDENING-2026-11-14.md`. App code: none.
