import { hash2, mulberry32 } from './noise'

export type PoiType = 'stones' | 'crystals' | 'camp' | 'ruin'
export type Poi = { id: string; type: PoiType; x: number; z: number; h: number; radius: number; seed: number }

export const POI_REGION = 176
/** Flatten radius around a POI; influence fades out over `POI_BLEND` more metres. */
export const POI_FLAT = 15
export const POI_BLEND = 10
const MARGIN = POI_FLAT + POI_BLEND + 3

export const POI_NAMES: Record<PoiType, string> = {
  stones: 'Standing Stones',
  crystals: 'Crystal Hollow',
  camp: 'Abandoned Camp',
  ruin: 'Ruined Watchtower',
}

export const POI_BLURB: Record<PoiType, string> = {
  stones: 'An old ring of monoliths. Something rests on the altar.',
  crystals: 'Glowing crystal formations grow thick here.',
  camp: 'Someone left in a hurry. Their supplies remain.',
  ruin: 'Crumbling stone walls — a trove of cut stone.',
}

/**
 * One optional point of interest per square region, placed away from region borders so its
 * terrain flattening never crosses into a neighbouring region (cheap height lookups).
 */
export class PoiField {
  private cache = new Map<number, Poi | null>()
  constructor(private readonly seed: number, private readonly rawHeight: (x: number, z: number) => number) {}

  static regionKey(rx: number, rz: number): number {
    return (rx + 4096) * 8192 + (rz + 4096)
  }

  region(rx: number, rz: number): Poi | null {
    const key = PoiField.regionKey(rx, rz)
    const hit = this.cache.get(key)
    if (hit !== undefined) return hit
    const poi = this.generate(rx, rz)
    this.cache.set(key, poi)
    return poi
  }

  /** POI whose flattened area may affect (x, z). */
  at(x: number, z: number): Poi | null {
    return this.region(Math.floor(x / POI_REGION), Math.floor(z / POI_REGION))
  }

  near(x: number, z: number, radius: number): Poi[] {
    const out: Poi[] = []
    const r0x = Math.floor((x - radius) / POI_REGION)
    const r1x = Math.floor((x + radius) / POI_REGION)
    const r0z = Math.floor((z - radius) / POI_REGION)
    const r1z = Math.floor((z + radius) / POI_REGION)
    for (let rx = r0x; rx <= r1x; rx++) {
      for (let rz = r0z; rz <= r1z; rz++) {
        const p = this.region(rx, rz)
        if (p && Math.hypot(p.x - x, p.z - z) <= radius) out.push(p)
      }
    }
    return out
  }

  private generate(rx: number, rz: number): Poi | null {
    const rnd = mulberry32(Math.floor(hash2(rx, rz, this.seed ^ 0x51f3) * 4294967296))
    if (rnd() > 0.78) return null
    for (let attempt = 0; attempt < 8; attempt++) {
      const x = rx * POI_REGION + MARGIN + rnd() * (POI_REGION - MARGIN * 2)
      const z = rz * POI_REGION + MARGIN + rnd() * (POI_REGION - MARGIN * 2)
      const samples = [this.rawHeight(x, z)]
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        samples.push(this.rawHeight(x + Math.cos(a) * 11, z + Math.sin(a) * 11))
      }
      const lo = Math.min(...samples)
      const hi = Math.max(...samples)
      if (lo < 1.8 || hi > 46 || hi - lo > 7) continue
      const h = samples.reduce((a, b) => a + b, 0) / samples.length
      const roll = rnd()
      let type: PoiType
      if (h > 16) type = roll < 0.55 ? 'crystals' : roll < 0.8 ? 'ruin' : 'stones'
      else type = roll < 0.3 ? 'camp' : roll < 0.58 ? 'stones' : roll < 0.84 ? 'ruin' : 'crystals'
      return { id: `${rx}:${rz}`, type, x, z, h: h + 0.1, radius: POI_FLAT, seed: Math.floor(rnd() * 1e9) }
    }
    return null
  }
}
