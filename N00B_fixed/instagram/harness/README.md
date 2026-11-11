# NOOB visual harness (dev only)

Renders pages that normally need a signed-in user, with a fake login and a fake backend, so they can be looked at (and screenshotted) in a browser at phone size.
Nothing in `src/` is changed and nothing here is part of the production build (`vite.config.ts` only builds the four real pages).

## Start

```
npm run harness          # http://127.0.0.1:5190  (strict port; stop it with Ctrl+C)
```

Open the address below in a browser. `/` shows a small menu.

## Links

Two ways to open every page (same query string):

* `http://127.0.0.1:5190/harness/index.html?page=draw&theme=dark&phone=1` - the page itself, as big as the browser window. Use a phone-sized window or device emulation.
* `http://127.0.0.1:5190/harness/frame.html?page=draw&theme=dark&phone=1` - the same page inside a 390x844 phone frame in any desktop window (`&w=390&h=844&scale=0.85` to change it).
  Use this when the browser's own device emulation crops screenshots (the Claude Browser pane does: it only shows about 80% of an emulated 390 px window).

| page= | what it shows |
|---|---|
| `draw` | NOOB Draw (five packs, free/locked states, ticker, history) |
| `tot` | This or That inside the Fun frame (today's duel, previous days) |
| `ask` | Ask Me Anything, my inbox (new / answered). `&target=priya.nair` = someone else's page where you send a question |
| `polls` | Public Polls (active / ended / my polls). `&target=pl1` opens one poll |
| `anon` | Anonymous Messages (`&admin=1` = the administrator's view with Remove buttons) |
| `studio` | NOOB Studio with a sample photo (`&media=video` = a generated 3 s clip, `&media=none` = empty) |
| `forms` | NOOB Forms, my forms. `&target=f1` = the editor of a form |
| `form` | A public form as a visitor fills it (`/f/<address>`) |

Options on every link:

| option | values | meaning |
|---|---|---|
| `theme` | `dark` (default), `light` | colour theme (`data-theme` on `<html>`) |
| `phone` | `1` | phone edge-to-edge mode: `html.phone-edge`, notch 47 px and home bar 34 px (every `env(safe-area-inset-top/bottom)` in the app is rewritten to these, see `vite.harness.config.ts`) |
| `state` | `full` (default), `empty`, `loading`, `error` | `empty` = no rows, `loading` = the backend never answers (skeletons), `error` = every call fails with 500 |
| `admin` | `1` | signed in as the administrator (`noob`): admin controls on Fun pages, admin view on Anonymous |
| `voted` | `1` | today's duel / the polls start already voted |
| `user` | `0` | signed out (visitor) |
| `doodle` | `0` | switch off the faint doodle wallpaper behind pages (the app's own "doodle background" setting) |
| `anim` | `1` | keep CSS animations. By default they jump to their end state, so screenshots are never caught half-way through an entrance animation |

## How it works

* `harness/main.tsx` runs first. It sets the theme and phone mode, writes a fake non-expired Supabase session where `src/services/tabSessions.ts` reads it
  (`noob_session_v1_<id>` in localStorage), replaces `window.fetch` for the Supabase host, and only THEN imports the app (`src/index.css`, `polish.css`, the page).
* The fake fetch (in `main.tsx`) answers `/auth/v1/*`, `/rest/v1/rpc/<name>` from `rpcMocks` and `/rest/v1/<table>` GET from `tableMocks`, both in `harness/mocks.ts`.
* Voting, answering a question, posting an anonymous message etc. work in memory (they change the canned data until the page is reloaded).

## Adding a mock

1. Open the page; the console shows `[harness] no mock for rpc "<name>"` (or `table`) for every call that has no answer (it then gets `null` / `[]`).
2. Find the function in `src/services/supabaseApi.ts` to see the exact JSON shape it maps.
3. Add `<name>: (args, ctx) => <json>` to `rpcMocks` in `harness/mocks.ts` (`args` = the rpc arguments, `ctx.state/admin/voted/user` = the URL options).
   Tables: `<table>: (query, ctx) => rows[]` in `tableMocks` (`query` is the URLSearchParams, e.g. `id=eq.f1`).
4. To add a new page: add a branch in `boot()` in `harness/main.tsx` that imports the component and renders it with `currentUser`.

`window.__harnessLog` lists every Supabase request the page made.

## Known limits

* Only the pages above are wired. Other signed-in pages need a branch in `main.tsx` plus mocks.
* Realtime (websockets), storage uploads/downloads, edge functions and the AI calls are not faked (functions answer `{}`, storage 404). Pictures come from `public/`.
* Forms: the responses table is empty (responses page shows "no answers yet"); webhooks, collaborators and AI are empty/not faked.
* NOOB Draw: a spin always wins the 5th prize of the pack (so the result screen can be looked at); the real odds are not simulated.
* Native-app things (Android status bar, Capacitor plugins), real iPhone Safari rendering and real fonts (Verdana is used where the computer has it) cannot be reproduced.
* The doodle wallpaper behind the pages is the app's real look; use `&doodle=0` for a clean background.
* `harness/` files are `// @ts-nocheck` so `npm run lint` is not affected.
