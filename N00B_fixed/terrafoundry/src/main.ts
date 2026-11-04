import './styles/main.css'
import { SAVE_KEY, SaveStore } from './engine/save'

/**
 * Boot: the static #boot screen (index.html) shows immediately. We load only the code and the
 * `title` stage (logo/UI art/UI sounds) before revealing the title; the first playable day
 * segment streams in behind the title, and later nights prefetch in the background.
 */
async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const root = document.getElementById('ui')!
  const bootEl = document.getElementById('boot')
  const bar = bootEl?.querySelector<HTMLElement>('.boot-bar i') ?? null
  const label = bootEl?.querySelector<HTMLElement>('.boot-label') ?? null
  const setP = (p: number, text?: string) => {
    if (bar) bar.style.transform = `scaleX(${Math.max(0.04, Math.min(1, p))})`
    if (label && text) label.textContent = text
  }
  setP(0.08, 'Shaping the land…')
  const firstRun = safeGet(SAVE_KEY) === null
  let codeDone = 0
  const code = <T>(pr: Promise<T>): Promise<T> => pr.then(v => (setP(0.08 + (++codeDone / 3) * 0.5), v))
  const [{ Game }, { suggestQuality }] = await Promise.all([code(import('./game/game')), code(import('./engine/renderer')), code(document.fonts.ready)])
  if (firstRun) new SaveStore().update({ quality: suggestQuality() })
  const game = new Game(canvas, root)
  setP(0.6, 'Gathering the wilds…')
  await game.loadTitle((p: number) => setP(0.6 + p * 0.4))
  game.start()
  setP(1, 'Ready')
  requestAnimationFrame(() => {
    bootEl?.classList.add('done')
    setTimeout(() => bootEl?.remove(), 800)
  })
  // Debug/test hook (read-only use): smoke tests inspect world state through it.
  ;(window as unknown as { __game: unknown }).__game = game
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

boot().catch(err => {
  console.error(err)
  const el = document.getElementById('ui')
  if (el) el.innerHTML = `<div class="fatal">Failed to start: ${String((err as Error)?.message ?? err).replace(/[<>&]/g, '')}</div>`
})
