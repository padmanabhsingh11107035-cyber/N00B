# Privacy gap B: what was built, the live check, and the exact order for the owner (2026-11-14)

Companion to `docs/PRIVACY-GAP-B-PLAN.md`. Stages 0 to 4 are written and tested; stage 5 is written and tested but deliberately NOT registered. Nothing was committed, pushed or run on anything real.
Owner decisions applied: D1 suspended accounts stay in `search_users` and `user_by_id` exactly as today; D2 old content keeps showing author names (`profile_brief` blanks nothing); D3 `search_users` stays as it is.

## 1. What each file does

| File | Stage | What it does live |
| --- | --- | --- |
| `supabase/migrations/20261114000020_gapb_stage1_profile_helpers.sql` | 1 | Adds four definer helpers (`profile_brief`, `profile_is_private`, `profile_noob_admin_ids`, `profile_row_visible`) and one switch row `internal_config.profiles_row_rule = 'off'`. No existing function uses them yet. Nothing visible. |
| `supabase/migrations/20261114000021_gapb_stage2a_direct_functions.sql` | 2a | `search_users`, `user_by_id`, `mutual_followers`, `post_likers`, `reel_likers`, `user_public_json` read the profile through helpers (plus the helper `profile_search_candidates`). Answers byte-identical. |
| `20261114000022_gapb_stage2b_post_reel_video.sql` | 2b-1 | `post_json`, `reel_json`, `long_video_json`. Identical answers. |
| `20261114000023_gapb_stage2b_story_music.sql` | 2b-2 | `story_json`, `music_json`. Identical answers. |
| `20261114000024_gapb_stage2b_chat_comment_admin.sql` | 2b-3 | `message_json`, `chat_json`, `comment_json`, `team_application_json`, `sparkx_application_json`, `story_poll_json`. Identical answers. |
| `supabase/one-off/rollback-gapb-stage1.sql`, `-stage2a`, `-stage2b1`, `-stage2b2`, `-stage2b3` | rollbacks | Hand-run files that restore the previous definitions exactly (taken from the database as the repository built it). |
| `supabase/one-off/gap-b-live-check.sql` | 4 | Read-only catalog check (section 3). Regenerate with `node --liftoff-only scripts/supabase/make-gap-b-live-check.mjs` if one of those functions ever changes in a later migration. |
| `supabase/one-off/apply-stage5.sql`, `rollback-stage5.sql` | 5 | The row rule on `profiles`, NOT registered (section 4). |
| `scripts/supabase/test-privacy-gap-b.mjs` | 0 to 5 | The PGlite before/after harness (section 5). Registered in `scripts/guard.mjs`. |

Every migration is `create or replace` / `on conflict do nothing`, safe to run twice, and never touches a row of `profiles` or any other table. The one inserted row is the switch (`off`).
Differences from the plan, on purpose: the plan named two helpers; three more were needed so that results stay identical: `profile_is_private` (the "is this followed account private" check inside `user_public_json`), `profile_noob_admin_ids` (`chat_json` looks for the admin account named noob with exactly the old condition; `noob_admin_id()` has a different fallback so it was not reused), `profile_search_candidates` (the id list, where-clause and 300 limit of `search_users`).

## 2. The order the owner runs things (one stage per sitting; look at the live app between)

1. Take the usual database backup first (data safety is the top priority).
2. Run `supabase/one-off/gap-b-live-check.sql` in the SQL editor (read-only). Expect: part 1 "17 found ... BEFORE stage 2"; part 3 rows "BEFORE" or "ok"; part 4 helpers "missing", switch "row missing". If anything says STOP or DIFFERENT, send the result back before going further (live differs from the repository, for example a migration that was never run).
3. Run migration `20261114000020` (the normal way you run migrations). Use the app for a few minutes. Nothing should look different.
4. Run `20261114000021`. Check: search a name on Explore, open someone's profile, open a "who liked" list, open "Followed by" on a profile.
5. Run `20261114000022`, then `20261114000023`, then `20261114000024` (one per sitting if you want to be careful). Check Home feed, Reels, a story, the music list, a chat (last message), Videos.
6. Run `gap-b-live-check.sql` again. Expect part 1 "0 found ... AFTER stage 2", every part 3 row "AFTER" (or "ok"), helpers "ok (closed to visitors)", switch "ok (OFF ...)". Do not continue to stage 5 unless this is exactly so.
7. Use the app normally for at least one day. Watch the `client_errors` table.
8. Only then stage 5 (section 4). Stage 6 (own row only) is not written; it is a later one-line change of the same policy and needs its own decision.

Rollback at any step: the matching `rollback-gapb-*.sql` file, newest stage first (2b3, 2b2, 2b1, 2a, then 1). Never roll back stage 1 or 2 while stage 5 is active (run `rollback-stage5.sql` first).

## 3. The live check (Stage 4): what the answers mean

`gap-b-live-check.sql` is one `select` over the catalog (`pg_proc`, `pg_policies`, `internal_config`). It creates and changes nothing. One result table, column `part`:
* part 1: the functions that run with the caller's rights and mention `profiles`. 17 names = before stage 2 (the list of section 2.1 of the plan), none = after. Anything else: STOP and read the names.
* part 2: the policies on `profiles` (`profiles_select`, `profiles_update`, `profiles_admin_update`; after stage 5 `profiles_select` mentions `profile_row_visible`). An unknown policy: STOP.
* part 3: for 28 functions the md5 of the live source against the repository (before / after the five migrations). `DIFFERENT from the repository` means someone changed it by hand or a migration is missing: STOP. This also catches the case the plan worried about (migration `20261114000006` recorded as not run once).
* part 4: the switch (`off` expected) and whether the helpers are closed to visitors.
The same file is run inside the PGlite test, before and after the migrations, so its verdict words are tested.

## 4. Stage 5 (the real change), written but NOT registered

Files: `supabase/one-off/apply-stage5.sql` and `rollback-stage5.sql`. They are not in `supabase/migrations`, so no automatic run can ever pick them up (the test checks this).
Preconditions: the five migrations applied, live check part 1 = 0 and every part 3 row AFTER, one clean day.
1. Run `apply-stage5.sql` in the SQL editor. It replaces `profiles_select` (using (true)) by `id = auth.uid() or is_admin() or profile_row_visible(id)`. The switch stays `off`, in which state the helper answers true for every row: NOTHING changes for anybody. (Proved: 1,310+ answers identical, every reader still reads all rows.)
2. In a separate sitting, turn it on: `update public.internal_config set value = 'on' where key = 'profiles_row_rule';`
   Effect: a signed-in person using the API directly no longer reads the rows of accounts that hid from them or are suspended; they still read their own row; an administrator reads all. Everything the app shows is unchanged because no function that runs with the caller's rights reads the table any more. Check with two test accounts (never real users): Home feed, an old comment by a hidden test account, the last message of a chat, "who liked", search, "Followed by", the profile of a suspended test account ("This account has been suspended" still shows). Watch `client_errors` and Cloudflare for a day.
3. Back out instantly: `update public.internal_config set value = 'off' where key = 'profiles_row_rule';` (one statement, answers return to today's). Full undo: run `rollback-stage5.sql` (switches off, restores `profiles_select using (true)`).
Still open after stage 5 variant 1 (plan section 9): everyone else's card and the whole list, uncapped; known-id lookups through `profile_brief` and forged builder rows (D2 was decided: old content keeps names).

## 5. The test harness: what it proves

`node --liftoff-only scripts/supabase/test-privacy-gap-b.mjs` (about 2 minutes, in memory, no real service):
* Builds the database from every migration before `20261114000020`, plants a fixed seed (nine readers: ann the reader, bob public, cat private followed, cyd private not followed, dan suspended, eve hid from ann, fay, gus a stranger, noob the admin; a post, reel, story, long video per person, music, comments with replies, story comments and poll votes, likes, saves, pins, playlist, five chats with last messages from eve and dan and a system message, team and Sparkx applications, notifications).
* Records the answers of the 17 caller-rights functions, the 19 entry points, the 5 direct ones and definer neighbours (`get_my_user`, `my_notifications`, `post_comments`, `reel_comments`, `chat_messages`, `user_list_json_by_id`) for every reader: the baseline (about 1,280 answers; `feed_video_up_next` is compared as a set because it orders by `random()`).
* After each migration (applied twice) it compares the whole snapshot with switch OFF and with switch ON. After stage 5 it does the same with the rule in place, plus direct table reads for every reader, writes (own update with returning, admin update, sign-up trigger, follow counters, hide/unhide, suspend/unsuspend, account deletion), then runs `rollback-stage5.sql`, the four stage-2 rollbacks and the stage-1 rollback and compares again, then re-applies all five.
* Catalog scan: 17 readers before, 0 after.
