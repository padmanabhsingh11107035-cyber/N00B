import { describe, expect, it } from 'vitest'
import { resolveAssetUrl } from '../src/engine/asset-paths'

describe('asset paths', () => {
  it('asks for the files relative to the page', () => {
    expect(resolveAssetUrl('assets/v4chars/warden.glb')).toMatch(/assets\/v4chars\/warden\.glb$/)
    expect(resolveAssetUrl('/assets/ui/icon_rifle.webp')).toMatch(/assets\/ui\/icon_rifle\.webp$/)
  })
})
