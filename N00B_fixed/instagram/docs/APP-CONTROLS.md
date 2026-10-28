# What costs what in NOOB, and where each thing is switched off

Admin Control Panel → **Pages** (main administrator only). One switch per page. A switched-off page disappears for everybody except the main administrator, and from migration `20261029000002_feature_guards.sql` on the **database refuses the new work too** (an old tab or an old Android app can not keep using it). Nothing is deleted: switching it on again brings everything back.

| Page (key) | What it costs | Screen | Server |
| --- | --- | --- | --- |
| Go Live & live streams (`live`) | live-call minutes (Agora), a list asked every 15 s, comments | hidden (Create sheet, live bar, Videos) | new streams / comments / gifts refused, **no call token** |
| Live Lounge / Meetings (`lounge`) | call minutes, room chat | hidden | new rooms / meetings / chat refused, **no call token** |
| NOOB Rooms (`rooms`) | call minutes, room chat | hidden | new rooms / chat / joins refused, **no call token** |
| Voice calls in chat (`calls`) | the other person's rings and the call (peer to peer; only small signals through the database) | call button, calls list, incoming rings hidden | screen only (nothing is stored when a call starts) |
| Chat (`chat`) | messages, "typing" asked every 1.5 s while a chat is open and visible | hidden | screen only |
| Games (`games`) | tables of 2+ players and the waiting line are asked every few seconds | hidden | new tables and waiting-line entries refused |
| NOOB Forms (`forms`) | form uploads, web hooks, answers from visitors without an account | hidden | new forms and **new answers (also from visitors)** refused |
| Public Polls / This or That / Ask Me Anything / Mood (`fun-*`) | small rows | hidden | new polls, votes, questions, moods refused |
| Guess the Song (`song`), Anonymous Messages (`anonymous`), Shop NOOB (`shop`), Suggestion Box (`suggestions`) | small rows | hidden | new answers / messages / orders / suggestions refused |
| Reels, Feed, Explore, Create, Music, Studio, Draw, Daily, NOOB AI, Our Team, Cold Drinks, Creations, Support | reading posts and pictures; every picture, video and song goes through the cached `/m/` address (see `worker/index.js`) | hidden | screen only (they only read) |

Other controls that already exist:
- **NOOB Study** has its own switch and daily AI limits (`study_settings`, `study_ai_limits`).
- **Ads** have per-page switches in Admin → Ads.
- **Media traffic from Supabase Storage**: the Worker keeps one copy of each file in the data centre (90 days) and logs every fetch from Supabase (Cloudflare → Workers → n00b → Logs). A safety net in the app (`utils/mediaGuard.ts`) and in the service worker turns any direct Supabase storage address into the cached one.
- **Maintenance**: the Platform tab can put the whole app under maintenance.

Not switchable on their own yet: the read side of posts / reels / explore (they only read), and Chat messages on the server (switching Chat off hides it; the messages table is not guarded because the app itself writes system messages there).

## NOOB Safety - the AI moderator (Admin Control Panel -> Moderator, main administrator only)

Not visible to normal people. It judges only what is PUBLISHED: posts and reels (caption + first pictures), comments and replies, bio and display name. Chats, group chats, calls, anonymous messages, rooms and drafts are never read (no trigger exists on those tables).

- Flow: a trigger writes a job (`moderation_jobs`) and asks the Edge Function `moderator` through pg_net -> Groq gives a verdict -> `mod_apply()` enforces it in SQL -> in-app notice (realtime) + e-mail. Every 5 minutes `retry_moderation()` asks again for anything unfinished (AI or e-mail down); nobody is punished because the AI was down.
- Modes: **Off**, **Watch only** (default: judges and logs, touches nothing, tells nobody), **Enforce**.
- Actions: a bad word in a comment / caption / bio / name -> only the word is removed; a severe comment -> deleted; a severe post / reel (or a picture that breaks the rules) -> the whole post / reel is deleted. Every enforced action is a warning; at N warnings in D days (default 3 in 30) the account is suspended with the reason logged (`profile_private.suspended_reason`). A critical violation suspends at once.
- Not sure (below the confidence setting, default 85%): nothing is touched; from 60% it appears in the log as "Needs a look".
- The administrator can withdraw a warning (the person is told), suspend / restore from the log, and try the AI on any text or picture address without saving anything.
- Never judged: the administrator, accounts marked admin, AI accounts.
- Costs: one Groq call per published item (keys `GROQ_API_KEY` … `_6` are rotated); pictures are fetched by the AI through the cached `/m/` address, so Supabase storage is not charged again. Switch to Off to stop all of it.
- Also watched (migration 20261030000002): stories (picture + the words on it; removed whole), NOOB Videos (title, description, thumbnail), Daily NOOB entries, public polls, live-stream comments, NOOB Rooms chat, the profile status note.
- Not covered: the video files themselves (only thumbnails and text), usernames, anything private.
