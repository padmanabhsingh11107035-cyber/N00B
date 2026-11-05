/**
 * Scratch Reveal: the core logic and calculations (pixel counting, smooth strokes, sounds, tools, foils)
 * Provides decoupled math, pixel calculation, sound synthesis, and tool configurations.
 */

export interface ScratchTool {
  id: string;
  name: string;
  iconName: string;
  description: string;
  radius: number;
  shape: 'round' | 'sharp' | 'brush' | 'square';
  soundPitch: number;
}

export const SCRATCH_TOOLS: Record<string, ScratchTool> = {
  coin: {
    id: 'coin',
    name: 'Lucky Coin',
    iconName: 'Coins',
    description: 'Classic heavy quarter with wide scratch grooves',
    radius: 22,
    shape: 'round',
    soundPitch: 800,
  },
  key: {
    id: 'key',
    name: 'Brass Car Key',
    iconName: 'Key',
    description: 'Ultra-precise sharp tip for delicate peeling',
    radius: 10,
    shape: 'sharp',
    soundPitch: 1400,
  },
  guitar_pick: {
    id: 'guitar_pick',
    name: 'Guitar Pick',
    iconName: 'Disc',
    description: 'Medium celluloid edge with silky glide',
    radius: 16,
    shape: 'round',
    soundPitch: 1050,
  },
  magic_wand: {
    id: 'magic_wand',
    name: 'Magic Wand',
    iconName: 'Wand2',
    description: 'Starlight sparkle scratch with glowing dust',
    radius: 28,
    shape: 'round',
    soundPitch: 1200,
  },
};

import type { FoilType } from './scratchData';
export type { FoilType };

export interface FoilStyleConfig {
  id: FoilType;
  name: string;
  badgeLabel: string;
  description: string;
  primaryColor: string;
  textColor: string;
  accentGlow: string;
}

export const FOIL_CONFIGS: Record<FoilType, FoilStyleConfig> = {
  doodle: {
    id: 'doodle',
    name: 'Noob Doodle Foil',
    badgeLabel: 'NOOB SIGNATURE',
    description: 'Chalkboard doodle pattern matching official theme',
    primaryColor: '#121214',
    textColor: '#ffffff',
    accentGlow: '#ffffff',
  },
  silver: {
    id: 'silver',
    name: 'Chrome Silver',
    badgeLabel: 'METALLIC',
    description: 'Sleek brushed silver foil with specular glint',
    primaryColor: '#9ca3af',
    textColor: '#000000',
    accentGlow: '#e5e7eb',
  },
  gold: {
    id: 'gold',
    name: '24K Gold Dust',
    badgeLabel: 'PREMIUM VIP',
    description: 'Luxurious champagne gold with rich metallic sheen',
    primaryColor: '#eab308',
    textColor: '#000000',
    accentGlow: '#fef08a',
  },
  holographic: {
    id: 'holographic',
    name: 'Cyber Hologram',
    badgeLabel: 'IRIDESCENT',
    description: 'Prismatic neon holographic rainbow shimmer',
    primaryColor: '#ec4899',
    textColor: '#ffffff',
    accentGlow: '#38bdf8',
  },
};

/**
 * Calculates percentage of pixels that have been cleared on a scratch canvas context.
 * Uses uniform grid sampling for high performance.
 */
export function calculateClearedPercentage(
  imageData: ImageData,
  sampleStep = 8,
  alphaThreshold = 30
): number {
  const { data, width, height } = imageData;
  if (!width || !height || data.length === 0) return 0;

  let totalSampled = 0;
  let clearedCount = 0;

  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const alphaIndex = (y * width + x) * 4 + 3;
      totalSampled++;
      if (data[alphaIndex] <= alphaThreshold) {
        clearedCount++;
      }
    }
  }

  if (totalSampled === 0) return 0;
  const percentage = Math.round((clearedCount / totalSampled) * 100);
  return Math.min(100, Math.max(0, percentage));
}

/**
 * Checks if a "scratch a little" gesture threshold is reached to trigger auto-complete reveal.
 * Default threshold is 12% (a few strokes across the card).
 */
export function shouldAutoReveal(clearedPercentage: number, threshold = 12): boolean {
  return clearedPercentage >= threshold;
}

/**
 * Calculates distance between two points for smooth scratch interpolation.
 */
export function distanceBetween(
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.hypot(dx, dy);
}

/**
 * Generates intermediate points between two positions so rapid dragging
 * doesn't leave gaps in the scratch line.
 */
export function interpolatePoints(
  from: { x: number; y: number },
  to: { x: number; y: number },
  step = 4
): Array<{ x: number; y: number }> {
  const dist = distanceBetween(from, to);
  if (dist === 0) return [from];

  const count = Math.max(1, Math.floor(dist / step));
  const points: Array<{ x: number; y: number }> = [];

  for (let i = 0; i <= count; i++) {
    const t = i / count;
    points.push({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    });
  }

  return points;
}

/**
 * Pure Web Audio synthesizer for tactile scratch card friction sound.
 */
class ScratchAudioEngine {
  private ctx: AudioContext | null = null;
  private noiseNode: AudioBufferSourceNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private gainNode: GainNode | null = null;
  private isScratching = false;

  private initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public startScratchSound(pitch = 800) {
    if (this.isScratching) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const bufferSize = this.ctx.sampleRate * 1.5;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        // High frequency friction scratch noise
        data[i] = (Math.random() * 2 - 1) * (0.8 + 0.2 * Math.sin(i * 0.05));
      }

      this.noiseNode = this.ctx.createBufferSource();
      this.noiseNode.buffer = buffer;
      this.noiseNode.loop = true;

      this.filterNode = this.ctx.createBiquadFilter();
      this.filterNode.type = 'bandpass';
      this.filterNode.frequency.value = pitch;
      this.filterNode.Q.value = 3.5;

      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.setValueAtTime(0.01, this.ctx.currentTime);
      this.gainNode.gain.linearRampToValueAtTime(0.18, this.ctx.currentTime + 0.03);

      this.noiseNode.connect(this.filterNode);
      this.filterNode.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);

      this.noiseNode.start();
      this.isScratching = true;
    } catch {
      // Audio not supported or blocked
    }
  }

  public updateScratchVelocity(velocity: number) {
    if (!this.isScratching || !this.filterNode || !this.ctx || !this.gainNode) return;
    const clampedVel = Math.min(60, Math.max(5, velocity));
    const targetFreq = 500 + clampedVel * 25;
    const targetGain = Math.min(0.25, 0.08 + clampedVel * 0.003);
    this.filterNode.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.05);
    this.gainNode.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.05);
  }

  public stopScratchSound() {
    if (!this.isScratching) return;
    try {
      if (this.gainNode && this.ctx) {
        this.gainNode.gain.setTargetAtTime(0.001, this.ctx.currentTime, 0.04);
        setTimeout(() => {
          if (this.noiseNode) {
            try {
              this.noiseNode.stop();
              this.noiseNode.disconnect();
            } catch {
              // ignore
            }
            this.noiseNode = null;
          }
        }, 50);
      }
    } catch {
      // ignore
    } finally {
      this.isScratching = false;
    }
  }

  public playChime(frequency = 587.33) {
    try {
      this.initContext();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(frequency * 1.5, this.ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.5);
    } catch {
      // ignore
    }
  }
}

export const scratchAudio = new ScratchAudioEngine();
