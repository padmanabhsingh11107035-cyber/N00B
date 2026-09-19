# NOOB → Supabase migration plan

Branch: `supabase-migration`. `main` (the Express + MongoDB app) is untouched and stays deployable until the
Supabase version is proven, so there is always a working fallback.

## Goal

Run NOOB without an Express server: a static frontend talking straight to Supabase (Postgres + Auth + Realtime),
plus a few small Edge Functions for the things a browser must not do itself. Same features, same design.

## Decisions made (change any of these before Phase 1 if you disagree)

| Topic | Decision | Why |
|---|---|---|
| Login | Supabase Auth, but every account's Auth email is a synthetic `<uuid>@users.nooob.xyz`; the real email lives privately in `profile_private` | The old app logs in by username **or** email, allows one email on many accounts (the owner's own accounts), and never sent email. This keeps all three working and never exposes real emails. |
| Passwords | Imported through the Auth admin API, so everyone keeps their current password; Supabase stores only a hash | Old DB held plaintext. Nobody has to reset anything. |
| IDs | Deterministic UUIDs (UUID v5 of the old id); old ids kept in `legacy_id` | Re-runnable, traceable. |
| Counters | Followers / following / posts / likes / comments / saves are maintained by database triggers | They can't drift (two accounts had drifted counters in the old data) and can't be edited by users. |
| Private accounts | Enforced by the database (only approved followers see a private account's posts/reels) | Old server only used privacy for follow requests. This is a small, deliberate tightening — say so if you'd rather match the old behaviour exactly. |
| Points / games / wallet | Read-only for clients; all writes will go through server-side functions | So nobody can grant themselves points. |
| Media | Stored as text keys; which store holds the bytes (B2 vs Supabase Storage) is still open — total media is only ~12 MB | Free tier's 1 GB storage would already fit it. |

## Done in Phase 0 (this branch)

* `supabase/migrations/20260919000001_core_schema.sql` — 27 tables, 62 row-level-security policies, counter triggers,
  protected-column guards, login helper functions.
* `scripts/supabase/transform.mjs` — backup → rows. Nothing silently dropped (unmapped fields go to `extra`).
* `scripts/supabase/run-import.mjs` + `supabase-adapter.mjs` + `scripts/import-to-supabase.mjs` — the import
  (dry-run by default; insert-only; refuses to run on a non-empty project; verifies counts and counters).
* `scripts/supabase/test-import.mjs` (`npm run test:supabase`) — runs everything against a real Postgres (PGlite)
  using your real backup: 72 checks covering data accuracy, re-run safety, and the privacy rules.

## What replaces what

The old server has 134 routes. Grouped by how each becomes Supabase:

| Old route group (count) | Becomes |
|---|---|
| auth (5), users (17) | Supabase Auth + `profiles` / `profile_private` (RLS) + RPC for search, contact match, account deletion |
| posts (19), reels (11), stories (6), collections (2) | Tables + RLS; like/save/comment = plain inserts (triggers keep counts); feeds = queries/RPC |
| chats (18), notifications (3) | Tables + RLS + **Realtime** (replaces the 5-second polling — a big bandwidth win); notifications created by database triggers |
| games (12), scratch-cards, wallet, coupons (4), shop/store (5), support (3), music (4), stickers (3) | Postgres functions (`security definer`) for anything that moves points/money; plain tables for the rest |
| admin (7), report(s) (2), settings (2) | RLS with `is_admin()` + a few RPCs |
| upload (2), media signing | Edge Function (signs B2 URLs) — or Supabase Storage |
| push (3) | Edge Function + `push_subscriptions` (VAPID keys become Edge Function secrets) |
| AI support / voice / translate | Edge Function calling Groq (key in secrets) |
| live game rooms, matchmaking, chess, typing | Supabase Realtime (broadcast/presence) + tables |

## Phases (each ends with everything tested; you confirm before the next)

0. **Data & schema** — done, tested locally. Needs your Supabase project to run for real.
1. **Auth + profiles + follows + feed** (posts, reels, comments, likes, saves) — client `src/services/api.ts` gets a Supabase
   implementation behind the same function names so screens don't change.
2. **Chats + notifications** on Realtime.
3. **Games, points, shop, coupons, admin** — server-side functions.
4. **Edge Functions** — media signing, push, AI.
5. **Cutover** — fresh backup → import into the real project → static hosting → point `nooob.xyz` → keep the old server for a
   short rollback window.

## Known gaps to close before cutover

* One reel video (`reels/1789473866242-kimulhs.mov`) is missing from the B2 bucket (its thumbnail exists). Being investigated.
* Seven accounts use outside image links (Unsplash/DiceBear) as photos; they'll be copied into our own storage.
* Stories, highlights, music, stickers, shop products, collections, reports are empty in the current data, so their tables
  arrive with their phase (the import warns loudly if a future backup contains any).
* Web-push subscriptions from the old server stay valid only if the same VAPID keys are reused (kept in the raw backup,
  to be moved into Edge Function secrets — never into git).
