# Lane Runner: Endless (NOOB Games page)

Endless 3D run-and-gun horde game (three.js + TypeScript + Vite). Made by NOOB developers. Built copy: `instagram/public/games/lane-runner/`, card in `src/components/Games/types.ts` (id `lane_runner`).

Cleaned from the supplied package: no maker files, no live-tuning panel, no dev preview page; title/author say "Made by NOOB developers". Credits kept: character animation rig Quaternius (CC0), street props Poly Haven (CC0), fonts Anton and Figtree (SIL OFL, notices in `public/fonts`), three.js (MIT).

Build (C: is tight, use D:): copy this folder to `D:\noob-lane\game`, `npx pnpm@10.18.0 install --store-dir D:/noob-critterkart/pnpm-store --prefer-offline`, `tsc --noEmit`, `vitest run`, `vite build`, copy `dist/` over `instagram/public/games/lane-runner/` (delete the old folder first).

`public/_headers` may hold at most 100 rules (Cloudflare refuses more).
