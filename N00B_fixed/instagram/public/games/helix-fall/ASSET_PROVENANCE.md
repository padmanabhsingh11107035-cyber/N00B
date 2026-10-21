# Source and asset provenance

## Supplied Helix Drop source

- Published source archive supplied for this remix: https://d1oupeiobkpcny.cloudfront.net/assets/dashboard/materials/2026/09/27/e1d46a2ee24190db3bc8c0c5fbbab95bf347c08f4f8fce26ffed40978055f357.zip
- Original session reference: https://vida.butterfly-effect.dev/app/SKxkLgbxsxKHbtNYSj47V7
- The supplied client source, level generator, scoring/save logic, theme code, fonts, and source attribution are the basis of Helix Fall. The archive has a README but no separate source-code LICENSE file; this remix therefore preserves attribution and does not claim a new license for that code.
- The archive credits Sora, Figtree, and Noto Sans SC under SIL Open Font License 1.1. The corresponding notices are retained in `public/fonts/`.

## Generated gameplay asset

The falling player orb uses `assets/models/helix-fall-orb.glb`, generated for the source game's orb role after the approved Hybrid workflow's catalog search found no suitable marble/orb match. Its intended role and scale preserve the original game's one-input helix gameplay; the procedural tower, collision rules, and simulation remain source-driven.

- glTF 2.0 binary; 2,198,484 bytes; one mesh, one material, three textures, one node.
- SHA-256: `f76943ab327b5e8fe3821be0aed3c175e077a852d6f9665e285a1a2e056bef4f`.
- Generated under the approved Hybrid recipe: textured, PBR, fast texture quality, texture version `v3.5-20260815`, smart low-poly enabled, no design references, adaptive face limit (omitted).
- Asset runtime capability observed before generation: Three.js support enabled, manifest v2.

The game-specific 64×64 favicon at `assets/share/favicon.png` is hand-drawn programmatically with Pillow, not AI-generated. SHA-256: `e9b836303f34dcdc3db9e5f1efc9cc1031c0ba1c6565197805f74262dc5794e3`.

## Approved integration scope

The approved Game Blueprint retained the daily tower and bilingual client but left `onlineFeatures` empty. Therefore there is no server, database, authentication, or online leaderboard integration in this project. Daily/all-time score history and personal records are stored locally on the current device. The pure deterministic shared rules module is retained; it is not a backend.
