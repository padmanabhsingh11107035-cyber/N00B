# NOOB Run 3D (NOOB Games page)

A 3D endless runner (Three.js and React): dash through three railway lanes, dodge trains, jump and slide, collect coins and power-ups while an inspector and his dog chase you; missions, skins, weather and a ranking. Made by NOOB developers. The models, the music and the sounds are made by the game itself.

The built game is served at `/games/noob-run-3d/` (`N00B_fixed/instagram/public/games/noob-run-3d/`) and shown on the Games page in a frame, which also keeps its ranking (see below).

## What is different from the supplied package

- The tool the game was made with is gone: its folder, notes, build files, its server packages (an Express server and an AI client that the game never used), its demo "platform" wrapper with a made-up player, and the unused picture.
- **The ranking is real.** The game came with a list of eight made-up players. Now a finished run sends its score to the Games page (`public/games/_shared/noob-score.js`, the same messages as every score game), which saves the player's best in the shared board (`supabase/migrations/20261103000002_hosted_scores.sql`, rule `noob_run_3d`: at most 5,000,000, one score every 15 seconds). The trophy button and the game's own "Top runners" window show the same board, with the players' pictures.
- The two Google fonts the page loaded from the internet are now files of the build (`@fontsource`), so the page needs nothing from any other site.
- Scripts, style and fonts have a fingerprint in their name and live in `build/`; `scripts/make-warm.mjs` writes `warm.json`.

## Rebuild

Work on a drive with space (e.g. D:):

```
npx pnpm@10.18.0 install
npx pnpm@10.18.0 build     # type check + build + warm.json
```

Copy `dist/` over `N00B_fixed/instagram/public/games/noob-run-3d/`, then run `node --liftoff-only scripts/supabase/test-score-games.mjs` in `N00B_fixed/instagram`.

## Licences

Fonts: Outfit and Chakra Petch (SIL OFL 1.1, from the `@fontsource` packages). Three.js (MIT), React (MIT), lucide (ISC), canvas-confetti (ISC).
