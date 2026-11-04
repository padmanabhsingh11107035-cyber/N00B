# NOCTA (NOOB Games page)

UNO-style card game for 2 to 10 players (computer players or pass and play). Made by NOOB developers. Served at `/games/nocta-uno/` (`instagram/public/games/nocta-uno/`), shown on the Games page in a frame.

Differences from the supplied page (`source/index.html`, kept as it came): the styles and the two scripts are separate files (`styles.css`, `core.js`, `game.js`, asked for with `?v=`: raise the number after changing one; they are cached for a year); the Google Fonts links are gone (system font); the **Online room** mode (it loaded PeerJS from another site) is removed, `loadPeer` just refuses; title/author say "Made by NOOB developers".

Test: `node --liftoff-only scripts/supabase/test-nocta-uno.mjs` in `instagram`.
