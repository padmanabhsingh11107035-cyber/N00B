import { describe, expect, it } from 'vitest'
import en from '../src/i18n/en.json'
import zh from '../src/i18n/zh-CN.json'
import { detectLocale, resolveLocale } from '../src/engine/i18n'

describe('i18n', () => {
  it('pins this game to English regardless of browser language', () => {
    expect(detectLocale(['zh-CN', 'en'])).toBe('en')
    expect(detectLocale(['zh-TW'])).toBe('en')
    expect(detectLocale(['ZH'])).toBe('en')
    expect(detectLocale(['en-US', 'zh-CN'])).toBe('en')
    expect(detectLocale([])).toBe('en')
    expect(detectLocale(undefined)).toBe('en')
  })

  it('ignores saved locale values so existing saves cannot change the pinned language', () => {
    expect(resolveLocale('en', ['zh-CN'])).toBe('en')
    expect(resolveLocale('', ['zh-CN'])).toBe('en')
  })

  it('has the same keys and placeholders in every language', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort()
    for (const [key, value] of Object.entries(en)) expect(vars((zh as Record<string, string>)[key]), key).toEqual(vars(value))
  })
})
