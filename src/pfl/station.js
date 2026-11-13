import * as Cesium from 'cesium';
import { governorRequestRender } from '../renderGovernor.js';
import {
  loadPlacedObjects,
  PLACEMENT_LIFT_M,
  STORED_GROUND_HEIGHT_M,
} from './placedObjects.js';
import { loadYardFrames } from './yardFrames.js';
import { loadBrazoriaCadPlugin } from './brazoriaCadPlugin.js';

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

function addSovereignAnchor(viewer) {
  const position = Cesium.Cartesian3.fromDegrees(
    SOVEREIGN_ANCHOR.longitude,
    SOVEREIGN_ANCHOR.latitude,
    sovereignAnchorHeight(),
  );
  const orientation = Cesium.Transforms.headingPitchRollQuaternion(
    position,
    new Cesium.HeadingPitchRoll(0, 0, 0),
  );
  return viewer.entities.add({
    id: SOVEREIGN_ANCHOR.id,
    name: `👑 ${SOVEREIGN_ANCHOR.name} (Liverpool)`,
    position,
    orientation,
    model: {
      uri: '/models/lisa_muse.glb',
      scale: 1,
      heightReference: Cesium.HeightReference.NONE,
      minimumPixelSize: 0,
      maximumScale: 50,
      imageBasedLightingFactor: new Cesium.Cartesian2(1, 1),
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
}

function rethrowAbort(signal, error) {
  signal?.throwIfAborted();
  if (error?.name === 'AbortError') throw error;
}

/**
 * Load the private Liverpool station additions without making them a startup
 * dependency. Each surface may fail independently; abort still tears down.
 */
export async function loadPflStation({ viewer, cesiumToken, signal }) {
  let anchor = null;
  let placed = null;
  let frames = null;
  let cad = null;
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
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
    signal?.throwIfAborted();
    governorRequestRender('pfl-station-load');
    return { anchor, placed, frames, cad, destroy };
  } catch (error) {
    destroy();
    throw error;
  }
}
