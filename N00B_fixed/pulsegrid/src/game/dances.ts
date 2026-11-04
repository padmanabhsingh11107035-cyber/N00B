import * as THREE from 'three'

/**
 * Beat-locked dance clips retargeted from AIST++ street-dance mocap (CC BY 4.0,
 * Li et al., ICCV 2021) by assets-src/dance/build_dances.py.
 *
 * File layout (little endian): 'BSD1', u32 headerBytes, header JSON, then per clip a channel-major
 * block of int16 frame deltas: bones×4 quaternion channels (×qScale) + 3 pelvis-position channels
 * (×posScale, in the rig's root-local units). Samples sit on a beat grid (`spb` per beat) so a clip's
 * AnimationClip time is measured in *beats* — the dancer drives `action.time` from the song beat,
 * which keeps every move locked to any tempo.
 */
export type Genre = 'BR' | 'PO' | 'LO' | 'MH' | 'LH' | 'HO' | 'WA' | 'KR' | 'JS' | 'JB'
export type DanceKind = 'groove' | 'move'
export type DanceClip = {
  name: string
  genre: Genre
  kind: DanceKind
  beats: number
  energy: number
  mirrored: boolean
  clip: THREE.AnimationClip
}
type HeaderClip = { name: string; genre: Genre; kind: DanceKind; beats: number; frames: number; energy: number; offset: number }
type Header = { spb: number; bones: string[]; posScale: number; qScale?: number; clips: HeaderClip[] }

export const GENRE_NAMES: Record<Genre, string> = {
  BR: 'Breaking', PO: 'Popping', LO: 'Locking', MH: 'Middle Hip-hop', LH: 'LA Hip-hop',
  HO: 'House', WA: 'Waacking', KR: 'Krump', JS: 'Street Jazz', JB: 'Ballet Jazz',
}

const mirrorName = (b: string) => (b.endsWith('_l') ? b.slice(0, -2) + '_r' : b.endsWith('_r') ? b.slice(0, -2) + '_l' : b)

export class DanceLib {
  readonly clips: DanceClip[] = []
  private readonly byName = new Map<string, DanceClip>()

  /** Bumped whenever clips are added (dancers refresh their pools lazily). */
  version = 0

  /** `pelvisScale` rescales the root motion for the body's leg length (female rig = 1). */
  constructor(buf: ArrayBuffer, private readonly pelvisScale = 1) {
    this.add(buf)
  }

  /** Append clips from another BSD1 file (the streamed move pack). Tracks are decoded lazily. */
  add(buf: ArrayBuffer): void {
    const dv = new DataView(buf)
    const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3))
    if (magic !== 'BSD1') throw new Error('bad dance file')
    const hlen = dv.getUint32(4, true)
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hlen))) as Header
    const base = 8 + hlen
    for (const h of header.clips) {
      for (const mirrored of [false, true]) {
        const name = mirrored ? `${h.name}~m` : h.name
        let cached: THREE.AnimationClip | undefined
        const build = () => (cached ??= this.decode(buf, base, header, h, mirrored, name))
        const dc = { name, genre: h.genre, kind: h.kind, beats: h.beats, energy: h.energy, mirrored } as DanceClip
        Object.defineProperty(dc, 'clip', { get: build, enumerable: true })
        this.clips.push(dc)
        this.byName.set(name, dc)
      }
    }
    this.version += 1
  }

  private decode(buf: ArrayBuffer, base: number, header: Header, h: HeaderClip, mirrored: boolean, name: string): THREE.AnimationClip {
    const nb = header.bones.length
    const ch = nb * 4 + 3
    const n = h.frames
    const raw = new Int16Array(buf, base + h.offset, n * ch)
    const values = new Float32Array(n * ch) // channel-major, integrated
    for (let c = 0; c < ch; c++) {
      let acc = 0
      const row = c * n
      for (let i = 0; i < n; i++) {
        acc += raw[row + i]
        values[row + i] = acc
      }
    }
    const times = Float32Array.from({ length: n }, (_, i) => i / header.spb)
    const tracks: THREE.KeyframeTrack[] = []
    for (let b = 0; b < nb; b++) {
      const q = new Float32Array(n * 4)
      for (let i = 0; i < n; i++) {
        const x = values[b * 4 * n + i]
        let y = values[(b * 4 + 1) * n + i]
        let z = values[(b * 4 + 2) * n + i]
        const w = values[(b * 4 + 3) * n + i]
        if (mirrored) { y = -y; z = -z }
        const len = Math.hypot(x, y, z, w) || 1
        q[i * 4] = x / len
        q[i * 4 + 1] = y / len
        q[i * 4 + 2] = z / len
        q[i * 4 + 3] = w / len
      }
      const bone = mirrored ? mirrorName(header.bones[b]) : header.bones[b]
      tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times as unknown as number[], q as unknown as number[]))
    }
    const p = new Float32Array(n * 3)
    const sc = this.pelvisScale / header.posScale
    for (let i = 0; i < n; i++) {
      p[i * 3] = values[nb * 4 * n + i] * sc * (mirrored ? -1 : 1)
      p[i * 3 + 1] = values[(nb * 4 + 1) * n + i] * sc
      p[i * 3 + 2] = values[(nb * 4 + 2) * n + i] * sc
    }
    tracks.push(new THREE.VectorKeyframeTrack('pelvis.position', times as unknown as number[], p as unknown as number[]))
    return new THREE.AnimationClip(name, (n - 1) / header.spb, tracks)
  }

  get(name: string): DanceClip | undefined {
    return this.byName.get(name)
  }

  list(genres: readonly Genre[], kind: DanceKind): DanceClip[] {
    return this.clips.filter((c) => c.kind === kind && genres.includes(c.genre))
  }
}
