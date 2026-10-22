import * as Cesium from 'cesium';
import { STORED_GROUND_HEIGHT_M } from './placedObjects.js';
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
 * The "Arrange frames" toggle (bottom-left) turns on a drag editor:
 * click a photo to select it, drag it across the ground, then spin /
 * tilt / raise / resize it from the panel (or keys). A frame can
 * also be laid FLAT, face to the sky — the bed photo reads
 * right-side-up when you look straight down at it. Arrangements
 * persist in localStorage (key gev-yardframes-layout-v1) and merge
 * over the built-in defaults below on every load; nothing here
 * changes the default scene when Arrange mode is off.
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
    image: '/yard-frames/bed-station-2026-10-12.png',
    // i18n-ignore: Paul's private camera title is source data.
    title: 'Beam Pro (Camo) - Paul at his bed station, inside the house',
    takenAt: '2026-10-12 19:34 CDT',
    camLat: 29.247695,
    camLon: -95.2315,
    camHeightM: 3.5,
    headingDeg: 0,
    pitchDeg: -5,
    distanceM: 3.5,
    fovHDeg: 68,
    fovVDeg: 37,
  },
];

const DEFAULT_FOV_H_DEG = 103;
const DEFAULT_FOV_V_DEG = 66;
const DEFAULT_DISTANCE_M = 6.5;

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
  };
}

/** Saved arrangement (id -> params) from localStorage, or {} when none. */
function loadSavedLayout() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && parsed.frames) || {};
  } catch (error) {
    console.warn(
      '[YardFrames] saved layout unreadable, using built-ins:',
      error,
    );
    return {};
  }
}

const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * Quad corners for a params object, ordered BL, BR, TR, TL in photo
 * space (bottom-left, bottom-right, top-right, top-left).
 *
 * Standing (flat falsy): the frustum-true v2 placement, unchanged —
 * the quad hangs distanceM in front of the camera, perpendicular to
 * the view axis (headingDeg/pitchDeg), sized by the camera FOV.
 *
 * Flat (flat === true): the quad lies horizontal at the anchor,
 * normal = local up, centered on the anchor point, same FOV size
 * formula (distanceM becomes the size knob). Orientation reasoning:
 * let U = the photo's "up" direction on the ground = headingDeg
 * rotated clockwise from north, U = (sin H, cos H, 0) in ENU, and
 * R = the photo's "right" = (cos H, -sin H, 0). Then R x U = +Z
 * (local up) for every H, so the face points at the sky and the
 * image is NOT mirrored seen from above; the photo's top edge
 * (TL-TR) points along the heading, so at heading 0 the top of the
 * photo points north and it reads right-side-up from above with
 * north up. buildFrameEntity also pins explicit textureCoordinates
 * for flat frames so Cesium's default polygon ST projection cannot
 * rotate the image inside the quad.
 */
export function computeCorners(p) {
  const anchor = Cesium.Cartesian3.fromDegrees(
    p.camLon,
    p.camLat,
    STORED_GROUND_HEIGHT_M + p.camHeightM,
  );
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(anchor);
  const dist = p.distanceM || DEFAULT_DISTANCE_M;
  const w = 2 * dist * Math.tan(toRad((p.fovHDeg || DEFAULT_FOV_H_DEG) / 2));
  const h = 2 * dist * Math.tan(toRad((p.fovVDeg || DEFAULT_FOV_V_DEG) / 2));
  let right;
  let up;
  let center;
  if (p.flat) {
    const H = toRad(p.headingDeg || 0);
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
    right = new Cesium.Cartesian3(Math.cos(H), -Math.sin(H), 0);
    up = new Cesium.Cartesian3();
    Cesium.Cartesian3.cross(right, fwd, up);
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
    positions: [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)],
    widthM: w,
    heightM: h,
    distanceM: dist,
  };
}

/** Build (or rebuild) the Cesium entity for one frame. */
function buildFrameEntity(viewer, def, params) {
  const { positions, widthM, heightM, distanceM } = computeCorners(params);
  const entityId = ENTITY_PREFIX + def.id;
  const stale = viewer.entities.getById(entityId);
  if (stale) viewer.entities.remove(stale);
  const polygon = {
    hierarchy: new Cesium.PolygonHierarchy(positions),
    material: new Cesium.ImageMaterialProperty({ image: def.image }),
    perPositionHeight: true,
    // Pin every image to BL, BR, TR, TL. Cesium's automatic planar
    // projection may rotate an oblique quad as its dominant axis changes;
    // explicit coordinates keep the road line and the bed frame registered.
    textureCoordinates: new Cesium.PolygonHierarchy(
      FRAME_TEXTURE_COORDINATES.map(([x, y]) => new Cesium.Cartesian2(x, y)),
    ),
  };
  const entity = viewer.entities.add({
    id: entityId,
    name: 'Yard frame: ' + def.id,
    polygon,
  });
  console.info(
    '[YardFrames] ' +
      def.id +
      ' quad ' +
      widthM.toFixed(1) +
      'x' +
      heightM.toFixed(1) +
      ' m at ' +
      distanceM +
      ' m from cam ' +
      params.camLat +
      ', ' +
      params.camLon +
      (params.flat ? ' (lying flat, face to the sky)' : ''),
  );
  governorRequestRender('yardframes-build');
  if (viewer.scene && viewer.scene.requestRender) viewer.scene.requestRender();
  return entity;
}

// Live registry: id -> { def, params, entity }.
const frameState = new Map();

function rebuildFrame(viewer, id) {
  const st = frameState.get(id);
  if (!st) return;
  st.entity = buildFrameEntity(viewer, st.def, st.params);
  if (editor && editor.viewer === viewer && editor.selectedId === id) {
    drawOutline(viewer);
    refreshPanel();
  }
}

function saveLayout() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const frames = {};
    for (const [id, st] of frameState) frames[id] = { ...st.params };
    window.localStorage.setItem(
      LAYOUT_KEY,
      JSON.stringify({ version: 1, savedAt: new Date().toISOString(), frames }),
    );
  } catch (error) {
    console.warn('[YardFrames] could not save layout:', error);
  }
}

/**
 * Frustum-true v2 renderer (built 2026-10-13; the v2 data rewrite
 * dropped this function, which broke every fresh boot — the
 * standalone scene imports it). Each photo hangs as a quad IN FRONT
 * OF its camera, perpendicular to the view axis, sized by the
 * camera FOV at distanceM: stand at the camera and the photo
 * overlays the real yard; from elsewhere it reads as a tilted panel.
 * Saved Arrange-mode params merge over the built-in values.
 */
export function loadYardFrames({ viewer }) {
  destroyYardFrames(viewer);
  const saved = loadSavedLayout();
  frameState.clear();
  for (const f of YARD_FRAMES) {
    const params = { ...defaultParams(f), ...(saved[f.id] || {}) };
    const entity = buildFrameEntity(viewer, f, params);
    frameState.set(f.id, { def: f, params, entity });
  }
  viewer.creditDisplay.addStaticCredit(FRAME_CREDIT);
  installArrangeToggle(viewer);
  return {
    entities: viewer.entities,
    destroy: () => destroyYardFrames(viewer),
  };
}

/** Remove every yard-frame entity and editor surface owned by this module. */
export function destroyYardFrames(viewer) {
  if (editor?.viewer === viewer) {
    if (editor.on) releaseContinuousRender('yardframes-arrange');
    removeHandlers(viewer);
    editor.toggle?.remove();
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
// Arrange mode — drag-and-drop frame editor (Paul, 2026-10-19)
// ---------------------------------------------------------------------------

const STEP = {
  headingDeg: 2,
  pitchDeg: 2,
  heightM: 0.25,
  sizeM: 0.5,
  nudgeM: 0.5,
};
const ARRANGE_HINT =
  'Click a photo to select it, then drag it across the ground to move it. ' +
  'Use the buttons (or keys Q/E, R/F, PgUp/PgDn, -/=, arrow keys) to fine-tune. ' +
  'Everything saves by itself.';
let editor = null;

function arrangeReadout(p) {
  return (
    'Spin ' +
    Math.round(((p.headingDeg % 360) + 360) % 360) +
    '° · Tilt ' +
    Math.round(p.pitchDeg) +
    '° · Height ' +
    p.camHeightM.toFixed(2) +
    ' m · Size ' +
    p.distanceM.toFixed(1) +
    ' m · ' +
    (p.flat ? 'LYING FLAT — face to the sky' : 'Standing')
  );
}

function drawOutline(viewer) {
  if (!editor || !editor.selectedId) return;
  const st = frameState.get(editor.selectedId);
  if (!st) return;
  const { positions } = computeCorners(st.params);
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
  if (nameEl) {
    // i18n-ignore: private PFL operator surface is intentionally English.
    nameEl.textContent = st
      ? st.def.title
      : 'Click a photo in the scene to select it.';
  }
  if (readEl) {
    if (!st) {
      // i18n-ignore: private PFL operator surface is intentionally English.
      readEl.textContent = 'Nothing selected.';
    } else {
      const p = st.params;
      // i18n-ignore: private PFL operator surface is intentionally English.
      readEl.textContent = arrangeReadout(p);
    }
  }
  editor.panel.querySelectorAll('[data-needs-selection]').forEach((b) => {
    b.disabled = !st;
  });
}

function applyChange(viewer, id, mutate) {
  const st = frameState.get(id);
  if (!st) return;
  mutate(st.params);
  st.params.headingDeg = ((st.params.headingDeg % 360) + 360) % 360;
  st.params.pitchDeg = Math.max(-90, Math.min(90, st.params.pitchDeg));
  st.params.distanceM = Math.max(0.5, st.params.distanceM);
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
    } else {
      selectFrame(viewer, null);
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
    const change = (fn) => {
      applyChange(viewer, id, fn);
      e.preventDefault();
    };
    switch (e.key) {
      case 'q':
      case 'Q':
        change((p) => {
          p.headingDeg -= STEP.headingDeg;
        });
        break;
      case 'e':
      case 'E':
        change((p) => {
          p.headingDeg += STEP.headingDeg;
        });
        break;
      case 'r':
      case 'R':
        change((p) => {
          p.pitchDeg += STEP.pitchDeg;
        });
        break;
      case 'f':
      case 'F':
        change((p) => {
          p.pitchDeg -= STEP.pitchDeg;
        });
        break;
      case 'PageUp':
        change((p) => {
          p.camHeightM += STEP.heightM;
        });
        break;
      case 'PageDown':
        change((p) => {
          p.camHeightM -= STEP.heightM;
        });
        break;
      case '-':
      case '_':
        change((p) => {
          p.distanceM -= STEP.sizeM;
        });
        break;
      case '=':
      case '+':
        change((p) => {
          p.distanceM += STEP.sizeM;
        });
        break;
      case 'ArrowUp':
        change((p) => nudgeParams(p, STEP.nudgeM, 0));
        break;
      case 'ArrowDown':
        change((p) => nudgeParams(p, -STEP.nudgeM, 0));
        break;
      case 'ArrowLeft':
        change((p) => nudgeParams(p, 0, -STEP.nudgeM));
        break;
      case 'ArrowRight':
        change((p) => nudgeParams(p, 0, STEP.nudgeM));
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
.gev-arrange-toggle{position:fixed;left:calc(50% + 148px);top:18px;z-index:9999;
  font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.14em;
  color:#e8eaed;background:rgba(12,12,20,.85);border:1px solid rgba(0,212,255,.45);
  border-radius:10px;padding:11px 16px;cursor:pointer;backdrop-filter:blur(8px)}
.gev-arrange-toggle[aria-pressed="true"]{background:rgba(0,212,255,.22);color:#fff}
.gev-arrange-panel{position:fixed;left:348px;top:68px;z-index:9999;width:312px;
  max-height:calc(100vh - 180px);overflow-y:auto;color:#e8eaed;
  background:rgba(12,12,20,.9);border:1px solid rgba(255,255,255,.12);
  border-radius:16px;padding:14px;backdrop-filter:blur(10px);
  font-family:'Inter',sans-serif;font-size:14px}
.gev-arrange-panel h3{margin:0 0 4px;font-family:'JetBrains Mono',monospace;
  font-size:12px;letter-spacing:.16em;color:#00d4ff}
.gev-arrange-panel .gev-frame-name{font-weight:600;margin:6px 0 2px;line-height:1.3}
.gev-arrange-panel .gev-readout{font-family:'JetBrains Mono',monospace;font-size:11px;
  color:rgba(232,234,237,.65);margin-bottom:10px;line-height:1.5}
.gev-arrange-panel .gev-hint{font-size:12.5px;color:rgba(232,234,237,.75);
  line-height:1.45;margin:0 0 10px}
.gev-arrange-panel .gev-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.gev-arrange-panel button{font-family:'Inter',sans-serif;font-size:14px;min-height:42px;
  color:#e8eaed;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);
  border-radius:10px;cursor:pointer;padding:8px 6px}
.gev-arrange-panel button:hover:not(:disabled){border-color:rgba(0,212,255,.6);
  background:rgba(0,212,255,.12)}
.gev-arrange-panel button:disabled{opacity:.35;cursor:default}
.gev-arrange-panel .gev-wide{grid-column:1 / -1}
.gev-arrange-panel .gev-preset{background:rgba(0,212,255,.14);
  border-color:rgba(0,212,255,.5);font-weight:600}
.gev-arrange-panel .gev-section{font-family:'JetBrains Mono',monospace;font-size:11px;
  letter-spacing:.14em;color:rgba(232,234,237,.55);margin:12px 0 6px}
`;

function makeButton(text, className) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  if (className) b.className = className;
  return b;
}

function buildPanel(viewer) {
  const panel = document.createElement('div');
  panel.className = 'gev-arrange-panel';
  panel.id = 'gev-arrange-panel';
  const title = document.createElement('h3');
  // i18n-ignore: private PFL operator surface is intentionally English.
  title.textContent = 'ARRANGE FRAMES';
  panel.appendChild(title);
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

  const grid = document.createElement('div');
  grid.className = 'gev-grid';
  const addBtn = (text, fn, opts = {}) => {
    const b = makeButton(text, opts.className || '');
    if (opts.wide) b.classList.add('gev-wide');
    if (!opts.always) b.dataset.needsSelection = '1';
    b.addEventListener('click', () => {
      if (!editor || !editor.selectedId) return;
      applyChange(viewer, editor.selectedId, fn);
    });
    grid.appendChild(b);
    return b;
  };
  addBtn('↺  Spin left', (p) => {
    p.headingDeg -= STEP.headingDeg;
  });
  addBtn('Spin right  ↻', (p) => {
    p.headingDeg += STEP.headingDeg;
  });
  addBtn('↺  Rotate 90°', (p) => {
    p.headingDeg -= 90;
  });
  addBtn('Rotate 90°  ↻', (p) => {
    p.headingDeg += 90;
  });
  addBtn('Flip 180°', (p) => {
    p.headingDeg += 180;
  }, { wide: true, className: 'gev-preset' });
  addBtn('Tilt up', (p) => {
    p.pitchDeg += STEP.pitchDeg;
  });
  addBtn('Tilt down', (p) => {
    p.pitchDeg -= STEP.pitchDeg;
  });
  addBtn('Raise', (p) => {
    p.camHeightM += STEP.heightM;
  });
  addBtn('Lower', (p) => {
    p.camHeightM -= STEP.heightM;
  });
  addBtn('Bigger', (p) => {
    p.distanceM += STEP.sizeM;
  });
  addBtn('Smaller', (p) => {
    p.distanceM -= STEP.sizeM;
  });
  addBtn('◀  Nudge west', (p) => nudgeParams(p, 0, -STEP.nudgeM));
  addBtn('Nudge east  ▶', (p) => nudgeParams(p, 0, STEP.nudgeM));
  addBtn('▲  Nudge north', (p) => nudgeParams(p, STEP.nudgeM, 0));
  addBtn('▼  Nudge south', (p) => nudgeParams(p, -STEP.nudgeM, 0));
  addBtn(
    'Lay flat — face the sky',
    (p) => {
      p.flat = true;
    },
    { wide: true, className: 'gev-preset' },
  );
  addBtn(
    'Stand up',
    (p) => {
      p.flat = false;
    },
    { wide: true, className: 'gev-preset' },
  );
  addBtn(
    'Reset selected frame',
    (p) => {
      const st = editor?.selectedId ? frameState.get(editor.selectedId) : null;
      if (st) Object.assign(p, defaultParams(st.def));
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
  const resetBtn = makeButton('Reset to built-in layout');
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
  editor.toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
  // i18n-ignore: private PFL operator surface is intentionally English.
  editor.toggle.textContent = on ? '✥ ARRANGE FRAMES: ON' : '✥ ARRANGE FRAMES';
  editor.panel.style.display = on ? 'block' : 'none';
  if (on) {
    holdContinuousRender('yardframes-arrange');
    installHandlers(viewer);
    refreshPanel();
  } else {
    removeHandlers(viewer);
    selectFrame(viewer, null);
    releaseContinuousRender('yardframes-arrange');
    governorRequestRender('yardframes-arrange-off');
  }
}

function installArrangeToggle(viewer) {
  if (typeof document === 'undefined') return;
  const old = document.getElementById('gev-arrange-toggle');
  if (old) old.remove();
  const oldPanel = document.getElementById('gev-arrange-panel');
  if (oldPanel) oldPanel.remove();
  if (!document.getElementById('gev-arrange-css')) {
    const style = document.createElement('style');
    style.id = 'gev-arrange-css';
    style.textContent = EDITOR_CSS;
    document.head.appendChild(style);
  }
  const toggle = makeButton('✥ ARRANGE FRAMES', 'gev-arrange-toggle');
  toggle.id = 'gev-arrange-toggle';
  toggle.setAttribute('aria-pressed', 'false');
  document.body.appendChild(toggle);
  const panel = buildPanel(viewer);
  editor = {
    viewer,
    toggle,
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
}
