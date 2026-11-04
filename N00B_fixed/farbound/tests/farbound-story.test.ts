import { describe, expect, it } from 'vitest'
import { EN_BOOK, FOX_TAMED, STARS, chooseScript, type Line, type StoryState, type Target } from '../src/farbound/story'

const fresh = (): StoryState => ({ stars: [], fox: 0, awake: false, visits: {}, sproutsLeft: 4, roseSmeltFox: false })

function talk(state: StoryState, target: Target) {
  const choice = chooseScript(EN_BOOK, target, state)
  if (choice.repeat) state.visits[target] = (state.visits[target] ?? 0) + 1
  const effects = choice.effects
  if (effects.star && !state.stars.includes(effects.star)) state.stars.push(effects.star)
  if (effects.fox !== undefined) state.fox = effects.fox
  if (effects.awaken) state.awake = true
  if (effects.roseSmeltFox) state.roseSmeltFox = true
  if (effects.pullSprout) state.sproutsLeft = Math.max(0, state.sproutsLeft - 1)
  return choice
}

const isLine = (value: unknown): value is Line => Array.isArray(value)
  && value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'string'
function collectScripts(value: unknown, out: Line[][] = []): Line[][] {
  if (Array.isArray(value) && value.length > 0 && value.every(isLine)) out.push(value as Line[])
  else if (Array.isArray(value)) value.forEach(child => collectScripts(child, out))
  else if (value && typeof value === 'object') Object.values(value).forEach(child => collectScripts(child, out))
  return out
}

describe('Farbound story adaptation', () => {
  it('keeps a substantial, non-empty English-only storybook', () => {
    const scripts = collectScripts(EN_BOOK)
    expect(scripts.length).toBeGreaterThan(20)
    for (const lines of scripts) {
      for (const [speaker, text] of lines) {
        expect(['', 'fox', 'rose', 'sheep', 'tapir', 'shoebill', 'you']).toContain(speaker)
        expect(text.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('advances the fox encounter to taming on the third conversation', () => {
    const state = fresh()
    talk(state, 'fox')
    expect(state.fox).toBe(1)
    expect(state.stars).not.toContain('fox')
    talk(state, 'fox')
    talk(state, 'fox')
    expect(state.fox).toBe(FOX_TAMED)
    expect(state.stars).toContain('fox')
    expect(talk(state, 'fox').repeat).toBe(true)
  })

  it('counts all four sprouts down and only then finishes the sprout story', () => {
    const state = fresh()
    for (let left = 3; left >= 0; left -= 1) {
      const choice = talk(state, 'sprout')
      expect(state.sproutsLeft).toBe(left)
      if (left === 0) expect(choice.lines).toEqual(EN_BOOK.sprout.last)
    }
    expect(state.stars).toContain('sprout')
  })

  it('wakes the guardian only after every star is lit', () => {
    const state = fresh()
    talk(state, 'guardian')
    expect(state.stars).toEqual(['guardian'])
    expect(talk(state, 'guardian').effects.awaken).toBeFalsy()
    for (const target of ['plane', 'hat', 'sprout', 'rose', 'sheep', 'box', 'tapir', 'shoebill'] as Target[]) talk(state, target)
    for (let count = 0; count < FOX_TAMED; count += 1) talk(state, 'fox')
    expect(state.stars.length).toBe(STARS.length)
    expect(talk(state, 'guardian').effects.awaken).toBe(true)
    expect(state.awake).toBe(true)
    expect(talk(state, 'guardian').effects.awaken).toBeFalsy()
  })
})
