# Private chat media

Goal: a plain picture, video or voice note in a chat (a file under `chat/` in the `media` bucket) can be opened only by the members of the chat that has it, not by anyone who has the link.
Scope: chat media only (old and new). Posts, reels, stories, avatars and private accounts are not changed. Locked (end-to-end encrypted) attachments, `chat/<name>.sealed`, are not changed either: they are ciphertext and stay public and cached.

Nothing here deletes or re-keys anything until the very last, separate step, and that step has several gates.

## How it works

```
phone  --(Authorization: Bearer <user token>, apikey)-->  Worker  /m/chat/<file>
Worker --(the same token)-->  Supabase REST  can_read_chat_media('chat/<file>')   -> true / false
true   -> the Worker streams the file (public bucket, or the private bucket "chatmedia" in phase B), "Cache-Control: private, no-store", pieces (Range) work
false  -> 404 (same as a missing file)      no/invalid token -> 401      database not reachable -> 503 (fails closed)
```

* `chat_media_index` (migration 1) says which chat and message a file belongs to. It is filled from all existing messages (every stored form: bare key, `/m/`, `/media/`, full address) and, from then on, by a database trigger on every new message, so old app versions that do not know about any of this keep working.
* A file is only indexed for a message whose **sender uploaded it** (so typing somebody else's file name into a message gives no access).
* `can_read_chat_media` is true only for a member of that chat whose message exists, is not "deleted for me" by the person, and is not from before they joined (same rule as message history). Unknown file = false.
* The Worker has no secret and no service key: it asks the database with the caller's own token. It remembers each answer for 60 seconds per token+file (a video asks for many pieces) and never logs tokens.
* The app (`src/services/authedMedia.ts`, `src/components/Chat/ChatMedia.tsx`) downloads a chat file with the token and shows it from an in-memory blob address (released when the picture leaves the screen, cleared at sign-out). It never falls back to a public address for a `chat/` file. The "tap to load / auto-load" chat setting still decides when a file is fetched. Videos are loaded whole (at most 50 MB) before they play.
* Phase B: a private bucket `chatmedia` (no public link at all). The Worker reads it with the caller's token; old files are COPIED there by a script you run.

## Owner steps, in order

1. **Run the inventory** `supabase/one-off/chat-media-inventory.sql` (read only) parts A and B. Note the numbers: plain chat files in storage, and messages that point at a chat file.
2. **Run SQL 1**: `supabase/migrations/20261114000001_chat_media_access.sql` (safe to run twice; adds a table, 4 small functions and 2 triggers; changes no existing row or file). Then run inventory part C: `index_rows` should be about the part-B `messages_with_chat_file` (plus the locked-attachment rows). The second query lists messages left out on purpose (file recorded as uploaded by somebody else than the sender); normally empty.
3. **Deploy the build** (push; Cloudflare builds). `wrangler.jsonc` ships with `CHAT_MEDIA_GATE = "log"`: chat files are still served to everybody exactly as before, and the Worker logs (Cloudflare > Workers > n00b > Logs, search `chatGate`) what it WOULD have refused: `verdict:"no"` (not a member) or `"no-token"` (an app version that does not send the token yet). Nothing breaks in this state.
4. **Test with two accounts** (or one account in two chats): send a photo, a video and a voice note in a non-locked chat; open them on the other account (works); open the same `/m/chat/<file>` address in a private window with no sign-in, or as a third account: after step 5 it must say not found.
5. **Switch the gate on** once the logs show no `no-token` from the current app (give phones a few days to pick up the new version, see "Old clients"): in `wrangler.jsonc` set `"CHAT_MEDIA_GATE": "on"` and push. Check the check-run of the pushed commit, then repeat the test of step 4: a stranger gets 404, a visitor 401. Roll back by setting `"log"` and pushing.
6. **(Optional, phase B: the file itself becomes private)**
   1. Run SQL 2: `supabase/migrations/20261114000002_chat_media_private_bucket.sql` (creates the private bucket `chatmedia`; nothing uses it yet).
   2. Redeploy the edge function `dynamic-handler` (its deletion queue then also removes copies from `chatmedia`; harmless before).
   3. In PowerShell, in the app folder, with the two values set in that window only (never paste them anywhere): `$env:SUPABASE_URL = "https://abffssydapumuhwgzeck.supabase.co"` and `$env:SUPABASE_SERVICE_ROLE_KEY = "..."`, then
      `node scripts/migrate-chat-media.mjs --plan --dir D:\noob-audit\chat-media` (changes nothing; prints counts, bytes and the free-plan room),
      `node scripts/migrate-chat-media.mjs --copy --dir D:\noob-audit\chat-media` (COPIES; resumable; checks size and sha-256 of every copy; refuses to start if it would take storage above 80% of the free 1 GB unless `--force`),
      `node scripts/migrate-chat-media.mjs --verify --dir D:\noob-audit\chat-media`.
   4. Set `"CHAT_MEDIA_PRIVATE_BUCKET": "on"` in `wrangler.jsonc` and push (the Worker now looks in `chatmedia` first, then in the old bucket for anything not copied yet).
   5. Set `VITE_CHAT_PRIVATE_BUCKET=1` as a build variable in Cloudflare (default off) and rebuild: NEW chat uploads go to `chatmedia`. Do this only after 6.4 is live, otherwise new files cannot be found.
7. **Only after a media backup** (docs/BACKUP.md: media is NOT in the weekly backup; copy the `media` bucket first) and a fresh `--verify`: `node scripts/migrate-chat-media.mjs --delete-originals --i-have-a-backup --dry-run --dir ...` shows what would go; without `--dry-run` it deletes only originals whose private copy still matches the verified report, refuses if any message still points at a file that has no private copy, and never touches locked files or the private bucket. Until this step the raw Supabase public address of an OLD file still works for anybody who has it.

## Rollback

* Phase A: set `CHAT_MEDIA_GATE` back to `"log"` (or `"off"`) and push. Chat files are served as before. The index and functions can stay.
* Phase B: set `CHAT_MEDIA_PRIVATE_BUCKET` back to `"off"` (files still in the old bucket keep working; files that only exist in `chatmedia` do not, so do this only before step 6.5, or keep it on); remove the build variable `VITE_CHAT_PRIVATE_BUCKET` and rebuild. Copies in `chatmedia` are never needed to be deleted.
* Step 7 cannot be rolled back except from your media backup. Do not run it without one.

## Free-plan impact

* Storage: phase A none. Phase B copy doubles the chat files until step 7. Storage is about 0.32 GB of 1 GB; the script computes the room from the plan numbers (`usage + files still to copy` must stay under 80% = 819 MB) and refuses otherwise.
* Egress: chat files no longer come from the Worker's shared cache, so every first open on a device downloads the file. The Worker lets Cloudflare keep the *public-bucket* bytes for one day (only reachable after the membership check), and each phone keeps what it downloaded in memory for the session. Watch Dashboard > Usage > Cached Egress for a few days after switching on. The private bucket's reads are not edge-cached.
* The membership check is one small database call per file per minute per person (memoised in the Worker).

## Old clients (what breaks, and the grace switch)

* A client that does not send `Authorization` on `/m/chat/...` gets **401** once the gate is `"on"`: an old app version shows a broken picture / "failed to load" for plain chat media until it reloads the app. In `"log"` it keeps working and the logs count them (`verdict:"no-token"`), so flip to `"on"` only when those stop.
* The Android app (`capacitor.config.json`) loads the live site (`server.url = https://noobsocials.com`), so it runs the new web app as soon as it is opened; it does not embed an old copy of the chat screen, so there is no store release to wait for. The iPhone PWA and browsers pick up the new build on the next load (the service worker uses skipWaiting). Only a tab left open for days, or a phone that has not reloaded, still runs the old code.
* The service worker (`public/sw.js`) never caches `/m/` responses, and `public/_headers` has no rule for `/m/`; the Worker sets `Cache-Control: private, no-store` and bypasses the shared cache for these files.

## Honest limits

* Until step 7 the raw Supabase public address of an old file still opens for anyone who has it (a person who saved the link earlier, or a log that recorded it). The gate protects the website address and, after phase B, the file.
* A link a member copied from their own screen is a blob address that stops working; a member can of course still save or screenshot a file. This is access control, not copy protection.
* Posts, reels, stories and avatars sent into chats as `posts/...` (very old messages that stored a picture under `posts/`) are not chat files and stay public.
* A message whose file was recorded as uploaded by someone other than its sender is left out of the backfill (listed by inventory part C); that file would answer 404 once the gate is on.
* "Delete for me" closes the file for that person on the website address; a deleted message closes it for everyone.
* Administrators are not exempt: an admin who is not in a chat cannot open its files through the Worker (the admin tools show messages, not these files). If a moderation need comes up, add an explicit admin rule to `can_read_chat_media`.
* Videos play after the whole file is downloaded (a blob), not progressively.
* Not verified here against the live project: the Worker running on Cloudflare, the storage policies on the real Supabase Storage, `Range` behaviour through Cloudflare. They are covered by tests with stand-ins; do the two-account test in step 4/5 on the live site.
