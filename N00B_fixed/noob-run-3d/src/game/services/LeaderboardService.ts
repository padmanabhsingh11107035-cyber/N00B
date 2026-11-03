// The ranking of NOOB Run 3D is NOOB's shared score board: finished runs are sent to the page that shows the game (public/games/_shared/noob-score.js does the talking for the
// trophy button; here the game's own "Top runners" window asks for the same board). Nothing is made up: only real players are listed, and when the game is opened on its own, outside
// NOOB, there is no board.
export interface LeaderboardEntry {
  rank: number;
  username: string;
  avatar: string;
  score: number;
  distance: number;
  badge?: string;
  isCurrentUser?: boolean;
}

const GAME = 'noob_run_3d';
type Shim = { NoobScore?: { submit: (score: number) => void } };
type BoardRow = { rank: number; username: string; displayName?: string; avatar?: string; best: number; isMe: boolean };

export class LeaderboardService {
  /** Sends the score of a finished run (NOOB keeps each player's best). */
  public static submit(score: number): void {
    (window as unknown as Shim).NoobScore?.submit(score);
  }

  /** Asks the page that shows the game for the board; null when there is none (the game was opened on its own) or it did not answer. */
  public static request(): Promise<LeaderboardEntry[] | null> {
    if (window.parent === window) return Promise.resolve(null);
    return new Promise((resolve) => {
      let timer = 0;
      const done = (rows: LeaderboardEntry[] | null) => { window.removeEventListener('message', onMessage); window.clearTimeout(timer); resolve(rows); };
      const onMessage = (e: MessageEvent) => {
        if (e.source !== window.parent || e.origin !== window.location.origin) return;
        const d = e.data as { noobScore?: string; type?: string; ok?: boolean; board?: { rows?: BoardRow[] } } | null;
        if (!d || d.noobScore !== GAME || d.type !== 'board') return;
        if (!d.ok || !d.board?.rows) return done(null);
        done(d.board.rows.map((r) => ({
          rank: r.rank,
          username: r.displayName || r.username,
          avatar: r.avatar || '🏃',
          score: r.best,
          distance: Math.floor(r.best / 15),
          isCurrentUser: r.isMe,
          badge: r.best > 100000 ? 'LEGEND' : r.best > 50000 ? 'ACE' : undefined,
        })));
      };
      timer = window.setTimeout(() => done(null), 8000);
      window.addEventListener('message', onMessage);
      window.parent.postMessage({ noobScore: GAME, type: 'board-request' }, window.location.origin);
    });
  }
}
