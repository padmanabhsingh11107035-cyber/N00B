# Helix Fall inside NOOB

This is the Helix Fall source from Manus, changed so it can run inside the NOOB Games page and so that it is easy, endless and quick to start.

## What was changed (compared with the zip you sent)

**Game design**
- **Levels never end.** 90 floors = one level. After the last floor of a level the next one starts straight away (`LEVEL_FLOORS`, `extendTower` in `src/game/level.ts`, `levelCheck` in `src/game/sim.ts`). The gold base at the bottom is gone. Every level has the six stages and themes again, a little harder each level up to a ceiling.
- **Easier tower.** Wider gaps (5 slots at the start, 4, then 3; 2 only from level 4 on), at most 2-3 hazards per floor and never more than 4 hazard slots, hazards kept off the short way from where the ball lands to the next gap, shorter turns between gaps, fewer and slower sweepers. Simulated players (see `tests/sim.test.ts`): level 1 is cleared by about 70% of the careless one, 85% of the average one, 97% of the good one (before: 0%, 0%, 12%).
- **One shield per level.** The first hazard hit in a level bounces the ball away instead of ending the run (`shield` in `sim.ts`, shown in the HUD).
- **One best score per player** on the local leaderboard (`bestPerPlayer` in `src/engine/save.ts`, per day). Old boards with the same player many times are cleaned up when loaded.

**Speed**
- The physics engine (Rapier, four fifths of the download) is gone: the tumbling pieces of broken floors use a small integrator in `src/game/fx.ts`. The game itself never used it. Download: 2.3 MB → about 0.7 MB.
- The ball's model started downloading first thing (`modelLoading` in `src/main.ts`), and its three 2048×2048 textures were shrunk to 512×512 (`assets/models/helix-fall-orb.glb`, 2.2 MB → 0.45 MB). The original model is in the Helix Fall zip you sent.

**Talking to NOOB** (only when the page is shown in a frame with `?embed=1`; opened on its own nothing changes)
- `public/embed-probe.js` (+ one line in `index.html`) and `tellStatus` in `src/main.ts`: the game reports "hello", "ready" and any start-up error, so NOOB can show a loading screen and, if the game cannot start, what went wrong.
- `helixfall:level` is sent the moment a level is cleared (NOOB pays 50,000,000 NOOBs), `helixfall:run-end` when the ball falls (NOOB keeps the best Daily Tower score).
- The leaderboard is NOOB's: the game asks for it with `helixfall:board-request` and NOOB answers with `helixfall:board`; the player's name comes in the address (`&name=`), so there is no nickname box.
- `src/styles/main.css`: the "Share" and "Copy challenge link" buttons are hidden in that frame (they would link to this game's own page).

The other end is `instagram/src/components/Games/minigames/HelixFallGame.tsx`; the database side is `instagram/supabase/migrations/20261021000001_helix_fall.sql`.

## To change the game

Edit here, then build and copy the result into the app:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
# replace the app's copy (keep ASSET_PROVENANCE.md there)
rm -rf ../instagram/public/games/helix-fall/assets ../instagram/public/games/helix-fall/fonts
cp -r dist/. ../instagram/public/games/helix-fall/
```

The site's security rules for that folder are in `instagram/public/_headers` (it is the only place the app may be framed, by itself only).
