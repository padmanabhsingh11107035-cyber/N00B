import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { gltf, json, loadGLTF, loadJSON, preloadTexture, texture } from './assets3d'
import { withFx, fxOf } from './materials'

/**
 * Realistic humanoids: Quaternius Universal Base Characters (male/female, 65-bone UE-style rig)
 * driven by the Universal Animation Library clips, with procedurally painted PBR costumes
 * (scripts/assets/paint-characters.py). One skinned GLB per body; variants only swap maps.
 */

export type Gender = 'male' | 'female'
export type VariantInfo = { gender: Gender; hair: string | null; hairColor: string; eyes: string; eyeGlow?: number; hideEyes?: boolean; emit: boolean }
export type Clip =
  | 'Idle_Loop' | 'Jog_Fwd_Loop' | 'Sprint_Loop' | 'Walk_Loop' | 'Walk_Formal_Loop' | 'Punch_Jab' | 'Punch_Cross' | 'Sword_Attack'
  | 'Roll' | 'Spell_Simple_Shoot' | 'Spell_Simple_Enter' | 'Spell_Simple_Idle_Loop' | 'Spell_Simple_Exit' | 'Hit_Chest' | 'Hit_Head'
  | 'Death01' | 'Jump_Start' | 'Jump_Loop' | 'Jump_Land' | 'Idle_Talking_Loop' | 'Dance_Loop' | 'Crouch_Idle_Loop' | 'Interact'
  | 'Sitting_Idle_Loop' | 'Push_Loop' | DanceClip

import { buildDanceClips, type DanceClip } from './dances'

const BODY: Record<Gender, string> = { male: 'models/char_male.glb', female: 'models/char_female.glb' }
const ANIMS = 'models/anims.glb'
const VARIANTS = 'models/chars/variants.json'
const DIR = 'models/chars/'

const clipCache = new Map<Gender, Map<string, THREE.AnimationClip>>()
const bodyMatCache = new Map<string, THREE.MeshStandardMaterial>()

/** Everything a set of variants needs before createCharacter() can succeed synchronously. */
export async function preloadCharacters(variants: string[]): Promise<void> {
  const info = await loadJSON<Record<string, VariantInfo>>(VARIANTS)
  const genders = new Set(variants.map(v => info[v]?.gender ?? 'male'))
  const jobs: Promise<unknown>[] = [loadGLTF(ANIMS)]
  for (const g of genders) {
    jobs.push(loadGLTF(BODY[g]), preloadTexture(`${DIR}${g}_normal.webp`, { flipY: false }))
  }
  for (const v of variants) {
    const i = info[v]
    if (!i) continue
    jobs.push(preloadTexture(`${DIR}${v}_albedo.webp`, { srgb: true, flipY: false }), preloadTexture(`${DIR}${v}_orm.webp`, { flipY: false }))
    if (i.emit) jobs.push(preloadTexture(`${DIR}${v}_emit.webp`, { srgb: true, flipY: false }))
    if (i.hair) jobs.push(preloadTexture(`${DIR}hair1_albedo.webp`, { srgb: true, flipY: false }), preloadTexture(`${DIR}hair2_albedo.webp`, { srgb: true, flipY: false }))
  }
  jobs.push(preloadTexture(`${DIR}eye_albedo.webp`, { srgb: true, flipY: false }))
  await Promise.all(jobs)
}

export function charactersReady(variant: string): boolean {
  const info = json<Record<string, VariantInfo>>(VARIANTS)?.[variant]
  return !!info && !!gltf(BODY[info.gender]) && !!gltf(ANIMS)
}

/** Retarget UAL clips onto a body: rotations only, plus the pelvis offset relative to each rest pose. */
function clipsFor(g: Gender): Map<string, THREE.AnimationClip> {
  let m = clipCache.get(g)
  if (m) return m
  m = new Map()
  const anims = gltf(ANIMS)!
  const body = gltf(BODY[g])!
  const ualPelvis = anims.scene.getObjectByName('pelvis')?.position.clone() ?? new THREE.Vector3()
  const bodyPelvis = body.scene.getObjectByName('pelvis')?.position.clone() ?? ualPelvis.clone()
  const off = bodyPelvis.sub(ualPelvis)
  for (const clip of anims.animations) {
    const tracks: THREE.KeyframeTrack[] = []
    for (const t of clip.tracks) {
      if (t.name.endsWith('.quaternion')) tracks.push(t)
      else if (t.name === 'pelvis.position') {
        const v = t.values.slice()
        for (let i = 0; i < v.length; i += 3) {
          v[i] += off.x
          v[i + 1] += off.y
          v[i + 2] += off.z
        }
        tracks.push(new THREE.VectorKeyframeTrack(t.name, t.times, v))
      }
    }
    m.set(clip.name, new THREE.AnimationClip(clip.name, clip.duration, tracks))
  }
  // Per-classmate victory dances, keyed against this body's idle pose (see dances.ts).
  const idle = m.get('Idle_Loop')
  if (idle) for (const clip of buildDanceClips(body.scene, idle)) m.set(clip.name, clip)
  clipCache.set(g, m)
  return m
}

function bodyMaterial(variant: string, info: VariantInfo): THREE.MeshStandardMaterial {
  let base = bodyMatCache.get(variant)
  if (!base) {
    const orm = texture(`${DIR}${variant}_orm.webp`, { flipY: false })
    base = new THREE.MeshStandardMaterial({
      map: texture(`${DIR}${variant}_albedo.webp`, { srgb: true, flipY: false }),
      normalMap: texture(`${DIR}${info.gender}_normal.webp`, { flipY: false }),
      roughnessMap: orm,
      metalnessMap: orm,
      roughness: 1,
      metalness: 1,
      envMapIntensity: 1,
    })
    base.normalScale.set(1, -1)
    if (info.emit) {
      base.emissiveMap = texture(`${DIR}${variant}_emit.webp`, { srgb: true, flipY: false })
      base.emissive.set('#ffffff')
      base.emissiveIntensity = 1.6
    }
    bodyMatCache.set(variant, base)
  }
  return base
}

export type CharacterOptions = {
  variant: string
  scale?: number
  hair?: string | null
  hairColor?: string
  rim?: THREE.ColorRepresentation
  rimStrength?: number
  dissolve?: boolean
  shadows?: boolean
}

type PlayOpts = { fade?: number; loop?: boolean; speed?: number; force?: boolean; duration?: number; from?: number }

export class Character {
  readonly root = new THREE.Group()
  readonly model: THREE.Object3D
  readonly mixer: THREE.AnimationMixer
  readonly info: VariantInfo
  readonly materials: THREE.MeshStandardMaterial[] = []
  readonly bodyMaterial: THREE.MeshStandardMaterial
  private readonly clips: Map<string, THREE.AnimationClip>
  private readonly actions = new Map<string, THREE.AnimationAction>()
  private readonly bones = new Map<string, THREE.Object3D>()
  current: string | null = null
  private currentAction: THREE.AnimationAction | null = null

  constructor(opts: CharacterOptions) {
    const info = json<Record<string, VariantInfo>>(VARIANTS)![opts.variant]
    this.info = info
    const src = gltf(BODY[info.gender])!
    this.model = cloneSkinned(src.scene)
    this.model.rotation.y = Math.PI // glTF bodies face +Z; gameplay rigs face -Z
    this.root.add(this.model)
    if (opts.scale) this.model.scale.setScalar(opts.scale)
    this.clips = clipsFor(info.gender)
    this.mixer = new THREE.AnimationMixer(this.model)
    const hair = opts.hair === undefined ? info.hair : opts.hair
    const hairColor = new THREE.Color(opts.hairColor ?? info.hairColor)
    const bodyMat = withFx(bodyMaterial(opts.variant, info).clone(), { rim: opts.rim, rimStrength: opts.rimStrength ?? 0.35, dissolve: opts.dissolve })
    this.bodyMaterial = bodyMat
    this.materials.push(bodyMat)
    const hairMats = new Map<number, THREE.MeshStandardMaterial>()
    const hairMat = (idx: number): THREE.MeshStandardMaterial => {
      let mm = hairMats.get(idx)
      if (!mm) {
        mm = withFx(new THREE.MeshStandardMaterial({
          map: texture(`${DIR}hair${idx}_albedo.webp`, { srgb: true, flipY: false }),
          color: hairColor, roughness: 0.55, metalness: 0,
        }), { rim: opts.rim, rimStrength: (opts.rimStrength ?? 0.35) * 0.6 })
        hairMats.set(idx, mm)
        this.materials.push(mm)
      }
      return mm
    }
    let browMat: THREE.MeshStandardMaterial | null = null
    const eyeMat = withFx(new THREE.MeshStandardMaterial({
      map: texture(`${DIR}eye_albedo.webp`, { srgb: true, flipY: false }), roughness: 0.15, metalness: 0,
      color: info.eyeGlow ? new THREE.Color(info.eyes) : new THREE.Color('#ffffff'),
      emissive: new THREE.Color(info.eyes), emissiveIntensity: info.eyeGlow ?? 0,
    }))
    this.materials.push(eyeMat)
    this.model.traverse(o => {
      if ((o as THREE.Bone).isBone) this.bones.set(o.name, o)
      const mesh = o as THREE.SkinnedMesh
      if (!mesh.isMesh) return
      // Only the body casts: hair, brows and eyes add shadow-pass cost without visible benefit.
      mesh.castShadow = opts.shadows !== false && /body/i.test(mesh.name)
      mesh.receiveShadow = false
      mesh.frustumCulled = false
      const name = mesh.name + ' ' + (mesh.parent?.name ?? '')
      const matName = (mesh.material as THREE.Material).name ?? ''
      if (/Hair_/.test(name)) {
        const want = hair && name.includes(hair) && !(hair === 'Hair_Buzzed' && name.includes('BuzzedFemale'))
        mesh.visible = !!want
        mesh.material = hairMat(/Hair_2/.test(matName) ? 2 : 1)
      } else if (/Brows/.test(name)) {
        browMat ??= hairMat(1)
        mesh.material = browMat
        mesh.visible = !info.hideEyes
      } else if (/Eyes/.test(name)) {
        mesh.material = eyeMat
        mesh.visible = !info.hideEyes
      } else {
        mesh.material = bodyMat
      }
    })
    this.play('Idle_Loop', { fade: 0 })
  }

  bone(name: string): THREE.Object3D | undefined {
    return this.bones.get(name)
  }

  has(name: string): boolean {
    return this.clips.has(name)
  }

  duration(name: string): number {
    return this.clips.get(name)?.duration ?? 1
  }

  private action(name: string): THREE.AnimationAction | null {
    let a = this.actions.get(name)
    if (!a) {
      const clip = this.clips.get(name)
      if (!clip) return null
      a = this.mixer.clipAction(clip)
      this.actions.set(name, a)
    }
    return a
  }

  /**
   * Crossfade to a clip. Loops by default; one-shots clamp on their last frame. `duration` rescales
   * the clip to last that many seconds (attack timings come from gameplay, not the clip).
   */
  play(name: Clip | string, o: PlayOpts = {}): void {
    const loop = o.loop ?? /_Loop$/.test(name)
    if (this.current === name && !o.force) {
      if (o.speed !== undefined && this.currentAction) this.currentAction.timeScale = o.speed
      return
    }
    const a = this.action(name)
    if (!a) return
    const fade = o.fade ?? 0.16
    a.reset()
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
    a.clampWhenFinished = !loop
    a.timeScale = o.duration ? this.duration(name) / o.duration : (o.speed ?? 1)
    if (o.from) a.time = o.from * this.duration(name)
    a.enabled = true
    a.setEffectiveWeight(1)
    const prev = this.currentAction
    if (prev && prev !== a && fade > 0) {
      a.play()
      prev.crossFadeTo(a, fade, false)
    } else {
      if (prev && prev !== a) prev.stop()
      a.play()
    }
    this.current = name
    this.currentAction = a
  }

  /** Normalized progress of the current clip (0..1). */
  progress(): number {
    const a = this.currentAction
    if (!a) return 0
    return Math.min(1, a.time / a.getClip().duration)
  }

  finished(): boolean {
    const a = this.currentAction
    return !!a && a.loop === THREE.LoopOnce && a.time >= a.getClip().duration - 1e-3
  }

  update(dt: number): void {
    this.mixer.update(dt)
  }

  set flash(v: number) {
    for (const m of this.materials) {
      const u = fxOf(m)
      if (u) u.uFlash.value = v
    }
  }

  set dissolve(v: number) {
    const u = fxOf(this.bodyMaterial)
    if (u) u.uDissolve.value = v
  }

  set time(t: number) {
    const u = fxOf(this.bodyMaterial)
    if (u) u.uTime.value = t
  }

  set rim(v: number) {
    const u = fxOf(this.bodyMaterial)
    if (u) u.uRim.value = v
  }

  dispose(): void {
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.model)
    for (const m of this.materials) m.dispose()
  }
}

export function createCharacter(opts: CharacterOptions): Character | null {
  if (!charactersReady(opts.variant)) return null
  return new Character(opts)
}
