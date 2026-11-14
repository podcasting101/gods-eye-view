/**
 * BaseAlt Z-Elevation Controls and Altitude Mathematics for God's Eye View / PFL.
 *
 * Provides standardized altitude formatting, perceptual non-linear Z-rail mapping,
 * ellipsoidal datum calculations, clamping, zero-ground snapping, and drag-session
 * state mathematics for 3D Cesium objects, Neo4j graph nodes, and camera platforms.
 */

export const DEFAULT_GROUND_DATUM_M = -17.5; // Surveyed WGS84 ellipsoid fallback for Sweeny / Bird Pond
export const SNAP_GROUND_THRESHOLD_M = 0.04;

export const ELEVATION_LIMITS = Object.freeze({
  min: -5.0,
  max: 250.0,
  stepFine: 0.1,
  stepCoarse: 0.5,
  skyThreshold: 60.0,
});

/**
 * Format altitude in meters with explicit sign and ground descriptor.
 * Examples: '+0.00m Ground', '+2.40m', '-1.20m'.
 */
export function formatElevMeters(alt) {
  const num = Number(alt) || 0.0;
  if (Math.abs(num) < 0.01) {
    return '+0.00m Ground';
  }
  const prefix = num > 0 ? '+' : '';
  return `${prefix}${num.toFixed(2)}m`;
}

/**
 * Maps an altitude in meters to a normalized [0..1] position along the perceptual Z-rail.
 *
 * Perceptual piecewise calibration:
 *   alt <= -2.0m        -> 0.0
 *   -2.0m < alt <= 0.0m -> normalized [0.00 .. 0.16]
 *   0.0m < alt <= 5.4m  -> normalized [0.16 .. 0.70] (human & fence height zone)
 *   alt > 5.4m          -> normalized [0.70 .. 1.00] (quadratic expansion up to 60m+ sky)
 */
export function altToRailT(alt) {
  const a = Number(alt) || 0.0;
  if (a <= -2.0) return 0.0;
  if (a <= 0.0) {
    return ((a + 2.0) / 2.0) * 0.16;
  }
  if (a <= 5.4) {
    return 0.16 + (a / 5.4) * 0.54;
  }
  const over = Math.max(0.0, a - 5.4);
  const frac = Math.min(1.0, Math.sqrt(over / 54.6));
  return 0.70 + frac * 0.30;
}

/**
 * Inverse mapping: converts normalized rail position t [0..1] back to altitude in meters.
 */
export function railTToAlt(t) {
  const c = Math.max(0.0, Math.min(1.0, Number(t) || 0.0));
  if (c <= 0.16) {
    return -2.0 + (c / 0.16) * 2.0;
  }
  if (c <= 0.70) {
    return ((c - 0.16) / 0.54) * 5.4;
  }
  const u = (c - 0.70) / 0.30;
  return 5.4 + u * u * 54.6;
}

/**
 * Clamps baseAlt within boundaries, snaps near-zero values to 0.0, and rounds to 2 decimal places.
 */
export function clampBaseAlt(alt, {
  min = ELEVATION_LIMITS.min,
  max = ELEVATION_LIMITS.max,
  snapZeroThreshold = SNAP_GROUND_THRESHOLD_M,
} = {}) {
  let val = Number(alt) || 0.0;
  val = Math.max(min, Math.min(max, val));
  if (snapZeroThreshold && Math.abs(val) < snapZeroThreshold) {
    val = 0.0;
  }
  return Math.round(val * 100) / 100;
}

/**
 * Computes world elevation datums for an entity with baseAlt relative to terrain/ellipsoid.
 */
export function computeEntityAltitudes({
  baseAlt = 0.0,
  groundM = DEFAULT_GROUND_DATUM_M,
  origHeight = 2.0,
  scale = 1.0,
  stemLength = 0.65,
} = {}) {
  const clampedBase = clampBaseAlt(baseAlt);
  const heightM = (Number(origHeight) || 2.0) * (Number(scale) || 1.0);
  const topAlt = clampedBase + heightM;
  const tipAlt = topAlt + (Number(stemLength) || 0.65);
  const billboardAlt = topAlt + 0.18;

  return {
    baseAlt: clampedBase,
    topAlt: Math.round(topAlt * 100) / 100,
    tipAlt: Math.round(tipAlt * 100) / 100,
    billboardAlt: Math.round(billboardAlt * 100) / 100,
    absoluteBaseAlt: Math.round((groundM + clampedBase) * 100) / 100,
    absoluteTopAlt: Math.round((groundM + topAlt) * 100) / 100,
  };
}

/**
 * Creates an elevation drag session state tracker for 3D Gizmo arrows or sticky Z mouse drags.
 */
export function createElevationDragSession({
  targetId,
  startAlt = 0.0,
  startY = 0.0,
  pixelsPerMeter = 42.0,
  min = ELEVATION_LIMITS.min,
  max = ELEVATION_LIMITS.max,
  snapZeroThreshold = SNAP_GROUND_THRESHOLD_M,
} = {}) {
  const initialAlt = clampBaseAlt(startAlt, { min, max, snapZeroThreshold: 0 });
  const startScreenY = Number(startY) || 0.0;
  const pxScale = Math.max(1.0, Number(pixelsPerMeter) || 42.0);

  return {
    targetId,
    startAlt: initialAlt,
    startY: startScreenY,
    computeCurrentAlt(currentScreenY) {
      const deltaY = startScreenY - Number(currentScreenY || 0.0);
      const deltaAlt = deltaY / pxScale;
      const rawAlt = initialAlt + deltaAlt;
      const nextAlt = clampBaseAlt(rawAlt, { min, max, snapZeroThreshold });
      return {
        nextAlt,
        deltaAlt: Math.round((nextAlt - initialAlt) * 100) / 100,
        formatted: formatElevMeters(nextAlt),
      };
    },
  };
}

/**
 * Steps altitude by an incremental delta (fine or coarse).
 */
export function stepBaseAlt(currentAlt, delta, options = {}) {
  const cur = Number(currentAlt) || 0.0;
  const step = Number(delta) || 0.0;
  return clampBaseAlt(cur + step, options);
}
