import en from '../i18n/en.json'

/**
 * English-only string table. All player-facing copy lives in `src/i18n/en.json` so wording can
 * be edited in one place; `{name}` placeholders are filled from `vars`.
 */
const TABLE: Record<string, string> = en

export function t(key: string, vars?: Record<string, string | number>): string {
  const raw = TABLE[key] ?? key
  if (!vars) return raw
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`))
}

export function hasKey(key: string): boolean {
  return key in TABLE
}

/** Fill every `[data-i18n]` element under `root` with its string. */
export function applyStrings(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n!)
  })
  root.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach(el => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria!))
  })
}
