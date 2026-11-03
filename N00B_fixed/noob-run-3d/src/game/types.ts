export type GameState = 'menu' | 'intro' | 'countdown' | 'playing' | 'paused' | 'gameover';

export type Lane = -1 | 0 | 1; // -1: Left, 0: Center, 1: Right

export const LANE_WIDTH = 3.2;

export type PowerUpType = 'magnet' | 'shield' | 'multiplier' | 'boost' | 'jetpack';

export interface PowerUpActive {
  type: PowerUpType;
  duration: number;
  maxDuration: number;
}

export type TrainType = 
  | 'modern_metro' 
  | 'red_city' 
  | 'classic_rail' 
  | 'street_art' 
  | 'futuristic'
  | 'double_decker_passenger'
  | 'double_decker_goods';

export type ObstacleType = 
  | 'barricade_jump' 
  | 'low_overhead_slide' 
  | 'high_barrier' 
  | 'traffic_cones' 
  | 'signal_pole'
  | 'hazard_gate';

export type EnvironmentTheme = 
  | 'city_railway' 
  | 'subway_station' 
  | 'tunnel' 
  | 'elevated_bridge' 
  | 'maintenance_yard';

export interface PlayerStats {
  score: number;
  distance: number;
  coins: number;
  multiplier: number;
  trainsDodged: number;
  powerUpsUsed: number;
  comboCount: number;
  comboMultiplier: number;
  comboTimer: number;
  comboMaxTimer: number;
  lastComboAction?: string;
}

export interface ComboEvent {
  label: string;
  combo: number;
  multiplier: number;
  timestamp: number;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  target: number;
  current: number;
  rewardCoins: number;
  rewardXP: number;
  completed: boolean;
  type: 'coins' | 'distance' | 'score' | 'trains' | 'powerups' | 'slide' | 'jump';
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
}

export interface GameSettings {
  musicVolume: number;
  sfxVolume: number;
  quality: 'low' | 'medium' | 'high';
  vibration: boolean;
  showFps: boolean;
}

export interface CharacterModelDef {
  id: string;
  name: string;
  title: string;
  description: string;
  unlocked: boolean;
  price: number;
  icon: string;
}

export type WeatherType = 'clear' | 'light_rain' | 'misty_fog';

export interface WeatherInfo {
  type: WeatherType;
  name: string;
  icon: string;
  description: string;
}

export type IdleAnimationType =
  | 'default'
  | 'cyber_scan'
  | 'hiphop_groove'
  | 'ninja_kata'
  | 'athletic_stretch'
  | 'vapor_float';

export interface CharacterSkin {
  id: string;
  name: string;
  title?: string;
  description?: string;
  jacketColor: string;
  pantsColor: string;
  accentColor: string;
  hairColor: string;
  unlocked: boolean;
  price: number;
  idleAnimation: IdleAnimationType;
  idleBadge?: string;
}

export interface NoobUser {
  userId: string;
  username: string;
  profilePicture?: string;
  level: number;
  xp: number;
  noobCoins: number;
}

export interface NoobRunCallbacks {
  onGameStart?: () => void;
  onScoreUpdate?: (score: number, distance: number) => void;
  onGameOver?: (result: {
    score: number;
    distance: number;
    coins: number;
    isNewRecord: boolean;
    xpEarned: number;
  }) => void;
  onCoinsCollected?: (coins: number) => void;
  onExit?: () => void;
  onShare?: (stats: { score: number; distance: number; coins: number }) => void;
  onComboUpdate?: (combo: ComboEvent) => void;
  onWeatherUpdate?: (weather: WeatherInfo) => void;
  onChaseMessage?: (msg: string | null) => void;
}
