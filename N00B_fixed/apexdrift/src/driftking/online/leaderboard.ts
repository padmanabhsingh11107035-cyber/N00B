import type { Guest } from '../engine/save'

/**
 * The ranking of this game is kept on this device only (no account, no network). The class keeps the shape the screens were
 * written for: begin a run, submit the score, ask for the standing and the list of the best runs.
 */
export const BOARD = 'drift-v1'
export const RULES_VERSION = 'v1'

export type Scope = 'day' | 'all'
export type Entry = { playerId: string; displayName: string; score: number; rank: number; me: boolean }
export type BoardView = { scope: Scope; total: number; entries: Entry[]; myRank: { rank: number; score: number } | null }
export type Standing = { rank: number; total: number; beaten: number; best: number }
export type Receipt = { runId: string; score: number; day: string; all: Standing; today: Standing }
export type RunStats = { driftMs: number; clips: number; nearMisses: number; segments: number; maxMult: number; crashes: number }
export type OnlineErrorCode = 'offline' | 'rejected' | 'rate' | 'upgrade' | 'expired' | 'name' | 'busy'

export class OnlineError extends Error {
  constructor(readonly code: OnlineErrorCode, readonly detail = '') {
    super(`${code}${detail ? `:${detail}` : ''}`)
  }
}

type Run = { name: string; score: number; day: string }
const KEY = 'noob.apexdrift.board'
const MAX = 200
const today = (): string => new Date().toISOString().slice(0, 10)

export class Leaderboard {
  upgradeRequired = false
  private runs: Run[] = []
  private name = 'You'

  constructor(
    private guest: Guest | null,
    private readonly saveGuest: (g: Guest | null) => void,
  ) {
    if (guest?.name) this.name = guest.name
    try {
      const raw = localStorage.getItem(KEY)
      const v = raw ? (JSON.parse(raw) as Run[]) : []
      if (Array.isArray(v)) this.runs = v.filter(r => r && typeof r.score === 'number' && typeof r.day === 'string').slice(0, MAX)
    } catch {
      this.runs = []
    }
  }

  get identity(): Guest | null {
    return this.guest
  }

  private persist(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.runs))
    } catch {
      // Storage blocked: the board lives for this visit only.
    }
  }

  async ensureGuest(name: string): Promise<Guest> {
    if (!this.guest) {
      this.name = name || 'You'
      this.guest = { playerId: 'me', token: 'local', name: this.name }
      this.saveGuest(this.guest)
    }
    return this.guest
  }

  async beginRun(fallbackName: string): Promise<string> {
    await this.ensureGuest(fallbackName)
    return 'local'
  }

  async rename(name: string): Promise<void> {
    this.name = name || 'You'
    this.guest = { playerId: 'me', token: 'local', name: this.name }
    this.saveGuest(this.guest)
  }

  private within(scope: Scope): Run[] {
    const d = today()
    return this.runs.filter(r => scope === 'all' || r.day === d)
  }

  private standingFor(score: number, scope: Scope): Standing {
    const list = this.within(scope)
    const better = list.filter(r => r.score > score).length
    const worse = list.filter(r => r.score < score).length
    return { rank: better + 1, total: Math.max(1, list.length), beaten: worse, best: list.reduce((m, r) => Math.max(m, r.score), score) }
  }

  async submit(runId: string, score: number, _durationMs: number, _stats: RunStats): Promise<Receipt> {
    this.runs.push({ name: this.name, score, day: today() })
    this.runs.sort((a, b) => b.score - a.score)
    this.runs = this.runs.slice(0, MAX)
    this.persist()
    return { runId, score, day: today(), all: this.standingFor(score, 'all'), today: this.standingFor(score, 'day') }
  }

  async board(scope: Scope, limit = 20): Promise<BoardView> {
    const list = this.within(scope).sort((a, b) => b.score - a.score)
    const entries = list.slice(0, limit).map((r, i) => ({ playerId: 'me', displayName: r.name, score: r.score, rank: i + 1, me: true }))
    return { scope, total: list.length, entries, myRank: list.length ? { rank: 1, score: list[0].score } : null }
  }
}

/** "Beat X% of drivers" from a standing (0-100, integer). */
export function beatenPercent(s: Standing): number {
  const others = s.total - 1
  if (others <= 0) return 100
  return Math.max(0, Math.min(100, Math.floor((s.beaten / others) * 100)))
}
