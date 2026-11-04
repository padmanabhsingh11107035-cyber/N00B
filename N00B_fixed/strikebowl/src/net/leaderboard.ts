/**
 * The ranking of this game is kept on this device only (no account, no network). The class keeps the shape the screens
 * were written for: start a run, submit the score, ask for the standing and the list of the best runs.
 */
export const BOARD_ID = 'strike5-v1'

export type BoardEntry = { playerId: string; displayName: string; score: number; rank: number; isMe: boolean; achievedAt: string }
export type BoardPage = { period: 'today' | 'all'; players: number; entries: BoardEntry[]; myRank: { rank: number; score: number } | null }
export type Standing = { rank: number; players: number; beatPct: number }
export type SubmitResult = { accepted: true; improved: boolean; today: Standing | null; allTime: Standing | null } | { accepted: false; error: string }

type Run = { name: string; score: number; at: string }
const KEY = 'noob.strikebowl.board'
const MAX = 200

export class Leaderboard {
  upgradeRequired = false
  online = false
  readonly readOnly = false
  private name = 'You'
  private runs: Run[] = []

  constructor() {
    try {
      const raw = localStorage.getItem(KEY)
      const v = raw ? (JSON.parse(raw) as Run[]) : []
      if (Array.isArray(v)) this.runs = v.filter(r => r && typeof r.score === 'number' && typeof r.at === 'string').slice(0, MAX)
    } catch {
      this.runs = []
    }
  }

  get playerId(): string | null {
    return 'me'
  }

  get displayName(): string | null {
    return this.name
  }

  private persist(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.runs))
    } catch {
      // Storage blocked: the board lives for this visit only.
    }
  }

  async ensureGuest(name: string): Promise<boolean> {
    this.name = name || 'You'
    return true
  }

  async rename(name: string): Promise<boolean> {
    return this.ensureGuest(name)
  }

  async startRun(name: string): Promise<string | null> {
    this.name = name || 'You'
    return 'local'
  }

  private within(period: 'today' | 'all'): Run[] {
    const day = new Date().toDateString()
    return this.runs.filter(r => period === 'all' || new Date(r.at).toDateString() === day)
  }

  private standingFor(score: number, period: 'today' | 'all'): Standing {
    const list = this.within(period)
    const better = list.filter(r => r.score > score).length
    const worse = list.filter(r => r.score < score).length
    return { rank: better + 1, players: Math.max(1, list.length), beatPct: list.length > 1 ? Math.round((worse / (list.length - 1)) * 100) : 100 }
  }

  async submit(_runId: string, score: number, _durationMs: number, _rolls: number[]): Promise<SubmitResult> {
    const best = this.runs.reduce((m, r) => Math.max(m, r.score), -1)
    this.runs.push({ name: this.name, score, at: new Date().toISOString() })
    this.runs.sort((a, b) => b.score - a.score)
    this.runs = this.runs.slice(0, MAX)
    this.persist()
    return { accepted: true, improved: score > best, today: this.standingFor(score, 'today'), allTime: this.standingFor(score, 'all') }
  }

  async standing(score: number): Promise<{ today: Standing; allTime: Standing } | null> {
    return { today: this.standingFor(score, 'today'), allTime: this.standingFor(score, 'all') }
  }

  async list(period: 'today' | 'all', limit = 20): Promise<BoardPage | null> {
    const list = this.within(period).sort((a, b) => b.score - a.score)
    const entries = list.slice(0, limit).map((r, i) => ({ playerId: 'me', displayName: r.name, score: r.score, rank: i + 1, isMe: true, achievedAt: r.at }))
    return { period, players: list.length, entries, myRank: list.length ? { rank: 1, score: list[0].score } : null }
  }
}
