import type { AssetEntry } from '../engine/assets'
import { assetUrl } from './assetPaths.ts'
export type MonsterId = 'mossback' | 'ashwing' | 'tidehorn'

/**
 * Asset bundles. Loading is staged:
 *  - `boot`: everything the title screen and the first hunt (Mossback) need. Blocks the boot bar.
 *  - `stage:<quarry>`: per-quarry hide textures and signature SFX. The next stage is requested
 *    as soon as boot finishes; later ones stream in the background.
 *  - `env:hi`: full-resolution ground layers and extra props (background, pressure-aware).
 * Music is streamed separately by the audio engine and never blocks.
 */
// Textures UV-mapped onto catalog GLBs use the glTF convention (no flip).
const GLTF_UV = /^tex\.(rock_moss|rock_face\d|stump|log)_/
const tex = (key: string, file: string, kb: number, color = true): AssetEntry => ({ key, url: assetUrl(`assets/tex/${file}`), kind: 'texture', color, kb, required: false, flipY: !GLTF_UV.test(key) })
const sfx = (name: string, kb = 14): AssetEntry => ({ key: `sfx.${name}`, url: assetUrl(`assets/audio/sfx/${name}.mp3`), kind: 'audio', kb, required: false })
const model = (name: string, kb: number, required = true): AssetEntry => ({ key: `model.${name}`, url: assetUrl(`assets/models/${name}.glb`), kind: 'gltf', kb, required })
const beast = (id: string, kb: number): AssetEntry => ({ key: `model.${id}`, url: assetUrl(`assets/models/monsters/${id}.glb`), kind: 'gltf', kb, required: true })
const ui = (name: string, kb: number): AssetEntry => ({ key: `ui.${name}`, url: assetUrl(`assets/ui/${name}.webp`), kind: 'image', kb, required: false })
const leaf = (name: string, kb: number): AssetEntry => ({ key: `foliage.${name}`, url: assetUrl(`assets/foliage/${name}.webp`), kind: 'texture', kb, required: false })
const fx = (name: string, kb: number): AssetEntry => ({ key: `fx.${name}`, url: assetUrl(`assets/fx/${name}.webp`), kind: 'texture', kb, required: false })

export const CORE_SFX = [
  'swing', 'swingHeavy', 'hit', 'hitWeak', 'hitVital', 'charge', 'dodge', 'hurt', 'roar', 'stomp', 'slam', 'grapple', 'clamp', 'buck', 'break',
  'bite', 'whoosh', 'potion', 'gather', 'evade', 'banner', 'ui', 'uiConfirm', 'step', 'faint', 'fail', 'brace', 'stamp', 'crumble', 'zip',
  'victory', 'trueSlash', 'metal1', 'metal2', 'splash', 'amb_wind', 'amb_water', 'heartbeat',
] as const

// Recorded ambience streams with the 'hunt' bundle; the synthesized bed covers the title until it lands.
export const BOOT_SFX = ['ui', 'uiConfirm', 'banner'] as const

export const MANIFEST: Record<string, AssetEntry[]> = {
  boot: [
    // HUD art (CSS backgrounds: warmed so the first HUD frame is complete)
    ...(['player_frame', 'boss_frame', 'ring', 'banner', 'stamp', 'minimap', 'icon_potion', 'icon_herb', 'icon_hook', 'icon_claw', 'icon_sword'] as const).map(n => ui(n, 30)),
    // Environment (half-res ground layers; full-res stream later)
    tex('tex.ground_forest_d', 'ground_forest_d.webp', 75), tex('tex.ground_forest_n', 'ground_forest_n.webp', 121, false),
    tex('tex.ground_grassrock_d', 'ground_grassrock_d.webp', 46), tex('tex.ground_grassrock_n', 'ground_grassrock_n.webp', 74, false),
    tex('tex.ground_leaves_d', 'ground_leaves_d.webp', 89), tex('tex.ground_leaves_n', 'ground_leaves_n.webp', 130, false),
    tex('tex.ground_rocks_d', 'ground_rocks_d.webp', 76), tex('tex.ground_rocks_n', 'ground_rocks_n.webp', 112, false),
    tex('tex.rock_moss_d', 'rock_moss_d.webp', 90), tex('tex.rock_moss_n', 'rock_moss_n.webp', 174, false),
    tex('tex.rock_face1_d', 'rock_face1_d.webp', 167), tex('tex.rock_face1_n', 'rock_face1_n.webp', 288, false),
    tex('tex.bark_d', 'bark_d.webp', 236), tex('tex.bark_n', 'bark_n.webp', 103, false),
    leaf('leaf_broad', 76), leaf('leaf_pine', 141), leaf('fern', 91), leaf('grass_clump', 141), leaf('flowers', 104),
    fx('smoke', 17), fx('dirt', 33), fx('flame', 3), fx('slash', 7), fx('splash', 32),
    { key: 'env.hdr', url: assetUrl('assets/env/meadow_256.hdr'), kind: 'hdr', kb: 128, required: false },
    ...(['rockmoss_0', 'rockmoss_1', 'rockmoss_2', 'rockmoss_3', 'rockmoss_4', 'rockmoss_5', 'rockface1_0', 'rockface2_0', 'stump_0', 'log_0'] as const).map(n => model(n, 30, false)),
    // Hunter + greatsword
    model('hunter', 470),
    { key: 'model.hunterSkin', url: assetUrl('assets/models/hunter_skin.glb'), kind: 'gltf', kb: 1600 },
    tex('tex.leather', 'leather.webp', 211),
    // Sculpted greatsword mesh (procedural blade + painted texture remain the fallback).
    model('greatsword', 356),
    // First hunt: Mossback
    // (hide_moss only feeds the procedural fallback body; it streams with the stage bundle)
    beast('mossback', 2150),
    tex('tex.moss', 'moss.webp', 369),
    // Only interface + ambience sounds block the title; combat sounds stream in the 'hunt' bundle.
    ...BOOT_SFX.map(n => sfx(n)),
  ],
  hunt: CORE_SFX.filter(n => !(BOOT_SFX as readonly string[]).includes(n)).map(n => sfx(n)),
  'stage:mossback': [beast('mossback', 2150), tex('tex.hide_moss', 'hide_moss.webp', 349), tex('tex.moss', 'moss.webp', 369)],
  'stage:ashwing': [beast('ashwing', 1889), tex('tex.hide_ash', 'hide_ash.webp', 224), sfx('volley', 21), sfx('blast', 18)],
  'stage:tidehorn': [beast('tidehorn', 2497), tex('tex.hide_tide', 'hide_tide.webp', 337), tex('tex.rock_face2_d', 'rock_face2_d.webp', 192), tex('tex.rock_face2_n', 'rock_face2_n.webp', 307, false)],
  /** Extra textures the /enemies library needs besides the stage bundles. */
  lib: [tex('tex.rock_face1_d', 'rock_face1_d.webp', 167), tex('tex.bark_d', 'bark_d.webp', 236), leaf('leaf_broad', 76), leaf('fern', 91), leaf('grass_clump', 141), tex('tex.moss', 'moss.webp', 369)],
  'env:hi': [
    tex('tex.hi.ground_forest_d', 'hi/ground_forest_d.webp', 273), tex('tex.hi.ground_forest_n', 'hi/ground_forest_n.webp', 493, false),
    tex('tex.hi.ground_grassrock_d', 'hi/ground_grassrock_d.webp', 176), tex('tex.hi.ground_grassrock_n', 'hi/ground_grassrock_n.webp', 288, false),
    tex('tex.hi.ground_leaves_d', 'hi/ground_leaves_d.webp', 351), tex('tex.hi.ground_leaves_n', 'hi/ground_leaves_n.webp', 547, false),
    tex('tex.hi.ground_rocks_d', 'hi/ground_rocks_d.webp', 300), tex('tex.hi.ground_rocks_n', 'hi/ground_rocks_n.webp', 421, false),
    tex('tex.stump_d', 'stump_d.webp', 202), tex('tex.stump_n', 'stump_n.webp', 383, false),
    tex('tex.log_d', 'log_d.webp', 108), tex('tex.log_n', 'log_n.webp', 294, false),
    tex('tex.rock_face2_d', 'rock_face2_d.webp', 192), tex('tex.rock_face2_n', 'rock_face2_n.webp', 307, false),
  ],
}

export const STAGE_ORDER: MonsterId[] = ['mossback', 'ashwing', 'tidehorn']
export const stageBundle = (id: MonsterId) => `stage:${id}`
export const HIDE_TEXTURE: Record<MonsterId, string> = { mossback: 'tex.hide_moss', ashwing: 'tex.hide_ash', tidehorn: 'tex.hide_tide' }
export const MUSIC = {
  explore: assetUrl('assets/audio/music/explore.mp3'),
  battle: assetUrl('assets/audio/music/battle.mp3'),
  enraged: assetUrl('assets/audio/music/enraged.mp3'),
  victory: assetUrl('assets/audio/music/victory.mp3'),
}
