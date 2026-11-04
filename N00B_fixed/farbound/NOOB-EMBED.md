# Farbound: Ruins Beyond (NOOB Games page)

Small offline 3D exploration adventure (Vite + TypeScript + Three.js). Made by NOOB developers. Built copy: `instagram/public/games/farbound/`, card id `farbound`.

Cleaned from the supplied package: no maker files or dev tuning hook; the bundled CC0 font renamed `NoobSans` (files, CSS and the font's own name table, same length) with its CC0 text kept as `NoobSans-LICENSE.txt`; credit line reads "Fonts: CC0 1.0"; title/author "Made by NOOB developers". The package's own notes say the game is a remix of a supplied showcase source whose licence file was not included (kept out of this repository: `vendor/faraway-source.zip`, 2 MB, was not copied); progress is saved on the device only.

Build (C: is tight, use D:): copy to `D:\noob-far\game`, `npx pnpm@10.18.0 install --store-dir D:/noob-critterkart/pnpm-store --prefer-offline`, `tsc --noEmit`, `vitest run`, `vite build`, copy `dist/` over `instagram/public/games/farbound/`. `public/_headers` may hold at most 100 rules.
