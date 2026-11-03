import { CharacterSkin, CharacterModelDef } from '../types';

export class SkinService {
  private static STORAGE_KEY = 'noob_run_skins';
  private static SELECTED_KEY = 'noob_run_selected_skin';
  private static MODELS_STORAGE_KEY = 'noob_run_characters';
  private static SELECTED_MODEL_KEY = 'noob_run_selected_character';

  public static getDefaultCharacterModels(): CharacterModelDef[] {
    return [
      {
        id: 'runner_ace',
        name: 'Ace',
        title: 'Subway Prodigy',
        description: 'Streetwear hoodie, snapback cap, DJ headphones & dual spraycan canisters.',
        unlocked: true,
        price: 0,
        icon: '🧢',
      },
      {
        id: 'cyber_nova',
        name: 'Nova',
        title: 'Cyberpunk Runner',
        description: 'Holographic optics visor, cybernetic exoskeleton arm & pulse core reactor.',
        unlocked: false,
        price: 500,
        icon: '⚡',
      },
      {
        id: 'track_blaze',
        name: 'Blaze',
        title: 'Sprint Legend',
        description: 'Aerodynamic track suit, sprint headband, marathon bib & hydration pack.',
        unlocked: false,
        price: 800,
        icon: '🏃',
      },
      {
        id: 'ninja_shadow',
        name: 'Shadow',
        title: 'Rooftop Shinobi',
        description: 'Stealth cowl mask, flowing headband ribbons, armguards & twin back katanas.',
        unlocked: false,
        price: 1200,
        icon: '🥷',
      },
      {
        id: 'aero_skyline',
        name: 'Skyline',
        title: 'Aero Ace Pilot',
        description: 'Aviator bomber jacket with fleece collar, brass flight goggles & jump pack.',
        unlocked: false,
        price: 1800,
        icon: '✈️',
      },
    ];
  }

  public static loadCharacterModels(): CharacterModelDef[] {
    try {
      const data = localStorage.getItem(this.MODELS_STORAGE_KEY);
      if (data) {
        const parsed: CharacterModelDef[] = JSON.parse(data);
        // Merge with defaults to ensure newly added characters exist
        const defaults = this.getDefaultCharacterModels();
        return defaults.map((def) => {
          const saved = parsed.find((p) => p.id === def.id);
          return saved ? { ...def, unlocked: saved.unlocked } : def;
        });
      }
    } catch {
      // ignore
    }
    return this.getDefaultCharacterModels();
  }

  public static saveCharacterModels(models: CharacterModelDef[]) {
    try {
      localStorage.setItem(this.MODELS_STORAGE_KEY, JSON.stringify(models));
    } catch {
      // ignore
    }
  }

  public static getSelectedCharacterId(): string {
    return localStorage.getItem(this.SELECTED_MODEL_KEY) || 'runner_ace';
  }

  public static setSelectedCharacterId(id: string) {
    localStorage.setItem(this.SELECTED_MODEL_KEY, id);
  }

  public static getDefaultSkins(): CharacterSkin[] {
    return [
      {
        id: 'skin_default',
        name: 'Sky Commuter',
        title: 'Original Runner',
        description: 'Classic azure hoodie and canvas kicks with relaxed subway trackside idle stance.',
        jacketColor: '#0284c7', // Cyan
        pantsColor: '#1e293b',  // Charcoal
        accentColor: '#facc15', // Yellow
        hairColor: '#3b1d11',   // Brunette
        unlocked: true,
        price: 0,
        idleAnimation: 'default',
        idleBadge: '👟 CASUAL CHILL',
      },
      // --- 3 SIGNATURE UNLOCKABLE CHARACTER SKINS WITH UNIQUE IDLE ANIMATION LOOPS ---
      {
        id: 'skin_cyber',
        name: 'Cyber Phantom',
        title: 'Neon Operative',
        description: 'Obsidian fiber suit with holographic wrist HUD scan & optic diagnostic idle loop.',
        jacketColor: '#7c3aed', // Neon Purple
        pantsColor: '#090d16',  // Deep Obsidian
        accentColor: '#06b6d4', // Electric Cyan
        hairColor: '#e2e8f0',   // Cyber Silver
        unlocked: false,
        price: 300,
        idleAnimation: 'cyber_scan',
        idleBadge: '⚡ HUD SCAN LOOP',
      },
      {
        id: 'skin_flare',
        name: 'Street Flare',
        title: 'B-Boy Graffiti King',
        description: 'Urban crimson streetwear with rhythmic hip-hop bounce & spraycan rattle idle loop.',
        jacketColor: '#dc2626', // Vibrant Crimson
        pantsColor: '#18181b',  // Pitch Black
        accentColor: '#f59e0b', // Solar Amber
        hairColor: '#171717',   // Jet Black
        unlocked: false,
        price: 600,
        idleAnimation: 'hiphop_groove',
        idleBadge: '🎨 B-BOY GROOVE LOOP',
      },
      {
        id: 'skin_ninja',
        name: 'Shadow Shinobi',
        title: 'Rooftop Assassin',
        description: 'Stealth shinobi robes with ancient martial arts kata, mudra seal & parry stance loop.',
        jacketColor: '#0f172a', // Stealth Slate
        pantsColor: '#022c22',  // Toxic Jade Shadow
        accentColor: '#10b981', // Neon Emerald
        hairColor: '#047857',   // Shinobi Green
        unlocked: false,
        price: 900,
        idleAnimation: 'ninja_kata',
        idleBadge: '🥷 SHINOBI KATA LOOP',
      },
      {
        id: 'skin_blaze',
        name: 'Apex Striker',
        title: 'Track Specialist',
        description: 'Aerodynamic carbon racing gear with dynamic runner warm-up stretch & sprint focus loop.',
        jacketColor: '#f97316', // Neon Orange
        pantsColor: '#0f172a',  // Midnight Slate
        accentColor: '#38bdf8', // Cyan
        hairColor: '#e0e7ff',   // Platinum
        unlocked: false,
        price: 1200,
        idleAnimation: 'athletic_stretch',
        idleBadge: '🏃 RUNNER STRETCH',
      },
      {
        id: 'skin_sunset',
        name: 'Sunset Vapor',
        title: 'Vaporwave Dreamer',
        description: 'Neon magenta and deep indigo gradient with floating dreamy head-bob sway.',
        jacketColor: '#ec4899', // Hot Pink
        pantsColor: '#312e81',  // Deep Indigo
        accentColor: '#38bdf8', // Sky
        hairColor: '#a855f7',   // Violet
        unlocked: false,
        price: 1400,
        idleAnimation: 'vapor_float',
        idleBadge: '🌴 VAPOR SWAY',
      },
    ];
  }

  public static loadSkins(): CharacterSkin[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) {
        const parsed: CharacterSkin[] = JSON.parse(data);
        const defaults = this.getDefaultSkins();
        // Merge with defaults to ensure all skin fields, new skins, and idle animations exist
        return defaults.map((def) => {
          const saved = parsed.find((p) => p.id === def.id);
          return saved ? { ...def, unlocked: saved.unlocked } : def;
        });
      }
    } catch {
      // ignore
    }
    return this.getDefaultSkins();
  }

  public static saveSkins(skins: CharacterSkin[]) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(skins));
    } catch {
      // ignore
    }
  }

  public static getSelectedSkinId(): string {
    return localStorage.getItem(this.SELECTED_KEY) || 'skin_default';
  }

  public static setSelectedSkinId(id: string) {
    localStorage.setItem(this.SELECTED_KEY, id);
  }
}
