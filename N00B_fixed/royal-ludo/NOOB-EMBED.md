# Royal Ludo (NOOB Games page)

The classic race home for 2 to 4 players (people or computer players: relaxed, balanced, strategic), Classic with 4 tokens or Quick with 2. Plain files, no build step, no network, nothing to install. Made by NOOB developers.

The page is served at `/games/royal-ludo/` (`N00B_fixed/instagram/public/games/royal-ludo/`) and shown on the Games page in a frame.

## What is different from the supplied package

- `source/` here is the supplied game (`index.html`, `styles.css`, `game.js`) as it came. The served copy differs in only a few things (`N00B_fixed/instagram/public/games/royal-ludo/`):
  - the script and the style are separate files (the site's security policy does not allow a script written into a page), asked for with a version number (`?v=`): **raise the number in `index.html` after changing a file** (they are kept for a year);
  - the title, the author tag and the header say "Made by NOOB developers"; the save key is `noob.royalludo.v1` (this site holds the saves of every game);
  - `fit.css` is new: on a phone (or any screen up to 820 px wide, or lower than 560 px) the page is exactly as tall as the screen and does not scroll: the board takes the biggest square that leaves room for the players, the dice and the buttons (CSS container units), the long texts are left out, the windows are compacted; held sideways the board is on the left and the controls on the right. Bigger screens keep the original page.
- The preview pictures, the test page and the build script of the package are not kept (its browser test needs the standalone file).

## Tests

`node --liftoff-only scripts/supabase/test-royal-ludo.mjs` in `N00B_fixed/instagram`.
