import * as THREE from 'three'
import { STAGE_FLOORS } from '../../server/helix-rules.mjs'
import { levelOf, stageOf } from './level'

export type Theme = {
  id: string
  sky: string
  skyLow: string
  fog: string
  safe: string
  safeAlt: string
  pillar: string
  pillarBand: string
  accent: string
}

/** The palettes; the next one comes in each time a stage is cleared. */
export const THEMES: Theme[] = [
  { id: 'tangerine', sky: '#3a2c7a', skyLow: '#1d1745', fog: '#2a2160', safe: '#ffb347', safeAlt: '#ffc76e', pillar: '#5b47b8', pillarBand: '#7662d6', accent: '#ffd35c' },
  { id: 'mint', sky: '#0f4a5c', skyLow: '#08232e', fog: '#0c3947', safe: '#3fe0ae', safeAlt: '#76f2cb', pillar: '#1d6f86', pillarBand: '#2a90a8', accent: '#7ef9ff' },
  { id: 'grape', sky: '#3a1760', skyLow: '#170828', fog: '#2a1047', safe: '#b18cff', safeAlt: '#cdb2ff', pillar: '#57308f', pillarBand: '#7447b0', accent: '#ff9bf5' },
  { id: 'lemon', sky: '#123a73', skyLow: '#08183a', fog: '#0f2d5c', safe: '#ffe45c', safeAlt: '#fff29a', pillar: '#2b58ad', pillarBand: '#4677cf', accent: '#8fd3ff' },
  { id: 'lagoon', sky: '#1b1a3d', skyLow: '#0a0a1c', fog: '#16153a', safe: '#4fc3ff', safeAlt: '#8cdcff', pillar: '#a93d6b', pillarBand: '#c95a88', accent: '#ffb3c8' },
  { id: 'aurora', sky: '#0f0f24', skyLow: '#040410', fog: '#0c0c20', safe: '#ffd35c', safeAlt: '#ffe79a', pillar: '#2d2d78', pillarBand: '#4545a3', accent: '#9effa0' },
  { id: 'rose', sky: '#2b1d63', skyLow: '#120a30', fog: '#201552', safe: '#ff7fd0', safeAlt: '#ffa9e2', pillar: '#6a3aa8', pillarBand: '#8b57cf', accent: '#fff08a' },
  { id: 'lime', sky: '#0f3d2c', skyLow: '#051a12', fog: '#0b2e21', safe: '#a6ec3c', safeAlt: '#c8f77c', pillar: '#1f7c4d', pillarBand: '#30a263', accent: '#ffe66b' },
  { id: 'cobalt', sky: '#4a2412', skyLow: '#1d0d06', fog: '#391b0d', safe: '#6f8bff', safeAlt: '#9fb3ff', pillar: '#8c4a1f', pillarBand: '#b3662f', accent: '#ffd9a0' },
  { id: 'frost', sky: '#0d3a45', skyLow: '#051a20', fog: '#0a2d36', safe: '#cfd8e8', safeAlt: '#eef2fa', pillar: '#2c7f8f', pillarBand: '#43a3b5', accent: '#a8f3ff' },
  { id: 'sand', sky: '#103b55', skyLow: '#071b29', fog: '#0c2d42', safe: '#e9c985', safeAlt: '#f6e2b2', pillar: '#2a6f98', pillarBand: '#3f92bd', accent: '#7ef0d0' },
]

/**
 * Palette of a floor. The six stages of a level carry on through the palettes, so a new level starts on a new colour
 * and every one of the colours turns up before the first repeats.
 */
export function themeIndexOf(floor: number): number {
  return ((levelOf(floor) - 1) * STAGE_FLOORS.length + stageOf(floor)) % THEMES.length
}
export const themeOf = (floor: number): Theme => THEMES[themeIndexOf(floor)]

export const DANGER = '#ff2d55'
export const DANGER_DARK = '#9e0f33'
export const BALL = '#fff7e8'

const c = new THREE.Color()
export function color(hex: string): THREE.Color {
  return c.set(hex).clone()
}
