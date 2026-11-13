# Turnstile on sign-up (free "are you a person" check)

Cloudflare Turnstile sits in front of ONE thing: the step that asks for the emailed sign-up code (the normal sign-up form, its "Resend code",
and the last step of "Continue with Google"). It never appears on log-in, so nobody who already has an account is affected. It is OFF until
you do the steps below; deploying the code first changes nothing.

Why: the sign-up code email is the expensive, abusable point (it costs an email and fills the database). The per-address limits stay as they are;
Turnstile only stops bots from reaching them in the first place.

## What is built

- Client: `src/components/Auth/TurnstileBox.tsx`. Renders nothing unless the build variable `VITE_TURNSTILE_SITE_KEY` is set. Loads
  `https://challenges.cloudflare.com/turnstile/v0/api.js` only then, in "managed" mode, dark theme (the sign-up screens are dark).
- Server: `supabase/functions/recover-account/index.ts`, action `signup-otp-request` (this is the only function that sends the sign-up code, so it is
  the only one to redeploy). Active only when the Supabase secret `TURNSTILE_SECRET_KEY` exists. The caller's address sent to Cloudflare is
  `cf-connecting-ip`, as in the rest of that function.
- Page security headers: `public/_headers`, the `/*` rule's `script-src` now also allows `https://challenges.cloudflare.com`
  (`frame-src https:` already covered the widget's frame). No rule was added.
- NOT covered on purpose: the log-in screen, and the help chat's emailed code for people who are locked out (it only mails an address already on
  an account and has its own limits per browser; a CAPTCHA there could lock out a real person who needs help).

## Do this, in this order

1. Cloudflare dashboard -> Turnstile -> Add widget. Widget mode: **Managed**. Hostnames: `noobsocials.com`, `www.noobsocials.com`, `nooob.xyz`
   (add `localhost` only if you want to test with the real key on your computer). Copy the **Site key** and the **Secret key**.
2. Deploy the code first (push, wait for the Cloudflare build) and redeploy the function `recover-account` (Verify JWT stays OFF).
   Nothing changes yet.
3. Add the build variable `VITE_TURNSTILE_SITE_KEY` = the Site key (Cloudflare Workers/Pages project -> Settings -> Variables and secrets, for the
   build). Trigger a new build. The check now shows on the sign-up screens.
4. Only AFTER step 3 is live, set the Supabase secret: `TURNSTILE_SECRET_KEY` = the Secret key (Supabase -> Edge Functions -> Secrets). The server now
   refuses a sign-up code request without a valid token. (Doing 4 before 3 would make every sign-up say "please complete the security check" with
   no check on the screen.)
5. Test: open a private window, start a sign-up, see the check, finish the form, get the code.

## What happens when something goes wrong

- Cloudflare cannot be reached from the Edge Function, or answers with a problem on our side (for example a wrong secret): the request is let
  through and a warning is written to the function log (never the token or the secret). This is **fail open** on purpose: failing closed would
  stop every real person from joining whenever Cloudflare has a bad hour or the secret is mistyped. The limits in the database
  (`signup_otp_request`: per address, per email, cool-down) stay as the backstop.
- A missing, wrong, reused or expired token: refused with "Please complete the security check and try again."
- The widget script cannot load on the person's phone (blocked network, extension): the screen shows "The security check could not load" with a
  **Try again** button. If the server has no secret the request still goes without a token; if it has one, the server says a check is required.

## Switch it off

Remove the Supabase secret `TURNSTILE_SECRET_KEY` (server stops asking at once) and the build variable `VITE_TURNSTILE_SITE_KEY` (then rebuild;
the widget disappears). Removing only the secret is enough to make sign-up work again immediately.

## Test with Cloudflare's published dummy keys

Use these instead of real keys on a test build (they work on any hostname):

| What | Value |
| --- | --- |
| Site key, always passes (visible) | `1x00000000000000000000AA` |
| Site key, always blocks | `2x00000000000000000000AB` |
| Secret key, always passes | `1x0000000000000000000000000000000AA` |
| Secret key, always fails | `2x0000000000000000000000000000000AA` |

Pair "passes" site key + "passes" secret to see the whole path work, and the "blocks"/"fails" ones to see the refusal message. Put the real keys
back afterwards. The automated test is `scripts/supabase/test-turnstile.mjs` (`node scripts/supabase/test-turnstile.mjs`).
