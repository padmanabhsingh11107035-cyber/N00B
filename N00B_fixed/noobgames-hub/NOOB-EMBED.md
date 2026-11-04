# NOOB Party Pack (noobgames-hub, NOOB Games page)

Dashboard of quick 1 to 4 player games on one screen. Served at `/games/noobgames-hub/` (`instagram/public/games/noobgames-hub/`). `source/index.html` is the supplied page as it came.

Differences: styles and the two scripts are separate files (`styles.css`, `core.js`, `game.js`, `utilities.css`, asked for with `?v=`: raise the number after a change); the Tailwind web script (another site) is replaced by `utilities.css` (the few classes it used + the basic reset); Google Fonts links are gone (system font); title/author "Made by NOOB developers".

Test: `node --liftoff-only scripts/supabase/test-noobgames-hub.mjs` in `instagram`.
