import React, { useEffect, useRef, useState } from 'react';
import { GameMode, LudoGameState, Player, PlayerColor, EmoteMessage, ThemeConfig, TokenSkin } from './types';
import { soundEffects } from './audio/soundEffects';
import { computerAvatar, initialAvatar } from './avatars';
import { DailyRewardsModal } from './components/DailyRewardsModal';
import { DailyMissions } from './components/DailyMissions';
import { EmotePicker } from './components/EmotePicker';
import { GameResultModal } from './components/GameResultModal';
import { InventoryModal } from './components/InventoryModal';
import { LudoBoard } from './components/LudoBoard';
import { LudoDice } from './components/LudoDice';
import { LudoHeader } from './components/LudoHeader';
import { ModeSelectModal } from './components/ModeSelectModal';
import { PlayerHUD } from './components/PlayerHUD';
import { RulesModal } from './components/RulesModal';
import { UserProfileModal } from './components/UserProfileModal';
import { ludoStorage, UserProfile } from './services/ludoStorage';
import { networkAdapter } from './services/networkAdapter';
import { LUDO_THEMES, TOKEN_SKINS } from './themes/ludoThemes';

export interface NoobLudoModuleProps {
  /** The signed-in NOOB account — its name and picture are what the player is shown as. */
  currentUser: { id: string; username: string; avatar?: string };
  /** How the Games screen asked to play: against computer players, or friends sharing this device. */
  entryMode: 'bot' | 'pass_play';
  initialPlayerCount?: number;
  difficulty?: 'easy' | 'normal' | 'hard';
  /** Fired once, when the player taps Continue on the result screen. */
  onFinished: (result: 'win' | 'loss', finalScore: number) => void;
}

export const LudoGameModule: React.FC<NoobLudoModuleProps> = ({
  currentUser,
  entryMode,
  initialPlayerCount,
  difficulty,
  onFinished,
}) => {
  const [profile, setProfile] = useState<UserProfile>(() => {
    ludoStorage.setActiveUser({
      id: currentUser.id,
      username: currentUser.username,
      avatar: currentUser.avatar || initialAvatar(currentUser.username),
    });
    return ludoStorage.getProfile();
  });
  const [gameState, setGameState] = useState<LudoGameState | null>(null);
  const [activeEmotes, setActiveEmotes] = useState<Record<string, string>>({});
  const [matchDuration, setMatchDuration] = useState(0);

  // Modals
  const [showModeSelect, setShowModeSelect] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showDailyRewards, setShowDailyRewards] = useState(false);
  const [showDailyMissions, setShowDailyMissions] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);

  // End Game Result
  const [matchRewards, setMatchRewards] = useState({ xpEarned: 0, coinsEarned: 0 });

  // Get active equipped theme and token skin
  const currentTheme: ThemeConfig =
    LUDO_THEMES.find((t) => t.id === profile.equippedThemeId) || LUDO_THEMES[0];
  const currentTokenSkin: TokenSkin =
    TOKEN_SKINS.find((t) => t.id === profile.equippedTokenSkinId) || TOKEN_SKINS[0];

  // Latest values for the long-lived adapter listeners below.
  const matchDurationRef = useRef(0);
  matchDurationRef.current = matchDuration;
  const recordedGameIdRef = useRef<string | null>(null);

  // Subscribe to the match engine once per mount.
  useEffect(() => {
    networkAdapter.setLocalPlayerId(profile.id);

    const unsubState = networkAdapter.subscribe('state_updated', (state) => {
      // The engine mutates one state object in place, so hand React a fresh copy.
      setGameState({ ...(state as LudoGameState) });
    });

    const unsubEmote = networkAdapter.subscribe('emote_received', (data) => {
      const emote = data as EmoteMessage;
      setActiveEmotes((prev) => ({ ...prev, [emote.color]: emote.textOrEmoji }));
      setTimeout(() => {
        setActiveEmotes((prev) => {
          const next = { ...prev };
          delete next[emote.color];
          return next;
        });
      }, 2500);
    });

    const unsubMove = networkAdapter.subscribe('token_moved', (data) => {
      const { captured, reachedHome } = data as { captured: boolean; reachedHome: boolean };
      if (captured) {
        soundEffects.playCapture();
      } else if (reachedHome) {
        soundEffects.playHomeReached();
      } else {
        soundEffects.playTokenStep();
      }
    });

    const unsubFinish = networkAdapter.subscribe('game_finished', () => {
      // Read the engine's own final state: this event fires in the same tick as the last move,
      // before React has re-rendered with it.
      const finalState = networkAdapter.getGameState();
      if (!finalState || recordedGameIdRef.current === finalState.gameId) return;
      recordedGameIdRef.current = finalState.gameId;

      const userP = finalState.players.find((p) => p.id === profile.id) || finalState.players[0];
      const isWin =
        finalState.mode === 'team_2v2' ? userP.team === finalState.winningTeam : finalState.winner === userP.color;

      const rewards = ludoStorage.recordMatchResult({
        mode: finalState.mode,
        durationSeconds: matchDurationRef.current,
        rank: isWin ? 1 : userP.finishRank || 2,
        isWinner: isWin,
        tokensCaptured: userP.capturedCount || 0,
        tokensHome: userP.tokensHome || 0,
        players: finalState.players.map((p) => ({ name: p.name, color: p.color, rank: p.finishRank })),
      });

      setMatchRewards(rewards);
      setProfile(ludoStorage.getProfile());
    });

    return () => {
      unsubState();
      unsubEmote();
      unsubMove();
      unsubFinish();
      // Stop bot turns and the turn timer if the player leaves mid-match.
      networkAdapter.leaveRoom();
    };
  }, [profile.id]);

  // Match clock
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (gameState && gameState.status === 'in_progress' && !gameState.winner) {
      interval = setInterval(() => {
        setMatchDuration((prev) => prev + 1);
        // The engine counts the turn timer down inside its own state object; mirror it each second.
        const live = networkAdapter.getGameState();
        if (live) setGameState({ ...live });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [gameState?.status, gameState?.winner]);

  // The Games screen's own pick (computer opponents vs. friends on this device) as a one-tap start.
  const startEntryMatch = () =>
    startMatch(entryMode === 'pass_play' ? 'local_pass_play' : 'vs_computer', {
      playerCount: Math.min(Math.max(initialPlayerCount || 4, 2), 4),
      difficulty: difficulty === 'normal' || !difficulty ? 'medium' : difficulty,
    });

  /**
   * Start a new match with chosen mode and configurations
   */
  const startMatch = (
    mode: GameMode,
    options?: { playerCount?: number; difficulty?: 'easy' | 'medium' | 'hard' }
  ) => {
    setShowModeSelect(false);
    setMatchDuration(0);

    const colors: PlayerColor[] = ['red', 'green', 'yellow', 'blue', 'purple', 'orange'];
    const pCount =
      mode === 'five_player'
        ? 5
        : mode === 'six_player'
        ? 6
        : mode === 'team_2v2'
        ? 4
        : options?.playerCount || 4;

    const botDifficulty = options?.difficulty || 'medium';

    // Build player roster
    const players: Omit<Player, 'tokens' | 'hasFinished' | 'tokensHome' | 'capturedCount' | 'consecutiveSixes'>[] = [];

    // Player 1 is the local logged-in user
    players.push({
      id: profile.id,
      name: profile.username,
      avatar: profile.avatar,
      color: colors[0],
      team: mode === 'team_2v2' ? 1 : undefined,
      isBot: false,
      isConnected: true,
      level: profile.level,
      xp: profile.xp,
    });

    // Opponents are either computer players (plainly labelled) or friends sharing this device.
    for (let i = 1; i < pCount; i++) {
      const isLocalPass = mode === 'local_pass_play';
      players.push({
        id: isLocalPass ? `player_${i + 1}` : `bot_${i}`,
        name: isLocalPass ? `Player ${i + 1}` : `Computer ${i}`,
        avatar: isLocalPass ? initialAvatar(`P${i + 1}`, colors[i]) : computerAvatar(colors[i]),
        color: colors[i],
        team: mode === 'team_2v2' ? (i % 2 === 0 ? 1 : 2) : undefined,
        isBot: !isLocalPass,
        botDifficulty,
        isConnected: true,
        level: 1,
        xp: 0,
      });
    }

    soundEffects.playMatchStart();
    networkAdapter.startLocalGame({ mode, players });
  };

  const handleRollDice = () => {
    networkAdapter.rollDice();
  };

  const handleSelectToken = (tokenId: number) => {
    networkAdapter.moveToken(tokenId);
  };

  const handleSendEmote = (text: string) => {
    networkAdapter.sendEmote(profile.username, text);
  };

  const handleForfeitExit = () => {
    networkAdapter.leaveRoom();
    setGameState(null);
  };

  // Find local user player object
  const userPlayer = gameState?.players.find((p) => p.id === profile.id) || gameState?.players[0];
  const isMyTurn =
    gameState?.status === 'in_progress' &&
    gameState.currentTurnColor === userPlayer?.color &&
    !userPlayer.hasFinished;

  return (
    <div
      className={`min-h-[calc(100dvh-90px)] sm:min-h-[560px] w-full bg-gradient-to-b ${currentTheme.bgGradient} text-white flex flex-col items-center justify-between p-2 md:p-4 select-none relative overflow-x-hidden`}
    >
      {/* ================= TOP NAVIGATION / MATCH HEADER ================= */}
      {gameState ? (
        <LudoHeader
          roomId={gameState.roomId}
          gameMode={gameState.mode}
          matchDurationSeconds={matchDuration}
          isReconnecting={false}
          onExit={handleForfeitExit}
          onOpenRules={() => setShowRulesModal(true)}
        />
      ) : (
        /* Standalone Ludo Hub Header when match not in progress */
        <div className="w-full max-w-4xl flex flex-wrap items-center justify-between gap-2 p-2.5 md:p-3 rounded-2xl bg-zinc-900/90 border border-slate-800/80 backdrop-blur-xl mb-2 shadow-xl shadow-black/40">
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xl">🎲</span>
              <span className="font-black text-base md:text-lg tracking-wider bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-500 bg-clip-text text-transparent whitespace-nowrap">
                NOOB LUDO
              </span>
              <span className="text-[10px] font-black text-amber-300/80 tracking-widest px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 uppercase">
                CLUB
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
            <button
              onClick={() => setShowDailyMissions(true)}
              className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 text-xs font-black transition-all cursor-pointer flex items-center gap-1 shrink-0"
            >
              <span>🎯</span>
              <span>Missions</span>
            </button>

            <button
              onClick={() => setShowDailyRewards(true)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-amber-300 border border-amber-400/30 text-xs font-black transition-all cursor-pointer flex items-center gap-1 shrink-0"
            >
              <span>🎁</span>
              <span>Daily Gift</span>
            </button>

            <button
              onClick={() => setShowInventory(true)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700/50 text-xs font-black transition-all cursor-pointer flex items-center gap-1 shrink-0"
            >
              <span>✨</span>
              <span>Skins</span>
            </button>

            <button
              onClick={() => setShowProfileModal(true)}
              className="flex items-center gap-1.5 p-1 pl-2 md:pl-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-xs font-extrabold cursor-pointer shrink-0"
            >
              <span className="whitespace-nowrap text-amber-300 font-mono font-bold">{profile.coins.toLocaleString()} 🪙</span>
              <img
                src={profile.avatar}
                alt={profile.username}
                className="w-6 h-6 md:w-7 md:h-7 rounded-lg object-cover ring-1 ring-amber-400/40"
              />
            </button>
          </div>
        </div>
      )}

      {/* ================= MAIN CONTENT AREA ================= */}
      {gameState ? (
        /* ACTIVE MATCH VIEW - BALANCED COMPACT ARENA */
        <div className="w-full max-w-[480px] flex-1 flex flex-col items-center justify-center mx-auto my-auto gap-1.5 md:gap-2 select-none px-1">
          {/* Top Players Row: Red (Top-Left) & Green (Top-Right) */}
          <div className="w-full flex items-center justify-between px-0.5 gap-1">
            {/* Top-Left: Red Player HUD */}
            <div className="flex-1 flex justify-start min-w-0">
              {(() => {
                const p = gameState.players.find((pl) => pl.color === 'red') || gameState.players[0];
                return p ? (
                  <PlayerHUD
                    player={p}
                    isCurrentTurn={gameState.currentTurnColor === p.color}
                    isLocalUser={p.id === profile.id}
                    activeEmote={activeEmotes[p.color]}
                    targetTokensHome={gameState.targetTokensHome}
                  />
                ) : <div className="w-20" />;
              })()}
            </div>

            {/* Turn Status Banner */}
            <div className="shrink-0 flex flex-col items-center justify-center px-2 py-0.5 md:py-1 rounded-xl bg-slate-900/85 border border-indigo-500/30 backdrop-blur-md shadow-md text-center max-w-[130px] md:max-w-[150px]">
              <span className={`text-[9px] md:text-[10px] font-black tracking-wider uppercase truncate ${isMyTurn ? 'text-amber-400 animate-pulse' : 'text-slate-300'}`}>
                {isMyTurn ? '⚡ YOUR TURN' : `${gameState.players.find((pl) => pl.color === gameState.currentTurnColor)?.name || ''}'s Turn`}
              </span>
              <span className="text-[10px] md:text-[11px] font-bold text-slate-400 truncate">
                {gameState.diceRollStatus === 'waiting_roll' ? 'Roll Dice' : 'Move Goti'}
              </span>
            </div>

            {/* Top-Right: Green Player HUD */}
            <div className="flex-1 flex justify-end min-w-0">
              {(() => {
                const p = gameState.players.find((pl) => pl.color === 'green') || gameState.players[1];
                return p ? (
                  <PlayerHUD
                    player={p}
                    isCurrentTurn={gameState.currentTurnColor === p.color}
                    isLocalUser={p.id === profile.id}
                    activeEmote={activeEmotes[p.color]}
                    targetTokensHome={gameState.targetTokensHome}
                  />
                ) : <div className="w-20" />;
              })()}
            </div>
          </div>

          {/* 5P / 6P Extra Players Row (if in 5-player or 6-player mode) */}
          {gameState.players.length > 4 && (
            <div className="w-full flex items-center justify-center gap-2">
              {gameState.players.slice(4).map((p) => (
                <PlayerHUD
                  key={p.id}
                  player={p}
                  isCurrentTurn={gameState.currentTurnColor === p.color}
                  isLocalUser={p.id === profile.id}
                  activeEmote={activeEmotes[p.color]}
                  targetTokensHome={gameState.targetTokensHome}
                />
              ))}
            </div>
          )}

          {/* Center Ludo Board */}
          <div className="w-full flex flex-col items-center justify-center">
            <LudoBoard
              players={gameState.players}
              currentTurnColor={gameState.currentTurnColor}
              legalTokenIds={gameState.legalTokenIds}
              diceRollStatus={gameState.diceRollStatus}
              theme={currentTheme}
              tokenSkin={currentTokenSkin}
              onSelectToken={handleSelectToken}
              isMyTurn={isMyTurn}
              myColor={userPlayer?.color || 'red'}
            />
          </div>

          {/* Bottom Players Row: Blue (Bottom-Left), Dice in Center, Yellow (Bottom-Right) */}
          <div className="w-full flex items-center justify-between px-0.5 gap-1">
            {/* Bottom-Left: Blue Player HUD */}
            <div className="flex-1 flex justify-start min-w-0">
              {(() => {
                const p =
                  gameState.players.find((pl) => pl.color === 'blue') ||
                  (gameState.players.length >= 4 ? gameState.players[3] : undefined);
                return p ? (
                  <PlayerHUD
                    player={p}
                    isCurrentTurn={gameState.currentTurnColor === p.color}
                    isLocalUser={p.id === profile.id}
                    activeEmote={activeEmotes[p.color]}
                    targetTokensHome={gameState.targetTokensHome}
                  />
                ) : <div className="w-20" />;
              })()}
            </div>

            {/* Bottom Center: Ludo Dice with Turn Countdown */}
            <div className="shrink-0 flex items-center justify-center mx-1">
              <LudoDice
                value={gameState.diceValue}
                status={gameState.diceRollStatus}
                isMyTurn={isMyTurn}
                currentColor={gameState.currentTurnColor}
                turnTimeRemaining={gameState.turnTimeRemaining}
                maxTurnTime={gameState.turnTimeout}
                onRoll={handleRollDice}
                disabled={!isMyTurn}
              />
            </div>

            {/* Bottom-Right: Yellow Player HUD */}
            <div className="flex-1 flex justify-end min-w-0">
              {(() => {
                const p =
                  gameState.players.find((pl) => pl.color === 'yellow') ||
                  (gameState.players.length >= 3 ? gameState.players[2] : undefined);
                return p ? (
                  <PlayerHUD
                    player={p}
                    isCurrentTurn={gameState.currentTurnColor === p.color}
                    isLocalUser={p.id === profile.id}
                    activeEmote={activeEmotes[p.color]}
                    targetTokensHome={gameState.targetTokensHome}
                  />
                ) : <div className="w-20" />;
              })()}
            </div>
          </div>
        </div>
      ) : (
        /* LUDO LOBBY DASHBOARD HERO */
        <div className="w-full max-w-4xl flex-1 flex flex-col items-center justify-center text-center my-3 md:my-4 px-2">
          <div className="relative w-full max-w-2xl">
            <div className="absolute -inset-2 bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-amber-600/20 rounded-3xl blur-xl opacity-60" />
            <div className="relative p-5 sm:p-7 md:p-8 rounded-3xl bg-zinc-900/95 border border-amber-500/30 shadow-2xl backdrop-blur-2xl flex flex-col items-center">
              <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-600 p-0.5 shadow-lg shadow-amber-500/20 mb-3 flex items-center justify-center">
                <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-2xl md:text-3xl">
                  🎲
                </div>
              </div>

              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-white">
                  NOOB LUDO CLUB
                </h1>
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/40">
                  VIP
                </span>
              </div>

              <p className="text-xs md:text-sm text-slate-300 font-medium max-w-md mt-2">
                Classic Ludo against computer players, or pass the phone around with friends. Earn coins and XP to unlock new boards, dice and tokens.
              </p>

              {/* Main Action Buttons */}
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3 w-full mt-6">
                <button
                  onClick={() => setShowModeSelect(true)}
                  className="py-3 px-3 sm:px-4 rounded-xl md:rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:brightness-110 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-amber-500/20 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>⚡ PLAY NOW</span>
                </button>

                <button
                  onClick={startEntryMatch}
                  className="py-3 px-3 sm:px-4 rounded-xl md:rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-slate-200 font-extrabold text-xs sm:text-sm transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>{entryMode === 'pass_play' ? '👥 PASS & PLAY' : '🤖 VS COMPUTER'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= BOTTOM BAR ================= */}
      {gameState && (
        <div className="w-full max-w-4xl flex items-center justify-between p-2 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md gap-2">
          <div className="flex items-center gap-2">
            <EmotePicker onSendEmote={handleSendEmote} />
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 font-medium">
            <span>Room #{gameState.roomId.slice(-6).toUpperCase()}</span>
            <span>•</span>
            <span className="capitalize">{gameState.mode.replace('_', ' ')}</span>
          </div>

          <button
            onClick={() => setShowRulesModal(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-all shrink-0"
          >
            Rules
          </button>
        </div>
      )}

      {/* ================= MODALS ================= */}
      <ModeSelectModal
        isOpen={showModeSelect}
        onClose={() => setShowModeSelect(false)}
        onSelectMode={(mode, options) => startMatch(mode, options)}
      />

      <DailyMissions
        isOpen={showDailyMissions}
        onClose={() => setShowDailyMissions(false)}
        profile={profile}
        onProfileUpdated={(p) => setProfile(p)}
      />

      <InventoryModal
        isOpen={showInventory}
        onClose={() => setShowInventory(false)}
        profile={profile}
        onProfileUpdated={(p) => setProfile(p)}
      />

      <DailyRewardsModal
        isOpen={showDailyRewards}
        onClose={() => setShowDailyRewards(false)}
        profile={profile}
        onProfileUpdated={(p) => setProfile(p)}
      />

      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        profile={profile}
        onProfileUpdated={(p) => setProfile(p)}
      />

      <RulesModal
        isOpen={showRulesModal}
        onClose={() => setShowRulesModal(false)}
      />

      {/* Match Result Screen */}
      {gameState?.status === 'completed' && gameState.winner && userPlayer && (
        <GameResultModal
          winnerColor={gameState.winner}
          winningTeam={gameState.winningTeam}
          rankings={gameState.rankings}
          players={gameState.players}
          mode={gameState.mode}
          userPlayer={userPlayer}
          rewards={matchRewards}
          durationSeconds={matchDuration}
          onContinue={() => {
            const finalState = networkAdapter.getGameState();
            const won =
              finalState?.mode === 'team_2v2'
                ? userPlayer.team === finalState.winningTeam
                : finalState?.winner === userPlayer.color;
            onFinished(won ? 'win' : 'loss', userPlayer.tokensHome || 0);
          }}
        />
      )}
    </div>
  );
};

