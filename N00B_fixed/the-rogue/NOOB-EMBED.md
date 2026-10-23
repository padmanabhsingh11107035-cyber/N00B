# The Rogue: Shadowfall (NOOB Games page)

A dark-fantasy 3D roguelite built on Three.js: bind one of seven elements to each of four sigils (the Sigil Forge), pick relics that change your spells, then **Descend** through warden-sealed depths or survive the endless **Crucible** arena. Solo.

The game is served from this site at `/games/the-rogue/` (folder `N00B_fixed/instagram/public/games/the-rogue/`) and shown on the Games page in a frame (`src/components/Games/minigames/HostedGameFrame.tsx`).

## What was supplied, and what is not here

- The supplied archive holds only the **compiled** game (a page, six scripts, one style sheet, two fonts and two sharing pictures): there is **no source code**, so there is no source folder here, only `make.mjs` (below) and the two pictures made for the game (`art/`).
- The archive does **not** contain the 92 media files the game lists (24 models, 17 textures, 15 interface pictures, 36 sounds) and not the rigged hero model either. The game draws its own world and characters and synthesises its own sounds when those files are absent, so it is fully playable, but it looks plainer than the original. If the media files turn up, drop them into `public/games/the-rogue/{models,tex,ui,vfx,audio}/`, remove the "file loader" change in `make.mjs` (the one that stops the game asking for them) and rebuild.
- The archive's own page carries the maker's tracking and sharing code; it is **not** kept in the repository (not even the original archive). `make.mjs` reads an unpacked copy of it.

## What `make.mjs` does

`node make.mjs <unpacked supplied folder> [output folder]` writes `public/games/the-rogue/`:

1. keeps the scripts, style and fonts; writes our own clean page (no tracking, no sharing parts);
2. renames three internal words that carried the maker's name (nothing else about them changes);
3. makes the leaderboard client's network call fail at once (there is no leaderboard service on this site; a run is simply not ranked) and hides the Online and Leaderboards menu entries (`the-rogue.css`);
4. stops the game asking for the media files that are not there, and replaces every interface picture address except the title picture by an empty 1x1 picture, so the game loads with no failed requests and the loading bar fills at once;
5. adds `ui/logo.webp` (the golden wordmark cut from the cover art) and `icon-192.png`;
6. **touch screens** (inside the game's input class): a phone or tablet starts as "touch", so the first hints are "USE", "DASH", "SPELL" and not "E", "Space", "Esc"; the mouse events the browser makes up after every tap or drag are ignored (they used to make the game think a mouse was in use: the hints went back to key names and the sticks seemed dead); dragging a finger on the picture turns the camera, and with it the character, like a mouse would (the camera code accepts that input on touch); the "E / Open" prompt over a chest, door or shrine can be tapped; the "Click to take control of the camera - Esc releases the mouse" hint is hidden on touch;
7. writes `warm.json`, the list of files the Games page fetches quietly in advance (the whole game is about 1.2 MB), and preloads all scripts from the page.

Every change is checked: the script stops if a text it must change is not found the expected number of times, and if the maker's name is still anywhere in the output.

## Phones and tablets

The game has its own touch controls (two sticks, ULT / SPELL / DASH / USE buttons, pause). Inside NOOB, Play goes full screen on a touch device and an upright phone gets the game turned sideways (`HostedGameFrame`).
