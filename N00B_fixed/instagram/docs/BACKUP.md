# Automatic free protection of the Supabase data

Two GitHub workflows, both free (only GitHub Actions minutes, no new accounts, no paid service):

| Workflow | When | What |
|---|---|---|
| `.github/workflows/backup-supabase.yml` | every Sunday 02:30 UTC and on demand | copies every table + the account list, checks the copy, encrypts it, keeps it 30 days |
| `.github/workflows/usage-alert.yml` | every day and on demand | opens the issue "Supabase free limit warning" when the database or storage is at 80% of the free plan |

If a job fails GitHub e-mails you. A failed backup means rows are missing or a secret is missing: open the run and read the red message.

## 1. One-time setup

### 1a. Run the SQL (usage alert only)
In the Supabase SQL editor run `supabase/migrations/20261112000003_usage_probe.sql`. It only reads sizes and is callable only with the service key.

### 1b. Make a strong passphrase
At least 24 characters, random. For example in PowerShell:

    -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | % {[char]$_})

Or let a password manager generate 40 characters. **Write it down offline (paper, a second place) and keep it in your password manager.** The secret in GitHub can never be read again after saving; if you lose the passphrase every backup is useless.

### 1c. Add three secrets in GitHub
Repository > Settings > Secrets and variables > Actions > New repository secret:

- `SUPABASE_URL` = `https://<project-ref>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = the project's secret key (Supabase > Settings > API Keys > Secret keys). Never put it in a file or the chat.
- `BACKUP_PASSPHRASE` = the passphrase from 1b.

Then Actions > Backup Supabase > Run workflow once to test, and the same for Usage alert.

## 2. Why it is encrypted
This repository is PUBLIC. Anyone can open the Actions page and download artifacts. The backup holds private details (e-mails, phone numbers, messages), so the only thing ever uploaded is a file encrypted with AES-256 (`openssl enc -aes-256-cbc -pbkdf2 -iter 600000`). Without the passphrase it is unreadable. The unencrypted folder is deleted before the upload and no step prints data.

## 3. Where the backup is
Repository > Actions > Backup Supabase > the run > "Artifacts" at the bottom: `noob-supabase-backup-<date>` (a zip containing `noob-supabase-<date>.tar.gz.enc`). It is kept 30 days, then GitHub deletes it. Download one now and then to a second place if you want to keep older ones.

## 4. Restore / read a backup
Unzip the artifact, then (OpenSSL is in Git Bash, Linux and macOS):

    openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in noob-supabase-2026-11-15.tar.gz.enc -out backup.tar.gz
    tar -xzf backup.tar.gz

(it asks for the passphrase). You get a folder `supabase-<date>/` with `manifest.json` and `tables/<table>.json` (every row of each table, plus `auth.users.json`). Check it without internet:

    node scripts/backup-supabase.mjs --verify supabase-<date>

To restore, insert the rows of each table back from its JSON (for example with the Supabase client `from(table).upsert(rows)` in a script, parents before children). Notes: `auth.users.json` has e-mail, phone and metadata but NOT password hashes (the auth API never gives them out); people would need "forgot password". Media files are not included.

## 5. Honest limits
- The artifact is public but encrypted; its safety depends on the passphrase being long and secret.
- Kept 30 days, weekly: the newest copy is at most a week old.
- Media (photos, videos, audio) is NOT included (too large); only database rows and accounts.
- No password hashes (see above).
- Egress (5 GB/month) cannot be read through the API: check Supabase Dashboard > Usage now and then. The daily alert watches only database size (500 MB free) and file storage (1 GB free).
- If Supabase has blocked the API (quota exceeded) both workflows fail, which is also a signal.


---

# Manual backups (the older ways, still valid)

Supabase's free plan makes **no backups of its own**, so the only copies are the ones made here. Both tools are read-only: they never write to or delete from the project, and nothing in the folders they make is ever committed (`backups/` is git-ignored; keep copies on another drive or cloud as well - they hold e-mail addresses, password hashes and private chat data).

## 1. Everything in the database ("full export")
Made on 2026-10-28 (the project was restricted, so the API was unavailable) by running only `select` statements, inside a read-only transaction, in the Supabase SQL Editor, and saving the answers:

- every table of `public` (all 202, chats and private keys included), `auth` (accounts with e-mail and password hashes), `storage` (the list of uploaded files), `cron` (scheduled jobs and their log) - one JSON file per table, exactly as PostgreSQL produced it;
- how the database is built (columns, constraints, indexes, access rules, functions, triggers, grants ...) in `schema/`;
- a manifest with row counts, SHA-256 and the database's own MD5 of every file, and the counts taken again right after the export (user tables must not differ).

Not in it on purpose: login tokens/sessions (`auth.refresh_tokens`, `auth.sessions`, `auth.flow_state`, `auth.one_time_tokens`) - they are keys to accounts and useless for a restore. Not possible from SQL: the photos/videos/songs themselves (they live in file storage) and secrets kept outside the database (Edge Function secrets, sign-in provider settings).

Check a copy at any time, offline: `node scripts/verify-db-export.mjs <folder>` (and `node scripts/backup-supabase.mjs --verify <folder>`).

## 2. Tables + photos/videos/songs ("API backup")
`powershell -ExecutionPolicy Bypass -File scripts\backup-supabase.ps1` (asks for the Supabase secret key, hidden). It asks the project which tables exist and saves **all of them** (the built-in list of 48 is only a fallback and prints a warning), the accounts list (no password hashes - the API never returns them) and every file of the `media` bucket, then verifies itself. It needs the API, so it cannot run while Supabase has the project restricted (402): run it as soon as the restriction lifts (the billing period resets on the 4th of each month) and then weekly.

## When to use which
- Weekly: the API backup (tables + media).
- Before anything risky, or while the API is restricted: the full export.
