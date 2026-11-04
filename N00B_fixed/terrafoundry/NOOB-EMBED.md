# TerraFoundry (NOOB Games page)

3D survival and building game (Vite + TypeScript + Three.js + Rapier). Made by NOOB developers. Built copy (with the models and pictures, NOT duplicated in this source folder): `instagram/public/games/terrafoundry/`; card id `terrafoundry`.

Cleaned from the supplied package: no maker files or dev tuning hook; asset paths relative to the page; the models' own JSON no longer names the tool that made them; unused maker-named fonts removed; title/author "Made by NOOB developers".

**Generated media:** the supplied code zip does not contain the ground and wood textures (`assets/tex/*`) or the sound files (`assets/audio/*`), which lived on the maker's storage. NOOB made simple stand-ins with `make-terra-media.py`: 38 generated sounds (16-bit mono WAV data kept under the `.mp3` names the game asks for; the browser's audio decoder reads the content) and 19 generated textures (soft noise, colour per surface), plus 49 emoji icons (`make-terra-icons.py`; hud_chest and hud_map are the supplied ones). Replace them with real files under the same names and rebuild whenever the real ones arrive.

Build (C: is tight, use D:): copy to `D:\noob-terra\game`, copy `instagram/public/games/terrafoundry/assets` into its `public/assets`, `npx pnpm@10.18.0 install --store-dir D:/noob-critterkart/pnpm-store --prefer-offline`, `tsc --noEmit`, `vite build`, copy `dist/` over the built copy. `public/_headers` may hold at most 100 rules.
