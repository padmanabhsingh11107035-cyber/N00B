# Where NOOB runs (and where it does not)

| What | Where |
| --- | --- |
| The website and the app's pages | Cloudflare (Workers Builds, project "n00b", deploys the branch `main` / `supabase-migration`) |
| Database, login, file storage, edge functions | Supabase (project abffssydapumuhwgzeck) |
| The Android app | built by GitHub Actions (`android-build.yml`), published as a release |
| Secret scan, code scan, package and database audits | GitHub Actions (`security.yml`) |

**Render and Railway are not used.** The old Node server (`server.ts`, `server/`) that once ran there is kept in the repository only as source; nothing deploys it. A Render or Railway service that is still connected to this repository only sends "deploy failed" e-mails: delete it in that service's dashboard.

Before deleting an old service, keep a copy of anything you might still want from it (an export of the old MongoDB, the old Backblaze B2 bucket), because deleting it there is final. NOOB's live data is in Supabase and is not touched by deleting Render, Railway, MongoDB Atlas or Backblaze.
