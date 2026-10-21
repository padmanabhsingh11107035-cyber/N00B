# Underhall: After Curfew

A third-person 3D superhero high-school dungeon roguelike (Three.js + TypeScript + Vite). After curfew the academy sinks into the Underhall: you start in the Hall of Origins hub, descend two seeded floors, rescue classmates, draft powers and face **The Proctor** and **The Librarian**.

It runs inside NOOB Socials as a game of its own, served from `/games/underhall/` and shown in a frame on the Games page (see `N00B_fixed/instagram/src/components/Games/minigames/HostedGameFrame.tsx`).

## Where things are

| Path | What it is |
| --- | --- |
| `index.html`, `src/main.ts` | The page and its entry (the entry only imports the game) |
| `src/game/config.ts`, `src/game/tuning.ts` | Gameplay numbers (speeds, jump, dash, camera) and their safe limits |
| `vendor/super-dungeon/src/` | The whole game: engine (renderer, input, audio, save, loop, streaming), game (hero, enemies, bosses, dungeon, level, hub, effects), UI |
| `vendor/super-dungeon/public/` | Everything the game loads: models (`models/`), textures (`tex/`), music and sounds (`audio/`), effects (`fx/`), fonts (`fonts/`), the title picture (`title/`) |
| `vendor/super-dungeon/tests/` | Unit tests (dungeon generator, run rules, save, tutorial, streamer) |
| `vendor/super-dungeon/scripts/` | Checks and helpers (smoke run, cape checks, art build scripts) |
| `vendor/super-dungeon/docs/` | The visual design notes |
| `vendor/super-dungeon/assets/share/`, `assets/share/` | The game's cover picture and icon |
| `vendor/super-dungeon/assets/source/**/License*.txt` | The licences of the art the game was made from |

The large raw art the models were made from (Blender files, source textures, the baked character data, about 220 MB) is not in the repository: it is one file in the repository's **Releases** (`underhall-source-art`). See `ASSET_ARCHIVE.md`.

## Run and build

```bash
npx pnpm@10.18.0 install
npx pnpm@10.18.0 dev         # http://127.0.0.1:3000
npx pnpm@10.18.0 test        # the game's unit tests
npx pnpm@10.18.0 build       # typecheck + production build into dist/
```

To update the game inside NOOB: build, then replace the contents of `N00B_fixed/instagram/public/games/underhall/` with `dist/`.

## Controls

| Action | Keyboard and mouse | Gamepad | Phone / tablet (held sideways) |
| --- | --- | --- | --- |
| Move | WASD / arrows | Left stick | Joystick (left thumb) |
| Look | Mouse (click to capture) | Right stick | Drag on the right half |
| Combo punch | Left click / J | X / RT | PUNCH |
| Power bolt | Right click / K | RB / LT | BOLT |
| Jump | Space | A | JUMP |
| Dash | C | B | DASH |
| Super Nova | Q | LB | NOVA |
| Run | Shift | L3 | RUN (tap on / off) or push the stick to its rim |
| Interact | E / F | Y | USE (appears next to something to use) |
| Map / pause | Tab or M / Esc | View / Start | MAP / II |

The on-screen controls are built only on phones and tablets (a finger is the main pointer). Held upright, the page asks for the phone to be turned sideways; inside NOOB the game is turned for the player. Add `?touch=1` to the address to force them on for testing, and `?debug=1` to expose `window.__aegis` (for example `__aegis.startRun(12345)`).

## Credits

Characters, animations and props are built from CC0 art (Quaternius, Poly Haven, Kenney); the licences are kept next to the notices under `vendor/super-dungeon/assets/source/`. Fonts: Bangers, Sora and Figtree (SIL Open Font License, files in `vendor/super-dungeon/public/fonts/`).
