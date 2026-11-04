# Breachpoint Zero (NOOB Games page)

3D first-person shooter, Onslaught (8 waves, 4 computer squad-mates, Warden boss) and a 6-bot Deathmatch (Vite + TypeScript + Three.js + Rapier). Made by NOOB developers. Built copy (with all 38 MB of models, textures and sounds, which are NOT duplicated in this source folder): `instagram/public/games/breachpt/`; card id `breachpt`.

Cleaned from the supplied package: no maker files or server; the online guest board client is replaced by a board kept on the device (`leaderboard.js`, same shape); asset paths are plain files next to the page (`src/engine/asset-paths.ts`); the models' own JSON no longer names the tool that made them and the code no longer names it; unused maker-named fonts removed; title/author "Made by NOOB developers"; title-screen texts say the scores are on this device.

Credits (from the package's notes): HDRI, textures and props from Poly Haven (CC0); character rig and animations Mixamo X Bot as distributed in the three.js examples; other models, music, sound effects, VFX and UI artwork were generated for the source project; fonts SIL OFL 1.1 (notices in `public/fonts`); three.js (MIT), Rapier (Apache-2.0), meshoptimizer (MIT). The package says it is a remix of a supplied "Iron Rift FPS" showcase source.

Build (C: is tight, use D:): the assets come from `instagram/public/games/breachpt/assets/` (copy them into `public/assets/` of the build folder); `npx pnpm@10.18.0 install --store-dir D:/noob-critterkart/pnpm-store --prefer-offline`, `tsc --noEmit`, `vitest run`, `vite build`, copy `dist/` over `instagram/public/games/breachpt/`. `public/_headers` may hold at most 100 rules.
