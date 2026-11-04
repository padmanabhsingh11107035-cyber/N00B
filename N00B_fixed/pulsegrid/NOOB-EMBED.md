# PulseGrid Arena (NOOB Games page)

3D rhythm-dance game (Vite + TypeScript + Three.js + Rapier). Made by NOOB developers. Built copy (with the 16 MB of music, sounds, models and pictures, NOT duplicated in this source folder): `instagram/public/games/pulsegrid/`; card id `pulsegrid`.

Cleaned from the supplied package: no maker files or tuning hook; media paths are plain files next to the page (`src/engine/media-url.ts`, from the package's asset list); the models' own JSON no longer names the tool that made them; save key `noob.pulsegrid.save`; credits line lists Figtree and Sora; title/author "Made by NOOB developers". Kept on purpose: the on-screen credit "Dance motion: AIST++ (CC BY 4.0)", which the licence requires. The package says the game is a remix of a supplied "BeatStage 3D" source whose licence file was not included.

Build (C: is tight, use D:): copy this folder to `D:\noob-pulse\game`, copy `instagram/public/games/pulsegrid/assets/performance` into its `public/assets/performance`, `npx pnpm@10.18.0 install --store-dir D:/noob-critterkart/pnpm-store --prefer-offline`, `tsc --noEmit`, `vite build`, copy `dist/` over the built copy. `public/_headers` may hold at most 100 rules.
