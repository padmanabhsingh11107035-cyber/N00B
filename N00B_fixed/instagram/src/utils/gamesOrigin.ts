// WHERE THE GAMES RUN (finding M2 of docs/SECURITY-AND-LOAD-REPORT.md, steps in docs/GAMES-ORIGIN.md).
//
// Today every game is a folder of files on the app's own address (/games/<name>/) and is shown in a frame. A frame that may keep its own saved data must be allowed
// "same origin", and then a script of the game could also read the app's sign-in from this address's browser storage. Two protections, both optional and both off by default:
//   1. A separate games address (VITE_GAMES_ORIGIN, for example https://games.noobsocials.com, set when the app is BUILT). The games then run on their own origin, where
//      the app's sign-in does not exist, so "same origin" is harmless there and every game keeps its saves. Empty (the default) = the games stay on the app's address, as before.
//   2. `isolated: true` in the game list (types.ts): a game that needs no saved data of its own is framed WITHOUT allow-same-origin, so it runs in an opaque origin and cannot reach
//      anything of the app. Only used while the game is still on the app's address (on the games address it is not needed and would only cost the game its saves).
// No browser-only code runs when this file is loaded, so it can be tested on its own.

/** the value as typed at build time -> a clean origin ("https://host[:port]"), or '' when it is empty or not an https address (http only for a local test host) */
export function cleanGamesOrigin(raw: unknown): string {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  try {
    const u = new URL(v);
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname.endsWith('.localhost');
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return '';
    if (u.username || u.password) return '';
    return u.origin;
  } catch { return ''; }
}

const fromEnv = (): string => {
  try { return String((import.meta as any).env?.VITE_GAMES_ORIGIN || ''); } catch { return ''; }
};

/** the separate games address when one is set for this build, else '' */
export const GAMES_ORIGIN: string = cleanGamesOrigin(fromEnv());

export interface GameFramePlan {
  /** the address the frame loads */
  src: string;
  /** the exact origin the frame's messages must come from, and the only origin messages to it are addressed to; '' = the frame is opaque (no bridge possible, none is used) */
  origin: string;
  /** the sandbox attribute */
  sandbox: string;
  /** true when the game is on the separate games address */
  separate: boolean;
}

const SANDBOX_BASE = 'allow-scripts allow-pointer-lock allow-popups';

/**
 * How one game is framed.
 * @param path     the game's address on the app ("/games/royal-ludo/", possibly with a query)
 * @param opts.isolated        the game asked to run without same-origin rights while it is on the app's address
 * @param opts.sameOriginOnly  the game's own files still address the app by `window.location.origin` (cannot be moved to the games address yet)
 * @param opts.bridge          the game talks to the app through postMessage (ranking, score, online race): an opaque frame has no usable origin, so such a game is never isolated
 * @param opts.appOrigin       the app's own origin (window.location.origin)
 * @param games                the games address (default: this build's)
 */
export function planGameFrame(
  path: string,
  opts: { isolated?: boolean; sameOriginOnly?: boolean; bridge?: boolean; appOrigin: string },
  games: string = GAMES_ORIGIN,
): GameFramePlan {
  const separate = !!games && !opts.sameOriginOnly && path.startsWith('/') && !path.startsWith('//');
  if (separate) {
    // the game learns the app's origin from the address (a fragment: it is not sent to the server and does not change which file is fetched) so its replies go to the app only
    const sep = path.includes('#') ? '&' : '#';
    return { src: `${games}${path}${sep}noob-parent=${encodeURIComponent(opts.appOrigin)}`, origin: games, sandbox: `${SANDBOX_BASE} allow-same-origin`, separate: true };
  }
  const opaque = !!opts.isolated && !opts.bridge;
  return { src: path, origin: opaque ? '' : opts.appOrigin, sandbox: opaque ? SANDBOX_BASE : `${SANDBOX_BASE} allow-same-origin`, separate: false };
}
