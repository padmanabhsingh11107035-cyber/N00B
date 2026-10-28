# Backups of the NOOB data

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
