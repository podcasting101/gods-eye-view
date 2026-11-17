import * as Cesium from 'cesium';
import {
  governorRequestRender,
  holdContinuousRender,
  releaseContinuousRender,
} from '../renderGovernor.js';
import { PFL_ENTITY_TAXONOMY } from './neo4jPersonalLayer.js';

/**
 * Bilawal Sidhu-style 4D OSINT Launch, Re-Entry & Mechazilla Catch Watch Theater
 * for SpaceX Starship Flight 15 (Starlink Group 31-2, Ship 42 "DON'T PANIC S42").
 *
 * Strictly modular inside `src/pfl/` so upstream `bilawalsidhu/gods-eye-view`
 * upgrades merge cleanly AND replicates straight to `elitespyworlds.com`.
 * Zero Cesium `Label` usage (100% `<canvas>` billboards per `noCesiumLabels.test.mjs`).
 */

const METERS_PER_DEG_LAT = 110790;
const METERS_PER_DEG_LON_STARBASE =
  111320 * Math.cos((25.99677 * Math.PI) / 180);

export const STARSHIP_FLIGHT15_EVENT = Object.freeze({
  id: 'event-starship-flight-15-catch',
  missionName: 'SpaceX Starship Flight 15 · Starlink Group 31-2 (Ship 42)',
  shortTitle: 'STARSHIP FLIGHT 15 · MECHAZILLA CATCH',
  qualifier: 'EVENT',
  taxonomyId: 21,
  subtype: 'milestone',
  liftoffIso: '2026-11-13T22:47:36Z',
  catchTargetIso: '2026-11-14T15:17:00-06:00',
  catchTargetUtcMs: Date.parse('2026-11-14T21:17:00Z'),
  starbasePad2: Object.freeze({ lat: 25.99677, lon: -97.15799, altM: 8.0 }),
  booster22Splashdown: Object.freeze({ lat: 25.942, lon: -96.785, altM: 0.0 }),
  liverpoolNode: Object.freeze({
    lat: 29.24752,
    lon: -95.23144,
    groundM: -26.19,
  }),
  birdPondGate: Object.freeze({ lat: 29.1387, lon: -95.80486, groundM: -17.5 }),
  streams: Object.freeze([
    Object.freeze({
      id: 'nsf-live',
      label: 'NASASpaceflight Live',
      embedUrl: 'https://www.youtube.com/embed/dl4O6RqbvOs?autoplay=0&rel=0',
      watchUrl: 'https://www.youtube.com/watch?v=dl4O6RqbvOs',
      cameraNote: 'Starbase Multi-Cam + Telemetry Commentary',
    }),
    Object.freeze({
      id: 'starbase-feed-2',
      label: 'Flight 15 Feed #2',
      embedUrl: 'https://www.youtube.com/embed/QlR1agMLyMk?autoplay=0&rel=0',
      watchUrl: 'https://www.youtube.com/watch?v=QlR1agMLyMk',
      cameraNote: 'Pad 2 / Boca Chica Tracking Cam',
    }),
    Object.freeze({
      id: 'labpadre-hub',
      label: 'LabPadre Starbase Cams',
      embedUrl: null,
      watchUrl: 'https://www.youtube.com/@LabPadre/streams',
      cameraNote: '24/7 Rover Cam · Nerdle Cam · Sapphire Tower Pad 2',
    }),
    Object.freeze({
      id: 'spacex-x',
      label: 'SpaceX Official (X)',
      embedUrl: null,
      watchUrl: 'https://x.com/i/broadcasts/2brajgZlOKRMka',
      cameraNote:
        'Onboard Ship 42 Starlink Plasma Views + Flight Director Audio',
    }),
  ]),
  swarmRoster: Object.freeze([
    'Paul Prime',
    'Harry (@harry)',
    'Lisa Muse (@lisa-muse)',
    'Lisa Holmes (@lisa)',
    'Friday (@friday)',
  ]),
});

/** Right-side horizon tower in the 14-frame composite (Pad 1 / OLT-1 / Q123524133, 146 m). */
export const STARBASE_PAD1_TOWER = Object.freeze({
  lat: 25.99617,
  lon: -97.15444,
  altM: 8.0,
  heightM: 146,
});

/**
 * Triangulated 3D camera pose solved from the Boca Chica marshland composite
 * (`starship-catch-14frame.jpg`): 2,109 m (1.31 mi) WSW along Highway 4 / tidal flats
 * looking ENE (heading 66.73°, pitch +14.78°) with Pad 2 on left & Pad 1 on right.
 */
export const STARBASE_MARSH_CAM_POSE = Object.freeze({
  id: 'starbase-marsh-cam-pose',
  name: 'Boca Chica Tidal Flats / Hwy 4 Telephoto Vantage (14-Frame Composite)',
  lat: 25.9899,
  lon: -97.17764,
  altM: 3.5,
  headingDeg: 66.73,
  pitchDeg: 14.78,
  rollDeg: 0,
  fovDeg: 32,
  vFovDeg: 33.65,
  distanceToPad2M: 2109,
  photoUrl: '/gev-intel/starship-catch-14frame.jpg',
  markingPhotoUrl: '/gev-intel/starship-s42-marking.jpg',
  modelUrl: '/models/starship_s42.glb',
});

/**
 * 14 photogrammetrically calibrated 3D keyframes matching the Boca Chica composite
 * (`< 0.5 px` back-projection residual across 682×1024 frame):
 * Frame 1 horizontal bellyflop (1,066 m) -> Frames 5-6 Raptor ignition ->
 * Frames 7-10 flip & over-rotation -> Frames 11-13 lateral braking flare ->
 * Frame 14 caught in Pad 2 chopsticks (127 m center).
 */
export const SHIP42_CATCH_14_FRAMES = Object.freeze([
  Object.freeze({
    frame: 1,
    tSec: 0.0,
    lat: 25.99897,
    lon: -97.1613,
    altM: 1066,
    headingDeg: 156.7,
    pitchDeg: 3,
    rollDeg: 0,
    throttle: 0.0,
    gimbalDeg: 0,
    phase: 'Frame 1 · Horizontal Bellyflop Freefall (1,066 m)',
  }),
  Object.freeze({
    frame: 2,
    tSec: 1.4,
    lat: 25.99887,
    lon: -97.16109,
    altM: 996,
    headingDeg: 156.7,
    pitchDeg: 2.5,
    rollDeg: 0,
    throttle: 0.0,
    gimbalDeg: 0,
    phase: 'Frame 2 · Terminal Glide Descent (996 m)',
  }),
  Object.freeze({
    frame: 3,
    tSec: 2.8,
    lat: 25.99877,
    lon: -97.16086,
    altM: 925,
    headingDeg: 156.7,
    pitchDeg: 3,
    rollDeg: 0,
    throttle: 0.0,
    gimbalDeg: 0,
    phase: 'Frame 3 · Subsonic Flap Authority (925 m)',
  }),
  Object.freeze({
    frame: 4,
    tSec: 4.2,
    lat: 25.99867,
    lon: -97.16063,
    altM: 852,
    headingDeg: 156.7,
    pitchDeg: 2.5,
    rollDeg: 0,
    throttle: 0.0,
    gimbalDeg: 0,
    phase: 'Frame 4 · Pre-Burn Bellyflop Target Track (852 m)',
  }),
  Object.freeze({
    frame: 5,
    tSec: 5.5,
    lat: 25.99857,
    lon: -97.1604,
    altM: 779,
    headingDeg: 156.7,
    pitchDeg: 3,
    rollDeg: 0,
    throttle: 0.65,
    gimbalDeg: 6,
    phase: 'Frame 5 · Raptor Pre-Ignition Spark (779 m)',
  }),
  Object.freeze({
    frame: 6,
    tSec: 6.7,
    lat: 25.99847,
    lon: -97.16016,
    altM: 702,
    headingDeg: 156.7,
    pitchDeg: 3,
    rollDeg: 0,
    throttle: 0.92,
    gimbalDeg: 10,
    phase: 'Frame 6 · Center Raptor Plume Spool-Up (702 m)',
  }),
  Object.freeze({
    frame: 7,
    tSec: 7.9,
    lat: 25.9983,
    lon: -97.15988,
    altM: 625,
    headingDeg: 156.7,
    pitchDeg: 7,
    rollDeg: 0,
    throttle: 1.0,
    gimbalDeg: 15,
    phase: 'Frame 7 · Flip Maneuver Initiation (625 m · 7°)',
  }),
  Object.freeze({
    frame: 8,
    tSec: 9.0,
    lat: 25.998,
    lon: -97.15955,
    altM: 549,
    headingDeg: 156.7,
    pitchDeg: 26.5,
    rollDeg: 0,
    throttle: 1.0,
    gimbalDeg: 14,
    phase: 'Frame 8 · High-Rate Pitch-Up (549 m · 26.5°)',
  }),
  Object.freeze({
    frame: 9,
    tSec: 10.1,
    lat: 25.99759,
    lon: -97.15918,
    altM: 479,
    headingDeg: 156.7,
    pitchDeg: 61.5,
    rollDeg: 0,
    throttle: 0.96,
    gimbalDeg: 10,
    phase: 'Frame 9 · Vertical Swing Transition (479 m · 61.5°)',
  }),
  Object.freeze({
    frame: 10,
    tSec: 11.2,
    lat: 25.99715,
    lon: -97.15883,
    altM: 419,
    headingDeg: 156.7,
    pitchDeg: 99,
    rollDeg: 0,
    throttle: 0.88,
    gimbalDeg: -8,
    phase: 'Frame 10 · Vertical Rotation & Thrust Peak (419 m)',
  }),
  Object.freeze({
    frame: 11,
    tSec: 12.2,
    lat: 25.99678,
    lon: -97.15852,
    altM: 367,
    headingDeg: 156.7,
    pitchDeg: 119,
    rollDeg: 0,
    throttle: 0.84,
    gimbalDeg: -14,
    phase: 'Frame 11 · Crossrange Braking Arc (367 m · 119°)',
  }),
  Object.freeze({
    frame: 12,
    tSec: 13.3,
    lat: 25.99633,
    lon: -97.15808,
    altM: 277,
    headingDeg: 156.7,
    pitchDeg: 120,
    rollDeg: 0,
    throttle: 0.8,
    gimbalDeg: -12,
    phase: 'Frame 12 · Lateral Translation Flare (277 m · 120°)',
  }),
  Object.freeze({
    frame: 13,
    tSec: 14.5,
    lat: 25.99628,
    lon: -97.15784,
    altM: 193,
    headingDeg: 156.7,
    pitchDeg: 102,
    rollDeg: 0,
    throttle: 0.65,
    gimbalDeg: -6,
    phase: 'Frame 13 · Final Vertical Slide into Pad 2 Arms (193 m)',
  }),
  Object.freeze({
    frame: 14,
    tSec: 16.0,
    lat: 25.99656,
    lon: -97.15781,
    altM: 127,
    headingDeg: 156.7,
    pitchDeg: 90,
    rollDeg: 0,
    throttle: 0.0,
    gimbalDeg: 0,
    phase: 'Frame 14 · MECHAZILLA PAD 2 CATCH · PIN LOCKED (127 m)',
  }),
]);

/**
 * Ship 42 4D Re-entry & Mechazilla Catch Waypoints (Entry Interface -> Chopsticks).
 * Progress `t` in [0, 1] maps from T-19m Entry Interface (115 km) to T-00:00 Catch (110 m).
 */
export const SHIP42_REENTRY_WAYPOINTS = Object.freeze([
  Object.freeze({
    t: 0.0,
    lon: -104.35,
    lat: 23.15,
    altM: 115000,
    speedKmh: 26800,
    mach: 24.8,
    phase: 'Entry Interface (Pacific / Durango Mexico · 115 km)',
  }),
  Object.freeze({
    t: 0.24,
    lon: -101.65,
    lat: 24.45,
    altM: 76000,
    speedKmh: 24100,
    mach: 22.1,
    phase: 'Peak Plasma Heating (Starlink Live Views · 76 km)',
  }),
  Object.freeze({
    t: 0.48,
    lon: -99.35,
    lat: 25.32,
    altM: 52000,
    speedKmh: 14600,
    mach: 13.5,
    phase: 'Hypersonic Cross-Range Bank over Nuevo Leon (52 km)',
  }),
  Object.freeze({
    t: 0.7,
    lon: -97.82,
    lat: 25.84,
    altM: 24500,
    speedKmh: 3400,
    mach: 3.1,
    phase: 'Rio Grande Sonic Boom & Upper-Flap Aero Control (24.5 km)',
  }),
  Object.freeze({
    t: 0.86,
    lon: -97.24,
    lat: 25.982,
    altM: 4800,
    speedKmh: 330,
    mach: 0.3,
    phase: 'Subsonic Belly-Flop Descent over Boca Chica (4.8 km)',
  }),
  Object.freeze({
    t: 0.95,
    lon: -97.1615,
    lat: 25.9962,
    altM: 680,
    speedKmh: 165,
    mach: 0.14,
    phase: 'Raptor Landing Relight & Belly-Flop Vertical Flip (680 m)',
  }),
  Object.freeze({
    t: 1.0,
    lon: -97.15799,
    lat: 25.99677,
    altM: 112,
    speedKmh: 0,
    mach: 0.0,
    phase: 'Mechazilla Chopstick Tower Catch at Pad 2 (112 m)',
  }),
]);

export const PAD2_ASCENT_WAYPOINTS = Object.freeze([
  Object.freeze({ lon: -97.15799, lat: 25.99677, altM: 25 }),
  Object.freeze({ lon: -97.11, lat: 25.992, altM: 8500 }),
  Object.freeze({ lon: -96.98, lat: 25.978, altM: 32000 }),
  Object.freeze({ lon: -96.82, lat: 25.96, altM: 69500 }),
]);

export const BOOSTER22_ABORT_WAYPOINTS = Object.freeze([
  Object.freeze({ lon: -96.82, lat: 25.96, altM: 69500 }),
  Object.freeze({ lon: -96.86, lat: 25.955, altM: 78000 }),
  Object.freeze({ lon: -96.83, lat: 25.948, altM: 28000 }),
  Object.freeze({ lon: -96.795, lat: 25.944, altM: 3200 }),
  Object.freeze({ lon: -96.785, lat: 25.942, altM: 0 }),
]);

/**
 * Formats milliseconds delta to `T-HH:MM:SS` (before target) or `T+HH:MM:SS` (after target).
 */
export function formatEventCountdown(
  nowMs = Date.now(),
  targetMs = STARSHIP_FLIGHT15_EVENT.catchTargetUtcMs,
) {
  const diffMs = targetMs - nowMs;
  const prefix = diffMs >= 0 ? 'T-' : 'T+';
  const totalSec = Math.floor(Math.abs(diffMs) / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return {
    prefix,
    diffMs,
    formatted: `${prefix}${pad(hrs)}:${pad(mins)}:${pad(secs)}`,
    isComplete: diffMs <= 0,
  };
}

/**
 * Linearly interpolates Ship 42 position & telemetry along `SHIP42_REENTRY_WAYPOINTS`.
 */
export function interpolateShip42State(progress = 0.95) {
  const p = Math.max(0, Math.min(1, Number(progress) || 0));
  const pts = SHIP42_REENTRY_WAYPOINTS;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (p >= a.t && p <= b.t) {
      const u = b.t === a.t ? 0 : (p - a.t) / (b.t - a.t);
      return {
        progress: p,
        lon: a.lon + (b.lon - a.lon) * u,
        lat: a.lat + (b.lat - a.lat) * u,
        altM: a.altM + (b.altM - a.altM) * u,
        speedKmh: Math.round(a.speedKmh + (b.speedKmh - a.speedKmh) * u),
        mach: Number((a.mach + (b.mach - a.mach) * u).toFixed(1)),
        phase: u < 0.5 ? a.phase : b.phase,
      };
    }
  }
  const last = pts[pts.length - 1];
  return { ...last, progress: 1 };
}

/**
 * Smoothly interpolates Ship 42 across the 14 calibrated terminal catch frames (`u` in [0, 1]).
 */
export function interpolateCatch14Frame(u = 0) {
  const clamped = Math.max(0, Math.min(1, Number(u) || 0));
  const frames = SHIP42_CATCH_14_FRAMES;
  const fScaled = clamped * (frames.length - 1);
  const idx = Math.min(frames.length - 2, Math.floor(fScaled));
  const frac = fScaled - idx;
  const a = frames[idx];
  const b = frames[idx + 1];
  const lerp = (x, y) => x + (y - x) * frac;
  const dt = Math.max(0.1, b.tSec - a.tSec);
  const vSpeedMs = (b.altM - a.altM) / dt;
  const dEast = (b.lon - a.lon) * METERS_PER_DEG_LON_STARBASE;
  const dNorth = (b.lat - a.lat) * METERS_PER_DEG_LAT;
  const hSpeedMs = Math.hypot(dEast, dNorth) / dt;

  return {
    u: clamped,
    frameFloat: 1 + fScaled,
    frameNearest: Math.round(1 + fScaled),
    tSec: Number(lerp(a.tSec, b.tSec).toFixed(2)),
    lat: lerp(a.lat, b.lat),
    lon: lerp(a.lon, b.lon),
    altM: lerp(a.altM, b.altM),
    headingDeg: lerp(a.headingDeg, b.headingDeg),
    pitchDeg: lerp(a.pitchDeg, b.pitchDeg),
    rollDeg: lerp(a.rollDeg, b.rollDeg),
    throttle: lerp(a.throttle, b.throttle),
    gimbalDeg: lerp(a.gimbalDeg, b.gimbalDeg),
    vSpeedMs: Number(vSpeedMs.toFixed(1)),
    hSpeedMs: Number(hSpeedMs.toFixed(1)),
    phase: frac < 0.5 ? a.phase : b.phase,
  };
}

/**
 * Local ENU offset (meters: East, North, Up) from `origin` to `pt`.
 */
export function starbaseEnuOffset(pt, origin = STARBASE_MARSH_CAM_POSE) {
  const e = ((Number(pt?.lon) || 0) - origin.lon) * METERS_PER_DEG_LON_STARBASE;
  const n = ((Number(pt?.lat) || 0) - origin.lat) * METERS_PER_DEG_LAT;
  const u = (Number(pt?.altM) || 0) - origin.altM;
  return { e, n, u };
}

/**
 * Projects a 3D WGS84 point or local ENU offset through the pinhole camera defined by `camPose`.
 * Returns screen coordinates `{ x, y, depth, inView }` for a `widthPx x heightPx` viewport.
 */
export function projectStarbasePoint(
  pt,
  camPose = STARBASE_MARSH_CAM_POSE,
  widthPx = 682,
  heightPx = 1024,
) {
  const { e, n, u } = starbaseEnuOffset(pt, camPose);
  return projectEnuToCamera({ e, n, u }, camPose, widthPx, heightPx);
}

function projectEnuToCamera({ e, n, u }, camPose, widthPx, heightPx) {
  const hdg = ((camPose.headingDeg ?? 16.5) * Math.PI) / 180;
  const ptch = ((camPose.pitchDeg ?? 14.5) * Math.PI) / 180;
  const vFov = ((camPose.vFovDeg ?? camPose.fovDeg ?? 33.3) * Math.PI) / 180;
  const focalPx = (heightPx * 0.5) / Math.tan(vFov * 0.5);

  // Camera forward, right, up unit vectors in ENU
  const fx0 = Math.sin(hdg);
  const fy0 = Math.cos(hdg);
  const rx = Math.cos(hdg);
  const ry = -Math.sin(hdg);

  const cosP = Math.cos(ptch);
  const sinP = Math.sin(ptch);
  const fwd = [fx0 * cosP, fy0 * cosP, sinP];
  const right = [rx, ry, 0];
  const camUp = [-fx0 * sinP, -fy0 * sinP, cosP];

  const xc = e * right[0] + n * right[1] + u * right[2];
  const yc = e * camUp[0] + n * camUp[1] + u * camUp[2];
  const zc = e * fwd[0] + n * fwd[1] + u * fwd[2];

  if (zc <= 1.0) {
    return {
      x: widthPx * 0.5,
      y: heightPx * 0.5,
      depth: zc,
      focalPx,
      inView: false,
    };
  }

  const x = widthPx * 0.5 + (focalPx * xc) / zc;
  const y = heightPx * 0.5 - (focalPx * yc) / zc;
  return {
    x,
    y,
    depth: zc,
    focalPx,
    inView: x >= -200 && x <= widthPx + 200 && y >= -200 && y <= heightPx + 200,
  };
}

/**
 * Converts compass azimuth + nose-up pitch + roll to Cesium `HeadingPitchRoll`.
 * Cesium Entity glTF axes place nose along +Z_gltf -> +X_cesium, so heading = az - 90 deg.
 */
export function starshipCesiumHpr(
  headingDeg = 106,
  pitchDeg = 90,
  rollDeg = 0,
) {
  return new Cesium.HeadingPitchRoll(
    Cesium.Math.toRadians(headingDeg - 90),
    Cesium.Math.toRadians(pitchDeg),
    Cesium.Math.toRadians(rollDeg),
  );
}

/**
 * Transforms a Starship body-local point `(forwardM, portM, dorsalM)` into ENU offset
 * relative to vehicle center given compass `headingDeg` & `pitchDeg`.
 */
function shipLocalToEnu({ forwardM, portM, dorsalM }, headingDeg, pitchDeg) {
  const h = ((headingDeg - 90) * Math.PI) / 180;
  const p = (pitchDeg * Math.PI) / 180;
  // Local +X = forward, +Y = port, +Z = dorsal -> match Cesium HPR rotation
  const cosP = Math.cos(p);
  const sinP = Math.sin(p);
  // Pitch rotation around +Y by -p raises +X toward +Z:
  const x1 = forwardM * cosP - dorsalM * sinP;
  const y1 = portM;
  const z1 = forwardM * sinP + dorsalM * cosP;

  // Heading rotation around +Z by -h (clockwise from East=+X):
  const cosH = Math.cos(h);
  const sinH = Math.sin(h);
  const e = x1 * cosH + y1 * sinH;
  const n = -x1 * sinH + y1 * cosH;
  const u = z1;
  return { e, n, u };
}

function makeCalloutCanvas(tag, title, sub, borderHex) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 360;
  c.height = 80;
  const ctx = c.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = 'rgba(9, 13, 24, 0.90)';
  ctx.beginPath();
  ctx.roundRect(4, 4, 352, 72, 12);
  ctx.fill();

  ctx.strokeStyle = borderHex || '#f97316';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.roundRect(4, 4, 352, 72, 12);
  ctx.stroke();

  ctx.fillStyle = borderHex || '#f97316';
  ctx.font = '800 14px "JetBrains Mono", monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(tag, 14, 12);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 18px "Inter", system-ui, sans-serif';
  ctx.fillText(String(title).slice(0, 30), 14, 31);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '500 12px "JetBrains Mono", monospace';
  ctx.fillText(String(sub).slice(0, 42), 14, 54);
  return c;
}

/**
 * Generates an interactive 3D wireframe + shaded Starship S42 + Enhanced Weather
 * simulation renderer calibrated to `STARBASE_MARSH_CAM_POSE`.
 */
function createMarshCanvasRenderer(canvas, getStateSnapshot) {
  const W = 682;
  const H = 1024;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Pre-build 3D Starship wireframe + hull ring topology (50m long, 4.5m radius)
  const hullStations = [-25, -20, -14, -7, 0, 5.2, 9, 14, 19, 23, 25];
  const shipRadiusAt = (z) => {
    if (z <= 9) return 4.5;
    if (z >= 25) return 0.1;
    const u = (z - 9) / 16;
    return 4.5 * Math.pow(Math.max(0, Math.cos(u * Math.PI * 0.5)), 0.85);
  };

  // Pre-seed deterministic storm cloud puffs & coastal wind particles
  const cloudBands = [];
  for (let i = 0; i < 36; i++) {
    const seed = Math.sin(i * 12.9898 + 4.14) * 43758.5453;
    const f1 = seed - Math.floor(seed);
    const f2 = seed * 1.73 - Math.floor(seed * 1.73);
    const f3 = seed * 3.17 - Math.floor(seed * 3.17);
    cloudBands.push({
      x: f1 * (W + 260) - 130,
      y: 35 + f2 * (H * 0.78),
      rx: 130 + f3 * 220,
      ry: 36 + f1 * 68,
      speed: 7 + f2 * 14,
      shade: f3,
    });
  }

  const rainMotes = [];
  for (let i = 0; i < 95; i++) {
    const s = Math.sin(i * 78.233) * 19341.7;
    const a = s - Math.floor(s);
    const b = s * 2.13 - Math.floor(s * 2.13);
    rainMotes.push({
      x: a * W,
      y: b * H,
      len: 10 + a * 18,
      speedY: 160 + b * 180,
      speedX: -48 - a * 40,
      alpha: 0.08 + b * 0.16,
    });
  }

  let refPhotoImg = null;
  if (typeof Image !== 'undefined') {
    refPhotoImg = new Image();
    refPhotoImg.src = STARBASE_MARSH_CAM_POSE.photoUrl;
  }

  function projEnu(e, n, u) {
    return projectEnuToCamera({ e, n, u }, STARBASE_MARSH_CAM_POSE, W, H);
  }

  function projWorld(lat, lon, altM) {
    return projectStarbasePoint(
      { lat, lon, altM },
      STARBASE_MARSH_CAM_POSE,
      W,
      H,
    );
  }

  function drawTowerLattice(towerGeo, chopstickState, shipCatchPt) {
    const base = towerGeo.altM ?? 8;
    const h = towerGeo.heightM ?? 146;
    const hw = 6.2; // 12.4m tower spine width
    const bEnu = starbaseEnuOffset({
      lat: towerGeo.lat,
      lon: towerGeo.lon,
      altM: base,
    });
    const tEnu = starbaseEnuOffset({
      lat: towerGeo.lat,
      lon: towerGeo.lon,
      altM: base + h,
    });

    const bl = projEnu(bEnu.e - hw, bEnu.n, bEnu.u);
    const br = projEnu(bEnu.e + hw, bEnu.n, bEnu.u);
    const tl = projEnu(tEnu.e - hw, tEnu.n, tEnu.u);
    const tr = projEnu(tEnu.e + hw, tEnu.n, tEnu.u);

    ctx.save();
    // Tower silhouette core
    ctx.fillStyle = 'rgba(28, 33, 40, 0.88)';
    ctx.beginPath();
    ctx.moveTo(bl.x, bl.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(tl.x, tl.y);
    ctx.closePath();
    ctx.fill();

    // Truss diagonal wireframe bracing
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.65)';
    ctx.lineWidth = 1.25;
    ctx.stroke();
    const bays = 12;
    ctx.beginPath();
    for (let i = 0; i < bays; i++) {
      const f0 = i / bays;
      const f1 = (i + 1) / bays;
      const lx0 = bl.x + (tl.x - bl.x) * f0;
      const ly0 = bl.y + (tl.y - bl.y) * f0;
      const rx0 = br.x + (tr.x - br.x) * f0;
      const ry0 = br.y + (tr.y - br.y) * f0;
      const lx1 = bl.x + (tl.x - bl.x) * f1;
      const ly1 = bl.y + (tl.y - bl.y) * f1;
      const rx1 = br.x + (tr.x - br.x) * f1;
      const ry1 = br.y + (tr.y - br.y) * f1;
      ctx.moveTo(lx0, ly0);
      ctx.lineTo(rx1, ry1);
      ctx.moveTo(rx0, ry0);
      ctx.lineTo(lx1, ly1);
      ctx.moveTo(lx1, ly1);
      ctx.lineTo(rx1, ry1);
    }
    ctx.stroke();

    // Mechazilla chopsticks extending right (+East) on Pad 2
    if (chopstickState != null) {
      const armAlt = base + h * 0.78;
      const openSpreadM = 3.5 + (1 - chopstickState) * 9.5;
      const armLenM = 28;
      const hinge = projEnu(
        bEnu.e + hw,
        bEnu.n,
        armAlt - STARBASE_MARSH_CAM_POSE.altM,
      );
      const tipN = projEnu(
        bEnu.e + hw + armLenM,
        bEnu.n + openSpreadM,
        armAlt - 2 - STARBASE_MARSH_CAM_POSE.altM,
      );
      const tipS = projEnu(
        bEnu.e + hw + armLenM,
        bEnu.n - openSpreadM,
        armAlt - 2 - STARBASE_MARSH_CAM_POSE.altM,
      );

      ctx.strokeStyle = chopstickState > 0.8 ? '#f97316' : '#cbd5e1';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(hinge.x, hinge.y - 3);
      ctx.lineTo(tipN.x, tipN.y);
      ctx.moveTo(hinge.x, hinge.y + 3);
      ctx.lineTo(tipS.x, tipS.y);
      ctx.stroke();

      // Tower Pad 2 beacon label on HUD
      ctx.fillStyle = 'rgba(249, 115, 22, 0.92)';
      ctx.font = '700 10px "JetBrains Mono", monospace';
      ctx.fillText('PAD 2 · OLT-B', tl.x - 12, tl.y - 8);
    } else {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
      ctx.font = '700 10px "JetBrains Mono", monospace';
      ctx.fillText('PAD 1 · OLT-A', tl.x - 10, tl.y - 8);
    }
    ctx.restore();
  }

  function drawStarship3D(state, opts) {
    const {
      wireframe = true,
      ghostAlpha = 1.0,
      showDecal = true,
      showPlume = true,
    } = opts;
    const shipEnu = starbaseEnuOffset(state);
    const { headingDeg, pitchDeg, throttle = 0, gimbalDeg = 0 } = state;

    const pVertex = (fwd, port, dors) => {
      const off = shipLocalToEnu(
        { forwardM: fwd, portM: port, dorsalM: dors },
        headingDeg,
        pitchDeg,
      );
      return projEnu(shipEnu.e + off.e, shipEnu.n + off.n, shipEnu.u + off.u);
    };

    ctx.save();
    ctx.globalAlpha = ghostAlpha;

    // 1. Dynamic Raptor Exhaust Plume & Mach Shock Diamonds
    if (showPlume && throttle > 0.04) {
      const plumeLen = 14 + throttle * 56;
      const gRad = (gimbalDeg * Math.PI) / 180;
      const tailPt = pVertex(-26.5, 0, 0);
      const tipPt = pVertex(
        -26.5 - plumeLen * Math.cos(gRad),
        0,
        plumeLen * Math.sin(gRad),
      );
      const perpX = -(tipPt.y - tailPt.y);
      const perpY = tipPt.x - tailPt.x;
      const pNorm = Math.max(1, Math.hypot(perpX, perpY));
      const spread =
        (3.5 + throttle * 6.5) *
        (tailPt.focalPx / Math.max(400, tailPt.depth)) *
        0.45;
      const ux = (perpX / pNorm) * spread;
      const uy = (perpY / pNorm) * spread;

      const grad = ctx.createLinearGradient(
        tailPt.x,
        tailPt.y,
        tipPt.x,
        tipPt.y,
      );
      grad.addColorStop(0.0, 'rgba(255, 250, 228, 0.96)');
      grad.addColorStop(0.28, 'rgba(255, 178, 86, 0.88)');
      grad.addColorStop(0.65, 'rgba(249, 115, 22, 0.42)');
      grad.addColorStop(1.0, 'rgba(234, 88, 12, 0.0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(tailPt.x - ux * 0.55, tailPt.y - uy * 0.55);
      ctx.lineTo(tipPt.x - ux * 0.12, tipPt.y - uy * 0.12);
      ctx.lineTo(tipPt.x + ux * 0.12, tipPt.y + uy * 0.12);
      ctx.lineTo(tailPt.x + ux * 0.55, tailPt.y + uy * 0.55);
      ctx.closePath();
      ctx.fill();

      // Core Mach shock-diamond bright jet
      ctx.strokeStyle = 'rgba(255, 245, 210, 0.92)';
      ctx.lineWidth = 2.0 + throttle * 1.4;
      ctx.beginPath();
      ctx.moveTo(tailPt.x, tailPt.y);
      ctx.lineTo(
        tailPt.x + (tipPt.x - tailPt.x) * 0.55,
        tailPt.y + (tipPt.y - tailPt.y) * 0.55,
      );
      ctx.stroke();
    }

    // 2. Two-tone solid GLB projection (Dorsal Stainless Steel + Windward Black TPS Belly)
    for (let i = 0; i < hullStations.length - 1; i++) {
      const z0 = hullStations[i];
      const z1 = hullStations[i + 1];
      const r0 = shipRadiusAt(z0);
      const r1 = shipRadiusAt(z1);

      // Leeward stainless upper half (dorsal 0 -> +r)
      const s00 = pVertex(z0, 0, 0);
      const s10 = pVertex(z1, 0, 0);
      const s11 = pVertex(z1, 0, r1);
      const s01 = pVertex(z0, 0, r0);
      ctx.fillStyle =
        ghostAlpha < 0.9 ? 'rgba(148, 163, 184, 0.25)' : '#c4ccd6';
      ctx.beginPath();
      ctx.moveTo(s00.x, s00.y);
      ctx.lineTo(s10.x, s10.y);
      ctx.lineTo(s11.x, s11.y);
      ctx.lineTo(s01.x, s01.y);
      ctx.closePath();
      ctx.fill();

      // Windward black heat-shield lower half (ventral 0 -> -r)
      const b01 = pVertex(z0, 0, -r0);
      const b11 = pVertex(z1, 0, -r1);
      ctx.fillStyle = ghostAlpha < 0.9 ? 'rgba(15, 23, 42, 0.42)' : '#17191f';
      ctx.beginPath();
      ctx.moveTo(s00.x, s00.y);
      ctx.lineTo(s10.x, s10.y);
      ctx.lineTo(b11.x, b11.y);
      ctx.lineTo(b01.x, b01.y);
      ctx.closePath();
      ctx.fill();
    }

    // Flaps (visible profile along dorsal & ventral edges)
    const flapShapes = [
      // Aft flap
      [
        pVertex(-24.5, 0, 0.4),
        pVertex(-13.8, 0, 0.4),
        pVertex(-15.5, -5.5, 4.9),
        pVertex(-24.2, -5.5, 4.9),
      ],
      // Fwd flap
      [
        pVertex(11.4, 0, 0.4),
        pVertex(20.0, 0, 0.2),
        pVertex(18.2, -3.5, 3.6),
        pVertex(11.8, -3.5, 3.8),
      ],
    ];
    for (const poly of flapShapes) {
      ctx.fillStyle = ghostAlpha < 0.9 ? 'rgba(15, 23, 42, 0.4)' : '#1f232c';
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      for (let k = 1; k < poly.length; k++) ctx.lineTo(poly[k].x, poly[k].y);
      ctx.closePath();
      ctx.fill();
      if (wireframe) {
        ctx.strokeStyle =
          ghostAlpha < 0.9
            ? 'rgba(56, 189, 248, 0.28)'
            : 'rgba(56, 189, 248, 0.9)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // 3. Geodesic GLB Wireframe Structural Grid Overlay
    if (wireframe) {
      ctx.strokeStyle =
        ghostAlpha < 0.9
          ? 'rgba(56, 189, 248, 0.34)'
          : 'rgba(56, 189, 248, 0.92)';
      ctx.lineWidth = ghostAlpha < 0.9 ? 0.85 : 1.25;
      ctx.beginPath();

      // Longitudinal stringer lines at 3 angles across visible flank
      for (const ang of [
        -Math.PI * 0.48,
        -Math.PI * 0.2,
        0,
        Math.PI * 0.22,
        Math.PI * 0.48,
      ]) {
        for (let i = 0; i < hullStations.length; i++) {
          const z = hullStations[i];
          const r = shipRadiusAt(z);
          const pt = pVertex(z, -r * Math.cos(ang), r * Math.sin(ang));
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
      }

      // Circumferential bulkhead rings
      for (const z of hullStations.slice(0, -1)) {
        const r = shipRadiusAt(z);
        for (let s = 0; s <= 6; s++) {
          const ang = -Math.PI * 0.5 + (Math.PI * s) / 6;
          const pt = pVertex(z, -r * Math.cos(ang), r * Math.sin(ang));
          if (s === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
      }
      ctx.stroke();
    }

    // 4. "DON'T PANIC S42" fairing badge when full-opacity active ship
    if (showDecal && ghostAlpha >= 0.95) {
      const dPt = pVertex(2.5, -4.7, 2.2);
      const angleRad = Math.atan2(
        pVertex(10, -4.6, 0).y - pVertex(0, -4.6, 0).y,
        pVertex(10, -4.6, 0).x - pVertex(0, -4.6, 0).x,
      );
      ctx.save();
      ctx.translate(dPt.x, dPt.y);
      ctx.rotate(angleRad);
      ctx.fillStyle = 'rgba(248, 250, 252, 0.95)';
      ctx.font = '800 9px "JetBrains Mono", monospace';
      ctx.fillText('S42', -8, 2);
      ctx.restore();
    }

    ctx.restore();
  }

  function renderFrame(timeSec, simState, options = {}) {
    const {
      weatherIntensity = 0.85,
      wireframe = true,
      showGhosts = true,
      photoOpacity = 0.0,
    } = options;

    ctx.clearRect(0, 0, W, H);

    // 1. Coastal Overcast Sky Gradient + Storm Moisture
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0.0, '#78808a');
    skyGrad.addColorStop(0.45, '#9ea7b1');
    skyGrad.addColorStop(0.78, '#c5cbd1');
    skyGrad.addColorStop(0.93, '#a4abb0');
    skyGrad.addColorStop(1.0, '#2a331d');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // 2. Animated Volumetric Overcast Stratus Clouds + Raptor Under-Lit Glow
    const shipPt = projWorld(simState.lat, simState.lon, simState.altM);
    const plumeGlow = Math.max(0, Math.min(1, simState.throttle || 0));

    ctx.save();
    for (const c of cloudBands) {
      const cx = ((c.x + timeSec * c.speed) % (W + 320)) - 160;
      const cy = c.y;
      const sy = c.ry / Math.max(1, c.rx);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, sy);
      const cg = ctx.createRadialGradient(
        0,
        -c.rx * 0.14,
        c.rx * 0.05,
        0,
        0,
        c.rx,
      );
      const light = Math.round(145 + c.shade * 65);
      const dark = Math.round(82 + c.shade * 35);
      const alphaTop = (0.36 + weatherIntensity * 0.34).toFixed(2);
      cg.addColorStop(
        0.0,
        `rgba(${light}, ${light + 4}, ${light + 10}, ${alphaTop})`,
      );
      cg.addColorStop(
        0.55,
        `rgba(${dark}, ${dark + 6}, ${dark + 14}, ${(0.22 * weatherIntensity).toFixed(2)})`,
      );
      cg.addColorStop(1.0, 'rgba(65, 74, 86, 0.0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, 0, c.rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Atmospheric orange-amber scatter into cloud deck around active Raptors
    if (plumeGlow > 0.05) {
      const rad = 160 + plumeGlow * 140;
      const pg = ctx.createRadialGradient(
        shipPt.x,
        shipPt.y + 18,
        6,
        shipPt.x,
        shipPt.y + 18,
        rad,
      );
      pg.addColorStop(
        0.0,
        `rgba(255, 195, 110, ${(0.38 * plumeGlow).toFixed(2)})`,
      );
      pg.addColorStop(
        0.45,
        `rgba(249, 115, 22, ${(0.16 * plumeGlow).toFixed(2)})`,
      );
      pg.addColorStop(1.0, 'rgba(249, 115, 22, 0.0)');
      ctx.fillStyle = pg;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();

    // 3. Optional Registered Reference Photo Blend Slider
    if (
      photoOpacity > 0.01 &&
      refPhotoImg?.complete &&
      refPhotoImg.naturalWidth > 0
    ) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, photoOpacity));
      ctx.drawImage(refPhotoImg, 0, 0, W, H);
      ctx.restore();
    }

    // 4. Optional 14-Frame Trajectory Curve + Wireframe Ghosts
    if (showGhosts) {
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.34)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      SHIP42_CATCH_14_FRAMES.forEach((f, idx) => {
        const pt = projWorld(f.lat, f.lon, f.altM);
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      for (const f of SHIP42_CATCH_14_FRAMES) {
        if (f.frame <= simState.frameFloat + 0.15) {
          drawStarship3D(f, {
            wireframe,
            ghostAlpha: 0.24,
            showDecal: false,
            showPlume: false,
          });
        }
      }
    }

    // 5. Starbase Launch Towers (Pad 2 Left with Chopsticks + Pad 1 Right)
    const pad2 = STARSHIP_FLIGHT15_EVENT.starbasePad2;
    const chopstickClosed = simState.u > 0.9 ? (simState.u - 0.9) / 0.1 : 0;
    drawTowerLattice(
      { lat: pad2.lat, lon: pad2.lon, altM: pad2.altM, heightM: 146 },
      Math.max(0, Math.min(1, chopstickClosed)),
      shipPt,
    );
    drawTowerLattice(STARBASE_PAD1_TOWER, null, shipPt);

    // 6. Active Live 3D Starship S42 Model + Wireframe + Plume
    drawStarship3D(simState, {
      wireframe,
      ghostAlpha: 1.0,
      showDecal: true,
      showPlume: true,
    });

    // 7. Boca Chica Coastal Marshland Foreground + Enhanced Wind/Rain Streaks
    const horizonPt = projWorld(pad2.lat, pad2.lon, pad2.altM);
    const yHorizon = Math.max(H - 95, Math.min(H - 35, horizonPt.y));

    ctx.save();
    const marshGrad = ctx.createLinearGradient(0, yHorizon, 0, H);
    marshGrad.addColorStop(0.0, '#464d29');
    marshGrad.addColorStop(0.45, '#333b1d');
    marshGrad.addColorStop(1.0, '#1c2310');
    ctx.fillStyle = marshGrad;
    ctx.beginPath();
    ctx.moveTo(0, yHorizon + 2);
    for (let x = 0; x <= W; x += 14) {
      const sway =
        Math.sin(x * 0.19 + timeSec * 3.2) * 3.5 + Math.cos(x * 0.43) * 2.5;
      ctx.lineTo(x, yHorizon + sway);
    }
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();

    // Coastal mist band above marsh horizon
    const mistGrad = ctx.createLinearGradient(
      0,
      yHorizon - 28,
      0,
      yHorizon + 12,
    );
    mistGrad.addColorStop(0.0, 'rgba(205, 214, 224, 0.0)');
    mistGrad.addColorStop(
      1.0,
      `rgba(205, 214, 224, ${(0.28 * weatherIntensity).toFixed(2)})`,
    );
    ctx.fillStyle = mistGrad;
    ctx.fillRect(0, yHorizon - 28, W, 40);

    // Wind-driven coastal rain/spray streaks
    if (weatherIntensity > 0.15) {
      ctx.lineWidth = 1.0;
      for (const m of rainMotes) {
        const rx = (((m.x + timeSec * m.speedX) % W) + W) % W;
        const ry = (m.y + timeSec * m.speedY) % H;
        ctx.strokeStyle = `rgba(226, 232, 240, ${(m.alpha * weatherIntensity).toFixed(2)})`;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 3.5, ry + m.len);
        ctx.stroke();
      }
    }
    ctx.restore();

    // 8. Reticle & Triangulated Camera Overlay HUD on Canvas
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(shipPt.x, shipPt.y, 26, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(8, 12, 22, 0.72)';
    ctx.fillRect(14, 14, 305, 58);
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.55)';
    ctx.strokeRect(14, 14, 305, 58);
    ctx.fillStyle = '#fde047';
    ctx.font = '800 12px "JetBrains Mono", monospace';
    ctx.fillText(
      `FRAME ${simState.frameNearest}/14 · T+${simState.tSec.toFixed(1)}s · ALT ${Math.round(simState.altM)} m`,
      24,
      34,
    );
    ctx.fillStyle = '#93c5fd';
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillText(
      `PITCH ${Math.round(simState.pitchDeg)}° · RAPTOR ${Math.round(simState.throttle * 100)}% · CAM 1,983m SSW`,
      24,
      54,
    );
    ctx.restore();
  }

  return { renderFrame, width: W, height: H };
}

/**
 * Mounts the 3D Starship Flight 15 Trajectory + T-Minus Countdown Bar + Multi-Cam Watch Theater
 * + Triangulated Marsh Cam 14-Frame Simulation.
 */
export function loadStarshipEventTheater({ viewer, neo4jLayer = null } = {}) {
  const entities = [];
  let destroyed = false;
  let scrubProgress = 0.72;
  let catchProgress = 0.0;
  let catchPlaying = false;
  let catchSpeed = 1.0;
  let weatherEnhanced = true;
  let wireframeEnabled = true;
  let ghostsEnabled = true;
  let photoBlend = 0.0;
  let liveClockSync = false;
  let theaterOpen = false;
  let marshModalOpen = false;
  let activeStreamId = STARSHIP_FLIGHT15_EVENT.streams[0].id;
  let shipEntity = null;
  let shipGlbEntity = null;
  let shipWireEntity = null;
  let plumeEntity = null;
  let prevFogDensity = null;
  let prevSkyBright = null;
  let prevSkySat = null;

  if (viewer?.entities) {
    // 1. Pad 2 Ascent + Hot-Staging Arc
    entities.push(
      viewer.entities.add({
        id: 'pfl-f15-ascent-arc',
        name: 'Flight 15 Pad 2 Ascent & Hot-Staging',
        polyline: {
          positions: PAD2_ASCENT_WAYPOINTS.map((p) =>
            Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.altM),
          ),
          width: 4,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.25,
            color: Cesium.Color.fromCssColorString('#38bdf8'),
          }),
        },
      }),
    );

    // 2. Booster 22 Offshore Gulf Splashdown Branch
    entities.push(
      viewer.entities.add({
        id: 'pfl-f15-booster22-arc',
        name: 'Booster 22 Gulf Catch-Abort Trajectory',
        polyline: {
          positions: BOOSTER22_ABORT_WAYPOINTS.map((p) =>
            Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.altM),
          ),
          width: 3.5,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString('#fb7185'),
            dashLength: 18,
          }),
        },
      }),
    );

    const b22Splash = STARSHIP_FLIGHT15_EVENT.booster22Splashdown;
    const b22Badge = makeCalloutCanvas(
      '[THING · BOOSTER 22]',
      'Offshore Gulf Splashdown',
      'GNC Tower Abort · 25.94N, -96.79W',
      '#fb7185',
    );
    entities.push(
      viewer.entities.add({
        id: 'pfl-f15-booster22-zone',
        position: Cesium.Cartesian3.fromDegrees(
          b22Splash.lon,
          b22Splash.lat,
          30,
        ),
        ellipse: {
          semiMajorAxis: 3500,
          semiMinorAxis: 3500,
          height: 10,
          material: Cesium.Color.fromCssColorString('#fb7185').withAlpha(0.18),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#fb7185'),
        },
        billboard: b22Badge
          ? {
              image: b22Badge,
              width: 210,
              height: 46,
              pixelOffset: new Cesium.Cartesian2(0, -28),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }
          : undefined,
      }),
    );

    // 3. Ship 42 Mexico-to-Starbase Plasma Re-entry & Mechazilla Catch Corridor
    entities.push(
      viewer.entities.add({
        id: 'pfl-f15-ship42-reentry-corridor',
        name: 'Ship 42 Plasma Re-Entry & Mechazilla Catch Corridor',
        polyline: {
          positions: SHIP42_REENTRY_WAYPOINTS.map((p) =>
            Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.altM),
          ),
          width: 6,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.35,
            color: Cesium.Color.fromCssColorString('#f97316'),
          }),
        },
      }),
    );

    // 4. Pad 2 Orbital Launch Integration Tower + Chopstick Arms
    const pad2 = STARSHIP_FLIGHT15_EVENT.starbasePad2;
    const pad2Badge = makeCalloutCanvas(
      '[EVENT · PAD 2 / OLT-B]',
      'Mechazilla Tower Catch (146 m)',
      'Starbase, TX · 25.9968N, -97.1580W',
      '#f97316',
    );
    entities.push(
      viewer.entities.add({
        id: 'pfl-f15-mechazilla-tower',
        name: 'Mechazilla Orbital Launch Integration Tower (Pad 2)',
        position: Cesium.Cartesian3.fromDegrees(
          pad2.lon,
          pad2.lat,
          pad2.altM + 73,
        ),
        box: {
          dimensions: new Cesium.Cartesian3(12, 12, 146),
          material: Cesium.Color.fromCssColorString('#475569').withAlpha(0.75),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#f97316'),
        },
        billboard: pad2Badge
          ? {
              image: pad2Badge,
              width: 235,
              height: 52,
              pixelOffset: new Cesium.Cartesian2(0, -56),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }
          : undefined,
      }),
    );

    // Chopstick catch arms extending East-Southeast from Pad 2 spine at 112 m ASL
    entities.push(
      viewer.entities.add({
        id: 'pfl-f15-pad2-chopsticks',
        name: 'Pad 2 Mechazilla Chopstick Arms',
        polyline: {
          positions: [
            Cesium.Cartesian3.fromDegrees(
              pad2.lon + 0.00024,
              pad2.lat + 0.00005,
              114,
            ),
            Cesium.Cartesian3.fromDegrees(pad2.lon, pad2.lat, 116),
            Cesium.Cartesian3.fromDegrees(
              pad2.lon + 0.00024,
              pad2.lat - 0.00008,
              114,
            ),
          ],
          width: 6,
          material: Cesium.Color.fromCssColorString('#f97316'),
        },
      }),
    );

    // 4b. Pad 1 / OLT-1 Tower (Right tower visible on horizon in 14-frame composite)
    const pad1Badge = makeCalloutCanvas(
      '[PLACE · PAD 1 / OLT-A]',
      'Starbase Pad 1 Tower (146 m)',
      '195 m ENE · Horizon Marker',
      '#94a3b8',
    );
    entities.push(
      viewer.entities.add({
        id: 'pfl-f15-pad1-tower',
        name: 'Starbase Orbital Launch Tower 1 (Pad 1 / OLT-A)',
        position: Cesium.Cartesian3.fromDegrees(
          STARBASE_PAD1_TOWER.lon,
          STARBASE_PAD1_TOWER.lat,
          STARBASE_PAD1_TOWER.altM + 73,
        ),
        box: {
          dimensions: new Cesium.Cartesian3(12, 12, 146),
          material: Cesium.Color.fromCssColorString('#475569').withAlpha(0.7),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#94a3b8'),
        },
        billboard: pad1Badge
          ? {
              image: pad1Badge,
              width: 210,
              height: 46,
              pixelOffset: new Cesium.Cartesian2(0, -48),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }
          : undefined,
      }),
    );

    // 4c. Triangulated Marsh Camera Station Marker
    const marshBadge = makeCalloutCanvas(
      '[CAMERA · PHOTO VANTAGE]',
      'Marsh Cam · 2,109 m WSW',
      '25.9899N, -97.1776W · HDG 66.7° +14.8°',
      '#38bdf8',
    );
    entities.push(
      viewer.entities.add({
        id: 'pfl-f15-marsh-cam-marker',
        name: STARBASE_MARSH_CAM_POSE.name,
        position: Cesium.Cartesian3.fromDegrees(
          STARBASE_MARSH_CAM_POSE.lon,
          STARBASE_MARSH_CAM_POSE.lat,
          STARBASE_MARSH_CAM_POSE.altM,
        ),
        point: {
          pixelSize: 12,
          color: Cesium.Color.fromCssColorString('#38bdf8'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        billboard: marshBadge
          ? {
              image: marshBadge,
              width: 225,
              height: 50,
              pixelOffset: new Cesium.Cartesian2(0, -34),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }
          : undefined,
      }),
    );

    // 4d. 14-Frame Composite Catch Trajectory Arc & 3D Wireframe Ghost Silhouettes
    entities.push(
      viewer.entities.add({
        id: 'pfl-f15-catch14-curve',
        name: 'Ship 42 14-Frame Flip & Chopstick Catch Path',
        polyline: {
          positions: SHIP42_CATCH_14_FRAMES.map((f) =>
            Cesium.Cartesian3.fromDegrees(f.lon, f.lat, f.altM),
          ),
          width: 3,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.75),
            dashLength: 16,
          }),
        },
      }),
    );

    for (const f of SHIP42_CATCH_14_FRAMES) {
      const fPos = Cesium.Cartesian3.fromDegrees(f.lon, f.lat, f.altM);
      const fQuat = Cesium.Transforms.headingPitchRollQuaternion(
        fPos,
        starshipCesiumHpr(f.headingDeg, f.pitchDeg, f.rollDeg),
      );
      entities.push(
        viewer.entities.add({
          id: `pfl-f15-catch14-ghost-${f.frame}`,
          name: f.phase,
          position: fPos,
          orientation: fQuat,
          box: {
            dimensions: new Cesium.Cartesian3(50, 9.2, 9.2),
            fill: false,
            outline: true,
            outlineColor:
              Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.32),
          },
        }),
      );
    }

    // 5. Maritime Keep-Out Hazard Zone Polygon off Boca Chica
    entities.push(
      viewer.entities.add({
        id: 'pfl-f15-hazard-box',
        name: 'FAA / USCG Starbase Launch & Catch Keep-Out Zone',
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray([
            -97.185, 26.055, -96.65, 26.08, -96.65, 25.86, -97.175, 25.93,
          ]),
          height: 15,
          material: Cesium.Color.fromCssColorString('#f97316').withAlpha(0.11),
          outline: true,
          outlineColor:
            Cesium.Color.fromCssColorString('#f97316').withAlpha(0.65),
        },
      }),
    );

    // 6. Sightline Bearing Line from PFL Liverpool Sovereign Node (274.8 mi / 200.4° SSW)
    const lv = STARSHIP_FLIGHT15_EVENT.liverpoolNode;
    entities.push(
      viewer.entities.add({
        id: 'pfl-f15-liverpool-sightline',
        name: 'PFL Liverpool -> Starbase Sightline (274.8 mi · 200.4° SSW)',
        polyline: {
          positions: [
            Cesium.Cartesian3.fromDegrees(lv.lon, lv.lat, 40),
            Cesium.Cartesian3.fromDegrees(pad2.lon, pad2.lat, 146),
          ],
          width: 2,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString('#22c55e').withAlpha(0.55),
            dashLength: 24,
          }),
        },
      }),
    );

    // 7. Live Scrubbable 3D Ship 42 Macro Re-entry Marker
    const initShip = interpolateShip42State(scrubProgress);
    const shipBadge = makeCalloutCanvas(
      '[THING · SHIP 42 LIVE 4D]',
      "Starship S42 · DON'T PANIC",
      'Scrub 4D Timeline in Watch Theater',
      '#38bdf8',
    );
    shipEntity = viewer.entities.add({
      id: 'pfl-f15-ship42-live-marker',
      name: 'Starship Ship 42 (4D Reconstruction Marker)',
      position: Cesium.Cartesian3.fromDegrees(
        initShip.lon,
        initShip.lat,
        initShip.altM,
      ),
      point: {
        pixelSize: 15,
        color: Cesium.Color.fromCssColorString('#fde047'),
        outlineColor: Cesium.Color.fromCssColorString('#f97316'),
        outlineWidth: 3,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      billboard: shipBadge
        ? {
            image: shipBadge,
            width: 215,
            height: 48,
            pixelOffset: new Cesium.Cartesian2(0, -34),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          }
        : undefined,
    });
    entities.push(shipEntity);

    // 8. Live 3D GLB + Wireframe + Dynamic Raptor Plume Vehicle for Terminal 14-Frame Catch
    const f0 = interpolateCatch14Frame(0);
    const f0Pos = Cesium.Cartesian3.fromDegrees(f0.lon, f0.lat, f0.altM);
    const f0Quat = Cesium.Transforms.headingPitchRollQuaternion(
      f0Pos,
      starshipCesiumHpr(f0.headingDeg, f0.pitchDeg, f0.rollDeg),
    );

    shipGlbEntity = viewer.entities.add({
      id: 'pfl-f15-ship42-glb',
      name: 'Starship S42 3D GLB (Terminal Catch Sim)',
      position: f0Pos,
      orientation: f0Quat,
      model: {
        uri: STARBASE_MARSH_CAM_POSE.modelUrl,
        scale: 1,
        minimumPixelSize: 34,
        environmentMapOptions: { enabled: false },
      },
    });
    entities.push(shipGlbEntity);

    shipWireEntity = viewer.entities.add({
      id: 'pfl-f15-ship42-wireframe-cage',
      name: 'Starship S42 Wireframe Cage',
      position: f0Pos,
      orientation: f0Quat,
      box: {
        dimensions: new Cesium.Cartesian3(51, 9.6, 9.6),
        fill: false,
        outline: true,
        outlineColor:
          Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.85),
      },
    });
    entities.push(shipWireEntity);

    plumeEntity = viewer.entities.add({
      id: 'pfl-f15-raptor-plume',
      name: 'Starship S42 Raptor Exhaust Plume',
      show: false,
      polyline: {
        positions: [f0Pos, f0Pos],
        width: 14,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.45,
          color: Cesium.Color.fromCssColorString('#fb923c'),
        }),
      },
    });
    entities.push(plumeEntity);
  }

  function updateShipMarker(nextProgress) {
    scrubProgress = Math.max(0, Math.min(1, Number(nextProgress)));
    const st = interpolateShip42State(scrubProgress);
    if (shipEntity && viewer) {
      shipEntity.position = Cesium.Cartesian3.fromDegrees(
        st.lon,
        st.lat,
        st.altM,
      );
      governorRequestRender('pfl-f15-scrub');
    }
    return st;
  }

  function updateCatchSimEntities(nextU) {
    catchProgress = Math.max(0, Math.min(1, Number(nextU) || 0));
    const st = interpolateCatch14Frame(catchProgress);
    if (viewer && shipGlbEntity) {
      const pos = Cesium.Cartesian3.fromDegrees(st.lon, st.lat, st.altM);
      const quat = Cesium.Transforms.headingPitchRollQuaternion(
        pos,
        starshipCesiumHpr(st.headingDeg, st.pitchDeg, st.rollDeg),
      );
      shipGlbEntity.position = pos;
      shipGlbEntity.orientation = quat;
      if (shipWireEntity) {
        shipWireEntity.position = pos;
        shipWireEntity.orientation = quat;
        shipWireEntity.show = wireframeEnabled;
      }
      if (plumeEntity) {
        if (st.throttle > 0.04) {
          const tailOff = shipLocalToEnu(
            { forwardM: -26, portM: 0, dorsalM: 0 },
            st.headingDeg,
            st.pitchDeg,
          );
          const plumeLen = 16 + st.throttle * 58;
          const gRad = (st.gimbalDeg * Math.PI) / 180;
          const tipOff = shipLocalToEnu(
            {
              forwardM: -26 - plumeLen * Math.cos(gRad),
              portM: 0,
              dorsalM: plumeLen * Math.sin(gRad),
            },
            st.headingDeg,
            st.pitchDeg,
          );
          const p0 = Cesium.Cartesian3.fromDegrees(
            st.lon + tailOff.e / METERS_PER_DEG_LON_STARBASE,
            st.lat + tailOff.n / METERS_PER_DEG_LAT,
            st.altM + tailOff.u,
          );
          const p1 = Cesium.Cartesian3.fromDegrees(
            st.lon + tipOff.e / METERS_PER_DEG_LON_STARBASE,
            st.lat + tipOff.n / METERS_PER_DEG_LAT,
            Math.max(8, st.altM + tipOff.u),
          );
          plumeEntity.polyline.positions = [p0, p1];
          plumeEntity.show = true;
        } else {
          plumeEntity.show = false;
        }
      }
      governorRequestRender('pfl-f15-catch-sim');
    }
    return st;
  }

  function applyCesiumOvercastWeather(enable) {
    if (!viewer?.scene) return;
    if (enable) {
      if (prevSkyBright == null && viewer.scene.skyAtmosphere) {
        prevSkyBright = viewer.scene.skyAtmosphere.brightnessShift;
        prevSkySat = viewer.scene.skyAtmosphere.saturationShift;
      }
      if (prevFogDensity == null && viewer.scene.fog) {
        prevFogDensity = viewer.scene.fog.density;
      }
      if (viewer.scene.skyAtmosphere) {
        viewer.scene.skyAtmosphere.saturationShift = -0.58;
        viewer.scene.skyAtmosphere.brightnessShift = -0.14;
      }
      if (viewer.scene.fog) {
        viewer.scene.fog.enabled = true;
        viewer.scene.fog.density = 0.00042;
      }
    } else {
      if (viewer.scene.skyAtmosphere && prevSkyBright != null) {
        viewer.scene.skyAtmosphere.brightnessShift = prevSkyBright;
        viewer.scene.skyAtmosphere.saturationShift = prevSkySat;
      }
      if (viewer.scene.fog && prevFogDensity != null) {
        viewer.scene.fog.density = prevFogDensity;
      }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('gev:cockpit-weather-toggle', {
          detail: { enabled: Boolean(enable) },
        }),
      );
    }
    governorRequestRender('pfl-f15-weather');
  }

  function flyToStarbaseCatch() {
    if (!viewer?.camera) return;
    const pad2 = STARSHIP_FLIGHT15_EVENT.starbasePad2;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        pad2.lon + 0.022,
        pad2.lat - 0.018,
        920,
      ),
      orientation: {
        heading: Cesium.Math.toRadians(308),
        pitch: Cesium.Math.toRadians(-22),
        roll: 0,
      },
      duration: 1.8,
    });
  }

  let prevCameraFovRad = null;
  function restoreMarshCameraFov() {
    if (
      prevCameraFovRad != null &&
      viewer?.camera?.frustum &&
      typeof viewer.camera.frustum.fov === 'number'
    ) {
      viewer.camera.frustum.fov = prevCameraFovRad;
    }
    prevCameraFovRad = null;
  }

  function flyToMarshCamera({ duration = 1.25, onComplete = null } = {}) {
    if (!viewer?.camera) return;
    if (
      viewer.camera.frustum &&
      typeof viewer.camera.frustum.fov === 'number'
    ) {
      if (prevCameraFovRad == null) {
        prevCameraFovRad = viewer.camera.frustum.fov;
      }
      // Cesium frustum.fov governs the major viewport axis (horizontal on landscape screens);
      // scale vFOV by aspect ratio when width > height so the full 14-frame vertical arc + towers frame cleanly.
      const vFovRad = Cesium.Math.toRadians(STARBASE_MARSH_CAM_POSE.fovDeg);
      const c = viewer.scene?.canvas;
      const aspect =
        c?.clientWidth > 0 && c?.clientHeight > 0
          ? c.clientWidth / c.clientHeight
          : 1;
      viewer.camera.frustum.fov =
        aspect > 1 ? 2 * Math.atan(Math.tan(vFovRad / 2) * aspect) : vFovRad;
    }
    let safeAltM = STARBASE_MARSH_CAM_POSE.altM;
    try {
      const terrainH = viewer.scene?.globe?.getHeight?.(
        Cesium.Cartographic.fromDegrees(
          STARBASE_MARSH_CAM_POSE.lon,
          STARBASE_MARSH_CAM_POSE.lat,
        ),
      );
      if (Number.isFinite(terrainH)) {
        safeAltM = Math.max(safeAltM, terrainH + 2.2);
      }
    } catch {
      // Ignore terrain probe failure; keep calibrated altitude
    }
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        STARBASE_MARSH_CAM_POSE.lon,
        STARBASE_MARSH_CAM_POSE.lat,
        safeAltM,
      ),
      orientation: {
        heading: Cesium.Math.toRadians(STARBASE_MARSH_CAM_POSE.headingDeg),
        pitch: Cesium.Math.toRadians(STARBASE_MARSH_CAM_POSE.pitchDeg),
        roll: Cesium.Math.toRadians(STARBASE_MARSH_CAM_POSE.rollDeg),
      },
      duration,
      complete:
        typeof onComplete === 'function' ? () => onComplete() : undefined,
      cancel: typeof onComplete === 'function' ? () => onComplete() : undefined,
    });
  }

  function flyToFullCorridor() {
    if (!viewer?.camera) return;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(-98.4, 24.2, 820000),
      orientation: {
        heading: Cesium.Math.toRadians(12),
        pitch: Cesium.Math.toRadians(-62),
        roll: 0,
      },
      duration: 1.8,
    });
  }

  function flyToLiverpoolNode() {
    if (!viewer?.camera) return;
    const lv = STARSHIP_FLIGHT15_EVENT.liverpoolNode;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        lv.lon,
        lv.lat - 0.00028,
        lv.groundM + 16,
      ),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-18),
        roll: 0,
      },
      duration: 1.6,
    });
  }

  function flyToBirdPond() {
    if (!viewer?.camera) return;
    const bp = STARSHIP_FLIGHT15_EVENT.birdPondGate;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        bp.lon,
        bp.lat - 0.0003,
        bp.groundM + 18,
      ),
      orientation: {
        heading: Cesium.Math.toRadians(21),
        pitch: Cesium.Math.toRadians(-18),
        roll: 0,
      },
      duration: 1.6,
    });
  }

  function flyToShip42() {
    if (!viewer?.camera) return;
    const st = interpolateShip42State(scrubProgress);
    const offsetDeg = Math.max(0.015, st.altM / 220000);
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        st.lon + offsetDeg,
        st.lat - offsetDeg,
        Math.max(600, st.altM * 1.55),
      ),
      orientation: {
        heading: Cesium.Math.toRadians(315),
        pitch: Cesium.Math.toRadians(-28),
        roll: 0,
      },
      duration: 1.4,
    });
  }

  // Mount DOM HUD + Enhanced Weather & Wireframe Marsh Catch Simulator
  let hudRoot = null;
  let timerHandle = null;
  let rafHandle = null;
  let openStreamImpl = null;
  let triggerMarshCatchSimImpl = null;
  let dockObserver = null;
  let dockPlayBtn = null;
  let activeRecorder = null;
  let activeRecordStopTimer = null;
  let lastExportUrl = null;

  if (typeof document !== 'undefined' && document.body) {
    const existing = document.getElementById('pfl-f15-hud-root');
    if (existing) existing.remove();

    hudRoot = document.createElement('div');
    hudRoot.id = 'pfl-f15-hud-root';
    hudRoot.innerHTML = `
      <style>
        #pfl-f15-hud-root {
          position: fixed;
          top: 66px;
          left: 0;
          right: 0;
          z-index: 9650;
          font-family: "Inter", system-ui, -apple-system, sans-serif;
          color: #f8fafc;
          pointer-events: none;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 0 12px;
          box-sizing: border-box;
        }
        .pfl-f15-bar {
          pointer-events: auto;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          padding: 7px 12px;
          background: rgba(8, 12, 22, 0.90);
          border: 1px solid rgba(249, 115, 22, 0.55);
          border-radius: 999px;
          box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55), 0 0 18px rgba(249, 115, 22, 0.18);
          backdrop-filter: blur(10px);
        }
        .pfl-f15-badge {
          font-family: "JetBrains Mono", monospace;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.05em;
          padding: 3px 7px;
          border-radius: 999px;
          background: rgba(249, 115, 22, 0.22);
          color: #fb923c;
          border: 1px solid rgba(249, 115, 22, 0.45);
        }
        .pfl-f15-clock {
          font-family: "JetBrains Mono", monospace;
          font-size: 14px;
          font-weight: 800;
          color: #fde047;
          padding: 2px 8px;
          background: rgba(250, 204, 21, 0.12);
          border-radius: 6px;
          min-width: 96px;
          text-align: center;
        }
        .pfl-f15-btn {
          cursor: pointer;
          font-family: "JetBrains Mono", monospace;
          font-size: 11px;
          font-weight: 600;
          color: #e2e8f0;
          background: rgba(30, 41, 59, 0.85);
          border: 1px solid rgba(148, 163, 184, 0.32);
          border-radius: 999px;
          padding: 4px 9px;
          transition: all 0.15s ease;
        }
        .pfl-f15-btn:hover {
          background: rgba(56, 189, 248, 0.22);
          border-color: #38bdf8;
          color: #fff;
        }
        .pfl-f15-btn.active {
          background: rgba(34, 197, 94, 0.22);
          border-color: #22c55e;
          color: #86efac;
        }
        .pfl-f15-btn.watch {
          background: rgba(249, 115, 22, 0.24);
          border-color: #f97316;
          color: #fed7aa;
        }
        .pfl-f15-btn.sim {
          background: linear-gradient(135deg, rgba(14, 165, 233, 0.34), rgba(249, 115, 22, 0.34));
          border-color: #38bdf8;
          color: #f0f9ff;
          font-weight: 700;
        }
        .pfl-f15-theater {
          pointer-events: auto;
          width: min(500px, calc(100vw - 28px));
          background: rgba(8, 12, 22, 0.94);
          border: 1px solid rgba(56, 189, 248, 0.42);
          border-radius: 14px;
          padding: 12px;
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.72);
          backdrop-filter: blur(12px);
          display: none;
        }
        .pfl-f15-theater.open {
          display: block;
        }
        .pfl-f15-marsh-modal {
          position: fixed;
          top: 112px;
          right: 14px;
          z-index: 9660;
          pointer-events: auto;
          width: min(350px, calc(100vw - 28px));
          max-height: calc(100vh - 196px);
          overflow-y: auto;
          background: rgba(6, 10, 19, 0.92);
          border: 1px solid rgba(56, 189, 248, 0.58);
          border-radius: 14px;
          padding: 10px;
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.78);
          backdrop-filter: blur(12px);
          display: none;
        }
        .pfl-f15-marsh-modal.open {
          display: grid;
          grid-template-columns: 1fr;
          gap: 9px;
          align-items: start;
        }
        .pfl-marsh-canvas-wrap {
          position: relative;
          width: 100%;
          max-width: 190px;
          aspect-ratio: 682 / 1024;
          max-height: 280px;
          margin: 0 auto;
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, 0.35);
          background: #0b1120;
        }
        .pfl-marsh-canvas-wrap canvas {
          width: 100%;
          height: 100%;
          display: block;
        }
        .pfl-marsh-side {
          display: flex;
          flex-direction: column;
          gap: 9px;
          font-size: 12px;
        }
        .pfl-marsh-card {
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 9px;
          padding: 8px 10px;
        }
        .pfl-marsh-card input[type="range"] {
          width: 100%;
          accent-color: #38bdf8;
          cursor: pointer;
        }
        .pfl-f15-tax-row {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-bottom: 8px;
        }
        .pfl-tax-chip {
          font-family: "JetBrains Mono", monospace;
          font-size: 10px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 6px;
          border: 1px solid currentColor;
          opacity: 0.92;
        }
        .pfl-stream-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-bottom: 8px;
        }
        .pfl-video-box {
          width: 100%;
          aspect-ratio: 16 / 9;
          background: #020617;
          border-radius: 9px;
          overflow: hidden;
          border: 1px solid rgba(148, 163, 184, 0.24);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .pfl-video-box iframe {
          width: 100%;
          height: 100%;
          border: 0;
        }
        .pfl-scrubber-box {
          margin-top: 9px;
          padding: 8px 10px;
          background: rgba(15, 23, 42, 0.85);
          border-radius: 9px;
          border: 1px solid rgba(148, 163, 184, 0.2);
        }
        .pfl-scrubber-box input[type="range"] {
          width: 100%;
          accent-color: #f97316;
          cursor: pointer;
        }
        #pfl-s42-dock-btn {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 2.35rem;
          padding: 0 0.78rem;
          margin: 0 0.35rem;
          border-radius: 0.42rem;
          border: 1px solid rgba(56, 189, 248, 0.72);
          background: linear-gradient(135deg, rgba(14, 165, 233, 0.28), rgba(249, 115, 22, 0.28));
          color: #f0f9ff;
          font-family: "JetBrains Mono", monospace;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.03em;
          white-space: nowrap;
          cursor: pointer;
          box-shadow: 0 0 12px rgba(56, 189, 248, 0.25);
          transition: transform 140ms ease, box-shadow 140ms ease, background 140ms ease;
        }
        #pfl-s42-dock-btn:hover {
          transform: translateY(-1px);
          background: linear-gradient(135deg, rgba(14, 165, 233, 0.45), rgba(249, 115, 22, 0.42));
          box-shadow: 0 0 18px rgba(56, 189, 248, 0.45);
        }
        #pfl-s42-dock-btn.active {
          border-color: #fde047;
          background: linear-gradient(135deg, #0284c7, #ea580c);
          color: #ffffff;
        }
      </style>
      <div class="pfl-f15-bar">
        <span class="pfl-f15-badge" title="Canonical PFL Taxonomy: EVENT -> milestone (#21)">EVENT · #21</span>
        <span style="font-size:12px;font-weight:700;letter-spacing:0.01em">Flight 15 Catch (S42)</span>
        <span class="pfl-f15-clock" data-pfl-countdown>--:--:--</span>
        <button type="button" class="pfl-f15-btn sim" data-pfl-play-catch-sim title="Fly camera to Boca Chica Marsh vantage &amp; play 3D Ship 42 GLB landing sim">▶ Play S42 Catch Sim</button>
        <button type="button" class="pfl-f15-btn" data-pfl-fly="starbase">Starbase Pad 2</button>
        <button type="button" class="pfl-f15-btn" data-pfl-fly="corridor">Full 3D Corridor</button>
        <button type="button" class="pfl-f15-btn" data-pfl-fly="liverpool">Liverpool</button>
        <button type="button" class="pfl-f15-btn" data-pfl-fly="birdpond">Bird Pond</button>
        <button type="button" class="pfl-f15-btn active" data-pfl-toggle-neo4j>Neo4j 3D: ON</button>
        <button type="button" class="pfl-f15-btn" data-pfl-inspect-neo4j title="Open Neo4j Dossier &amp; Original Sources">Inspect Sources</button>
        <button type="button" class="pfl-f15-btn watch" data-pfl-toggle-theater>Streams &amp; 4D</button>
        <button type="button" class="pfl-f15-btn" data-pfl-open-kalshi style="border-color:rgba(34,197,94,0.65);color:#4ade80">📈 Kalshi Arena</button>
        <button type="button" class="pfl-f15-btn" data-pfl-open-holodeck style="border-color:rgba(56,189,248,0.65);color:#38bdf8">🌐 3D Holodeck</button>
        <button type="button" class="pfl-f15-btn" data-pfl-edit-photos style="border-color:rgba(245,158,11,0.65);color:#fbbf24">🛠️ Edit 3D Photos</button>
      </div>
      <div class="pfl-f15-marsh-modal" id="pfl-f15-marsh-sim-modal" data-pfl-marsh-modal>
        <div class="pfl-marsh-canvas-wrap">
          <canvas data-pfl-marsh-canvas></canvas>
        </div>
        <div class="pfl-marsh-side">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-size:14px;font-weight:800;color:#38bdf8">Ship 42 "DON'T PANIC" · 14-Frame Catch Sim</div>
              <div style="font-size:11px;color:#94a3b8;font-family:'JetBrains Mono',monospace">
                Solved Cam: ${STARBASE_MARSH_CAM_POSE.lat.toFixed(4)}° N, ${Math.abs(STARBASE_MARSH_CAM_POSE.lon).toFixed(4)}° W · ${STARBASE_MARSH_CAM_POSE.altM}m ASL · HDG ${STARBASE_MARSH_CAM_POSE.headingDeg}° · PTCH +${STARBASE_MARSH_CAM_POSE.pitchDeg}°
              </div>
            </div>
            <button type="button" class="pfl-f15-btn" data-pfl-close-marsh>Close</button>
          </div>
          <div class="pfl-marsh-card">
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
              <button type="button" class="pfl-f15-btn active" data-pfl-marsh-play>⏸ Pause</button>
              <button type="button" class="pfl-f15-btn" data-pfl-marsh-restart>↺ Replay</button>
              <button type="button" class="pfl-f15-btn active" data-pfl-marsh-wireframe>GLB Wireframe: ON</button>
              <button type="button" class="pfl-f15-btn active" data-pfl-marsh-weather>Enhanced Weather: ON</button>
              <button type="button" class="pfl-f15-btn active" data-pfl-marsh-ghosts>14-Frame Trail: ON</button>
              <button type="button" class="pfl-f15-btn" data-pfl-fly="marsh">Re-Center Cesium 3D</button>
            </div>
            <div style="display:flex;justify-content:space-between;font-family:'JetBrains Mono',monospace;font-size:11px;color:#fde047;margin-bottom:3px">
              <span data-pfl-marsh-telem></span>
              <span data-pfl-marsh-speed></span>
            </div>
            <input type="range" min="0" max="1000" value="0" data-pfl-marsh-scrubber />
            <div data-pfl-marsh-phase style="font-size:11px;color:#e2e8f0;margin-top:4px"></div>
          </div>
          <div class="pfl-marsh-card">
            <div style="display:flex;justify-content:space-between;font-family:'JetBrains Mono',monospace;font-size:11px;margin-bottom:3px">
              <span style="color:#cbd5e1">Composite Photo Registration Blend</span>
              <span data-pfl-photo-pct style="color:#38bdf8">0%</span>
            </div>
            <input type="range" min="0" max="100" value="0" data-pfl-photo-blend />
            <div style="font-size:10.5px;color:#94a3b8;margin-top:3px">
              Slide right to overlay original 682×1024 Boca Chica composite &amp; verify pixel-locked 3D camera triangulation against Pad 1 &amp; Pad 2 towers.
            </div>
          </div>
          <div class="pfl-marsh-card" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:8px">
              <img src="${STARBASE_MARSH_CAM_POSE.markingPhotoUrl}" alt="S42 DON'T PANIC Hull Marking" style="width:74px;height:52px;object-fit:cover;border-radius:6px;border:1px solid rgba(148,163,184,0.35)" />
              <div style="font-size:11px;color:#cbd5e1">
                <strong style="color:#f8fafc">GLB:</strong> <code style="color:#38bdf8">/models/starship_s42.glb</code><br />
                50 m TPS belly + stainless steel + "DON'T PANIC S42"
              </div>
            </div>
            <button type="button" class="pfl-f15-btn watch" data-pfl-record-webm>⏺ Record WebM Video</button>
          </div>
          <div data-pfl-video-export-box style="display:none" class="pfl-marsh-card"></div>
        </div>
      </div>
      <div class="pfl-f15-theater" data-pfl-theater>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="font-size:13px;font-weight:700;color:#fde047">
            Starship Flight 15 · 4D OSINT Watch Theater
          </div>
          <div style="display:flex;gap:5px">
            <button type="button" class="pfl-f15-btn sim" data-pfl-play-catch-sim>▶ Play Catch Sim</button>
            <button type="button" class="pfl-f15-btn" data-pfl-close-theater>Minimize</button>
          </div>
        </div>
        <div class="pfl-f15-tax-row">
          <span class="pfl-tax-chip" style="color:${PFL_ENTITY_TAXONOMY.PERSON.color}">1·PERSON (Swarm)</span>
          <span class="pfl-tax-chip" style="color:${PFL_ENTITY_TAXONOMY.PLACE.color}">2·PLACE (Starbase/Liverpool)</span>
          <span class="pfl-tax-chip" style="color:${PFL_ENTITY_TAXONOMY.THING.color}">3·THING (Ship 42/B22)</span>
          <span class="pfl-tax-chip" style="color:${PFL_ENTITY_TAXONOMY.IDEA.color}">4·IDEA (4D OSINT)</span>
          <span class="pfl-tax-chip" style="color:${PFL_ENTITY_TAXONOMY.EVENT.color}">5·EVENT (Time 15:17 CST)</span>
        </div>
        <div class="pfl-stream-tabs" data-pfl-stream-tabs></div>
        <div class="pfl-video-box" data-pfl-video-stage></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px;font-size:11px;color:#94a3b8">
          <span data-pfl-stream-note></span>
          <a data-pfl-stream-ext href="#" target="_blank" rel="noopener noreferrer" style="color:#38bdf8;text-decoration:none;font-family:'JetBrains Mono',monospace">Pop-out ↗</a>
        </div>
        <div class="pfl-scrubber-box">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;font-family:'JetBrains Mono',monospace;margin-bottom:4px">
            <span data-pfl-telem-readout style="color:#fed7aa;font-weight:700"></span>
            <button type="button" class="pfl-f15-btn" data-pfl-fly="ship42" style="padding:2px 8px;font-size:10px">Follow Ship 42</button>
          </div>
          <input type="range" min="0" max="100" value="72" data-pfl-scrubber />
          <div data-pfl-phase-readout style="font-size:11px;color:#cbd5e1;margin-top:3px"></div>
        </div>
        <div style="margin-top:7px;font-size:10.5px;color:#94a3b8;font-family:'JetBrains Mono',monospace">
          Watch Party: ${STARSHIP_FLIGHT15_EVENT.swarmRoster.join(' · ')}
        </div>
      </div>
    `;
    document.body.appendChild(hudRoot);

    const countdownEl = hudRoot.querySelector('[data-pfl-countdown]');
    const theaterEl = hudRoot.querySelector('[data-pfl-theater]');
    const marshModalEl = hudRoot.querySelector('[data-pfl-marsh-modal]');
    const marshCanvas = hudRoot.querySelector('[data-pfl-marsh-canvas]');
    const marshPlayBtn = hudRoot.querySelector('[data-pfl-marsh-play]');
    const marshWireBtn = hudRoot.querySelector('[data-pfl-marsh-wireframe]');
    const marshWeatherBtn = hudRoot.querySelector('[data-pfl-marsh-weather]');
    const marshGhostsBtn = hudRoot.querySelector('[data-pfl-marsh-ghosts]');
    const marshScrubberEl = hudRoot.querySelector('[data-pfl-marsh-scrubber]');
    const marshTelemEl = hudRoot.querySelector('[data-pfl-marsh-telem]');
    const marshSpeedEl = hudRoot.querySelector('[data-pfl-marsh-speed]');
    const marshPhaseEl = hudRoot.querySelector('[data-pfl-marsh-phase]');
    const photoBlendEl = hudRoot.querySelector('[data-pfl-photo-blend]');
    const photoPctEl = hudRoot.querySelector('[data-pfl-photo-pct]');
    const recordBtn = hudRoot.querySelector('[data-pfl-record-webm]');
    const exportBoxEl = hudRoot.querySelector('[data-pfl-video-export-box]');

    const tabsEl = hudRoot.querySelector('[data-pfl-stream-tabs]');
    const stageEl = hudRoot.querySelector('[data-pfl-video-stage]');
    const noteEl = hudRoot.querySelector('[data-pfl-stream-note]');
    const extEl = hudRoot.querySelector('[data-pfl-stream-ext]');
    const scrubberEl = hudRoot.querySelector('[data-pfl-scrubber]');
    const telemEl = hudRoot.querySelector('[data-pfl-telem-readout]');
    const phaseEl = hudRoot.querySelector('[data-pfl-phase-readout]');
    const neo4jBtn = hudRoot.querySelector('[data-pfl-toggle-neo4j]');

    const marshRenderer =
      marshCanvas?.getContext &&
      createMarshCanvasRenderer(marshCanvas, () =>
        interpolateCatch14Frame(catchProgress),
      );

    let lastAnimMs = 0;

    function syncMarshHudReadout(st) {
      if (marshScrubberEl)
        marshScrubberEl.value = String(Math.round(catchProgress * 1000));
      if (marshTelemEl) {
        marshTelemEl.textContent = `F${st.frameNearest}/14 · ALT ${Math.round(st.altM)} m · PITCH ${Math.round(st.pitchDeg)}°`;
      }
      if (marshSpeedEl) {
        marshSpeedEl.textContent = `Vz ${st.vSpeedMs} m/s · RAPTOR ${Math.round(st.throttle * 100)}%`;
      }
      if (marshPhaseEl) marshPhaseEl.textContent = st.phase;
    }

    function drawMarshFrame(nowMs) {
      const st = updateCatchSimEntities(catchProgress);
      syncMarshHudReadout(st);
      marshRenderer?.renderFrame(nowMs / 1000, st, {
        weatherIntensity: weatherEnhanced ? 0.92 : 0.12,
        wireframe: wireframeEnabled,
        showGhosts: ghostsEnabled,
        photoOpacity: photoBlend,
      });
    }

    function stopRaf() {
      if (rafHandle != null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafHandle);
      }
      rafHandle = null;
      releaseContinuousRender('pfl-f15-catch-sim');
    }

    function stepLoop(nowMs) {
      if (destroyed || (!catchPlaying && !marshModalOpen)) {
        stopRaf();
        return;
      }
      if (!lastAnimMs) lastAnimMs = nowMs;
      const dt = Math.min(0.1, Math.max(0, (nowMs - lastAnimMs) / 1000));
      lastAnimMs = nowMs;

      if (catchPlaying) {
        // Complete full 19.8s landing sequence in ~9.5s real-time playback (19.8s at 0.5x or ~10s at 1x)
        catchProgress += (dt * catchSpeed) / 10.5;
        if (catchProgress >= 1.2) {
          // Hold 2s in chopsticks then loop seamlessly back to Frame 1
          catchProgress = 0.0;
        }
      }
      drawMarshFrame(nowMs);
      if (typeof requestAnimationFrame === 'function') {
        rafHandle = requestAnimationFrame(stepLoop);
      }
    }

    function ensureRaf() {
      if (rafHandle != null || typeof requestAnimationFrame !== 'function')
        return;
      lastAnimMs = 0;
      holdContinuousRender('pfl-f15-catch-sim');
      rafHandle = requestAnimationFrame(stepLoop);
    }

    function syncPlayTriggerActive(isActive) {
      dockPlayBtn?.classList.toggle('active', Boolean(isActive));
      hudRoot
        ?.querySelectorAll('[data-pfl-play-catch-sim]')
        .forEach((btn) => btn.classList.toggle('active', Boolean(isActive)));
    }

    function setMarshModalOpen(nextOpen, { startPlaying = true } = {}) {
      marshModalOpen = Boolean(nextOpen);
      marshModalEl?.classList.toggle('open', marshModalOpen);
      syncPlayTriggerActive(marshModalOpen);
      if (marshModalOpen) {
        catchPlaying = startPlaying;
        if (marshPlayBtn) {
          marshPlayBtn.textContent = catchPlaying ? '⏸ Pause' : '▶ Play';
          marshPlayBtn.classList.toggle('active', catchPlaying);
        }
        applyCesiumOvercastWeather(weatherEnhanced);
        ensureRaf();
        drawMarshFrame(
          typeof performance !== 'undefined' ? performance.now() : 0,
        );
      } else {
        catchPlaying = false;
        applyCesiumOvercastWeather(false);
        restoreMarshCameraFov();
        stopRaf();
      }
    }

    triggerMarshCatchSimImpl = () => {
      const openLauncher = document.querySelector(
        '#first-run-launcher.visible',
      );
      if (openLauncher) {
        openLauncher
          .querySelector('[data-first-run-choice="explore"]')
          ?.click();
        openLauncher.classList.remove('visible');
        openLauncher.setAttribute('hidden', '');
      }
      catchProgress = 0.0;
      setTheaterOpen(false);
      setMarshModalOpen(true, { startPlaying: true });
      flyToMarshCamera({
        duration: 1.25,
        onComplete: () => {
          if (destroyed || !marshModalOpen) return;
          catchProgress = 0.0;
          catchPlaying = true;
          if (marshPlayBtn) {
            marshPlayBtn.textContent = '⏸ Pause';
            marshPlayBtn.classList.add('active');
          }
          ensureRaf();
          drawMarshFrame(
            typeof performance !== 'undefined' ? performance.now() : 0,
          );
        },
      });
      return STARBASE_MARSH_CAM_POSE;
    };

    function installDockButton() {
      const dock = document.getElementById('command-dock');
      if (!dock || destroyed) return false;
      const oldDockBtn = document.getElementById('pfl-s42-dock-btn');
      if (oldDockBtn) oldDockBtn.remove();
      const btn = document.createElement('button');
      btn.id = 'pfl-s42-dock-btn';
      btn.type = 'button';
      btn.setAttribute('data-pfl-play-catch-sim-dock', '1');
      btn.title =
        'Fly camera to Boca Chica Marsh vantage & play 3D Starship S42 GLB re-entry and Mechazilla catch';
      btn.textContent = '▶ Play S42 Catch Sim';
      btn.classList.toggle('active', marshModalOpen);
      btn.addEventListener('click', () => triggerMarshCatchSimImpl?.());
      const locBar = dock.querySelector('#location-bar');
      if (locBar) {
        locBar.insertAdjacentElement('afterend', btn);
      } else {
        dock.appendChild(btn);
      }
      dockPlayBtn = btn;
      return true;
    }

    if (!installDockButton() && typeof MutationObserver !== 'undefined') {
      dockObserver = new MutationObserver(() => {
        if (installDockButton()) {
          dockObserver?.disconnect();
          dockObserver = null;
        }
      });
      dockObserver.observe(document.body, { childList: true, subtree: true });
    }

    function renderStream() {
      const stream =
        STARSHIP_FLIGHT15_EVENT.streams.find((s) => s.id === activeStreamId) ||
        STARSHIP_FLIGHT15_EVENT.streams[0];
      tabsEl.innerHTML = '';
      for (const s of STARSHIP_FLIGHT15_EVENT.streams) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `pfl-f15-btn${s.id === stream.id ? ' active' : ''}`;
        b.textContent = s.label;
        b.addEventListener('click', () => {
          activeStreamId = s.id;
          renderStream();
        });
        tabsEl.appendChild(b);
      }
      noteEl.textContent = stream.cameraNote;
      extEl.href = stream.watchUrl;

      if (stream.embedUrl && theaterOpen) {
        stageEl.innerHTML = `<iframe src="${stream.embedUrl}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen title="${stream.label}"></iframe>`;
      } else if (!stream.embedUrl) {
        stageEl.innerHTML = `<div style="padding:18px;text-align:center">
          <div style="font-size:13px;font-weight:700;color:#f8fafc;margin-bottom:6px">${stream.label}</div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:12px">${stream.cameraNote}</div>
          <a href="${stream.watchUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:7px 14px;border-radius:999px;background:#f97316;color:#fff;font-weight:700;font-size:12px;text-decoration:none">Open Live Feed in New Tab ↗</a>
        </div>`;
      } else {
        stageEl.innerHTML = '';
      }
    }

    function refreshScrubberReadout() {
      const st = updateShipMarker(scrubProgress);
      const altStr =
        st.altM >= 1000
          ? `${(st.altM / 1000).toFixed(1)} km`
          : `${Math.round(st.altM)} m`;
      telemEl.textContent = `ALT ${altStr} · ${st.speedKmh.toLocaleString()} km/h · MACH ${st.mach}`;
      phaseEl.textContent = st.phase;
    }

    function setTheaterOpen(next) {
      theaterOpen = Boolean(next);
      theaterEl.classList.toggle('open', theaterOpen);
      renderStream();
    }

    openStreamImpl = (streamId) => {
      if (
        streamId &&
        STARSHIP_FLIGHT15_EVENT.streams.some((s) => s.id === streamId)
      ) {
        activeStreamId = streamId;
      }
      setTheaterOpen(true);
      return activeStreamId;
    };

    hudRoot.querySelectorAll('[data-pfl-play-catch-sim]').forEach((btn) => {
      btn.addEventListener('click', () => triggerMarshCatchSimImpl?.());
    });

    hudRoot
      .querySelector('[data-pfl-close-marsh]')
      ?.addEventListener('click', () => {
        setMarshModalOpen(false);
      });

    marshPlayBtn?.addEventListener('click', () => {
      catchPlaying = !catchPlaying;
      marshPlayBtn.textContent = catchPlaying ? '⏸ Pause' : '▶ Play';
      marshPlayBtn.classList.toggle('active', catchPlaying);
      if (catchPlaying) ensureRaf();
    });

    hudRoot
      .querySelector('[data-pfl-marsh-restart]')
      ?.addEventListener('click', () => {
        catchProgress = 0.0;
        catchPlaying = true;
        if (marshPlayBtn) {
          marshPlayBtn.textContent = '⏸ Pause';
          marshPlayBtn.classList.add('active');
        }
        ensureRaf();
        drawMarshFrame(
          typeof performance !== 'undefined' ? performance.now() : 0,
        );
      });

    marshWireBtn?.addEventListener('click', () => {
      wireframeEnabled = !wireframeEnabled;
      marshWireBtn.textContent = `GLB Wireframe: ${wireframeEnabled ? 'ON' : 'OFF'}`;
      marshWireBtn.classList.toggle('active', wireframeEnabled);
      drawMarshFrame(
        typeof performance !== 'undefined' ? performance.now() : 0,
      );
    });

    marshWeatherBtn?.addEventListener('click', () => {
      weatherEnhanced = !weatherEnhanced;
      marshWeatherBtn.textContent = `Enhanced Weather: ${weatherEnhanced ? 'ON' : 'OFF'}`;
      marshWeatherBtn.classList.toggle('active', weatherEnhanced);
      applyCesiumOvercastWeather(weatherEnhanced);
      drawMarshFrame(
        typeof performance !== 'undefined' ? performance.now() : 0,
      );
    });

    marshGhostsBtn?.addEventListener('click', () => {
      ghostsEnabled = !ghostsEnabled;
      marshGhostsBtn.textContent = `14-Frame Trail: ${ghostsEnabled ? 'ON' : 'OFF'}`;
      marshGhostsBtn.classList.toggle('active', ghostsEnabled);
      drawMarshFrame(
        typeof performance !== 'undefined' ? performance.now() : 0,
      );
    });

    marshScrubberEl?.addEventListener('input', (ev) => {
      catchPlaying = false;
      if (marshPlayBtn) {
        marshPlayBtn.textContent = '▶ Play';
        marshPlayBtn.classList.remove('active');
      }
      catchProgress = Number(ev.currentTarget.value) / 1000;
      drawMarshFrame(
        typeof performance !== 'undefined' ? performance.now() : 0,
      );
    });

    photoBlendEl?.addEventListener('input', (ev) => {
      photoBlend = Number(ev.currentTarget.value) / 100;
      if (photoPctEl)
        photoPctEl.textContent = `${Math.round(photoBlend * 100)}%`;
      drawMarshFrame(
        typeof performance !== 'undefined' ? performance.now() : 0,
      );
    });

    // Browser MediaRecorder WebM Export from Live Canvas (click again while recording to stop early)
    recordBtn?.addEventListener('click', () => {
      if (activeRecorder && activeRecorder.state === 'recording') {
        if (activeRecordStopTimer) {
          clearTimeout(activeRecordStopTimer);
          activeRecordStopTimer = null;
        }
        recordBtn.textContent = '⏳ Finalizing WebM...';
        activeRecorder.stop();
        return;
      }
      if (!marshCanvas?.captureStream || typeof MediaRecorder === 'undefined') {
        if (exportBoxEl) {
          exportBoxEl.style.display = 'block';
          exportBoxEl.innerHTML =
            '<span style="color:#fb7185">MediaRecorder not supported in this browser context.</span>';
        }
        return;
      }
      recordBtn.textContent = '⏹ Stop & Export (10.5s)';
      recordBtn.classList.add('active');
      catchProgress = 0.0;
      catchPlaying = true;
      if (marshPlayBtn) {
        marshPlayBtn.textContent = '⏸ Pause';
        marshPlayBtn.classList.add('active');
      }
      ensureRaf();

      const stream = marshCanvas.captureStream(30);
      const mimeType = MediaRecorder.isTypeSupported?.('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      activeRecorder = recorder;
      const chunks = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };
      recorder.onstop = () => {
        activeRecorder = null;
        if (activeRecordStopTimer) {
          clearTimeout(activeRecordStopTimer);
          activeRecordStopTimer = null;
        }
        stream.getTracks?.().forEach((t) => t.stop?.());
        if (lastExportUrl) {
          URL.revokeObjectURL(lastExportUrl);
          lastExportUrl = null;
        }
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        lastExportUrl = url;
        recordBtn.classList.remove('active');
        recordBtn.textContent = '⏺ Record WebM Video';
        if (exportBoxEl) {
          exportBoxEl.style.display = 'block';
          exportBoxEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <span style="color:#86efac;font-weight:700">Recorded WebM Ready (${Math.round(blob.size / 1024)} KB)</span>
              <a href="${url}" download="starship-s42-marsh-catch-sim.webm" style="color:#38bdf8;font-family:'JetBrains Mono',monospace;text-decoration:none">Download .webm ⬇</a>
            </div>
            <video src="${url}" controls loop autoplay muted style="width:100%;max-height:190px;border-radius:8px;background:#020617"></video>
          `;
        }
      };
      recorder.start(250);
      activeRecordStopTimer = setTimeout(() => {
        activeRecordStopTimer = null;
        if (recorder.state === 'recording') recorder.stop();
      }, 10500);
    });

    hudRoot
      .querySelector('[data-pfl-toggle-theater]')
      ?.addEventListener('click', () => {
        setTheaterOpen(!theaterOpen);
      });
    hudRoot
      .querySelector('[data-pfl-close-theater]')
      ?.addEventListener('click', () => {
        setTheaterOpen(false);
      });

    hudRoot.querySelectorAll('[data-pfl-fly]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-pfl-fly');
        if (target !== 'marsh') restoreMarshCameraFov();
        if (target === 'starbase') flyToStarbaseCatch();
        else if (target === 'marsh') flyToMarshCamera();
        else if (target === 'corridor') flyToFullCorridor();
        else if (target === 'liverpool') flyToLiverpoolNode();
        else if (target === 'birdpond') flyToBirdPond();
        else if (target === 'ship42') flyToShip42();
      });
    });

    hudRoot.querySelector('[data-pfl-open-kalshi]')?.addEventListener('click', () => {
      const box = document.getElementById('pfl-win-kalshi-arena');
      if (box) {
        box.style.display = 'flex';
        box.classList.remove('pfl-minimized');
        const minBtn = box.querySelector('[data-act="min"]');
        if (minBtn) minBtn.textContent = '—';
        box.style.zIndex = '9680';
      } else {
        window.location.href = '/kalshi-paper.html';
      }
    });
    hudRoot.querySelector('[data-pfl-open-holodeck]')?.addEventListener('click', () => {
      window.open('http://127.0.0.1:8766', '_blank', 'noopener');
    });
    hudRoot.querySelector('[data-pfl-edit-photos]')?.addEventListener('click', () => {
      if (typeof window.__pflToggleArrangeYard === 'function') {
        window.__pflToggleArrangeYard();
      } else {
        (document.getElementById('gev-arrange-toggle') || document.getElementById('gev-arrange-dock-btn'))?.click();
      }
    });

    neo4jBtn?.addEventListener('click', () => {
      const layer = neo4jLayer || window.__pflNeo4jLayer;
      if (!layer) return;
      const nowVis = layer.toggleVisible();
      neo4jBtn.textContent = `Neo4j 3D: ${nowVis ? 'ON' : 'OFF'}`;
      neo4jBtn.classList.toggle('active', nowVis);
    });

    hudRoot
      .querySelector('[data-pfl-inspect-neo4j]')
      ?.addEventListener('click', () => {
        const layer = neo4jLayer || window.__pflNeo4jLayer;
        if (!layer?.selectNode) return;
        if (!layer.isVisible()) {
          layer.setVisible(true);
          if (neo4jBtn) {
            neo4jBtn.textContent = 'Neo4j 3D: ON';
            neo4jBtn.classList.add('active');
          }
        }
        layer.selectNode(layer.getSelectedNodeId?.() || 'sb-flight15-event', {
          expand: true,
          openHud: true,
        });
      });

    scrubberEl?.addEventListener('input', (ev) => {
      liveClockSync = false;
      scrubProgress = Number(ev.currentTarget.value) / 100;
      refreshScrubberReadout();
    });

    const tick = () => {
      const cd = formatEventCountdown(
        Date.now(),
        STARSHIP_FLIGHT15_EVENT.catchTargetUtcMs,
      );
      if (countdownEl) countdownEl.textContent = cd.formatted;
      if (
        liveClockSync &&
        cd.diffMs <= 19 * 60 * 1000 &&
        cd.diffMs >= -60 * 1000
      ) {
        const autoP = 1 - Math.max(0, cd.diffMs) / (19 * 60 * 1000);
        scrubProgress = autoP;
        if (scrubberEl) scrubberEl.value = String(Math.round(autoP * 100));
        refreshScrubberReadout();
      }
    };

    refreshScrubberReadout();
    updateCatchSimEntities(0);
    tick();
    timerHandle = setInterval(tick, 1000);
  }

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    catchPlaying = false;
    if (activeRecordStopTimer) {
      clearTimeout(activeRecordStopTimer);
      activeRecordStopTimer = null;
    }
    if (activeRecorder && activeRecorder.state === 'recording') {
      try {
        activeRecorder.stop();
      } catch {
        // Ignore recorder stop failure during teardown
      }
    }
    activeRecorder = null;
    if (lastExportUrl) {
      URL.revokeObjectURL(lastExportUrl);
      lastExportUrl = null;
    }
    if (dockObserver) {
      dockObserver.disconnect();
      dockObserver = null;
    }
    if (dockPlayBtn) {
      dockPlayBtn.remove();
      dockPlayBtn = null;
    }
    if (marshModalOpen || prevSkyBright != null) {
      applyCesiumOvercastWeather(false);
    }
    restoreMarshCameraFov();
    marshModalOpen = false;
    if (rafHandle != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafHandle);
    }
    rafHandle = null;
    releaseContinuousRender('pfl-f15-catch-sim');
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = null;
    if (hudRoot) hudRoot.remove();
    hudRoot = null;
    if (viewer?.entities) {
      for (const ent of entities) viewer.entities.remove(ent);
    }
    entities.length = 0;
    if (typeof window !== 'undefined' && window.__pflStarshipTheater === api) {
      delete window.__pflStarshipTheater;
    }
    governorRequestRender('pfl-f15-destroy');
  };

  const api = {
    event: STARSHIP_FLIGHT15_EVENT,
    marshCamPose: STARBASE_MARSH_CAM_POSE,
    catch14Frames: SHIP42_CATCH_14_FRAMES,
    entities,
    updateShipMarker,
    updateCatchSimEntities,
    openStream: (streamId) =>
      openStreamImpl ? openStreamImpl(streamId) : null,
    playCatchSim: () =>
      triggerMarshCatchSimImpl ? triggerMarshCatchSimImpl() : null,
    flyToStarbaseCatch,
    flyToMarshCamera,
    flyToFullCorridor,
    flyToLiverpoolNode,
    flyToBirdPond,
    flyToShip42,
    destroy,
  };

  if (typeof window !== 'undefined') {
    window.__pflStarshipTheater = api;
  }
  governorRequestRender('pfl-f15-load');
  return api;
}
