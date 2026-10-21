# Helix Fall inside NOOB

This is the Helix Fall source from Manus, with two small changes so it can run inside the NOOB Games page (everything else is untouched):

1. `src/main.ts` — when the page is opened inside a frame with `?embed=1`, every finished run is posted to the page around it (`helixfall:run-end`: outcome, score, floors, totalFloors, stage). NOOB pays and ranks that result (see `instagram/src/components/Games/minigames/HelixFallGame.tsx`). Opened on its own, nothing changes.
2. `src/styles/main.css` — in that frame the "Share" and "Copy challenge link" buttons are hidden (they would link to this game's own page).

To change the game: edit here, then build and copy the result into the app:

```bash
pnpm install --frozen-lockfile
pnpm build
# replace the app's copy (keep ASSET_PROVENANCE.md there)
rm -rf ../instagram/public/games/helix-fall/assets ../instagram/public/games/helix-fall/fonts
cp -r dist/. ../instagram/public/games/helix-fall/
```

The site's security rules for that folder are in `instagram/public/_headers` (it is the only place the app may be framed, by itself only).
