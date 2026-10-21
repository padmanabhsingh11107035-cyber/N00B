# Helix Fall — Standalone Source

Portable source for a responsive Three.js Helix Drop remix. It includes the game code, generated orb model, supplied game fonts and licenses, and a game-specific favicon.

## Run and build

Requires Node.js and pnpm 10.18 or newer.

```bash
pnpm install --frozen-lockfile
pnpm dev          # http://localhost:3000
pnpm typecheck
pnpm test
pnpm build        # production site in dist/
```

The optional `pnpm smoke` browser test uses Playwright; install its Chrome binary first with `pnpm exec playwright install chrome`.

## Controls

- **Keyboard:** A/D or Left/Right rotate; Space/Enter start or confirm; Escape/P pause.
- **Mouse:** drag across the game canvas to rotate the tower.
- **Touch:** drag across the game area or hold the on-screen rotate buttons.
- **Gamepad:** left stick or D-pad rotate; A confirms; Start pauses.

The tower rotates while the ball falls automatically. Align an opening before the ball reaches a platform, descend safely, and chase a high score. The game includes the daily tower and random practice.

## Put it on the noobsocials.com game page

After `pnpm build`, upload **all contents of `dist/` together** to a static path on the site, such as `/games/helix-fall/`. The output uses relative URLs, so its JavaScript, model, favicon, and fonts work below the site root. Do not upload only `index.html`.

If the game page supports an iframe, embed the hosted path (adjust it to your chosen route):

```html
<iframe
  src="/games/helix-fall/"
  title="Helix Fall"
  allow="autoplay; fullscreen"
  allowfullscreen
  style="display:block;width:100%;height:100vh;border:0"
></iframe>
```

If noobsocials expects source integration rather than an iframe, use this folder with its normal Vite/TypeScript build pipeline; do not paste TypeScript directly into an HTML-only field. Keep the `assets/`, `public/fonts/`, `src/`, and `server/helix-rules.mjs` paths together. High scores and language choice are stored in browser storage for the game's origin.

## Scope and credits

English and Simplified Chinese are included. Daily/all-time rankings are stored only on the current device. The approved Game Blueprint left online features unselected, so this export has no global leaderboard, server, database, authentication, or remote score submissions. The retained `src/online/leaderboard.ts` is unused by the game entry point; it is preserved from the supplied source archive, not activated.

The source is based on the user-supplied Helix Drop archive and retains its visible credit. Sora, Figtree, and Noto Sans SC use the supplied SIL Open Font License 1.1 notices. The supplied archive has no separate source-code LICENSE file; see [ASSET_PROVENANCE.md](ASSET_PROVENANCE.md). Unused starter font files remain under `reference-assets/template-fonts/` and are not bundled.

The standalone source includes no separate Open Graph/social cover; the game-specific favicon is included. No game backend or public deployment is part of this ZIP.
