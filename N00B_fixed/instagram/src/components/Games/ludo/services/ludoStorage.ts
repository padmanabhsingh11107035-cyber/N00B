import {
  Achievement,
  GameMode,
  MatchHistoryItem,
  Mission,
  PlayerColor,
  UserStats,
} from '../types';
import { DICE_SKINS, LUDO_THEMES, TOKEN_SKINS } from '../themes/ludoThemes';

export interface UserProfile {
  id: string;
  username: string;
  avatar: string;
  level: number;
  xp: number;
  coins: number;
  equippedThemeId: string;
  equippedDiceSkinId: string;
  equippedTokenSkinId: string;
  unlockedThemeIds: string[];
  unlockedDiceSkinIds: string[];
  unlockedTokenSkinIds: string[];
  lastDailyClaimTimestamp: number;
  stats: UserStats;
}

const DEFAULT_PROFILE: UserProfile = {
  id: '',
  username: '',
  avatar: '',
  level: 1,
  xp: 150,
  coins: 1200,
  equippedThemeId: 'social_lounge',
  equippedDiceSkinId: 'default_crystal',
  equippedTokenSkinId: 'classic',
  unlockedThemeIds: ['social_lounge', 'monaco_gold'],
  unlockedDiceSkinIds: ['default_crystal'],
  unlockedTokenSkinIds: ['classic'],
  lastDailyClaimTimestamp: 0,
  stats: {
    gamesPlayed: 0,
    gamesWon: 0,
    classicWins: 0,
    quickWins: 0,
    teamWins: 0,
    tournamentWins: 0,
    tokensCaptured: 0,
    tokensHome: 0,
    bestWinStreak: 0,
    currentWinStreak: 0,
    totalXp: 150,
    coins: 1200,
    level: 1,
  },
};

const DEFAULT_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_win',
    title: 'First Blood',
    description: 'Win your very first NOOB Ludo match',
    icon: '🏆',
    progress: 0,
    maxProgress: 1,
    unlocked: false,
    rewardCoins: 200,
    rewardXp: 100,
    claimed: false,
  },
  {
    id: 'ten_wins',
    title: 'Ludo Apprentice',
    description: 'Achieve 10 total match victories',
    icon: '⚡',
    progress: 0,
    maxProgress: 10,
    unlocked: false,
    rewardCoins: 500,
    rewardXp: 250,
    claimed: false,
  },
  {
    id: 'fifty_wins',
    title: 'Ludo Veteran',
    description: 'Achieve 50 total match victories',
    icon: '🎖️',
    progress: 0,
    maxProgress: 50,
    unlocked: false,
    rewardCoins: 1500,
    rewardXp: 800,
    claimed: false,
  },
  {
    id: 'hundred_wins',
    title: 'Grandmaster NOOB',
    description: 'Achieve 100 total match victories',
    icon: '👑',
    progress: 0,
    maxProgress: 100,
    unlocked: false,
    rewardCoins: 5000,
    rewardXp: 2500,
    claimed: false,
  },
  {
    id: 'streak_5',
    title: 'On Fire',
    description: 'Maintain a 5-match winning streak',
    icon: '🔥',
    progress: 0,
    maxProgress: 5,
    unlocked: false,
    rewardCoins: 800,
    rewardXp: 400,
    claimed: false,
  },
  {
    id: 'streak_10',
    title: 'Unstoppable Legend',
    description: 'Maintain a 10-match winning streak',
    icon: '🌟',
    progress: 0,
    maxProgress: 10,
    unlocked: false,
    rewardCoins: 2500,
    rewardXp: 1200,
    claimed: false,
  },
  {
    id: 'comeback_king',
    title: 'Comeback King',
    description: 'Win a match after having a token captured',
    icon: '🛡️',
    progress: 0,
    maxProgress: 1,
    unlocked: false,
    rewardCoins: 400,
    rewardXp: 200,
    claimed: false,
  },
  {
    id: 'perfect_finish',
    title: 'Perfect Finish',
    description: 'Get all 4 tokens home without losing a single token',
    icon: '💎',
    progress: 0,
    maxProgress: 1,
    unlocked: false,
    rewardCoins: 1000,
    rewardXp: 500,
    claimed: false,
  },
  {
    id: 'team_player',
    title: 'Team Player',
    description: 'Win a 2 vs 2 Team Up match with your partner',
    icon: '🤝',
    progress: 0,
    maxProgress: 1,
    unlocked: false,
    rewardCoins: 600,
    rewardXp: 300,
    claimed: false,
  },
];

const DEFAULT_MISSIONS: Mission[] = [
  {
    id: 'm_play_matches',
    title: 'Battle Ready',
    description: 'Play 2 Ludo matches today',
    type: 'daily',
    progress: 0,
    target: 2,
    completed: false,
    rewardCoins: 150,
    rewardXp: 80,
    claimed: false,
  },
  {
    id: 'm_win_match',
    title: 'Daily Triumph',
    description: 'Win 1 match in any mode',
    type: 'daily',
    progress: 0,
    target: 1,
    completed: false,
    rewardCoins: 250,
    rewardXp: 120,
    claimed: false,
  },
  {
    id: 'm_capture_tokens',
    title: 'Hunter',
    description: 'Capture 5 opponent tokens',
    type: 'daily',
    progress: 0,
    target: 5,
    completed: false,
    rewardCoins: 300,
    rewardXp: 150,
    claimed: false,
  },
  {
    id: 'm_weekly_wins',
    title: 'Weekly Dominance',
    description: 'Win 5 matches this week',
    type: 'weekly',
    progress: 0,
    target: 5,
    completed: false,
    rewardCoins: 1000,
    rewardXp: 500,
    claimed: false,
  },
];

class LudoStorageService {
  private profile: UserProfile;
  private matchHistory: MatchHistoryItem[] = [];
  private achievements: Achievement[] = [];
  private missions: Mission[] = [];

  // Progress is stored per NOOB account (several accounts can share one browser), so nothing is
  // loaded until setActiveUser() says whose it is.
  private userId = '';

  constructor() {
    this.profile = { ...DEFAULT_PROFILE };
    this.achievements = [...DEFAULT_ACHIEVEMENTS];
    this.missions = [...DEFAULT_MISSIONS];
  }

  private key(name: string) {
    return `noob_ludo_${name}:${this.userId}`;
  }

  /**
   * Point the store at the signed-in NOOB account. Identity (name, picture) always comes from the
   * account itself; only game progress (coins, XP, skins, missions) is read from this device.
   */
  public setActiveUser(user: { id: string; username: string; avatar?: string }) {
    this.userId = user.id;
    this.profile = this.loadProfile();
    this.matchHistory = this.loadMatchHistory();
    this.achievements = this.loadAchievements();
    this.missions = this.loadMissions();
    this.profile = { ...this.profile, id: user.id, username: user.username, avatar: user.avatar || '' };
    this.saveProfile();
  }

  private loadProfile(): UserProfile {
    try {
      const data = localStorage.getItem(this.key('profile'));
      if (data) {
        const parsed = JSON.parse(data);
        const validTheme = LUDO_THEMES.some((t) => t.id === parsed.equippedThemeId);
        return {
          ...DEFAULT_PROFILE,
          ...parsed,
          equippedThemeId: validTheme ? parsed.equippedThemeId : DEFAULT_PROFILE.equippedThemeId,
        };
      }
    } catch {}
    return { ...DEFAULT_PROFILE };
  }

  private saveProfile() {
    try {
      localStorage.setItem(this.key('profile'), JSON.stringify(this.profile));
    } catch {}
  }

  private loadMatchHistory(): MatchHistoryItem[] {
    try {
      const data = localStorage.getItem(this.key('history'));
      if (data) {
        return JSON.parse(data);
      }
    } catch {}
    return [];
  }

  private saveMatchHistory() {
    try {
      localStorage.setItem(this.key('history'), JSON.stringify(this.matchHistory));
    } catch {}
  }

  private loadAchievements(): Achievement[] {
    try {
      const data = localStorage.getItem(this.key('achievements'));
      if (data) {
        const parsed = JSON.parse(data);
        return DEFAULT_ACHIEVEMENTS.map((def) => {
          const saved = parsed.find((p: Achievement) => p.id === def.id);
          return saved ? { ...def, ...saved } : def;
        });
      }
    } catch {}
    return [...DEFAULT_ACHIEVEMENTS];
  }

  private saveAchievements() {
    try {
      localStorage.setItem(this.key('achievements'), JSON.stringify(this.achievements));
    } catch {}
  }

  private loadMissions(): Mission[] {
    try {
      const data = localStorage.getItem(this.key('missions'));
      if (data) {
        const parsed = JSON.parse(data);
        return DEFAULT_MISSIONS.map((def) => {
          const saved = parsed.find((p: Mission) => p.id === def.id);
          return saved ? { ...def, ...saved } : def;
        });
      }
    } catch {}
    return [...DEFAULT_MISSIONS];
  }

  private saveMissions() {
    try {
      localStorage.setItem(this.key('missions'), JSON.stringify(this.missions));
    } catch {}
  }

  public getProfile(): UserProfile {
    return { ...this.profile };
  }

  public updateProfile(updates: Partial<UserProfile>) {
    this.profile = { ...this.profile, ...updates };
    this.saveProfile();
  }

  public getMatchHistory(): MatchHistoryItem[] {
    return [...this.matchHistory];
  }

  public getAchievements(): Achievement[] {
    return [...this.achievements];
  }

  public getMissions(): Mission[] {
    return [...this.missions];
  }

  /**
   * Process match completion and update all career progression
   */
  public recordMatchResult(data: {
    mode: GameMode;
    durationSeconds: number;
    rank: number;
    isWinner: boolean;
    tokensCaptured: number;
    tokensHome: number;
    players: { name: string; color: PlayerColor; rank?: number }[];
  }) {
    const isWin = data.rank === 1;

    // Calculate XP and Coin awards
    let xpEarned = 50 + data.tokensHome * 20 + data.tokensCaptured * 15;
    let coinsEarned = 30 + data.tokensHome * 15;

    if (isWin) {
      xpEarned += 150;
      coinsEarned += 200;
    }

    // Update stats
    const stats = this.profile.stats;
    stats.gamesPlayed += 1;
    stats.tokensCaptured += data.tokensCaptured;
    stats.tokensHome += data.tokensHome;
    stats.totalXp += xpEarned;
    this.profile.coins += coinsEarned;
    this.profile.xp += xpEarned;

    // Level formula: level = Math.floor(totalXp / 300) + 1
    const newLevel = Math.floor(this.profile.xp / 300) + 1;
    this.profile.level = newLevel;
    stats.level = newLevel;

    if (isWin) {
      stats.gamesWon += 1;
      stats.currentWinStreak += 1;
      if (stats.currentWinStreak > stats.bestWinStreak) {
        stats.bestWinStreak = stats.currentWinStreak;
      }

      if (data.mode === 'classic') stats.classicWins += 1;
      if (data.mode === 'quick') stats.quickWins += 1;
      if (data.mode === 'team_2v2') stats.teamWins += 1;
    } else {
      stats.currentWinStreak = 0;
    }

    // Add match history entry
    const historyItem: MatchHistoryItem = {
      id: 'match_' + Date.now(),
      mode: data.mode,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      durationSeconds: data.durationSeconds,
      players: data.players,
      result: isWin ? 'won' : 'lost',
      rank: data.rank,
      xpEarned,
      coinsEarned,
    };
    this.matchHistory.unshift(historyItem);
    if (this.matchHistory.length > 30) {
      this.matchHistory.pop();
    }

    // Update Missions progress
    this.missions.forEach((mission) => {
      if (mission.id === 'm_play_matches') {
        mission.progress = Math.min(mission.target, mission.progress + 1);
      }
      if (mission.id === 'm_win_match' && isWin) {
        mission.progress = Math.min(mission.target, mission.progress + 1);
      }
      if (mission.id === 'm_capture_tokens') {
        mission.progress = Math.min(mission.target, mission.progress + data.tokensCaptured);
      }
      if (mission.id === 'm_weekly_wins' && isWin) {
        mission.progress = Math.min(mission.target, mission.progress + 1);
      }
      if (mission.progress >= mission.target) {
        mission.completed = true;
      }
    });

    // Update Achievements progress
    this.achievements.forEach((ach) => {
      if (ach.id === 'first_win' && isWin) {
        ach.progress = 1;
        ach.unlocked = true;
      }
      if (ach.id === 'ten_wins') {
        ach.progress = Math.min(ach.maxProgress, stats.gamesWon);
        if (ach.progress >= ach.maxProgress) ach.unlocked = true;
      }
      if (ach.id === 'fifty_wins') {
        ach.progress = Math.min(ach.maxProgress, stats.gamesWon);
        if (ach.progress >= ach.maxProgress) ach.unlocked = true;
      }
      if (ach.id === 'hundred_wins') {
        ach.progress = Math.min(ach.maxProgress, stats.gamesWon);
        if (ach.progress >= ach.maxProgress) ach.unlocked = true;
      }
      if (ach.id === 'streak_5') {
        ach.progress = Math.min(ach.maxProgress, stats.currentWinStreak);
        if (ach.progress >= ach.maxProgress) ach.unlocked = true;
      }
      if (ach.id === 'streak_10') {
        ach.progress = Math.min(ach.maxProgress, stats.currentWinStreak);
        if (ach.progress >= ach.maxProgress) ach.unlocked = true;
      }
      if (ach.id === 'team_player' && isWin && data.mode === 'team_2v2') {
        ach.progress = 1;
        ach.unlocked = true;
      }
    });

    this.saveProfile();
    this.saveMatchHistory();
    this.saveMissions();
    this.saveAchievements();

    return { xpEarned, coinsEarned };
  }

  public claimDailyReward(): { claimed: boolean; coins: number; xp: number } {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    if (now - this.profile.lastDailyClaimTimestamp < oneDayMs) {
      return { claimed: false, coins: 0, xp: 0 };
    }

    const coinsReward = 200;
    const xpReward = 100;
    this.profile.coins += coinsReward;
    this.profile.xp += xpReward;
    this.profile.lastDailyClaimTimestamp = now;
    this.saveProfile();

    return { claimed: true, coins: coinsReward, xp: xpReward };
  }

  public claimMissionReward(missionId: string): boolean {
    const mission = this.missions.find((m) => m.id === missionId);
    if (!mission || !mission.completed || mission.claimed) return false;

    mission.claimed = true;
    this.profile.coins += mission.rewardCoins;
    this.profile.xp += mission.rewardXp;
    this.saveMissions();
    this.saveProfile();
    return true;
  }

  public claimAchievementReward(achId: string): boolean {
    const ach = this.achievements.find((a) => a.id === achId);
    if (!ach || !ach.unlocked || ach.claimed) return false;

    ach.claimed = true;
    this.profile.coins += ach.rewardCoins;
    this.profile.xp += ach.rewardXp;
    this.saveAchievements();
    this.saveProfile();
    return true;
  }

  public purchaseItem(type: 'theme' | 'dice' | 'token', itemId: string): boolean {
    let price = 0;

    if (type === 'theme') {
      const theme = LUDO_THEMES.find((t) => t.id === itemId);
      if (!theme || this.profile.unlockedThemeIds.includes(itemId)) return false;
      price = theme.price;
      if (this.profile.coins < price) return false;
      this.profile.coins -= price;
      this.profile.unlockedThemeIds.push(itemId);
      this.profile.equippedThemeId = itemId;
    } else if (type === 'dice') {
      const dice = DICE_SKINS.find((d) => d.id === itemId);
      if (!dice || this.profile.unlockedDiceSkinIds.includes(itemId)) return false;
      price = dice.price;
      if (this.profile.coins < price) return false;
      this.profile.coins -= price;
      this.profile.unlockedDiceSkinIds.push(itemId);
      this.profile.equippedDiceSkinId = itemId;
    } else if (type === 'token') {
      const token = TOKEN_SKINS.find((t) => t.id === itemId);
      if (!token || this.profile.unlockedTokenSkinIds.includes(itemId)) return false;
      price = token.price;
      if (this.profile.coins < price) return false;
      this.profile.coins -= price;
      this.profile.unlockedTokenSkinIds.push(itemId);
      this.profile.equippedTokenSkinId = itemId;
    }

    this.saveProfile();
    return true;
  }

  public equipItem(type: 'theme' | 'dice' | 'token', itemId: string): boolean {
    if (type === 'theme' && this.profile.unlockedThemeIds.includes(itemId)) {
      this.profile.equippedThemeId = itemId;
    } else if (type === 'dice' && this.profile.unlockedDiceSkinIds.includes(itemId)) {
      this.profile.equippedDiceSkinId = itemId;
    } else if (type === 'token' && this.profile.unlockedTokenSkinIds.includes(itemId)) {
      this.profile.equippedTokenSkinId = itemId;
    } else {
      return false;
    }
    this.saveProfile();
    return true;
  }
}

export const ludoStorage = new LudoStorageService();
