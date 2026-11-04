# Ashenfang: The Colossus Trail (NOOB Games page)

Single-player 3D action hunt (Vite + TypeScript + Three.js + Rapier): three colossi, climbing, weak points. Made by NOOB developers. Built copy (with the 28 MB of models, textures and sounds the game really loads, NOT duplicated in this source folder): `instagram/public/games/ashenfang/`; card id `ashenfang`.

Cleaned from the supplied package: no maker files; the 242 MB raw art/catalog folder was not shipped (only the 125 files the game asks for are in the build); asset paths are plain files next to the page (`src/game/assetPaths.ts`); the models' own JSON no longer names the tool that made them; the maker-named fonts were dropped (credits line now lists Figtree and Sora); save keys are `noob.ashenfang.*`; shader variable names without a tool name; title/author "Made by NOOB developers". The package says the game is a remix of a supplied "Wildclaw: Colossus Hunt" source archive (licence file not included); that name is kept out of the shipped code.

Build (C: is tight, use D:): copy this folder to `D:\noob-ash\game`, copy `instagram/public/games/ashenfang/assets` into its `public/assets`, `npx pnpm@10.18.0 install --store-dir D:/noob-critterkart/pnpm-store --prefer-offline`, `tsc -p tsconfig.app.json`, `vite build`, copy `dist/` over the built copy. `public/_headers` may hold at most 100 rules.
