import type { Audio, Bed, Sfx } from '../engine/audio'
import { BED_FILES, SAMPLES, audioUrl } from '../engine/audio'
import type { Assets, StageId, Task } from '../engine/assets'
import { loadWorldTextures } from './materials'
import { MODELS, lodReady, registerModel, type ModelId } from './models'
import { NATURE_URL, registerNatureKit } from './nature'

/**
 * Staged asset manifest. Only `title` blocks the title screen; `day` (the first playable
 * segment: world textures, FPS arms, wildlife, core SFX) is required before entering play
 * and starts loading immediately behind the title. Night/boss segments stream in the
 * background and pause whenever gameplay is busy (see StageLoader.busy).
 */
const DAY_SFX: Sfx[] = ['chop', 'mine', 'crystal', 'dig', 'treefall', 'pickup', 'craft', 'place', 'placeStone', 'eat', 'hurt', 'swing', 'hit', 'die', 'bowDraw', 'bowRelease', 'arrowHit', 'levelup', 'chest', 'dawn', 'doorOpen', 'doorClose', 'chestClose', 'map']
const NIGHT1_SFX: Sfx[] = ['howl', 'wolfAttack', 'horn']
const NIGHT2_SFX: Sfx[] = ['ghoul']
const BOSS_SFX: Sfx[] = ['roar']

const UI_IMAGES = ['./assets/ui/logo.webp', './assets/ui/panel.webp', './assets/ui/slot.webp', './assets/ui/button.webp', './assets/ui/banner.webp', './assets/vfx/particles.png']

export type StageHooks = { assets: Assets; audio: Audio; onArms: (gltf: import('three/examples/jsm/loaders/GLTFLoader.js').GLTF) => void }

export function stageTasks(h: StageHooks): Record<StageId, Task[]> {
  const sample = (name: Sfx): Task | null => {
    const spec = SAMPLES[name]
    if (!spec) return null
    return { id: `sfx:${spec.file}`, weight: 1, run: async () => h.audio.addSample(spec.file, await h.assets.bytes(audioUrl(spec.file))) }
  }
  const bed = (b: Bed): Task => ({ id: `bed:${b}`, weight: 2, run: async () => h.audio.addSample(BED_FILES[b], await h.assets.bytes(audioUrl(BED_FILES[b]))) })
  const model = (id: ModelId, weight = 4): Task => ({ id: `model:${id}`, weight, run: async () => { const g = await h.assets.gltf(MODELS[id].url); if ('lod' in MODELS[id] && MODELS[id].lod) await lodReady; registerModel(id, g) } })
  const sfx = (list: Sfx[]) => list.map(sample).filter((t): t is Task => !!t)
  return {
    title: [
      ...UI_IMAGES.map((u) => ({ id: `img:${u}`, weight: 1, run: () => h.assets.image(u) })),
      ...sfx(['click', 'hover']),
    ],
    day: [
      { id: 'textures', weight: 8, run: () => loadWorldTextures() },
      { id: 'nature', weight: 7, run: async () => registerNatureKit(await h.assets.gltf(NATURE_URL)) },
      { id: 'arms', weight: 5, run: async () => h.onArms(await h.assets.gltf('./assets/models/arms.glb')) },
      model('deer'),
      model('fox', 2),
      model('stag'),
      ...sfx(DAY_SFX),
      bed('day'),
      bed('campfire'),
    ],
    night1: [model('wolf'), ...sfx(NIGHT1_SFX), bed('night')],
    night2: [model('ghoul', 6), ...sfx(NIGHT2_SFX)],
    boss: [model('werewolf', 8), ...sfx(BOSS_SFX)],
  }
}

/** The stage a given night needs (night numbers are 1-based). */
export function stageForNight(night: number): StageId {
  if (night > 0 && night % 3 === 0) return 'boss'
  return night >= 2 ? 'night2' : 'night1'
}
