# Strike Bowl (NOOB Games page)

Five-frame 3D bowling with real pin physics (Vite + TypeScript + Three.js + Rapier). Made by NOOB developers. Built copy: `instagram/public/games/strikebowl/` (fingerprinted `assets/`), card in `src/components/Games/types.ts` (id `strikebowl`).

Cleaned from the supplied package: no maker files or live-tuning panel, no online ranking (the board is kept on the device: `src/net/leaderboard.ts`), fonts and the pin model come from `src/assets/` (the model's own JSON no longer names the tool that made it), the Chinese font only loads for Chinese glyphs, title/author say "Made by NOOB developers".

Build (C: is tight, use D:): copy this folder to `D:\noob-strikebowl\game`, `npx pnpm@10.18.0 install --store-dir D:/noob-critterkart/pnpm-store --prefer-offline`, `tsc --noEmit`, `vitest run`, `vite build`, copy `dist/` over `instagram/public/games/strikebowl/` (delete the old folder first: the files are fingerprinted).

Note: `public/_headers` may hold at most 100 rules (Cloudflare); Strike Bowl uses 2 (frame policy, assets cache).
