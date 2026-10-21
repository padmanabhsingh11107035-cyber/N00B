# Super Dungeon

A 3D third-person superhero high school dungeon roguelike built with Three.js + TypeScript + Vite.
After curfew, Super Academy sinks into the Underhall, a sealed vault under the school. You play a
student hero who starts every run in the Hall of Origins hub and descends through two seeded floors:
a school wing guarded by **The Proctor**, then **The Stacks Below**, a ghost-lit archive guarded by
**The Librarian**. Both bosses have three phases. Along the way you rescue classmates and draft powers.
Both bosses wear simulated gowns with red-and-gold trim, using the same body-collided cloth as the
hero's cape (`scripts/boss-cape.mjs` checks them for clipping; `scripts/cape-clip.mjs` and
`scripts/cape-diag.mjs` check the hero).

```bash
pnpm install
pnpm dev      # PORT/HOST from env, defaults to 127.0.0.1:3000
pnpm build    # typecheck + production build
pnpm test     # unit tests: dungeon generator, run rules, save schema
pnpm smoke    # with the dev server running: headless playthrough + screenshots in smoke-shots/
```

Debug: open with `?debug=1` to expose `window.__aegis` (e.g. `__aegis.startRun(12345)`).

## Controls

| Action | Keyboard + mouse | Gamepad |
| --- | --- | --- |
| Move / look | WASD / mouse (click to capture) | Left / right stick |
| Combo punch | Left click or J | X / RT |
| Power bolt | Right click or K | RB / LT |
| Sprint (hold) | Shift | L3 (touch: push the stick to the rim) |
| Jump (clears slams, acid, shockwaves) | Space | A |
| Dash (i-frames) | C | B |
| Super Nova (full power) | Q | LB |
| Interact | E | Y |
| Map / pause | Tab or M / Esc | View / Start |

Touch is supported with a virtual stick, look drag and action buttons. If pointer lock is
unavailable (some embedded previews), hold a mouse button and drag to look.

### Movement training (first-time players)

A short three-drill coach card appears in the Hall of Origins shortly after a new player first
arrives: **Sprint** (hold Shift for about a second), **Jump** (twice) and **Dash** (twice). Each drill only
advances when the hero actually performs the move; prompts follow the active input method
(keyboard, gamepad or touch), and the Dash slot or touch buttons pulse while being taught.
Finishing or skipping sets `tutorialDone` in the save, and the player stays in the hub.
Replay it any time from the hub pause menu (**Movement Training**); a replay also finishes or closes
in place and never starts a run. Logic: `src/game/tutorial.ts`; browser check:
`node scripts/tutorial-check.mjs`.

## Dungeon generation (`src/game/dungeon.ts`)

This is a pure, seeded and deterministic function (`generateDungeon(seed, { floor })`) with no Three.js dependency.
Floor 2 uses `floorSeed(runSeed, 2)`, so one run seed replays both floors exactly.

1. **Wing theme:** Floor 1 picks one of five wings: Corrupted Classrooms, Unstable Science Labs,
   Trophy Hall Gauntlet, Haunted Library Stacks or Anti-Gravity Gym. Floor 2 is always The Stacks
   Below, with its own palette, hazards and enemy mix, bigger waves and floor-only lore pages. The
   wing sets the palette, props, hazards, enemy weights and lighting.
2. **Critical path:** a random walk on a room grid from the entrance to a reserved boss slot. The
   boss always keeps a free neighbour reserved for the exit portal.
3. **Branches:** optional side rooms (heal, shop, rescue, challenge, treasure, lore) attach to path
   rooms through free door sockets.
4. **Templates:** each room gets an authored chunk whose door sockets match its connections.
5. **Pacing rules:** a danger rating per room, no more than two high-danger rooms in a row, at least
   one healing opportunity before the boss, and an elite room placed late on the path.
6. **Population (after geometry is valid):** each room gets enemy waves from the wing's weighted
   roster, plus hazards (pulse traps, acid, sweeping lasers), rewards, props and light colour.
7. **Validation:** a flood fill over the rasterised tile map proves that every room and door is
   reachable. If generation still fails after several attempts, a safe authored fallback layout is used.

After The Proctor falls, the exit portal drops you to Floor 2 with your build, HP (plus a 25%
breather heal) and credits intact. The Librarian fights with telegraphed page-storm spirals, falling
bookshelves on floor stripes, an expanding "SHHH!" silence wall (dash through it or outrun it),
summoned overdue notices and, from phase 2, blinks across the reading room.

The same seed always gives the same floor. Seeds are shown in the pause menu and results screen,
and can be typed at the Vault Portal to replay a layout.

## Staged loading (`src/engine/streamer.ts`)

Nothing loads before it is needed. Assets are grouped into stages of play:

| Stage | Loads | When |
| --- | --- | --- |
| `title` | Campus models/textures, scene shaders, menu sounds | Right after the title appears (the campus goes live behind the poster) |
| `wave1` | Shaders for every enemy, pickup, hazard and room prop; combat sounds | Background, before the first run |
| `hub` | Campus music | Background |
| `floor1` | Floor 1 music, heal/rescue/defeat sounds | Background |
| `boss1` | The Proctor's shaders and sounds, boss music, descent sound | Background, prioritised next to the boss door |
| `floor2` | The Stacks music | Background |
| `boss2` | The Librarian's shaders (incl. shelves and silence waves), her sounds, boss and victory music | Background |

- **Instant title:** boot needs only the JS, CSS, fonts and a ~100 KB pre-rendered campus poster
  (`public/title/campus.webp`, regenerated with `scripts/assets/title-poster.mjs`), so the menu
  is interactive in about half a second. The live 3D campus is built, texture-primed and
  shader-warmed behind the poster (in small time-sliced steps), then cross-fades in. Clicking
  *Start Patrol* before it's ready shows the curtain with progress and continues automatically.
- Later stages trickle in one task per frame: the current stage and the next one first, then
  the rest.
- **Heat gating:** background loading pauses while a fight is hot (locked room, live enemies,
  particles, projectiles and telegraphs; boss fights always count as hot). It resumes only
  after a second of calm, so decoding and shader compiles never compete with a busy screen.
- Run start and floor descent swap scenes behind a short curtain that waits only for the
  stage's essential tasks and the new level's shaders, never for music buffering.
- Shader warm-up (`Renderer.warm`) compiles against the composer's render target, including
  shadow-depth and post-pass variants. With `KHR_parallel_shader_compile` it uses `compileAsync`;
  without it, it compiles one material at a time within a per-frame budget, so no single frame
  stalls.
- Clips that aren't loaded yet play their synthesized fallback, and failed tasks count as done,
  so a slow or broken download never blocks play.
- Dev server (and the Cloud Preview): gzip/brotli responses, minified pre-bundled deps, and
  dependency source maps served on demand instead of inlined. three.js goes from 6 MB to 0.18 MB
  on the wire.

## Layout

| Path | Role |
| --- | --- |
| `src/game/content.ts` | Wings, room templates, enemies, upgrades, relics, classmates, lore |
| `src/game/dungeon.ts` | Seeded generator, validation, fallback |
| `src/game/rules.ts` | Stat derivation, upgrade rolls, damage and merit math |
| `src/game/level.ts` | Instanced toon geometry, doors, lights, collision, flow-field pathing |
| `src/game/hero.ts`, `enemies.ts`, `hazards.ts` | Combat actors and telegraphs |
| `src/game/boss.ts`, `librarian.ts` | `BossActor` interface, The Proctor (Floor 1), The Librarian (Floor 2) |
| `src/game/character.ts`, `actors.ts` | Skinned characters, clip retargeting, hero cape, classmates, rescue sequence |
| `src/game/dances.ts` | Six hand-keyed victory dances (one per classmate) built as clips at load time |
| `src/game/game.ts` | Modes, run lifecycle, room flow, rewards, results |
| `src/ui/ui.ts` | DOM HUD, menus, modals, map, touch controls |
| `src/engine/*` | Loop, renderer, input, audio mixer, staged asset streamer, versioned save |
| `public/audio/`, `scripts/process-audio.sh` | Game-ready music/SFX, and the script that levels raw generations into them |

## Rules for changes

- Gameplay state changes only in fixed `step()` ticks; visuals in `render()`.
- Generation and rules stay pure and unit-tested; keep `pnpm test` and `pnpm smoke` green.
- Keep `pnpm build` within the bundle budget in `scripts/check-size.mjs`.

## Credits

Fonts: Bangers, Sora, Figtree, all under the SIL Open Font License 1.1 (see `public/fonts/*-OFL.txt`).
Library: three.js (MIT). All models are procedural.

Audio: the music (campus hub, Floor 1, Floor 2, both boss themes and the victory fanfare) was
generated with Google Lyria, and the 29 sound effects with ElevenLabs. `src/engine/audio.ts` streams
the music with crossfades. While you explore, the floor track sits behind a low-pass filter that opens
up in fights. Sound effects are decoded after the first click. If any file fails to load, the
matching synthesized Web Audio fallback plays instead.
