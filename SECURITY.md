# Security policy

NOOB Socials (https://noobsocials.com) is run by students, and its source is public. If you find a way to get into somebody's account, read something private, change somebody
else's data, or take the site down, please tell us before you tell anyone else.

**How to report:** open a private report at https://github.com/padmanabhsingh11107035-cyber/N00B/security/advisories/new (only the maintainers see it). Please include what
you did, what you saw, and which account or page it was on. Do not read, change or delete other people's data to prove a point: a test account of your own is enough.

**What we promise:** we read every report, we fix real problems quickly, and we will not take action against anyone who looked for problems in good faith and stayed inside the
rules above.

## What is already in place

- Every table in the database has row-level security, and a check (`node scripts/security-audit-db.mjs`, run on every push and every week by
  `.github/workflows/security.yml`) fails when a table without it, a privileged function without a fixed search path, or a function a visitor can call without any check appears.
- A strict Content-Security-Policy and the other security headers (`N00B_fixed/instagram/public/_headers`): no inline scripts, no framing of the app, https only.
- Passwords are checked by Supabase Auth; an account can ask for an approval by e-mail ("Is this you?") on every new login.
- Dependencies are watched by Dependabot and `npm audit`; the code by CodeQL; the history by a secret scanner.
- The repository holds no secrets: server keys live only in Supabase's and Cloudflare's own settings.
