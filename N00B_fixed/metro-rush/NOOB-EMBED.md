# Metro Rush (NOOB Games page)

Colourful 3D endless runner (Three.js script-tag build, plain files, no build step). Made by NOOB developers. Served at `/games/metro-rush/` (`instagram/public/games/metro-rush/`); `source/` is the supplied design handoff as it came (its README describes every screen and tuning value).

Differences from the supplied page: the Google Fonts links are gone (the page falls back to Arial Black/Nunito-less system fonts; bundle Lilita One and Nunito later if the exact lettering matters); the script, style and the six game scripts carry `?v=` (raise it after a change; they are cached for a year); title/author "Made by NOOB developers"; saves are `noob.metrorush.best` and `noob.metrorush.outfit`.

`public/_headers` is at exactly 100 rules (Cloudflare's limit): before adding another game, merge rules.
