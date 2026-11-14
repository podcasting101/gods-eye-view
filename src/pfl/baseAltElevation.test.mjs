import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_GROUND_DATUM_M,
  ELEVATION_LIMITS,
  SNAP_GROUND_THRESHOLD_M,
  altToRailT,
  clampBaseAlt,
  computeEntityAltitudes,
  createElevationDragSession,
  formatElevMeters,
  railTToAlt,
  stepBaseAlt,
} from './baseAltElevation.js';

test('formatElevMeters formats altitudes with clean signs and ground description', () => {
  assert.equal(formatElevMeters(0), '+0.00m Ground');
  assert.equal(formatElevMeters(0.004), '+0.00m Ground');
  assert.equal(formatElevMeters(-0.003), '+0.00m Ground');
  assert.equal(formatElevMeters(2.4), '+2.40m');
  assert.equal(formatElevMeters(18.756), '+18.76m');
  assert.equal(formatElevMeters(-1.85), '-1.85m');
});

test('altToRailT and railTToAlt provide consistent piecewise rail mapping', () => {
  // Ground level 0.0m maps to 0.16
  const tZero = altToRailT(0.0);
  assert.ok(Math.abs(tZero - 0.16) < 1e-6);
  assert.ok(Math.abs(railTToAlt(0.16) - 0.0) < 1e-4);

  // Negative boundary -2.0m maps to 0.0
  assert.equal(altToRailT(-2.0), 0.0);
  assert.equal(railTToAlt(0.0), -2.0);

  // Human / fence 5.4m maps to 0.70
  const tMid = altToRailT(5.4);
  assert.ok(Math.abs(tMid - 0.70) < 1e-6);
  assert.ok(Math.abs(railTToAlt(0.70) - 5.4) < 1e-4);

  // Sky 60.0m maps to 1.00
  const tSky = altToRailT(60.0);
  assert.ok(Math.abs(tSky - 1.00) < 1e-6);
  assert.ok(Math.abs(railTToAlt(1.00) - 60.0) < 1e-4);

  // Invertibility test across positive elevations
  for (const alt of [0.5, 1.8, 3.2, 8.0, 15.0, 30.0, 50.0]) {
    const t = altToRailT(alt);
    const restored = railTToAlt(t);
    assert.ok(
      Math.abs(restored - alt) < 0.05,
      `Altitude ${alt} roundtrips to ${restored} (diff ${Math.abs(restored - alt)})`,
    );
  }
});

test('clampBaseAlt respects boundaries, snapping, and precision', () => {
  // Respects limits
  assert.equal(clampBaseAlt(-10.0), ELEVATION_LIMITS.min);
  assert.equal(clampBaseAlt(300.0), ELEVATION_LIMITS.max);

  // Snaps near-ground values within SNAP_GROUND_THRESHOLD_M
  assert.equal(clampBaseAlt(0.02), 0.0);
  assert.equal(clampBaseAlt(-0.03), 0.0);
  assert.equal(clampBaseAlt(0.05), 0.05);

  // Precision 2 decimals
  assert.equal(clampBaseAlt(1.2345), 1.23);
  assert.equal(clampBaseAlt(1.238), 1.24);
});

test('computeEntityAltitudes calculates relative and WGS84 datum heights correctly', () => {
  const alts = computeEntityAltitudes({
    baseAlt: 1.8,
    groundM: -17.5,
    origHeight: 2.2,
    scale: 1.0,
    stemLength: 0.7,
  });

  assert.equal(alts.baseAlt, 1.8);
  assert.equal(alts.topAlt, 4.0); // 1.8 + 2.2
  assert.equal(alts.tipAlt, 4.7); // 4.0 + 0.7
  assert.equal(alts.billboardAlt, 4.18); // 4.0 + 0.18
  assert.equal(alts.absoluteBaseAlt, -15.7); // -17.5 + 1.8
  assert.equal(alts.absoluteTopAlt, -13.5); // -17.5 + 4.0
});

test('createElevationDragSession computes smooth mouse Y delta movements', () => {
  const session = createElevationDragSession({
    targetId: 'lisa_cam1',
    startAlt: 2.0,
    startY: 500,
    pixelsPerMeter: 50.0, // 50px per meter
  });

  assert.equal(session.startAlt, 2.0);
  assert.equal(session.startY, 500);

  // Dragging upward by 100px (from 500 to 400) -> +2.0m -> nextAlt 4.0m
  const moveUp = session.computeCurrentAlt(400);
  assert.equal(moveUp.nextAlt, 4.0);
  assert.equal(moveUp.deltaAlt, 2.0);
  assert.equal(moveUp.formatted, '+4.00m');

  // Dragging downward by 100px (from 500 to 600) -> -2.0m -> nextAlt 0.0m (snapped to ground)
  const moveDown = session.computeCurrentAlt(600);
  assert.equal(moveDown.nextAlt, 0.0);
  assert.equal(moveDown.formatted, '+0.00m Ground');
});

test('stepBaseAlt increments and decrements cleanly', () => {
  assert.equal(stepBaseAlt(2.0, 0.1), 2.1);
  assert.equal(stepBaseAlt(2.0, -0.5), 1.5);
  assert.equal(stepBaseAlt(0.05, -0.04), 0.0);
});
