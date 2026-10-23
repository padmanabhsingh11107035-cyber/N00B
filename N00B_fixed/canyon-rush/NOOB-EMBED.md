# Canyon Rush Circuit (NOOB Games page)

A Three.js 3D arcade racer: drift, boost and jump through a sunlit canyon, race AI rivals, split-screen on one device, build circuits in Track Lab and paint a car in Car Forge.

The built game is served from this site at `/games/canyon-rush/` (folder `N00B_fixed/instagram/public/games/canyon-rush/`) and shown on the Games page in a frame (`src/components/Games/minigames/HostedGameFrame.tsx`).

## What is different from the supplied package

- All files and settings of the tool the game was made with are gone (scripts, dev tuning hook, sharing files, asset restore step).
- The Multiplayer card is not offered: it needs a room service that NOOB does not run (`src/ui/templates.ts`).
- The script and style files get a fingerprint in their name and live in `build/` (`vite.config.ts`), so they can be cached for ever; `scripts/make-warm.mjs` writes `warm.json` (the files the Games page fetches quietly in advance) and preloads the main script from the page.
- No share pictures (the 2560x1440 cover was cut down to a poster in `public/game-posters/canyon-rush/`).

## Rebuild

The runtime files (`assets/`, `fonts/`) are not duplicated here; they live in the built copy. To rebuild, copy `N00B_fixed/instagram/public/games/canyon-rush/{assets,fonts}` into a `public/` folder next to this one, then (work on a drive with space, e.g. D:):

```
npx pnpm@10.18.0 install
npx pnpm@10.18.0 test      # 26 simulation tests
npx pnpm@10.18.0 build     # type check + build + warm.json
```

Copy `dist/` over `public/games/canyon-rush/` (keep `assets/` and `fonts/` when unchanged) and restart the preview server.

## Licences

Fonts: Sora and Figtree (SIL OFL, notices in `fonts/`). Three.js (MIT). The supplied package said its models, textures and sounds came from a source package whose licence notices must travel with them; no separate notice file was in the archive.
