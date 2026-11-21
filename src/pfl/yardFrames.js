import * as Cesium from 'cesium';
import { STORED_GROUND_HEIGHT_M, resolveTerrainGroundM } from './placedObjects.js';
import {
  holdContinuousRender,
  releaseContinuousRender,
  governorRequestRender,
} from '../renderGovernor.js';

/**
 * Yard frames — Paul's own photos laid into the scene (card #93
 * close-zoom layer), FRUSTUM-TRUE v2 (2026-10-12).
 *
 * Each photo hangs as a quad IN FRONT OF its camera, perpendicular
 * to the camera's view axis, sized by the camera's field of view.
 * Stand at the camera's position (camLat/camLon, camHeightM above
 * the surveyed grade) and look along headingDeg/pitchDeg: the photo
 * overlays the real yard. From any other angle it reads as what it
 * is — a tilted panel in space, tilted at the camera's angle.
 *
 * Camera positions SOLVED 2026-10-12 (registry: YARD_CAMERAS.md):
 * position ±3 m, heading ±12 deg, height ±1 m. FOV values are the
 * Wyze wide-lens class (h 103 deg, v 66 deg); per-frame tunable.
 * The billboard-card v1 lives in yardFrames.js.bak-20261012-quad.
 *
 * ARRANGE MODE (2026-10-19, Paul: "give me a way to drag and drop
 * and reposition the images"): rendering is parametric — every
 * frame is built from a params object and can be rebuilt in place.
 * The "Arrange frames" toggle turns on a drag editor docked to the
 * far left edge of the screen: click a photo to select it, drag it
 * across the ground, then spin / tilt / roll / raise / resize /
 * adjust width from the panel (or keys) with the quad's 3D center
 * locked in place so landmarks never shift during resizing or rotation.
 * Arrangements persist in localStorage (key gev-yardframes-layout-v1)
 * and merge over the built-in defaults below on every load.
 */
export const YARD_FRAMES = [
  {
    id: 'back-yard-cam1-plan',
    image: '/yard-frames/back-yard-cam1-2026-10-12.jpg',
    // i18n-ignore: Paul's private camera title is source data.
    title: 'Back Yard Cam1 — plan view: beaver E, vehicles W, road N',
    takenAt: '2026-10-12 18:31 CDT',
    camLat: 29.24762,
    camLon: -95.23158,
    camHeightM: 8.5,
    headingDeg: 350,
    pitchDeg: -42,
  },
  {
    id: 'yard-overview-20261012',
    image: '/yard-frames/yard-overview-2026-10-12.png',
    // i18n-ignore: Paul's private camera title is source data.
    title: 'Wyze Cam V4 — yard overview: pump house + road',
    takenAt: '2026-10-12 18:25 CDT',
    camLat: 29.2476,
    camLon: -95.23155,
    camHeightM: 8,
    headingDeg: 350,
    pitchDeg: -25,
    distanceM: 6.5,
  },
  {
    id: 'house-side-20261012',
    image: '/yard-frames/house-side-2026-10-12.png',
    // i18n-ignore: Paul's private camera title is source data.
    title: 'HD cam — yellow house side, looking W to the water',
    takenAt: '2026-10-12 18:28 CDT',
    camLat: 29.24758,
    camLon: -95.23147,
    camHeightM: 3.5,
    headingDeg: 265,
    pitchDeg: -8,
  },
  {
    id: 'back-yard-cam2-water',
    image: '/yard-frames/back-yard-cam2-2026-10-12.jpg',
    // i18n-ignore: Paul's private camera title is source data.
    title: 'Back Yard Cam2 — the water: dock, paddle boat, smoker',
    takenAt: '2026-10-12 18:33 CDT',
    camLat: 29.24778,
    camLon: -95.23152,
    camHeightM: 5,
    headingDeg: 140,
    pitchDeg: -18,
    distanceM: 6.5,
  },
  {
    id: 'bed-station-20261012',
    image: '/yard-frames/bed-station-solar-2026-11-17.jpg',
    // i18n-ignore: Paul's private camera title is source data.
    title: 'Wyze Bed Cam — Queen Bed on West Bedroom Roof (Headboard East, Feet Due West 270°)',
    takenAt: '2026-11-17 16:49:58 CST',
    camLat: 29.247618,
    camLon: -95.231412,
    camHeightM: 0.32,
    headingDeg: 60,
    pitchDeg: -5,
    distanceM: 2.5,
    fovHDeg: 68,
    fovVDeg: 38,
  },
  {
    id: 'garage-carport-20261117',
    image: '/yard-frames/latest-garage.jpg',
    // i18n-ignore: Paul's private camera title is source data.
    title: 'East Carport / Garage Cam — Corvette, Roadster & Monaco RV Nose',
    takenAt: '2026-11-17 00:09:55 CST',
    camLat: 29.247560,
    camLon: -95.231292,
    camHeightM: 1.48,
    headingDeg: 175,
    pitchDeg: -5,
    distanceM: 2.45,
    fovHDeg: 78,
    fovVDeg: 45,
    flat: false,
  },
];

const DEFAULT_FOV_H_DEG = 103;
const DEFAULT_FOV_V_DEG = 66;
const DEFAULT_DISTANCE_M = 6.5;

/**
 * Calibrated house-relative survey placements for 417 Palm Drive, Liverpool, TX:
 * - Yellow House roof: lat 29.24758, lon -95.23139
 * - Chocolate Bayou dock (North): lat 29.24778, lon -95.23145
 * - Palm Drive road (South): lat 29.24735
 * - East front driveway (RV, red van, white Tesla): lat 29.24746, lon -95.23134
 * - West front yard (Beaver solar arch, dome, utility pole, neighbor's oak tree): lat 29.24748, lon -95.23152
 */
const CALIBRATED_HOUSE_SURVEY = {
  'back-yard-cam1-plan': {
    // East front driveway (RV, red van, white Tesla on left; Beaver solar arch on right; Palm Dr ahead)
    // Landmark-solved to stitch directly onto the left edge of Yard Overview (Wyze V4) over the white RV & east driveway
    camLat: 29.24756,
    camLon: -95.23134,
    camHeightM: 6.2,
    headingDeg: 175,
    pitchDeg: -36,
    distanceM: 6.2,
    widthScale: 0.85,
    rollDeg: 0,
    flat: false,
    texRot: 0,
    hiddenByStitch: true,
  },
  'yard-overview-20261012': {
    // Stretched across the East Driveway + Solar Carport so the White Tesla & solar panels align over their driveway footprint
    camLat: 29.247452,
    camLon: -95.231350,
    camHeightM: 0.22,
    headingDeg: 194,
    pitchDeg: -18,
    distanceM: 6.4,
    widthScale: 1.48,
    rollDeg: 2,
    flat: true,
    texRot: 0,
    stitchedPano: true,
    viewTiltCompensate: true,
  },
  'house-side-20261012': {
    hiddenByStitch: true,
    // Between yellow house W wall and Beaver solar arch, looking NNW (348°) toward back yard & bayou
    // Kept compact at ground level alongside the W wall so it never pokes through Yard Overview
    camLat: 29.24758,
    camLon: -95.23143,
    camHeightM: 2.6,
    headingDeg: 348,
    pitchDeg: -8,
    distanceM: 3.2,
    widthScale: 0.85,
    rollDeg: 0,
    flat: false,
    texRot: 0,
  },
  'back-yard-cam2-water': {
    hiddenByStitch: true,
    // Positioned cleanly under the two 3D backyard Live Oak trees along the Lot 23 shoreline & dock (14° bayou perpendicular)
    camLat: 29.247748,
    camLon: -95.231385,
    camHeightM: 0.25,
    headingDeg: 14,
    pitchDeg: -18,
    distanceM: 9.5,
    widthScale: 0.95,
    rollDeg: 0,
    flat: true,
    texRot: 0,
    stitchedWaterPano: true,
  },
  'bed-station-20261012': {
    hiddenByStitch: false,
    camLat: 29.247605,
    camLon: -95.231412,
    camHeightM: 0.32,
    // Photo space: headboard at upper-right, bed axis (head -> feet) points down-left at ~240° math-angle,
    // so a heading of 60° rotates the photo clockwise until the feet point Due West (270°) & headboard Due East.
    headingDeg: 60,
    pitchDeg: -5,
    distanceM: 2.5,
    fovHDeg: 68,
    fovVDeg: 38,
    widthScale: 1.0,
    rollDeg: 0,
    sizeScale: 1.0,
    flat: true,
    texRot: 0,
  },
  'garage-carport-20261117': {
    hiddenByStitch: false,
    camLat: 29.247555,
    camLon: -95.231285,
    camHeightM: 1.48,
    headingDeg: 194,
    pitchDeg: -5,
    distanceM: 2.45,
    fovHDeg: 78,
    fovVDeg: 45,
    widthScale: 1.0,
    rollDeg: 0,
    flat: false,
    texRot: 0,
  },
};

const FRAME_CREDIT = new Cesium.Credit(
  'Yard frames — photos by Paul Prime, Oct 2026',
  true,
);

// ---------------------------------------------------------------------------
// Parametric frame rendering
// ---------------------------------------------------------------------------

export const LAYOUT_KEY = 'gev-yardframes-layout-v1';
const ENTITY_PREFIX = 'yardframe:';
const OUTLINE_ID = 'gev-arrange-outline';
export const FRAME_TEXTURE_COORDINATES = Object.freeze([
  Object.freeze([0, 0]),
  Object.freeze([1, 0]),
  Object.freeze([1, 1]),
  Object.freeze([0, 1]),
]);

/** Built-in params for one frame definition (the pre-editor values). */
export function defaultParams(f) {
  return {
    camLat: f.camLat,
    camLon: f.camLon,
    camHeightM: f.camHeightM,
    headingDeg: f.headingDeg,
    pitchDeg: f.pitchDeg || 0,
    distanceM: f.distanceM || DEFAULT_DISTANCE_M,
    fovHDeg: f.fovHDeg || DEFAULT_FOV_H_DEG,
    fovVDeg: f.fovVDeg || DEFAULT_FOV_V_DEG,
    flat: f.flat === true,
    texRot: f.texRot || 0,
  };
}

const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * Compute the 3D world-space center of a photo quad (lat, lon, heightM above STORED_GROUND_HEIGHT_M).
 * Locking this center while resizing/spinning/tilting prevents the photo from jumping off landmarks!
 */
function getFrameCenterGeo(p) {
  if (p.flat) {
    return {
      lat: p.camLat,
      lon: p.camLon,
      heightM: p.camHeightM,
    };
  }
  const dist = p.distanceM || DEFAULT_DISTANCE_M;
  const H = toRad(p.headingDeg || 0);
  const P = toRad(p.pitchDeg || 0);
  const eastM = Math.sin(H) * Math.cos(P) * dist;
  const northM = Math.cos(H) * Math.cos(P) * dist;
  const upM = Math.sin(P) * dist;
  const lat = p.camLat + northM / 111320;
  const lon = p.camLon + eastM / (111320 * Math.cos(toRad(p.camLat)));
  const heightM = p.camHeightM + upM;
  return { lat, lon, heightM };
}

/**
 * Re-anchor camLat/camLon/camHeightM so the quad's 3D center stays pinned at `centerGeo`
 * after changing distanceM (size), headingDeg (spin), or pitchDeg (tilt).
 */
function pinFrameCenterGeo(p, centerGeo) {
  if (!centerGeo) return;
  if (p.flat) {
    p.camLat = centerGeo.lat;
    p.camLon = centerGeo.lon;
    p.camHeightM = centerGeo.heightM;
    return;
  }
  const dist = p.distanceM || DEFAULT_DISTANCE_M;
  const H = toRad(p.headingDeg || 0);
  const P = toRad(p.pitchDeg || 0);
  const eastM = Math.sin(H) * Math.cos(P) * dist;
  const northM = Math.cos(H) * Math.cos(P) * dist;
  const upM = Math.sin(P) * dist;
  p.camLat = centerGeo.lat - northM / 111320;
  p.camLon = centerGeo.lon - eastM / (111320 * Math.cos(toRad(centerGeo.lat)));
  p.camHeightM = centerGeo.heightM - upM;
}

/** Saved arrangement (id -> params) from localStorage, with house-survey calibration migration. */
function loadSavedLayout() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    if (!raw) {
      const initial = {
        version: 1,
        fixedSidewaysRoadV1: true,
        fixedHouseSurveyV3: true,
        fixedRoofGluedNoParallaxV20: true,
        fixedFeetDueWestAndGarageV21: true,
        fixedBedQueenDueWestV22: true,
        fixedGarageCleanBayV23: true,
        savedAt: new Date().toISOString(),
        frames: { ...CALIBRATED_HOUSE_SURVEY },
      };
      window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(initial));
      return initial.frames;
    }
    const parsed = JSON.parse(raw);
    const frames = (parsed && parsed.frames) || {};
    if (parsed && !parsed.fixedRoofGluedNoParallaxV20) {
      for (const id of Object.keys(CALIBRATED_HOUSE_SURVEY)) {
        frames[id] = {
          ...(frames[id] || {}),
          ...CALIBRATED_HOUSE_SURVEY[id],
        };
      }
      parsed.fixedSolarBedV12 = true;
      parsed.fixedCleanHomogV15 = true;
      parsed.fixedCrispSurveyV16 = true;
      parsed.fixedYardBoundedPOV_V17 = true;
      parsed.fixedHideFloatingBedSideV18 = true;
      parsed.fixedBedOnRoofAndGarageV19 = true;
      parsed.fixedRoofGluedNoParallaxV20 = true;
      parsed.fixedFeetDueWestAndGarageV21 = true;
      parsed.frames = frames;
      window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(parsed));
    } else if (parsed && !parsed.fixedFeetDueWestAndGarageV21) {
      for (const id of ['bed-station-20261012', 'garage-carport-20261117']) {
        frames[id] = {
          ...(frames[id] || {}),
          ...CALIBRATED_HOUSE_SURVEY[id],
        };
      }
      parsed.fixedFeetDueWestAndGarageV21 = true;
      parsed.frames = frames;
      window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(parsed));
    }
    if (parsed && !parsed.fixedBedQueenDueWestV22) {
      frames['bed-station-20261012'] = {
        ...(frames['bed-station-20261012'] || {}),
        ...CALIBRATED_HOUSE_SURVEY['bed-station-20261012'],
      };
      parsed.fixedBedQueenDueWestV22 = true;
      parsed.frames = frames;
      window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(parsed));
    }
    if (parsed && !parsed.fixedGarageCleanBayV23) {
      frames['garage-carport-20261117'] = {
        ...(frames['garage-carport-20261117'] || {}),
        ...CALIBRATED_HOUSE_SURVEY['garage-carport-20261117'],
      };
      parsed.fixedGarageCleanBayV23 = true;
      parsed.frames = frames;
      window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(parsed));
    }
    if (parsed && !parsed.fixedLot23AlignedV24) {
      for (const id of ['yard-overview-20261012', 'back-yard-cam2-water', 'bed-station-20261012', 'garage-carport-20261117']) {
        frames[id] = {
          ...(frames[id] || {}),
          ...CALIBRATED_HOUSE_SURVEY[id],
        };
      }
      parsed.fixedLot23AlignedV24 = true;
      parsed.frames = frames;
      window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(parsed));
    }
    return frames;
  } catch (error) {
    console.warn(
      '[YardFrames] saved layout unreadable, using built-ins:',
      error,
    );
    return {};
  }
}

/**
 * Quad corners for a params object, ordered BL, BR, TR, TL in photo
 * space (bottom-left, bottom-right, top-right, top-left).
 *
 * Supports optional `widthScale` (horizontal aspect correction) and
 * `rollDeg` (in-plane rotation of the photo around its view axis).
 */
export function activeYardDatumM(viewer, lon, lat) {
  if (!viewer) return STORED_GROUND_HEIGHT_M;
  if (viewer?.scene?.globe?.show) {
    return resolveTerrainGroundM(viewer, lon, lat, STORED_GROUND_HEIGHT_M);
  }
  if (Number.isFinite(viewer._pflUniformGoogleDatumM)) {
    return viewer._pflUniformGoogleDatumM;
  }
  // Sample bare Palm Drive street/apron pavement excluding placed entities so houses/oaks never corrupt datum height.
  try {
    const sampleFn = viewer?.scene?.sampleHeight;
    if (typeof sampleFn === 'function') {
      const excludeList = [];
      try {
        for (const ent of viewer?.entities?.values || []) excludeList.push(ent);
      } catch {}
      const probes = [
        [-95.231340, 29.247395],
        [-95.231385, 29.247402],
        [lon, lat],
      ];
      for (const [pLon, pLat] of probes) {
        if (!Number.isFinite(pLon) || !Number.isFinite(pLat)) continue;
        const sh = sampleFn.call(
          viewer.scene,
          Cesium.Cartographic.fromDegrees(pLon, pLat),
          excludeList.length ? excludeList : undefined,
        );
        if (Number.isFinite(sh) && sh >= -30 && sh <= -18) {
          viewer._pflUniformGoogleDatumM = sh + 0.18;
          return viewer._pflUniformGoogleDatumM;
        }
      }
    }
  } catch {}
  return STORED_GROUND_HEIGHT_M + 1.55;
}

export function computeCorners(p, viewer = null) {
  const baseDatum = activeYardDatumM(viewer, p.camLon, p.camLat);
  const anchor = Cesium.Cartesian3.fromDegrees(
    p.camLon,
    p.camLat,
    baseDatum + p.camHeightM,
  );
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(anchor);
  const dist = p.distanceM || DEFAULT_DISTANCE_M;
  const wScale = typeof p.widthScale === 'number' && p.widthScale > 0 ? p.widthScale : 1;
  const tiltFactor =
    !p.flat && p.viewTiltCompensate && typeof p._viewTiltScale === 'number'
      ? p._viewTiltScale
      : 1;
  const sizeScale =
    typeof p.sizeScale === 'number' && p.sizeScale > 0 ? p.sizeScale : 1;
  const w =
    sizeScale *
    (p.stitchedPano && p.flat
      ? 58.82 * (dist / 16.7) * wScale
      : 2 *
        dist *
        Math.tan(toRad((p.fovHDeg || DEFAULT_FOV_H_DEG) / 2)) *
        wScale *
        (p.stitchedWaterPano ? 1.42 : 1));
  const h =
    sizeScale *
    (p.stitchedPano && p.flat
      ? 42.5 * (dist / 16.7)
      : 2 * dist * Math.tan(toRad((p.fovVDeg || DEFAULT_FOV_V_DEG) / 2)) * tiltFactor);
  let right;
  let up;
  let center;
  if (p.flat) {
    const H = toRad((p.headingDeg || 0) + (p.rollDeg || 0));
    right = new Cesium.Cartesian3(Math.cos(H), -Math.sin(H), 0);
    up = new Cesium.Cartesian3(Math.sin(H), Math.cos(H), 0);
    center = new Cesium.Cartesian3(0, 0, 0);
  } else {
    const H = toRad(p.headingDeg);
    const P = toRad(p.pitchDeg || 0);
    const fwd = new Cesium.Cartesian3(
      Math.sin(H) * Math.cos(P),
      Math.cos(H) * Math.cos(P),
      Math.sin(P),
    );
    const right0 = new Cesium.Cartesian3(Math.cos(H), -Math.sin(H), 0);
    const up0 = new Cesium.Cartesian3();
    Cesium.Cartesian3.cross(right0, fwd, up0);
    const rollRad = toRad(p.rollDeg || 0);
    if (rollRad !== 0) {
      const cR = Math.cos(rollRad);
      const sR = Math.sin(rollRad);
      right = new Cesium.Cartesian3(
        right0.x * cR - up0.x * sR,
        right0.y * cR - up0.y * sR,
        right0.z * cR - up0.z * sR,
      );
      up = new Cesium.Cartesian3(
        right0.x * sR + up0.x * cR,
        right0.y * sR + up0.y * cR,
        right0.z * sR + up0.z * cR,
      );
    } else {
      right = right0;
      up = up0;
    }
    center = Cesium.Cartesian3.multiplyByScalar(
      fwd,
      dist,
      new Cesium.Cartesian3(),
    );
  }
  const hw = Cesium.Cartesian3.multiplyByScalar(
    right,
    w / 2,
    new Cesium.Cartesian3(),
  );
  const hh = Cesium.Cartesian3.multiplyByScalar(
    up,
    h / 2,
    new Cesium.Cartesian3(),
  );
  const sxMin = p.stitchedPano && !p.flat ? -1.505 : -1;
  const syMin = p.stitchedPano && !p.flat ? -1.70 : -1;
  const corner = (sx, sy) => {
    const local = new Cesium.Cartesian3();
    Cesium.Cartesian3.add(
      center,
      Cesium.Cartesian3.multiplyByScalar(hw, sx, new Cesium.Cartesian3()),
      local,
    );
    Cesium.Cartesian3.add(
      local,
      Cesium.Cartesian3.multiplyByScalar(hh, sy, new Cesium.Cartesian3()),
      local,
    );
    return Cesium.Matrix4.multiplyByPoint(enu, local, new Cesium.Cartesian3());
  };
  return {
    positions: [corner(sxMin, syMin), corner(1, syMin), corner(1, 1), corner(sxMin, 1)],
    widthM: w,
    heightM: h,
    distanceM: dist,
  };
}

let _cleanGarageCanvas = null;
let _cleanGarageLoading = false;
const _cleanGarageCallbacks = [];

function scrubWyzeGreenBoxToCanvas(img) {
  const w = img.naturalWidth || img.width || 640;
  const h = img.naturalHeight || img.height || 360;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  try {
    const imgData = ctx.getImageData(0, 0, w, h);
    const px = imgData.data;
    const isGreenOsd = (idx) => {
      const r = px[idx];
      const g = px[idx + 1];
      const b = px[idx + 2];
      return g > 88 && g - Math.max(r, b) > 32;
    };
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < h; y++) {
        const rowOff = y * w * 4;
        for (let x = 0; x < w; x++) {
          const i = rowOff + x * 4;
          if (!isGreenOsd(i)) continue;
          let sr = 0, sg = 0, sb = 0, cnt = 0;
          for (const [dx, dy] of [[-7, 0], [7, 0], [0, -7], [0, 7], [-12, 0], [12, 0]]) {
            const nx = Math.max(0, Math.min(w - 1, x + dx));
            const ny = Math.max(0, Math.min(h - 1, y + dy));
            const ni = (ny * w + nx) * 4;
            if (!isGreenOsd(ni)) {
              sr += px[ni];
              sg += px[ni + 1];
              sb += px[ni + 2];
              cnt++;
            }
          }
          if (cnt > 0) {
            px[i] = Math.round(sr / cnt);
            px[i + 1] = Math.round(sg / cnt);
            px[i + 2] = Math.round(sb / cnt);
          } else {
            px[i] = px[i + 2];
            px[i + 1] = px[i + 2];
          }
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } catch {}
  if (typeof window !== 'undefined') window.__pflCleanGarageCanvas = c;
  return c;
}

/** Build (or rebuild) the Cesium entity for one frame. */
function buildFrameEntity(viewer, def, params) {
  const { positions, widthM, heightM, distanceM } = computeCorners(params, viewer);
  const entityId = ENTITY_PREFIX + def.id;
  const stale = viewer.entities.getById(entityId);
  if (stale) viewer.entities.remove(stale);
  const opacity = typeof params.opacity === 'number' ? params.opacity : 1.0;
  const isCleanGarage = def.id === 'garage-carport-20261117';
  const imgUrl =
    def.id === 'yard-overview-20261012' && params.stitchedPano
      ? (window.__pflLiveStitchUrl || '/yard-frames/front-yard-stitched-live.png?v=18')
      : def.id === 'back-yard-cam2-water' && params.stitchedWaterPano
        ? '/yard-frames/back-yard-cam2-stitched-2026-10-26.png'
        : def.image;
  const initialImageSource = isCleanGarage && _cleanGarageCanvas ? _cleanGarageCanvas : imgUrl;
  const matProps = { image: initialImageSource };
  if (opacity < 0.99 || params.stitchedPano || params.stitchedWaterPano) {
    matProps.color = Cesium.Color.WHITE.withAlpha(opacity);
    matProps.transparent = true;
  }
  const polygon = {
    show: !Boolean(params.hiddenByStitch),
    hierarchy: new Cesium.PolygonHierarchy(positions),
    material: new Cesium.ImageMaterialProperty(matProps),
    perPositionHeight: true,
    // Pin every image to BL, BR, TR, TL. Cesium's automatic planar
    // projection may rotate an oblique quad as its dominant axis changes;
    // explicit coordinates keep the road line and the bed frame registered.
    textureCoordinates: new Cesium.PolygonHierarchy(
      (() => {
        const steps = (((Math.round(Number(params.texRot || 0) / 90) % 4) + 4) % 4);
        return FRAME_TEXTURE_COORDINATES.map((_, i) => {
          const [x, y] = FRAME_TEXTURE_COORDINATES[(i + steps) % 4];
          return new Cesium.Cartesian2(x, y);
        });
      })(),
    ),
  };
  const entity = viewer.entities.add({
    id: entityId,
    name: 'Yard frame: ' + def.id,
    polygon,
  });
  entity._pflSourceImageUrl = imgUrl;
  if (typeof Image !== 'undefined' && typeof imgUrl === 'string') {
    if (isCleanGarage && !_cleanGarageCanvas && typeof document !== 'undefined') {
      _cleanGarageCallbacks.push((cleanCanvas) => {
        const cur = viewer?.entities?.getById?.(entityId);
        if (cur?.polygon) {
          const nextProps = { image: cleanCanvas };
          if (opacity < 0.99) {
            nextProps.color = Cesium.Color.WHITE.withAlpha(opacity);
            nextProps.transparent = true;
          }
          cur.polygon.material = new Cesium.ImageMaterialProperty(nextProps);
          governorRequestRender('yardframe-garage-clean');
        }
      });
      if (!_cleanGarageLoading) {
        _cleanGarageLoading = true;
        const gImg = new Image();
        gImg.onload = () => {
          _cleanGarageCanvas = scrubWyzeGreenBoxToCanvas(gImg);
          _cleanGarageLoading = false;
          while (_cleanGarageCallbacks.length) {
            const cb = _cleanGarageCallbacks.shift();
            try { cb(_cleanGarageCanvas); } catch {}
          }
        };
        gImg.onerror = () => { _cleanGarageLoading = false; };
        gImg.src = imgUrl;
      }
    } else if (!isCleanGarage) {
      const pre = new Image();
      pre.onload = () => {
        governorRequestRender('yardframe-tex-ready');
        setTimeout(() => governorRequestRender('yardframe-tex-ready-2'), 120);
      };
      pre.src = imgUrl;
    }
  }
  console.info(
    '[YardFrames] ' +
      def.id +
      ' quad ' +
      widthM.toFixed(1) +
      'x' +
      heightM.toFixed(1) +
      ' m at ' +
      distanceM.toFixed(1) +
      ' m from cam ' +
      params.camLat.toFixed(6) +
      ', ' +
      params.camLon.toFixed(6) +
      (params.flat ? ' (lying flat, face to the sky)' : ''),
  );
  governorRequestRender('yardframes-build');
  if (viewer.scene && viewer.scene.requestRender) viewer.scene.requestRender();
  return entity;
}

// Live registry: id -> { def, params, entity, mov }.
const frameState = new Map();

function rebuildFrame(viewer, id) {
  const st = frameState.get(id);
  if (!st) return null;
  st.entity = buildFrameEntity(viewer, st.def, st.params);
  if (st.entity) {
    const hiddenStitch = Boolean(st.params?.hiddenByStitch) && !(editor && editor.on);
    st.entity.show = yardFramesVisible && !hiddenStitch;
    if (st.mov) st.entity._pflMovable = st.mov;
  }
  if (editor && editor.viewer === viewer && editor.selectedId === id) {
    drawOutline(viewer);
    refreshPanel();
  }
  return st.entity;
}

function saveLayout() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const frames = {};
    for (const [id, st] of frameState) frames[id] = { ...st.params };
    window.localStorage.setItem(
      LAYOUT_KEY,
      JSON.stringify({
        version: 1,
        fixedSidewaysRoadV1: true,
        fixedHouseSurveyV3: true,
        fixedHouseSurveyV4: true,
        fixedHouseSurveyV5: true,
        fixedHouseSurveyV6: true,
        fixedHouseSurveyV7: true,
        fixedHouseSurveyV8: true,
        fixedHouseSurveyV9: true,
        fixedHouseSurveyV10: true,
        fixedHouseSurveyV11: true,
        fixedSolarBedV12: true,
        fixedRoofGluedNoParallaxV20: true,
        fixedFeetDueWestAndGarageV21: true,
        fixedBedQueenDueWestV22: true,
        fixedGarageCleanBayV23: true,
        savedAt: new Date().toISOString(),
        frames,
      }),
    );
  } catch (error) {
    console.warn('[YardFrames] could not save layout:', error);
  }
}

let viewTiltUnsub = null;
let yardDatumCleanup = null;

/**
 * Frustum-true v2 renderer. Saved Arrange-mode params merge over the built-in values.
 */

const YARD_FRAMES_VIS_KEY = 'pfl_yard_frames_visible_v1';
let yardFramesVisible = true;
try {
  const rawVis = typeof localStorage !== 'undefined' ? localStorage.getItem(YARD_FRAMES_VIS_KEY) : null;
  yardFramesVisible = rawVis !== '0';
} catch {}

export function setYardFramesVisible(viewer, visible) {
  yardFramesVisible = Boolean(visible);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(YARD_FRAMES_VIS_KEY, yardFramesVisible ? '1' : '0');
    }
  } catch {}
  for (const [, st] of frameState) {
    if (st.entity) {
      const hiddenStitch = Boolean(st.params?.hiddenByStitch) && !(editor && editor.on);
      st.entity.show = yardFramesVisible && !hiddenStitch;
    }
  }
  if (!yardFramesVisible) clearOutline(viewer);
  governorRequestRender('yardframes-visibility');
  return yardFramesVisible;
}

export function loadYardFrames({ viewer }) {
  destroyYardFrames(viewer);
  const saved = loadSavedLayout();
  frameState.clear();
  for (const f of YARD_FRAMES) {
    const params = { ...defaultParams(f), ...(saved[f.id] || {}) };
    const entity = buildFrameEntity(viewer, f, params);
    if (entity) {
      const hiddenStitch = Boolean(params.hiddenByStitch);
      entity.show = yardFramesVisible && !hiddenStitch;
    }
    const stEntry = { def: f, params, entity, mov: null };
    frameState.set(f.id, stEntry);
    if (entity && f.id !== 'yard-overview-20261012') {
      const mov = {
        kind: 'yardframe:' + f.id,
        label: f.id === 'bed-station-20261012' ? '🛏️ Paul & Lisa Bed Photo' : f.id === 'garage-carport-20261117' ? '🚗 Garage Carport Photo' : `🖼️ ${f.id}`,
        getState: () => {
          const ctr = getFrameCenterGeo(params);
          return {
            lat: ctr.lat,
            lon: ctr.lon,
            heading: params.headingDeg || 0,
            lift: ctr.heightM || 0,
            scale: typeof params.sizeScale === 'number' && params.sizeScale > 0 ? params.sizeScale : 1,
            opacity: typeof params.opacity === 'number' ? params.opacity : 1.0,
          };
        },
        update: (patch) => {
          const ctr = getFrameCenterGeo(params);
          if (typeof patch.lat === 'number') ctr.lat = patch.lat;
          if (typeof patch.lon === 'number') ctr.lon = patch.lon;
          if (typeof patch.lift === 'number') ctr.heightM = patch.lift;
          if (typeof patch.heading === 'number') params.headingDeg = patch.heading;
          if (typeof patch.scale === 'number' && patch.scale > 0) {
            params.sizeScale = Math.max(0.25, Math.min(3.5, patch.scale));
          }
          if (typeof patch.opacity === 'number' && Number.isFinite(patch.opacity)) {
            params.opacity = Math.max(0.05, Math.min(1.0, patch.opacity));
          }
          pinFrameCenterGeo(params, ctr);
          params.hiddenByStitch = false;
          const rebuilt = rebuildFrame(viewer, f.id);
          if (rebuilt) rebuilt._pflMovable = mov;
          saveLayout();
          governorRequestRender('pfl-move-yardframe');
        },
      };
      stEntry.mov = mov;
      entity._pflMovable = mov;
      if (typeof window !== 'undefined') {
        window.__pflMovables = window.__pflMovables || {};
        window.__pflMovables[f.id] = mov;
      }
    }
  }
  if (typeof window !== 'undefined') {
    window.__pflSetYardFramesVisible = (v) => setYardFramesVisible(viewer, v);
    window.__pflGetYardFramesVisible = () => yardFramesVisible;
    window.__pflReloadLiveStitchedYard = (bustUrl) => {
      window.__pflLiveStitchUrl = bustUrl || ('/yard-frames/front-yard-stitched-live.png?t=' + Date.now());
      if (!yardFramesVisible) setYardFramesVisible(viewer, true);
      else rebuildFrame(viewer, 'yard-overview-20261012');
    };
  }
  function updateViewDependentYardFrame() {
    try {
      if (!yardFramesVisible || (typeof editor !== 'undefined' && editor?.on)) return;
      const yo = frameState.get('yard-overview-20261012');
      if (!yo?.entity?.polygon) return;
      const c = viewer?.camera?.positionCartographic;
      if (!c) return;
      const pitchDeg = Cesium.Math.toDegrees(viewer.camera.pitch || 0);
      const hdgDeg = ((Cesium.Math.toDegrees(viewer.camera.heading || 0) % 360) + 360) % 360;
      const altM = c.height;
      const hdgDiff = Math.abs((((hdgDeg - 194) + 540) % 360) - 180);
      const validPOV = pitchDeg > -56 && altM < 92 && hdgDiff < 98;
      yo.entity.show = validPOV;
    } catch {}
  }

  if (viewer?.camera?.changed?.addEventListener) {
    let lastPitchDeg = null;
    setTimeout(updateViewDependentYardFrame, 120);
    viewTiltUnsub = viewer.camera.changed.addEventListener(() => {
      updateViewDependentYardFrame();
      const pitchRad = viewer.camera.pitch;
      const pitchDeg = Math.abs(Cesium.Math.toDegrees(pitchRad));
      if (lastPitchDeg !== null && Math.abs(pitchDeg - lastPitchDeg) < 1.2) return;
      lastPitchDeg = pitchDeg;
      const clampedPitch = Math.max(14, Math.min(75, pitchDeg));
      const scale = Math.min(1.65, Math.max(0.85, Math.tan(toRad(clampedPitch)) / Math.tan(toRad(24))));
      for (const [id, st] of frameState) {
        if (st.params.viewTiltCompensate && !st.params.flat) {
          st.params._viewTiltScale = scale;
          rebuildFrame(viewer, id);
        }
      }
    });
  }
  viewer.creditDisplay.addStaticCredit(FRAME_CREDIT);
  installArrangeToggle(viewer);
  {
    let lastYardDatumM = activeYardDatumM(viewer, -95.23144, 29.24752);
    let datumTimer = null;
    const unsubs = [];
    const scheduleRebuildAll = (force = false) => {
      if (datumTimer) clearTimeout(datumTimer);
      datumTimer = setTimeout(() => {
        datumTimer = null;
        const nextDatumM = activeYardDatumM(viewer, -95.23144, 29.24752);
        if (!force && Math.abs(nextDatumM - lastYardDatumM) <= 0.15) return;
        lastYardDatumM = nextDatumM;
        for (const id of frameState.keys()) rebuildFrame(viewer, id);
      }, 250);
    };
    const onStack = () => scheduleRebuildAll(true);
    if (typeof window !== 'undefined') {
      window.addEventListener('gev:map-stack-changed', onStack);
      window.addEventListener('gev:google3d-settled', onStack);
    }
    if (viewer?.scene?.terrainProviderChanged?.addEventListener) {
      unsubs.push(viewer.scene.terrainProviderChanged.addEventListener(() => scheduleRebuildAll(true)));
    }
    if (viewer?.scene?.globe?.tileLoadProgressEvent?.addEventListener) {
      unsubs.push(viewer.scene.globe.tileLoadProgressEvent.addEventListener((pending) => {
        if (pending === 0) scheduleRebuildAll(false);
      }));
    }
    yardDatumCleanup = () => {
      if (datumTimer) clearTimeout(datumTimer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('gev:map-stack-changed', onStack);
        window.removeEventListener('gev:google3d-settled', onStack);
      }
      for (const u of unsubs) {
        try { if (typeof u === 'function') u(); } catch {}
      }
    };
  }
  return {
    entities: viewer.entities,
    destroy: () => destroyYardFrames(viewer),
  };
}

/** Remove every yard-frame entity and editor surface owned by this module. */
export function destroyYardFrames(viewer) {
  if (typeof yardDatumCleanup === 'function') {
    try {
      yardDatumCleanup();
    } catch {}
    yardDatumCleanup = null;
  }
  if (typeof viewTiltUnsub === 'function') {
    try {
      viewTiltUnsub();
    } catch (e) {
      /* ignore */
    }
    viewTiltUnsub = null;
  }
  if (editor?.viewer === viewer) {
    if (editor.on) releaseContinuousRender('yardframes-arrange');
    removeHandlers(viewer);
    editor.toggle?.remove();
    editor.dockBtn?.remove();
    editor.panel?.remove();
    editor = null;
  }
  viewer?.entities?.removeById?.(OUTLINE_ID);
  for (const id of frameState.keys()) {
    viewer?.entities?.removeById?.(ENTITY_PREFIX + id);
  }
  frameState.clear();
  viewer?.creditDisplay?.removeStaticCredit?.(FRAME_CREDIT);
  governorRequestRender('yardframes-destroy');
}

// ---------------------------------------------------------------------------
// Arrange mode — docked far-left drag-and-drop frame editor
// ---------------------------------------------------------------------------

const STEP = {
  headingDeg: 1.5,
  pitchDeg: 1.5,
  rollDeg: 1.0,
  heightM: 0.25,
  sizeM: 0.35,
  widthScale: 0.03,
  nudgeM: 0.4,
};
const ARRANGE_HINT =
  'Drag header to move panel. Click any photo on map to drag it. ' +
  'Size, Width, Spin & Roll keep the photo center locked in place.';
let editor = null;

function arrangeReadout(p) {
  const wPct = Math.round((typeof p.widthScale === 'number' ? p.widthScale : 1) * 100);
  const roll = Math.round(p.rollDeg || 0);
  return (
    'Spin ' +
    Math.round(((p.headingDeg % 360) + 360) % 360) +
    '° · Tilt ' +
    Math.round(p.pitchDeg) +
    '° · Roll ' +
    roll +
    '°\nSize ' +
    p.distanceM.toFixed(1) +
    'm · Width ' +
    wPct +
    '% · H ' +
    p.camHeightM.toFixed(1) +
    'm'
  );
}

function drawOutline(viewer) {
  if (!editor || !editor.selectedId) return;
  const st = frameState.get(editor.selectedId);
  if (!st) return;
  const { positions } = computeCorners(st.params, viewer);
  const loop = [...positions, positions[0]];
  const stale = viewer.entities.getById(OUTLINE_ID);
  if (stale) viewer.entities.remove(stale);
  editor.outline = viewer.entities.add({
    id: OUTLINE_ID,
    name: 'Arrange outline',
    polyline: {
      positions: loop,
      width: 3,
      material: Cesium.Color.fromCssColorString('#00d4ff'),
      clampToGround: false,
    },
  });
  governorRequestRender('yardframes-outline');
}

function clearOutline(viewer) {
  const stale = viewer.entities.getById(OUTLINE_ID);
  if (stale) viewer.entities.remove(stale);
  if (editor) editor.outline = null;
  governorRequestRender('yardframes-outline-clear');
}

function selectFrame(viewer, id) {
  if (!editor) return;
  editor.selectedId = id;
  if (id) drawOutline(viewer);
  else clearOutline(viewer);
  refreshPanel();
}

function refreshPanel() {
  if (!editor || !editor.panel) return;
  const st = editor.selectedId ? frameState.get(editor.selectedId) : null;
  const nameEl = editor.panel.querySelector('[data-role="frame-name"]');
  const readEl = editor.panel.querySelector('[data-role="frame-readout"]');
  const sizeSlider = editor.panel.querySelector('[data-role="size-slider"]');
  const widthSlider = editor.panel.querySelector('[data-role="width-slider"]');
  const opacitySlider = editor.panel.querySelector('[data-role="opacity-slider"]');
  if (nameEl) {
    // i18n-ignore: private PFL operator surface is intentionally English.
    nameEl.textContent = st
      ? st.def.title
      : 'Click a photo to select it.';
  }
  if (readEl) {
    if (!st) {
      // i18n-ignore: private PFL operator surface is intentionally English.
      readEl.textContent = 'Nothing selected.';
    } else {
      // i18n-ignore: private PFL operator surface is intentionally English.
      readEl.textContent = arrangeReadout(st.params);
    }
  }
  if (sizeSlider) {
    sizeSlider.disabled = !st;
    if (st) sizeSlider.value = String(st.params.distanceM || DEFAULT_DISTANCE_M);
  }
  if (widthSlider) {
    widthSlider.disabled = !st;
    if (st) widthSlider.value = String(typeof st.params.widthScale === 'number' ? st.params.widthScale : 1);
  }
  if (opacitySlider) {
    opacitySlider.disabled = !st;
    if (st) opacitySlider.value = String(typeof st.params.opacity === 'number' ? st.params.opacity : 1);
  }
  editor.panel.querySelectorAll('[data-needs-selection]').forEach((b) => {
    b.disabled = !st;
  });
  editor.panel.querySelectorAll('[data-frame-select]').forEach((b) => {
    const active = b.dataset.frameSelect === (editor.selectedId || '');
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
    b.style.borderColor = active ? '#00d4ff' : 'rgba(255,255,255,.14)';
    b.style.background = active ? 'rgba(0,212,255,.22)' : 'rgba(255,255,255,.06)';
  });
}

/**
 * Apply a change to frame `id`. When `opts.lockCenter` is true (default for
 * spin, tilt, size, roll, and width changes), the quad's 3D world center is
 * preserved so landmarks in the photo never jump off the satellite map!
 */
function applyChange(viewer, id, mutate, opts = {}) {
  const st = frameState.get(id);
  if (!st) return;
  const centerBefore = opts.lockCenter ? getFrameCenterGeo(st.params) : null;
  mutate(st.params);
  st.params.headingDeg = ((st.params.headingDeg % 360) + 360) % 360;
  st.params.pitchDeg = Math.max(-90, Math.min(90, st.params.pitchDeg));
  st.params.distanceM = Math.max(0.5, Math.min(40, st.params.distanceM));
  if (typeof st.params.widthScale === 'number') {
    st.params.widthScale = Math.max(0.35, Math.min(2.0, st.params.widthScale));
  }
  if (centerBefore) {
    pinFrameCenterGeo(st.params, centerBefore);
  }
  rebuildFrame(viewer, id);
  saveLayout();
}

function nudgeParams(p, northM, eastM) {
  const dLat = northM / 111320;
  const dLon = eastM / (111320 * Math.cos(toRad(p.camLat)));
  p.camLat += dLat;
  p.camLon += dLon;
}

function pickGround(viewer, windowPosition) {
  const ray = viewer.camera.getPickRay(windowPosition);
  if (ray) {
    const hit = viewer.scene.globe.pick(ray, viewer.scene);
    if (hit) return hit;
  }
  return (
    viewer.camera.pickEllipsoid(windowPosition, viewer.scene.globe.ellipsoid) ||
    null
  );
}

function installHandlers(viewer) {
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  editor.handler = handler;
  handler.setInputAction((evt) => {
    const picked = viewer.scene.pick(evt.position);
    const ent = picked && picked.id;
    if (ent && typeof ent.id === 'string' && ent.id.startsWith(ENTITY_PREFIX)) {
      const id = ent.id.slice(ENTITY_PREFIX.length);
      if (frameState.has(id)) {
        selectFrame(viewer, id);
        const ground = pickGround(viewer, evt.position);
        const st = frameState.get(id);
        editor.dragging = true;
        editor.dragOffset = { dLat: 0, dLon: 0 };
        if (ground && st) {
          const c = Cesium.Cartographic.fromCartesian(ground);
          editor.dragOffset = {
            dLat: st.params.camLat - Cesium.Math.toDegrees(c.latitude),
            dLon: st.params.camLon - Cesium.Math.toDegrees(c.longitude),
          };
        }
        viewer.scene.screenSpaceCameraController.enableInputs = false;
      }
    }
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);
  handler.setInputAction((evt) => {
    if (!editor || !editor.dragging || !editor.selectedId) return;
    const ground = pickGround(viewer, evt.endPosition);
    if (!ground) return;
    const st = frameState.get(editor.selectedId);
    if (!st) return;
    const c = Cesium.Cartographic.fromCartesian(ground);
    st.params.camLat =
      Cesium.Math.toDegrees(c.latitude) + editor.dragOffset.dLat;
    st.params.camLon =
      Cesium.Math.toDegrees(c.longitude) + editor.dragOffset.dLon;
    rebuildFrame(viewer, editor.selectedId);
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  const endDrag = () => {
    if (!editor || !editor.dragging) return;
    editor.dragging = false;
    viewer.scene.screenSpaceCameraController.enableInputs = true;
    saveLayout();
  };
  handler.setInputAction(endDrag, Cesium.ScreenSpaceEventType.LEFT_UP);
  editor.endDrag = endDrag;
  editor.windowUp = () => endDrag();
  window.addEventListener('pointerup', editor.windowUp);

  editor.keyHandler = (e) => {
    if (!editor || !editor.selectedId) return;
    const id = editor.selectedId;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const change = (fn, lockCenter = false) => {
      applyChange(viewer, id, fn, { lockCenter });
      e.preventDefault();
    };
    switch (e.key) {
      case 'q':
      case 'Q':
        change((p) => {
          p.headingDeg -= STEP.headingDeg;
        }, true);
        break;
      case 'e':
      case 'E':
        change((p) => {
          p.headingDeg += STEP.headingDeg;
        }, true);
        break;
      case 'r':
      case 'R':
        change((p) => {
          p.pitchDeg += STEP.pitchDeg;
        }, true);
        break;
      case 'f':
      case 'F':
        change((p) => {
          p.pitchDeg -= STEP.pitchDeg;
        }, true);
        break;
      case 'PageUp':
        change((p) => {
          p.camHeightM += STEP.heightM;
        }, false);
        break;
      case 'PageDown':
        change((p) => {
          p.camHeightM -= STEP.heightM;
        }, false);
        break;
      case '-':
      case '_':
        change((p) => {
          p.distanceM -= STEP.sizeM;
        }, true);
        break;
      case '=':
      case '+':
        change((p) => {
          p.distanceM += STEP.sizeM;
        }, true);
        break;
      case '[':
        change((p) => {
          p.widthScale = (typeof p.widthScale === 'number' ? p.widthScale : 1) - STEP.widthScale;
        }, true);
        break;
      case ']':
        change((p) => {
          p.widthScale = (typeof p.widthScale === 'number' ? p.widthScale : 1) + STEP.widthScale;
        }, true);
        break;
      case 'ArrowUp':
        change((p) => nudgeParams(p, STEP.nudgeM, 0), false);
        break;
      case 'ArrowDown':
        change((p) => nudgeParams(p, -STEP.nudgeM, 0), false);
        break;
      case 'ArrowLeft':
        change((p) => nudgeParams(p, 0, -STEP.nudgeM), false);
        break;
      case 'ArrowRight':
        change((p) => nudgeParams(p, 0, STEP.nudgeM), false);
        break;
      default:
        break;
    }
  };
  document.addEventListener('keydown', editor.keyHandler);
}

function removeHandlers(viewer) {
  if (!editor) return;
  if (editor.handler) editor.handler.destroy();
  editor.handler = null;
  if (editor.keyHandler)
    document.removeEventListener('keydown', editor.keyHandler);
  editor.keyHandler = null;
  if (editor.windowUp) window.removeEventListener('pointerup', editor.windowUp);
  editor.windowUp = null;
  viewer.scene.screenSpaceCameraController.enableInputs = true;
  editor.dragging = false;
}

const EDITOR_CSS = `
.gev-arrange-toggle{position:fixed;left:8px;top:62px;z-index:9999;
  font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.08em;
  color:#e8eaed;background:rgba(12,12,20,.88);border:1px solid rgba(0,212,255,.45);
  border-radius:8px;padding:6px 10px;cursor:pointer;backdrop-filter:blur(8px)}
.gev-arrange-toggle[aria-pressed="true"]{background:rgba(0,212,255,.22);color:#fff}
.gev-arrange-panel{position:fixed;left:8px;top:98px;z-index:9999;width:216px;
  max-height:calc(100vh - 110px);overflow-y:auto;color:#e8eaed;
  background:rgba(10,12,18,.92);border:1px solid rgba(0,212,255,.28);
  border-radius:12px;padding:9px;backdrop-filter:blur(10px);
  font-family:'Inter',sans-serif;font-size:11.5px;box-shadow:0 8px 28px rgba(0,0,0,.55)}
.gev-arrange-panel h3{margin:0;font-family:'JetBrains Mono',monospace;
  font-size:10.5px;letter-spacing:.12em;color:#00d4ff;cursor:move;user-select:none}
.gev-arrange-panel .gev-frame-name{font-weight:600;font-size:11.5px;margin:4px 0 2px;line-height:1.25}
.gev-arrange-panel .gev-readout{font-family:'JetBrains Mono',monospace;font-size:10px;
  color:rgba(232,234,237,.72);margin-bottom:6px;line-height:1.4;white-space:pre-line}
.gev-arrange-panel .gev-hint{font-size:10.5px;color:rgba(232,234,237,.65);
  line-height:1.35;margin:0 0 6px}
.gev-arrange-panel .gev-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.gev-arrange-panel button{font-family:'Inter',sans-serif;font-size:11.5px;min-height:28px;
  color:#e8eaed;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);
  border-radius:7px;cursor:pointer;padding:4px 5px}
.gev-arrange-panel button:hover:not(:disabled){border-color:rgba(0,212,255,.6);
  background:rgba(0,212,255,.14)}
.gev-arrange-panel button:disabled{opacity:.35;cursor:default}
.gev-arrange-panel .gev-wide{grid-column:1 / -1}
.gev-arrange-panel .gev-preset{background:rgba(0,212,255,.14);
  border-color:rgba(0,212,255,.5);font-weight:600}
.gev-arrange-panel .gev-section{font-family:'JetBrains Mono',monospace;font-size:9.5px;
  letter-spacing:.12em;color:rgba(232,234,237,.55);margin:8px 0 4px}
.gev-arrange-panel .gev-slider-row{display:flex;align-items:center;gap:6px;margin:4px 0;font-size:11px}
.gev-arrange-panel .gev-slider-row label{min-width:48px;color:rgba(232,234,237,.8)}
.gev-arrange-panel .gev-slider-row input[type="range"]{flex:1;accent-color:#00d4ff;cursor:pointer}
`;

function makeButton(text, className) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  if (className) b.className = className;
  return b;
}

function makePanelDraggable(panel, handle) {
  let draggingPanel = false;
  let startX = 0;
  let startY = 0;
  let origLeft = 8;
  let origTop = 52;
  handle.addEventListener('pointerdown', (e) => {
    if (e.target && e.target.tagName === 'BUTTON') return;
    draggingPanel = true;
    const rect = panel.getBoundingClientRect();
    origLeft = rect.left;
    origTop = rect.top;
    startX = e.clientX;
    startY = e.clientY;
    handle.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  window.addEventListener('pointermove', (e) => {
    if (!draggingPanel) return;
    const nx = Math.max(0, Math.min(window.innerWidth - 180, origLeft + (e.clientX - startX)));
    const ny = Math.max(0, Math.min(window.innerHeight - 80, origTop + (e.clientY - startY)));
    panel.style.left = nx + 'px';
    panel.style.top = ny + 'px';
  });
  window.addEventListener('pointerup', () => {
    draggingPanel = false;
  });
}

function buildPanel(viewer) {
  const panel = document.createElement('div');
  panel.className = 'gev-arrange-panel';
  panel.id = 'gev-arrange-panel';
  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;cursor:move';
  const title = document.createElement('h3');
  // i18n-ignore: private PFL operator surface is intentionally English.
  title.textContent = '✥ ARRANGE YARD PHOTOS';
  hdr.appendChild(title);
  const closeBtn = makeButton('✕');
  closeBtn.style.cssText = 'min-height:22px;padding:1px 7px;font-size:11px';
  closeBtn.addEventListener('click', () => setArrange(viewer, false));
  hdr.appendChild(closeBtn);
  panel.appendChild(hdr);
  makePanelDraggable(panel, hdr);

  const flyBtn = makeButton('✈️ Fly to Yard (417 Palm Dr)', 'gev-wide gev-preset');
  flyBtn.style.cssText = 'width:100%;min-height:28px;margin-bottom:5px;font-size:11.5px';
  flyBtn.addEventListener('click', () => {
    const center = Cesium.Cartesian3.fromDegrees(
      -95.23148,
      29.24752,
      STORED_GROUND_HEIGHT_M + 3,
    );
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(center, 24), {
      offset: new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(192),
        Cesium.Math.toRadians(-26),
        62,
      ),
      duration: 1.2,
    });
  });
  panel.appendChild(flyBtn);

  const stitchBtn = makeButton('🧵 Unified Stitch (Cam1+V4): ON', 'gev-wide gev-preset');
  stitchBtn.style.cssText = 'width:100%;min-height:26px;margin-bottom:6px;font-size:11px';
  const syncStitchBtn = () => {
    const yo = frameState.get('yard-overview-20261012')?.params;
    const isOn = Boolean(yo?.stitchedPano);
    stitchBtn.textContent = isOn
      ? '🧵 Unified Stitch (Cam1+V4): ON'
      : '🧵 Unified Stitch (Cam1+V4): OFF';
  };
  stitchBtn.addEventListener('click', () => {
    const yo = frameState.get('yard-overview-20261012');
    const c1 = frameState.get('back-yard-cam1-plan');
    if (!yo || !c1) return;
    const next = !yo.params.stitchedPano;
    yo.params.stitchedPano = next;
    c1.params.hiddenByStitch = next;
    rebuildFrame(viewer, 'yard-overview-20261012');
    rebuildFrame(viewer, 'back-yard-cam1-plan');
    saveLayout();
    syncStitchBtn();
  });
  setTimeout(syncStitchBtn, 0);
  panel.appendChild(stitchBtn);

  const waterStitchBtn = makeButton('🌊 Waterfront Stitch (Cam2): ON', 'gev-wide gev-preset');
  waterStitchBtn.style.cssText = 'width:100%;min-height:26px;margin-bottom:6px;font-size:11px';
  const syncWaterStitchBtn = () => {
    const wc = frameState.get('back-yard-cam2-water')?.params;
    const isOn = Boolean(wc?.stitchedWaterPano);
    waterStitchBtn.textContent = isOn
      ? '🌊 Waterfront Stitch (Cam2): ON'
      : '🌊 Waterfront Stitch (Cam2): OFF';
  };
  waterStitchBtn.addEventListener('click', () => {
    const wc = frameState.get('back-yard-cam2-water');
    if (!wc) return;
    wc.params.stitchedWaterPano = !wc.params.stitchedWaterPano;
    rebuildFrame(viewer, 'back-yard-cam2-water');
    saveLayout();
    syncWaterStitchBtn();
  });
  setTimeout(syncWaterStitchBtn, 0);
  panel.appendChild(waterStitchBtn);

  const name = document.createElement('div');
  name.className = 'gev-frame-name';
  name.dataset.role = 'frame-name';
  panel.appendChild(name);
  const readout = document.createElement('div');
  readout.className = 'gev-readout';
  readout.dataset.role = 'frame-readout';
  panel.appendChild(readout);
  const hint = document.createElement('p');
  hint.className = 'gev-hint';
  // i18n-ignore: private PFL operator surface is intentionally English.
  hint.textContent = ARRANGE_HINT;
  panel.appendChild(hint);

  const pickSection = document.createElement('div');
  pickSection.className = 'gev-section';
  // i18n-ignore: private PFL operator surface is intentionally English.
  pickSection.textContent = 'SELECT PHOTO';
  panel.appendChild(pickSection);
  const pickGrid = document.createElement('div');
  pickGrid.className = 'gev-grid';
  pickGrid.style.marginBottom = '6px';
  const shortNames = {
    'back-yard-cam1-plan': '1. Back Yard Cam1 (Road)',
    'yard-overview-20261012': '2. Yard Overview (Wyze V4)',
    'house-side-20261012': '3. Yellow House Side (HD)',
    'back-yard-cam2-water': '4. Water / Dock (Cam2)',
    'bed-station-20261012': '5. Bed Station (Inside)',
  };
  for (const f of YARD_FRAMES) {
    const pb = makeButton(shortNames[f.id] || f.id, 'gev-wide');
    pb.dataset.frameSelect = f.id;
    pb.style.minHeight = '26px';
    pb.style.fontSize = '11px';
    pb.style.textAlign = 'left';
    pb.style.padding = '3px 7px';
    pb.addEventListener('click', () => selectFrame(viewer, f.id));
    pickGrid.appendChild(pb);
  }
  panel.appendChild(pickGrid);

  // Sliders for smooth Size, Width (Aspect), and See-Thru Opacity
  const makeSliderRow = (labelTxt, role, min, max, step, val, onInput) => {
    const row = document.createElement('div');
    row.className = 'gev-slider-row';
    const lbl = document.createElement('label');
    // i18n-ignore: private PFL operator surface is intentionally English.
    lbl.textContent = labelTxt;
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = String(min);
    inp.max = String(max);
    inp.step = String(step);
    inp.value = String(val);
    inp.dataset.role = role;
    inp.addEventListener('input', () => {
      if (!editor || !editor.selectedId) return;
      onInput(Number(inp.value));
    });
    row.appendChild(lbl);
    row.appendChild(inp);
    panel.appendChild(row);
  };

  makeSliderRow('Size', 'size-slider', 1.5, 18, 0.1, 6.5, (v) => {
    applyChange(viewer, editor.selectedId, (p) => {
      p.distanceM = v;
    }, { lockCenter: true });
  });
  makeSliderRow('Width', 'width-slider', 0.45, 1.35, 0.01, 0.85, (v) => {
    applyChange(viewer, editor.selectedId, (p) => {
      p.widthScale = v;
    }, { lockCenter: true });
  });
  makeSliderRow('See-Thru', 'opacity-slider', 0.25, 1.0, 0.05, 1.0, (v) => {
    applyChange(viewer, editor.selectedId, (p) => {
      p.opacity = v;
    }, { lockCenter: false });
  });

  const grid = document.createElement('div');
  grid.className = 'gev-grid';
  const addBtn = (text, fn, opts = {}) => {
    const b = makeButton(text, opts.className || '');
    if (opts.wide) b.classList.add('gev-wide');
    if (!opts.always) b.dataset.needsSelection = '1';
    b.addEventListener('click', () => {
      if (!editor || !editor.selectedId) return;
      applyChange(viewer, editor.selectedId, fn, { lockCenter: Boolean(opts.lockCenter) });
    });
    grid.appendChild(b);
    return b;
  };
  addBtn('Smaller −', (p) => {
    p.distanceM -= STEP.sizeM;
  }, { lockCenter: true, className: 'gev-preset' });
  addBtn('Bigger +', (p) => {
    p.distanceM += STEP.sizeM;
  }, { lockCenter: true, className: 'gev-preset' });
  addBtn('Narrower ◂', (p) => {
    p.widthScale = (typeof p.widthScale === 'number' ? p.widthScale : 1) - STEP.widthScale;
  }, { lockCenter: true, className: 'gev-preset' });
  addBtn('Wider ▸', (p) => {
    p.widthScale = (typeof p.widthScale === 'number' ? p.widthScale : 1) + STEP.widthScale;
  }, { lockCenter: true, className: 'gev-preset' });
  addBtn('↶ Roll left', (p) => {
    p.rollDeg = (p.rollDeg || 0) - STEP.rollDeg;
  }, { lockCenter: true });
  addBtn('Roll right ↷', (p) => {
    p.rollDeg = (p.rollDeg || 0) + STEP.rollDeg;
  }, { lockCenter: true });
  addBtn('↺ Spin left', (p) => {
    p.headingDeg -= STEP.headingDeg;
  }, { lockCenter: true });
  addBtn('Spin right ↻', (p) => {
    p.headingDeg += STEP.headingDeg;
  }, { lockCenter: true });
  addBtn('↺ Rotate 90°', (p) => {
    p.headingDeg -= 90;
  }, { lockCenter: true });
  addBtn('Rotate 90° ↻', (p) => {
    p.headingDeg += 90;
  }, { lockCenter: true });
  addBtn('⟲ Turn Photo 90°', (p) => {
    p.texRot = (((Number(p.texRot || 0) - 90) % 360) + 360) % 360;
  });
  addBtn('Turn Photo 90° ⟳', (p) => {
    p.texRot = (((Number(p.texRot || 0) + 90) % 360) + 360) % 360;
  });
  addBtn('Flip 180°', (p) => {
    p.headingDeg += 180;
  }, { wide: true, lockCenter: true });
  addBtn('Tilt up', (p) => {
    p.pitchDeg += STEP.pitchDeg;
  }, { lockCenter: true });
  addBtn('Tilt down', (p) => {
    p.pitchDeg -= STEP.pitchDeg;
  }, { lockCenter: true });
  addBtn('Raise', (p) => {
    p.camHeightM += STEP.heightM;
  });
  addBtn('Lower', (p) => {
    p.camHeightM -= STEP.heightM;
  });
  addBtn('◀ West', (p) => nudgeParams(p, 0, -STEP.nudgeM));
  addBtn('East ▶', (p) => nudgeParams(p, 0, STEP.nudgeM));
  addBtn('▲ North', (p) => nudgeParams(p, STEP.nudgeM, 0));
  addBtn('▼ South', (p) => nudgeParams(p, -STEP.nudgeM, 0));
  addBtn(
    'Lay flat — face the sky',
    (p) => {
      p.flat = true;
    },
    { wide: true },
  );
  addBtn(
    'Stand up',
    (p) => {
      p.flat = false;
    },
    { wide: true },
  );
  addBtn(
    'Snap selected to House Survey',
    (p) => {
      const id = editor?.selectedId;
      if (id && CALIBRATED_HOUSE_SURVEY[id]) {
        Object.assign(p, CALIBRATED_HOUSE_SURVEY[id]);
      }
    },
    { wide: true, className: 'gev-preset' },
  );
  addBtn(
    'Reset selected frame',
    (p) => {
      const st = editor?.selectedId ? frameState.get(editor.selectedId) : null;
      if (st) Object.assign(p, defaultParams(st.def), CALIBRATED_HOUSE_SURVEY[st.def.id] || {});
    },
    { wide: true },
  );
  panel.appendChild(grid);

  const section = document.createElement('div');
  section.className = 'gev-section';
  // i18n-ignore: private PFL operator surface is intentionally English.
  section.textContent = 'LAYOUT FILE';
  panel.appendChild(section);
  const foot = document.createElement('div');
  foot.className = 'gev-grid';
  const exportBtn = makeButton('Export layout');
  exportBtn.classList.add('gev-wide');
  exportBtn.addEventListener('click', () => {
    saveLayout();
    const raw = window.localStorage.getItem(LAYOUT_KEY) || '{}';
    const blob = new Blob([raw], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gev-yardframes-layout.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
  foot.appendChild(exportBtn);
  const resetBtn = makeButton('Reset all 5 to House Survey');
  resetBtn.classList.add('gev-wide');
  resetBtn.addEventListener('click', () => {
    try {
      window.localStorage.removeItem(LAYOUT_KEY);
    } catch (e) {
      /* ignore */
    }
    window.location.reload();
  });
  foot.appendChild(resetBtn);
  panel.appendChild(foot);
  panel.style.display = 'none';
  document.body.appendChild(panel);
  return panel;
}

function setArrange(viewer, on) {
  if (!editor) return;
  editor.on = on;
  const label = on ? '✥ ARRANGE YARD PHOTOS: ON' : '✥ ARRANGE YARD PHOTOS';
  editor.toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
  // i18n-ignore: private PFL operator surface is intentionally English.
  editor.toggle.textContent = label;
  if (editor.dockBtn) {
    editor.dockBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    // i18n-ignore: private PFL operator surface is intentionally English.
    editor.dockBtn.textContent = label;
  }
  editor.panel.style.display = on ? 'block' : 'none';
  if (on) {
    holdContinuousRender('yardframes-arrange');
    installHandlers(viewer);
    if (!editor.selectedId && frameState.has('yard-overview-20261012')) {
      selectFrame(viewer, 'yard-overview-20261012');
    } else {
      refreshPanel();
    }
  } else {
    removeHandlers(viewer);
    selectFrame(viewer, null);
    releaseContinuousRender('yardframes-arrange');
    governorRequestRender('yardframes-arrange-off');
  }
}

function installArrangeToggle(viewer) {
  if (typeof document === 'undefined') return;
  for (const id of [
    'gev-arrange-toggle',
    'gev-arrange-dock-btn',
    'gev-arrange-panel',
    'gev-memory-palace-btn',
    'gev-fire-video-btn',
    'gev-fire-video-modal',
  ]) {
    document.getElementById(id)?.remove();
  }
  const oldCss = document.getElementById('gev-arrange-css');
  if (oldCss) oldCss.remove();
  const style = document.createElement('style');
  style.id = 'gev-arrange-css';
  style.textContent = EDITOR_CSS;
  document.head.appendChild(style);

  const toggle = makeButton('✥ ARRANGE YARD PHOTOS', 'gev-arrange-toggle');
  toggle.id = 'gev-arrange-toggle';
  toggle.setAttribute('aria-pressed', 'false');
  document.body.appendChild(toggle);

  let dockBtn = null;
  const locationBar = document.getElementById('location-bar') || document.body;
  if (locationBar) {
    dockBtn = makeButton('✥ ARRANGE YARD PHOTOS');
    dockBtn.id = 'gev-arrange-dock-btn';
    dockBtn.style.cssText =
      'width:100%;min-height:36px;margin:4px 0;padding:7px 10px;' +
      "font-family:'JetBrains Mono',monospace;font-size:11.5px;font-weight:600;letter-spacing:.10em;" +
      'color:#00d4ff;background:rgba(0,212,255,.14);border:1px solid rgba(0,212,255,.55);' +
      'border-radius:10px;cursor:pointer;text-align:center';
    if (locationBar !== document.body && locationBar.parentElement) locationBar.insertAdjacentElement('afterend', dockBtn); else document.body.appendChild(dockBtn);
    const mpBtn = document.createElement('a');
    mpBtn.id = 'gev-memory-palace-btn';
    mpBtn.href = '/memory-palace.html';
    // i18n-ignore: private PFL operator surface is intentionally English.
    mpBtn.textContent = '🏛️ 3D MEMORY PALACE';
    mpBtn.style.cssText =
      'display:block;width:100%;min-height:34px;margin:4px 0;padding:7px 10px;' +
      "font-family:'JetBrains Mono',monospace;font-size:11.5px;font-weight:600;letter-spacing:.10em;" +
      'color:#00ffcc;background:rgba(0,255,204,.14);border:1px solid rgba(0,255,204,.55);' +
      'border-radius:10px;cursor:pointer;text-align:center;text-decoration:none';
    dockBtn.insertAdjacentElement('afterend', mpBtn);

    const fireBtn = makeButton('🔥 YARD FIRE & LEGS VIDEO');
    fireBtn.id = 'gev-fire-video-btn';
    fireBtn.style.cssText =
      'width:100%;min-height:34px;margin:4px 0;padding:7px 10px;' +
      "font-family:'JetBrains Mono',monospace;font-size:11.5px;font-weight:600;letter-spacing:.08em;" +
      'color:#ffb84d;background:rgba(255,100,30,.18);border:1px solid rgba(255,140,66,.65);' +
      'border-radius:10px;cursor:pointer;text-align:center';
    mpBtn.insertAdjacentElement('afterend', fireBtn);

    const fireModal = document.createElement('div');
    fireModal.id = 'gev-fire-video-modal';
    fireModal.style.cssText =
      'display:none;position:fixed;inset:0;z-index:10002;background:rgba(4,9,16,0.86);' +
      'backdrop-filter:blur(10px);align-items:center;justify-content:center;padding:20px';
    fireModal.innerHTML = `
      <div style="max-width:960px;width:100%;max-height:90vh;overflow-y:auto;background:rgba(8,18,32,0.96);border:1px solid rgba(255,184,77,0.55);border-radius:14px;padding:18px 20px;box-shadow:0 18px 48px rgba(0,0,0,0.85);color:#e6f4ff;font-family:'Inter',sans-serif">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px solid rgba(255,184,77,0.25);padding-bottom:10px">
          <div>
            <div style="font-size:15px;font-weight:800;color:#ffb84d">🔥 OCT 25 YARD FIRE — "LEGS-ONLY" PATROL CUT &amp; BACK YARD CAM2 STITCHED SPLAT</div>
            <div style="font-size:11.5px;color:#8cb4d2;margin-top:2px">Boathouse Dock Cam (Pan V4) + Back Yard Cam2 · Tree-Aligned 3900×1913 Waterfront Panorama (12:12–23:44 CDT)</div>
          </div>
          <button type="button" id="gev-close-fire-modal" style="padding:6px 12px;border-radius:8px;border:1px solid rgba(255,184,77,0.5);background:rgba(255,184,77,0.14);color:#ffb84d;font-weight:700;cursor:pointer">✕ Close</button>
        </div>
        <div style="display:grid;grid-template-columns:1.15fr 1fr;gap:14px;align-items:start">
          <div>
            <div style="font-size:11px;font-weight:700;color:#00ffcc;margin-bottom:6px;text-transform:uppercase">🎬 Composite Video: 8 Legs-Only Patrol Clips + Solar Panel Fire (31.5s)</div>
            <video id="gev-fire-modal-video" controls preload="metadata" style="width:100%;border-radius:10px;border:1px solid rgba(0,240,255,0.35);background:#000" src="/yard-frames/yard-fire-legs-cut-2026-10-25.mp4"></video>
            <div style="font-size:11px;color:#8cb4d2;margin-top:6px;line-height:1.4">
              Extracted from 94 Wyze Cloud events on 2026-10-25: 6 Dock Cam clips framed strictly when Paul's legs walk across the lower dock frame + 2 Back Yard Cam2 fire clips (12:14 &amp; 12:17 CDT) + rotated post-fire damage view (23:44 CDT).
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">
            <div>
              <div style="font-size:11px;font-weight:700;color:#ffb84d;margin-bottom:4px;text-transform:uppercase">🌊 Stitched 3900×1913 Waterfront Splat (Tree-Registered)</div>
              <a href="/yard-frames/back-yard-cam2-stitched-2026-10-26.png" target="_blank" rel="noopener">
                <img src="/yard-frames/back-yard-cam2-stitched-2026-10-26.png" alt="Back Yard Cam2 Stitched Waterfront Splat" style="width:100%;border-radius:8px;border:1px solid rgba(255,184,77,0.45)" />
              </a>
            </div>
            <div>
              <div style="font-size:11px;font-weight:700;color:#00f0ff;margin-bottom:4px;text-transform:uppercase">📐 Annotated Fire &amp; Rotation Analysis Overlay</div>
              <a href="/yard-frames/back-yard-cam2-fire-analysis-2026-10-26.png" target="_blank" rel="noopener">
                <img src="/yard-frames/back-yard-cam2-fire-analysis-2026-10-26.png" alt="Back Yard Cam2 Annotated Fire Analysis" style="width:100%;border-radius:8px;border:1px solid rgba(0,240,255,0.35)" />
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(fireModal);
    const closeFireModal = () => {
      fireModal.style.display = 'none';
      const v = document.getElementById('gev-fire-modal-video');
      if (v && !v.paused) v.pause();
    };
    window.__pflOpenFireModal = () => {
      fireModal.style.display = 'flex';
    };
    fireBtn.addEventListener('click', () => {
      fireModal.style.display = 'flex';
    });
    fireModal.querySelector('#gev-close-fire-modal')?.addEventListener('click', closeFireModal);
    fireModal.addEventListener('click', (e) => {
      if (e.target === fireModal) closeFireModal();
    });
  }

  const panel = buildPanel(viewer);
  editor = {
    viewer,
    toggle,
    dockBtn,
    panel,
    handler: null,
    keyHandler: null,
    windowUp: null,
    endDrag: null,
    selectedId: null,
    outline: null,
    dragging: false,
    dragOffset: { dLat: 0, dLon: 0 },
    on: false,
  };
  toggle.addEventListener('click', () => setArrange(viewer, !editor.on));
  window.__pflToggleArrangeYard = () => {
    if (!editor.on && !yardFramesVisible) setYardFramesVisible(viewer, true);
    setArrange(viewer, !editor.on);
    return editor.on;
  };
  dockBtn?.addEventListener('click', () => setArrange(viewer, !editor.on));
  window.addEventListener('keydown', (e) => {
    if (e.shiftKey && (e.key === 'F' || e.key === 'f')) {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      if (editor) setArrange(viewer, !editor.on);
    }
  });
  setArrange(viewer, false);
}

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    if (typeof window !== 'undefined' && window.location) {
      window.location.reload();
    }
  });
}
