# Coil Rush (NOOB Games page)

A 3D worm-arena game: grow by eating, swallow celestial bodies for permanent powers, dodge hazards and rival worms. Built with three.js (no physics engine, no WebAssembly).

It is served from this site at `/games/coil-rush/` (folder `N00B_fixed/instagram/public/games/coil-rush/`) and shown on the Games page in a frame (`src/components/Games/minigames/HostedGameFrame.tsx`). It plays upright on a phone (left thumb steers, right thumb boosts) and with the mouse on a computer.

## What is different from the supplied package

- All files and settings of the tool the game was made with are gone (its dev hooks, sharing and asset-restore scripts, share information, preview-host test, browser smoke script, asset registry and the project's notes). Nothing in the page, the scripts, the pictures, the sounds or the fonts names it, and nothing links to it.
- The game's pictures, sounds, model and fonts are plain files next to the page, under `assets/` (the asset registry that pointed to the tool's own storage is replaced by relative addresses in `src/engine/assets.ts` and `src/engine/fonts.ts`).
- Only the files the game really asks for are shipped (the larger copy of the asteroid model, the concept art, the screenshots and the share pictures are not).
- The script and style files get a fingerprint in their name and live in `build/` (`vite.config.ts`), so they can be cached for ever; `scripts/make-warm.mjs` writes `warm.json` (the files the Games page fetches quietly in advance) and preloads the main script from the page.
- The game is offline: it sends nothing anywhere (`src/ui/online.ts` is a stub), and the page policy for its folder allows only its own files.

## Licences

Fonts: Sora, Figtree and Noto Sans SC (SIL OFL 1.1, notices in the built copy's `fonts/`). Three.js (MIT).
