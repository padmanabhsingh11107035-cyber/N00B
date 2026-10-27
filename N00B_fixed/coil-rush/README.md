# Coil Rush

A 3D worm-arena game for the browser, built with three.js. Steer a glowing cosmic worm, grow by
eating motes, swallow planets and stars for permanent powers, dodge asteroids, energy gates and gravity wells,
and chase a personal best in free-for-all or 6 v 6 team battles against AI worms. Everything is offline: nothing
is sent anywhere, records are kept on the device.

```bash
npm install
npm run dev        # dev server on http://127.0.0.1:3000
npm test           # 39 tests (rules, threats, bites, texts, assets)
npm run build      # type check + production build + warm.json
```

## Controls

| Action | Mouse / keyboard | Touch | Gamepad |
| --- | --- | --- | --- |
| Steer | The worm follows the cursor (or A / D, arrows) | Drag anywhere on the left | Left stick |
| Boost | Hold click, or Space / W / up | Hold the right side | A or RT |
| Pause | Esc / P | Pause button | Start |

Boosting spends length. Swallowing a planet, a star, a comet, a moon or a pulsar gives a permanent power for the
match; the crown (length 30+) pays a bounty to whoever takes it.

## Where things are

| Path | Role |
| --- | --- |
| `src/game/` | the rules, the simulation (`sim.ts`), the AI worms, threats, tuning values (`config.ts`) |
| `src/engine/` | loop, input, renderer (three.js), audio, saves, texts, the staged asset loader (`assets.ts`) |
| `src/ui/` | menus, HUD, minimap, touch controls |
| `src/i18n/` | every visible text, English and Simplified Chinese |
| `scripts/make-warm.mjs` | writes `dist/warm.json`, the list of files the Games page fetches quietly in advance |

The pictures, sounds, model and fonts the game loads are not duplicated here: they live in the built copy
(`N00B_fixed/instagram/public/games/coil-rush/assets/`). To rebuild, copy that `assets` folder into a `public/assets` folder
next to this one, then (work on a drive with space, e.g. D:) run the three commands above, copy `dist/` over
`public/games/coil-rush/` and restart the preview server.

## Credits

Fonts: Sora, Figtree and Noto Sans SC, under the SIL Open Font License 1.1 (notices in the built copy's `fonts/`).
Library: three.js (MIT).
