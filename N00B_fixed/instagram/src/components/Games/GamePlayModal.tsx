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
import { recordGameMatch, sendGameInvite } from '../../services/api';
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

interface GamePlayModalProps {
  game: MiniGameMeta;
  currentUser: User;
  allUsers: User[];
  initialChallenger?: string;
  initialRoomCode?: string;
  onClose: () => void;
  onPointsUpdated: (pointsEarned: number, totalPoints: number) => void;
}

type PlayMode = 'select_mode' | 'matchmaking' | 'play_bot' | 'play_friend' | 'play_match' | 'pass_play_handoff' | 'game_over';
type RoundResult = 'win' | 'tie' | 'loss';

export const GamePlayModal: React.FC<GamePlayModalProps> = ({
  game,
  currentUser,
  allUsers,
  initialChallenger,
  initialRoomCode,
  onClose,
  onPointsUpdated
}) => {
  const [currentMode, setCurrentMode] = useState<PlayMode>(
    initialChallenger ? 'play_bot' : 'select_mode'
  );
  const [opponentChallenger] = useState<string | undefined>(initialChallenger);
  const [matchmakingTimeLeft, setMatchmakingTimeLeft] = useState(30);
  const [matchmakingFailed, setMatchmakingFailed] = useState(false);
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

  // Active Game State (Tic Tac Toe / Clicker / Math / Drone / RPS)
  const [gameState, setGameState] = useState<any>({});
  const [gameResult, setGameResult] = useState<'win' | 'tie' | 'loss' | null>(null);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pass and Play: two humans take turns on this device, each attempting the
  // same game's built-in challenge; whichever round did better (win > tie >
  // loss) wins the match.
  const [isPassAndPlay, setIsPassAndPlay] = useState(false);
  const [passPlayStage, setPassPlayStage] = useState<'p1' | 'p2'>('p1');
  const [passPlayP1Result, setPassPlayP1Result] = useState<RoundResult | null>(null);

  // Matchmaking 30s timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (currentMode === 'matchmaking') {
      setMatchmakingTimeLeft(30);
      setMatchmakingFailed(false);

      timer = setInterval(() => {
        setMatchmakingTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setMatchmakingFailed(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [currentMode]);

  // Start Bot Game setup
  const handleStartBotGame = () => {
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
      const res = await recordGameMatch(game.id, game.title, overall, 'Player 2 (Pass & Play)');
      if (res.success) {
        onPointsUpdated(earned, res.totalNoobPoints);
      }
    } catch (err) {
      console.error(err);
      onPointsUpdated(earned, (currentUser.noobPoints || 0) + earned);
    } finally {
      setIsSubmitting(false);
      setCurrentMode('game_over');
    }
  };

  // Dispatches to the right finish handler depending on mode — every game
  // engine's onGameOver wires here instead of calling finishGame directly.
  const handleGameOver = (result: RoundResult) => {
    if (isPassAndPlay) finishPassPlayRound(result);
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
      const res = await recordGameMatch(game.id, game.title, result, opponentName);
      if (res.success) {
        onPointsUpdated(earned, res.totalNoobPoints);
      }
    } catch (err) {
      console.error(err);
      onPointsUpdated(earned, (currentUser.noobPoints || 0) + earned);
    } finally {
      setIsSubmitting(false);
      setCurrentMode('game_over');
    }
  };

  // Tic Tac Toe Move
  const handleTicTacToeClick = (index: number) => {
    if (!gameState.board || gameState.board[index] || !gameState.isPlayerTurn || gameState.winner) return;

    const newBoard = [...gameState.board];
    newBoard[index] = 'X';

    // Check if player won
    if (checkTicTacToeWinner(newBoard, 'X')) {
      setGameState({ ...gameState, board: newBoard, winner: 'X' });
      finishGame('win');
      return;
    }

    // Check tie
    if (newBoard.every((cell) => cell !== null)) {
      setGameState({ ...gameState, board: newBoard, winner: 'Tie' });
      finishGame('tie');
      return;
    }

    // Bot move
    setGameState({ ...gameState, board: newBoard, isPlayerTurn: false });

    setTimeout(() => {
      const emptyIndices = newBoard.map((v, i) => (v === null ? i : null)).filter((v) => v !== null) as number[];
      if (emptyIndices.length > 0) {
        const botIndex = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
        newBoard[botIndex] = 'O';

        if (checkTicTacToeWinner(newBoard, 'O')) {
          setGameState({ ...gameState, board: newBoard, winner: 'O', isPlayerTurn: true });
          finishGame('loss');
        } else if (newBoard.every((cell) => cell !== null)) {
          setGameState({ ...gameState, board: newBoard, winner: 'Tie', isPlayerTurn: true });
          finishGame('tie');
        } else {
          setGameState({ ...gameState, board: newBoard, isPlayerTurn: true });
        }
      }
    }, 500);
  };

  const checkTicTacToeWinner = (b: (string | null)[], player: string) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    return lines.some(([x, y, z]) => b[x] === player && b[y] === player && b[z] === player);
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
    } catch (err) {
      console.error(err);
      setInviteSent(true);
    }
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
                <span className="text-amber-400 font-semibold">{game.pointsReward.toLocaleString()} NOOBs on Win</span>
                <span>•</span>
                <span className="text-zinc-400">
                  {game.id === 'chess_blitz' ? 'Balance wiped on Loss' : '50 NOOBs on Tie'}
                </span>
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
                  onClick={() => setCurrentMode('matchmaking')}
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
                  onClick={() => setCurrentMode('play_friend')}
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
                    onClick={() => setCurrentMode('select_mode')}
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
                      onClick={() => {
                        setMatchmakingFailed(false);
                        setMatchmakingTimeLeft(30);
                      }}
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
                    onClick={() => setCurrentMode('play_friend')}
                    className="w-full p-3 rounded-2xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center gap-2 text-xs font-bold text-cyan-300 transition-all cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Or Invite a Friend</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 3. PLAY WITH FRIEND (Search list + Send Request + Copy Link) */}
          {currentMode === 'play_friend' && (
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

              {game.id === 'tictactoe' && (
                <TicTacToeGame onGameOver={handleGameOver} opponentName={opponentChallenger || 'AI Bot'} vsBot={!isPassAndPlay} />
              )}

              {game.id === 'chess_blitz' && (
                <ChessGame onGameOver={handleGameOver} vsBot={!isPassAndPlay} />
              )}

              {(game.id === 'rps' || game.id === 'rps_extreme') && (
                <RockPaperScissorsGame onGameOver={handleGameOver} opponentName={opponentChallenger || 'AI Bot'} bestOf={3} vsBot={!isPassAndPlay} />
              )}

              {(game.id === 'speed_math' || game.id === 'mental_calc' || game.id === 'trivia_quest') && (
                <SpeedMathGame onGameOver={handleGameOver} targetScore={6} />
              )}

              {(game.id === 'memory_match' || game.id === 'emoji_match' || game.id === 'cyber_memory') && (
                <MemoryMatchGame onGameOver={handleGameOver} />
              )}

              {(game.id === 'reaction_tap' || game.id === 'laser_dodge' || game.id === 'ninja_tap' || game.id === 'speed_reflex') && (
                <ReactionTapGame onGameOver={handleGameOver} />
              )}

              {(game.id === 'brick_breaker' || game.id === 'pinball_pulse' || game.id === 'neon_pong') && (
                <BrickBreakerGame onGameOver={handleGameOver} />
              )}

              {(game.id === 'cyber_drone' || game.id === 'pixel_runner' || game.id === 'galaxy_shooter' || game.id === 'astro_jump') && (
                <CyberDroneGame onGameOver={handleGameOver} targetScore={5} />
              )}

              {(game.id === 'color_rush' || game.id === 'bubble_blitz' || game.id === 'laser_matrix') && (
                <ColorRushGame onGameOver={handleGameOver} targetScore={8} />
              )}

              {(game.id === 'word_guess' || game.id === 'wordle' || game.id === 'code_breaker') && (
                <WordleGuessGame onGameOver={handleGameOver} />
              )}

              {(game.id === 'scribble_art' || game.id === 'doodle_rush') && (
                <ScribbleGame onFinishGame={handleGameOver} opponentName={opponentChallenger || 'AI Bot'} />
              )}

              {/* Universal Rich Arcade Engine for any other game in catalog */}
              {![
                'cyber_snake', 'snake', 'pac_grid',
                'tictactoe',
                'chess_blitz',
                'rps', 'rps_extreme',
                'speed_math', 'mental_calc', 'trivia_quest',
                'memory_match', 'emoji_match', 'cyber_memory',
                'reaction_tap', 'laser_dodge', 'ninja_tap', 'speed_reflex',
                'brick_breaker', 'pinball_pulse', 'neon_pong',
                'cyber_drone', 'pixel_runner', 'galaxy_shooter', 'astro_jump',
                'color_rush', 'bubble_blitz', 'laser_matrix',
                'word_guess', 'wordle', 'code_breaker',
                'scribble_art', 'doodle_rush'
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
                    🏆
                  </div>
                  <h3 className="text-xl font-black text-white">
                    {isPassAndPlay ? 'Player 1 Wins!' : 'Victory! You Won!'}
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
                    {isPassAndPlay ? "It's a Tie!" : "Well Played! It's a Tie!"}
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
                    {isPassAndPlay
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
        </div>
      </div>
    </div>
  );
};
