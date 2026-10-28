# Guest support (help for people who are not logged in)

The NOOB support character sits at the bottom right of the **login / sign-up screen**. It opens a help chat for someone who cannot log in. The administrator can switch it off with **Admin > Pages > Support** (the same switch as the in-app Support page).

## What the person sees

1. **Email** of the NOOB account. No account with that email: "I could not find any NOOB account with ..." and the email is asked again. (A person without an account can tap "I don't have an account yet" and still ask questions.)
2. **The problem** (six buttons, or their own words).
3. **User ID** (the @username). Wrong ID: asked again. **"I forgot my ID"** skips it. An email shared by several accounts needs the right ID (forgetting is not enough).
4. **"Send me a code"** (button, or typed: "send me the otp", "otp bhejo", "email me a code"). A 6-digit code goes to the email **on file**. A box opens in the chat; typing all 6 digits logs the person in on that device (same device check as every other login). The code can also be typed as a normal chat message.
5. Anything else: the NOOB support helper (the same AI as in the app) answers general questions, knowing only that this is a guest and what the problem was.

## Limits (all enforced by the database, never by the screen)

| What | Limit |
| --- | --- |
| Uses of guest support per **browser** | **3** (spent when the problem is sent) |
| Chats per network address per day | 12 (and 10 codes an hour, 10 email lookups an hour per browser, 40 an hour per network address) |
| Per chat | 3 codes (45 s apart), 6 ID checks, 8 wrong codes, 40 helper messages, 24 hours |
| Per account | the emailed-code login limits (3 codes an hour, 5 wrong tries a code, 8 wrong guesses an hour) |

"Same browser" is a random id kept in the page storage **and** a 2-year cookie; the server stores only a salted hash. Clearing everything does not give unlimited uses because the network address limits still apply.

## Safety rules

- Nothing about an account is shown before the chat is bound to it: the email is answered with a **masked** address (`a••••@g••••.com`) only; the code, the full address, the account id and the User ID are never in an answer.
- The chat has an id and a 64-character key (only a salted hash is stored), bound to the browser; both are needed for every step. A wrong key, wrong browser, closed or expired chat gets "bad_case".
- Suspended accounts get no code.
- The code goes through the existing emailed-code login machinery (`recovery_otps`, salted hash, 10 minutes, 5 tries); the sign-in itself is the same one-time token as every other login.
- The helper AI never sees the email, the User ID, the code or the chat key: the screen hides addresses and long numbers (`redact`) before anything is sent or kept; only hidden text is kept in the tab (`sessionStorage`, 24 h, cleared on login or "End chat").
- The new tables are closed to everyone except the server (RLS on, no policies, `revoke ... from public, anon, authenticated`); all 13 database functions are callable by the server only. The migration only adds; its one `delete` removes old one-time codes (as every emailed-code login does).

## Files

| Part | File |
| --- | --- |
| Screen | `src/components/Support/GuestSupport.tsx`, `guestSupport.css` (opened from `src/components/Auth/AuthView.tsx`) |
| Words, rules, browser id, saved chat | `src/components/Support/guestSupportLogic.ts` |
| API layer | `guestSupport*` and `askGuestSupportAssistant` in `src/services/supabaseApi.ts` (re-exported by `api.ts`) |
| Server | `supabase/functions/recover-account` (actions `guest-support-*`), `supabase/functions/dynamic-handler` (guest answers in the `support` action) |
| Database | `supabase/migrations/20261029000001_guest_support.sql` (+ admin RPCs `admin_guest_support_cases`, `admin_guest_support_close`) |
| Tests | `test-guest-support-db.mjs` (80), `test-guest-support.mjs` (76), `test-recover-account-function.mjs`, `test-ai-function.mjs` |
| Look without Supabase | `node scripts/dev/mock-backend.mjs` answers the guest actions (try `ana@example.com`, ID `ana_guest`, code `123456`; `twins@example.com`; `sus@example.com`) |

## To switch it on (once)

1. Run `20261029000001_guest_support.sql` in the Supabase SQL editor.
2. Redeploy the functions **recover-account** and **dynamic-handler** (Verify JWT stays OFF).
3. `RESEND_API_KEY` must be set (the same secret the emailed-code login uses); without it the chat says "Emailing a code is not switched on yet".
