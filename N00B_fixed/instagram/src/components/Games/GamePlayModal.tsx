import React, { useState, useEffect, useRef } from 'react';
import {
  X,
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
import { User } from '../../types';
import {
  recordGameMatch,
  sendGameInvite,
  submitSurvivalScore,
  joinGameRoom,
  getGameRoom,
  submitGameRoomResult,
  submitGameRoomMove,
  startChessRound,
  joinMatchmaking,
  getMatchmakingStatus,
  cancelMatchmaking,
  GameRoom
} from '../../services/api';
import confetti from 'canvas-confetti';

// Modular Dedicated Mini-Game Engines
import { CyberSnakeGame } from './minigames/CyberSnakeGame';
import { TicTacToeGame } from './minigames/TicTacToeGame';
import { RockPaperScissorsGame } from './minigames/RockPaperScissorsGame';
import { SpeedMathGame } from './minigames/SpeedMathGame';
import { MemoryMatchGame } from './minigames/MemoryMatchGame';
import { ReactionTapGame } from './minigames/ReactionTapGame';
import { BrickBreakerGame } from './minigames/BrickBreakerGame';
import { CyberDroneGame } from './minigames/CyberDroneGame';
import { ColorRushGame } from './minigames/ColorRushGame';
import { WordleGuessGame } from './minigames/WordleGuessGame';
import { GenericArcadeGame } from './minigames/GenericArcadeGame';
import { ScribbleGame } from './minigames/ScribbleGame';
import { ChessGame } from './minigames/ChessGame';
import { SnakesAndLaddersGame } from './minigames/SnakesAndLaddersGame';
import { LudoGame } from './minigames/LudoGame';
import { MonopolyGame } from './minigames/MonopolyGame';
import { SubwayRunnerGame } from './minigames/SubwayRunnerGame';

interface GamePlayModalProps {
  game: MiniGameMeta;
  currentUser: User;
  allUsers: User[];
  initialChallenger?: string;
  initialRoomCode?: string;
  onClose: () => void;
  onPointsUpdated: (pointsEarned: number, totalPoints: number, won?: boolean) => void;
}

type PlayMode = 'select_mode' | 'matchmaking' | 'play_bot' | 'play_friend' | 'play_match' | 'pass_play_handoff' | 'game_over';
type RoundResult = 'win' | 'tie' | 'loss';

// Shared-board games manage their own multi-player turn loop internally and
// report ONE direct result for the logged-in user (index 0) — unlike the
// relay-style "each human plays the same solo challenge" scoring the other
// 50 games use for Pass and Play, so they must never be routed through
// finishPassPlayRound regardless of which mode launched them.
const BOARD_GAME_IDS = ['ludo_classic', 'snakes_ladders', 'monopoly_noob'];

// Games with a true live-synced shared board: the two matched players
// actually move on the SAME board in real time against each other, instead
// of each playing their own round against a bot and comparing results.
const SYNCED_GAME_IDS = ['tictactoe'];

// Solo-only games with no opponent concept at all — no bot, no friend
// challenge, no pass-and-play. These skip the mode-select screen entirely
// and drop straight into gameplay.
const SOLO_ONLY_GAME_IDS = ['subway_run'];

export const GamePlayModal: React.FC<GamePlayModalProps> = ({
  game,
  currentUser,
  allUsers,
  initialChallenger,
  initialRoomCode,
  onClose,
  onPointsUpdated
}) => {
  // Chess Blitz is capped at one round a week for free accounts (its real
  // stakes make it something worth grinding otherwise). The check/consume
  // call fires once on mount for every entry path — bot, pass & play,
  // friend invite link, matchmaking — since they can all land here without
  // going through the mode-select screen (e.g. accepting a friend's invite
  // sets initialRoomCode and skips straight past it).
  const isChessBlitz = game.id === 'chess_blitz';
  const [chessLimitChecked, setChessLimitChecked] = useState(!isChessBlitz || !!currentUser.proTier);
  const [chessLimitBlocked, setChessLimitBlocked] = useState<{ message: string; nextAvailableAt?: string } | null>(null);
  // Consuming the weekly credit is a real server-side side effect (not an
  // idempotent read), so a ref guards it against ever being sent twice —
  // React 18 StrictMode intentionally mounts, cleans up, then re-mounts
  // effects once in dev specifically to catch exactly this class of bug.
  // Deliberately no cancel-on-cleanup here: the ref already guarantees this
  // fires at most once per component instance, and since StrictMode's dev
  // "cleanup" isn't a real unmount, guarding on it would just discard the
  // one real in-flight response and leave the check stuck forever.
  const chessCheckStartedRef = useRef(false);

  useEffect(() => {
    if (!isChessBlitz || currentUser.proTier) return;
    if (chessCheckStartedRef.current) return;
    chessCheckStartedRef.current = true;
    (async () => {
      try {
        const res = await startChessRound();
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
    opponent?: { username: string; displayName: string; avatar: string };
    // Only set for SYNCED_GAME_IDS — which symbol this player is on the
    // shared board (room.players[0] is always 'X').
    mySymbol?: 'X' | 'O';
  } | null>(
    initialRoomCode && !BOARD_GAME_IDS.includes(game.id) ? { roomCode: initialRoomCode, phase: 'joining' } : null
  );
  const matchmakingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const matchmakingCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<User | null>(() => {
    if (initialChallenger) {
      return allUsers.find((u) => u.username === initialChallenger) || null;
    }
    return null;
  });
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [inviteSent, setInviteSent] = useState(false);
  const [generatedRoomCode] = useState(
    initialRoomCode || `NOOB-${game.id.toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`
  );
  const [copiedLink, setCopiedLink] = useState(false);

  const isBoardGame = BOARD_GAME_IDS.includes(game.id);
  const boardGameMaxPlayers = game.id === 'snakes_ladders' ? 8 : 4;
  // Board games ask "how many total players" before inviting, then require
  // sending that many minus one (yourself) requests via chat — tracked here
  // so the chosen total carries into the actual board once it starts.
  const [boardPlayerCount, setBoardPlayerCount] = useState<number | undefined>(undefined);
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
  const [isPassAndPlay, setIsPassAndPlay] = useState(false);
  const [passPlayStage, setPassPlayStage] = useState<'p1' | 'p2'>('p1');
  const [passPlayP1Result, setPassPlayP1Result] = useState<RoundResult | null>(null);

  const clearMatchmakingTimers = () => {
    if (matchmakingPollRef.current) clearInterval(matchmakingPollRef.current);
    if (matchmakingCountdownRef.current) clearInterval(matchmakingCountdownRef.current);
    matchmakingPollRef.current = null;
    matchmakingCountdownRef.current = null;
  };
  useEffect(() => clearMatchmakingTimers, []);

  // A match was found (either instantly on join, or picked up mid-poll) —
  // stop searching and drop straight into the actual game.
  const enterOnlineMatch = (room: GameRoom) => {
    clearMatchmakingTimers();
    const opponent = room.players.find((p) => p.userId !== currentUser.id);

    if (SYNCED_GAME_IDS.includes(game.id)) {
      // Real head-to-head: both players move on the SAME server-held board,
      // so drop straight into it instead of starting a solo round vs a bot.
      const myIndex = room.players.findIndex((p) => p.userId === currentUser.id);
      setOnlineMatch(null);
      setIsPassAndPlay(false);
      setGameResult(null);
      setPointsEarned(0);
      setGameState({
        board: room.board || Array(9).fill(null),
        turn: room.turn || room.players[0]?.userId
      });
      setCurrentMode('play_bot');
      setOnlineMatch({
        roomCode: room.code,
        phase: 'in_progress',
        opponent: opponent ? { username: opponent.username, displayName: opponent.displayName, avatar: opponent.avatar } : undefined,
        mySymbol: myIndex === 0 ? 'X' : 'O'
      });
      return;
    }

    startBotGameNow();
    setOnlineMatch({
      roomCode: room.code,
      phase: 'in_progress',
      opponent: opponent ? { username: opponent.username, displayName: opponent.displayName, avatar: opponent.avatar } : undefined
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

    try {
      const res = await joinMatchmaking(game.id, game.title);
      if (res.matched && res.room) {
        enterOnlineMatch(res.room);
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

    matchmakingPollRef.current = setInterval(async () => {
      try {
        const statusRes = await getMatchmakingStatus();
        if (statusRes.matched && statusRes.room) {
          enterOnlineMatch(statusRes.room);
        }
      } catch (err) {
        console.error(err);
      }
    }, 2000);
  };

  const handleCancelMatchmaking = () => {
    clearMatchmakingTimers();
    cancelMatchmaking().catch(() => {});
    setCurrentMode('select_mode');
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
        if (cancelled) return;
        if (res.success && res.room) {
          if (res.room.status === 'ready') {
            enterOnlineMatch(res.room);
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
    const interval = setInterval(async () => {
      try {
        const res = await getGameRoom(onlineMatch.roomCode);
        if (res.success && res.room && res.room.status !== 'waiting') {
          clearInterval(interval);
          enterOnlineMatch(res.room);
        }
      } catch (err) {
        console.error(err);
      }
    }, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineMatch?.phase, onlineMatch?.roomCode]);

  // Once we've submitted our own result, poll until the opponent has
  // submitted theirs too so the head-to-head outcome can be shown.
  useEffect(() => {
    if (!onlineMatch || onlineMatch.phase !== 'waiting_opponent_result') return;
    const interval = setInterval(async () => {
      try {
        const res = await getGameRoom(onlineMatch.roomCode);
        if (res.success && res.room && res.room.status === 'finished') {
          clearInterval(interval);
          finalizeOnlineMatch(res.room);
        }
      } catch (err) {
        console.error(err);
      }
    }, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineMatch?.phase, onlineMatch?.roomCode]);

  // Live-synced board (currently Tic Tac Toe): while it's in progress, poll
  // for the opponent's moves and for the match ending, since only the
  // player who makes the winning move learns the outcome directly.
  useEffect(() => {
    if (!onlineMatch || onlineMatch.phase !== 'in_progress' || !SYNCED_GAME_IDS.includes(game.id)) return;
    const interval = setInterval(async () => {
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
    }, 1200);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineMatch?.phase, onlineMatch?.roomCode, game.id]);

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
  const handleStartBotGame = () => {
    if (game.id === 'chess_blitz') {
      setShowChessStakesConfirm(true);
      return;
    }
    startBotGameNow();
  };

  // Begin a brand new Pass and Play match (from the mode-select screen)
  const handleStartPassAndPlay = () => {
    setPassPlayStage('p1');
    setPassPlayP1Result(null);
    handleStartBotGame();
    setIsPassAndPlay(true);
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
      earned = 100;
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    } else if (overall === 'tie') {
      earned = 50;
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
    else if (isPassAndPlay && !BOARD_GAME_IDS.includes(game.id)) finishPassPlayRound(result);
    else finishGame(result);
  };

  // Handle Game Finish & Point Awarding
  const finishGame = async (result: 'win' | 'tie' | 'loss', opponentName = 'Bot Pro') => {
    setIsSubmitting(true);
    setGameResult(result);

    let earned = 0;
    if (game.id === 'chess_blitz') {
      // High stakes, vs-bot only: winning pays out massively, losing wipes
      // the account's entire current balance instead of just costing 0.
      if (result === 'win') {
        earned = 50000000;
        confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 } });
      } else if (result === 'loss') {
        earned = -(currentUser.noobPoints || 0);
      } else {
        earned = 50;
      }
    } else if (result === 'win') {
      earned = 100;
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    } else if (result === 'tie') {
      earned = 50;
    } else {
      earned = 0;
    }

    setPointsEarned(earned);

    try {
      const res = await recordGameMatch(game.id, game.title, result, opponentName, true);
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

  // Survival games (no win/tie/loss, no opponent) pay out 10 NOOB Points
  // per second survived via a dedicated endpoint instead of finishGame's
  // fixed win/tie/loss amounts.
  const finishSurvivalGame = async (seconds: number) => {
    setIsSubmitting(true);
    setGameResult('win');
    setSurvivalSeconds(seconds);
    const estimatedEarned = seconds * 10;
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
    setSelectedFriend(friend);
    try {
      await sendGameInvite(friend.id, game.id, game.title, generatedRoomCode);
      setInviteSent(true);
      // Join our own room as player 1 and start waiting for them to accept
      // it from the chat invite — this is the actual connection that was
      // previously missing entirely (the invite used to just be a chat
      // message with no real link between the two sides).
      const res = await joinGameRoom(generatedRoomCode, game.id, game.title);
      if (res.success && res.room) {
        setOnlineMatch({ roomCode: generatedRoomCode, phase: 'waiting_opponent_join' });
        setCurrentMode('play_match');
      }
    } catch (err) {
      console.error(err);
      setInviteSent(true);
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

  // Copy Match Link
  const handleCopyLink = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    const shareUrl = `${origin}${pathname}?playGame=${game.id}&challenger=${currentUser.username}&room=${generatedRoomCode}`;
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

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col relative animate-in fade-in zoom-in duration-200">
        {/* Top Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#00FF66]/20 border border-[#00FF66]/40 flex items-center justify-center text-sm font-bold text-[#00FF66]">
              🎮
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">{game.title}</h2>
              <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                {game.id === 'subway_run' ? (
                  <span className="text-amber-400 font-semibold">10 NOOBs per second survived</span>
                ) : (
                  <>
                    <span className="text-amber-400 font-semibold">{game.pointsReward.toLocaleString()} NOOBs on Win</span>
                    <span>•</span>
                    <span className="text-zinc-400">
                      {game.id === 'chess_blitz' ? 'Balance wiped on Loss' : '50 NOOBs on Tie'}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex-1 overflow-y-auto max-h-[75vh]">
          {!chessLimitChecked ? (
            <div className="py-16 flex flex-col items-center justify-center text-center gap-3">
              <div className="w-8 h-8 border-2 border-zinc-700 border-t-[#00FF66] rounded-full animate-spin" />
              <p className="text-xs text-zinc-500">Checking availability...</p>
            </div>
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
                Upgrade to NOOB Pro from your profile for unlimited Chess Blitz, any time.
              </p>
              <button
                onClick={onClose}
                className="px-6 py-2.5 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          ) : (
            <>
          {/* 1. SELECT MODE VIEW */}
          {currentMode === 'select_mode' && (
            <div className="space-y-4">
              {/* Game Artwork Preview: auto-advancing, swipeable poster carousel */}
              <GamePosterCarousel game={game} />

              <div className="text-center px-2">
                <p className="text-xs text-zinc-300">{game.description}</p>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-700">
                    {game.category.toUpperCase()}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-700">
                    {game.difficulty}
                  </span>
                </div>
              </div>

              <div className="pt-2 space-y-2.5">
                <span className="text-[11px] font-bold text-zinc-400 tracking-wider uppercase block px-1">
                  Choose How To Play:
                </span>

                {/* Option 1: Play with Available Users */}
                <button
                  onClick={startMatchmaking}
                  className="w-full p-3.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800/90 border border-zinc-800 hover:border-[#00FF66]/50 flex items-center justify-between transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-[#00FF66] group-hover:scale-105 transition-transform">
                      <Users className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <span className="text-sm font-bold text-white block group-hover:text-[#00FF66] transition-colors">
                        1. Play with Available Users
                      </span>
                      <span className="text-[11px] text-zinc-400 block">
                        Quick match with active online players (30s queue)
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-[#00FF66] group-hover:translate-x-0.5 transition-all" />
                </button>

                {/* Option 2: Play with Bot */}
                <button
                  onClick={handleStartBotGame}
                  className="w-full p-3.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800/90 border border-zinc-800 hover:border-purple-500/50 flex items-center justify-between transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 group-hover:scale-105 transition-transform">
                      <Bot className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <span className="text-sm font-bold text-white block group-hover:text-purple-300 transition-colors">
                        2. Play with Bot
                      </span>
                      <span className="text-[11px] text-zinc-400 block">
                        Instant single-player match against smart AI
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-purple-400 group-hover:translate-x-0.5 transition-all" />
                </button>

                {/* Option 3: Play with Friend */}
                <button
                  onClick={openPlayFriend}
                  className="w-full p-3.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800/90 border border-zinc-800 hover:border-cyan-500/50 flex items-center justify-between transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
                      <UserPlus className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <span className="text-sm font-bold text-white block group-hover:text-cyan-300 transition-colors">
                        3. Play with Friend
                      </span>
                      <span className="text-[11px] text-zinc-400 block">
                        Send game invite directly to chat or share match link
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
                </button>

                {/* Option 4: Pass and Play */}
                <button
                  onClick={handleStartPassAndPlay}
                  className="w-full p-3.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800/90 border border-zinc-800 hover:border-amber-500/50 flex items-center justify-between transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                      <Users className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <span className="text-sm font-bold text-white block group-hover:text-amber-300 transition-colors">
                        4. Pass and Play
                      </span>
                      <span className="text-[11px] text-zinc-400 block">
                        Two players take turns on this one device
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
                </button>
              </div>
            </div>
          )}

          {/* 2. MATCHMAKING QUEUE (30s Search with Radar Animation) */}
          {currentMode === 'matchmaking' && (
            <div className="py-6 flex flex-col items-center text-center space-y-5">
              {!matchmakingFailed ? (
                <>
                  {/* Radar Wave Animation */}
                  <div className="relative w-36 h-36 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border border-[#00FF66]/20 animate-ping" />
                    <div className="absolute inset-3 rounded-full border border-[#00FF66]/40 animate-pulse" />
                    <div className="w-20 h-20 rounded-full bg-[#00FF66]/10 border-2 border-[#00FF66] shadow-[0_0_25px_rgba(0,255,102,0.3)] flex flex-col items-center justify-center z-10">
                      <Radio className="w-6 h-6 text-[#00FF66] animate-spin-slow" />
                      <span className="text-xs font-mono font-bold text-[#00FF66] mt-0.5">{matchmakingTimeLeft}s</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-white">Searching for Available Players...</h3>
                    <p className="text-xs text-zinc-400 mt-1 max-w-xs">
                      Scanning active users on NOOB server playing <span className="text-[#00FF66] font-semibold">{game.title}</span>
                    </p>
                  </div>

                  <div className="w-full max-w-xs bg-zinc-900 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-[#00FF66] h-full transition-all duration-1000 ease-linear"
                      style={{ width: `${((30 - matchmakingTimeLeft) / 30) * 100}%` }}
                    />
                  </div>

                  <button
                    onClick={handleCancelMatchmaking}
                    className="text-xs text-zinc-400 hover:text-white underline cursor-pointer"
                  >
                    Cancel Search
                  </button>
                </>
              ) : (
                /* Matchmaking Timeout: Show 2 requested options */
                <div className="space-y-4 w-full">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center mx-auto text-xl font-bold">
                    ⏱️
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-white">No Live Players Found Right Now</h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      No other user joined within 30 seconds. Choose an option to proceed:
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {/* Option A: Search Again */}
                    <button
                      onClick={startMatchmaking}
                      className="p-3.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-[#00FF66]/50 flex items-center justify-center gap-2 text-xs font-bold text-white hover:text-[#00FF66] transition-all cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Search Again</span>
                    </button>

                    {/* Option B: Play with Bot */}
                    <button
                      onClick={handleStartBotGame}
                      className="p-3.5 rounded-2xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 flex items-center justify-center gap-2 text-xs font-bold text-purple-300 transition-all cursor-pointer"
                    >
                      <Bot className="w-4 h-4" />
                      <span>Play with Bot</span>
                    </button>
                  </div>

                  {/* Option C: Invite Friend */}
                  <button
                    onClick={openPlayFriend}
                    className="w-full p-3 rounded-2xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center gap-2 text-xs font-bold text-cyan-300 transition-all cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Or Invite a Friend</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 3a. PLAY WITH FRIEND — board games: ask total player count first,
              then send one invite per open seat (not just one friend) */}
          {currentMode === 'play_friend' && isBoardGame && (
            <div className="space-y-4">
              {boardInviteStep === 'count' ? (
                <>
                  <div>
                    <h3 className="text-sm font-bold text-white">Play {game.title} with Friends</h3>
                    <p className="text-xs text-zinc-400 mt-0.5">How many total players, including you?</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-center py-2">
                    {Array.from({ length: boardGameMaxPlayers - 1 }, (_, i) => i + 2).map((n) => (
                      <button
                        key={n}
                        onClick={() => setBoardInviteCount(n)}
                        className={`w-10 h-10 rounded-xl font-bold text-sm cursor-pointer transition-all ${
                          boardInviteCount === n ? 'bg-[#00FF66] text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      setInvitedFriendIds(new Set());
                      setBoardInviteStep('invite');
                    }}
                    className="w-full py-2.5 rounded-xl bg-[#00FF66] text-black text-xs font-bold cursor-pointer hover:bg-[#00FF66]/90"
                  >
                    Next — Invite {seatsNeeded} Friend{seatsNeeded === 1 ? '' : 's'}
                  </button>
                  <button
                    onClick={() => setCurrentMode('select_mode')}
                    className="w-full py-2.5 rounded-xl bg-zinc-900 text-xs font-semibold text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  >
                    Back to Modes
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Invite {seatsNeeded} Friend{seatsNeeded === 1 ? '' : 's'} to {game.title}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Sends a request to each friend in Direct Chat. Any seat you don't fill starts with a bot.
                    </p>
                  </div>

                  <div className="p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
                    <span className="text-[11px] text-zinc-400 font-semibold">Requests Sent</span>
                    <span className="text-xs font-bold text-[#00FF66]">
                      {invitedFriendIds.size} / {seatsNeeded}
                    </span>
                  </div>

                  <div className="relative">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search registered friends..."
                      value={friendSearchQuery}
                      onChange={(e) => setFriendSearchQuery(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-[#00FF66]"
                    />
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {filteredFriends.length === 0 ? (
                      <p className="text-xs text-zinc-500 text-center py-4">No users found matching query.</p>
                    ) : (
                      filteredFriends.map((friend) => {
                        const alreadyInvited = invitedFriendIds.has(friend.id);
                        return (
                          <div
                            key={friend.id}
                            className="p-2.5 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2.5">
                              <img
                                src={friend.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                                alt={friend.username}
                                className="w-8 h-8 rounded-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                              <div>
                                <span className="text-xs font-bold text-white block">{friend.displayName}</span>
                                <span className="text-[10px] text-zinc-400 block">@{friend.username}</span>
                              </div>
                            </div>

                            <button
                              onClick={() => handleSendBoardInvite(friend)}
                              disabled={alreadyInvited}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                alreadyInvited
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-[#00FF66] hover:bg-[#00FF66]/90 text-black shadow-sm'
                              }`}
                            >
                              {alreadyInvited ? (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Sent!</span>
                                </>
                              ) : (
                                <>
                                  <Send className="w-3.5 h-3.5" />
                                  <span>Send Request</span>
                                </>
                              )}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <button
                    onClick={() => {
                      setBoardPlayerCount(boardInviteCount);
                      startBotGameNow();
                    }}
                    className="w-full py-2.5 rounded-2xl bg-[#00FF66] text-black font-bold text-xs cursor-pointer hover:bg-[#00FF66]/90"
                  >
                    Start Game{invitedFriendIds.size < seatsNeeded ? ' (Bots Fill Remaining Seats)' : ''}
                  </button>
                  <button
                    onClick={() => setBoardInviteStep('count')}
                    className="w-full py-2 rounded-xl bg-zinc-900 text-xs font-semibold text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  >
                    Back
                  </button>
                </>
              )}
            </div>
          )}

          {/* 3. PLAY WITH FRIEND (Search list + Send Request + Copy Link) */}
          {currentMode === 'play_friend' && !isBoardGame && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white">Play {game.title} with a Friend</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Select a user from the list to send a direct challenge in chat, or copy your match link.
                </p>
              </div>

              {/* Match Link Box */}
              <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-2">
                <div className="truncate">
                  <span className="text-[10px] text-zinc-500 block">Game Room Code</span>
                  <span className="text-xs font-mono font-bold text-[#00FF66]">{generatedRoomCode}</span>
                </div>
                <button
                  onClick={handleCopyLink}
                  className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-white transition-colors cursor-pointer shrink-0"
                >
                  {copiedLink ? 'Copied!' : 'Copy Link'}
                </button>
              </div>

              {/* Friend Search Box */}
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search registered friends..."
                  value={friendSearchQuery}
                  onChange={(e) => setFriendSearchQuery(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-[#00FF66]"
                />
              </div>

              {/* Users List */}
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {filteredFriends.length === 0 ? (
                  <p className="text-xs text-zinc-500 text-center py-4">No users found matching query.</p>
                ) : (
                  filteredFriends.map((friend) => (
                    <div
                      key={friend.id}
                      className="p-2.5 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5">
                        <img
                          src={friend.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                          alt={friend.username}
                          className="w-8 h-8 rounded-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <span className="text-xs font-bold text-white block">{friend.displayName}</span>
                          <span className="text-[10px] text-zinc-400 block">@{friend.username}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleSendFriendInvite(friend)}
                        disabled={inviteSent && selectedFriend?.id === friend.id}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          inviteSent && selectedFriend?.id === friend.id
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-[#00FF66] hover:bg-[#00FF66]/90 text-black shadow-sm'
                        }`}
                      >
                        {inviteSent && selectedFriend?.id === friend.id ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Sent!</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            <span>Send Request</span>
                          </>
                        )}
                      </button>
                    </div>
                  ))
                )}
              </div>

              {inviteSent && (
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-between">
                  <span>Challenge sent to @{selectedFriend?.username} in Direct Chat!</span>
                  <button
                    onClick={handleStartBotGame}
                    className="font-bold underline cursor-pointer hover:text-white"
                  >
                    Play Practice Bot While Waiting
                  </button>
                </div>
              )}

              <button
                onClick={() => setCurrentMode('select_mode')}
                className="w-full py-2.5 rounded-xl bg-zinc-900 text-xs font-semibold text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                Back to Modes
              </button>
            </div>
          )}

          {/* REAL 2-PLAYER MATCH: waiting for the opponent to join, or
              waiting for them to finish their round, once we've finished ours */}
          {currentMode === 'play_match' && (
            <div className="py-8 flex flex-col items-center text-center space-y-5">
              <div className="relative w-24 h-24 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border border-cyan-400/20 animate-ping" />
                <div className="w-16 h-16 rounded-full bg-cyan-500/10 border-2 border-cyan-400 flex items-center justify-center">
                  <Users className="w-7 h-7 text-cyan-400" />
                </div>
              </div>

              {onlineMatch?.phase === 'waiting_opponent_result' ? (
                <div>
                  <h3 className="text-base font-bold text-white">You're Done — Waiting on the Other Player</h3>
                  <p className="text-xs text-zinc-400 mt-1 max-w-xs">
                    {onlineMatch.opponent
                      ? `Waiting for @${onlineMatch.opponent.username} to finish their round of ${game.title}...`
                      : `Waiting for your opponent to finish their round of ${game.title}...`}
                  </p>
                </div>
              ) : (
                <div>
                  <h3 className="text-base font-bold text-white">Waiting for Your Opponent to Join</h3>
                  <p className="text-xs text-zinc-400 mt-1 max-w-xs">
                    {selectedFriend
                      ? `@${selectedFriend.username} needs to accept your challenge from Direct Chat.`
                      : 'Share your room code or wait for them to accept the invite.'}
                  </p>
                  <div className="mt-3 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 inline-block">
                    <span className="text-[10px] text-zinc-500 block">Room Code</span>
                    <span className="text-xs font-mono font-bold text-cyan-400">{onlineMatch?.roomCode}</span>
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  setOnlineMatch(null);
                  setCurrentMode('select_mode');
                }}
                className="text-xs text-zinc-400 hover:text-white underline cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}

          {/* PASS AND PLAY HANDOFF (between Round 1 and Round 2) */}
          {currentMode === 'pass_play_handoff' && (
            <div className="py-8 flex flex-col items-center text-center space-y-5">
              <div className="w-20 h-20 rounded-full bg-amber-500/20 border-2 border-amber-400 text-amber-300 flex items-center justify-center text-3xl">
                🔄
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-black text-white">Round 1 Complete!</h3>
                <p className="text-xs text-zinc-400">
                  Player 1 result:{' '}
                  <span className="font-bold text-white capitalize">{passPlayP1Result}</span>
                </p>
              </div>
              <p className="text-sm font-bold text-amber-300">📱 Pass the device to Player 2</p>
              <button
                onClick={handleStartPassAndPlayRound2}
                className="px-6 py-2.5 rounded-2xl bg-[#00FF66] text-black text-sm font-bold hover:scale-105 transition-transform cursor-pointer"
              >
                Player 2 Ready — Start Round 2
              </button>
            </div>
          )}

          {/* 4. ACTIVE GAMEPLAY */}
          {currentMode === 'play_bot' && (
            <div className="space-y-3">
              {isPassAndPlay && (
                <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold text-center">
                  Pass and Play — {passPlayStage === 'p1' ? "Player 1's Turn" : "Player 2's Turn"}
                </div>
              )}
              {/* Game Specific Engines */}
              {(game.id === 'cyber_snake' || game.id === 'snake' || game.id === 'pac_grid') && (
                <CyberSnakeGame onGameOver={handleGameOver} targetScore={8} />
              )}

              {game.id === 'tictactoe' && onlineMatch && (
                <div className="flex flex-col items-center justify-center p-3 w-full max-w-sm mx-auto">
                  <div className="flex items-center justify-between w-full mb-4 px-3 py-2 bg-zinc-900 rounded-xl border border-zinc-800">
                    <div className={`flex items-center gap-1.5 text-xs font-bold ${gameState.turn === currentUser.id ? 'text-[#00FF66]' : 'text-zinc-500'}`}>
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
                            ? 'bg-zinc-900 text-[#00FF66] border border-[#00FF66]/30'
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
                <TicTacToeGame onGameOver={handleGameOver} opponentName={opponentChallenger || 'AI Bot'} vsBot={!isPassAndPlay} />
              )}

              {game.id === 'chess_blitz' && (
                <ChessGame onGameOver={handleGameOver} vsBot={!isPassAndPlay} />
              )}

              {game.id === 'snakes_ladders' && (
                <SnakesAndLaddersGame
                  onGameOver={handleGameOver}
                  entryMode={isPassAndPlay ? 'pass_play' : 'bot'}
                  initialPlayerCount={boardPlayerCount}
                />
              )}

              {game.id === 'ludo_classic' && (
                <LudoGame
                  onGameOver={handleGameOver}
                  entryMode={isPassAndPlay ? 'pass_play' : 'bot'}
                  initialPlayerCount={boardPlayerCount}
                />
              )}

              {game.id === 'monopoly_noob' && (
                <MonopolyGame
                  onGameOver={handleGameOver}
                  entryMode={isPassAndPlay ? 'pass_play' : 'bot'}
                  initialPlayerCount={boardPlayerCount}
                />
              )}

              {game.id === 'rps' && (
                <RockPaperScissorsGame onGameOver={handleGameOver} opponentName={opponentChallenger || 'AI Bot'} bestOf={3} vsBot={!isPassAndPlay} />
              )}

              {game.id === 'speed_math' && (
                <SpeedMathGame onGameOver={handleGameOver} targetScore={6} />
              )}

              {game.id === 'memory_match' && (
                <MemoryMatchGame onGameOver={handleGameOver} />
              )}

              {game.id === 'reaction_tap' && (
                <ReactionTapGame onGameOver={handleGameOver} />
              )}

              {game.id === 'brick_breaker' && (
                <BrickBreakerGame onGameOver={handleGameOver} />
              )}

              {game.id === 'cyber_drone' && (
                <CyberDroneGame onGameOver={handleGameOver} targetScore={5} />
              )}

              {game.id === 'bubble_blitz' && (
                <ColorRushGame onGameOver={handleGameOver} targetScore={8} />
              )}

              {game.id === 'wordle_quest' && (
                <WordleGuessGame onGameOver={handleGameOver} />
              )}

              {game.id === 'scribble' && (
                <ScribbleGame onFinishGame={handleGameOver} opponentName={opponentChallenger || 'AI Bot'} />
              )}

              {game.id === 'subway_run' && (
                <SubwayRunnerGame onSurvivalEnd={finishSurvivalGame} onExit={onClose} />
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
                'brick_breaker',
                'cyber_drone',
                'bubble_blitz',
                'wordle_quest',
                'scribble',
                'subway_run'
              ].includes(game.id) && (
                <GenericArcadeGame game={game} onGameOver={handleGameOver} targetScore={12} />
              )}
            </div>
          )}

          {/* 5. GAME OVER / RESULT & POINTS SCREEN */}
          {currentMode === 'game_over' && (
            <div className="py-6 text-center space-y-5">
              {gameResult === 'win' ? (
                <div className="space-y-3">
                  <div className="w-20 h-20 rounded-full bg-amber-500/20 border-2 border-amber-400 text-amber-300 flex items-center justify-center mx-auto text-3xl shadow-[0_0_25px_rgba(251,191,36,0.3)] animate-bounce">
                    {game.id === 'subway_run' ? '🚆' : '🏆'}
                  </div>
                  <h3 className="text-xl font-black text-white">
                    {game.id === 'subway_run'
                      ? `Run Complete! Survived ${survivalSeconds}s`
                      : onlineMatch?.opponent
                      ? `You Beat @${onlineMatch.opponent.username}!`
                      : isPassAndPlay
                      ? 'Player 1 Wins!'
                      : 'Victory! You Won!'}
                  </h3>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-extrabold text-sm">
                    <Sparkles className="w-4 h-4" />
                    <span>+{pointsEarned.toLocaleString()} NOOB Points Awarded!</span>
                  </div>
                </div>
              ) : gameResult === 'tie' ? (
                <div className="space-y-3">
                  <div className="w-20 h-20 rounded-full bg-blue-500/20 border-2 border-blue-400 text-blue-300 flex items-center justify-center mx-auto text-3xl">
                    🤝
                  </div>
                  <h3 className="text-xl font-black text-white">
                    {onlineMatch?.opponent
                      ? `You and @${onlineMatch.opponent.username} Tied!`
                      : isPassAndPlay
                      ? "It's a Tie!"
                      : "Well Played! It's a Tie!"}
                  </h3>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-blue-500/20 border border-blue-500/40 text-blue-300 font-extrabold text-sm">
                    <Sparkles className="w-4 h-4" />
                    <span>+{pointsEarned.toLocaleString()} NOOB Points Awarded!</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="w-20 h-20 rounded-full bg-rose-500/20 border-2 border-rose-400 text-rose-300 flex items-center justify-center mx-auto text-3xl">
                    💥
                  </div>
                  <h3 className="text-xl font-black text-white">
                    {onlineMatch?.opponent
                      ? `@${onlineMatch.opponent.username} Won This One`
                      : isPassAndPlay
                      ? 'Player 2 Wins!'
                      : game.id === 'chess_blitz'
                      ? 'Checkmated! Your Balance Is Wiped.'
                      : 'Defeat! Better Luck Next Time!'}
                  </h3>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-zinc-800 text-zinc-400 font-bold text-sm">
                    <span>{pointsEarned < 0 ? `${pointsEarned.toLocaleString()} NOOB Points` : '+0 NOOB Points'}</span>
                  </div>
                </div>
              )}

              <p className="text-xs text-zinc-400">
                Your new balance is saved to your account and updated on the Global Leaderboard.
              </p>

              <div className="flex gap-3 justify-center pt-2">
                <button
                  onClick={isPassAndPlay ? handleStartPassAndPlay : handleStartBotGame}
                  className="px-5 py-2.5 rounded-2xl bg-[#00FF66] hover:bg-[#00FF66]/90 text-black font-bold text-xs transition-colors cursor-pointer"
                >
                  Play Again
                </button>
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  Close Game
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
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-950 border border-amber-500/40 rounded-3xl p-5 shadow-2xl space-y-4 text-center">
            <div className="w-14 h-14 rounded-full bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center mx-auto text-2xl">
              ♟️
            </div>
            <h3 className="text-base font-black text-white">High-Stakes Chess Match</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              You're about to play a genuinely strong chess bot. This match is high risk, high reward:
            </p>
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-left flex items-center gap-2.5">
              <span className="text-lg">🏆</span>
              <span className="text-xs font-bold text-emerald-300">If you WIN: +50,000,000 NOOB Points</span>
            </div>
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-left flex items-center gap-2.5">
              <span className="text-lg">💀</span>
              <span className="text-xs font-bold text-rose-300">If you LOSE: Your entire balance resets to 0</span>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowChessStakesConfirm(false)}
                className="flex-1 py-2.5 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowChessStakesConfirm(false);
                  startBotGameNow();
                }}
                className="flex-1 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-colors cursor-pointer"
              >
                I'm Ready, Play
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
