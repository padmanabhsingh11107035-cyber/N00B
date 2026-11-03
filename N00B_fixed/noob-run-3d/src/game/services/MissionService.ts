import { Mission, Achievement, PlayerStats } from '../types';

export class MissionService {
  private static STORAGE_KEY_MISSIONS = 'noob_run_missions';
  private static STORAGE_KEY_ACHIEVEMENTS = 'noob_run_achievements';

  public static getInitialMissions(): Mission[] {
    return [
      {
        id: 'm_coins_50',
        title: 'Coin Harvester',
        description: 'Collect 50 gold coins in a single run',
        target: 50,
        current: 0,
        rewardCoins: 150,
        rewardXP: 100,
        completed: false,
        type: 'coins',
      },
      {
        id: 'm_dist_1000',
        title: 'Track Sprinter',
        description: 'Run 1,000 meters down the railway',
        target: 1000,
        current: 0,
        rewardCoins: 250,
        rewardXP: 200,
        completed: false,
        type: 'distance',
      },
      {
        id: 'm_trains_5',
        title: 'Train Evader',
        description: 'Successfully dodge 5 oncoming trains and barriers',
        target: 5,
        current: 0,
        rewardCoins: 180,
        rewardXP: 150,
        completed: false,
        type: 'trains',
      },
      {
        id: 'm_powerups_2',
        title: 'Overcharged',
        description: 'Activate 2 power-ups in one run',
        target: 2,
        current: 0,
        rewardCoins: 200,
        rewardXP: 120,
        completed: false,
        type: 'powerups',
      },
      {
        id: 'm_dist_2500',
        title: 'Cross-Town Express',
        description: 'Reach a distance of 2,500 meters',
        target: 2500,
        current: 0,
        rewardCoins: 500,
        rewardXP: 400,
        completed: false,
        type: 'distance',
      },
      {
        id: 'm_score_20k',
        title: 'Score Crusher',
        description: 'Score over 20,000 points in one session',
        target: 20000,
        current: 0,
        rewardCoins: 400,
        rewardXP: 300,
        completed: false,
        type: 'score',
      },
    ];
  }

  public static getInitialAchievements(): Achievement[] {
    return [
      {
        id: 'ach_first_run',
        title: 'First Step',
        description: 'Complete your first run on the NOOB railway',
        icon: '👟',
        unlocked: false,
      },
      {
        id: 'ach_1000m',
        title: 'First 1,000 Meters',
        description: 'Cross the 1-kilometer distance mark',
        icon: '⚡',
        unlocked: false,
      },
      {
        id: 'ach_coin_king',
        title: 'Coin Collector',
        description: 'Amass 500 total coins in your career',
        icon: '💰',
        unlocked: false,
      },
      {
        id: 'ach_dodger',
        title: 'Train Dodger',
        description: 'Dodge over 30 hazards across all runs',
        icon: '🚆',
        unlocked: false,
      },
      {
        id: 'ach_power_master',
        title: 'Power-Up Expert',
        description: 'Use Jetpack, Magnet, and Shield power-ups',
        icon: '🚀',
        unlocked: false,
      },
      {
        id: 'ach_champion',
        title: 'High-Score Champion',
        description: 'Achieve a record score higher than 50,000',
        icon: '👑',
        unlocked: false,
      },
    ];
  }

  public static loadMissions(): Mission[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY_MISSIONS);
      if (data) return JSON.parse(data);
    } catch {
      // ignore
    }
    return this.getInitialMissions();
  }

  public static saveMissions(missions: Mission[]) {
    try {
      localStorage.setItem(this.STORAGE_KEY_MISSIONS, JSON.stringify(missions));
    } catch {
      // ignore
    }
  }

  public static loadAchievements(): Achievement[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY_ACHIEVEMENTS);
      if (data) return JSON.parse(data);
    } catch {
      // ignore
    }
    return this.getInitialAchievements();
  }

  public static saveAchievements(achievements: Achievement[]) {
    try {
      localStorage.setItem(this.STORAGE_KEY_ACHIEVEMENTS, JSON.stringify(achievements));
    } catch {
      // ignore
    }
  }

  /**
   * Check stats against missions and achievements after a run
   */
  public static processRunResults(
    stats: PlayerStats,
    totalCoins: number,
    missions: Mission[],
    achievements: Achievement[]
  ): {
    updatedMissions: Mission[];
    updatedAchievements: Achievement[];
    newCompletedMissions: Mission[];
    newUnlockedAchievements: Achievement[];
    bonusCoins: number;
    bonusXP: number;
  } {
    let bonusCoins = 0;
    let bonusXP = 0;
    const newCompletedMissions: Mission[] = [];
    const newUnlockedAchievements: Achievement[] = [];

    // Check Missions
    const updatedMissions = missions.map((m) => {
      if (m.completed) return m;

      let value = 0;
      switch (m.type) {
        case 'coins':
          value = stats.coins;
          break;
        case 'distance':
          value = stats.distance;
          break;
        case 'score':
          value = stats.score;
          break;
        case 'trains':
          value = stats.trainsDodged;
          break;
        case 'powerups':
          value = stats.powerUpsUsed;
          break;
      }

      const newCurrent = Math.max(m.current, value);
      if (newCurrent >= m.target) {
        bonusCoins += m.rewardCoins;
        bonusXP += m.rewardXP;
        newCompletedMissions.push({ ...m, current: m.target, completed: true });
        return { ...m, current: m.target, completed: true };
      }

      return { ...m, current: newCurrent };
    });

    // Check Achievements
    const updatedAchievements = achievements.map((a) => {
      if (a.unlocked) return a;
      let shouldUnlock = false;

      if (a.id === 'ach_first_run') shouldUnlock = true;
      if (a.id === 'ach_1000m' && stats.distance >= 1000) shouldUnlock = true;
      if (a.id === 'ach_coin_king' && totalCoins >= 500) shouldUnlock = true;
      if (a.id === 'ach_dodger' && stats.trainsDodged >= 10) shouldUnlock = true;
      if (a.id === 'ach_power_master' && stats.powerUpsUsed >= 3) shouldUnlock = true;
      if (a.id === 'ach_champion' && stats.score >= 50000) shouldUnlock = true;

      if (shouldUnlock) {
        newUnlockedAchievements.push({
          ...a,
          unlocked: true,
          unlockedAt: new Date().toLocaleDateString(),
        });
        return {
          ...a,
          unlocked: true,
          unlockedAt: new Date().toLocaleDateString(),
        };
      }
      return a;
    });

    this.saveMissions(updatedMissions);
    this.saveAchievements(updatedAchievements);

    return {
      updatedMissions,
      updatedAchievements,
      newCompletedMissions,
      newUnlockedAchievements,
      bonusCoins,
      bonusXP,
    };
  }
}
