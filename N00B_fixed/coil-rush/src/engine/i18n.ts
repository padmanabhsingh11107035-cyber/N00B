import en from '../i18n/en.json'
import zh from '../i18n/zh-CN.json'
import type { Locale } from './save'

export type Dictionary = Record<string, string>

/** The new game pins player-facing content to English, regardless of saved or browser language. */
const DICTIONARIES: Record<Locale, Dictionary> = { en }

export function detectLocale(_languages: readonly string[] | undefined): Locale {
  return 'en'
}

export function resolveLocale(_saved: Locale | '', _languages: readonly string[] | undefined): Locale {
  return 'en'
}

export class I18n {
  locale: Locale
  private listeners = new Set<(locale: Locale) => void>()

  constructor(locale: Locale) {
    this.locale = locale
    document.documentElement.lang = locale
  }

  /** Look up `key`, replacing `{name}` placeholders. Missing keys render the key so gaps are visible. */
  t(key: string, vars: Record<string, string | number> = {}): string {
    const text = DICTIONARIES[this.locale][key] ?? DICTIONARIES.en[key] ?? key
    return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`))
  }

  has(key: string): boolean {
    return key in DICTIONARIES.en
  }

  n(value: number): string {
    return Math.floor(value).toLocaleString('en')
  }

  set(locale: Locale): void {
    if (locale === this.locale) return
    this.locale = locale
    document.documentElement.lang = locale
    for (const fn of this.listeners) fn(locale)
  }

  onChange(fn: (locale: Locale) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}

export const DICTIONARY_KEYS = { en: Object.keys(en), zh: Object.keys(zh) }
