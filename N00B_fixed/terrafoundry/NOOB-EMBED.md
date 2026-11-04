# TerraFoundry (NOOB Games page)

3D survival and building game (Vite + TypeScript + Three.js + Rapier). Made by NOOB developers. Built copy (with the models and pictures, NOT duplicated in this source folder): `instagram/public/games/terrafoundry/`; card id `terrafoundry`.

Cleaned from the supplied package: no maker files or dev tuning hook; asset paths relative to the page; the models' own JSON no longer names the tool that made them; unused maker-named fonts removed; title/author "Made by NOOB developers".

**Known gaps:** the supplied code zip does not contain the ground and wood textures (`assets/tex/*`) or the sound files (`assets/audio/*`), which lived on the maker's storage, so the game is silent and uses plain colours for the ground; the HUD and item pictures are simple emoji icons made for NOOB (`public/assets/icons/*.webp`, script: `make-terra-icons.py`), except hud_chest and hud_map which are the supplied ones. Add the real files under the same names and rebuild to fix it.

Build (C: is tight, use D:): copy to `D:\noob-terra\game`, copy `instagram/public/games/terrafoundry/assets` into its `public/assets`, `npx pnpm@10.18.0 install --store-dir D:/noob-critterkart/pnpm-store --prefer-offline`, `tsc --noEmit`, `vite build`, copy `dist/` over the built copy. `public/_headers` may hold at most 100 rules.
