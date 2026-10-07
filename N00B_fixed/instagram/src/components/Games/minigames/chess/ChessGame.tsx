import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  AIDifficulty,
  PieceColor,
  TimeControlPreset,
  TIME_PRESETS,
  PlayerInfo,
  MoveRecord,
  GameStatus,
  BoardPaletteId,
  PieceStyleId,
} from './types';
import { ChessEngine } from './ChessEngine';
import { computeAiMove } from './ChessAI';
import { audioManager } from './AudioManager';
import { BOARD_PALETTES, PIECE_STYLES } from './themes';
import { ChessBoard } from './ChessBoard';
import { ChessClock } from './ChessClock';
import { MoveHistory } from './MoveHistory';
import { GameResult } from './GameResult';
import { ChessThemeModal } from './ChessThemeModal';
import {
  Bot,
  Flag,
  Handshake,
  RotateCcw,
  Volume2,
  VolumeX,
  Play,
  Palette,
} from 'lucide-react';

// Local-only Chess (vs the built-in bot, or two humans passing the device) — the online, truly
// synced, server-validated match lives in ChessOnlineMatch.tsx instead (see GamePlayModal.tsx for
// why: a client-authoritative board is fine here since nothing of real value is at stake in a way
// an opponent you're physically next to, or a local bot, could exploit, but it's not safe once real
// points move between two separate accounts over the network — that needs a server-validated move).
//
// Reports its result through the exact same onGameOver(result, finalScore) contract the previous
// chess mini-game used, so GamePlayModal's existing scoring wiring (record_match, the Chess Blitz
// weekly-limit gate, the 50M-win/wipe-on-loss stakes) needed no changes at all — only this
// component's insides changed. The real points always come from the server's own calculation in
// record_match (purely from the result string + vsBot flag), never from the finalScore number
// reported here, so that value only ever needs to be a reasonable one to display, not exact.
export interface ChessGameProps {
  onGameOver: (result: 'win' | 'tie' | 'loss', finalScore: number) => void;
  vsBot?: boolean;
  gamesPlayedCount?: number;
  difficulty?: 'easy' | 'normal' | 'hard';
  userId?: string;
  username?: string;
  profilePicture?: string;
}

const mapDifficulty = (d?: 'easy' | 'normal' | 'hard'): AIDifficulty => (d === 'normal' ? 'medium' : d || 'medium');

export const ChessGame: React.FC<ChessGameProps> = ({
  onGameOver,
  vsBot = true,
  gamesPlayedCount,
  difficulty,
  userId = 'me',
  username = 'You',
  profilePicture,
}) => {
  // GamePlayModal already decided vs-bot vs pass-and-play (and, upstream of that, already offered
  // its own difficulty picker for vs-bot) before this component ever mounts — so there is
  // deliberately no mode or difficulty tile-grid here any more, only the setup choices that are
  // genuinely new (time control, which side to play, board/piece theme).
  const mode: 'vs_ai' | 'local_2p' = vsBot ? 'vs_ai' : 'local_2p';
  const hasExplicitDifficulty = difficulty !== undefined;

  const [inSetup, setInSetup] = useState(true);
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>(mapDifficulty(difficulty));
  const [timePreset, setTimePreset] = useState<TimeControlPreset>(TIME_PRESETS[4]); // 5 + 0 default
  const [playerSide, setPlayerSide] = useState<PieceColor>('w');

  // Theme & Audio customization
  const [paletteId, setPaletteId] = useState<BoardPaletteId>('noob_neon');
  const [pieceStyle, setPieceStyle] = useState<PieceStyleId>('classic');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showThemeModal, setShowThemeModal] = useState(false);

  const currentUser: PlayerInfo = { id: userId, username, profilePicture };

  // Active game engine & board
  const [engine, setEngine] = useState<ChessEngine>(() => new ChessEngine());
  const [boardOrientation, setBoardOrientation] = useState<PieceColor>('w');
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [moveHistory, setMoveHistory] = useState<MoveRecord[]>([]);

  // Players
  const [whitePlayer, setWhitePlayer] = useState<PlayerInfo>(currentUser);
  const [blackPlayer, setBlackPlayer] = useState<PlayerInfo>({
    id: 'ai_bot',
    username: `NOOB AI (${aiDifficulty.toUpperCase()})`,
  });

  // Clocks (in ms)
  const [whiteTimeMs, setWhiteTimeMs] = useState(300 * 1000);
  const [blackTimeMs, setBlackTimeMs] = useState(300 * 1000);
  const lastTickRef = useRef<number>(Date.now());
  const prevLowTickRef = useRef<number>(0);

  // Game outcome
  const [gameStatus, setGameStatus] = useState<GameStatus>('idle');
  const [winner, setWinner] = useState<PieceColor | 'draw' | null>(null);
  const [resultReason, setResultReason] = useState<string>('');
  // onGameOver must fire exactly once per match — guards against endGame somehow running twice
  // (e.g. a stray timer tick right after a resign) double-reporting a result to the points system.
  const hasReportedResult = useRef(false);

  useEffect(() => {
    audioManager.setEnabled(soundEnabled);
  }, [soundEnabled]);

  const toggleSound = () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    audioManager.setEnabled(nextVal);
  };

  // Start a new game
  const startGame = useCallback(
    (side: PieceColor = playerSide, preset: TimeControlPreset = timePreset) => {
      const newEng = new ChessEngine();
      setEngine(newEng);
      setBoardOrientation(mode === 'vs_ai' ? side : 'w');
      setSelectedSquare(null);
      setLastMove(null);
      setMoveHistory([]);
      setWinner(null);
      setResultReason('');
      setGameStatus('in_progress');
      setInSetup(false);
      hasReportedResult.current = false;

      if (mode === 'local_2p') {
        setWhitePlayer({ id: 'player_1', username: `${username} (P1)`, profilePicture });
        setBlackPlayer({ id: 'player_2', username: 'Guest (P2)' });
      } else {
        const botName = `NOOB AI (${aiDifficulty.toUpperCase()})`;
        if (side === 'w') {
          setWhitePlayer(currentUser);
          setBlackPlayer({ id: 'bot', username: botName });
        } else {
          setWhitePlayer({ id: 'bot', username: botName });
          setBlackPlayer(currentUser);
        }
      }

      const initialMs = preset.initialSeconds * 1000;
      setWhiteTimeMs(initialMs);
      setBlackTimeMs(initialMs);
      lastTickRef.current = Date.now();
      audioManager.playGameStart();
    },
    [mode, playerSide, timePreset, aiDifficulty, username, profilePicture, currentUser]
  );

  // Timer loop
  useEffect(() => {
    if (inSetup || gameStatus !== 'in_progress' || timePreset.initialSeconds === 0) return;

    lastTickRef.current = Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;

      const turn = engine.getCurrentPlayer();
      if (turn === 'w') {
        setWhiteTimeMs((prev) => {
          const nextVal = Math.max(0, prev - elapsed);
          if (nextVal > 0 && nextVal <= 10000 && Math.floor(nextVal / 1000) !== prevLowTickRef.current) {
            prevLowTickRef.current = Math.floor(nextVal / 1000);
            audioManager.playLowTimeTick();
          }
          if (nextVal === 0) handleTimeout('w');
          return nextVal;
        });
      } else {
        setBlackTimeMs((prev) => {
          const nextVal = Math.max(0, prev - elapsed);
          if (nextVal > 0 && nextVal <= 10000 && Math.floor(nextVal / 1000) !== prevLowTickRef.current) {
            prevLowTickRef.current = Math.floor(nextVal / 1000);
            audioManager.playLowTimeTick();
          }
          if (nextVal === 0) handleTimeout('b');
          return nextVal;
        });
      }
    }, 100);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inSetup, gameStatus, timePreset.initialSeconds, engine]);

  const handleTimeout = (timedOutColor: PieceColor) => {
    const winnerColor = timedOutColor === 'w' ? 'b' : 'w';
    const reason = `Timeout — ${winnerColor === 'w' ? 'White' : 'Black'} wins on time`;
    audioManager.playTimeout();
    endGame(winnerColor, reason, 'timeout');
  };

  // AI response trigger
  useEffect(() => {
    if (inSetup || mode !== 'vs_ai' || gameStatus !== 'in_progress' || engine.getCurrentPlayer() === playerSide) {
      return;
    }
    const timer = setTimeout(() => {
      const aiMove = computeAiMove(engine.getFen(), aiDifficulty);
      if (aiMove) executeMove(aiMove.from, aiMove.to, aiMove.promotion);
    }, 550);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inSetup, mode, gameStatus, engine, playerSide, aiDifficulty]);

  const executeMove = (from: string, to: string, promotion?: string) => {
    const res = engine.makeMove(from, to, promotion);
    if (!res) return;

    setLastMove({ from, to });
    setSelectedSquare(null);
    setMoveHistory((prev) => [...prev, res]);

    if (res.captured) audioManager.playCapture();
    else if (engine.isCheck()) audioManager.playCheck();
    else audioManager.playMove();

    if (timePreset.incrementSeconds > 0) {
      const incMs = timePreset.incrementSeconds * 1000;
      if (res.color === 'w') setWhiteTimeMs((t) => t + incMs);
      else setBlackTimeMs((t) => t + incMs);
    }

    if (engine.isCheckmate()) {
      const winnerColor = res.color;
      audioManager.playCheckmate();
      endGame(winnerColor, `Checkmate — ${winnerColor === 'w' ? 'White' : 'Black'} wins!`, 'checkmate');
    } else if (engine.isStalemate()) {
      audioManager.playStalemate();
      endGame('draw', 'Draw by Stalemate', 'stalemate');
    } else if (engine.isThreefoldRepetition()) {
      audioManager.playStalemate();
      endGame('draw', 'Draw by Threefold Repetition', 'draw');
    } else if (engine.isInsufficientMaterial()) {
      audioManager.playStalemate();
      endGame('draw', 'Draw by Insufficient Material', 'draw');
    } else if (engine.isDraw()) {
      audioManager.playStalemate();
      endGame('draw', 'Draw by 50-move rule', 'draw');
    }
  };

  const reportResult = (winnerColor: PieceColor | 'draw' | null) => {
    if (hasReportedResult.current) return;
    hasReportedResult.current = true;
    if (mode === 'vs_ai') {
      if (winnerColor === 'draw') onGameOver('tie', 5_000_000);
      else onGameOver(winnerColor === playerSide ? 'win' : 'loss', winnerColor === playerSide ? 50_000_000 : 0);
    } else {
      // Pass and Play: White is always "the account that opened this match" (whitePlayer above),
      // so win/loss maps directly onto 'win'/'loss' the same way the previous chess mini-game did.
      if (winnerColor === 'draw') onGameOver('tie', 10_000_000);
      else onGameOver(winnerColor === 'w' ? 'win' : 'loss', winnerColor === 'w' ? 10_000_000 : 0);
    }
  };

  const endGame = (winnerColor: PieceColor | 'draw' | null, reason: string, status: GameStatus) => {
    setGameStatus(status);
    setWinner(winnerColor);
    setResultReason(reason);
    reportResult(winnerColor);
  };

  const handleSquareClick = (sq: string) => {
    if (gameStatus !== 'in_progress') return;
    const turn = engine.getCurrentPlayer();
    if (mode === 'vs_ai' && turn !== playerSide) return;

    if (selectedSquare === sq) {
      setSelectedSquare(null);
      return;
    }
    const cell = engine.getBoardGrid(boardOrientation).flat().find((c) => c.square === sq);
    if (cell?.piece && cell.piece.color === turn) setSelectedSquare(sq);
  };

  const handleResign = () => {
    const turn = engine.getCurrentPlayer();
    const winningColor = turn === 'w' ? 'b' : 'w';
    audioManager.playTimeout();
    endGame(winningColor, `${turn === 'w' ? whitePlayer.username : blackPlayer.username} resigned`, 'resigned');
  };

  const handleOfferDraw = () => {
    if (mode === 'vs_ai') {
      if (moveHistory.length > 25 && Math.abs(whiteTimeMs - blackTimeMs) < 30000) {
        audioManager.playStalemate();
        endGame('draw', 'Draw by Mutual Agreement', 'draw');
      } else {
        alert('NOOB AI declined the draw offer.');
      }
    } else {
      audioManager.playStalemate();
      endGame('draw', 'Draw by Mutual Agreement', 'draw');
    }
  };

  const legalMovesForSelected = selectedSquare ? engine.getLegalMoves(selectedSquare) : [];

  const generateCurrentPgn = useCallback(() => {
    let resultStr = '*';
    if (gameStatus === 'checkmate' || gameStatus === 'resigned' || gameStatus === 'timeout') {
      resultStr = winner === 'w' ? '1-0' : winner === 'b' ? '0-1' : '*';
    } else if (gameStatus === 'stalemate' || gameStatus === 'draw') {
      resultStr = '1/2-1/2';
    }
    return engine.getPgn({
      white: whitePlayer.username,
      black: blackPlayer.username,
      result: resultStr,
      event: mode === 'vs_ai' ? `NOOB vs AI (${aiDifficulty.toUpperCase()})` : 'NOOB Local 2P',
    });
  }, [engine, whitePlayer.username, blackPlayer.username, gameStatus, winner, mode, aiDifficulty]);

  return (
    <div className="w-full min-h-[680px] bg-[#0c1017] text-slate-100 flex flex-col p-3 sm:p-6 font-sans">
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800 max-w-4xl mx-auto w-full">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base sm:text-lg font-black tracking-tight text-white">NOOB CHESS</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-400 font-bold">
              {BOARD_PALETTES[paletteId]?.name}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">Think. Move. Conquer.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowThemeModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-cyan-400 hover:border-slate-700 transition-colors cursor-pointer text-xs font-semibold"
            title="Toggle Board Themes & Piece Styles"
          >
            <Palette className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Theme</span>
          </button>
          <button
            onClick={toggleSound}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-cyan-400 transition-colors cursor-pointer"
            title={soundEnabled ? 'Mute Audio FX' : 'Enable Audio FX'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4 text-rose-400" />}
          </button>
          {!inSetup && (
            <button
              onClick={() => setInSetup(true)}
              className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              Setup Menu
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 max-w-4xl mx-auto w-full flex flex-col items-center justify-center">
        {inSetup ? (
          <div className="w-full max-w-lg bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="text-center">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {mode === 'vs_ai' ? 'Set Up vs AI' : 'Set Up Pass & Play'}
              </h2>
              <p className="text-xs text-slate-400 mt-1">Choose your clock preset{mode === 'vs_ai' ? ', AI difficulty and side' : ''}.</p>
            </div>

            {mode === 'vs_ai' && !hasExplicitDifficulty && (
              <div>
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2">AI Difficulty</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['easy', 'medium', 'hard'] as AIDifficulty[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => setAiDifficulty(d)}
                      className={`py-2 rounded-xl border text-xs font-bold capitalize transition-colors cursor-pointer ${
                        aiDifficulty === d ? 'bg-cyan-500 text-slate-950 font-black' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2">Time Control Clock</label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                {TIME_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => setTimePreset(preset)}
                    className={`py-2 px-1 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer ${
                      timePreset.id === preset.id ? 'bg-cyan-950 border-cyan-500 text-cyan-300 ring-1 ring-cyan-500/40' : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'vs_ai' && (
              <div>
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2">Play As</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPlayerSide('w')}
                    className={`py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer ${
                      playerSide === 'w' ? 'bg-slate-800 border-white text-white' : 'bg-slate-950/60 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="w-3 h-3 rounded-full bg-white border border-slate-400" />
                    <span>White Pieces</span>
                  </button>
                  <button
                    onClick={() => setPlayerSide('b')}
                    className={`py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer ${
                      playerSide === 'b' ? 'bg-slate-800 border-cyan-500 text-white' : 'bg-slate-950/60 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="w-3 h-3 rounded-full bg-slate-900 border border-slate-500" />
                    <span>Black Pieces</span>
                  </button>
                </div>
              </div>
            )}

            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-cyan-400" />
                  <span>
                    {BOARD_PALETTES[paletteId]?.name} · {PIECE_STYLES.find((s) => s.id === pieceStyle)?.name}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Custom board palette &amp; piece design</div>
              </div>
              <button
                onClick={() => setShowThemeModal(true)}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-cyan-300 transition-colors cursor-pointer"
              >
                Customize
              </button>
            </div>

            <button
              onClick={() => startGame()}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-sm tracking-wide shadow-lg shadow-cyan-500/25 transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start Chess Game</span>
            </button>
          </div>
        ) : (
          <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-8 flex flex-col items-center w-full">
              <div className="w-full max-w-[420px] sm:max-w-[480px] md:max-w-[520px] mb-2">
                <ChessClock
                  color={boardOrientation === 'w' ? 'b' : 'w'}
                  timeMs={boardOrientation === 'w' ? blackTimeMs : whiteTimeMs}
                  isActive={engine.getCurrentPlayer() === (boardOrientation === 'w' ? 'b' : 'w')}
                  hasTimer={timePreset.initialSeconds > 0}
                  player={boardOrientation === 'w' ? blackPlayer : whitePlayer}
                  isCheck={engine.isCheck() && engine.getCurrentPlayer() === (boardOrientation === 'w' ? 'b' : 'w')}
                />
              </div>

              <ChessBoard
                grid={engine.getBoardGrid(boardOrientation)}
                orientation={boardOrientation}
                turn={engine.getCurrentPlayer()}
                selectedSquare={selectedSquare}
                legalMoves={legalMovesForSelected}
                lastMove={lastMove}
                kingInCheckSquare={engine.isCheck() ? engine.getKingSquare(engine.getCurrentPlayer()) : null}
                palette={BOARD_PALETTES[paletteId]}
                pieceStyle={pieceStyle}
                isInteractive={gameStatus === 'in_progress'}
                onSquareClick={handleSquareClick}
                onMovePiece={executeMove}
              />

              <div className="w-full max-w-[420px] sm:max-w-[480px] md:max-w-[520px] mt-2">
                <ChessClock
                  color={boardOrientation === 'w' ? 'w' : 'b'}
                  timeMs={boardOrientation === 'w' ? whiteTimeMs : blackTimeMs}
                  isActive={engine.getCurrentPlayer() === (boardOrientation === 'w' ? 'w' : 'b')}
                  hasTimer={timePreset.initialSeconds > 0}
                  player={boardOrientation === 'w' ? whitePlayer : blackPlayer}
                  isCheck={engine.isCheck() && engine.getCurrentPlayer() === (boardOrientation === 'w' ? 'w' : 'b')}
                />
              </div>
            </div>

            <div className="lg:col-span-4 w-full flex flex-col gap-3">
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3.5 h-3.5 rounded-full border border-slate-600 ${engine.getCurrentPlayer() === 'w' ? 'bg-white' : 'bg-slate-800'}`} />
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-200">
                    {engine.getCurrentPlayer() === 'w' ? 'White to Move' : 'Black to Move'}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-cyan-400 font-bold">{timePreset.label}</span>
              </div>

              <div className="h-64 sm:h-72">
                <MoveHistory moves={moveHistory} getPgn={generateCurrentPgn} />
              </div>

              <div className="flex items-center justify-between gap-2 p-2 bg-slate-950/80 rounded-2xl border border-slate-800">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setBoardOrientation(boardOrientation === 'w' ? 'b' : 'w')}
                    title="Flip Board"
                    className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowThemeModal(true)}
                    title="Theme & Sound Settings"
                    className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-cyan-400 transition-colors cursor-pointer"
                  >
                    <Palette className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleOfferDraw}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-300 hover:text-amber-400 transition-colors cursor-pointer"
                  >
                    <Handshake className="w-3.5 h-3.5" />
                    <span>Draw</span>
                  </button>
                  <button
                    onClick={handleResign}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-300 hover:text-rose-400 transition-colors cursor-pointer"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>Resign</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {gameStatus !== 'idle' && gameStatus !== 'in_progress' && (
        <GameResult
          status={gameStatus}
          winner={winner}
          reason={resultReason}
          movesCount={moveHistory.length}
          whitePlayerName={whitePlayer.username}
          blackPlayerName={blackPlayer.username}
          getPgn={generateCurrentPgn}
          onPlayAgain={() => startGame()}
          onNewGame={() => setInSetup(true)}
        />
      )}

      {showThemeModal && (
        <ChessThemeModal
          currentPaletteId={paletteId}
          currentPieceStyle={pieceStyle}
          soundEnabled={soundEnabled}
          onSelectPalette={(id) => setPaletteId(id)}
          onSelectPieceStyle={(id) => setPieceStyle(id)}
          onToggleSound={toggleSound}
          onClose={() => setShowThemeModal(false)}
        />
      )}
    </div>
  );
};
