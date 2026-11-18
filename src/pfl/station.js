import * as Cesium from 'cesium';
import { governorRequestRender } from '../renderGovernor.js';
import {
  loadPlacedObjects,
  PLACEMENT_LIFT_M,
  STORED_GROUND_HEIGHT_M,
} from './placedObjects.js';
import { loadYardFrames } from './yardFrames.js';
import { loadBrazoriaCadPlugin } from './brazoriaCadPlugin.js';
import { loadNeo4jPersonalLayer } from './neo4jPersonalLayer.js';
import { loadStarshipEventTheater } from './starshipEventTheater.js';
import { loadPolymarketPlugin } from './polymarketPlugin.js';
import { loadPflWindowFramework } from './pflWindowFramework.js';

export const SOVEREIGN_ANCHOR = Object.freeze({
  id: 'lisa-muse-sovereign-anchor',
  name: 'Lisa Muse — Sovereign Anchor',
  latitude: 29.24752,
  longitude: -95.23144,
  // The model is center-origin and its feet sit 0.998 m below that origin.
  modelOriginLiftM: 0.998,
});

/** Absolute ellipsoid height used by the Sovereign Anchor model origin. */
export function sovereignAnchorHeight() {
  return (
    STORED_GROUND_HEIGHT_M +
    PLACEMENT_LIFT_M +
    SOVEREIGN_ANCHOR.modelOriginLiftM
  );
}

function resolveAnchorGroundM(viewer) {
  if (viewer?.scene?.globe?.show) {
    const gh = viewer.scene.globe.getHeight(
      Cesium.Cartographic.fromDegrees(SOVEREIGN_ANCHOR.longitude, SOVEREIGN_ANCHOR.latitude),
    );
    return Number.isFinite(gh) ? gh : 0.0;
  }
  return STORED_GROUND_HEIGHT_M;
}

const CUSTOM_OBJ_KEY = 'pfl_custom_objects_v1';
function readCustomObj(key, fallback) {
  try {
    if (typeof localStorage === 'undefined') return { ...fallback };
    const all = JSON.parse(localStorage.getItem(CUSTOM_OBJ_KEY) || '{}');
    return { ...fallback, ...(all[key] || {}) };
  } catch {
    return { ...fallback };
  }
}
function writeCustomObj(key, val) {
  try {
    if (typeof localStorage === 'undefined') return;
    const all = JSON.parse(localStorage.getItem(CUSTOM_OBJ_KEY) || '{}');
    all[key] = val;
    localStorage.setItem(CUSTOM_OBJ_KEY, JSON.stringify(all));
  } catch {}
}

function addSovereignAnchor(viewer) {
  const state = readCustomObj('lisa', {
    lat: 29.247436,
    lon: -95.231445,
    heading: 192,
    lift: 0,
  });
  const applyEntityPose = (ent) => {
    const gM = viewer?.scene?.globe?.show
      ? (viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(state.lon, state.lat)) || 0)
      : STORED_GROUND_HEIGHT_M;
    const pos = Cesium.Cartesian3.fromDegrees(
      state.lon,
      state.lat,
      gM + PLACEMENT_LIFT_M + SOVEREIGN_ANCHOR.modelOriginLiftM + (state.lift || 0),
    );
    const ori = Cesium.Transforms.headingPitchRollQuaternion(
      pos,
      new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(state.heading || 0), 0, 0),
    );
    if (ent) {
      ent.position = pos;
      ent.orientation = ori;
    }
    return { pos, ori };
  };
  const { pos: position, ori: orientation } = applyEntityPose(null);
  const ent = viewer.entities.add({
    id: SOVEREIGN_ANCHOR.id,
    name: `👑 ${SOVEREIGN_ANCHOR.name} (Liverpool)`,
    position,
    orientation,
    model: {
      uri: '/models/lisa_muse.glb',
      scale: 1.05,
      heightReference: Cesium.HeightReference.NONE,
      minimumPixelSize: 0,
      maximumScale: 50,
      lightColor: new Cesium.Color(4.8, 4.4, 3.9, 1.0),
      imageBasedLightingFactor: new Cesium.Cartesian2(1.6, 1.6),
      silhouetteColor: Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.28),
      silhouetteSize: 1.0,
    },
    point: {
      pixelSize: 9,
      color: Cesium.Color.CYAN,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.NONE,
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
        120,
        2000000,
      ),
    },
    description: `
      <div style="font-family:system-ui,sans-serif;padding:12px;color:#e0e0e0;background:#111;border-radius:8px">
        <h2 style="margin:0 0 6px;color:#00ffff;font-size:16px">Lisa Muse</h2>
        <p style="margin:0 0 8px;font-size:12px;color:#888">Queen of the Technomates Borg Division · Sovereign Node Anchor</p>
        <p style="margin:0;font-size:13px"><strong>Coordinates:</strong> ${SOVEREIGN_ANCHOR.latitude.toFixed(4)}° N, ${Math.abs(SOVEREIGN_ANCHOR.longitude).toFixed(4)}° W</p>
      </div>`,
  });
  ent._pflMovable = {
    kind: 'lisa',
    label: '👑 Lisa Muse (Avatar)',
    getState: () => ({ ...state }),
    update: (patch) => {
      Object.assign(state, patch);
      writeCustomObj('lisa', state);
      applyEntityPose(ent);
      governorRequestRender('pfl-move-lisa');
    },
  };
  if (typeof window !== 'undefined') {
    window.__pflMovables = window.__pflMovables || {};
    window.__pflMovables.lisa = ent._pflMovable;
  }
  return ent;
}

function rethrowAbort(signal, error) {
  signal?.throwIfAborted();
  if (error?.name === 'AbortError') throw errOrAbort(error);
}

function errOrAbort(error) {
  return error;
}

/**
 * Load the private Liverpool station additions without making them a startup
 * dependency. Each surface may fail independently; abort still tears down.
 */
export async function loadPflStation({ viewer, cesiumToken, signal, enablePolymarket = true }) {
  let anchor = null;
  let placed = null;
  let frames = null;
  let cad = null;
  let neo4j = null;
  let starship = null;
  let polymarket = null;
  let winFramework = null;
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    winFramework?.destroy?.();
    polymarket?.destroy?.();
    starship?.destroy?.();
    neo4j?.destroy?.();
    cad?.destroy?.();
    frames?.destroy?.();
    placed?.destroy?.();
    if (anchor) viewer.entities.remove(anchor);
    anchor = null;
    governorRequestRender('pfl-station-destroy');
  };

  try {
    try {
      anchor = addSovereignAnchor(viewer);
      if (typeof window !== 'undefined' && anchor) {
        window.addEventListener('gev:map-stack-changed', () => {
          setTimeout(() => {
            if (!anchor || destroyed) return;
            anchor._pflMovable?.update({});
            governorRequestRender('lisa-muse-datum-sync');
          }, 400);
        });
      }
    } catch (error) {
      rethrowAbort(signal, error);
      console.warn('[PFL Station] Sovereign Anchor unavailable:', error);
    }
    try {
      placed = await loadPlacedObjects({ viewer, cesiumToken, signal });
    } catch (error) {
      rethrowAbort(signal, error);
      console.warn('[PFL Station] placed objects unavailable:', error);
    }
    try {
      frames = loadYardFrames({ viewer });
    } catch (error) {
      rethrowAbort(signal, error);
      console.warn('[PFL Station] yard frames unavailable:', error);
    }
    try {
      cad = await loadBrazoriaCadPlugin({ viewer, signal });
    } catch (error) {
      rethrowAbort(signal, error);
      console.warn('[PFL Station] Brazoria CAD overlay unavailable:', error);
    }
    try {
      neo4j = await loadNeo4jPersonalLayer({ viewer, signal });
    } catch (error) {
      rethrowAbort(signal, error);
      console.warn('[PFL Station] Neo4j 3D layer unavailable:', error);
    }
    try {
      starship = loadStarshipEventTheater({ viewer, neo4jLayer: neo4j });
    } catch (error) {
      rethrowAbort(signal, error);
      console.warn('[PFL Station] Starship Flight 15 theater unavailable:', error);
    }
    if (enablePolymarket !== false) {
      try {
        polymarket = await loadPolymarketPlugin({ viewer, signal });
      } catch (error) {
        rethrowAbort(signal, error);
        console.warn('[PFL Station] Polymarket radar overlay unavailable:', error);
      }
    }
    try {
      winFramework = loadPflWindowFramework({ viewer });
    } catch (error) {
      console.warn('[PFL Station] window framework unavailable:', error);
    }
    signal?.throwIfAborted();
    governorRequestRender('pfl-station-load');
    return { anchor, placed, frames, cad, neo4j, starship, polymarket, destroy };
  } catch (error) {
    destroy();
    throw error;
  }
}
