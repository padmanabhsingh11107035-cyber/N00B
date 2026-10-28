# Color Sort (NOOB Games page)

A pouring puzzle: tap a bottle, tap where its top colour should go (an empty bottle, or the same colour on top). Every bottle holds 4 units and every colour is exactly 4 units, so a colour can fill one bottle completely: that bottle gets a cap and is finished (it can not be used any more). The level is won when every bottle that holds anything is capped. 40 levels, from 3 colours to 14 (16 bottles). Made for NOOB, with its own drawing, rules, sounds and levels.

## Where things are

The game itself is plain files with no build step: `N00B_fixed/instagram/public/games/color-sort/`

| File | What it is |
| --- | --- |
| `index.html`, `game.css` | The page (white background, a thin bar on top, the bottles in the middle) |
| `rules.js` | The rules only (what a pour is, when the puzzle is solved). The page, the solver and the tests all run this same file |
| `game.js` | The drawing (one svg that scales to the screen), the pour animation, the sounds (made in the browser, no sound files), undo / restart, saved level |
| `levels.js` | The 40 levels (written by `generate-levels.mjs`, do not edit by hand) |

It is shown on the Games page in a frame (`src/components/Games/minigames/HostedGameFrame.tsx`, with `embedPortrait` so a phone keeps it upright) and has its own card in `src/components/Games/types.ts`.

## The levels

Every level was won by `solver.mjs` before it was kept, so none can be stuck from the start (a player can still pour themselves into a corner: Undo and Restart are always there). To make them again (a few seconds, the result does not change between runs):

```
cd N00B_fixed/color-sort
node generate-levels.mjs
```

The plan (bottles, colours, spare empty bottles for each level) is at the top of `generate-levels.mjs`. If a file of the game changes, raise the `?v=` number in `index.html`: the files are kept by the browser for a year (`public/_headers`).

## Tests

`node scripts/supabase/test-color-sort.mjs` (in `N00B_fixed/instagram`): the card, the rules, all 30 levels solved by the solver, the files, the headers and the portrait frame.

## The ranking

Inside NOOB the game tells the page around it (`HostedGameFrame.tsx`) each level that was cleared, and asks it for the ranking (the trophy button at the top): one `postMessage` each way, only between the game and its own page on this site. The page saves the level with `color_sort_level_done` and reads the board with `color_sort_leaderboard` (migration `20261029000001_color_sort_board.sql`, tested by `scripts/supabase/test-color-sort-db.mjs`). A level can only be 1 to 5 above the best on record, and no sooner than 3 seconds per level.
