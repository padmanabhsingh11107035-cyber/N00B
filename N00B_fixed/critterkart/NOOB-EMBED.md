# Critter Kart (NOOB Games page)

A 3D item kart racer: pick one of six critter drivers, race five rivals over three laps of Frosting Loop Valley, drift for boosts and use candy-box items. Built with Three.js and the Rapier physics engine; every model, the music and the sounds are made by the game itself at run time, so there is nothing to download besides its scripts and two small fonts.

The built game is served from this site at `/games/critterkart/` (folder `N00B_fixed/instagram/public/games/critterkart/`) and shown on the Games page in a frame (`src/components/Games/minigames/HostedGameFrame.tsx`). It always plays sideways: the frame goes full screen on a phone and turns the game 90 degrees when the phone is held upright; opened on its own, the first touch asks for full screen and a landscape lock, and the game's own "Rotate your device" card shows while the phone is upright.

## What is different from the supplied package

- All files and settings of the tool the game was made with are gone (dev hooks, sharing and asset-restore scripts, share pictures, the preview-host test, the browser smoke script).
- The online leaderboard client and its server are gone (`leaderboard.js`, `server/`): the game's own, on-device leaderboard stays. The "online result" line on the results screen and its texts are gone with it.
- The script and style files get a fingerprint in their name and live in `build/` (`vite.config.ts`), so they can be cached for ever; `scripts/make-warm.mjs` writes `warm.json` (the files the Games page fetches quietly in advance) and preloads the main script from the page.
- The first touch on a phone, when the game is opened on its own, asks for full screen held sideways (`src/main.ts`).

## Rebuild

The fonts are not duplicated here; they live in the built copy. To rebuild, copy `N00B_fixed/instagram/public/games/critterkart/fonts` into a `public/fonts` folder next to this one, then (work on a drive with space, e.g. D:):

```
npx pnpm@10.18.0 install
npx pnpm@10.18.0 test      # 17 tests (race rules, spline, texts)
npx pnpm@10.18.0 build     # type check + build + warm.json
```

Copy `dist/` over `public/games/critterkart/` and restart the preview server.

## Licences

Fonts: Sora, Figtree and Noto Sans SC (SIL OFL 1.1, notices in the built copy's `fonts/`). Three.js (MIT), Rapier (Apache-2.0).
