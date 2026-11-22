import * as Cesium from 'cesium';
import { governorRequestRender } from '../renderGovernor.js';
import { STORED_GROUND_HEIGHT_M } from './placedObjects.js';
import { activeYardDatumM } from './yardFrames.js';
import { cameraFlightActive } from '../render/cesium/internals.js';

export const SOCCER_TIMELINE_DURATION_S = 24.0;
export const RUN_STRIDE_CYCLE_S = 0.6667;
export const RUN_STRIDE_LEN_M = 2.35;
export const RUN_SPEED_MPS = RUN_STRIDE_LEN_M / RUN_STRIDE_CYCLE_S; // ~3.525 m/s matched to Mixamo Run
export const WALK_SPEED_MPS = 0.85; // ~0.85 m/s matched to 4.6s slow walk cycle

const BALL_RADIUS_M = 0.24;
const BASE_MODEL_URL = `${import.meta.env?.BASE_URL || '/'}models/`;
const MODELS = Object.freeze({
  lisaSailor: `${BASE_MODEL_URL}lisa-soccer.glb`,
  girlCl: `${BASE_MODEL_URL}girl-cl.glb`,
  girlShorts: `${BASE_MODEL_URL}girl-shorts.glb`,
  paulNasa: `${BASE_MODEL_URL}paul-soccer.glb`,
  paulVest: `${BASE_MODEL_URL}paul-vest.glb`,
  michaelGold: `${BASE_MODEL_URL}michael-soccer.glb`,
});

// Across Palm Drive open grass field vs Palm Drive painted center stripe (~105 deg ESE Palm Drive alignment)
const TRACK_ORIGINS = Object.freeze({
  field: Object.freeze({ lat: 29.247202, lon: -95.231385, yawDeg: -15.0, label: 'Across-St. Stadium + 3v3' }),
  stripe: Object.freeze({ lat: 29.247355, lon: -95.231385, yawDeg: -15.0, label: 'Palm Dr Center Stripe' }),
});

const SCOREBOARD_STORAGE_KEY = 'pfl_stadium_scoreboard_v1';

function enuTrackToLatLonAlt(xAlongM, yAcrossM, altM, trackMode = 'field') {
  const orig = TRACK_ORIGINS[trackMode] || TRACK_ORIGINS.field;
  const r = Cesium.Math.toRadians(orig.yawDeg || 0);
  const dEastM = xAlongM * Math.cos(r) - yAcrossM * Math.sin(r);
  const dNorthM = xAlongM * Math.sin(r) + yAcrossM * Math.cos(r);
  const lat = orig.lat + dNorthM / 111320;
  const lon = orig.lon + dEastM / (111320 * Math.cos(Cesium.Math.toRadians(orig.lat)));
  return { lat, lon, altM, cart: Cesium.Cartesian3.fromDegrees(lon, lat, altM) };
}

function defaultScoreboardState() {
  const ctr = enuTrackToLatLonAlt(0, -11.4, 0, 'field');
  return {
    lat: ctr.lat,
    lon: ctr.lon,
    heading: 345,
    tilt: 0,
    lift: 0,
    scale: 1,
    opacity: 1,
  };
}

function readStoredScoreboardState() {
  const fb = defaultScoreboardState();
  try {
    if (typeof localStorage === 'undefined') return fb;
    const raw = JSON.parse(localStorage.getItem(SCOREBOARD_STORAGE_KEY) || 'null');
    if (!raw || !Number.isFinite(Number(raw.lat)) || !Number.isFinite(Number(raw.lon))) return fb;
    return {
      lat: Number(raw.lat),
      lon: Number(raw.lon),
      heading: Number.isFinite(Number(raw.heading)) ? Number(raw.heading) : fb.heading,
      tilt: Number.isFinite(Number(raw.tilt)) ? Math.max(-90, Math.min(90, Number(raw.tilt))) : 0,
      lift: Number.isFinite(Number(raw.lift)) ? Math.max(-35, Math.min(35, Number(raw.lift))) : 0,
      scale: Number(raw.scale) > 0 ? Math.max(0.25, Math.min(3.5, Number(raw.scale))) : 1,
      opacity: Number.isFinite(Number(raw.opacity)) ? Math.max(0.05, Math.min(1, Number(raw.opacity))) : 1,
    };
  } catch {
    return fb;
  }
}

function writeStoredScoreboardState(st) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SCOREBOARD_STORAGE_KEY, JSON.stringify(st));
    }
  } catch {}
}

function computeScoreboardBasis(state, groundAltM) {
  const origin = Cesium.Cartesian3.fromDegrees(state.lon, state.lat, groundAltM + (state.lift || 0));
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(origin);
  const h = Cesium.Math.toRadians(state.heading || 0);
  const t = Cesium.Math.toRadians(state.tilt || 0);
  const sinH = Math.sin(h);
  const cosH = Math.cos(h);
  const cosT = Math.cos(t);
  const sinT = Math.sin(t);
  const rightLocal = new Cesium.Cartesian3(-cosH, sinH, 0);
  const fwdLocal = new Cesium.Cartesian3(sinH * cosT, cosH * cosT, sinT);
  const upLocal = new Cesium.Cartesian3(-sinH * sinT, -cosH * sinT, cosT);
  const toWorldVec = (v) => Cesium.Matrix4.multiplyByPointAsVector(enu, v, new Cesium.Cartesian3());
  const right = Cesium.Cartesian3.normalize(toWorldVec(rightLocal), new Cesium.Cartesian3());
  const fwd = Cesium.Cartesian3.normalize(toWorldVec(fwdLocal), new Cesium.Cartesian3());
  const up = Cesium.Cartesian3.normalize(toWorldVec(upLocal), new Cesium.Cartesian3());
  return { origin, right, fwd, up };
}

function scoreboardWorldPoint(basis, rOff, fOff, uOff) {
  const p = Cesium.Cartesian3.clone(basis.origin);
  Cesium.Cartesian3.add(p, Cesium.Cartesian3.multiplyByScalar(basis.right, rOff, new Cesium.Cartesian3()), p);
  Cesium.Cartesian3.add(p, Cesium.Cartesian3.multiplyByScalar(basis.fwd, fOff, new Cesium.Cartesian3()), p);
  Cesium.Cartesian3.add(p, Cesium.Cartesian3.multiplyByScalar(basis.up, uOff, new Cesium.Cartesian3()), p);
  return p;
}

/**
 * Double-sided, non-mirrored 3D primitive quad pair for the 417 Palm Stadium Jumbotron.
 * Both front and back faces carry outward normals, CCW winding, and left-to-right upright UVs
 * so text is always readable from any viewpoint without polygon flipping or blinking.
 */
function buildScoreboardPrimitive(state, groundAltM, material, pickEntity) {
  const basis = computeScoreboardBasis(state, groundAltM);
  const sc = Math.max(0.25, Math.min(3.5, Number(state.scale) || 1));
  const hw = 3.4 * sc;
  const zBot = 2.35 * sc;
  const zTop = 4.95 * sc;
  const ht = 0.14 * sc;

  const corners = [
    // Front face (+fwd): BL, BR, TR, TL
    scoreboardWorldPoint(basis, -hw, ht, zBot),
    scoreboardWorldPoint(basis, hw, ht, zBot),
    scoreboardWorldPoint(basis, hw, ht, zTop),
    scoreboardWorldPoint(basis, -hw, ht, zTop),
    // Back face (-fwd): swapped horizontal so text also reads left-to-right from behind
    scoreboardWorldPoint(basis, hw, -ht, zBot),
    scoreboardWorldPoint(basis, -hw, -ht, zBot),
    scoreboardWorldPoint(basis, -hw, -ht, zTop),
    scoreboardWorldPoint(basis, hw, -ht, zTop),
  ];

  const posArr = new Float64Array(8 * 3);
  const normArr = new Float32Array(8 * 3);
  for (let i = 0; i < 8; i++) {
    posArr[i * 3] = corners[i].x;
    posArr[i * 3 + 1] = corners[i].y;
    posArr[i * 3 + 2] = corners[i].z;
    const sign = i < 4 ? 1 : -1;
    normArr[i * 3] = basis.fwd.x * sign;
    normArr[i * 3 + 1] = basis.fwd.y * sign;
    normArr[i * 3 + 2] = basis.fwd.z * sign;
  }

  const stArr = new Float32Array([
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
  ]);
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
  ]);

  const geometry = new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: posArr,
      }),
      normal: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.FLOAT,
        componentsPerAttribute: 3,
        values: normArr,
      }),
      st: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.FLOAT,
        componentsPerAttribute: 2,
        values: stArr,
      }),
    },
    indices,
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: Cesium.BoundingSphere.fromVertices(posArr),
  });

  const opacity = Number.isFinite(Number(state.opacity)) ? Math.max(0.05, Math.min(1, Number(state.opacity))) : 1;
  return new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({ geometry, id: pickEntity }),
    appearance: new Cesium.MaterialAppearance({
      flat: true,
      faceForward: false,
      closed: false,
      translucent: opacity < 0.99,
      materialSupport: Cesium.MaterialAppearance.MaterialSupport.TEXTURED,
      material,
      renderState: {
        cull: { enabled: true, face: Cesium.CullFace.BACK },
      },
    }),
    asynchronous: false,
  });
}

function makeSoccerBallDataUrl() {
  if (typeof document === 'undefined') return undefined;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (!ctx) return undefined;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#0f172a';
  for (let r = 0; r < 4; r++) {
    for (let col = 0; col < 8; col++) {
      if ((r + col) % 2 === 0) {
        ctx.beginPath();
        ctx.arc(16 + col * 32, 16 + r * 32, 11, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  return c.toDataURL('image/png');
}

function drawScoreboardCanvas(canvas, girlsScore, boysScore, clockSec, phaseText) {
  if (!canvas) return canvas;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.fillStyle = '#040916';
  ctx.fillRect(0, 0, 512, 224);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 504, 216);

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(16, 16, 480, 40);
  ctx.fillStyle = '#fde047';
  ctx.font = '800 22px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`417 PALM STADIUM · ${clockSec.toFixed(1).padStart(4, '0')}s / 24s`, 256, 44);

  // Girls vs Boys Score
  ctx.fillStyle = '#f472b6';
  ctx.font = '800 28px Inter, Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('GIRLS', 36, 102);

  ctx.fillStyle = '#38bdf8';
  ctx.textAlign = 'right';
  ctx.fillText('BOYS', 476, 102);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 56px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${girlsScore}  :  ${boysScore}`, 256, 140);

  ctx.fillStyle = '#064e3b';
  ctx.fillRect(24, 162, 464, 44);
  ctx.fillStyle = '#6ee7b7';
  ctx.font = '700 20px Inter, Arial, sans-serif';
  ctx.fillText(String(phaseText || 'MATCH IN PLAY').slice(0, 38), 256, 191);
  return canvas;
}

function lerp(a, b, u) {
  const c = Math.max(0, Math.min(1, u));
  return a + (b - a) * c;
}

export function makeAvatarLightShader(mode = 'bright') {
  if (mode === 'sun' || typeof Cesium.CustomShader !== 'function') return undefined;
  try {
    if (mode === 'bright') {
      return new Cesium.CustomShader({
        lightingModel: Cesium.LightingModel.UNLIT,
        fragmentShaderText: `
          void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
            material.diffuse = min(vec3(1.0), material.diffuse * 1.12);
          }
        `,
      });
    }
    return new Cesium.CustomShader({
      lightingModel: Cesium.LightingModel.PBR,
      fragmentShaderText: `
        void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
          material.emissive += material.diffuse * 0.65;
        }
      `,
    });
  } catch {
    return undefined;
  }
}

function moveSegment(x0, y0, x1, y1, u) {
  const x = lerp(x0, x1, u);
  const y = lerp(y0, y1, u);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const h = Math.hypot(dx, dy) > 0.05 ? Math.atan2(dy, dx) : 0;
  return { x, y, headingRad: h };
}

/**
 * Pure deterministic 24.0s 3v3 Girls vs Boys Soccer Match evaluator with official soccer rules:
 * - Zero boxing stances (all Boys use Kick / Run / Idle / Walk)
 * - Slow sideline keeper/coach movement capped <= WALK_SPEED_MPS (0.85 m/s) to eliminate skating
 * - Woot celebrations ONLY when a goal is actually scored
 * - Real Out-of-Bounds Sideline Throw-In (player retrieves & throws ball back onto pitch!)
 */
export function evaluateSoccerTimeline(tRaw, _trackMode = 'field') {
  const t = ((Number(tRaw) % SOCCER_TIMELINE_DURATION_S) + SOCCER_TIMELINE_DURATION_S) % SOCCER_TIMELINE_DURATION_S;
  const V = RUN_SPEED_MPS;

  // Girls #10 Lisa Sailor: striker (East attack -> celebrates goal -> resets cleanly to kickoff)
  let lisaX = -10.5;
  let lisaY = 0.0;
  let lisaHeadingRad = 0.0;
  let lisaAnim = 'Run';
  let lisaClipTime = t;
  let lisaLoop = true;

  // Girls #7 Girl Casual: winger (passes kickoff -> runs to Bayou sideline y=+9.6m to take Throw-In -> returns)
  let girlClX = -2.0;
  let girlClY = 3.5;
  let girlClHeading = 0.0;
  let girlClAnim = 'Idle';
  let girlClClip = t;
  let girlClLoop = true;

  // Girls #1 Girl Shorts: West Goal Keeper (faces East at x=-15.5m)
  let girlGkX = -15.5;
  let girlGkY = 0.0;
  let girlGkHeading = 0.0;
  let girlGkAnim = 'Idle';
  let girlGkClip = t;

  // Boys #9 Paul NASA: striker (defends -> intercepts -> counter-attacks West -> real Kick goal at 17.5s!)
  let paulX = 6.0;
  let paulY = -1.5;
  let paulHeading = Math.PI;
  let paulAnim = 'Idle';
  let paulClip = t;
  let paulLoop = true;

  // Boys #11 Paul Vest/Tie: midfielder support (drops in defense, leads counter-attack pass)
  let paulVestX = 2.5;
  let paulVestY = 4.2;
  let paulVestHeading = Math.PI;
  let paulVestAnim = 'Idle';
  let paulVestClip = t;

  // Boys #1 Michael Gold: East Keeper / Spectator-style slow stride (capped <= 0.85 m/s, zero slide!)
  let michaelX = 15.3;
  let michaelY = 0.0;
  let michaelHeading = Math.PI;
  let michaelAnim = 'Walk';
  let michaelClip = t;

  // Ball & Scoreboard
  let ballX = 0.0;
  let ballY = 0.0;
  let ballZ = BALL_RADIUS_M;
  let girlsScore = 0;
  let boysScore = 0;
  let phaseLabel = '⚽ KICKOFF! GIRLS vs BOYS';

  if (t < 3.0) {
    // 0.0..3.0: Girls #7 taps kickoff to Lisa #10 running forward at exact 3.525 m/s
    const u = t / 3.0;
    lisaX = -10.575 + t * V; // arrives at x = 0.0 at t=3.0
    lisaY = 0.0;
    lisaHeadingRad = 0;
    lisaAnim = 'Run';
    girlClX = lerp(-0.5, 4.5, u);
    girlClY = lerp(1.0, 4.2, u);
    girlClAnim = 'Run';
    girlClClip = t;
    ballX = lerp(-0.5, 1.05, Math.min(1, t / 1.5));
    if (t >= 1.5) ballX = lisaX + 1.05;
    phaseLabel = '⚽ GIRLS BUILD ATTACK';
  } else if (t < 4.3) {
    // 3.0..4.3: Lisa strikes first shot at East Goal -> Michael parries out over Bayou sideline!
    lisaX = 0.0;
    lisaHeadingRad = 0;
    lisaAnim = 'Kick';
    lisaClipTime = t - 3.0;
    lisaLoop = false;
    girlClX = 4.5;
    girlClY = 4.2;
    girlClAnim = 'Idle';
    michaelY = lerp(-0.6, 0.8, (t - 3.0) / 1.3); // < 1.1 m/s
    michaelAnim = 'Walk';
    if (t < 3.55) {
      ballX = 1.05;
    } else {
      const dt = t - 3.55;
      ballX = lerp(1.05, 14.5, Math.min(1, dt / 0.75));
      ballZ = BALL_RADIUS_M + Math.sin(Math.min(1, dt / 0.75) * Math.PI) * 1.4;
    }
    phaseLabel = '🦵 LISA STRIKES · KEEPER PARRIES!';
  } else if (t < 6.4) {
    // 4.3..6.4: Keeper deflection launches ball OUT OF BOUNDS over North Bayou sideline (y = +9.4m)
    const u = (t - 4.3) / 2.1;
    lisaX = lerp(0.0, 5.5, u); // gentle jog
    lisaY = lerp(0.0, 2.0, u);
    lisaAnim = 'Run';
    lisaClipTime = t - 4.3;
    const gP = moveSegment(4.5, 4.2, 8.2, 9.6, Math.min(1, u * 1.1));
    girlClX = gP.x; girlClY = gP.y; girlClHeading = gP.headingRad; girlClAnim = 'Run'; girlClClip = t - 4.3;
    ballX = lerp(14.5, 8.2, Math.min(1, u * 1.2));
    ballY = lerp(0.0, 9.4, Math.min(1, u * 1.2));
    ballZ = BALL_RADIUS_M + Math.sin(Math.min(1, u * 1.2) * Math.PI) * 1.1;
    phaseLabel = '🏳️ OUT OF BOUNDS! THROW-IN';
  } else if (t < 10.0) {
    // 6.4..10.0: OFFICIAL THROW-IN RULE — Girl #7 picks ball up at sideline (y=+9.6m) & throws in to Lisa!
    const sub = t - 6.4;
    lisaX = 5.5;
    lisaY = 2.0;
    lisaHeadingRad = Math.PI * 0.4;
    lisaAnim = 'Idle';
    girlClX = 8.2;
    girlClY = 9.6;
    girlClHeading = -Math.PI * 0.65;
    if (sub < 1.8) {
      girlClAnim = 'Idle';
      ballX = 8.2;
      ballY = 9.2;
      ballZ = sub < 0.7 ? BALL_RADIUS_M : lerp(BALL_RADIUS_M, 1.92, (sub - 0.7) / 1.1);
      phaseLabel = '🙌 SIDELINE THROW-IN READY';
    } else if (sub < 3.0) {
      girlClAnim = 'Woot'; // Overhead throw follow-through
      girlClClip = (sub - 1.8) * 1.4;
      const tu = (sub - 1.8) / 1.2;
      ballX = lerp(8.2, 6.4, tu);
      ballY = lerp(9.2, 2.2, tu);
      ballZ = lerp(1.92, BALL_RADIUS_M, tu * tu) + Math.sin(tu * Math.PI) * 1.3;
      phaseLabel = '⚽ THROW-IN BACK IN PLAY!';
    } else {
      girlClAnim = 'Idle';
      ballX = 6.4;
      ballY = 2.0;
      phaseLabel = '⚽ LISA TRAPS THROW-IN';
    }
  } else if (t < 13.8) {
    // 10.0..13.8: Lisa receives pass, fires clean Kick at 11.4s -> GOAL FOR GIRLS (1-0)!
    const sub = t - 10.0;
    if (sub < 1.4) {
      const m = moveSegment(5.5, 2.0, 7.2, 0.2, sub / 1.4);
      lisaX = m.x; lisaY = m.y; lisaHeadingRad = m.headingRad;
      lisaAnim = 'Run'; lisaClipTime = sub;
      ballX = m.x + 0.9; ballY = m.y;
      phaseLabel = '🏃 LISA CUTS INSIDE!';
    } else if (sub < 2.7) {
      lisaX = 7.2; lisaY = 0.2; lisaHeadingRad = 0;
      lisaAnim = 'Kick'; lisaClipTime = sub - 1.4; lisaLoop = false;
      const ku = Math.max(0, Math.min(1, (sub - 1.9) / 0.8));
      ballX = lerp(8.1, 16.5, ku);
      ballY = lerp(0.2, -0.3, ku);
      ballZ = BALL_RADIUS_M + Math.sin(ku * Math.PI) * 1.65;
      if (sub >= 2.55) girlsScore = 1;
      phaseLabel = girlsScore ? '🥅 GOOOAL!! GIRLS 1 - 0!' : '🦵 LISA SHOOTS!';
    } else {
      girlsScore = 1;
      lisaX = 7.2; lisaY = 0.2; lisaHeadingRad = 0;
      lisaAnim = 'Woot'; lisaClipTime = sub - 2.7; // Celebrate ONLY on actual goal!
      girlClX = 6.5; girlClY = 5.0; girlClAnim = 'Woot'; girlClClip = sub - 2.7;
      michaelAnim = 'Idle';
      ballX = 16.5; ballY = -0.3;
      phaseLabel = '🙌 GOAL! GIRLS 1 : 0 BOYS';
    }
  } else if (t < 19.6) {
    // 13.8..19.6: Boys Restart -> Paul Vest passes to Paul NASA -> NASA executes real Kick (ZERO boxing!) -> BOYS GOAL (1-1)!
    girlsScore = 1;
    const sub = t - 13.8;
    // Girls recover defensively at Run stride speed
    const lu = Math.min(1, sub / 3.0);
    lisaX = lerp(7.2, -2.5, lu);
    lisaY = lerp(0.2, 1.8, lu);
    lisaHeadingRad = Math.PI;
    lisaAnim = lu < 1 ? 'Run' : 'Idle';
    lisaClipTime = sub;

    const pStart = 8.0;
    if (sub < 2.8) {
      const pm = moveSegment(pStart, -2.0, -3.5, -0.4, sub / 2.8);
      paulX = pm.x; paulY = pm.y; paulHeading = pm.headingRad;
      paulAnim = 'Run'; paulClip = sub;
      paulVestX = lerp(2.5, -1.0, sub / 2.8);
      paulVestY = lerp(4.2, -4.0, sub / 2.8);
      paulVestHeading = Math.PI; paulVestAnim = 'Run'; paulVestClip = sub;
      ballX = pm.x - 1.0; ballY = pm.y;
      phaseLabel = '⚡ BOYS COUNTER-ATTACK!';
    } else if (sub < 4.1) {
      paulX = -3.5; paulY = -0.4; paulHeading = Math.PI;
      paulAnim = 'Kick'; paulClip = sub - 2.8; paulLoop = false; // Real soccer kick!
      const ku = Math.max(0, Math.min(1, (sub - 3.3) / 0.8));
      ballX = lerp(-4.5, -16.6, ku);
      ballY = lerp(-0.4, 0.4, ku);
      ballZ = BALL_RADIUS_M + Math.sin(ku * Math.PI) * 1.5;
      if (sub >= 4.0) boysScore = 1;
      phaseLabel = boysScore ? '🥅 GOAL!! BOYS TIE 1 - 1!' : '🦵 PAUL STRIKES WEST!';
    } else {
      boysScore = 1;
      paulX = -3.5; paulY = -0.4; paulAnim = 'Woot'; paulClip = sub - 4.1;
      paulVestX = -1.0; paulVestY = -4.0; paulVestAnim = 'Woot'; paulVestClip = sub - 4.1;
      ballX = -16.6; ballY = 0.4;
      phaseLabel = '🔥 EQUALIZER! GIRLS 1 : 1 BOYS';
    }
  } else {
    // 19.6..24.0: Smooth return to center kickoff positions (Michael <= 0.85 m/s slow stride!)
    girlsScore = 1;
    boysScore = 1;
    const u = (t - 19.6) / 4.4;
    const lm = moveSegment(-2.5, 1.8, -10.575, 0.0, u);
    lisaX = lm.x; lisaY = lm.y; lisaHeadingRad = lm.headingRad;
    lisaAnim = 'Run'; lisaClipTime = t - 19.6;

    const cm = moveSegment(6.5, 5.0, -2.0, 3.5, u);
    girlClX = cm.x; girlClY = cm.y; girlClHeading = cm.headingRad;
    girlClAnim = 'Run'; girlClClip = t - 19.6;

    const pm = moveSegment(-3.5, -0.4, 6.0, -1.5, u);
    paulX = pm.x; paulY = pm.y; paulHeading = pm.headingRad;
    paulAnim = 'Run'; paulClip = t - 19.6;

    const vm = moveSegment(-1.0, -4.0, 2.5, 4.2, u);
    paulVestX = vm.x; paulVestY = vm.y; paulVestHeading = vm.headingRad;
    paulVestAnim = 'Run'; paulVestClip = t - 19.6;

    ballX = lerp(-16.6, -0.5, u);
    ballY = lerp(0.4, 0.0, u);
    ballZ = BALL_RADIUS_M + Math.sin(u * Math.PI) * 1.1;
    phaseLabel = '🔄 RESET FOR NEXT KICKOFF';
  }

  // Keep keeper / spectator walk strictly <= WALK_SPEED_MPS (0.85 m/s) so feet match stride 100%
  if (t >= 4.3 && (t < 12.7 || t > 13.8)) {
    const walkWave = Math.sin((t / SOCCER_TIMELINE_DURATION_S) * Math.PI * 2);
    michaelY = walkWave * 1.8; // Peak velocity = 1.8 * (2*PI/24) = 0.47 m/s — ZERO foot slide!
    michaelX = 15.3;
    michaelHeading = Math.PI;
    michaelAnim = (t >= 18.0 && t <= 19.8) ? 'Dance' : 'Walk';
  }

  const activeAutoCam =
    t < 3.4 ? 'dolly1'
    : t < 6.4 ? 'face4'
    : t < 10.2 ? 'follow2'
    : t < 13.8 ? 'face4'
    : t < 18.8 ? 'follow2'
    : 'aerial3';

  return {
    t,
    lisaX,
    lisaY,
    lisaHeadingRad,
    lisaDir: Math.cos(lisaHeadingRad) >= 0 ? 1 : -1,
    lisaAnim,
    lisaClipTime,
    lisaLoop,
    girlClX,
    girlClY,
    girlClHeading,
    girlClAnim,
    girlClClip,
    girlClLoop,
    girlGkX,
    girlGkY,
    girlGkHeading,
    girlGkAnim,
    girlGkClip,
    paulX,
    paulY,
    paulHeadingRad: paulHeading,
    paulDir: Math.cos(paulHeading) >= 0 ? 1 : -1,
    paulAnim,
    paulClipTime: paulClip,
    paulLoop,
    paulVestX,
    paulVestY,
    paulVestHeading,
    paulVestAnim,
    paulVestClip,
    michaelX,
    michaelY,
    michaelHeadingRad: michaelHeading,
    michaelAnim,
    michaelClipTime: michaelClip,
    ballX,
    ballY,
    ballZ,
    ballSpin: -ballX / BALL_RADIUS_M,
    phaseLabel,
    lisaScore: girlsScore,
    paulScore: boysScore,
    activeAutoCam,
  };
}

/**
 * Compute world-space camera pose for each independent broadcast dolly camera track.
 */
export function evaluateSoccerDollyCam(camId, tRaw, matchState, groundM, trackMode = 'field') {
  const t = ((Number(tRaw) % SOCCER_TIMELINE_DURATION_S) + SOCCER_TIMELINE_DURATION_S) % SOCCER_TIMELINE_DURATION_S;
  const chosen = camId === 'auto' ? matchState.activeAutoCam : camId;
  let camCoord;
  let lookCoord;
  const hx = Math.cos(matchState.lisaHeadingRad ?? (matchState.lisaDir > 0 ? 0 : Math.PI));
  const hy = Math.sin(matchState.lisaHeadingRad ?? 0);

  if (chosen === 'dolly1') {
    const dollyX = lerp(-12, 12, (Math.sin((t / SOCCER_TIMELINE_DURATION_S) * Math.PI * 2 - Math.PI * 0.5) + 1) * 0.5);
    camCoord = enuTrackToLatLonAlt(dollyX, -15.5, groundM + 4.8, trackMode);
    lookCoord = enuTrackToLatLonAlt(matchState.ballX * 0.45 + matchState.lisaX * 0.55, matchState.ballY * 0.4 + 2.5, groundM + 1.4, trackMode);
  } else if (chosen === 'face4') {
    // Cam 4: Front-Angle Hero Face Close-Up framing Lisa's bright face + teammates/stadium behind!
    const fDist = 3.2;
    const sDist = 1.45;
    camCoord = enuTrackToLatLonAlt(
      matchState.lisaX + hx * fDist - hy * sDist,
      matchState.lisaY + hy * fDist + hx * sDist,
      groundM + 1.58,
      trackMode,
    );
    lookCoord = enuTrackToLatLonAlt(matchState.lisaX - hx * 0.4, matchState.lisaY - hy * 0.4, groundM + 1.32, trackMode);
  } else if (chosen === 'follow2') {
    const offsetBackX = -hx * 5.2;
    const offsetBackY = -hy * 5.2 - hx * 2.4;
    camCoord = enuTrackToLatLonAlt(matchState.lisaX + offsetBackX, matchState.lisaY + offsetBackY, groundM + 2.55, trackMode);
    lookCoord = enuTrackToLatLonAlt(matchState.lisaX + hx * 1.4, matchState.lisaY + hy * 1.4, groundM + 1.05, trackMode);
  } else {
    const ang = (t / SOCCER_TIMELINE_DURATION_S) * Math.PI * 2;
    camCoord = enuTrackToLatLonAlt(Math.cos(ang) * 20, -21 + Math.sin(ang) * 5, groundM + 13.8, trackMode);
    lookCoord = enuTrackToLatLonAlt(0, 1.5, groundM + 1.2, trackMode);
  }

  const diff = Cesium.Cartesian3.subtract(lookCoord.cart, camCoord.cart, new Cesium.Cartesian3());
  const range = Math.max(1.0, Cesium.Cartesian3.magnitude(diff));
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(camCoord.cart);
  const invEnu = Cesium.Matrix4.inverse(enu, new Cesium.Matrix4());
  const localDir = Cesium.Matrix4.multiplyByPointAsVector(invEnu, diff, new Cesium.Cartesian3());
  Cesium.Cartesian3.normalize(localDir, localDir);
  const heading = Math.atan2(localDir.x, localDir.y);
  const pitch = Math.asin(Math.max(-0.98, Math.min(0.98, localDir.z)));
  return { chosen, cart: camCoord.cart, heading, pitch, range };
}

/**
 * 3v3 Girls vs Boys Soccer Match + Official Throw-In/Goal Rules + Bayou Mini-Stadium & LED Scoreboard
 * + 24s Stride-Locked Timeline Scrubber + Multi-Cam Dollies + Interactive Play WASD + Uniform Lighting.
 */
export async function loadLisaStreetSoccer({ viewer, signal }) {
  if (!viewer?.scene?.primitives) return { destroy() {} };

  let enabled = true;
  let playing = true;
  let interactiveMode = false;
  let timelineT = 0.0;
  let speedMult = 1.0;
  let trackMode = 'field';
  let camMode = 'free';
  let pendingDefaultWide = true;
  let nearYardSettledAtMs = 0;
  let lightMode = 'bright';
  let destroyed = false;
  let customAttachedMovable = null;

  const keysDown = new Set();
  const pState = {
    x: -4.0,
    y: 0.0,
    headingRad: 0.0,
    kickRemainingS: 0.0,
    kickQueuedImpulse: false,
    wootRemainingS: 0.0,
    runClockS: 0.0,
    ballX: -1.8,
    ballY: 0.0,
    ballZ: BALL_RADIUS_M,
    ballVx: 0.0,
    ballVy: 0.0,
    ballVz: 0.0,
    ballSpin: 0.0,
    lisaScore: 0,
    paulScore: 0,
    bannerMsg: '🎮 WASD: Run · SPACE: Kick Ball!',
  };

  let groundM = activeYardDatumM(viewer, TRACK_ORIGINS.field.lon, TRACK_ORIGINS.field.lat);
  const surfaceAltM = () => groundM + 0.14;

  const staticEntityIds = [];
  const addStatic = (def) => {
    const stale = viewer.entities.getById(def.id);
    if (stale) viewer.entities.remove(stale);
    const ent = viewer.entities.add(def);
    staticEntityIds.push(def.id);
    return ent;
  };

  const makeScoreboardCanvas = () => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 224;
    drawScoreboardCanvas(c, 0, 0, 0, 'GIRLS vs BOYS · KICKOFF');
    return c;
  };
  const scoreboardCanvases = [makeScoreboardCanvas(), makeScoreboardCanvas()];
  let scoreboardBufIdx = 0;
  let scoreboardState = readStoredScoreboardState();
  const scoreboardMaterial =
    typeof Cesium.Material?.fromType === 'function'
      ? Cesium.Material.fromType('Image', {
          image: scoreboardCanvases[0] || makeSoccerBallDataUrl(),
          repeat: new Cesium.Cartesian2(1, 1),
          color: Cesium.Color.WHITE.withAlpha(scoreboardState.opacity),
        })
      : null;
  let scoreboardPickEnt = null;
  let scoreboardPrim = null;
  let scoreboardMov = null;
  let lastBoardKey = '';

  const rebuildScoreboardMesh = () => {
    const z0 = surfaceAltM();
    const sc = Math.max(0.25, Math.min(3.5, Number(scoreboardState.scale) || 1));
    const zBot = 2.35 * sc;
    const basis = computeScoreboardBasis(scoreboardState, z0);

    const stalePylon = viewer.entities.getById('pfl-stadium-board-pylons');
    if (stalePylon) viewer.entities.remove(stalePylon);
    viewer.entities.add({
      id: 'pfl-stadium-board-pylons',
      show: enabled,
      polyline: {
        positions: [
          scoreboardWorldPoint(basis, -2.4 * sc, 0, 0),
          scoreboardWorldPoint(basis, -2.4 * sc, 0, zBot),
          scoreboardWorldPoint(basis, 2.4 * sc, 0, zBot),
          scoreboardWorldPoint(basis, 2.4 * sc, 0, 0),
        ],
        width: 5,
        material: Cesium.Color.fromCssColorString('#64748b'),
      },
    });
    if (!staticEntityIds.includes('pfl-stadium-board-pylons')) {
      staticEntityIds.push('pfl-stadium-board-pylons');
    }

    if (scoreboardPrim) {
      try { viewer.scene.primitives.remove(scoreboardPrim); } catch {}
      scoreboardPrim = null;
    }
    if (!scoreboardPickEnt) {
      const stalePick = viewer.entities.getById('pfl-stadium-jumbotron');
      if (stalePick) viewer.entities.remove(stalePick);
      scoreboardPickEnt = viewer.entities.add({
        id: 'pfl-stadium-jumbotron',
        name: '📺 417 Palm Stadium Scoreboard',
        show: enabled,
      });
    }
    scoreboardPickEnt.show = enabled;

    if (scoreboardMaterial) {
      if (scoreboardMaterial.uniforms?.color) {
        scoreboardMaterial.uniforms.color = Cesium.Color.WHITE.withAlpha(scoreboardState.opacity);
      }
      scoreboardPrim = buildScoreboardPrimitive(scoreboardState, z0, scoreboardMaterial, scoreboardPickEnt);
      scoreboardPrim.show = enabled;
      viewer.scene.primitives.add(scoreboardPrim);
    }

    if (!scoreboardMov) {
      scoreboardMov = {
        kind: 'stadium-scoreboard',
        label: '📺 417 Palm Stadium Scoreboard',
        getState: () => ({ ...scoreboardState }),
        update: (patch = {}) => {
          if (typeof patch.lat === 'number' && Number.isFinite(patch.lat)) scoreboardState.lat = patch.lat;
          if (typeof patch.lon === 'number' && Number.isFinite(patch.lon)) scoreboardState.lon = patch.lon;
          if (typeof patch.heading === 'number' && Number.isFinite(patch.heading)) {
            scoreboardState.heading = ((patch.heading % 360) + 360) % 360;
          }
          if (typeof patch.tilt === 'number' && Number.isFinite(patch.tilt)) {
            scoreboardState.tilt = Math.max(-90, Math.min(90, patch.tilt));
          }
          if (typeof patch.lift === 'number' && Number.isFinite(patch.lift)) {
            scoreboardState.lift = Math.max(-35, Math.min(35, patch.lift));
          }
          if (typeof patch.scale === 'number' && patch.scale > 0) {
            scoreboardState.scale = Math.max(0.25, Math.min(3.5, patch.scale));
          }
          if (typeof patch.opacity === 'number' && Number.isFinite(patch.opacity)) {
            scoreboardState.opacity = Math.max(0.05, Math.min(1, patch.opacity));
          }
          if (!patch?._autoSync) {
            writeStoredScoreboardState(scoreboardState);
            if (typeof window !== 'undefined') window.__pflNotifyYardFrameUserEdit?.('stadium-scoreboard');
          }
          rebuildScoreboardMesh();
          governorRequestRender('pfl-move-scoreboard');
        },
      };
    }
    scoreboardPickEnt._pflMovable = scoreboardMov;
    if (typeof window !== 'undefined') {
      window.__pflMovables = window.__pflMovables || {};
      window.__pflMovables['stadium-scoreboard'] = scoreboardMov;
    }
  };

  const buildGoalsAndPitch = () => {
    for (const id of staticEntityIds) {
      try { viewer.entities.removeById(id); } catch {}
    }
    staticEntityIds.length = 0;
    const z0 = surfaceAltM();
    const isField = trackMode === 'field';
    const pathLatAlt = (pts) => pts.map(([x, y, zOff = 0.06]) => enuTrackToLatLonAlt(x, y, z0 + zOff, trackMode).cart);

    addStatic({
      id: 'pfl-soccer-path-line',
      show: enabled,
      polyline: {
        positions: pathLatAlt([[-16, 0, 0.08], [16, 0, 0.08]]),
        width: 3,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.fromCssColorString(isField ? '#22d3ee' : '#facc15').withAlpha(0.88),
          dashLength: 16,
        }),
      },
    });

    addStatic({
      id: 'pfl-soccer-dolly1-rail',
      show: enabled && (camMode === 'dolly1' || camMode === 'auto'),
      polyline: {
        positions: [
          enuTrackToLatLonAlt(-12, -15.5, z0 + 4.8, trackMode).cart,
          enuTrackToLatLonAlt(12, -15.5, z0 + 4.8, trackMode).cart,
        ],
        width: 2,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.MAGENTA.withAlpha(0.65),
          dashLength: 10,
        }),
      },
    });

    const fz = surfaceAltM();
    const fPt = (x, y, dz = 0.06) => enuTrackToLatLonAlt(x, y, fz + dz, 'field').cart;
    addStatic({
      id: 'pfl-soccer-pitch-border',
      show: enabled,
      polyline: {
        positions: [fPt(-17, -9), fPt(17, -9), fPt(17, 9), fPt(-17, 9), fPt(-17, -9)],
        width: 2.5,
        material: Cesium.Color.WHITE.withAlpha(0.75),
      },
    });
    addStatic({
      id: 'pfl-soccer-midline',
      show: enabled,
      polyline: {
        positions: [fPt(0, -9), fPt(0, 9)],
        width: 2,
        material: Cesium.Color.WHITE.withAlpha(0.65),
      },
    });
    const circlePts = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      circlePts.push(fPt(Math.cos(a) * 3.5, Math.sin(a) * 3.5));
    }
    addStatic({
      id: 'pfl-soccer-center-circle',
      show: enabled,
      polyline: {
        positions: circlePts,
        width: 2,
        material: Cesium.Color.WHITE.withAlpha(0.65),
      },
    });

    // West Goal (-17m) & East Goal (+17m)
    for (const [side, gx, backDx] of [['west', -17, -1.2], ['east', 17, 1.2]]) {
      const w2 = 1.9;
      const gh = 2.0;
      addStatic({
        id: `pfl-soccer-goal-${side}-front`,
        show: enabled,
        polyline: {
          positions: [fPt(gx, -w2, 0), fPt(gx, -w2, gh), fPt(gx, w2, gh), fPt(gx, w2, 0)],
          width: 4.5,
          material: Cesium.Color.WHITE,
        },
      });
      addStatic({
        id: `pfl-soccer-goal-${side}-back`,
        show: enabled,
        polyline: {
          positions: [fPt(gx, -w2, gh), fPt(gx + backDx, -w2, gh), fPt(gx + backDx, -w2, 0), fPt(gx + backDx, w2, 0), fPt(gx + backDx, w2, gh), fPt(gx, w2, gh)],
          width: 2.5,
          material: Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.85),
        },
      });
      addStatic({
        id: `pfl-soccer-goal-${side}-net`,
        show: enabled,
        polygon: {
          hierarchy: [fPt(gx + backDx, -w2, 0), fPt(gx + backDx, w2, 0), fPt(gx + backDx, w2, gh), fPt(gx + backDx, -w2, gh)],
          perPositionHeight: true,
          material: Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.18),
          outline: false,
        },
      });
    }

    // South / Far-Side Mini-Stadium Bleachers toward Bayou Bushes (left & right wings along y = -10.2..-12.8m)
    // Leaves North Palm Drive side completely clear of fences & bleachers.
    for (const [wing, xA, xB] of [['west', -14.5, -4.2], ['east', 4.2, 14.5]]) {
      for (let tier = 0; tier < 3; tier++) {
        const ty0 = -10.4 - tier * 0.85;
        const ty1 = ty0 - 0.65;
        const tz = 0.48 + tier * 0.48;
        addStatic({
          id: `pfl-stadium-bleacher-${wing}-t${tier}`,
          show: enabled,
          polygon: {
            hierarchy: [fPt(xA, ty0, tz), fPt(xB, ty0, tz), fPt(xB, ty1, tz + 0.1), fPt(xA, ty1, tz + 0.1)],
            perPositionHeight: true,
            material: Cesium.Color.fromCssColorString(tier % 2 === 0 ? '#1e3a8a' : '#334155').withAlpha(0.92),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('#94a3b8').withAlpha(0.8),
          },
        });
      }
      addStatic({
        id: `pfl-stadium-rails-${wing}`,
        show: enabled,
        polyline: {
          positions: [fPt(xA, -12.8, 0), fPt(xA, -12.8, 2.1), fPt(xB, -12.8, 2.1), fPt(xB, -12.8, 0)],
          width: 3,
          material: Cesium.Color.LIGHTGRAY,
        },
      });
    }

    // 4 Corner Stadium Floodlight Towers (kept cleanly inside pitch perimeter, well off Palm Dr asphalt)
    for (const [lid, lx, ly] of [['nw', -17.4, 9.2], ['ne', 17.4, 9.2], ['sw', -17.4, -9.6], ['se', 17.4, -9.6]]) {
      addStatic({
        id: `pfl-stadium-light-${lid}`,
        show: enabled,
        polyline: {
          positions: [fPt(lx, ly, 0), fPt(lx, ly, 5.4)],
          width: 4,
          material: Cesium.Color.fromCssColorString('#cbd5e1'),
        },
        position: fPt(lx, ly, 5.5),
        point: {
          pixelSize: 10,
          color: Cesium.Color.fromCssColorString('#fef08a'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 600),
        },
      });
    }

    // Bayou-Side LED Jumbotron Scoreboard (double-sided 3D primitive, movable + persistent)
    rebuildScoreboardMesh();
  };
  buildGoalsAndPitch();

  const ballImg = makeSoccerBallDataUrl();
  let curState = evaluateSoccerTimeline(0, trackMode);
  const ballPos = () => enuTrackToLatLonAlt(curState.ballX, curState.ballY, surfaceAltM() + curState.ballZ, trackMode).cart;
  const ballOri = () =>
    Cesium.Transforms.headingPitchRollQuaternion(
      ballPos(),
      new Cesium.HeadingPitchRoll(0, curState.ballSpin, 0),
    );

  const staleBall = viewer.entities.getById('pfl-palm-drive-soccer-ball');
  if (staleBall) viewer.entities.remove(staleBall);
  const ballEnt = viewer.entities.add({
    id: 'pfl-palm-drive-soccer-ball',
    name: '⚽ PFL Soccer Ball',
    position: new Cesium.CallbackProperty(() => ballPos(), false),
    orientation: new Cesium.CallbackProperty(() => ballOri(), false),
    ellipsoid: {
      radii: new Cesium.Cartesian3(BALL_RADIUS_M, BALL_RADIUS_M, BALL_RADIUS_M),
      material: ballImg ? new Cesium.ImageMaterialProperty({ image: ballImg }) : Cesium.Color.WHITE,
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.7),
    },
  });

  const makeActorMatrix = (xM, yM, headingRad) => {
    const loc = enuTrackToLatLonAlt(xM, yM, surfaceAltM(), trackMode);
    const origYaw = Cesium.Math.toRadians(TRACK_ORIGINS[trackMode]?.yawDeg || 0);
    return Cesium.Transforms.headingPitchRollToFixedFrame(
      loc.cart,
      new Cesium.HeadingPitchRoll(-headingRad - origYaw, 0, 0),
    );
  };

  function createSyncedActor(url, initMatrix) {
    const rec = { model: null, currentClip: null, clipTime: 0, clipLoop: true };
    Cesium.Model.fromGltfAsync({
      url,
      modelMatrix: initMatrix,
      scale: 1.0,
      minimumPixelSize: 0,
      maximumScale: 30,
      customShader: makeAvatarLightShader(lightMode),
      lightColor: new Cesium.Color(1.9, 1.85, 1.75, 1.0),
      imageBasedLightingFactor: new Cesium.Cartesian2(1.25, 0.9),
      shadows: Cesium.ShadowMode.DISABLED,
    }).then((m) => {
      if (destroyed || signal?.aborted) {
        m.destroy?.();
        return;
      }
      rec.model = m;
      rec.model.customShader = makeAvatarLightShader(lightMode);
      viewer.scene.primitives.add(m);
    }).catch((err) => {
      console.warn('[LisaStreetSoccer] Failed to load model:', url, err);
    });
    rec.sync = (xM, yM, headingRad, animName, clipTimeSec, loopClip) => {
      const m = rec.model;
      if (!m) return;
      m.show = enabled;
      m.modelMatrix = makeActorMatrix(xM, yM, headingRad);
      rec.clipTime = clipTimeSec;
      rec.clipLoop = loopClip;
      if (m.ready && m.activeAnimations && rec.currentClip !== animName) {
        try {
          m.activeAnimations.removeAll();
          m.activeAnimations.add({
            name: animName,
            loop: loopClip ? Cesium.ModelAnimationLoop.REPEAT : Cesium.ModelAnimationLoop.NONE,
            multiplier: 1.0,
            animationTime: (dur) => {
              const d = Math.max(0.05, Number(dur) || 1.0);
              const n = rec.clipTime / d;
              return rec.clipLoop ? n : Math.max(0.0, Math.min(0.999, n));
            },
          });
          rec.currentClip = animName;
        } catch {}
      }
    };
    return rec;
  }

  // Team Girls (3 distinct rigged outfits) + Team Boys (3 distinct rigged outfits)
  const lisaActor = createSyncedActor(MODELS.lisaSailor, makeActorMatrix(curState.lisaX, curState.lisaY, curState.lisaHeadingRad));
  const girlClActor = createSyncedActor(MODELS.girlCl, makeActorMatrix(curState.girlClX, curState.girlClY, curState.girlClHeading));
  const girlGkActor = createSyncedActor(MODELS.girlShorts, makeActorMatrix(curState.girlGkX, curState.girlGkY, curState.girlGkHeading));
  const paulActor = createSyncedActor(MODELS.paulNasa, makeActorMatrix(curState.paulX, curState.paulY, curState.paulHeadingRad));
  const paulVestActor = createSyncedActor(MODELS.paulVest, makeActorMatrix(curState.paulVestX, curState.paulVestY, curState.paulVestHeading));
  const michaelActor = createSyncedActor(MODELS.michaelGold, makeActorMatrix(curState.michaelX, curState.michaelY, curState.michaelHeadingRad));
  const spectatorSpecs = [
    { url: MODELS.girlCl, x: -12.0, y: -10.6, z: 0.48, anim: 'Woot', offset: 0.2 },
    { url: MODELS.paulVest, x: -8.8, y: -11.45, z: 0.96, anim: 'Idle', offset: 0.9 },
    { url: MODELS.girlShorts, x: -5.8, y: -10.6, z: 0.48, anim: 'Woot', offset: 1.5 },
    { url: MODELS.michaelGold, x: 5.8, y: -10.6, z: 0.48, anim: 'Dance', offset: 0.4 },
    { url: MODELS.girlCl, x: 9.0, y: -11.45, z: 0.96, anim: 'Woot', offset: 2.1 },
    { url: MODELS.paulNasa, x: 12.2, y: -10.6, z: 0.48, anim: 'Idle', offset: 1.1 },
  ];
  const spectators = spectatorSpecs.map((sp) => {
    const loc = enuTrackToLatLonAlt(sp.x, sp.y, surfaceAltM() + sp.z, 'field');
    const hpr = new Cesium.HeadingPitchRoll(-Math.PI * 0.5 - Cesium.Math.toRadians(TRACK_ORIGINS.field.yawDeg || 0), 0, 0);
    const mat = Cesium.Transforms.headingPitchRollToFixedFrame(loc.cart, hpr);
    return { ...sp, actor: createSyncedActor(sp.url, mat), fixedLoc: loc.cart, fixedMat: mat };
  });
  const allActors = [lisaActor, girlClActor, girlGkActor, paulActor, paulVestActor, michaelActor, ...spectators.map((s) => s.actor)];

  const captureActionShotPng = () => {
    try {
      viewer.scene.render();
      const canvas = viewer.scene.canvas;
      if (!canvas) return false;
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `pfl-soccer-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return true;
    } catch {
      return false;
    }
  };
  if (typeof window !== 'undefined') window.__pflCaptureSnapshot = captureActionShotPng;

  const triggerInteractiveKick = () => {
    if (!interactiveMode) {
      interactiveMode = true;
      camMode = 'follow2';
    }
    if (pState.kickRemainingS <= 0) {
      pState.kickRemainingS = 1.3;
      pState.kickQueuedImpulse = true;
    }
  };

  let uiRefs = null;
  let timelineOpen = true;
  if (typeof document !== 'undefined') {
    document.getElementById('pfl-soccer-timeline-bar')?.remove();
    const bar = document.createElement('div');
    bar.id = 'pfl-soccer-timeline-bar';
    bar.style.cssText =
      'position:fixed;bottom:84px;right:16px;z-index:9400;width:455px;max-width:calc(100vw - 28px);' +
      'background:rgba(9,14,26,0.92);border:1px solid rgba(56,189,248,0.5);border-radius:10px;' +
      'padding:8px 10px;color:#e2e8f0;font-family:Inter,system-ui,sans-serif;font-size:11px;' +
      'box-shadow:0 10px 30px rgba(0,0,0,0.65);backdrop-filter:blur(8px);display:flex;flex-direction:column;gap:6px';
    bar.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
        <div style="display:flex;align-items:center;gap:6px;min-width:0">
          <span style="font-weight:800;color:#4ade80;white-space:nowrap">⚽ 3v3 STADIUM TIMELINE</span>
          <span id="pfl-soc-score" style="background:#0f172a;border:1px solid #334155;border-radius:4px;padding:1px 6px;font-family:'JetBrains Mono',monospace;font-size:10px;color:#fde047">GIRLS 0 : 0 BOYS</span>
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          <span id="pfl-soc-phase" style="font-size:9.5px;color:#7dd3fc;font-weight:700;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">READY</span>
          <button type="button" id="pfl-soc-min-btn" style="background:#1e293b;border:1px solid #475569;color:#cbd5e1;border-radius:4px;padding:1px 6px;cursor:pointer;font-size:10px" title="Collapse/expand timeline bar">▾</button>
        </div>
      </div>
      <div id="pfl-soc-body" style="display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;align-items:center;gap:6px">
          <button type="button" id="pfl-soc-play-btn" style="background:#059669;border:1px solid #34d399;color:#fff;border-radius:5px;padding:3px 8px;font-weight:800;cursor:pointer;font-size:10px;min-width:58px">⏸ Pause</button>
          <input type="range" id="pfl-soc-scrub" min="0" max="${SOCCER_TIMELINE_DURATION_S}" step="0.05" value="0" style="flex:1;accent-color:#38bdf8;cursor:pointer" title="Scrub 3v3 path, throw-in, kick keyframes &amp; camera dollies (0–24s)" />
          <span id="pfl-soc-time" style="font-family:'JetBrains Mono',monospace;font-size:10px;min-width:66px;text-align:right;color:#e2e8f0">00.0 / 24s</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:5px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:3px">
            <span style="font-size:9.5px;color:#94a3b8">Speed:</span>
            ${[0.5, 1.0, 1.5, 2.0, 3.0].map((s) => `<button type="button" data-soc-spd="${s}" style="background:${s === 1 ? '#0284c7' : '#1e293b'};border:1px solid #475569;color:#e2e8f0;border-radius:4px;padding:1px 5px;cursor:pointer;font-size:9.5px">${s}×</button>`).join('')}
            <input type="range" id="pfl-soc-spd-range" min="0.25" max="3.0" step="0.05" value="1.0" style="width:52px;accent-color:#fbbf24" title="Speed multiplier (stride-locked)" />
            <span id="pfl-soc-mps" style="font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#fde047">3.5m/s</span>
          </div>
          <div style="display:flex;gap:3px">
            <button type="button" data-soc-track="field" style="background:#065f46;border:1px solid #34d399;color:#fff;border-radius:4px;padding:2px 6px;cursor:pointer;font-size:9.5px">🏟️ Stadium</button>
            <button type="button" data-soc-track="stripe" style="background:#1e293b;border:1px solid #475569;color:#cbd5e1;border-radius:4px;padding:2px 6px;cursor:pointer;font-size:9.5px">🛣️ Stripe</button>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:3px;flex-wrap:wrap;border-top:1px solid #1e293b;padding-top:5px">
          <span style="font-size:9.5px;color:#f0abfc;font-weight:700">🎥</span>
          ${[
            ['free', 'Free'],
            ['auto', 'AutoCut'],
            ['dolly1', 'Cam1 Rail'],
            ['follow2', 'Follow'],
            ['face4', '👤 Face'],
            ['aerial3', 'Wide'],
          ].map(([id, lbl]) => `<button type="button" data-soc-cam="${id}" style="background:${id === 'free' ? '#0f766e' : '#1e293b'};border:1px solid ${id === 'free' ? '#2dd4bf' : '#475569'};color:#e2e8f0;border-radius:4px;padding:2px 5px;cursor:pointer;font-size:9.5px">${lbl}</button>`).join('')}
          <button type="button" id="pfl-soc-snap-btn" style="background:#831843;border:1px solid #f472b6;color:#fbcfe8;border-radius:4px;padding:2px 6px;cursor:pointer;font-size:9.5px;font-weight:700" title="Instant WebGL PNG Screenshot without players moving away">📸 Snap</button>
          <button type="button" id="pfl-soc-wasd-btn" style="background:#1e293b;border:1px solid #fbbf24;color:#fde047;border-radius:4px;padding:2px 6px;cursor:pointer;font-size:9.5px;font-weight:700" title="Walk &amp; dribble Lisa yourself with W/A/S/D + SPACE to Kick">🎮 Play WASD</button>
          <button type="button" id="pfl-soc-kick-btn" style="background:#b45309;border:1px solid #fbbf24;color:#fff;border-radius:4px;padding:2px 6px;cursor:pointer;font-size:9.5px;font-weight:700;display:none" title="Kick soccer ball toward where Lisa faces (Spacebar)">🦵 Kick!</button>
          <button type="button" id="pfl-soc-light-btn" style="background:#0f766e;border:1px solid #5eead4;color:#ccfbf1;border-radius:4px;padding:2px 5px;cursor:pointer;font-size:9.5px;font-weight:700" title="Cycle uniform character lighting: Uniform / Studio / Sun">🔆 Uniform</button>
          <button type="button" id="pfl-soc-attach-glb" style="margin-left:auto;background:#312e81;border:1px solid #818cf8;color:#e0e7ff;border-radius:4px;padding:2px 5px;cursor:pointer;font-size:9.5px" title="Attach dropped + custom GLB to follow this path">🏃 +GLB</button>
        </div>
      </div>
    `;
    document.body.appendChild(bar);
    uiRefs = {
      bar,
      body: bar.querySelector('#pfl-soc-body'),
      minBtn: bar.querySelector('#pfl-soc-min-btn'),
      playBtn: bar.querySelector('#pfl-soc-play-btn'),
      scrub: bar.querySelector('#pfl-soc-scrub'),
      timeEl: bar.querySelector('#pfl-soc-time'),
      phaseEl: bar.querySelector('#pfl-soc-phase'),
      scoreEl: bar.querySelector('#pfl-soc-score'),
      spdRange: bar.querySelector('#pfl-soc-spd-range'),
      mpsEl: bar.querySelector('#pfl-soc-mps'),
      wasdBtn: bar.querySelector('#pfl-soc-wasd-btn'),
      kickBtn: bar.querySelector('#pfl-soc-kick-btn'),
      lightBtn: bar.querySelector('#pfl-soc-light-btn'),
    };
  }

  const applyActorLighting = (mode) => {
    lightMode = ['bright', 'studio', 'sun'].includes(mode) ? mode : 'bright';
    const sh = makeAvatarLightShader(lightMode);
    for (const act of allActors) {
      if (!act.model) continue;
      try {
        act.model.customShader = sh;
        act.model.lightColor = lightMode === 'sun' ? new Cesium.Color(1, 1, 1, 1) : new Cesium.Color(1.9, 1.85, 1.75, 1.0);
        act.model.imageBasedLightingFactor = lightMode === 'sun' ? new Cesium.Cartesian2(1, 1) : new Cesium.Cartesian2(1.25, 0.9);
      } catch {}
    }
    governorRequestRender('lisa-soccer-light');
  };

  const syncUi = (st) => {
    if (!uiRefs) return;
    uiRefs.bar.style.display = enabled ? 'flex' : 'none';
    const stdWrap = uiRefs.bar.closest?.('.pfl-std-box');
    if (stdWrap) stdWrap.style.display = enabled ? '' : 'none';
    if (!enabled) return;
    uiRefs.playBtn.textContent = playing ? '⏸ Pause' : '▶ Play';
    uiRefs.playBtn.style.background = playing ? '#059669' : '#0284c7';
    if (document.activeElement !== uiRefs.scrub) {
      uiRefs.scrub.value = st.t.toFixed(2);
    }
    uiRefs.timeEl.textContent = interactiveMode ? '🎮 WASD PLAY' : `${st.t.toFixed(1).padStart(4, '0')} / ${SOCCER_TIMELINE_DURATION_S}s`;
    uiRefs.phaseEl.textContent = st.phaseLabel;
    uiRefs.scoreEl.textContent = `GIRLS ${st.lisaScore} : ${st.paulScore} BOYS`;
    uiRefs.mpsEl.textContent = `${(RUN_SPEED_MPS * speedMult).toFixed(2)}m/s`;
    if (uiRefs.wasdBtn) {
      uiRefs.wasdBtn.textContent = interactiveMode ? '🎮 WASD: ON' : '🎮 Play WASD';
      uiRefs.wasdBtn.style.background = interactiveMode ? '#b45309' : '#1e293b';
      uiRefs.wasdBtn.style.color = interactiveMode ? '#fff' : '#fde047';
    }
    if (uiRefs.kickBtn) {
      uiRefs.kickBtn.style.display = interactiveMode ? 'inline-block' : 'none';
    }
    if (uiRefs.lightBtn) {
      uiRefs.lightBtn.textContent = lightMode === 'bright' ? '🔆 Uniform' : lightMode === 'studio' ? '💡 Studio' : '🌙 Sun';
      uiRefs.lightBtn.style.background = lightMode === 'sun' ? '#1e293b' : lightMode === 'bright' ? '#0f766e' : '#b45309';
    }
    uiRefs.bar.querySelectorAll('[data-soc-spd]').forEach((b) => {
      const m = Math.abs(Number(b.getAttribute('data-soc-spd')) - speedMult) < 0.03;
      b.style.background = m ? '#0284c7' : '#1e293b';
      b.style.borderColor = m ? '#38bdf8' : '#475569';
    });
    uiRefs.bar.querySelectorAll('[data-soc-track]').forEach((b) => {
      const m = b.getAttribute('data-soc-track') === trackMode;
      b.style.background = m ? '#065f46' : '#1e293b';
      b.style.borderColor = m ? '#34d399' : '#475569';
    });
    uiRefs.bar.querySelectorAll('[data-soc-cam]').forEach((b) => {
      const id = b.getAttribute('data-soc-cam');
      const m = id === camMode;
      b.style.background = m ? (id === 'free' ? '#0f766e' : '#7e22ce') : '#1e293b';
      b.style.borderColor = m ? (id === 'free' ? '#2dd4bf' : '#e879f9') : '#475569';
    });
    const bKey = `${st.lisaScore}-${st.paulScore}-${Math.floor(st.t)}-${st.phaseLabel}`;
    if (scoreboardCanvases[0] && scoreboardMaterial?.uniforms && bKey !== lastBoardKey) {
      lastBoardKey = bKey;
      scoreboardBufIdx ^= 1;
      const nextCanv = scoreboardCanvases[scoreboardBufIdx];
      drawScoreboardCanvas(nextCanv, st.lisaScore, st.paulScore, st.t, st.phaseLabel);
      scoreboardMaterial.uniforms.image = nextCanv;
      governorRequestRender('soccer-scoreboard-tick');
    }
  };

  const stepInteractive = (dt) => {
    const steer = (keysDown.has('a') || keysDown.has('arrowleft') ? 1 : 0) - (keysDown.has('d') || keysDown.has('arrowright') ? 1 : 0);
    pState.headingRad += steer * 2.4 * dt;

    const moveFwd = (keysDown.has('w') || keysDown.has('arrowup') ? 1 : 0) - (keysDown.has('s') || keysDown.has('arrowdown') ? 1 : 0);
    const speed = RUN_SPEED_MPS * speedMult;
    const isMoving = Math.abs(moveFwd) > 0.05;
    if (isMoving) {
      const dir = moveFwd > 0 ? 1 : -1;
      pState.x = Math.max(-24, Math.min(24, pState.x + Math.cos(pState.headingRad) * speed * dir * dt));
      pState.y = Math.max(-14, Math.min(18, pState.y + Math.sin(pState.headingRad) * speed * dir * dt));
      pState.runClockS += dt * speedMult;
    }

    if (pState.kickRemainingS > 0) {
      pState.kickRemainingS = Math.max(0, pState.kickRemainingS - dt);
      if (pState.kickQueuedImpulse && pState.kickRemainingS <= 0.85) {
        pState.kickQueuedImpulse = false;
        const dBall = Math.hypot(pState.ballX - pState.x, pState.ballY - pState.y);
        if (dBall <= 2.6) {
          pState.ballVx = Math.cos(pState.headingRad) * 11.5;
          pState.ballVy = Math.sin(pState.headingRad) * 11.5;
          pState.ballVz = 4.3;
          pState.bannerMsg = '🦵 SHOT FIRED!';
        } else {
          pState.bannerMsg = '🏃 Move closer (<2.5m) to kick!';
        }
      }
    }
    if (pState.wootRemainingS > 0) pState.wootRemainingS = Math.max(0, pState.wootRemainingS - dt);

    const dContact = Math.hypot(pState.ballX - pState.x, pState.ballY - pState.y);
    if (isMoving && dContact < 0.85 && pState.ballZ <= BALL_RADIUS_M + 0.15) {
      pState.ballVx = Math.cos(pState.headingRad) * speed * 1.35;
      pState.ballVy = Math.sin(pState.headingRad) * speed * 1.35;
    }

    if (pState.ballZ > BALL_RADIUS_M || pState.ballVz > 0) {
      pState.ballVz -= 9.81 * dt;
      pState.ballZ += pState.ballVz * dt;
      if (pState.ballZ <= BALL_RADIUS_M) {
        pState.ballZ = BALL_RADIUS_M;
        pState.ballVz = Math.abs(pState.ballVz) > 0.9 ? Math.abs(pState.ballVz) * 0.62 : 0;
      }
    }
    pState.ballX += pState.ballVx * dt;
    pState.ballY += pState.ballVy * dt;
    const drag = pState.ballZ <= BALL_RADIUS_M + 0.02 ? 1.5 : 0.12;
    pState.ballVx *= Math.max(0, 1 - drag * dt);
    pState.ballVy *= Math.max(0, 1 - drag * dt);
    pState.ballSpin -= Math.hypot(pState.ballVx, pState.ballVy) * dt / BALL_RADIUS_M;

    if (Math.abs(pState.ballY) < 2.0 && pState.ballX >= 17.0) {
      pState.lisaScore += 1;
      pState.wootRemainingS = 2.6;
      pState.bannerMsg = '🥅 GOAL! GIRLS SCORE!';
      pState.ballX = 0; pState.ballY = 0; pState.ballVx = 0; pState.ballVy = 0; pState.ballZ = BALL_RADIUS_M; pState.ballVz = 0;
    } else if (Math.abs(pState.ballY) < 2.0 && pState.ballX <= -17.0) {
      pState.paulScore += 1;
      pState.wootRemainingS = 2.6;
      pState.bannerMsg = '🥅 GOAL! BOYS SCORE!';
      pState.ballX = 0; pState.ballY = 0; pState.ballVx = 0; pState.ballVy = 0; pState.ballZ = BALL_RADIUS_M; pState.ballVz = 0;
    } else if (Math.abs(pState.ballY) > 9.3) {
      // Sideline Throw-In reset back inside pitch line cleanly
      pState.ballY = Math.sign(pState.ballY) * 7.8;
      pState.ballVx = 0;
      pState.ballVy = -Math.sign(pState.ballY) * 4.5;
      pState.ballVz = 2.2;
      pState.bannerMsg = '🏳️ THROW-IN RETURN!';
    } else if (Math.abs(pState.ballX) > 17.2) {
      pState.ballX = Math.sign(pState.ballX) * 14.5;
      pState.ballVx = -Math.sign(pState.ballX) * 5.0;
      pState.bannerMsg = '⚽ GOAL KICK RESET!';
    }

    const anim = pState.kickRemainingS > 0 ? 'Kick' : isMoving ? 'Run' : (pState.wootRemainingS > 0 ? 'Woot' : 'Idle');
    const clipTime = anim === 'Kick' ? (1.3 - pState.kickRemainingS) : isMoving ? pState.runClockS : 0.1;
    const bgState = evaluateSoccerTimeline(timelineT, trackMode);

    return {
      ...bgState,
      lisaX: pState.x,
      lisaY: pState.y,
      lisaHeadingRad: pState.headingRad,
      lisaDir: Math.cos(pState.headingRad) >= 0 ? 1 : -1,
      lisaAnim: anim,
      lisaClipTime: clipTime,
      lisaLoop: anim !== 'Kick',
      ballX: pState.ballX,
      ballY: pState.ballY,
      ballZ: pState.ballZ,
      ballSpin: pState.ballSpin,
      lisaScore: pState.lisaScore,
      paulScore: pState.paulScore,
      phaseLabel: pState.bannerMsg,
    };
  };

  const applyFrameState = (st, forceCam = false) => {
    curState = st;
    lisaActor.sync(st.lisaX, st.lisaY, st.lisaHeadingRad, st.lisaAnim, st.lisaClipTime, st.lisaLoop);
    girlClActor.sync(st.girlClX, st.girlClY, st.girlClHeading, st.girlClAnim, st.girlClClip, st.girlClLoop);
    girlGkActor.sync(st.girlGkX, st.girlGkY, st.girlGkHeading, st.girlGkAnim, st.girlGkClip, true);
    paulActor.sync(st.paulX, st.paulY, st.paulHeadingRad, st.paulAnim, st.paulClipTime, st.paulLoop);
    paulVestActor.sync(st.paulVestX, st.paulVestY, st.paulVestHeading, st.paulVestAnim, st.paulVestClip, true);
    michaelActor.sync(st.michaelX, st.michaelY, st.michaelHeadingRad, st.michaelAnim, st.michaelClipTime, true);
    for (const sp of spectators) {
      if (sp.actor.model) {
        sp.actor.model.show = enabled;
        sp.actor.clipTime = st.t + sp.offset;
        sp.actor.clipLoop = true;
        if (sp.actor.model.ready && sp.actor.model.activeAnimations && sp.actor.currentClip !== sp.anim) {
          try {
            sp.actor.model.activeAnimations.removeAll();
            sp.actor.model.activeAnimations.add({
              name: sp.anim,
              loop: Cesium.ModelAnimationLoop.REPEAT,
              multiplier: 1.0,
              animationTime: (dur) => sp.actor.clipTime / Math.max(0.05, Number(dur) || 1.0),
            });
            sp.actor.currentClip = sp.anim;
          } catch {}
        }
      }
    }

    if (customAttachedMovable?.update) {
      const cLoc = enuTrackToLatLonAlt(st.lisaX, st.lisaY + 1.8, surfaceAltM(), trackMode);
      const origYaw = TRACK_ORIGINS[trackMode]?.yawDeg || 0;
      const hdgDeg = Cesium.Math.toDegrees(-(st.lisaHeadingRad || 0)) - origYaw;
      customAttachedMovable.update({ lat: cLoc.lat, lon: cLoc.lon, heading: hdgDeg });
    }

    if ((camMode !== 'free' || forceCam) && viewer?.camera) {
      try {
        if (viewer.camera.transform && !Cesium.Matrix4.equals(viewer.camera.transform, Cesium.Matrix4.IDENTITY)) {
          viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
        }
        const shot = evaluateSoccerDollyCam(camMode === 'free' ? 'auto' : camMode, st.t, st, groundM, trackMode);
        viewer.camera.setView({
          destination: shot.cart,
          orientation: { heading: shot.heading, pitch: shot.pitch, roll: 0 },
        });
      } catch {}
    }

    syncUi(st);
  };

  const onKeyDown = (e) => {
    if (!enabled || !interactiveMode) return;
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      keysDown.add(k);
      e.preventDefault();
    } else if (e.code === 'Space') {
      triggerInteractiveKick();
      e.preventDefault();
    }
  };
  const onKeyUp = (e) => {
    keysDown.delete(e.key.toLowerCase());
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  }
  const canvasEl = viewer?.scene?.canvas || null;
  let widePtrDown = null;
  const releaseWideOnUserInput = () => {
    pendingDefaultWide = false;
    if (camMode !== 'free') {
      camMode = 'free';
      buildGoalsAndPitch();
      syncUi(curState);
      governorRequestRender('lisa-soccer-user-free');
    }
  };
  const onCanvasPointerDown = (e) => {
    widePtrDown = { x: e.clientX, y: e.clientY };
  };
  const onCanvasPointerMove = (e) => {
    if (widePtrDown && Math.hypot(e.clientX - widePtrDown.x, e.clientY - widePtrDown.y) > 6) {
      widePtrDown = null;
      releaseWideOnUserInput();
    }
  };
  const onCanvasPointerUp = () => {
    widePtrDown = null;
  };
  const onCanvasWheel = () => {
    releaseWideOnUserInput();
  };
  if (canvasEl) {
    canvasEl.addEventListener('pointerdown', onCanvasPointerDown, { passive: true });
    canvasEl.addEventListener('pointermove', onCanvasPointerMove, { passive: true });
    canvasEl.addEventListener('pointerup', onCanvasPointerUp, { passive: true });
    canvasEl.addEventListener('pointercancel', onCanvasPointerUp, { passive: true });
    canvasEl.addEventListener('wheel', onCanvasWheel, { passive: true });
  }
  const terrainUnsub = viewer?.scene?.terrainProviderChanged?.addEventListener?.(() => {
    groundM = activeYardDatumM(viewer, TRACK_ORIGINS[trackMode].lon, TRACK_ORIGINS[trackMode].lat);
  });

  if (uiRefs) {
    uiRefs.minBtn?.addEventListener('click', () => {
      timelineOpen = !timelineOpen;
      uiRefs.body.style.display = timelineOpen ? 'flex' : 'none';
      uiRefs.minBtn.textContent = timelineOpen ? '▾' : '▸';
    });
    uiRefs.playBtn?.addEventListener('click', () => {
      interactiveMode = false;
      playing = !playing;
      syncUi(curState);
    });
    uiRefs.scrub?.addEventListener('input', (e) => {
      interactiveMode = false;
      timelineT = Number(e.target.value || 0);
      applyFrameState(evaluateSoccerTimeline(timelineT, trackMode), camMode !== 'free');
      governorRequestRender('lisa-soccer-scrub');
    });
    uiRefs.bar.querySelectorAll('[data-soc-spd]').forEach((b) => {
      b.addEventListener('click', () => {
        speedMult = Number(b.getAttribute('data-soc-spd') || 1.0);
        if (uiRefs.spdRange) uiRefs.spdRange.value = String(speedMult);
        syncUi(curState);
      });
    });
    uiRefs.spdRange?.addEventListener('input', (e) => {
      speedMult = Math.max(0.25, Math.min(3.0, Number(e.target.value || 1.0)));
      syncUi(curState);
    });
    uiRefs.bar.querySelectorAll('[data-soc-track]').forEach((b) => {
      b.addEventListener('click', () => {
        trackMode = b.getAttribute('data-soc-track') === 'stripe' ? 'stripe' : 'field';
        groundM = activeYardDatumM(viewer, TRACK_ORIGINS[trackMode].lon, TRACK_ORIGINS[trackMode].lat);
        buildGoalsAndPitch();
        applyFrameState(evaluateSoccerTimeline(timelineT, trackMode), camMode !== 'free');
        governorRequestRender('lisa-soccer-track');
      });
    });
    uiRefs.bar.querySelectorAll('[data-soc-cam]').forEach((b) => {
      b.addEventListener('click', () => {
        pendingDefaultWide = false;
        camMode = b.getAttribute('data-soc-cam') || 'free';
        buildGoalsAndPitch();
        applyFrameState(curState, camMode !== 'free');
        governorRequestRender('lisa-soccer-cam');
      });
    });
    uiRefs.wasdBtn?.addEventListener('click', () => {
      interactiveMode = !interactiveMode;
      if (interactiveMode) {
        pState.x = curState.lisaX;
        pState.y = curState.lisaY;
        pState.headingRad = curState.lisaHeadingRad || 0;
        pState.ballX = curState.ballX;
        pState.ballY = curState.ballY;
        pState.ballZ = curState.ballZ;
        if (camMode === 'free') camMode = 'follow2';
      }
      buildGoalsAndPitch();
      syncUi(curState);
      governorRequestRender('lisa-soccer-wasd');
    });
    uiRefs.kickBtn?.addEventListener('click', triggerInteractiveKick);
    uiRefs.bar.querySelector('#pfl-soc-snap-btn')?.addEventListener('click', (ev) => {
      const b = ev.currentTarget;
      const ok = captureActionShotPng();
      if (b) {
        b.textContent = ok ? '✅ Saved!' : '⚠️ Retry';
        setTimeout(() => { b.textContent = '📸 Snap'; }, 1200);
      }
    });
    uiRefs.lightBtn?.addEventListener('click', () => {
      const order = ['bright', 'studio', 'sun'];
      const next = order[(order.indexOf(lightMode) + 1) % order.length];
      applyActorLighting(next);
      syncUi(curState);
    });
    uiRefs.bar.querySelector('#pfl-soc-attach-glb')?.addEventListener('click', () => {
      const m = window.__pflMovables && Object.values(window.__pflMovables).find((x) => String(x?.kind || '').startsWith('custom-glb-'));
      if (m) {
        customAttachedMovable = customAttachedMovable === m ? null : m;
        const btn = uiRefs.bar.querySelector('#pfl-soc-attach-glb');
        if (btn) btn.textContent = customAttachedMovable ? '✅ Custom GLB on Path' : '🏃 +GLB';
        applyFrameState(curState, false);
      }
    });
  }

  let rafId = 0;
  let lastTickMs = performance.now();
  let lastGroundRefreshMs = 0;

  const isCameraNearYard = () => {
    try {
      const c = viewer?.camera?.positionCartographic;
      if (!c) return false;
      const lat = Cesium.Math.toDegrees(c.latitude);
      const lon = Cesium.Math.toDegrees(c.longitude);
      return Math.abs(lat - TRACK_ORIGINS.field.lat) < 0.012 && Math.abs(lon - TRACK_ORIGINS.field.lon) < 0.015;
    } catch {
      return false;
    }
  };

  const step = (nowMs) => {
    if (destroyed) return;
    rafId = requestAnimationFrame(step);
    const dt = Math.min(0.06, Math.max(0.002, (nowMs - lastTickMs) / 1000));
    lastTickMs = nowMs;

    if (!enabled) return;

    if (nowMs - lastGroundRefreshMs > 2500) {
      lastGroundRefreshMs = nowMs;
      groundM = activeYardDatumM(viewer, TRACK_ORIGINS[trackMode].lon, TRACK_ORIGINS[trackMode].lat);
    }

    if (pendingDefaultWide && camMode === 'free' && !interactiveMode) {
      const shareRestoring = Boolean(
        typeof window !== 'undefined' && window.__pflShareRestoreActive,
      );
      const flying = cameraFlightActive(viewer?.camera);
      if (isCameraNearYard() && !shareRestoring && !flying) {
        if (!nearYardSettledAtMs) {
          nearYardSettledAtMs = nowMs;
        } else if (nowMs - nearYardSettledAtMs >= 450) {
          pendingDefaultWide = false;
          groundM = activeYardDatumM(viewer, TRACK_ORIGINS[trackMode].lon, TRACK_ORIGINS[trackMode].lat);
          camMode = 'aerial3';
          buildGoalsAndPitch();
        }
      } else {
        nearYardSettledAtMs = 0;
      }
    }

    if (interactiveMode) {
      timelineT = (timelineT + dt * 0.5) % SOCCER_TIMELINE_DURATION_S;
      applyFrameState(stepInteractive(dt), false);
    } else {
      if (playing) {
        timelineT = (timelineT + dt * speedMult) % SOCCER_TIMELINE_DURATION_S;
      }
      applyFrameState(evaluateSoccerTimeline(timelineT, trackMode), false);
    }

    if (camMode !== 'free' || isCameraNearYard()) {
      governorRequestRender('lisa-street-soccer');
    }
  };
  applyFrameState(evaluateSoccerTimeline(0, trackMode), false);
  rafId = requestAnimationFrame(step);

  const setEnabled = (on) => {
    enabled = Boolean(on);
    for (const act of allActors) {
      if (act.model) act.model.show = enabled;
    }
    ballEnt.show = enabled;
    for (const id of staticEntityIds) {
      const e = viewer.entities.getById(id);
      if (e) e.show = enabled && (id !== 'pfl-soccer-dolly1-rail' || camMode === 'dolly1' || camMode === 'auto');
    }
    if (scoreboardPrim) scoreboardPrim.show = enabled;
    if (scoreboardPickEnt) scoreboardPickEnt.show = enabled;
    syncUi(curState);
    governorRequestRender('lisa-soccer-toggle');
    return enabled;
  };

  const api = {
    setEnabled,
    setTimelineTime: (sec) => {
      interactiveMode = false;
      timelineT = ((Number(sec) % SOCCER_TIMELINE_DURATION_S) + SOCCER_TIMELINE_DURATION_S) % SOCCER_TIMELINE_DURATION_S;
      applyFrameState(evaluateSoccerTimeline(timelineT, trackMode), camMode !== 'free');
      governorRequestRender('lisa-soccer-time');
      return timelineT;
    },
    setPlaying: (v) => { playing = Boolean(v); syncUi(curState); return playing; },
    setSpeed: (m) => { speedMult = Math.max(0.25, Math.min(3.0, Number(m) || 1.0)); syncUi(curState); return speedMult; },
    setTrackMode: (m) => {
      trackMode = m === 'stripe' ? 'stripe' : 'field';
      groundM = activeYardDatumM(viewer, TRACK_ORIGINS[trackMode].lon, TRACK_ORIGINS[trackMode].lat);
      buildGoalsAndPitch();
      applyFrameState(evaluateSoccerTimeline(timelineT, trackMode), camMode !== 'free');
      return trackMode;
    },
    setCameraMode: (m) => {
      pendingDefaultWide = false;
      camMode = ['free', 'auto', 'dolly1', 'follow2', 'face4', 'aerial3'].includes(m) ? m : 'free';
      buildGoalsAndPitch();
      applyFrameState(curState, camMode !== 'free');
      return camMode;
    },
    setInteractiveMode: (v) => {
      interactiveMode = Boolean(v);
      syncUi(curState);
      return interactiveMode;
    },
    setLightMode: (m) => {
      applyActorLighting(m);
      syncUi(curState);
      return lightMode;
    },
    kickBall: triggerInteractiveKick,
    attachMovable: (mov) => { customAttachedMovable = mov || null; },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(rafId);
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
      }
      if (canvasEl) {
        canvasEl.removeEventListener('pointerdown', onCanvasPointerDown);
        canvasEl.removeEventListener('pointermove', onCanvasPointerMove);
        canvasEl.removeEventListener('pointerup', onCanvasPointerUp);
        canvasEl.removeEventListener('pointercancel', onCanvasPointerUp);
        canvasEl.removeEventListener('wheel', onCanvasWheel);
      }
      try { terrainUnsub?.(); } catch {}
      for (const act of allActors) {
        try { act.model?.activeAnimations?.removeAll?.(); } catch {}
        try { if (act.model) viewer.scene.primitives.remove(act.model); } catch {}
      }
      try { viewer.entities.remove(ballEnt); } catch {}
      if (scoreboardPrim) {
        try { viewer.scene.primitives.remove(scoreboardPrim); } catch {}
        scoreboardPrim = null;
      }
      if (scoreboardPickEnt) {
        try { viewer.entities.remove(scoreboardPickEnt); } catch {}
        scoreboardPickEnt = null;
      }
      for (const id of staticEntityIds) {
        try { viewer.entities.removeById(id); } catch {}
      }
      if (typeof document !== 'undefined') {
        document.getElementById('pfl-soccer-timeline-bar')?.remove();
      }
      if (typeof window !== 'undefined') {
        delete window.__pflToggleLisaSoccer;
        delete window.__pflGetLisaSoccerState;
        delete window.__pflSetSoccerTimeline;
        delete window.__pflAttachGlbToSoccerPath;
        delete window.__pflCaptureSnapshot;
        if (window.__pflMovables?.['stadium-scoreboard']) {
          delete window.__pflMovables['stadium-scoreboard'];
        }
      }
    },
  };

  if (typeof window !== 'undefined') {
    window.__pflToggleLisaSoccer = (next) => setEnabled(typeof next === 'boolean' ? next : !enabled);
    window.__pflSetSoccerTimeline = (opts = {}) => {
      if (typeof opts.interactive === 'boolean') api.setInteractiveMode(opts.interactive);
      if (typeof opts.playing === 'boolean') playing = opts.playing;
      if (typeof opts.speed === 'number') api.setSpeed(opts.speed);
      if (typeof opts.trackMode === 'string') api.setTrackMode(opts.trackMode);
      if (typeof opts.camMode === 'string') api.setCameraMode(opts.camMode);
      if (typeof opts.lightMode === 'string') api.setLightMode(opts.lightMode);
      if (typeof opts.time === 'number') api.setTimelineTime(opts.time);
      return window.__pflGetLisaSoccerState();
    };
    window.__pflAttachGlbToSoccerPath = (mov) => {
      api.attachMovable(mov);
      return Boolean(mov);
    };
    window.__pflGetLisaSoccerState = () => ({
      enabled,
      playing,
      interactiveMode,
      timelineT: Number(timelineT.toFixed(2)),
      speedMult,
      trackMode,
      camMode,
      lightMode,
      lisaState: curState.lisaAnim.toLowerCase(),
      lisaX: Number(curState.lisaX.toFixed(2)),
      lisaY: Number((curState.lisaY || 0).toFixed(2)),
      lisaDir: curState.lisaDir,
      ballX: Number(curState.ballX.toFixed(2)),
      ballZ: Number(curState.ballZ.toFixed(2)),
      lisaScore: curState.lisaScore,
      paulScore: curState.paulScore,
      phaseLabel: curState.phaseLabel,
      activeAutoCam: curState.activeAutoCam,
    });
  }

  return api;
}
