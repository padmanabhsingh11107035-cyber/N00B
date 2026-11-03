import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameEngine } from './engine/GameEngine';
import { GameUI } from './ui/GameUI';
import {
  GameState,
  PlayerStats,
  PowerUpActive,
  GameSettings,
  CharacterSkin,
  WeatherInfo,
  NoobUser,
  NoobRunCallbacks,
  ComboEvent,
} from './types';
import { audioManager } from './audio/AudioManager';

export interface NoobRunGameProps extends NoobRunCallbacks {
  user?: NoobUser;
  className?: string;
}

export const NoobRunGame: React.FC<NoobRunGameProps> = ({
  user,
  className = '',
  onGameStart,
  onScoreUpdate,
  onGameOver,
  onCoinsCollected,
  onExit,
  onShare,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  // Synced React states for HUD
  const [gameState, setGameState] = useState<GameState>('menu');
  const [stats, setStats] = useState<PlayerStats>({
    score: 0,
    distance: 0,
    coins: 0,
    multiplier: 1,
    trainsDodged: 0,
    powerUpsUsed: 0,
    comboCount: 0,
    comboMultiplier: 1,
    comboTimer: 0,
    comboMaxTimer: 3.8,
  });
  const [lastCombo, setLastCombo] = useState<ComboEvent | null>(null);
  const [powerUps, setPowerUps] = useState<PowerUpActive[]>([]);
  const [bestScore, setBestScore] = useState(0);
  const [bestDistance, setBestDistance] = useState(0);
  const [totalCoins, setTotalCoins] = useState(0);
  const [fps, setFps] = useState(60);
  const [settings, setSettings] = useState<GameSettings>({
    musicVolume: 0.6,
    sfxVolume: 0.8,
    quality: 'high',
    vibration: true,
    showFps: true,
  });
  const [currentSkyTheme, setCurrentSkyTheme] = useState<{ name: string; badge: string; icon: string; timeOfDay?: string }>({
    name: 'Daylight Express',
    badge: 'BRIGHT SUNLIGHT',
    icon: '☀️',
    timeOfDay: 'day',
  });
  const [currentWeather, setCurrentWeather] = useState<WeatherInfo>({
    type: 'clear',
    name: 'Clear Skies',
    icon: '☀️',
    description: 'Bright visibility and high sunbeams',
  });
  const [chaseMessage, setChaseMessage] = useState<string | null>(null);

  // Mount Game Engine on canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new GameEngine(canvasRef.current, {
      onGameStart: () => onGameStart?.(),
      onScoreUpdate: (s, d) => onScoreUpdate?.(s, d),
      onGameOver: (result) => {
        setBestScore(engine.bestScore);
        setBestDistance(engine.bestDistance);
        setTotalCoins(engine.totalCoins);
        onGameOver?.(result);
      },
      onCoinsCollected: (c) => onCoinsCollected?.(c),
      onExit: () => onExit?.(),
      onShare: (s) => onShare?.(s),
      onWeatherUpdate: (w) => setCurrentWeather(w),
      onChaseMessage: (msg) => setChaseMessage(msg),
    });

    engine.onStateChange = (st) => setGameState(st);
    engine.onStatsUpdate = (newStats) => {
      setStats({ ...newStats });
      setFps(engine.fps);
    };
    engine.onPowerUpsUpdate = (puList) => setPowerUps([...puList]);
    engine.onSkyThemeChange = (theme) => setCurrentSkyTheme(theme);
    engine.onComboUpdate = (combo) => setLastCombo({ ...combo });

    setBestScore(engine.bestScore);
    setBestDistance(engine.bestDistance);
    setTotalCoins(engine.totalCoins);
    setSettings(engine.settings);

    engineRef.current = engine;

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Controls bindings
  const handleStartGame = useCallback(() => {
    engineRef.current?.startGame();
  }, []);

  const handlePauseGame = useCallback(() => {
    engineRef.current?.pauseGame();
  }, []);

  const handleResumeGame = useCallback(() => {
    engineRef.current?.resumeGame();
  }, []);

  const handleRestartGame = useCallback(() => {
    engineRef.current?.startGame();
  }, []);

  const handleSkipIntro = useCallback(() => {
    engineRef.current?.skipIntro();
  }, []);

  const handleMoveLeft = useCallback(() => {
    engineRef.current?.moveLeft();
  }, []);

  const handleMoveRight = useCallback(() => {
    engineRef.current?.moveRight();
  }, []);

  const handleJump = useCallback(() => {
    engineRef.current?.jump();
  }, []);

  const handleSlide = useCallback(() => {
    engineRef.current?.slide();
  }, []);

  const handleUpdateSettings = useCallback((newSettings: GameSettings) => {
    setSettings(newSettings);
    if (engineRef.current) {
      engineRef.current.settings = newSettings;
      engineRef.current.applyQualitySettings(newSettings.quality);
      engineRef.current.saveStorage();
    }
  }, []);

  const handleApplySkin = useCallback((skin: CharacterSkin) => {
    if (engineRef.current) {
      engineRef.current.character.applySkin(skin);
    }
  }, []);

  const handleSelectCharacter = useCallback((charId: string, skin?: CharacterSkin) => {
    if (engineRef.current) {
      engineRef.current.setCharacter(charId, skin);
    }
  }, []);

  const handleCoinsSpent = useCallback((amount: number) => {
    if (engineRef.current) {
      engineRef.current.totalCoins = Math.max(0, engineRef.current.totalCoins - amount);
      engineRef.current.saveStorage();
      setTotalCoins(engineRef.current.totalCoins);
    }
  }, []);

  const handleCycleWeather = useCallback(() => {
    engineRef.current?.cycleWeather();
  }, []);

  const handleExitGame = useCallback(() => {
    audioManager.stopMusic();
    onExit?.();
  }, [onExit]);

  return (
    <div className={`relative w-full h-full bg-slate-950 overflow-hidden select-none ${className}`}>
      {/* 3D WebGL Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block touch-none cursor-grab active:cursor-grabbing"
      />

      {/* Floating HUD & Menus Overlay */}
      <GameUI
        gameState={gameState}
        stats={stats}
        powerUps={powerUps}
        bestScore={bestScore}
        bestDistance={bestDistance}
        totalCoins={totalCoins}
        fps={fps}
        settings={settings}
        user={user}
        currentSkyTheme={currentSkyTheme}
        currentWeather={currentWeather}
        lastCombo={lastCombo}
        chaseMessage={chaseMessage}
        onSkipIntro={handleSkipIntro}
        onStartGame={handleStartGame}
        onPauseGame={handlePauseGame}
        onResumeGame={handleResumeGame}
        onRestartGame={handleRestartGame}
        onExitGame={handleExitGame}
        onMoveLeft={handleMoveLeft}
        onMoveRight={handleMoveRight}
        onJump={handleJump}
        onSlide={handleSlide}
        onUpdateSettings={handleUpdateSettings}
        onApplySkin={handleApplySkin}
        onSelectCharacter={handleSelectCharacter}
        onCoinsSpent={handleCoinsSpent}
        onCycleWeather={handleCycleWeather}
        onShareResult={onShare}
      />
    </div>
  );
};
