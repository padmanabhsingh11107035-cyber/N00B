import React, { useState, useEffect, useRef } from 'react';
import { listenRoom, pingRoom } from '../../utils/roomPing';
import { listenLive, sendLive } from '../../utils/liveScore';
import { LoadingSmall } from '../Common/LoadingPages';
import './gamesZ.css';
import {
  X,
  ChevronLeft,
  Users,
  Bot,
  UserPlus,
  RotateCcw,
  Trophy,
  Sparkles,
  Search,
  Check,
  Send,
  Radio,
  Play,
  Flame,
  Zap,
  Clock,
  ArrowRight
} from 'lucide-react';
import { MiniGameMeta } from './types';
import { GamePosterCarousel } from './GamePosterCarousel';
import { HostedGameFrame } from './minigames/HostedGameFrame';
import { siteOrigin } from '../../utils/siteUrl';
import { warmHostedGame } from '../../utils/hostedGameWarmup';
import { loadGameSnapshot, saveGameSnapshot, clearGameSnapshot } from '../../utils/pageResume';
import { User } from '../../types';
import {
  recordGameMatch,
  helixLevelComplete,
  helixSubmitRun,
  helixLeaderboard,
  sendGameInvite,
  submitSurvivalScore,
  joinGameRoom,
  getGameRoom,
  submitGameRoomResult,
  submitGameRoomMove,
  submitChessMove,
  resignChessMatch,
  startChessRound,
  joinMatchmaking,
  getMatchmakingStatus,
  cancelMatchmaking,
  GameRoom
} from '../../services/api';
import confetti from 'canvas-confetti';
import { lazyTab } from '../../utils/lazyTab';

// Modular Dedicated Mini-Game Engines. Each one is its own file that is fetched only when its game is opened (and started fetching the moment the game's window opens, while
// the player is still choosing how to play), so opening the Games page or a window does not make the phone read and parse every game at once.
const { View: CyberSnakeGame, preload: preloadSnake } = lazyTab(() => import('./minigames/CyberSnakeGame').then((m) => m.CyberSnakeGame));
const { View: TicTacToeGame, preload: preloadTicTacToe } = lazyTab(() => import('./minigames/TicTacToeGame').then((m) => m.TicTacToeGame));
const { View: RockPaperScissorsGame, preload: preloadRps } = lazyTab(() => import('./minigames/RockPaperScissorsGame').then((m) => m.RockPaperScissorsGame));
const { View: SpeedMathGame, preload: preloadSpeedMath } = lazyTab(() => import('./minigames/SpeedMathGame').then((m) => m.SpeedMathGame));
const { View: MemoryMatchGame, preload: preloadMemory } = lazyTab(() => import('./minigames/MemoryMatchGame').then((m) => m.MemoryMatchGame));
const { View: ReactionTapGame, preload: preloadReaction } = lazyTab(() => import('./minigames/ReactionTapGame').then((m) => m.ReactionTapGame));
const { View: ColorRushGame, preload: preloadColorRush } = lazyTab(() => import('./minigames/ColorRushGame').then((m) => m.ColorRushGame));
const { View: HelixFallGame, preload: preloadHelix } = lazyTab(() => import('./minigames/HelixFallGame').then((m) => m.HelixFallGame));
const { View: GenericArcadeGame, preload: preloadGeneric } = lazyTab(() => import('./minigames/GenericArcadeGame').then((m) => m.GenericArcadeGame));
const { View: ChessGame, preload: preloadChess } = lazyTab(() => import('./minigames/chess/ChessGame').then((m) => m.ChessGame));
const { View: ChessOnlineMatch, preload: preloadChessOnline } = lazyTab(() => import('./minigames/chess/ChessOnlineMatch').then((m) => m.ChessOnlineMatch));
const { View: SnakesAndLaddersGame, preload: preloadSnakesLadders } = lazyTab(() => import('./minigames/SnakesAndLaddersGame').then((m) => m.SnakesAndLaddersGame));
const { View: LudoGame, preload: preloadLudo } = lazyTab(() => import('./minigames/LudoGame').then((m) => m.LudoGame));
const { View: MonopolyGame, preload: preloadMonopoly } = lazyTab(() => import('./minigames/MonopolyGame').then((m) => m.MonopolyGame));

/** The files a game needs, by catalog id; an id that is not here uses the generic arcade engine. */
const GAME_PRELOADS: Record<string, Array<() => Promise<unknown>>> = {
  cyber_snake: [preloadSnake], snake: [preloadSnake], pac_grid: [preloadSnake],
  tictactoe: [preloadTicTacToe], chess_blitz: [preloadChess, preloadChessOnline], snakes_ladders: [preloadSnakesLadders], ludo_classic: [preloadLudo],
  monopoly_noob: [preloadMonopoly], helix_fall: [preloadHelix], rps: [preloadRps], speed_math: [preloadSpeedMath], memory_match: [preloadMemory], reaction_tap: [preloadReaction], bubble_blitz: [preloadColorRush]
};

// Asks the server again only once the last answer has arrived: on a slow connection a plain timer piled up requests, and the game stalled behind them.
function pollOnce(ask: () => Promise<void>): () => void {
  let busy = false;
  return () => {
    if (busy) return;
    busy = true;
    void ask().finally(() => { busy = false; });
  };
}

// Shown for the moment a game's file is on its way (usually already there: it started loading when the window opened).
const GameLoading: React.FC = () => <LoadingSmall label="Loading the game…" />;

interface GamePlayModalProps {
  game: MiniGameMeta;
  currentUser: User;
  allUsers: User[];
  initialChallenger?: string;
  initialRoomCode?: string;
  onClose: () => void;
  onPointsUpdated: (pointsEarned: number, totalPoints: number, won?: boolean) => void;
}

type PlayMode = 'select_mode' | 'select_difficulty' | 'matchmaking' | 'play_bot' | 'play_friend' | 'play_match' | 'pass_play_handoff' | 'game_over';
type RoundResult = 'win' | 'tie' | 'loss';
type BotDifficulty = 'easy' | 'normal' | 'hard';

// One person in an invite list (a game's "play a friend" steps).
const InviteRow: React.FC<{ friend: { id: string; username: string; displayName: string; avatar?: string }; sent: boolean; onSend: () => void }> = ({ friend, sent, onSend }) => (
  <div className="gp-person">
    <span className="gp-av" aria-hidden="true">
      {friend.avatar ? <img src={friend.avatar} alt="" referrerPolicy="no-referrer" /> : (friend.displayName || friend.username || '?').slice(0, 1).toUpperCase()}
    </span>
    <span className="block min-w-0 flex-1">
      <span className="gp-pn block min-w-0 truncate">{friend.displayName}</span>
      <span className="gp-pu block min-w-0 truncate">@{friend.username}</span>
    </span>
    <button type="button" onClick={onSend} disabled={sent} className="gp-mini" data-red={sent ? '0' : '1'} data-done={sent ? '1' : '0'}>
      {sent ? <Check className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
      <span>{sent ? 'Sent' : 'Invite'}</span>
    </button>
  </div>
);

// Pure-luck games with zero decision points (nothing but dice rolls) — a
// difficulty selector would be cosmetic only, so these skip straight to the
// bot match like before instead of showing a selector that can't do anything.
const NO_BOT_DIFFICULTY_IDS = ['snakes_ladders'];

// Shared-board games manage their own multi-player turn loop internally and
// report ONE direct result for the logged-in user (index 0) — unlike the
// relay-style "each human plays the same solo challenge" scoring the other
// 50 games use for Pass and Play, so they must never be routed through
// finishPassPlayRound regardless of which mode launched them.
const BOARD_GAME_IDS = ['ludo_classic', 'snakes_ladders', 'monopoly_noob'];

// Games with a true live-synced shared board: the two matched players
// actually move on the SAME board in real time against each other, instead
// of each playing their own round against a bot and comparing results.
// Chess Blitz's moves are validated server-side by the chess-move Edge
// Function (see supabase/functions/chess-move) rather than a plain RPC,
// since real move legality/checkmate detection needs an actual chess
// engine and the result swings 50,000,000 points either way.
const SYNCED_GAME_IDS = ['tictactoe', 'chess_blitz'];

// Games whose built-in Pass and Play mode is a real, complete head-to-head
// match in itself (both symbols/players share the same instance) — same
// reasoning as chess_blitz below, these must report their one real result
// directly instead of being treated as "Player 1's round" of a two-round
// relay. Without this, TicTacToe/RPS pass-and-play used to always report
// 'win' for whoever finished the game, regardless of who actually won.
const SINGLE_RESULT_PASS_PLAY_IDS = ['tictactoe', 'rps'];

// Solo-only games with no opponent concept at all — no bot, no friend
// challenge, no pass-and-play. These skip the mode-select screen entirely
// and drop straight into gameplay. Cyber Snake is a pure high-score arcade
// game with no real "vs" concept, so "Play with Available Users" / "Play
// with Bot" / "Play with Friend" / "Pass and Play" never made sense for it.
const SOLO_ONLY_GAME_IDS: string[] = ['cyber_snake'];

export const GamePlayModal: React.FC<GamePlayModalProps> = ({
  game,
  currentUser,
  allUsers,
  initialChallenger,
  initialRoomCode,
  onClose,
  onPointsUpdated
}) => {
  // a big hosted game: its files are fetched quietly as soon as its page opens, so Play starts it at once
  useEffect(() => { if (game.embedLazy) warmHostedGame(game.id); }, [game.embedLazy, game.id]);
  // Chess Blitz is capped at one round a week for free accounts (its real
  // stakes make it something worth grinding otherwise). The check/consume
  // call fires once on mount for every entry path — bot, pass & play,
  // friend invite link, matchmaking — since they can all land here without
  // going through the mode-select screen (e.g. accepting a friend's invite
  // sets initialRoomCode and skips straight past it).
  const isChessBlitz = game.id === 'chess_blitz';
  // Refresh / reopening the app: the game comes back at the same step (mode, difficulty, whose turn in pass-and-play...), and the game
  // itself brings back its own board (see each game). Only for a game opened from the Games list, never from a friend's invite.
  // A step that can not be resumed (searching for an opponent, a live online match, the result screen) comes back as the mode picker.
  type ModalSnapshot = { mode: PlayMode; botDifficulty: BotDifficulty; isPassAndPlay: boolean; passPlayStage: 'p1' | 'p2'; passPlayP1Result: RoundResult | null; boardPlayerCount?: number; lastPlayMode: 'bot' | 'matchmaking' | 'friend' | 'pass_and_play' | null; chessStarted?: boolean };
  const modalKey = `modal:${game.id}`;
  const restoredRef = useRef<ModalSnapshot | null | undefined>(undefined);
  if (restoredRef.current === undefined) {
    restoredRef.current = initialRoomCode || initialChallenger ? null : loadGameSnapshot<ModalSnapshot>(currentUser.id, modalKey);
  }
  const restored = restoredRef.current;
  const [chessLimitChecked, setChessLimitChecked] = useState(!isChessBlitz || !!restored?.chessStarted);
  const chessStartedRef = useRef(!!restored?.chessStarted);
  const [chessLimitBlocked, setChessLimitBlocked] = useState<{ message: string; nextAvailableAt?: string } | null>(null);
  // Consuming the weekly credit is a real server-side side effect (not an
  // idempotent read), so a ref guards it against ever being sent twice —
  // React 18 StrictMode intentionally mounts, cleans up, then re-mounts
  // effects once in dev specifically to catch exactly this class of bug.
  // Deliberately no cancel-on-cleanup here: the ref already guarantees this
  // fires at most once per component instance, and since StrictMode's dev
  // "cleanup" isn't a real unmount, guarding on it would just discard the
  // one real in-flight response and leave the check stuck forever.
  const chessCheckStartedRef = useRef(!!restored?.chessStarted);   // a restored chess game already used its round, never take another

  // The game's own file starts loading as soon as its window opens, while the player is still choosing how to play.
  useEffect(() => {
    for (const load of GAME_PRELOADS[game.id] ?? [preloadGeneric]) void load().catch(() => undefined);
  }, [game.id]);

  useEffect(() => {
    // Pro accounts used to skip this call entirely (no weekly limit to
    // check) — but the server also uses this call to mark "a round has
    // legitimately started" before it will pay out a result, so a Pro
    // account never calling it meant it could never actually get paid
    // either. It still short-circuits the cooldown check server-side for
    // Pro; it just always needs to be called at all.
    if (!isChessBlitz) return;
    if (chessCheckStartedRef.current) return;
    chessCheckStartedRef.current = true;
    (async () => {
      try {
        const res = await startChessRound();
        if (res.success) chessStartedRef.current = true;
        if (!res.success) {
          setChessLimitBlocked({
            message: res.error || 'Chess Blitz is limited to once a week on the free plan.',
            nextAvailableAt: res.nextAvailableAt
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setChessLimitChecked(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [currentMode, setCurrentMode] = useState<PlayMode>(
    initialRoomCode && !BOARD_GAME_IDS.includes(game.id)
      ? 'play_match'
      : initialChallenger || SOLO_ONLY_GAME_IDS.includes(game.id)
      ? 'play_bot'
      : restored
      ? (['select_mode', 'select_difficulty', 'play_bot', 'pass_play_handoff'] as PlayMode[]).includes(restored.mode) ? restored.mode : 'select_mode'
      : 'select_mode'
  );
  const [opponentChallenger] = useState<string | undefined>(initialChallenger);
  const [matchmakingTimeLeft, setMatchmakingTimeLeft] = useState(30);
  const [matchmakingFailed, setMatchmakingFailed] = useState(false);

  // A real head-to-head match: two different users each play their own
  // round of the exact same game (identical to solo vs-bot play — no
  // per-game code changes needed) and the server compares the two results
  // once both are in. `roomCode` is shared between both sides via the chat
  // invite or the matchmaking pairing.
  type OnlineMatchPhase = 'joining' | 'waiting_opponent_join' | 'in_progress' | 'waiting_opponent_result';
  const [onlineMatch, setOnlineMatch] = useState<{
    roomCode: string;
    phase: OnlineMatchPhase;
    opponent?: { id: string; username: string; displayName: string; avatar: string };
    // Only set for SYNCED_GAME_IDS — which symbol this player is on the
    // shared board (room.players[0] is always 'X').
    mySymbol?: 'X' | 'O';
    // Chess Blitz's equivalent of mySymbol — room.players[0] is always white.
    myColor?: 'w' | 'b';
  } | null>(
    initialRoomCode && !BOARD_GAME_IDS.includes(game.id) ? { roomCode: initialRoomCode, phase: 'joining' } : null
  );

  // What the JUST-FINISHED (or in-progress) match actually was, so "Play Again" repeats the same
  // mode instead of silently defaulting to a bot — previously it always called either the pass-and-
  // play or bot starter, no matter how the match was actually started, which is why choosing
  // "Play with Available Users" or "Play with Friend" and then hitting Play Again always connected
  // to a bot instead. Stays set until the user explicitly picks a different mode from select_mode.
  const [lastPlayMode, setLastPlayMode] = useState<'bot' | 'matchmaking' | 'friend' | 'pass_and_play' | null>(
    initialChallenger || initialRoomCode ? 'friend' : restored?.lastPlayMode === 'bot' || restored?.lastPlayMode === 'pass_and_play' ? restored.lastPlayMode : null
  );
  const [lastOpponent, setLastOpponent] = useState<{ id: string; username: string } | null>(null);
  const [rematchRequested, setRematchRequested] = useState(false);
  const matchmakingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const matchmakingCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const matchmakingListenRef = useRef<(() => void) | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<User | null>(() => {
    if (initialChallenger) {
      return allUsers.find((u) => u.username === initialChallenger) || null;
    }
    return null;
  });
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [inviteSent, setInviteSent] = useState(false);
  const [generatedRoomCode, setGeneratedRoomCode] = useState(
    initialRoomCode || `NOOB-${game.id.toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`
  );
  const [copiedLink, setCopiedLink] = useState(false);

  const isBoardGame = BOARD_GAME_IDS.includes(game.id);
  const boardGameMaxPlayers = game.id === 'snakes_ladders' ? 8 : 4;
  // Board games ask "how many total players" before inviting, then require
  // sending that many minus one (yourself) requests via chat — tracked here
  // so the chosen total carries into the actual board once it starts.
  const [boardPlayerCount, setBoardPlayerCount] = useState<number | undefined>(restored?.boardPlayerCount);
  const [boardInviteStep, setBoardInviteStep] = useState<'count' | 'invite'>('count');
  const [boardInviteCount, setBoardInviteCount] = useState(isBoardGame ? Math.min(4, boardGameMaxPlayers) : 2);
  const [invitedFriendIds, setInvitedFriendIds] = useState<Set<string>>(new Set());

  // Active Game State (Tic Tac Toe / Clicker / Math / Drone / RPS)
  const [gameState, setGameState] = useState<any>({});
  const [gameResult, setGameResult] = useState<'win' | 'tie' | 'loss' | null>(null);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [survivalSeconds, setSurvivalSeconds] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pass and Play: two humans take turns on this device, each attempting the
  // same game's built-in challenge; whichever round did better (win > tie >
  // loss) wins the match.
  const [isPassAndPlay, setIsPassAndPlay] = useState(!!restored?.isPassAndPlay);
  const [passPlayStage, setPassPlayStage] = useState<'p1' | 'p2'>(restored?.passPlayStage === 'p2' ? 'p2' : 'p1');
  const [passPlayP1Result, setPassPlayP1Result] = useState<RoundResult | null>(restored?.passPlayP1Result ?? null);

  const clearMatchmakingTimers = () => {
    if (matchmakingPollRef.current) clearInterval(matchmakingPollRef.current);
    if (matchmakingCountdownRef.current) clearInterval(matchmakingCountdownRef.current);
    matchmakingPollRef.current = null;
    matchmakingCountdownRef.current = null;
    if (matchmakingListenRef.current) { matchmakingListenRef.current(); matchmakingListenRef.current = null; }
  };
  useEffect(() => clearMatchmakingTimers, []);

  // A match was found (either instantly on join, or picked up mid-poll) —
  // stop searching and drop straight into the actual game. `source` records
  // how this match actually came about, so "Play Again" later can repeat it
  // instead of guessing.
  const enterOnlineMatch = (room: GameRoom, source: 'matchmaking' | 'friend') => {
    clearMatchmakingTimers();
    const opponent = room.players.find((p) => p.userId !== currentUser.id);
    setLastPlayMode(source);
    setRematchRequested(false);
    if (opponent) setLastOpponent({ id: opponent.userId, username: opponent.username });

    if (SYNCED_GAME_IDS.includes(game.id)) {
      // Real head-to-head: both players move on the SAME server-held board,
      // so drop straight into it instead of starting a solo round vs a bot.
      const myIndex = room.players.findIndex((p) => p.userId === currentUser.id);
      setOnlineMatch(null);
      setIsPassAndPlay(false);
      setGameResult(null);
      setPointsEarned(0);
      const emptyBoard = game.id === 'chess_blitz' ? { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' } : Array(9).fill(null);
      setGameState({
        board: room.board || emptyBoard,
        turn: room.turn || room.players[0]?.userId
      });
      setCurrentMode('play_bot');
      setOnlineMatch({
        roomCode: room.code,
        phase: 'in_progress',
        opponent: opponent ? { id: opponent.userId, username: opponent.username, displayName: opponent.displayName, avatar: opponent.avatar } : undefined,
        mySymbol: myIndex === 0 ? 'X' : 'O',
        myColor: myIndex === 0 ? 'w' : 'b'
      });
      return;
    }

    startBotGameNow();
    setOnlineMatch({
      roomCode: room.code,
      phase: 'in_progress',
      opponent: opponent ? { id: opponent.userId, username: opponent.username, displayName: opponent.displayName, avatar: opponent.avatar } : undefined
    });
  };

  // Real matchmaking: ask the server to pair us with anyone else waiting
  // for the same game. If nobody's waiting yet, join the queue and poll —
  // this used to be a client-side timer with no server call at all, so it
  // could never actually find anyone.
  const startMatchmaking = async () => {
    setMatchmakingFailed(false);
    setMatchmakingTimeLeft(30);
    setCurrentMode('matchmaking');
    setLastPlayMode('matchmaking');
    setLastOpponent(null);

    try {
      const res = await joinMatchmaking(game.id, game.title);
      if (res.matched && res.room) {
        pingRoom(`mm-${game.id}`);   // tell the player who was waiting, at once
        enterOnlineMatch(res.room, 'matchmaking');
        return;
      }
    } catch (err) {
      console.error(err);
    }

    matchmakingCountdownRef.current = setInterval(() => {
      setMatchmakingTimeLeft((prev) => {
        if (prev <= 1) {
          clearMatchmakingTimers();
          cancelMatchmaking().catch(() => {});
          setMatchmakingFailed(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const checkMatch = pollOnce(async () => {
      try {
        const statusRes = await getMatchmakingStatus();
        if (statusRes.matched && statusRes.room) {
          enterOnlineMatch(statusRes.room, 'matchmaking');
        }
      } catch (err) {
        console.error(err);
      }
    });
    matchmakingPollRef.current = setInterval(checkMatch, 1000);   // a safety net: the newcomer's poke makes it run at once
    matchmakingListenRef.current = listenRoom(`mm-${game.id}`, checkMatch);
  };

  const handleCancelMatchmaking = () => {
    clearMatchmakingTimers();
    cancelMatchmaking().catch(() => {});
    setCurrentMode('select_mode');
  };

  // The header's X (and every other close path) used to call onClose
  // directly — fine most of the time, but while actively searching for a
  // match it just unmounted the modal without ever telling the server to
  // leave the queue. That queue entry then sat there until the 60s
  // staleness sweep, and if a real opponent joined in that window they'd
  // get "matched" into a room against someone who had already left —
  // exactly what "matchmaking is broken, my opponent never shows up" looks
  // like from the other side. Route every close through this instead.
  const handleModalClose = () => {
    if (currentMode === 'matchmaking') {
      clearMatchmakingTimers();
      cancelMatchmaking().catch(() => {});
    }
    onClose();
  };

  // Receiving side of a friend invite: join the room the inviter already
  // created. Their room is normally already 'ready' to receive us since
  // they joined it the moment they sent the invite.
  useEffect(() => {
    if (!onlineMatch || onlineMatch.phase !== 'joining') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await joinGameRoom(onlineMatch.roomCode, game.id, game.title);
        pingRoom(onlineMatch.roomCode);
        if (cancelled) return;
        if (res.success && res.room) {
          if (res.room.status === 'ready') {
            enterOnlineMatch(res.room, 'friend');
          } else {
            // We ended up first in this room (e.g. a stale/expired invite) —
            // nothing to play against yet.
            setOnlineMatch({ roomCode: onlineMatch.roomCode, phase: 'waiting_opponent_join' });
          }
        } else {
          setOnlineMatch(null);
          setCurrentMode('select_mode');
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setOnlineMatch(null);
          setCurrentMode('select_mode');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineMatch?.phase]);

  // Sending side of a friend invite (and the receiving side's fallback
  // above): poll the shared room until the other person joins.
  useEffect(() => {
    if (!onlineMatch || onlineMatch.phase !== 'waiting_opponent_join') return;
    const tick = pollOnce(async () => {
      try {
        const res = await getGameRoom(onlineMatch.roomCode);
        if (res.success && res.room && res.room.status !== 'waiting') {
          clearInterval(interval);
          enterOnlineMatch(res.room, 'friend');
        }
      } catch (err) {
        console.error(err);
      }
    });
    const interval = setInterval(tick, 1000);   // a safety net: the other player's poke (utils/roomPing.ts) makes it run at once
    window.addEventListener('noob-room-poke', tick);
    const stopListening = listenRoom(onlineMatch.roomCode, tick);
    return () => { clearInterval(interval); window.removeEventListener('noob-room-poke', tick); stopListening(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineMatch?.phase, onlineMatch?.roomCode]);

  // Once we've submitted our own result, poll until the opponent has
  // submitted theirs too so the head-to-head outcome can be shown.
  useEffect(() => {
    if (!onlineMatch || onlineMatch.phase !== 'waiting_opponent_result') return;
    const tick = pollOnce(async () => {
      try {
        const res = await getGameRoom(onlineMatch.roomCode);
        if (res.success && res.room && res.room.status === 'finished') {
          clearInterval(interval);
          finalizeOnlineMatch(res.room);
        }
      } catch (err) {
        console.error(err);
      }
    });
    const interval = setInterval(tick, 1000);   // a safety net: the other player's poke (utils/roomPing.ts) makes it run at once
    window.addEventListener('noob-room-poke', tick);
    const stopListening = listenRoom(onlineMatch.roomCode, tick);
    return () => { clearInterval(interval); window.removeEventListener('noob-room-poke', tick); stopListening(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineMatch?.phase, onlineMatch?.roomCode]);

  // Live-synced board (currently Tic Tac Toe): while it's in progress, poll
  // for the opponent's moves and for the match ending, since only the
  // player who makes the winning move learns the outcome directly.
  useEffect(() => {
    if (!onlineMatch || onlineMatch.phase !== 'in_progress' || !SYNCED_GAME_IDS.includes(game.id)) return;
    const tick = pollOnce(async () => {
      try {
        const res = await getGameRoom(onlineMatch.roomCode);
        if (!res.success || !res.room) return;
        if (res.room.status === 'finished' && res.room.outcome) {
          clearInterval(interval);
          finalizeOnlineMatch(res.room);
        } else if (res.room.board) {
          setGameState((prev: any) => ({ ...prev, board: res.room!.board, turn: res.room!.turn }));
        }
      } catch (err) {
        console.error(err);
      }
    });
    const interval = setInterval(tick, 700);   // a safety net: the other player's poke (utils/roomPing.ts) makes it run at once
    window.addEventListener('noob-room-poke', tick);
    const stopListening = listenRoom(onlineMatch.roomCode, tick);
    return () => { clearInterval(interval); window.removeEventListener('noob-room-poke', tick); stopListening(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineMatch?.phase, onlineMatch?.roomCode, game.id]);

  // Both players play their own round of these games at the same time; each one sees the other's score climb live (utils/liveScore.ts).
  const LIVE_SCORE_GAME_IDS = ['speed_math', 'bubble_blitz', 'cyber_snake', 'memory_match', 'rps'];
  const [opponentLive, setOpponentLive] = useState<number | null>(null);
  const liveOn = !!onlineMatch && onlineMatch.phase === 'in_progress' && LIVE_SCORE_GAME_IDS.includes(game.id) && currentMode === 'play_bot';
  useEffect(() => {
    if (!liveOn || !onlineMatch) { setOpponentLive(null); return; }
    setOpponentLive(0);
    return listenLive(onlineMatch.roomCode, (uid, value) => { if (uid !== currentUser.id) setOpponentLive(value); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveOn, onlineMatch?.roomCode]);
  const reportLive = liveOn && onlineMatch ? (v: number) => sendLive(onlineMatch.roomCode, currentUser.id, v) : undefined;

  const finalizeOnlineMatch = (room: GameRoom) => {
    const myOutcome = room.outcome?.results[currentUser.id] || 'tie';
    const myPoints = room.outcome?.points[currentUser.id] || 0;
    const opponentPlayer = room.players.find((p) => p.userId !== currentUser.id);

    setGameResult(myOutcome);
    setPointsEarned(myPoints);
    setOnlineMatch((prev) =>
      prev
        ? {
            ...prev,
            opponent: opponentPlayer
              ? { username: opponentPlayer.username, displayName: opponentPlayer.displayName, avatar: opponentPlayer.avatar }
              : prev.opponent
          }
        : prev
    );
    if (myOutcome === 'win') confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    onPointsUpdated(myPoints, (currentUser.noobPoints || 0) + myPoints, myOutcome === 'win');
    setIsSubmitting(false);
    setCurrentMode('game_over');
  };

  const finishOnlineMatch = async (result: RoundResult) => {
    if (!onlineMatch) return;
    setIsSubmitting(true);
    try {
      const res = await submitGameRoomResult(onlineMatch.roomCode, result);
      pingRoom(onlineMatch.roomCode);
      if (res.success && res.room) {
        if (res.room.status === 'finished' && res.room.outcome) {
          finalizeOnlineMatch(res.room);
        } else {
          setOnlineMatch({ ...onlineMatch, phase: 'waiting_opponent_result' });
          setCurrentMode('play_match');
          setIsSubmitting(false);
        }
      } else {
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
    }
  };

  // Start Bot Game setup
  const startBotGameNow = () => {
    // A genuinely fresh solo/bot round is never a continuation of a
    // finished match — clear it so a later completion doesn't try to
    // resubmit into an already-finished room. enterOnlineMatch() calls this
    // first and then sets the real onlineMatch right after, so that still
    // ends up correct for an actual match entry.
    setOnlineMatch(null);
    setIsPassAndPlay(false);
    setCurrentMode('play_bot');
    setGameResult(null);
    setPointsEarned(0);

    if (game.id === 'tictactoe') {
      setGameState({
        board: Array(9).fill(null),
        isPlayerTurn: true,
        winner: null
      });
    } else if (game.id === 'rps' || game.id === 'rps_extreme') {
      setGameState({
        playerChoice: null,
        botChoice: null,
        round: 1,
        playerScore: 0,
        botScore: 0
      });
    } else if (game.id === 'speed_math') {
      const a = Math.floor(Math.random() * 12) + 2;
      const b = Math.floor(Math.random() * 12) + 2;
      setGameState({
        qA: a,
        qB: b,
        correctAnswer: a * b,
        options: shuffleArray([a * b, a * b + 4, Math.max(2, a * b - 3), a * b + 7]),
        score: 0,
        timeLeft: 15
      });
    } else {
      // General Interactive Mini-Game
      setGameState({
        score: 0,
        targetScore: 10,
        clicks: 0,
        timeLeft: 10,
        active: true
      });
    }
  };

  const shuffleArray = (arr: number[]) => [...arr].sort(() => Math.random() - 0.5);

  // Chess vs bot carries real stakes (win big / lose everything) — show a
  // clear heads-up before every match instead of jumping straight in.
  const [showChessStakesConfirm, setShowChessStakesConfirm] = useState(false);
  // Chosen once per modal session on the difficulty-select screen, then
  // reused for every bot match (including rematches) until changed.
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>(restored?.botDifficulty ?? 'normal');
  // Keep the step up to date so a refresh can come back to it.
  useEffect(() => {
    if (initialRoomCode || initialChallenger || onlineMatch) return;
    const mode: PlayMode = currentMode === 'game_over' ? 'select_mode' : currentMode;
    saveGameSnapshot(currentUser.id, modalKey, { mode, botDifficulty, isPassAndPlay, passPlayStage, passPlayP1Result, boardPlayerCount, lastPlayMode, chessStarted: chessStartedRef.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMode, botDifficulty, isPassAndPlay, passPlayStage, passPlayP1Result, boardPlayerCount, lastPlayMode, chessLimitChecked, !!onlineMatch]);
  // The result screen means this game is over: whatever the game had saved is no longer needed.
  useEffect(() => {
    if (currentMode === 'game_over') clearGameSnapshot(currentUser.id, game.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMode]);
  const handleStartBotGame = () => {
    setLastPlayMode('bot');
    setLastOpponent(null);
    if (game.id === 'chess_blitz') {
      setShowChessStakesConfirm(true);
      return;
    }
    startBotGameNow();
  };

  // Entry point from "Play with Bot": shows the difficulty picker first
  // (unless the game has no bot decisions to tune), then starts the match.
  const handlePlayBotClick = () => {
    if (NO_BOT_DIFFICULTY_IDS.includes(game.id)) {
      handleStartBotGame();
      return;
    }
    setCurrentMode('select_difficulty');
  };

  const handlePickDifficulty = (level: BotDifficulty) => {
    setBotDifficulty(level);
    handleStartBotGame();
  };

  // Begin a brand new Pass and Play match (from the mode-select screen)
  const handleStartPassAndPlay = () => {
    setPassPlayStage('p1');
    setPassPlayP1Result(null);
    handleStartBotGame();
    setIsPassAndPlay(true);
    setLastPlayMode('pass_and_play');
  };

  // Start round 2, once Player 2 has the device (from the handoff screen)
  const handleStartPassAndPlayRound2 = () => {
    handleStartBotGame();
    setIsPassAndPlay(true);
  };

  const RESULT_RANK: Record<RoundResult, number> = { win: 2, tie: 1, loss: 0 };

  // Called instead of finishGame() while in Pass and Play mode
  const finishPassPlayRound = async (result: RoundResult) => {
    if (passPlayStage === 'p1') {
      setPassPlayP1Result(result);
      setPassPlayStage('p2');
      setCurrentMode('pass_play_handoff');
      return;
    }

    // Round 2 just finished — compare both players' results
    const p1Result = passPlayP1Result as RoundResult;
    const overall: RoundResult =
      RESULT_RANK[p1Result] > RESULT_RANK[result]
        ? 'win'
        : RESULT_RANK[p1Result] < RESULT_RANK[result]
        ? 'loss'
        : 'tie';

    setIsSubmitting(true);
    setGameResult(overall);

    let earned = 0;
    if (overall === 'win') {
      earned = 10_000_000;
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    } else if (overall === 'tie') {
      earned = 5_000_000;
    }
    setPointsEarned(earned);

    try {
      const res = await recordGameMatch(game.id, game.title, overall, 'Player 2 (Pass & Play)', false);
      if (res.success) {
        onPointsUpdated(earned, res.totalNoobPoints, overall === 'win');
      }
    } catch (err) {
      console.error(err);
      onPointsUpdated(earned, (currentUser.noobPoints || 0) + earned, overall === 'win');
    } finally {
      setIsSubmitting(false);
      setCurrentMode('game_over');
    }
  };

  // Dispatches to the right finish handler depending on mode — every game
  // engine's onGameOver wires here instead of calling finishGame directly.
  const handleGameOver = (result: RoundResult) => {
    if (onlineMatch) finishOnlineMatch(result);
    // Chess reports one definitive result the instant checkmate/draw
    // happens on its single shared board — same as the true board games,
    // it must never go through finishPassPlayRound's "play two independent
    // rounds and compare" relay, which was designed for games with no
    // shared board (each player takes a turn at the SAME solo challenge).
    // Routing it there meant a finished chess match got treated as only
    // "Player 1's round" and demanded an unrelated second game before ever
    // recording the real outcome.
    else if (
      isPassAndPlay &&
      !BOARD_GAME_IDS.includes(game.id) &&
      game.id !== 'chess_blitz' &&
      !SINGLE_RESULT_PASS_PLAY_IDS.includes(game.id)
    ) finishPassPlayRound(result);
    else finishGame(result);
  };

  // Handle Game Finish & Point Awarding
  const finishGame = async (result: 'win' | 'tie' | 'loss', opponentName = 'Bot Pro') => {
    setIsSubmitting(true);
    setGameResult(result);

    let earned = 0;
    // High stakes apply ONLY vs the bot — Pass & Play chess is explicitly
    // advertised as "no risk" (see the chess stakes copy elsewhere), so it
    // must fall through to the same flat 100/50/0 every other head-to-head
    // game uses instead of the jackpot/wipe payout.
    if (game.id === 'chess_blitz' && !isPassAndPlay) {
      if (result === 'win') {
        earned = 50_000_000;
        confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 } });
      } else if (result === 'loss') {
        earned = -(currentUser.noobPoints || 0);
      } else {
        earned = 5_000_000;
      }
    } else if (result === 'win') {
      earned = 10_000_000;
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    } else if (result === 'tie') {
      earned = 5_000_000;
    } else {
      earned = 0;
    }

    setPointsEarned(earned);

    try {
      // Was hardcoded true regardless of mode. Harmless for other games,
      // but now that chess Pass & Play reaches this same function (see
      // handleGameOver above), sending true here would tell the server
      // isChessHighStakes=true for a match that's supposed to be risk-free.
      const res = await recordGameMatch(game.id, game.title, result, opponentName, !isPassAndPlay);
      if (res.success) {
        onPointsUpdated(earned, res.totalNoobPoints, result === 'win');
      }
    } catch (err) {
      console.error(err);
      onPointsUpdated(earned, (currentUser.noobPoints || 0) + earned, result === 'win');
    } finally {
      setIsSubmitting(false);
      setCurrentMode('game_over');
    }
  };

  // Helix Fall keeps its own screens on show (it has levels, its own results and its own board), so it reports to the app instead of using finishGame:
  // every level cleared pays 50,000,000 at once (levels never end), and a finished run keeps only the player's best score for the board.
  const payHelixLevel = async (level: number): Promise<{ earned: number } | { error: string }> => {
    const res = await helixLevelComplete(level);
    if (!res.success) {
      const text = res.error || 'Could not save this level.';
      return { error: /function .*does not exist|schema cache|PGRST202/i.test(text) ? 'saving levels is being set up, try again soon.' : text };
    }
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
    onPointsUpdated(res.earnedPoints, res.totalNoobPoints, true);
    return { earned: res.earnedPoints };
  };
  const saveHelixRun = async (run: { score: number; floors: number; level: number; kind: 'daily' | 'practice' }) => {
    const res = await helixSubmitRun({ score: run.score, floors: run.floors, level: run.level, daily: run.kind === 'daily' });
    return res.success ? { bestScore: res.bestScore, newBest: res.newBest } : null;
  };

  // Survival games (no win/tie/loss, no opponent) pay out 10 NOOB Points
  // per second survived via a dedicated endpoint instead of finishGame's
  // fixed win/tie/loss amounts.
  const finishSurvivalGame = async (seconds: number) => {
    setIsSubmitting(true);
    setGameResult('win');
    setSurvivalSeconds(seconds);
    const estimatedEarned = seconds * 1000000;
    setPointsEarned(estimatedEarned);

    try {
      const res = await submitSurvivalScore(game.id, game.title, seconds);
      if (res.success) {
        setPointsEarned(res.earnedPoints);
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
        onPointsUpdated(res.earnedPoints, res.totalNoobPoints, true);
      }
    } catch (err) {
      console.error(err);
      onPointsUpdated(estimatedEarned, (currentUser.noobPoints || 0) + estimatedEarned, true);
    } finally {
      setIsSubmitting(false);
      setCurrentMode('game_over');
    }
  };

  // Live-synced Tic Tac Toe move: the server is authoritative on turns and
  // win detection, so this just submits the tapped cell and reflects
  // whatever board/turn/outcome comes back.
  const handleOnlineTicTacToeMove = async (index: number) => {
    if (!onlineMatch || isSubmitting) return;
    if (!gameState.board || gameState.board[index] || gameState.turn !== currentUser.id) return;

    setIsSubmitting(true);
    try {
      const res = await submitGameRoomMove(onlineMatch.roomCode, index);
      pingRoom(onlineMatch.roomCode);
      if (res.success && res.room) {
        if (res.room.status === 'finished' && res.room.outcome) {
          finalizeOnlineMatch(res.room);
        } else {
          setGameState((prev: any) => ({ ...prev, board: res.room!.board, turn: res.room!.turn }));
          setIsSubmitting(false);
        }
      } else {
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
    }
  };

  const handleChessOnlineMove = async (from: string, to: string, promotion?: string) => {
    if (!onlineMatch || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await submitChessMove(onlineMatch.roomCode, from, to, promotion);
      if (res.success && res.room) {
        if (res.room.status === 'finished' && res.room.outcome) {
          finalizeOnlineMatch(res.room);
        } else {
          setGameState((prev: any) => ({ ...prev, board: res.room!.board, turn: res.room!.turn }));
          setIsSubmitting(false);
        }
      } else {
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
    }
  };

  const handleChessResign = async () => {
    if (!onlineMatch || isSubmitting) return;
    if (!window.confirm('Resign this match? You will lose.')) return;
    setIsSubmitting(true);
    try {
      const res = await resignChessMatch(onlineMatch.roomCode);
      if (res.success && res.room && res.room.status === 'finished' && res.room.outcome) {
        finalizeOnlineMatch(res.room);
      } else {
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
    }
  };

  // Rock Paper Scissors Move
  const handleRPSChoice = (playerChoice: string) => {
    const choices = ['rock', 'paper', 'scissors'];
    const botChoice = choices[Math.floor(Math.random() * choices.length)];

    let result: 'win' | 'tie' | 'loss' = 'tie';
    if (playerChoice === botChoice) {
      result = 'tie';
    } else if (
      (playerChoice === 'rock' && botChoice === 'scissors') ||
      (playerChoice === 'paper' && botChoice === 'rock') ||
      (playerChoice === 'scissors' && botChoice === 'paper')
    ) {
      result = 'win';
    } else {
      result = 'loss';
    }

    setGameState({ playerChoice, botChoice, result });
    setTimeout(() => {
      finishGame(result);
    }, 1000);
  };

  // Math Answer Click
  const handleMathAnswer = (ans: number) => {
    if (ans === gameState.correctAnswer) {
      finishGame('win');
    } else {
      finishGame('loss');
    }
  };

  // Generic Clicker Action
  const handleActionClick = () => {
    const newClicks = (gameState.clicks || 0) + 1;
    if (newClicks >= 10) {
      finishGame('win');
    } else {
      setGameState({ ...gameState, clicks: newClicks });
    }
  };

  // Send Game Invite to Friend
  const handleSendFriendInvite = async (friend: User) => {
    // Lock the button synchronously, before the network round-trip — it
    // used to only disable once sendGameInvite's await resolved, leaving a
    // window where a double-tap (very easy on a touchscreen) fired this
    // twice and posted the exact same challenge into the chat twice.
    if (selectedFriend?.id === friend.id && inviteSent) return;
    setSelectedFriend(friend);
    setInviteSent(true);
    setLastPlayMode('friend');
    setLastOpponent({ id: friend.id, username: friend.username });
    try {
      await sendGameInvite(friend.id, game.id, game.title, generatedRoomCode);
      // Join our own room as player 1 and start waiting for them to accept
      // it from the chat invite — this is the actual connection that was
      // previously missing entirely (the invite used to just be a chat
      // message with no real link between the two sides).
      const res = await joinGameRoom(generatedRoomCode, game.id, game.title);
      pingRoom(generatedRoomCode);
      if (res.success && res.room) {
        setOnlineMatch({ roomCode: generatedRoomCode, phase: 'waiting_opponent_join' });
        setCurrentMode('play_match');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Board games need several invites (one per open seat), not just one — this
  // sends an additional chat invite and tracks it separately from the
  // single-friend flow the other games use.
  const handleSendBoardInvite = async (friend: User) => {
    setInvitedFriendIds((prev) => new Set(prev).add(friend.id));
    try {
      await sendGameInvite(friend.id, game.id, game.title, generatedRoomCode);
    } catch (err) {
      console.error(err);
    }
  };

  const seatsNeeded = Math.max(0, boardInviteCount - 1);

  const openPlayFriend = () => {
    setBoardInviteStep('count');
    setInvitedFriendIds(new Set());
    setCurrentMode('play_friend');
  };

  // Re-challenges the SAME friend from the match that just ended, instead of "Play Again" silently
  // dropping to a bot — needs a fresh room code since the old one is already 'finished' server-side.
  const handleRematchSameFriend = async () => {
    if (!lastOpponent) {
      openPlayFriend();
      return;
    }
    const rematchRoomCode = `NOOB-${game.id.toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    setGeneratedRoomCode(rematchRoomCode);
    setGameResult(null);
    setRematchRequested(true);
    setCurrentMode('play_match');
    try {
      await sendGameInvite(lastOpponent.id, game.id, game.title, rematchRoomCode);
      const res = await joinGameRoom(rematchRoomCode, game.id, game.title);
      pingRoom(rematchRoomCode);
      if (res.success && res.room) {
        setOnlineMatch({ roomCode: rematchRoomCode, phase: 'waiting_opponent_join' });
      } else {
        setCurrentMode('select_mode');
      }
    } catch (err) {
      console.error(err);
      setCurrentMode('select_mode');
    }
  };

  // "Play Again" repeats whatever mode the last match actually was — set by startMatchmaking,
  // handleSendFriendInvite, enterOnlineMatch, handleStartBotGame or handleStartPassAndPlay — instead
  // of always restarting a bot/pass-and-play round regardless of how the previous one was started.
  // Stays this way until the user goes back to select_mode and picks something else themselves.
  const handlePlayAgain = () => {
    if (lastPlayMode === 'pass_and_play') {
      handleStartPassAndPlay();
    } else if (lastPlayMode === 'matchmaking') {
      startMatchmaking();
    } else if (lastPlayMode === 'friend') {
      if (isBoardGame) {
        setInvitedFriendIds(new Set());
        setBoardInviteStep('invite');
        setCurrentMode('play_friend');
      } else {
        handleRematchSameFriend();
      }
    } else {
      handleStartBotGame();
    }
  };

  // Copy Match Link
  const handleCopyLink = () => {
    const shareUrl = `${siteOrigin()}/?playGame=${game.id}&challenger=${currentUser.username}&room=${generatedRoomCode}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(shareUrl);
    }
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  const filteredFriends = allUsers.filter(
    (u) =>
      u.id !== currentUser.id &&
      (u.username.toLowerCase().includes(friendSearchQuery.toLowerCase()) ||
        u.displayName.toLowerCase().includes(friendSearchQuery.toLowerCase()))
  );

  // Ludo/Snakes&Ladders/Monopoly (isBoardGame) and Chess all need real screen
  // real estate to render at a comfortable size — everything else fits fine
  // in the standard modal width.
  const useLargeBoard = (isBoardGame || game.id === 'chess_blitz' || game.id === 'helix_fall' || !!game.embedUrl) && currentMode === 'play_bot';

  return (
    <div className="gz gp edge-own" data-noob-keep="1" role="dialog" aria-modal="true" aria-label={game.title} data-testid="game-page">
      {/* the bar: back, the game's picture and name, what a win gives */}
      <div className="gp-bar">
        <div className={`gp-bar-in ${useLargeBoard ? 'max-w-6xl' : 'max-w-2xl'}`}>
          <button type="button" onClick={handleModalClose} className="gz-ib" aria-label="Back to the games" data-testid="game-page-back">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="gp-thumb" aria-hidden="true">
            {game.posters && game.posters[0] ? <img src={game.posters[0]} alt="" loading="lazy" decoding="async" /> : game.title.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="gp-title block truncate">{game.title}</h2>
            <div className="gp-meta">
              <b className="block min-w-0 max-w-[68%] shrink-0 truncate">{game.pointsReward > 0 ? `${game.pointsReward.toLocaleString()} NOOBs ${game.rewardNote ?? 'on Win'}` : game.rewardNote}</b>
              <span className="shrink-0">·</span>
              <span className="block min-w-0 flex-1 truncate">
                {game.id === 'chess_blitz' ? 'Balance wiped on Loss' : game.id === 'helix_fall' || game.embedUrl ? 'Solo' : '5,000,000 NOOBs on Tie'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* the page under the bar */}
      <div className="gp-body" data-stage={useLargeBoard ? '1' : undefined}>
        <div className={`gp-body-in ${useLargeBoard ? 'max-w-6xl' : 'max-w-2xl'}`}>
          {!chessLimitChecked ? (
            <LoadingSmall label="Checking availability…" />
          ) : chessLimitBlocked ? (
            <div className="py-10 flex flex-col items-center text-center space-y-4 px-2">
              <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-400 text-amber-300 flex items-center justify-center text-2xl">
                ♟️
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Weekly Chess Limit Reached</h3>
                <p className="text-xs text-zinc-400 mt-2 max-w-xs mx-auto">{chessLimitBlocked.message}</p>
                {chessLimitBlocked.nextAvailableAt && (
                  <p className="text-[11px] text-zinc-500 mt-2">
                    Next free game unlocks {new Date(chessLimitBlocked.nextAvailableAt).toLocaleString()}
                  </p>
                )}
              </div>
              <p className="text-[11px] text-amber-300/80 max-w-xs mx-auto">
                Upgrade to NOOB Pro from your profile for up to 4 Chess Blitz rounds a week.
              </p>
              <button
                onClick={handleModalClose}
                className="px-6 py-2.5 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          ) : (
            <>
          {/* A hosted game (its own page) is added here, out of sight, as soon as its page opens, and shown when Play is pressed */}
          {game.embedUrl && (currentMode === 'select_mode' || currentMode === 'play_bot') && (
            <HostedGameFrame url={game.embedUrl} title={game.title} visible={currentMode === 'play_bot'} lazy={game.embedLazy} portrait={game.embedPortrait} ranking={game.id === 'color_sort' ? 'color-sort' : game.id === 'brick_escape' ? 'brick-escape' : undefined} scoreGame={game.scoreGame} isolated={game.isolated} sameOriginOnly={game.sameOriginOnly} multiplayer={game.id === 'critter_kart' ? { game: 'critterkart', id: currentUser.id, name: currentUser.displayName || currentUser.username } : undefined} />
          )}

          {/* 1. SELECT MODE VIEW */}
          {currentMode === 'select_mode' && (
            <div className="space-y-4">
              {/* Game Artwork Preview: auto-advancing, swipeable poster carousel */}
              {game.posters && game.posters.length > 0 ? <GamePosterCarousel game={game} tall /> : (() => {
                // no picture of its own: the same drawn poster as on the Games page (same colourway for the same game)
                let h = 0; for (let i = 0; i < game.id.length; i++) h = (h * 31 + game.id.charCodeAt(i)) >>> 0;
                const words = game.title.replace(/[^A-Za-z0-9 ]/g, ' ').split(' ').filter(Boolean);
                return (
                  <span className="gz-poster gp-hero" data-testid="game-page-art">
                    <span className="gz-art" data-c={h % 6}>
                      <span className="gz-mono" aria-hidden="true">{((words[0]?.[0] || 'N') + (words[1]?.[0] || '')).toUpperCase()}</span>
                      <span className="gz-art-t line-clamp-2">{game.title}</span>
                    </span>
                  </span>
                );
              })()}

              <div>
                <p className="gp-about break-words">{game.description}</p>
                <div className="gp-chips">
                  <span className="gp-chipx"><span className="block min-w-0 truncate">{game.category}</span></span>
                  <span className="gp-chipx"><span className="block min-w-0 truncate">{game.difficulty}</span></span>
                  <span className="gp-chipx"><span className="block min-w-0 truncate">{game.players}</span></span>
                </div>
              </div>

              {game.embedUrl ? (
                <div className="pt-2 space-y-2.5">
                  <div className="gp-note">
                    {game.embedPortrait && !game.embedLazy ? 'It is already loading (it is a small game), so it is ready when you press Play.' : game.embedPortrait ? 'It starts loading now, so it is ready when you press Play.' : 'It starts loading now, so it is ready when you press Play. The first time it is a big download.'}
                  </div>
                  <button
                    onClick={startBotGameNow}
                    className="gp-play" data-testid="game-page-play"
                  >
                    <Play className="w-5 h-5 shrink-0 fill-current" /><span className="block min-w-0 truncate">Play {game.title}</span>
                  </button>
                  <p className="gp-hint">{game.embedControls ?? 'Keyboard: arrows to move, the on-screen buttons on a phone. It has its own music; no NOOBs for this one, it is just for fun.'}</p>
                </div>
              ) : game.id === 'helix_fall' ? (
                <div className="pt-2 space-y-2.5">
                  <div className="gp-note">
                    Clear 90 floors = a level: +{game.pointsReward.toLocaleString()} NOOBs, paid at once, level after level. Your best score is on the leaderboard.
                  </div>
                  <button
                    onClick={startBotGameNow}
                    className="gp-play" data-testid="game-page-play"
                  >
                    <Play className="w-5 h-5 shrink-0 fill-current" /><span className="block min-w-0 truncate">Play Helix Fall</span>
                  </button>
                  <p className="gp-hint">Rotate with A / D, the arrow keys, or by dragging. One shield per level forgives your first hazard.</p>
                </div>
              ) : (
              <div className="pt-2 space-y-2.5">
                <span className="gp-sec block">How do you want to play?</span>

                <button type="button" onClick={startMatchmaking} className="gp-opt">
                  <span className="gp-opt-ico"><Users className="w-5 h-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="gp-opt-t block truncate">Play online</span>
                    <span className="gp-opt-s">A quick match with someone who is online now (30 second wait)</span>
                  </span>
                  <ArrowRight className="gp-opt-go w-4 h-4" />
                </button>
                <button type="button" onClick={handlePlayBotClick} className="gp-opt">
                  <span className="gp-opt-ico"><Bot className="w-5 h-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="gp-opt-t block truncate">Play the bot</span>
                    <span className="gp-opt-s">Start at once against the computer; you pick how hard</span>
                  </span>
                  <ArrowRight className="gp-opt-go w-4 h-4" />
                </button>
                <button type="button" onClick={openPlayFriend} className="gp-opt">
                  <span className="gp-opt-ico"><UserPlus className="w-5 h-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="gp-opt-t block truncate">Play a friend</span>
                    <span className="gp-opt-s">Send an invite in chat, or share the match link</span>
                  </span>
                  <ArrowRight className="gp-opt-go w-4 h-4" />
                </button>
                <button type="button" onClick={handleStartPassAndPlay} className="gp-opt">
                  <span className="gp-opt-ico"><Users className="w-5 h-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="gp-opt-t block truncate">Pass and play</span>
                    <span className="gp-opt-s">Two players take turns on this one phone</span>
                  </span>
                  <ArrowRight className="gp-opt-go w-4 h-4" />
                </button>
              </div>
              )}
            </div>
          )}

          {/* 1b. SELECT BOT DIFFICULTY */}
          {currentMode === 'select_difficulty' && (
            <div className="gp-step" data-testid="game-step-difficulty">
              <div>
                <span className="gp-sec">Play the bot</span>
                <h3 className="gp-h mt-1.5">How hard should it play?</h3>
                <p className="gp-sub">This changes how the bot really plays, not just the label.</p>
              </div>

              <div className="gp-list">
                {([
                  { level: 'easy' as const, label: 'Easy', desc: 'Makes mistakes often. Good for a first try.', bars: 1 },
                  { level: 'normal' as const, label: 'Normal', desc: 'A fair, balanced game.', bars: 2 },
                  { level: 'hard' as const, label: 'Hard', desc: 'Plays to win and rarely slips.', bars: 3 }
                ]).map(({ level, label, desc, bars }) => (
                  <button key={level} type="button" onClick={() => handlePickDifficulty(level)} className="gp-opt" data-testid={`game-difficulty-${level}`}>
                    <span className="gp-opt-ico" aria-hidden="true">
                      <span className="gp-lvl">{[1, 2, 3].map((n) => <i key={n} data-on={n <= bars ? '1' : '0'} />)}</span>
                    </span>
                    <span className="block min-w-0 flex-1">
                      <span className="gp-opt-t">{label}</span>
                      <span className="gp-opt-s">{desc}</span>
                    </span>
                    <ArrowRight className="gp-opt-go w-4 h-4" />
                  </button>
                ))}
              </div>

              <button type="button" onClick={() => setCurrentMode('select_mode')} className="gp-quiet">Back</button>
            </div>
          )}

          {/* 2. MATCHMAKING QUEUE (30 s search) */}
          {currentMode === 'matchmaking' && (
            <div className="gp-step" data-mid="1" data-testid="game-step-matchmaking">
              {!matchmakingFailed ? (
                <>
                  <div className="gp-radar" aria-hidden="true">
                    <s />
                    <div className="gp-radar-core">
                      <span className="gp-radar-n">{matchmakingTimeLeft}</span>
                      <span className="gp-radar-u">seconds</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="gp-h">Finding a player</h3>
                    <p className="gp-sub max-w-xs mx-auto">
                      Looking for someone who is playing <b>{game.title}</b> right now.
                    </p>
                  </div>

                  <div className="gp-prog" role="progressbar" aria-valuemin={0} aria-valuemax={30} aria-valuenow={30 - matchmakingTimeLeft}>
                    <i style={{ width: `${((30 - matchmakingTimeLeft) / 30) * 100}%` }} />
                  </div>

                  <button type="button" onClick={handleCancelMatchmaking} className="gp-quiet">Cancel search</button>
                </>
              ) : (
                <>
                  <div className="gp-medal" data-r="tie" aria-hidden="true"><Clock className="w-10 h-10" /></div>

                  <div>
                    <h3 className="gp-h">Nobody is free right now</h3>
                    <p className="gp-sub max-w-xs mx-auto">No one joined within 30 seconds. Pick what to do next.</p>
                  </div>

                  <div className="gp-list text-left">
                    <button type="button" onClick={startMatchmaking} className="gp-opt">
                      <span className="gp-opt-ico" aria-hidden="true"><RotateCcw className="w-5 h-5" /></span>
                      <span className="block min-w-0 flex-1">
                        <span className="gp-opt-t">Search again</span>
                        <span className="gp-opt-s">Look for a player for 30 more seconds.</span>
                      </span>
                      <ArrowRight className="gp-opt-go w-4 h-4" />
                    </button>
                    <button type="button" onClick={handleStartBotGame} className="gp-opt">
                      <span className="gp-opt-ico" aria-hidden="true"><Bot className="w-5 h-5" /></span>
                      <span className="block min-w-0 flex-1">
                        <span className="gp-opt-t">Play the bot</span>
                        <span className="gp-opt-s">Start now, no waiting.</span>
                      </span>
                      <ArrowRight className="gp-opt-go w-4 h-4" />
                    </button>
                    <button type="button" onClick={openPlayFriend} className="gp-opt">
                      <span className="gp-opt-ico" aria-hidden="true"><UserPlus className="w-5 h-5" /></span>
                      <span className="block min-w-0 flex-1">
                        <span className="gp-opt-t">Invite a friend</span>
                        <span className="gp-opt-s">Send a challenge in chat.</span>
                      </span>
                      <ArrowRight className="gp-opt-go w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 3a. PLAY WITH FRIEND — board games: ask total player count first,
              then send one invite per open seat (not just one friend) */}
          {currentMode === 'play_friend' && isBoardGame && (
            <div className="gp-step" data-testid="game-step-friends">
              {boardInviteStep === 'count' ? (
                <>
                  <div>
                    <span className="gp-sec">Play with friends</span>
                    <h3 className="gp-h mt-1.5">How many players?</h3>
                    <p className="gp-sub">Count yourself too.</p>
                  </div>
                  <div className="gp-seats">
                    {Array.from({ length: boardGameMaxPlayers - 1 }, (_, i) => i + 2).map((n) => (
                      <button key={n} type="button" onClick={() => setBoardInviteCount(n)} aria-pressed={boardInviteCount === n} className="gp-seat">
                        {n}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setInvitedFriendIds(new Set());
                      setBoardInviteStep('invite');
                    }}
                    className="gp-play"
                  >
                    <span className="block min-w-0 truncate">Next: invite {seatsNeeded} friend{seatsNeeded === 1 ? '' : 's'}</span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </button>
                  <button type="button" onClick={() => setCurrentMode('select_mode')} className="gp-quiet">Back</button>
                </>
              ) : (
                <>
                  <div>
                    <span className="gp-sec">Play with friends</span>
                    <h3 className="gp-h mt-1.5">Invite {seatsNeeded} friend{seatsNeeded === 1 ? '' : 's'}</h3>
                    <p className="gp-sub">Each friend gets a request in chat. A seat you do not fill starts with a bot.</p>
                  </div>

                  <div className="gp-tally">
                    <span>Requests sent</span>
                    <b>{invitedFriendIds.size} / {seatsNeeded}</b>
                    <div className="gp-prog" aria-hidden="true"><i style={{ width: `${seatsNeeded ? Math.min(100, (invitedFriendIds.size / seatsNeeded) * 100) : 0}%` }} /></div>
                  </div>

                  <label className="gp-search">
                    <Search className="w-4 h-4" aria-hidden="true" />
                    <input type="text" placeholder="Search friends" aria-label="Search friends" value={friendSearchQuery} onChange={(e) => setFriendSearchQuery(e.target.value)} />
                  </label>

                  <div className="gp-people">
                    {filteredFriends.length === 0 ? (
                      <p className="gp-none">{friendSearchQuery.trim() ? 'Nobody matches that search.' : 'Nobody to invite yet.'}</p>
                    ) : (
                      filteredFriends.map((friend) => (
                        <InviteRow key={friend.id} friend={friend} sent={invitedFriendIds.has(friend.id)} onSend={() => handleSendBoardInvite(friend)} />
                      ))
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setBoardPlayerCount(boardInviteCount);
                      startBotGameNow();
                    }}
                    className="gp-play"
                  >
                    <Play className="w-4 h-4 shrink-0 fill-current" />
                    <span className="block min-w-0 truncate">Start game</span>
                  </button>
                  {invitedFriendIds.size < seatsNeeded && <p className="gp-hint">Bots fill the seats that are still empty.</p>}
                  <button type="button" onClick={() => setBoardInviteStep('count')} className="gp-quiet">Back</button>
                </>
              )}
            </div>
          )}

          {/* 3. PLAY WITH FRIEND (Search list + Send Request + Copy Link) */}
          {currentMode === 'play_friend' && !isBoardGame && (
            <div className="gp-step" data-testid="game-step-friends">
              <div>
                <span className="gp-sec">Play a friend</span>
                <h3 className="gp-h mt-1.5">Challenge someone</h3>
                <p className="gp-sub">Send a challenge in chat, or share your room link.</p>
              </div>

              <div className="gp-code">
                <span className="block min-w-0 flex-1">
                  <span className="gp-code-l">Room code</span>
                  <span className="gp-code-v block min-w-0 truncate">{generatedRoomCode}</span>
                </span>
                <button type="button" onClick={handleCopyLink} className="gp-mini" data-done={copiedLink ? '1' : '0'}>
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : null}
                  <span>{copiedLink ? 'Copied' : 'Copy link'}</span>
                </button>
              </div>

              <label className="gp-search">
                <Search className="w-4 h-4" aria-hidden="true" />
                <input type="text" placeholder="Search friends" aria-label="Search friends" value={friendSearchQuery} onChange={(e) => setFriendSearchQuery(e.target.value)} />
              </label>

              <div className="gp-people">
                {filteredFriends.length === 0 ? (
                  <p className="gp-none">{friendSearchQuery.trim() ? 'Nobody matches that search.' : 'Nobody to invite yet.'}</p>
                ) : (
                  filteredFriends.map((friend) => (
                    <InviteRow key={friend.id} friend={friend} sent={inviteSent && selectedFriend?.id === friend.id} onSend={() => handleSendFriendInvite(friend)} />
                  ))
                )}
              </div>

              {inviteSent && (
                <div className="gp-note flex items-center gap-3">
                  <span className="block min-w-0 flex-1">Challenge sent to @{selectedFriend?.username} in chat.</span>
                  <button type="button" onClick={handleStartBotGame} className="gp-mini" data-red="1">Practise meanwhile</button>
                </div>
              )}

              <button type="button" onClick={() => setCurrentMode('select_mode')} className="gp-quiet">Back</button>
            </div>
          )}

          {/* REAL 2-PLAYER MATCH: waiting for the opponent to join, or
              waiting for them to finish their round, once we've finished ours */}
          {currentMode === 'play_match' && (
            <div className="gp-step" data-mid="1" data-testid="game-step-waiting">
              <div className="gp-radar" aria-hidden="true">
                <s />
                <div className="gp-radar-core"><Users className="w-9 h-9" /></div>
              </div>

              {onlineMatch?.phase === 'waiting_opponent_result' ? (
                <div>
                  <h3 className="gp-h">You are done</h3>
                  <p className="gp-sub max-w-xs mx-auto">
                    {onlineMatch.opponent
                      ? `Waiting for @${onlineMatch.opponent.username} to finish their round of ${game.title}.`
                      : `Waiting for the other player to finish their round of ${game.title}.`}
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <h3 className="gp-h">{rematchRequested ? 'Rematch request sent' : 'Waiting for the other player'}</h3>
                    <p className="gp-sub max-w-xs mx-auto">
                      {(selectedFriend || lastOpponent)
                        ? `@${(selectedFriend || lastOpponent)!.username} needs to accept your ${rematchRequested ? 'rematch request' : 'challenge'} in chat.`
                        : 'Share your room code, or wait for them to accept the invite.'}
                    </p>
                  </div>
                  <div className="gp-code" style={{ maxWidth: 300, width: '100%' }}>
                    <span className="block min-w-0 flex-1 text-left">
                      <span className="gp-code-l">Room code</span>
                      <span className="gp-code-v block min-w-0 truncate">{onlineMatch?.roomCode}</span>
                    </span>
                  </div>
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  setOnlineMatch(null);
                  setRematchRequested(false);
                  setCurrentMode('select_mode');
                }}
                className="gp-quiet"
              >
                Cancel
              </button>
            </div>
          )}

          {/* PASS AND PLAY HANDOFF (between Round 1 and Round 2) */}
          {currentMode === 'pass_play_handoff' && (
            <div className="gp-step" data-mid="1" data-testid="game-step-handoff">
              <div className="gp-medal" data-r="tie" aria-hidden="true"><RotateCcw className="w-10 h-10" /></div>
              <div>
                <span className="gp-sec">Round 1 is over</span>
                <h3 className="gp-h mt-1.5">Pass the phone to player 2</h3>
                <p className="gp-sub">
                  Player 1 result: <b className="capitalize">{passPlayP1Result}</b>
                </p>
              </div>
              <button type="button" onClick={handleStartPassAndPlayRound2} className="gp-play" style={{ maxWidth: 420 }}>
                <Play className="w-4 h-4 shrink-0 fill-current" />
                <span className="block min-w-0 truncate">Player 2 is ready</span>
              </button>
            </div>
          )}
          {/* 4. ACTIVE GAMEPLAY */}
          {currentMode === 'play_bot' && (
            <React.Suspense fallback={<GameLoading />}>
            <div className="space-y-3">
              {isPassAndPlay && (
                <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold text-center">
                  Pass and Play — {passPlayStage === 'p1' ? "Player 1's Turn" : "Player 2's Turn"}
                </div>
              )}
              {liveOn && opponentLive !== null && (
                <div className="px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-200 text-xs font-bold flex items-center justify-between" data-testid="live-opponent">
                  <span>@{onlineMatch?.opponent?.username || 'Opponent'} is playing live</span>
                  <span className="text-white text-sm font-black">{opponentLive}</span>
                </div>
              )}
              {/* Game Specific Engines */}
              {(game.id === 'cyber_snake' || game.id === 'snake' || game.id === 'pac_grid') && (
                <CyberSnakeGame onGameOver={handleGameOver} targetScore={8} resumeUserId={currentUser.id} onProgress={reportLive} />
              )}

              {game.id === 'helix_fall' && (
                <HelixFallGame
                  userName={currentUser.username}
                  pointsPerLevel={game.pointsReward}
                  onLevel={payHelixLevel}
                  onRun={saveHelixRun}
                  loadBoard={helixLeaderboard}
                />
              )}

              {game.id === 'tictactoe' && onlineMatch && (
                <div className="flex flex-col items-center justify-center p-3 w-full max-w-sm mx-auto">
                  <div className="flex items-center justify-between w-full mb-4 px-3 py-2 bg-zinc-900 rounded-xl border border-zinc-800">
                    <div className={`flex items-center gap-1.5 text-xs font-bold ${gameState.turn === currentUser.id ? 'text-noob' : 'text-zinc-500'}`}>
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>You ({onlineMatch.mySymbol})</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">VS</span>
                    <div className={`flex items-center gap-1.5 text-xs font-bold ${gameState.turn !== currentUser.id ? 'text-pink-400' : 'text-zinc-500'}`}>
                      <Users className="w-3.5 h-3.5" />
                      <span>@{onlineMatch.opponent?.username || 'Opponent'} ({onlineMatch.mySymbol === 'X' ? 'O' : 'X'})</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5 p-3 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-xl w-64 h-64 sm:w-72 sm:h-72">
                    {(gameState.board || Array(9).fill(null)).map((cell: string | null, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => handleOnlineTicTacToeMove(idx)}
                        disabled={!!cell || gameState.turn !== currentUser.id || isSubmitting}
                        className={`rounded-xl flex items-center justify-center font-black text-3xl transition-all cursor-pointer ${
                          cell === 'X'
                            ? 'bg-zinc-900 text-noob border border-noob/30'
                            : cell === 'O'
                            ? 'bg-zinc-900 text-pink-400 border border-pink-500/30'
                            : 'bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800/60 text-zinc-600'
                        }`}
                      >
                        {cell}
                      </button>
                    ))}
                  </div>

                  <p className="mt-4 text-xs text-zinc-400">
                    {gameState.turn === currentUser.id
                      ? '👉 Your turn'
                      : `⏳ Waiting for @${onlineMatch.opponent?.username || 'opponent'}...`}
                  </p>
                </div>
              )}

              {game.id === 'tictactoe' && !onlineMatch && (
                <TicTacToeGame onGameOver={handleGameOver} opponentName={opponentChallenger || 'AI Bot'} vsBot={!isPassAndPlay} gamesPlayedCount={currentUser.gamesPlayedCount} difficulty={botDifficulty} resumeUserId={currentUser.id} />
              )}

              {game.id === 'chess_blitz' && onlineMatch && (
                <ChessOnlineMatch
                  myUserId={currentUser.id}
                  myColor={onlineMatch.myColor || 'w'}
                  opponentUsername={onlineMatch.opponent?.username}
                  board={gameState.board}
                  turn={gameState.turn}
                  isSubmitting={isSubmitting}
                  onMove={handleChessOnlineMove}
                  onResign={handleChessResign}
                />
              )}

              {game.id === 'chess_blitz' && !onlineMatch && (
                <ChessGame
                  onGameOver={handleGameOver}
                  vsBot={!isPassAndPlay}
                  gamesPlayedCount={currentUser.gamesPlayedCount}
                  difficulty={botDifficulty}
                  userId={currentUser.id}
                  username={currentUser.username}
                  profilePicture={currentUser.avatar}
                  resumeUserId={currentUser.id}
                />
              )}

              {game.id === 'snakes_ladders' && (
                <SnakesAndLaddersGame
                  resumeUserId={currentUser.id}
                  onGameOver={handleGameOver}
                  entryMode={isPassAndPlay ? 'pass_play' : 'bot'}
                  initialPlayerCount={boardPlayerCount}
                />
              )}

              {game.id === 'ludo_classic' && (
                <LudoGame
                  currentUser={{ id: currentUser.id, username: currentUser.username, avatar: currentUser.avatar }}
                  onGameOver={handleGameOver}
                  entryMode={isPassAndPlay ? 'pass_play' : 'bot'}
                  initialPlayerCount={boardPlayerCount}
                  difficulty={botDifficulty}
                />
              )}

              {game.id === 'monopoly_noob' && (
                <MonopolyGame
                  resumeUserId={currentUser.id}
                  onGameOver={handleGameOver}
                  entryMode={isPassAndPlay ? 'pass_play' : 'bot'}
                  initialPlayerCount={boardPlayerCount}
                  difficulty={botDifficulty}
                />
              )}

              {game.id === 'rps' && (
                <RockPaperScissorsGame onGameOver={handleGameOver} opponentName={opponentChallenger || 'AI Bot'} bestOf={3} vsBot={!isPassAndPlay} difficulty={botDifficulty} resumeUserId={currentUser.id} onProgress={reportLive} />
              )}

              {game.id === 'speed_math' && (
                <SpeedMathGame onGameOver={handleGameOver} targetScore={6} resumeUserId={currentUser.id} onProgress={reportLive} />
              )}

              {game.id === 'memory_match' && (
                <MemoryMatchGame onGameOver={handleGameOver} resumeUserId={currentUser.id} onProgress={reportLive} />
              )}

              {game.id === 'reaction_tap' && (
                <ReactionTapGame onGameOver={handleGameOver} />
              )}

              {game.id === 'bubble_blitz' && (
                <ColorRushGame onGameOver={handleGameOver} targetScore={8} resumeUserId={currentUser.id} onProgress={reportLive} />
              )}

              {/* Every catalog id above maps to a dedicated game; this generic
                  engine is kept only as a safety net for an unrecognized id
                  and should never actually be reached in normal use. */}
              {![
                'cyber_snake',
                'tictactoe',
                'chess_blitz',
                'snakes_ladders',
                'ludo_classic',
                'monopoly_noob',
                'rps',
                'speed_math',
                'memory_match',
                'reaction_tap',
                'bubble_blitz',
                'helix_fall'
              ].includes(game.id) && !game.embedUrl && (
                <GenericArcadeGame game={game} onGameOver={handleGameOver} targetScore={12} />
              )}
            </div>
            </React.Suspense>
          )}

          {/* 5. GAME OVER / RESULT & POINTS SCREEN */}
          {currentMode === 'game_over' && (
            <div className="gp-step" data-mid="1" data-testid="game-step-result" data-result={gameResult || 'loss'}>
              <div className="gp-medal" data-r={gameResult === 'win' ? 'win' : gameResult === 'tie' ? 'tie' : 'loss'} aria-hidden="true">
                {gameResult === 'win' ? <Trophy className="w-11 h-11" /> : gameResult === 'tie' ? <Users className="w-11 h-11" /> : <Flame className="w-11 h-11" />}
              </div>

              <div>
                <span className="gp-sec">{gameResult === 'win' ? 'Victory' : gameResult === 'tie' ? 'Draw' : 'Defeat'}</span>
                <h3 className="gp-h mt-1.5">
                  {gameResult === 'win'
                    ? onlineMatch?.opponent
                      ? `You beat @${onlineMatch.opponent.username}`
                      : isPassAndPlay
                      ? 'Player 1 wins'
                      : 'You won'
                    : gameResult === 'tie'
                    ? onlineMatch?.opponent
                      ? `You and @${onlineMatch.opponent.username} tied`
                      : "It's a tie"
                    : onlineMatch?.opponent
                    ? `@${onlineMatch.opponent.username} won this one`
                    : isPassAndPlay
                    ? 'Player 2 wins'
                    : game.id === 'chess_blitz'
                    ? 'Checkmate. Your balance is wiped.'
                    : 'Better luck next time'}
                </h3>
              </div>

              <div className="gp-pts" data-r={gameResult === 'win' ? 'win' : gameResult === 'tie' ? 'tie' : 'loss'}>
                {gameResult !== 'loss' && <Sparkles className="w-4 h-4 shrink-0" />}
                <span>
                  {gameResult === 'loss'
                    ? pointsEarned < 0 ? `${pointsEarned.toLocaleString()} NOOB points` : '+0 NOOB points'
                    : `+${pointsEarned.toLocaleString()} NOOB points`}
                </span>
              </div>

              <p className="gp-hint max-w-xs">Your new balance is saved to your account and shown on the leaderboard.</p>

              <div className="gp-row2">
                <button type="button" onClick={handlePlayAgain} className="gp-play">
                  <RotateCcw className="w-4 h-4 shrink-0" />
                  <span className="block min-w-0 truncate">{lastPlayMode === 'matchmaking' ? 'New match' : lastPlayMode === 'friend' && !isBoardGame ? 'Rematch' : 'Play again'}</span>
                </button>
                <button type="button" onClick={handleModalClose} className="gp-ghost">
                  <span className="block min-w-0 truncate">Close</span>
                </button>
              </div>
            </div>
          )}
            </>
          )}
        </div>
      </div>

      {/* Chess High-Stakes Confirmation */}
      {showChessStakesConfirm && (
        <div className="gz fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="gz-pop w-full max-w-sm p-5 space-y-4 text-center" role="alertdialog" aria-label="High-stakes chess match">
            <div className="gp-medal mx-auto" data-r="win" data-s="1" aria-hidden="true"><Trophy className="w-7 h-7" /></div>
            <div>
              <h3 className="gp-h" style={{ fontSize: 19 }}>High-stakes chess</h3>
              <p className="gp-sub">You are about to play a strong chess bot. High risk, high reward.</p>
            </div>
            <div className="gp-stake" data-r="win">
              <span className="gp-code-l">If you win</span>
              <b>+50,000,000 NOOB points</b>
            </div>
            <div className="gp-stake" data-r="loss">
              <span className="gp-code-l">If you lose</span>
              <b>Your whole balance resets to 0</b>
            </div>
            <div className="gp-row2">
              <button type="button" onClick={() => setShowChessStakesConfirm(false)} className="gp-ghost">Cancel</button>
              <button
                type="button"
                onClick={() => {
                  setShowChessStakesConfirm(false);
                  startBotGameNow();
                }}
                className="gp-play"
              >
                <span className="block min-w-0 truncate">I'm ready</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
