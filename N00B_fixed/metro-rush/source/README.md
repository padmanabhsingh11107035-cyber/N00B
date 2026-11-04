# Handoff: Metro Rush — Colourful 3D Endless Runner

## Overview
Metro Rush is an original 3D endless-runner game for the browser, built on Three.js (r15x, script-tag build). The player runs down a three-lane rail corridor through a bright cartoon city. They dodge oncoming trains, jump barriers, roll under gates, run up ramps onto train roofs, and collect coins and power-ups. This package is the colourful, smoother "premium" upgrade:
- Every train is a locomotive plus 1–6 coaches, in 8 colour schemes.
- Moving trains always travel **toward** the player.
- Parked trains stand still; some have a ramp so you can climb onto the roof.
- Background trains run on two outer tracks.
- Rendering adapts to the device so play stays smooth.

## About the Design Files
The files in this bundle are **design references created in HTML/JS**. They are a fully playable prototype showing the intended look, feel and behaviour. They are not hardened production code. The task is to **recreate this design in the target environment** using its established patterns. That could be the existing web stack, or a game engine such as Three.js + Vite/TypeScript, Babylon, PlayCanvas, Unity WebGL or Godot. If no environment exists yet, pick the most appropriate one; the natural path is Three.js with ES modules + Vite + TypeScript. That said, the prototype runs as-is: open `Metro Rush.html` from a static server (`npx serve .`) and it plays.

## Fidelity
**High-fidelity.** Colours, typography, UI, 3D models, camera, tuning values and game rules are final. Recreate them faithfully. All 3D geometry and all textures are procedural (code-drawn via Canvas 2D). There are no external art files.

---

## Screens / Views

### 1. Loading
- Full-screen radial gradient: `radial-gradient(circle at 50% 35%, #5cbcff, #2f6bff 60%, #4a2bd6)`.
- Centred logo: "METRO" at 64px, white, with a dark `#1b1240` outline; "RUSH" at 82px in `#ffd23f`. Both use **Lilita One** and the logo is rotated −4°.
- Indeterminate bar: 220×14 px, radius 99, track `rgba(27,18,64,.35)`. The fill is a gradient `#ffd23f → #ff9a00`, animating `translateX(-100% → 250%)` over 1.1 s, ease-in-out, infinite.
- Caption "Painting the city…" (Nunito 800, 14px).
- Fades out over 0.5 s once the world is built and the shaders are compiled.

### 2. Home
- **Left hero block** sits 7% from the left, vertically centred:
  - Title "METRO" uses `clamp(64px,9vw,140px)`, white, with an 8-direction `#1b1240` text-shadow outline plus a `0 14px` drop.
  - "RUSH" uses `clamp(80px,11.5vw,180px)` with a gradient fill `#fff27a → #ffd23f → #ff9a00` and drop-shadow outlines.
  - The whole title is rotated −5°. A 3 s vertical "bob" of −6px is applied, with RUSH offset by 0.15 s.
  - Tag "DOWNTOWN LINE": pink `#ff3d7f` pill, radius 10, `box-shadow 0 5px 0 #1b1240`, rotated 2°, `nowrap`.
  - Subtitle "Dodge trains. Surf the roofs. Grab every coin." (Nunito 800, 18px).
  - **PLAY button**: min 250×82, radius 26, gradient `#9cff6a → #3fd14a → #22b03c`, `box-shadow 0 8px 0 #12802c`, white Lilita 44px text. It has an inner gloss highlight and a 1.8 s scale pulse to 1.04. When pressed it moves down 6px and the shadow shrinks.
  - "HIGH SCORE n" chip with a glass background `rgba(27,18,64,.5)` + blur 8.
- **Right-bottom "PICK YOUR STYLE"**: 3 outfit buttons, each 84 wide, radius 18, with a split-colour swatch circle (a conic gradient of the two outfit colours). The selected button turns yellow `#ffd23f`, lifts by −4px and scales to 1.05.
  - STREET: `#ff3b5c` / `#16c79a`
  - OCEAN: `#2fb8ff` / `#ff4fa3`
  - LIME: `#8dff5a` / `#ff8a1f`
- **Footer key hints**: white key caps 30×30, radius 9. Below 820px wide these are replaced by "SWIPE TO PLAY".
- **3D backdrop**: the camera sits beside the runner, who idles/jogs on the middle lane. A parked ramp train stands on the left lane and an oncoming train comes down the right lane. The world scrolls slowly at 3.5 m/s.

### 3. In-game HUD
- **Top-left**:
  - Score pill, 50px tall, glass `rgba(27,18,64,.55)` + blur, with a 2px border at `rgba(255,255,255,.25)`. It contains a yellow multiplier badge "x1"…"x10" and the score in Lilita 32px.
  - Below it, the coin pill (44px tall) with a CSS coin icon and the count in `#ffd23f`.
- **Top-right**: "BEST n" and "nn km/h"; also the sound and pause buttons, each 48×48 white with radius 16.
- **Power-up stack** (left, top 140px): 58×58 tiles with a conic-gradient ring showing time left (`--p`). Ring colours:
  - magnet `#ff4f6d`
  - shield `#2fd3ff`
  - sneakers `#7ee44a`
  - 2X `#b07bff`
- **Toast**: centre-top at 24%, Lilita `clamp(30px,5vw,54px)`, white with a dark outline. It pops in, wobbles, and fades over 1.6 s. Messages:
  - "GO GO GO!"
  - "COIN MAGNET!"
  - "SHIELD UP!"
  - "SUPER SNEAKERS!"
  - "DOUBLE COINS!"
  - "SHIELD SAVED YOU!"
- **Mobile**: 4 round buttons (◀ ▲ ▼ ▶), 58×58, plus swipe input.

### 4. Pause modal
Backdrop `radial-gradient(rgba(47,107,255,.45), rgba(27,18,64,.78))` + blur 6. The white card is 400 wide with radius 32 and a `0 10px 0 #9fb2e8` shadow. A pink tag "PAUSED" sits at the top. The heading "TAKE A BREATHER" is blue `#2f6bff`. Buttons: RESUME and END RUN.

### 5. Game-over modal
Same card style.
- **Tag**: "BUSTED!" (pink). On a new record it becomes "NEW HIGH SCORE!" in a yellow gradient with a wiggle animation.
- **Score**: big number, Lilita 76px, blue.
- **Tiles**: two white result tiles for COINS and DISTANCE.
- **Buttons**: RUN AGAIN (green) and MAIN MENU.

---

## Gameplay Rules (from `js/mr-game.js`)

| Constant | Value |
|---|---|
| Lane width | 3.2 m (lanes at x = −3.2, 0, 3.2) |
| Player z | 7 |
| Speed | 17 → 34 m/s (`17 + distance × 0.0055`) |
| Gravity | 32 m/s² (×1.8 while fast-falling with roll) |
| Jump velocity | 12.4 m/s (×1.3 with Super Sneakers) |
| Roll/slide | 0.8 s |
| Row spacing | every 32 m, spawned at z = −184 |
| Train roof height | ≈ 3.9 m; ramp length 7.8 m |
| Score | `distance × multiplier × 0.5`, multiplier = `1 + floor(distance/400)` (max 10) |

**Row generator.** There is always one reachable safe lane per row; the safe lane drifts at most one lane per row. Safe-lane contents:
- 30%: a **parked ramp train** with coins up the ramp and along the roof.
- Otherwise: a coin line, sometimes with a JUMP barrier or DUCK gate.

Other lanes get one of:
- An **oncoming train**, v = 8–14 m/s, plus up to 8 more with difficulty. It only spawns if the lane ahead is clear and another lane stays open for its whole pass.
- A **parked train**, 45% with a ramp.
- A barrier, a gate, or a buffer stop (must dodge).

**Collisions:**
- Train front → crash.
- Side-swiping a train mid lane-change → bounce back to the previous lane.
- Barrier → must be in the air above 1.3 m.
- Gate → must be rolling.
- Buffer → must be above 2.3 m.

The shield absorbs one hit and gives 1.6 s of invulnerability (flashing).

**Surfaces.** Ramps interpolate height linearly. Roofs are walkable. The player falls off a train's end back to the ground.

**Power-ups:**

| Power-up | Duration | Effect |
|---|---|---|
| Magnet | 12 s | pulls coins within 24 m |
| Shield | 18 s | absorbs one hit |
| Super Sneakers | 12 s | higher jump, green glow trail |
| Double Coins | 15 s | each coin counts as 2 |

**Background traffic.** The two outer tracks (x = ±7.8) carry either oncoming trains (13–28 m/s, 3–6 coaches, headlights on) or parked trains (still, headlights off).

**Death.** 1.1 s slow-motion crash with camera shake, then the game-over modal. Best score is saved to `localStorage['metro-rush-best']`; the chosen outfit to `localStorage['metro-rush-outfit']`.

**Input:**

| Action | Keys |
|---|---|
| Move left / right | ← → or A D |
| Jump | ↑, W or Space |
| Roll | ↓ or S |
| Pause | P or Esc |
| Start | Space or Enter (from home or game-over) |

Swipes need a 26px threshold. The game auto-pauses when the tab is hidden.

## Camera
- **In play**: follows `x × 0.75`. Height is `6.0 + camGround × 0.85` and it sits 8.8 m behind the player, looking 18 m ahead.
- **FOV**: 62 + (speed − 17) × 0.35. Portrait (aspect < 0.75) uses higher, further framing and FOV 72.
- **Home**: side 3/4 view at (3.6, 3.6, PZ+7.4), FOV 52.
- **Smoothing**: all values are damped (THREE.MathUtils.damp, rate 4–6).

## 3D Art Direction
- **Rendering**: Neutral tone mapping (ACES fallback). A procedural PMREM sky environment drives reflections. Hemisphere light `#d8f1ff/#ffcfa3` at 0.75. Sun `#fff1d8` at 2.7 with a 1024 PCF shadow that follows the camera. Fog `#c4e9ff` from 85 to 265.
- **Sky**: shader gradient (top `#1f6dff`, mid `#5cbcff`, horizon `#c4e9ff`) plus a sun glow. 14 puffy emissive clouds drift across.
- **Buildings**: 12 pastel colours (`#ff8a80 #ffd166 #7bdff2 #8ef0b5 #c9b4ff #ffafcc #ffa552 #4dd4ac #74b9ff #ffe08a #ff7eb6 #9be15d`). Canvas-painted window facades, striped shop awnings (PIZZA, DONUTS, SNEAKS, BOBA, COMICS, ARCADE, RAMEN, RECORDS), water towers and billboards.
- **Corridor**: graffiti walls on both sides. Overhead bridges: a pink truss "METRO RUSH" bridge and a blue signal gantry "DOWNTOWN LINE". Trackside signals and lamps.
- **Trains**:
  - **Locomotive**: 12 m, with an extruded curved nose. A windscreen and a livery nose panel follow the cab curve. It has headlights with glow sprites, a pantograph, and a bumper.
  - **Coach**: 10.6 m, with side textures showing windows, passengers, doors, livery bands, a roundel and optional graffiti.
  - **Body**: 2.84 m wide, with a curved roof tinted toward the livery colour.
  - **Running gear**: bogies with spinning wheels (texture rotation on moving trains only), and a bellows link between vehicles.
  - **Colour schemes** (body / accent): EXPRESS `#ff3b4f`/`#ffd23f`, OCEAN `#2f6bff`/`#ffd23f`, LIME `#14c27a`/`#d9ff3d`, SUNSET `#ff8a1f`/`#6b2cff`, BUBBLEGUM `#ff4fa3`/`#2fd3ff`, GRAPE `#7b4dff`/`#3ae3c1`, CITRUS `#ffbf14`/`#ff3d7f`, CLASSIC `#e6edf5`/`#ff3b4f`.
- **Runner**: a stylised character built from primitives — backwards cap, hoodie, backpack with a spray can, sneakers. Run, jump, roll, idle and crash poses are solved procedurally in `MR.poseRunner`.
- **Coins**: gold metallic discs with a star face, spinning. Each power-up sits in a glass bubble with an additive glow.

## Performance Strategy (keep it in the port)
- Pixel ratio is capped at 1.5 on desktop and 1.25 on mobile. **Adaptive resolution** steps down to 0.75 when the average frame time is above 21 ms and back up below 15 ms.
- Static meshes are merged per material (`batchStatic`); each train vehicle is about 10 draw calls. No physical/clearcoat materials.
- Train consists are pooled by key (colour scheme / coaches / ramp / direction). Every colour scheme is pre-warmed during loading so no shader compiles mid-run.
- The particle pool is capped at 140 sprites. HUD DOM writes happen only when values change.
- Fixed-ish timestep: dt is smoothed, at most 2 substeps per frame, clamped to 50 ms.

## State Management
- `state`: `loading | home | running | dying | paused | over`
- **Player**: `lane, prevLane, py, vy, grounded, ground, slide`
- **Run**: `speed, distance, score, coins`
- **Timers**: `shield, magnet, sneakers, doubler, invuln`
- **Entities**:
  - `trains[]` = `{lane, z, v, len, onc, ramp, mesh, a, b, coins[]}` — `a`/`b` are the arrival/departure distances used by the fair-path generator.
  - `props[]`, `pickups[]`, `bgTrains[]`
- **Persistence**: `localStorage` (best score, outfit). No network access.

## Design Tokens
- **Colours**:
  - ink `#1b1240`
  - yellow `#ffd23f`
  - pink `#ff3d7f`
  - blue `#2f6bff`
  - cyan `#2fd3ff`
  - lime `#8dff5a`
  - green button `#3fd14a` (shadow `#12802c`)
  - red tag `#ff2e63` (shadow `#a3123c`)
  - card `#ffffff → #e9efff` (shadow `#9fb2e8`)
  - muted text `#7d86b5`
- **Type**:
  - Display: **Lilita One** (Google Fonts), used for logo, numbers and buttons.
  - UI: **Nunito** 700/800/900.
- **Radii**: 9 (keys), 14–18 (chips/tiles), 26 (play button), 32 (cards), 999 (pills).
- **Shadows**: chunky offset "toy" shadows (`0 4–10px 0 <darker shade>`) plus soft ambient shadows (`0 16–30px 28–60px rgba(27,18,64,.25–.35)`).

## Assets
- `vendor/three.min.js`: Three.js (MIT; see `vendor/THREE-LICENSE.txt`).
- Fonts: Lilita One and Nunito, loaded from Google Fonts. Self-host them for offline use.
- Every other visual is procedural: no image, model or audio files.
- Audio is synthesised with the Web Audio API in `js/mr-fx.js`: SFX, horn, and a 118 BPM music loop.

## Files
| File | Purpose |
|---|---|
| `Metro Rush.html` | Entry point, DOM for HUD/menus/modals, script order |
| `metro-rush.css` | All UI styling + animations |
| `js/mr-core.js` | Renderer, env lighting, shared material/mesh/texture helpers, mesh batching, graffiti painter |
| `js/mr-world.js` | Sky, clouds, skyline, tracks, graffiti walls, buildings, bridges, world scrolling |
| `js/mr-trains.js` | Locomotive/coach builders, colour schemes, ramps, consist pooling, barriers, coins, power-ups |
| `js/mr-player.js` | Runner rig, outfits, procedural pose solver |
| `js/mr-fx.js` | Particle pool + Web Audio SFX/music |
| `js/mr-game.js` | Game loop, row generator, collisions, input, HUD, camera, adaptive resolution, boot |
| `vendor/` | Three.js |

**Debug API.** `window.MetroRush` exposes:
- `getState()`
- `start()`
- `action('left'|'right'|'jump'|'slide')`
- `advance(seconds)` (deterministic stepping for tests)
- `pixelRatio`
