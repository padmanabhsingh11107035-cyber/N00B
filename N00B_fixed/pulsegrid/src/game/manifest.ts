import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Assets, Entry } from '../engine/assets'
import type { CharacterKit, HairStyle } from './dancer'
import { DanceLib } from './dances'

/**
 * What loads when. Boot = everything the title screen and the first song (Warm-Up) need.
 * The title BGM follows immediately (audio can only start after the first user gesture anyway),
 * then the next song, then the rest, gated by the game's calm check.
 */

/** Beat grid of every generated track (from assets-src/audio/analyze.py → analysis.json). */
export const TRACKS: Record<string, { file: string; bpm: number; firstBeat: number }> = {
  title: { file: 'audio/music/title.mp3', bpm: 104.999, firstBeat: 0.0 },
  warmup: { file: 'audio/music/warmup.mp3', bpm: 93.0, firstBeat: 0.058 },
  'neon-heartbeat': { file: 'audio/music/neon-heartbeat.mp3', bpm: 109.995, firstBeat: 0.12 },
  'midnight-circuit': { file: 'audio/music/midnight-circuit.mp3', bpm: 125.918, firstBeat: 0.12 },
  'starlight-overdrive': { file: 'audio/music/starlight-overdrive.mp3', bpm: 127.987, firstBeat: 0.12 },
}

export const SONG_ORDER = ['warmup', 'neon-heartbeat', 'midnight-circuit', 'starlight-overdrive']

const CORE_SFX = [
  'ui_hover', 'ui_click', 'ui_back', 'ui_start', 'arrow_tick', 'arrow_wrong', 'phrase_lock',
  'hit_perfect', 'hit_great', 'hit_cool', 'hit_bad', 'hit_miss', 'countdown_tick', 'vo_ready', 'vo_go',
  'combo_milestone', 'fever_start', 'vo_fever', 'level_up', 'crowd_cheer',
]
const EXTRA_SFX = [
  'spotlight', 'finish_impact', 'pyro', 'co2_jet', 'crowd_aww', 'crowd_applause', 'crowd_ambience',
  'rank_stamp', 'count_tick', 'badge', 'transition_whoosh', 'vo_perfect', 'vo_great', 'vo_combo',
  'vo_spotlight', 'vo_finish', 'vo_clear', 'vo_fail', 'vo_newbest', 'vo_welcome',
]

export const UI_IMAGES = [
  'tile_idle', 'tile_done', 'tile_reverse', 'j_perfect', 'j_great', 'j_cool', 'j_bad', 'j_miss',
  'b_fever', 'b_finish', 'b_clear', 'b_spotlight',
]

const HAIR: Record<HairStyle, string> = { long: 'hair_long', buns: 'hair_buns', buzzed: 'hair_buzzed', parted: 'hair_simpleparted' }

export function defineAssets(a: Assets): void {
  const tex = (key: string, file: string, srgb = true, weight = 1, flipY = false): Entry => ({ key, url: `tex/${file}.webp`, kind: 'tex', srgb, weight, flipY })
  const boot: Entry[] = [
    ...UI_IMAGES.map((n): Entry => ({ key: `ui:${n}`, url: `ui/${n}.webp`, kind: 'img', weight: 0.5 })),
    { key: 'fx:atlas', url: 'fx/particles.webp', kind: 'tex', weight: 1, flipY: true },
    { key: 'model:f', url: 'models/dancer_f.glb', kind: 'glb', weight: 5 },
    { key: 'model:m', url: 'models/dancer_m.glb', kind: 'glb', weight: 5 },
    { key: 'model:anims', url: 'models/anims.glb', kind: 'glb', weight: 3 },
    { key: 'model:dances', url: 'models/dances.bin', kind: 'bin', weight: 3 },
    ...Object.values(HAIR).map((h): Entry => ({ key: `model:${h}`, url: `models/${h}.glb`, kind: 'glb', weight: 1 })),
    tex('tex:skin_f_light', 'skin_f_light'), tex('tex:skin_f_dark', 'skin_f_dark'),
    tex('tex:skin_m_light', 'skin_m_light'), tex('tex:skin_m_dark', 'skin_m_dark'),
    tex('tex:skin_f_normal', 'skin_f_normal', false), tex('tex:skin_m_normal', 'skin_m_normal', false),
    tex('tex:skin_f_rough', 'skin_f_rough', false), tex('tex:skin_m_rough', 'skin_m_rough', false),
    tex('tex:hair1', 'hair1'), tex('tex:hair2', 'hair2'),
    tex('tex:hair1_normal', 'hair1_normal', false), tex('tex:hair2_normal', 'hair2_normal', false),
    tex('tex:eye', 'eye'),
    tex('tex:floor', 'floor', true, 1, true), tex('tex:crowd', 'crowd', true, 1, true),
    ...CORE_SFX.map((n): Entry => ({ key: `sfx:${n}`, url: `audio/sfx/${n}.mp3`, kind: 'audio', weight: 0.3 })),
    { key: 'music:warmup', url: TRACKS.warmup.file, kind: 'audio', weight: 8 },
  ]
  a.define('boot', boot)
  a.define('title-music', [{ key: 'music:title', url: TRACKS.title.file, kind: 'audio', weight: 10 }])
  for (const id of SONG_ORDER.slice(1)) a.define(`song:${id}`, [{ key: `music:${id}`, url: TRACKS[id].file, kind: 'audio', weight: 10 }])
  a.define('song:warmup', [boot.find((e) => e.key === 'music:warmup')!])
  a.define('extra', [
    { key: 'model:dances_more', url: 'models/dances_more.bin', kind: 'bin', weight: 2 },
    ...EXTRA_SFX.map((n): Entry => ({ key: `sfx:${n}`, url: `audio/sfx/${n}.mp3`, kind: 'audio', weight: 0.3 })),
    { key: 'music:sting_clear', url: 'audio/music/sting_clear.mp3', kind: 'audio', weight: 1 },
    { key: 'music:sting_fail', url: 'audio/music/sting_fail.mp3', kind: 'audio', weight: 1 },
  ])
}

/** Background order after boot: title music first, then songs by difficulty, then extras. */
export const PREFETCH_ORDER = ['title-music', 'extra', 'song:neon-heartbeat', 'song:midnight-circuit', 'song:starlight-overdrive']

export function sfxKeys(): string[] {
  return [...CORE_SFX, ...EXTRA_SFX]
}

export function buildKit(a: Assets): CharacterKit {
  const t = (k: string) => a.get<THREE.Texture>(k)
  const scene = (k: string) => a.get<GLTF>(k).scene
  const hair = {} as Record<HairStyle, THREE.Group>
  for (const [style, file] of Object.entries(HAIR) as Array<[HairStyle, string]>) hair[style] = scene(`model:${file}`)
  return {
    bodies: { f: scene('model:f'), m: scene('model:m') },
    hair,
    clips: a.get<GLTF>('model:anims').animations,
    // Root motion is retargeted onto the female rig; the male legs are ~2% longer.
    dances: { f: new DanceLib(a.get<ArrayBuffer>('model:dances')), m: new DanceLib(a.get<ArrayBuffer>('model:dances'), 0.949 / 0.932) },
    tex: {
      skin: {
        f_light: t('tex:skin_f_light'), f_dark: t('tex:skin_f_dark'),
        m_light: t('tex:skin_m_light'), m_dark: t('tex:skin_m_dark'),
      },
      normal: { f: t('tex:skin_f_normal'), m: t('tex:skin_m_normal') },
      rough: { f: t('tex:skin_f_rough'), m: t('tex:skin_m_rough') },
      hair: [t('tex:hair1'), t('tex:hair2')],
      hairNormal: [t('tex:hair1_normal'), t('tex:hair2_normal')],
      eye: t('tex:eye'),
    },
  }
}

/** Merge the streamed move pack into a built kit (safe to call repeatedly). */
export function attachExtraDances(a: Assets, kit: CharacterKit): boolean {
  const buf = a.tryGet<ArrayBuffer>('model:dances_more')
  if (!buf || attached.has(kit)) return false
  attached.add(kit)
  kit.dances.f.add(buf)
  kit.dances.m.add(buf)
  return true
}
const attached = new WeakSet<CharacterKit>()
