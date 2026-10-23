# NOOB Cold Drinks

A scrolling page of ten 3D cans (three.js), served by the app at **/cold-drinks/** (`N00B_fixed/instagram/public/cold-drinks/` is the built copy). Scroll and the cans slide up one by one, the one in front
turns, the page takes its colour, and the text beside it (under it, on an upright phone) follows. A link can open on one can: `/cold-drinks/#cherry-blaze` (or `#8`).

Everything is made in code, there is no 3D model or picture to download (only the NOOB wordmark, 22 KB):

- `src/flavors.js` — the ten cans: name, tagline, notes, price, sweet / fizz, the colours of the page and the colour of the can. **This is the file to change a name, a price or a colour.**
- `src/paint.js` — draws the printed artwork of a can on a canvas wrapped round it: ONE colour all the way down, a ring at the top (black, gold on the black can), the big NOOB logo as a block-letter
  sticker (thick outline, a 3D side shaded with pen hatching) and hand-drawn doodles (paper plane, ghost, hearts, arrows ... and the icons of the app's wallpaper), all in one line colour.
- `src/can.js` — the can itself: a sleek 330 ml can with a body that curves smoothly into the lid (the top never bends inwards), a rolled rim, a sunk lid with the opening and the pull tab,
  coloured metal under a glossy clear coat, droplets, and `studioEnvironment` (the light of a photo studio: tall soft boxes that the metal reflects). Sizes in `src/dims.js`.
- `src/main.js` — the scene, the scrolling, the text panels.

## Build

The built files go straight into the app's public folder. On this PC `C:` is nearly full, so the packages are kept on `D:`:

```
D:\noob-cold-drinks\node_modules      (npm install three vite)
C:\n00b-work\N00B\N00B_fixed\cold-drinks\node_modules   (a folder link to the one above)
```

```
cd N00B_fixed/cold-drinks
npm run dev       # a preview at http://127.0.0.1:5190/
npm run build     # builds into ../instagram/public/cold-drinks/
```

Then run `node scripts/supabase/test-cold-drinks.mjs` in `N00B_fixed/instagram`, commit, and push to both branches.

The wordmark is `src/assets/noob-wordmark.png` (a copy of `instagram/public/brand/noob-wordmark.png`).
