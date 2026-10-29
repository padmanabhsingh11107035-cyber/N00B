# Siegecraft (NOOB Games page)

A 3D catapult game: wind the arm, find the angle and bring down two castles (a wooden fort and a bluestone keep) that are built from hundreds of separate pieces, so every wall, tower and guard really falls. Red powder barrels chain the blast, big hits play out in slow motion, and the fewer stones you use the more stars you win (1 to 3 per castle, with an on-device leaderboard). Built with Three.js and the Rapier physics engine; the castles, the catapult, the music and the sounds are made by the game itself, so besides its scripts there is only a small stone model, the logo and three fonts to download.

**Made by NOOB developers.** The line is on the loading screen, the title screen and in Settings, in the page's title, and in its `author` and `description` tags.

The built game is served from this site at `/games/siegecraft/` (folder `N00B_fixed/instagram/public/games/siegecraft/`) and shown on the Games page in a frame (`src/components/Games/minigames/HostedGameFrame.tsx`). It always plays sideways: the frame goes full screen on a phone and turns the game 90 degrees when the phone is held upright (turn the phone and it straightens by itself); opened on its own, the first touch asks for full screen held sideways, and an upright phone sees a "Rotate your device" card.

## What is different from the supplied package

- All files and settings of the tool the game was made with are gone: the live-tuning panel and its code (`src/game/tuning.ts` and every hook to it), the sharing and asset-restore scripts, the share pictures, the notes and checklists, the preview-host test, the browser smoke scripts and their screenshots.
- Nothing is loaded from anywhere else. The stone model is a file of the build (`src/assets/stone-projectile.glb`, imported with `?url`, so it is fingerprinted in `build/`; the web address and the program name its file carried in its description are taken out, the model data is untouched), and the logo is `public/logo.png` (the 1920 px icon with its white backdrop cut away, shrunk to 192 px).
- The save is kept under `noob.siegecraft.save`, because this site holds the saves of every game.
- The Chinese font (1.9 MB) is only fetched when Chinese text is shown: `unicode-range` on its `@font-face` in `src/styles/main.css`, and the hint icons and the two-letter language button no longer use it. An English player never downloads it.
- The script, style and model files get a fingerprint in their name and live in `build/` (`vite.config.ts`); `scripts/make-warm.mjs` writes `warm.json` (the files the Games page fetches quietly in advance).
- The credit line and the "Rotate your device" card are new (`src/ui/ui.ts`, `src/styles/main.css`, both locale files); so is the full-screen request on the first touch (`src/main.ts`).

## Rebuild

Work on a drive with space (e.g. D:), with a copy of this folder:

```
npx pnpm@10.18.0 install
npx pnpm@10.18.0 test      # 17 tests (rules, saves, texts, engine); AUTOPLAY=1 also lets a bot play both castles (slow)
npx pnpm@10.18.0 build     # type check + build + warm.json
```

Copy `dist/` over `N00B_fixed/instagram/public/games/siegecraft/`, then run `node --liftoff-only scripts/supabase/test-siegecraft.mjs` in `N00B_fixed/instagram`, commit, and push to both branches.

## Licences

Fonts: Sora, Figtree and Noto Sans SC (SIL OFL 1.1, notices in `public/fonts/`, copied into the build). Three.js (MIT), Rapier (Apache-2.0).
