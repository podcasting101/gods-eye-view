import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BCAD_PARCELS_QUERY_URL,
  BIRDPOND_BASE_URL,
  BIRDPOND_LAYOUT_URL,
  HERO_BLOCK48_TRACTS,
  computeVisualBoxCenter,
  pointInRing,
} from './brazoriaCadPlugin.js';
import {
  REAL_ESTATE_SERVICE_CONFIG,
  BIRDPOND_BASE_URL as CONFIG_BIRDPOND_BASE_URL,
  BIRDPOND_LAYOUT_URL as CONFIG_BIRDPOND_LAYOUT_URL,
  HERO_BLOCK48_TRACTS as CONFIG_HERO_BLOCK48_TRACTS,
} from './realEstateConfig.js';

test('brazoriaCadPlugin exports match standalone realEstateConfig', () => {
  assert.equal(BCAD_PARCELS_QUERY_URL, REAL_ESTATE_SERVICE_CONFIG.queryUrl);
  assert.equal(BIRDPOND_BASE_URL, CONFIG_BIRDPOND_BASE_URL);
  assert.equal(BIRDPOND_LAYOUT_URL, CONFIG_BIRDPOND_LAYOUT_URL);
  assert.equal(HERO_BLOCK48_TRACTS, CONFIG_HERO_BLOCK48_TRACTS);
});

test('pointInRing correctly detects interior and exterior points', () => {
  // Simple square polygon: [0,0], [10,0], [10,10], [0,10]
  const square = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];

  assert.equal(pointInRing(5, 5, square), true);
  assert.equal(pointInRing(1, 1, square), true);
  assert.equal(pointInRing(15, 5, square), false);
  assert.equal(pointInRing(-2, 5, square), false);
});

test('computeVisualBoxCenter returns valid centroid and dimensions', () => {
  const square = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];

  const center = computeVisualBoxCenter(square);
  assert.ok(center);
  assert.equal(center.centerLon, 5);
  assert.equal(center.centerLat, 5);
  assert.equal(center.widthDeg, 10);
  assert.equal(center.heightDeg, 10);
});
