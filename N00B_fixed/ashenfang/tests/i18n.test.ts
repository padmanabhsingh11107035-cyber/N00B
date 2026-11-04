import { describe, expect, it } from 'vitest'
import en from '../src/i18n/en.json'
import { hasKey, t } from '../src/engine/i18n'

describe('English-only i18n', () => {
  it('uses the pinned English title and recovery copy', () => {
    expect(t('app.title')).toBe('Ashenfang')
    expect(t('app.subtitle')).toBe('The Colossus Trail')
    expect(t('boot.retry')).toBe('Retry')
  })

  it('does not expose an inherited language switch in the English table', () => {
    expect(hasKey('title.begin')).toBe(true)
    expect(hasKey('settings.language')).toBe(false)
    expect(t('settings.language')).toBe('settings.language')
  })

  it('interpolates game data from the English string table', () => {
    expect(t('hud.objective', { name: 'Mossback Colossus' })).toBe('Slay the Mossback Colossus')
    expect(t('hud.objective', {})).toBe('Slay the {name}')
  })

  it('keeps every English key connected to an English value', () => {
    expect(Object.keys(en).length).toBeGreaterThan(100)
    for (const key of Object.keys(en)) expect(hasKey(key), key).toBe(true)
  })
})
