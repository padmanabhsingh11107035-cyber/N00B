import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  Pause,
  Play,
  RotateCcw,
  Trophy,
  Target,
  Settings as SettingsIcon,
  Shirt,
  Share2,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Zap,
  Shield,
  Magnet,
  Flame,
  CheckCircle2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  GameState,
  PlayerStats,
  PowerUpActive,
  GameSettings,
  Mission,
  Achievement,
  CharacterSkin,
  CharacterModelDef,
  WeatherInfo,
  NoobUser,
  ComboEvent,
} from '../types';
import { audioManager } from '../audio/AudioManager';
import { MissionService } from '../services/MissionService';
import { SkinService } from '../services/SkinService';
import { LeaderboardService, LeaderboardEntry } from '../services/LeaderboardService';

interface GameUIProps {
  gameState: GameState;
  stats: PlayerStats;
  powerUps: PowerUpActive[];
  bestScore: number;
  bestDistance: number;
  totalCoins: number;
  fps: number;
  settings: GameSettings;
  user?: NoobUser;
  currentSkyTheme?: { name: string; badge: string; icon: string; timeOfDay?: string };
  currentWeather?: WeatherInfo;
  lastCombo?: ComboEvent | null;
  chaseMessage?: string | null;
  onSkipIntro?: () => void;
  onStartGame: () => void;
  onPauseGame: () => void;
  onResumeGame: () => void;
  onRestartGame: () => void;
  onExitGame: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onJump: () => void;
  onSlide: () => void;
  onUpdateSettings: (newSettings: GameSettings) => void;
  onApplySkin: (skin: CharacterSkin) => void;
  onSelectCharacter?: (modelId: string, skin?: CharacterSkin) => void;
  onCoinsSpent?: (amount: number) => void;
  onCycleWeather?: () => void;
  onShareResult?: (stats: { score: number; distance: number; coins: number }) => void;
}

export const GameUI: React.FC<GameUIProps> = ({
  gameState,
  stats,
  powerUps,
  bestScore,
  bestDistance,
  totalCoins,
  fps,
  settings,
  user,
  currentSkyTheme,
  currentWeather,
  lastCombo,
  chaseMessage,
  onSkipIntro,
  onStartGame,
  onPauseGame,
  onResumeGame,
  onRestartGame,
  onExitGame,
  onMoveLeft,
  onMoveRight,
  onJump,
  onSlide,
  onUpdateSettings,
  onApplySkin,
  onSelectCharacter,
  onCoinsSpent,
  onCycleWeather,
  onShareResult,
}) => {
  // Modal states
  const [activeModal, setActiveModal] = useState<
    'none' | 'missions' | 'leaderboard' | 'skins' | 'settings'
  >('none');

  // Missions & Achievements state
  const [missions, setMissions] = useState<Mission[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [activeTabMissions, setActiveTabMissions] = useState<'missions' | 'achievements'>('missions');

  // Character & Wardrobe state
  const [characters, setCharacters] = useState<CharacterModelDef[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>('runner_ace');
  const [skins, setSkins] = useState<CharacterSkin[]>([]);
  const [selectedSkinId, setSelectedSkinId] = useState<string>('skin_default');
  const [wardrobeTab, setWardrobeTab] = useState<'characters' | 'outfits'>('characters');

  // Leaderboard state
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardState, setLeaderboardState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  // Share tooltip toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Atmospheric day-night skybox transition banner
  const [skyBanner, setSkyBanner] = useState<{ name: string; badge: string; icon: string; timeOfDay?: string } | null>(null);
  const prevThemeRef = useRef<string>('');

  useEffect(() => {
    if (currentSkyTheme && currentSkyTheme.name !== prevThemeRef.current) {
      if (prevThemeRef.current !== '' && gameState === 'playing') {
        setSkyBanner(currentSkyTheme);
        const timer = setTimeout(() => setSkyBanner(null), 3500);
        prevThemeRef.current = currentSkyTheme.name;
        return () => clearTimeout(timer);
      }
      prevThemeRef.current = currentSkyTheme.name;
    }
  }, [currentSkyTheme, gameState]);

  // Full-screen touch gesture tracking for mobile swipe controls
  const touchStateRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    isTracking: boolean;
    hasTriggered: boolean;
    isTouchPointer: boolean;
  }>({
    startX: 0,
    startY: 0,
    startTime: 0,
    isTracking: false,
    hasTriggered: false,
    isTouchPointer: false,
  });

  useEffect(() => {
    setMissions(MissionService.loadMissions());
    setAchievements(MissionService.loadAchievements());

    const loadedChars = SkinService.loadCharacterModels();
    setCharacters(loadedChars);
    const selCharId = SkinService.getSelectedCharacterId();
    setSelectedCharacterId(selCharId);

    const loadedSkins = SkinService.loadSkins();
    setSkins(loadedSkins);
    const selId = SkinService.getSelectedSkinId();
    setSelectedSkinId(selId);

    const activeSkin = loadedSkins.find((s) => s.id === selId);
    if (activeSkin) onApplySkin(activeSkin);
    onSelectCharacter?.(selCharId, activeSkin);
  }, []);

  // Update leaderboard when best score changes or modal opens
  useEffect(() => {
    if (activeModal !== 'leaderboard') return;
    let alive = true;
    setLeaderboardState('loading');
    LeaderboardService.request().then((rows) => {
      if (!alive) return;
      setLeaderboard(rows || []);
      setLeaderboardState(rows ? 'ready' : 'unavailable');
    });
    return () => { alive = false; };
  }, [activeModal]);

  // Trigger celebratory confetti on new high score in GameOver
  useEffect(() => {
    if (gameState === 'gameover' && stats.score >= bestScore && stats.score > 0) {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#fbbf24', '#38bdf8', '#f43f5e', '#a855f7'],
        });
      } catch {
        // ignore
      }
    }
  }, [gameState]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleShare = () => {
    const text = `🎮 I just scored ${stats.score.toLocaleString()} points and ran ${stats.distance.toLocaleString()}m in NOOB RUN 3D! Can you beat my record?`;
    if (navigator.share) {
      navigator.share({ title: 'NOOB RUN 3D', text }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(text);
      showToast('Result copied to clipboard!');
    }
    onShareResult?.({ score: stats.score, distance: stats.distance, coins: stats.coins });
  };

  // Haptic feedback tick for tactile touch confirmations (async to prevent touch thread pauses)
  const triggerHaptic = () => {
    if (settings.vibration && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      setTimeout(() => {
        try {
          navigator.vibrate?.(14);
        } catch {
          // ignore
        }
      }, 0);
    }
  };

  // Robust full-screen swipe processor: triggers exactly once per swipe stroke to switch to next lane
  const processSwipe = (dx: number, dy: number): boolean => {
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const SWIPE_THRESHOLD = 24; // Snappy activation threshold (px)

    if (Math.max(absX, absY) < SWIPE_THRESHOLD) return false;

    if (absX > absY) {
      if (dx > 0) {
        onMoveRight(); // Shift 1 track to the right
      } else {
        onMoveLeft(); // Shift 1 track to the left
      }
    } else {
      if (dy < 0) {
        onJump();
      } else {
        onSlide();
      }
    }
    triggerHaptic();
    return true;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (gameState !== 'playing') return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    touchStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startTime: performance.now(),
      isTracking: true,
      hasTriggered: false,
      isTouchPointer: e.pointerType === 'touch',
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // Strictly single-trigger per swipe stroke: once triggered, ignores further dragging until release
    if (!touchStateRef.current.isTracking || touchStateRef.current.hasTriggered || gameState !== 'playing') return;
    const dx = e.clientX - touchStateRef.current.startX;
    const dy = e.clientY - touchStateRef.current.startY;

    if (processSwipe(dx, dy)) {
      touchStateRef.current.hasTriggered = true;
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (!touchStateRef.current.isTracking || gameState !== 'playing') {
      touchStateRef.current.isTracking = false;
      touchStateRef.current.hasTriggered = false;
      return;
    }
    if (!touchStateRef.current.hasTriggered) {
      const dx = e.clientX - touchStateRef.current.startX;
      const dy = e.clientY - touchStateRef.current.startY;
      processSwipe(dx, dy);
    }
    touchStateRef.current.isTracking = false;
    touchStateRef.current.hasTriggered = false;
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    touchStateRef.current.isTracking = false;
    touchStateRef.current.hasTriggered = false;
  };

  // Select or buy 3D Character Model Archetype
  const handleSelectCharacter = (model: CharacterModelDef) => {
    const activeSkin = skins.find((s) => s.id === selectedSkinId);
    if (model.unlocked) {
      setSelectedCharacterId(model.id);
      SkinService.setSelectedCharacterId(model.id);
      onSelectCharacter?.(model.id, activeSkin);
      audioManager.playUIClick();
      showToast(`Equipped 3D Hero ${model.name}!`);
    } else {
      if (totalCoins >= model.price) {
        // Deduct coins & persist
        const newTotal = totalCoins - model.price;
        try {
          localStorage.setItem('noob_run_total_coins', newTotal.toString());
        } catch {
          // ignore
        }
        onCoinsSpent?.(model.price);

        const updated = characters.map((c) => (c.id === model.id ? { ...c, unlocked: true } : c));
        setCharacters(updated);
        SkinService.saveCharacterModels(updated);
        setSelectedCharacterId(model.id);
        SkinService.setSelectedCharacterId(model.id);
        onSelectCharacter?.(model.id, activeSkin);
        audioManager.playPowerUp();
        showToast(`Unlocked 3D Hero ${model.name}!`);
      } else {
        audioManager.playCrash();
        showToast(`Need ${model.price - totalCoins} more coins to unlock ${model.name}!`);
      }
    }
  };

  // Select, preview, or buy character skin
  const handleSelectSkin = (skin: CharacterSkin) => {
    // Immediate preview on 3D character in background to showcase unique idle animation
    onApplySkin(skin);

    if (skin.unlocked) {
      setSelectedSkinId(skin.id);
      SkinService.setSelectedSkinId(skin.id);
      audioManager.playUIClick();
      showToast(`Equipped ${skin.name}!`);
    } else {
      if (totalCoins >= skin.price) {
        // Deduct coins & persist
        const newTotal = totalCoins - skin.price;
        try {
          localStorage.setItem('noob_run_total_coins', newTotal.toString());
        } catch {
          // ignore
        }
        onCoinsSpent?.(skin.price);

        // Purchase skin & persist unlock status to local storage
        const updated = skins.map((s) => (s.id === skin.id ? { ...s, unlocked: true } : s));
        setSkins(updated);
        SkinService.saveSkins(updated);
        setSelectedSkinId(skin.id);
        SkinService.setSelectedSkinId(skin.id);
        onApplySkin({ ...skin, unlocked: true });
        audioManager.playPowerUp();
        showToast(`Unlocked ${skin.name}!`);
      } else {
        audioManager.playCrash();
        showToast(`Need ${skin.price - totalCoins} more coins to unlock ${skin.name}!`);
      }
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-10 flex flex-col justify-between overflow-hidden">
      {/* --- FULL-SCREEN SWIPE GESTURE CONTROLLER --- */}
      {gameState === 'playing' && (
        <div
          className="absolute inset-0 z-0 pointer-events-auto touch-none select-none cursor-grab active:cursor-grabbing"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          aria-label="Swipe anywhere to control runner: Up to Jump, Down to Slide, Left/Right to Switch Lanes"
        />
      )}
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-slate-900/90 text-amber-400 border border-amber-500/40 px-5 py-2.5 rounded-full shadow-2xl backdrop-blur-md text-sm font-semibold pointer-events-auto flex items-center gap-2 animate-bounce z-50">
          <Sparkles className="w-4 h-4 text-amber-400" />
          {toastMessage}
        </div>
      )}

      {/* Atmospheric Day-to-Night Skybox Transition Banner */}
      {skyBanner && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-gradient-to-r from-slate-900/95 via-slate-800/95 to-slate-900/95 text-white border border-amber-500/50 px-6 py-2.5 rounded-2xl shadow-[0_0_30px_rgba(245,158,11,0.35)] backdrop-blur-md pointer-events-auto flex items-center gap-3 animate-in fade-in slide-in-from-top duration-500 z-50">
          <span className="text-2xl">{skyBanner.icon}</span>
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-amber-400 font-game tracking-widest uppercase">
              {skyBanner.timeOfDay ? `DAY / NIGHT CYCLE: ${skyBanner.timeOfDay.toUpperCase()}` : 'ATMOSPHERE TRANSITION'}
            </span>
            <span className="text-sm font-black font-game text-white tracking-wide">
              {skyBanner.name} <span className="text-amber-300/80 text-xs font-semibold">({skyBanner.badge})</span>
            </span>
          </div>
        </div>
      )}

      {/* --- 1. IN-GAME HUD (When Playing or Paused) --- */}
      {(gameState === 'playing' || gameState === 'paused') && (
        <div className="p-4 sm:p-6 w-full flex flex-col gap-3 pointer-events-auto">
          {/* Top Bar Stats (Exact Layout from Subway Surfers Image) */}
          <div className="flex items-start justify-between w-full">
            {/* Top Left: Iconic Blue Rounded Square Pause Button & Sound Toggle */}
            <div className="flex items-center gap-2">
              <button
                onClick={gameState === 'playing' ? onPauseGame : onResumeGame}
                className="w-12 h-12 rounded-xl bg-sky-500 hover:bg-sky-400 active:scale-95 border-2 border-sky-200/80 shadow-[0_4px_12px_rgba(2,132,199,0.5)] flex items-center justify-center text-white transition cursor-pointer"
                aria-label="Pause Game"
              >
                {gameState === 'playing' ? (
                  <div className="flex gap-1.5 items-center justify-center">
                    <span className="w-1.5 h-6 bg-white rounded-full block shadow-sm" />
                    <span className="w-1.5 h-6 bg-white rounded-full block shadow-sm" />
                  </div>
                ) : (
                  <Play className="w-6 h-6 fill-white ml-0.5" />
                )}
              </button>

              <button
                onClick={() => {
                  const newMuted = !settings.musicVolume;
                  onUpdateSettings({
                    ...settings,
                    musicVolume: newMuted ? 0.6 : 0,
                    sfxVolume: newMuted ? 0.8 : 0,
                  });
                  audioManager.setVolumes(newMuted ? 0.6 : 0, newMuted ? 0.8 : 0, !newMuted);
                }}
                className="w-10 h-10 rounded-xl bg-slate-900/80 border border-slate-700/60 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 transition active:scale-95 shadow-md backdrop-blur-sm cursor-pointer"
                aria-label="Toggle Sound"
              >
                {settings.musicVolume > 0 ? (
                  <Volume2 className="w-5 h-5 text-cyan-400" />
                ) : (
                  <VolumeX className="w-5 h-5 text-slate-400" />
                )}
              </button>

              {/* Corridor / Atmospheric Badge */}
              {currentSkyTheme && (
                <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/80 border border-slate-700/60 rounded-xl text-xs font-bold text-amber-300 backdrop-blur-sm shadow-sm">
                  <span>{currentSkyTheme.icon}</span>
                  <span className="font-game">{currentSkyTheme.badge}</span>
                </div>
              )}

              {/* Dynamic Weather Atmosphere Badge (Click or press 'T' to cycle) */}
              {currentWeather && (
                <button
                  onClick={() => {
                    onCycleWeather?.();
                    audioManager.playUIClick();
                    showToast(`Atmosphere: ${currentWeather.name}`);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/80 hover:bg-slate-800 border border-cyan-500/30 hover:border-cyan-400/50 rounded-xl text-xs font-bold text-cyan-300 backdrop-blur-sm shadow-sm transition active:scale-95 cursor-pointer"
                  title="Toggle Atmosphere (Hotkey: T)"
                >
                  <span>{currentWeather.icon}</span>
                  <span className="font-game">{currentWeather.name.toUpperCase()}</span>
                </button>
              )}
            </div>

            {/* Top Right: Subway Surfers Exact Score & Coin Badge Pillars */}
            <div className="flex flex-col items-end gap-1.5">
              {/* Row 1: Multiplier Tag + Padded Zero Score Pill */}
              <div className="flex items-center shadow-2xl rounded-xl overflow-hidden border border-white/20">
                {/* Yellow Multiplier Pill (e.g. x3 or x6 with combo!) */}
                <div
                  className={`px-2.5 py-1 font-game font-black text-sm sm:text-base border-r border-white/20 transition-all ${
                    stats.comboMultiplier > 1
                      ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 text-white animate-pulse shadow-lg shadow-orange-500/40'
                      : 'bg-black/85 text-yellow-400'
                  }`}
                >
                  x{stats.multiplier}
                </div>
                {/* Score Counter (Padded with leading zeroes just like screenshot!) */}
                <div className="bg-black/95 text-white font-game font-black text-xl sm:text-2xl px-3.5 py-1 tracking-widest text-stroke-1 text-amber-300">
                  {stats.score.toString().padStart(6, '0')}
                </div>
              </div>

              {/* Row 2: Coin Counter Pill (Embossed Golden Coin + Count) */}
              <div className="flex items-center gap-1.5 bg-black/85 border border-white/20 px-3 py-1 rounded-xl shadow-lg backdrop-blur-sm">
                <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 border border-yellow-200 flex items-center justify-center text-slate-950 font-black text-xs shadow-md">
                  ★
                </div>
                <span className="font-game text-yellow-300 font-bold text-base sm:text-lg">
                  {stats.coins.toLocaleString()}
                </span>
              </div>

              {/* Row 3: Distance readout */}
              <div className="text-[11px] font-bold text-slate-300 font-game tracking-wider bg-black/60 px-2.5 py-0.5 rounded-lg border border-white/10">
                DIST: {stats.distance.toLocaleString()}m
              </div>
            </div>
          </div>

          {/* Active Power-Ups Indicators */}
          {powerUps.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {powerUps.map((pu) => {
                const pct = Math.max(0, Math.min(100, (pu.duration / pu.maxDuration) * 100));
                let color = 'from-cyan-500 to-blue-600';
                let Icon = Zap;
                let label = 'BOOST';

                if (pu.type === 'magnet') {
                  color = 'from-rose-500 to-red-600';
                  Icon = Magnet;
                  label = 'MAGNET';
                } else if (pu.type === 'shield') {
                  color = 'from-cyan-400 to-teal-500';
                  Icon = Shield;
                  label = 'SHIELD';
                } else if (pu.type === 'multiplier') {
                  color = 'from-amber-400 to-yellow-500';
                  Icon = Sparkles;
                  label = '2X SCORE';
                } else if (pu.type === 'jetpack') {
                  color = 'from-sky-400 to-indigo-500';
                  Icon = Flame;
                  label = 'JETPACK';
                }

                return (
                  <div
                    key={pu.type}
                    className="flex items-center gap-2 bg-slate-900/90 border border-slate-700/80 px-2.5 py-1 rounded-lg backdrop-blur-md shadow-lg"
                  >
                    <div className={`p-1 rounded bg-gradient-to-br ${color} text-white`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col">
                      <div className="flex justify-between items-center text-[10px] font-bold text-slate-300 gap-3">
                        <span>{label}</span>
                        <span>{pu.type === 'shield' ? 'ACTIVE' : `${Math.ceil(pu.duration)}s`}</span>
                      </div>
                      {pu.type !== 'shield' && (
                        <div className="w-16 h-1 bg-slate-800 rounded-full overflow-hidden mt-0.5">
                          <div
                            className={`h-full bg-gradient-to-r ${color} transition-all duration-100`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* FPS Counter */}
          {settings.showFps && (
            <div className="text-[11px] font-mono text-slate-500">
              {fps} FPS
            </div>
          )}
        </div>
      )}

      {/* --- DYNAMIC COMBO MULTIPLIER ARCADE HUD --- */}
      {gameState === 'playing' && stats.comboCount > 0 && stats.comboTimer > 0 && (
        <div className="absolute top-28 right-4 sm:right-6 pointer-events-none flex flex-col items-end z-20 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center gap-2.5 bg-slate-950/90 border-2 border-amber-400/80 px-3.5 py-2 rounded-2xl shadow-[0_0_24px_rgba(245,158,11,0.5)] backdrop-blur-md">
            <div className="flex flex-col items-end">
              {/* Maneuver Trick Name */}
              <div className="text-[10px] font-black tracking-widest text-amber-300 uppercase flex items-center gap-1 font-game">
                <Zap className="w-3 h-3 text-yellow-300 animate-bounce" />
                {stats.lastComboAction || 'TRICK CHAIN'}
              </div>
              {/* Combo Multiplier Text */}
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-black text-slate-300 font-game tracking-wider">COMBO</span>
                <span className="text-xl sm:text-2xl font-black font-game text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-400 to-rose-400 drop-shadow">
                  x{stats.comboMultiplier}
                </span>
                <span className="text-[11px] font-bold text-amber-200/90 font-game">
                  ({stats.comboCount} STREAK)
                </span>
              </div>
            </div>
            {/* Dynamic Trick Flame Icon */}
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 flex items-center justify-center text-white shadow-md">
              <Flame className="w-5 h-5 animate-pulse" />
            </div>
          </div>
          {/* Fast-Draining Cooldown Depletion Bar */}
          <div className="w-40 sm:w-48 h-2 bg-slate-950/90 rounded-full mt-1.5 overflow-hidden border border-white/20 shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-yellow-400 via-amber-500 to-rose-500 transition-all duration-75 ease-linear rounded-full"
              style={{
                width: `${Math.max(0, Math.min(100, (stats.comboTimer / (stats.comboMaxTimer || 3.8)) * 100))}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* --- POLICE PURSUIT 6-SECOND CHASE BANNER --- */}
      {gameState === 'playing' && chaseMessage && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 pointer-events-none animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="flex items-center gap-3 bg-gradient-to-r from-red-950/95 via-slate-950/95 to-blue-950/95 border-2 border-red-500/80 px-5 py-2.5 rounded-2xl shadow-[0_0_35px_rgba(239,68,68,0.7)] backdrop-blur-md">
            <span className="relative flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span>
            </span>
            <span className="text-xl">👮🐕</span>
            <div className="text-xs sm:text-sm font-black text-amber-300 font-game tracking-wider uppercase drop-shadow-md">
              {chaseMessage}
            </div>
          </div>
        </div>
      )}

      {/* --- INTRO CUTSCENE OVERLAY (Game State: 'intro') --- */}
      {gameState === 'intro' && (
        <div className="absolute inset-0 pointer-events-auto flex flex-col justify-between p-6 select-none z-20">
          {/* Top Cinematic Badge & Skip Button */}
          <div className="w-full flex justify-between items-center pt-2">
            <div className="flex items-center gap-3 bg-slate-950/85 border border-pink-500/60 px-4 py-2.5 rounded-2xl shadow-[0_0_24px_rgba(236,72,153,0.45)] backdrop-blur-md animate-in fade-in slide-in-from-top-3">
              <span className="text-2xl animate-bounce">🎨</span>
              <div>
                <div className="text-xs font-black tracking-wider text-pink-400 font-game uppercase flex items-center gap-1.5">
                  <span>SUBWAY SURFERS INTRO</span>
                  <span className="w-2 h-2 rounded-full bg-pink-500 animate-ping inline-block" />
                </div>
                <div className="text-[11px] text-slate-300 font-medium">
                  {chaseMessage || 'Spray painting the train...'}
                </div>
              </div>
            </div>

            {/* Skip Intro Button */}
            {onSkipIntro && (
              <button
                onClick={onSkipIntro}
                className="group px-4 py-2 bg-slate-900/90 hover:bg-slate-800 active:scale-95 border border-amber-400/70 rounded-xl text-amber-300 font-game font-black text-xs shadow-[0_0_15px_rgba(245,158,11,0.3)] hover:shadow-[0_0_25px_rgba(245,158,11,0.5)] backdrop-blur-md flex items-center gap-2 transition cursor-pointer"
              >
                <span>SKIP INTRO</span>
                <span className="group-hover:translate-x-0.5 transition-transform">⏭</span>
              </button>
            )}
          </div>

          {/* Bottom cinematic subtitle & warning */}
          <div className="w-full flex justify-center pb-6">
            <div className="bg-slate-950/90 border border-amber-500/40 px-6 py-2.5 rounded-full text-white text-xs sm:text-sm font-semibold tracking-wide backdrop-blur-md shadow-2xl flex items-center gap-2.5 animate-pulse">
              <span className="text-base">⚠️</span>
              <span>Watch out! Security Guard & Dog are on patrol!</span>
            </div>
          </div>
        </div>
      )}

      {/* --- 3. MAIN TITLE MENU (Game State: 'menu') --- */}
      {gameState === 'menu' && (
        <div className="absolute inset-0 bg-slate-950/65 backdrop-blur-[2px] flex flex-col items-center justify-between p-6 pointer-events-auto">
          {/* Top Brand & Career Stats */}
          <div className="w-full max-w-md flex justify-between items-center pt-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold rounded-lg font-game">
                NOOB GAMES
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 bg-slate-900/80 border border-amber-500/30 px-3 py-1 rounded-full text-xs font-bold text-amber-300">
                <span className="w-4 h-4 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-[10px] font-black">
                  N
                </span>
                {totalCoins.toLocaleString()}
              </div>

              <button
                onClick={() => setActiveModal('settings')}
                className="w-8 h-8 rounded-lg bg-slate-900/80 border border-slate-700/60 flex items-center justify-center text-slate-400 hover:text-white transition cursor-pointer"
              >
                <SettingsIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Center Title Logo & Big Play Button */}
          <div className="flex flex-col items-center text-center my-auto">
            <div className="relative mb-2">
              <span className="text-5xl sm:text-7xl font-game font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-b from-amber-300 via-amber-400 to-orange-500 text-stroke-2 game-glow drop-shadow-2xl">
                NOOB RUN
              </span>
              <span className="absolute -bottom-2 -right-4 bg-cyan-500 text-slate-950 font-game font-black text-xs sm:text-sm px-2 py-0.5 rounded rotate-12 shadow-md">
                3D
              </span>
            </div>

            <p className="text-slate-300 text-sm sm:text-base font-medium tracking-wide mb-6">
              "Run farther. Beat your record."
            </p>

            {/* High Score Card */}
            {bestScore > 0 && (
              <div className="mb-6 px-4 py-2 bg-slate-900/80 border border-slate-800 rounded-xl flex items-center gap-4 text-xs font-semibold">
                <span className="text-slate-400">BEST SCORE:</span>
                <span className="font-game text-amber-400 text-base font-bold">
                  {bestScore.toLocaleString()}
                </span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-400">BEST DIST:</span>
                <span className="text-slate-200 font-bold">{bestDistance.toLocaleString()}m</span>
              </div>
            )}

            {/* BIG PLAY BUTTON */}
            <button
              onClick={() => {
                audioManager.playUIClick();
                onStartGame();
              }}
              className="group relative px-10 sm:px-14 py-4 sm:py-5 bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 text-slate-950 font-game font-black text-2xl sm:text-3xl rounded-2xl shadow-[0_0_35px_rgba(245,158,11,0.5)] hover:shadow-[0_0_50px_rgba(245,158,11,0.8)] hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer flex items-center gap-3"
            >
              <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-slate-950 transition-transform group-hover:scale-110" />
              PLAY NOW
            </button>
          </div>

          {/* Bottom Navigation Buttons: MISSIONS, LEADERBOARD, SKINS */}
          <div className="w-full max-w-md grid grid-cols-4 gap-2 pb-2">
            <button
              onClick={() => setActiveModal('missions')}
              className="flex flex-col items-center justify-center p-2.5 bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 rounded-xl transition active:scale-95 text-slate-300 hover:text-white cursor-pointer"
            >
              <Target className="w-5 h-5 text-cyan-400 mb-1" />
              <span className="text-[11px] font-bold">MISSIONS</span>
            </button>

            <button
              onClick={() => setActiveModal('leaderboard')}
              className="flex flex-col items-center justify-center p-2.5 bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 rounded-xl transition active:scale-95 text-slate-300 hover:text-white cursor-pointer"
            >
              <Trophy className="w-5 h-5 text-amber-400 mb-1" />
              <span className="text-[11px] font-bold">RANKS</span>
            </button>

            <button
              onClick={() => setActiveModal('skins')}
              className="flex flex-col items-center justify-center p-2.5 bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 rounded-xl transition active:scale-95 text-slate-300 hover:text-white cursor-pointer"
            >
              <Shirt className="w-5 h-5 text-purple-400 mb-1" />
              <span className="text-[11px] font-bold">SKINS</span>
            </button>

            <button
              onClick={() => setActiveModal('settings')}
              className="flex flex-col items-center justify-center p-2.5 bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 rounded-xl transition active:scale-95 text-slate-300 hover:text-white cursor-pointer"
            >
              <SettingsIcon className="w-5 h-5 text-slate-400 mb-1" />
              <span className="text-[11px] font-bold">SETTINGS</span>
            </button>
          </div>
        </div>
      )}

      {/* --- 4. PAUSE MENU --- */}
      {gameState === 'paused' && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-6 pointer-events-auto z-40">
          <div className="w-full max-w-sm bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center">
            <span className="font-game text-3xl font-black text-amber-400 tracking-wider mb-1">
              PAUSED
            </span>
            <span className="text-slate-400 text-xs font-medium mb-6">Take a breath, runner</span>

            {/* Current Run Snapshot */}
            <div className="w-full bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 mb-6 grid grid-cols-3 gap-2">
              <div className="flex flex-col">
                <span className="text-slate-400 text-[10px] font-bold">SCORE</span>
                <span className="font-game text-amber-400 text-lg font-bold">{stats.score.toLocaleString()}</span>
              </div>
              <div className="flex flex-col border-x border-slate-800 px-1">
                <span className="text-slate-400 text-[10px] font-bold">DIST</span>
                <span className="font-game text-slate-200 text-lg font-bold">{stats.distance.toLocaleString()}m</span>
              </div>
              <div className="flex flex-col">
                <span className="text-slate-400 text-[10px] font-bold">COINS</span>
                <span className="font-game text-yellow-300 text-lg font-bold">{stats.coins.toLocaleString()}</span>
              </div>
            </div>

            {/* Buttons */}
            <div className="w-full flex flex-col gap-2.5">
              <button
                onClick={onResumeGame}
                className="w-full py-3.5 bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-game font-bold text-lg rounded-xl shadow-lg hover:brightness-110 active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-5 h-5 fill-slate-950" />
                RESUME
              </button>

              <button
                onClick={onRestartGame}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-game font-bold rounded-xl transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 text-cyan-400" />
                RESTART RUN
              </button>

              <button
                onClick={() => setActiveModal('settings')}
                className="w-full py-3 bg-slate-800/70 hover:bg-slate-800 text-slate-300 font-game font-bold rounded-xl transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                <SettingsIcon className="w-4 h-4 text-slate-400" />
                SETTINGS
              </button>

              <button
                onClick={onExitGame}
                className="w-full py-2.5 text-rose-400 hover:text-rose-300 font-semibold text-xs tracking-wider transition cursor-pointer flex items-center justify-center gap-1.5 mt-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                EXIT TO NOOB PORTAL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- 5. GAME OVER SCREEN --- */}
      {gameState === 'gameover' && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 pointer-events-auto z-40 animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-slate-900/95 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center">
            {/* Header Badge */}
            {stats.score >= bestScore && stats.score > 0 ? (
              <div className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-500/50 text-amber-300 text-xs font-black px-3.5 py-1 rounded-full mb-2 animate-bounce">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                NEW RECORD!
              </div>
            ) : (
              <span className="text-rose-500 text-xs font-black tracking-widest uppercase mb-1">
                CRASHED ON THE TRACKS
              </span>
            )}

            <h2 className="font-game text-4xl sm:text-5xl font-black text-white tracking-wider text-stroke-1 mb-4">
              GAME OVER
            </h2>

            {/* Run Stats Card */}
            <div className="w-full bg-slate-950/80 border border-slate-800/90 rounded-2xl p-5 mb-5 flex flex-col gap-3">
              <div className="flex justify-between items-center pb-3 border-b border-slate-800/80">
                <span className="text-slate-400 text-xs font-semibold">FINAL SCORE</span>
                <span className="font-game text-3xl font-black text-amber-400 game-glow">
                  {stats.score.toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[10px] font-bold">DISTANCE</span>
                  <span className="font-game text-slate-200 text-base font-bold">
                    {stats.distance.toLocaleString()}m
                  </span>
                </div>
                <div className="flex flex-col border-x border-slate-800/80">
                  <span className="text-slate-500 text-[10px] font-bold">COINS</span>
                  <span className="font-game text-amber-300 text-base font-bold">
                    +{stats.coins.toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-500 text-[10px] font-bold">XP EARNED</span>
                  <span className="font-game text-cyan-400 text-base font-bold">
                    +{(Math.floor(stats.score / 15) + stats.coins * 3).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="w-full flex flex-col gap-2.5">
              <button
                onClick={() => {
                  audioManager.playUIClick();
                  onStartGame();
                }}
                className="w-full py-4 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-game font-black text-xl rounded-xl shadow-[0_0_25px_rgba(245,158,11,0.4)] active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-5 h-5 fill-slate-950" />
                PLAY AGAIN
              </button>

              <button
                onClick={handleShare}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-game font-bold rounded-xl transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Share2 className="w-4 h-4 text-cyan-400" />
                SHARE RESULT
              </button>

              <button
                onClick={onExitGame}
                className="w-full py-2.5 text-slate-400 hover:text-white font-semibold text-xs tracking-wider transition cursor-pointer flex items-center justify-center gap-1.5 mt-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                EXIT TO NOOB
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- 6. MISSIONS & ACHIEVEMENTS MODAL --- */}
      {activeModal === 'missions' && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-4 pointer-events-auto z-50">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-cyan-400" />
                <h3 className="font-game text-xl font-black text-white">MISSIONS & ACHIEVEMENTS</h3>
              </div>
              <button
                onClick={() => setActiveModal('none')}
                className="text-slate-400 hover:text-white text-sm font-bold px-2 py-1 bg-slate-800 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-2 p-1 bg-slate-950/60 rounded-xl mb-4">
              <button
                onClick={() => setActiveTabMissions('missions')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                  activeTabMissions === 'missions'
                    ? 'bg-cyan-500 text-slate-950 font-black shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                DAILY MISSIONS
              </button>
              <button
                onClick={() => setActiveTabMissions('achievements')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                  activeTabMissions === 'achievements'
                    ? 'bg-cyan-500 text-slate-950 font-black shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                ACHIEVEMENTS
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 pr-1">
              {activeTabMissions === 'missions'
                ? missions.map((m) => {
                    const pct = Math.min(100, Math.round((m.current / m.target) * 100));
                    return (
                      <div
                        key={m.id}
                        className={`p-3.5 rounded-2xl border ${
                          m.completed
                            ? 'bg-emerald-950/20 border-emerald-500/30'
                            : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-1.5">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <h4 className="font-bold text-sm text-slate-100">{m.title}</h4>
                              {m.completed && (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              )}
                            </div>
                            <p className="text-xs text-slate-400">{m.description}</p>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-bold text-amber-400">+{m.rewardCoins} N</span>
                            <span className="block text-[10px] text-cyan-400">+{m.rewardXP} XP</span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mt-2">
                          <div
                            className={`h-full transition-all duration-300 ${
                              m.completed ? 'bg-emerald-500' : 'bg-cyan-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-500 font-bold mt-1">
                          <span>{pct}% COMPLETE</span>
                          <span>
                            {m.current} / {m.target}
                          </span>
                        </div>
                      </div>
                    );
                  })
                : achievements.map((a) => (
                    <div
                      key={a.id}
                      className={`p-3 rounded-2xl border flex items-center gap-3.5 ${
                        a.unlocked
                          ? 'bg-amber-950/20 border-amber-500/30'
                          : 'bg-slate-950/60 border-slate-800 opacity-60'
                      }`}
                    >
                      <div className="w-11 h-11 rounded-xl bg-slate-800 flex items-center justify-center text-2xl shadow-inner">
                        {a.icon}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-sm text-slate-100">{a.title}</h4>
                          {a.unlocked && (
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                              UNLOCKED
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400">{a.description}</p>
                      </div>
                    </div>
                  ))}
            </div>
          </div>
        </div>
      )}

      {/* --- 7. LEADERBOARD MODAL --- */}
      {activeModal === 'leaderboard' && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-4 pointer-events-auto z-50">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                <h3 className="font-game text-xl font-black text-white">TOP RUNNERS</h3>
              </div>
              <button
                onClick={() => setActiveModal('none')}
                className="text-slate-400 hover:text-white text-sm font-bold px-2 py-1 bg-slate-800 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 pr-1">
              {leaderboardState === 'loading' && <p className="text-center text-sm text-slate-400 py-6">Loading the ranking…</p>}
              {leaderboardState === 'unavailable' && <p className="text-center text-sm text-slate-400 py-6">The ranking is shown when you play inside NOOB.</p>}
              {leaderboardState === 'ready' && leaderboard.length === 0 && <p className="text-center text-sm text-slate-400 py-6">No runs yet. Be the first!</p>}
              {leaderboard.map((item) => (
                <div
                  key={item.rank + item.username}
                  className={`p-3 rounded-2xl border flex items-center justify-between ${
                    item.isCurrentUser
                      ? 'bg-amber-500/15 border-amber-500/50 shadow-md'
                      : 'bg-slate-950/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`font-game font-black text-sm w-6 text-center ${
                        item.rank === 1
                          ? 'text-amber-400 text-lg'
                          : item.rank === 2
                          ? 'text-slate-300'
                          : item.rank === 3
                          ? 'text-amber-600'
                          : 'text-slate-500'
                      }`}
                    >
                      #{item.rank}
                    </span>
                    {/^(\/|https:\/\/)/.test(item.avatar)
                      ? <img src={item.avatar} alt="" className="w-7 h-7 rounded-full object-cover bg-slate-800" />
                      : <span className="text-xl">{item.avatar}</span>}
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-white">{item.username}</span>
                        {item.badge && (
                          <span className="text-[9px] font-black bg-cyan-500/20 text-cyan-300 px-1.5 py-0.2 rounded font-game">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400">{item.distance.toLocaleString()}m</span>
                    </div>
                  </div>

                  <span className="font-game text-base font-bold text-amber-400">
                    {item.score.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- 8. CHARACTER & WARDROBE CUSTOMIZATION MODAL --- */}
      {activeModal === 'skins' && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-4 pointer-events-auto z-50">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <Shirt className="w-5 h-5 text-purple-400" />
                <h3 className="font-game text-xl font-black text-white">CHARACTER & WARDROBE</h3>
              </div>
              <button
                onClick={() => setActiveModal('none')}
                className="text-slate-400 hover:text-white text-sm font-bold px-2 py-1 bg-slate-800 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Segmented Tab Switcher */}
            <div className="flex bg-slate-950/80 p-1 rounded-2xl border border-slate-800 mb-4">
              <button
                onClick={() => setWardrobeTab('characters')}
                className={`flex-1 py-2 text-xs font-game font-bold rounded-xl transition cursor-pointer ${
                  wardrobeTab === 'characters'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                3D CHARACTERS
              </button>
              <button
                onClick={() => setWardrobeTab('outfits')}
                className={`flex-1 py-2 text-xs font-game font-bold rounded-xl transition cursor-pointer ${
                  wardrobeTab === 'outfits'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                OUTFITS & COLORWAYS
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 pr-1">
              {wardrobeTab === 'characters' ? (
                /* --- 3D Character Archetypes List --- */
                characters.map((char) => {
                  const isEquipped = selectedCharacterId === char.id;
                  return (
                    <div
                      key={char.id}
                      className={`p-3.5 rounded-2xl border flex items-center justify-between transition ${
                        isEquipped
                          ? 'bg-purple-950/30 border-purple-500 shadow-lg'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-slate-800 to-slate-700 border border-white/10 flex items-center justify-center text-2xl shadow-md">
                          {char.icon}
                        </div>
                        <div className="max-w-[210px] sm:max-w-[260px]">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm text-white">{char.name}</h4>
                            <span className="text-[10px] text-purple-300 font-game px-1.5 py-0.5 bg-purple-900/40 rounded">
                              {char.title}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5 leading-snug">
                            {char.description}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleSelectCharacter(char)}
                        className={`px-3.5 py-2 rounded-xl font-bold text-xs transition cursor-pointer shrink-0 ml-2 ${
                          isEquipped
                            ? 'bg-purple-500 text-white font-black'
                            : char.unlocked
                            ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                            : 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black'
                        }`}
                      >
                        {isEquipped
                          ? 'EQUIPPED'
                          : char.unlocked
                          ? 'EQUIP'
                          : `UNLOCK (${char.price} N)`}
                      </button>
                    </div>
                  );
                })
              ) : (
                /* --- Outfits & Colorways List --- */
                skins.map((skin) => {
                  const isEquipped = selectedSkinId === skin.id;
                  return (
                    <div
                      key={skin.id}
                      onClick={() => handleSelectSkin(skin)}
                      className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition ${
                        isEquipped
                          ? 'bg-purple-950/30 border-purple-500/80 shadow-lg shadow-purple-500/15 ring-1 ring-purple-500/50'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/50'
                      }`}
                    >
                      <div className="flex items-start sm:items-center gap-3">
                        {/* Color Palette preview dot */}
                        <div
                          className="w-11 h-11 rounded-2xl border border-white/20 shadow-md flex items-center justify-center shrink-0"
                          style={{ backgroundColor: skin.jacketColor }}
                        >
                          <div
                            className="w-4 h-4 rounded-full border border-white/40 shadow-sm"
                            style={{ backgroundColor: skin.accentColor }}
                          />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-sm text-white">{skin.name}</h4>
                            {skin.idleBadge && (
                              <span className="px-2 py-0.5 rounded-md text-[9px] font-black tracking-wide bg-gradient-to-r from-purple-500/20 to-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                                {skin.idleBadge}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-300 mt-0.5 leading-tight">
                            {skin.description || skin.title || 'Streetwear Edition'}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectSkin(skin);
                        }}
                        className={`self-end sm:self-auto px-4 py-2 rounded-xl font-bold text-xs transition cursor-pointer whitespace-nowrap ${
                          isEquipped
                            ? 'bg-purple-500 text-white font-black shadow-md shadow-purple-500/30'
                            : skin.unlocked
                            ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                            : 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-md shadow-amber-500/20'
                        }`}
                      >
                        {isEquipped
                          ? 'EQUIPPED'
                          : skin.unlocked
                          ? 'EQUIP'
                          : `UNLOCK (${skin.price} N)`}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- 9. SETTINGS MODAL --- */}
      {activeModal === 'settings' && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-4 pointer-events-auto z-50">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col">
            <div className="flex justify-between items-center mb-5">
              <div className="flex items-center gap-2">
                <SettingsIcon className="w-5 h-5 text-slate-400" />
                <h3 className="font-game text-xl font-black text-white">GAME SETTINGS</h3>
              </div>
              <button
                onClick={() => setActiveModal('none')}
                className="text-slate-400 hover:text-white text-sm font-bold px-2 py-1 bg-slate-800 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Music Volume */}
              <div>
                <div className="flex justify-between text-xs font-bold text-slate-300 mb-1">
                  <span>MUSIC VOLUME</span>
                  <span>{Math.round(settings.musicVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.musicVolume}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    const newS = { ...settings, musicVolume: val };
                    onUpdateSettings(newS);
                    audioManager.setVolumes(val, settings.sfxVolume, false);
                  }}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              {/* SFX Volume */}
              <div>
                <div className="flex justify-between text-xs font-bold text-slate-300 mb-1">
                  <span>SFX VOLUME</span>
                  <span>{Math.round(settings.sfxVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.sfxVolume}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    const newS = { ...settings, sfxVolume: val };
                    onUpdateSettings(newS);
                    audioManager.setVolumes(settings.musicVolume, val, false);
                  }}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              {/* Graphics Quality */}
              <div>
                <span className="text-xs font-bold text-slate-300 block mb-1.5">GRAPHICS QUALITY</span>
                <div className="grid grid-cols-3 gap-2">
                  {(['low', 'medium', 'high'] as const).map((q) => (
                    <button
                      key={q}
                      onClick={() => onUpdateSettings({ ...settings, quality: q })}
                      className={`py-1.5 text-xs font-bold rounded-lg uppercase transition cursor-pointer ${
                        settings.quality === q
                          ? 'bg-amber-400 text-slate-950 font-black shadow'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Show FPS */}
              <div className="flex justify-between items-center pt-2 border-t border-slate-800">
                <span className="text-xs font-bold text-slate-300">SHOW FPS COUNTER</span>
                <input
                  type="checkbox"
                  checked={settings.showFps}
                  onChange={(e) => onUpdateSettings({ ...settings, showFps: e.target.checked })}
                  className="w-4 h-4 accent-amber-400 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
