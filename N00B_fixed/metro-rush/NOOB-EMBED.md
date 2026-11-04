# Metro Rush (NOOB Games page)

Colourful 3D endless runner (Three.js script-tag build, plain files, no build step). Made by NOOB developers. Served at `/games/metro-rush/` (`instagram/public/games/metro-rush/`); `source/` is the supplied design handoff as it came (its README describes every screen and tuning value).

Differences from the supplied page: the Google Fonts links are gone; Lilita One (400) and Nunito (700, 800, 900), Latin subsets under the SIL Open Font License, are served from `fonts/` (the CSS `@font-face` rules are appended to `metro-rush.css`; notice in `fonts/OFL.txt`); the script, style and the six game scripts carry `?v=` (raise it after a change; they are cached for a year; the style is at `?v=2` since the fonts were added); title/author "Made by NOOB developers"; saves are `noob.metrorush.best` and `noob.metrorush.outfit`.

`public/_headers` is at exactly 100 rules (Cloudflare's limit): before adding another game, merge rules.
