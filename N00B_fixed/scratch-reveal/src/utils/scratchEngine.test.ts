import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateClearedPercentage,
  shouldAutoReveal,
  distanceBetween,
  interpolatePoints,
  SCRATCH_TOOLS,
  FOIL_CONFIGS,
} from './scratchEngine';

test('distanceBetween computes accurate Euclidean distance', () => {
  assert.equal(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.equal(distanceBetween({ x: 10, y: 10 }, { x: 10, y: 10 }), 0);
  assert.equal(distanceBetween({ x: 0, y: 0 }, { x: 0, y: 12 }), 12);
});

test('interpolatePoints returns continuous intermediate coordinates', () => {
  const points = interpolatePoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
  assert.ok(points.length >= 10);
  assert.equal(points[0].x, 0);
  assert.equal(points[points.length - 1].x, 100);
});

test('calculateClearedPercentage accurately calculates transparent pixel ratio', () => {
  // Create mock 10x10 ImageData (100 pixels, 400 bytes)
  const width = 10;
  const height = 10;
  const data = new Uint8ClampedArray(width * height * 4);

  // Set all pixels to opaque (alpha = 255)
  for (let i = 0; i < data.length; i += 4) {
    data[i + 3] = 255;
  }

  const mockImageData = {
    data,
    width,
    height,
    colorSpace: 'srgb' as PredefinedColorSpace,
  } as ImageData;

  // Fully opaque: 0% cleared
  const initial = calculateClearedPercentage(mockImageData, 2, 30);
  assert.equal(initial, 0);

  // Clear half the pixels evenly
  for (let i = 0; i < data.length; i += 8) {
    data[i + 3] = 0;
  }

  const halfCleared = calculateClearedPercentage(mockImageData, 1, 30);
  assert.equal(halfCleared, 50);

  // Clear all pixels
  for (let i = 0; i < data.length; i += 4) {
    data[i + 3] = 0;
  }
  const fullyCleared = calculateClearedPercentage(mockImageData, 2, 30);
  assert.equal(fullyCleared, 100);
});

test('shouldAutoReveal triggers when user scratches a little past threshold', () => {
  assert.equal(shouldAutoReveal(5, 12), false);
  assert.equal(shouldAutoReveal(12, 12), true);
  assert.equal(shouldAutoReveal(25, 12), true);
});

test('SCRATCH_TOOLS configuration contains distinct tools', () => {
  assert.ok(SCRATCH_TOOLS.coin);
  assert.ok(SCRATCH_TOOLS.key);
  assert.ok(SCRATCH_TOOLS.guitar_pick);
  assert.ok(SCRATCH_TOOLS.eraser);
  assert.ok(SCRATCH_TOOLS.magic_wand);
  assert.equal(SCRATCH_TOOLS.key.radius < SCRATCH_TOOLS.eraser.radius, true);
});

test('FOIL_CONFIGS supports signature doodle and metallic styles', () => {
  assert.ok(FOIL_CONFIGS.doodle);
  assert.ok(FOIL_CONFIGS.silver);
  assert.ok(FOIL_CONFIGS.gold);
  assert.ok(FOIL_CONFIGS.holographic);
  assert.equal(FOIL_CONFIGS.doodle.badgeLabel, 'NOOB SIGNATURE');
});
