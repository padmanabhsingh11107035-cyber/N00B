# Color Sort (NOOB Games page)

A pouring puzzle: tap a bottle, tap where its top colour should go (an empty bottle, or the same colour on top), until no bottle or tube holds two colours. The big tube on the left holds 10 units, a bottle 4. 30 levels, from 6 bottles to a full board of 24 bottles. Made for NOOB, with its own drawing, rules, sounds and levels.

## Where things are

The game itself is plain files with no build step: `N00B_fixed/instagram/public/games/color-sort/`

| File | What it is |
| --- | --- |
| `index.html`, `game.css` | The page (white background, a thin bar on top, the bottles in the middle) |
| `rules.js` | The rules only (what a pour is, when the puzzle is solved). The page, the solver and the tests all run this same file |
| `game.js` | The drawing (one svg that scales to the screen), the pour animation, the sounds (made in the browser, no sound files), undo / restart, saved level |
| `levels.js` | The 30 levels (written by `generate-levels.mjs`, do not edit by hand) |

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
