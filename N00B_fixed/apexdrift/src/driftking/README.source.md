# 漂移之王 Drift King

A 60-second 3D arcade drift-scoring game (three.js + Rapier + Vite) with a global leaderboard.

- **Play**: W/↑ gas, S/↓ brake, A/D or ←/→ steer, Space handbrake, R reset. Gamepad: RT gas, LT brake, stick steer, A handbrake. Phones: on-screen buttons in landscape.
- **Scoring**: slip angle × duration builds the multiplier; glowing clip rings double points and add a bonus; hitting (or grinding) a wall wipes the running drift. Heat rises at 20/40/50 s.
- **Today's Challenge**: the UTC date seeds weather/time (night, rain, dusk, fog, dawn) and clip placement, so everyone drives the same run.
- **Online**: nickname-only guest identity, Today + All-time boards, rank and "beat X%" on the results screen, share card with QR code, challenge links (`?vs=`) that show a target score.

## Original source layout

The archive organized gameplay under `src/game/`, online flows under `src/online/`, UI under `src/ui/`, and its original project-owned leaderboard API and migrations under `server/`. In this remix, these source modules live under `src/driftking/`; the backend scoring rules are integrated additively with the initialized project's managed guest leaderboard instead of creating a second listener.

## Original checks

The published source included `pnpm test`, `pnpm build`, a browser smoke test, bot trace, isolated API tests, a local stack and daily-condition screenshot tooling. The Drift King scoring, daily seed, server plausibility, challenge-link and localization tests were carried into the initialized project. The browser smoke test was adapted to its current asset and sharing build flow.
