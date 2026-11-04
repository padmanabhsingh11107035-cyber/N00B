# Apex Drift (NOOB Games page)

60-second 3D arcade drift score attack (Vite + TypeScript + Three.js + Rapier). Made by NOOB developers. Built copy: `instagram/public/games/apexdrift/`, card id `apexdrift`.

Cleaned from the supplied package: no maker files or server; the online ranking client was replaced by a ranking kept on the device (`src/driftking/online/leaderboard.ts`, same shape); fonts and the car model come from `assets/` (the model's own JSON no longer names the tool that made it); unused starter scaffolding (root `src/main.ts`, `src/ui`, `src/styles`) removed; title/author "Made by NOOB developers". The package's own notes (`SOURCE_PROVENANCE.md`, not copied) say it is a remix of a supplied published "Drift King" archive whose licence file was not included.

Build (C: is tight, use D:): copy to `D:\noob-apex\game`, `npx pnpm@10.18.0 install --store-dir D:/noob-critterkart/pnpm-store --prefer-offline`, `tsc --noEmit`, `vitest run`, `vite build`, copy `dist/` over `instagram/public/games/apexdrift/`. `public/_headers` may hold at most 100 rules.
