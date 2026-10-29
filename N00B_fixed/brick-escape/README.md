# Brick Escape

A sliding-brick puzzle on NOOB's Games page. A tray is full of studded bricks and has coloured doors in its walls; slide the bricks out of the way and out through the door of their own colour until the tray is empty. 40 levels, 1 to 3 stars each (the fewer moves the better), a hint, undo, a levels list and a ranking (the highest level each player has cleared).

The game is plain files (no build step, no network), served from the site itself at `/games/brick-escape/` and shown in a frame on the Games page:

| file (in `instagram/public/games/brick-escape/`) | what it is |
|---|---|
| `rules.js` | the rules and the solver (A* search with a safe estimate, so the first way found is a shortest one); no screen in it |
| `levels.js` | the 40 levels, **generated** (see below), with the shortest way out of each stored for the hint |
| `game.js`, `game.css`, `index.html` | the screen: sizing, dragging, sounds (made with Web Audio, no files), progress (localStorage), the ranking messages |

## The levels

`node generate-levels.mjs` (about 15 seconds, the result does not change between runs: the random numbers are seeded) writes `levels.js`. Levels 1 to 3 are made by hand to teach one thing each; the rest are built **backwards**: bricks are put into an empty tray through their own doors and shuffled with legal slides, so every level can be won; then the solver finds the shortest way (the par) and the level is kept only when that is the length wanted for its place in the game. `node generate-levels.mjs 10 20` only tries levels 10 to 20 and prints them. `PROBE=1 node generate-levels.mjs 25` shows what boards for level 25 look like.

## Tests

`node --liftoff-only instagram/scripts/supabase/test-brick-escape.mjs` (rules, solver against a plain search, every level played out) and `test-brick-escape-db.mjs` (the ranking on a real Postgres). After changing a file of the game, raise its `?v=` number in `index.html` (the files are cached for a year).

## Ranking

`instagram/supabase/migrations/20261030000001_brick_escape_board.sql`: one row per player (the best level), levels one after the other and never faster than 3 seconds each; the page (`HostedGameFrame`) passes the game's "level cleared" and "ranking" messages on.
