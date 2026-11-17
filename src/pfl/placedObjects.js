import * as Cesium from 'cesium';

/**
 * PFL Station phase 2: real 3D objects on the globe via Cesium ion asset IDs.
 *
 * First placement: Paul's wooden chair (ion asset 5975608) in his front yard,
 * the chair Lisa Holmes believes she placed outside. Plus a wooden signpost
 * carrying Lisa Muse's sign.
 *
 * The chair GLB is 2.0 m tall in model space (Y-up, Y in [-1, 1]); it is
 * scaled to a realistic 1.0 m and lifted so its base sits on the ground.
 * Every object uses the surveyed station datum, independent of the active map
 * stack, so switching between imagery and photoreal tiles cannot move it.
 */

// Ion asset IDs for placed objects.
export const CHAIR_ASSET_ID = 5975608;

// Paul's front yard, ground level (not the roof).
// Paul's front yard — placed a few meters from the Liverpool Sovereign
// Anchor (29.247320, -95.231340) so the chair shares the street-level view.
export const FRONT_YARD = { lat: 29.2475, lon: -95.23145 };

// Placement datum (Paul, 2026-10-12 - the ditch fix):
// Per-session surface sampling put the placed objects on TWO different
// geometries (Google photoreal mesh vs Esri/World Terrain) and froze their
// heights while zoom LOD re-sculpted the terrain - the chair sank and the
// anchor figure ended up head-out-of-the-ditch on the wrong side of the
// street. Rule from here on:
//   - STORED_GROUND_HEIGHT_M is the ONE true grade for the yard, surveyed
//     once from the front-yard splat itself (the splat IS the yard).
//     SURVEYED 2026-10-12: -26.19 m, Cesium World Terrain height at the
//     yard anchor, sampled with the app own sampler (sampleTerrain-
//     MostDetailed, ion asset 1). Splat-derived refinement still pending.
//   - PLACEMENT_LIFT_M raises the objects (chair/sign/figure) ~1 ft above
//     that grade so they never sink at any zoom. The splat itself does NOT
//     get the lift - it sits ON the stored grade; it is the ground truth.
export const STORED_GROUND_HEIGHT_M = -26.19;
export const PLACEMENT_LIFT_M = 0.8; // raised 2026-10-12 eve: rendered CWT mesh bulges ~0.5 m over the point sample at render LODs — Paul saw the figure sink on zoom-in at 0.3

// Paul's front-yard Gaussian splat (built 2026-10-02 from his front two Wyze
// cams). Self-hosted 3D Tiles (KHR_gaussian_splatting) — no ion upload needed.
export const SPLAT_URL = '/splat/gaussians-yard/tileset.json';
// A few meters north of the chair so the two don't overlap.
export const SPLAT_YARD = { lat: 29.24754, lon: -95.23145 };
// Local-frame centering: measured from the source PLY (244,758 splats).
// Bounds x[-1.00, 3.52] y[-1.74, 0.33] z[-0.20, 2.45]; z reads as up with the
// ground near z=0, so (-cx, -cy, -zmin) centers it and rests its base on grade.
const SPLAT_CENTER_OFFSET = { x: -1.2614312, y: 0.70354426, z: 0.20455605 };

const SPLAT_CREDIT = new Cesium.Credit(
  'Front-yard splat — captured by Paul Prime, Oct 2026',
  false,
);

// Lisa Muse's sign.
export const SIGN_TEXT = 'The night watch keeps this seat warm.';

const CHAIR_CREDIT = new Cesium.Credit(
  '"Wooden Chair (Low Poly)" by Berk Gedik, CC Attribution — via Sketchfab',
  false,
);

function makePlaqueTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  // Wooden plaque.
  const wood = ctx.createLinearGradient(0, 0, 0, 256);
  wood.addColorStop(0, '#6b4423');
  wood.addColorStop(0.5, '#5a3a1f');
  wood.addColorStop(1, '#4a2f18');
  ctx.fillStyle = wood;
  ctx.fillRect(0, 0, 1024, 256);
  // Frame.
  ctx.strokeStyle = '#8a6238';
  ctx.lineWidth = 14;
  ctx.strokeRect(14, 14, 1024 - 28, 256 - 28);
  ctx.strokeStyle = '#3a2412';
  ctx.lineWidth = 4;
  ctx.strokeRect(30, 30, 1024 - 60, 256 - 60);
  // Text.
  ctx.fillStyle = '#f5e6c8';
  ctx.font = 'italic 64px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 512, 134, 940);
  return canvas;
}

function makePostTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const wood = ctx.createLinearGradient(0, 0, 64, 0);
  wood.addColorStop(0, '#4a2f18');
  wood.addColorStop(0.5, '#5f4126');
  wood.addColorStop(1, '#3a2412');
  ctx.fillStyle = wood;
  ctx.fillRect(0, 0, 64, 256);
  return canvas;
}

/**
 * Load Paul's placed objects into the viewer. Individual asset failures are
 * logged and the globe keeps working; cancellation still propagates.
 */
export async function loadPlacedObjects({ viewer, cesiumToken, signal }) {
  const token = String(cesiumToken || '').trim();
  signal?.throwIfAborted();

  const { lat, lon } = FRONT_YARD;
  const groundHeight = STORED_GROUND_HEIGHT_M + PLACEMENT_LIFT_M;
  console.info(
    `[PlacedObjects] front-yard ground height: ${groundHeight.toFixed(2)} m`,
  );

  // Chair: ENU frame at the front yard, scaled 2 m -> 1 m, lifted half height
  // so the base rests on the ground.
  const ground = Cesium.Cartesian3.fromDegrees(lon, lat, groundHeight);
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(ground);
  const scale = Cesium.Matrix4.fromUniformScale(0.5);
  const lift = Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(0, 0, 0.5));
  const modelMatrix = Cesium.Matrix4.multiply(
    enu,
    Cesium.Matrix4.multiply(lift, scale, new Cesium.Matrix4()),
    new Cesium.Matrix4(),
  );

  let chair = null;
  if (token) {
    try {
      const resource = await Cesium.IonResource.fromAssetId(CHAIR_ASSET_ID, {
        accessToken: token,
      });
      signal?.throwIfAborted();
      chair = await Cesium.Cesium3DTileset.fromUrl(resource, { modelMatrix });
      await chair.readyPromise;
      signal?.throwIfAborted();
      viewer.scene.primitives.add(chair);
      viewer.creditDisplay.addStaticCredit(CHAIR_CREDIT);
      const bs = chair.boundingSphere;
      console.info(
        `[PlacedObjects] chair ready: center=${bs.center}, radius=${bs.radius.toFixed(2)} m`,
      );
    } catch (error) {
      if (chair && !chair.isDestroyed()) chair.destroy();
      chair = null;
      signal?.throwIfAborted();
      if (error?.name === 'AbortError') throw error;
      console.warn('[PlacedObjects] chair unavailable:', error);
    }
  } else {
    console.info('[PlacedObjects] no ion token configured; chair skipped.');
  }

  // Signpost 1.5 m east of the chair: wooden post + plaque.
  const signLon = lon + 1.5 / (111320 * Math.cos(Cesium.Math.toRadians(lat)));
  const signGround = Cesium.Cartesian3.fromDegrees(signLon, lat, groundHeight);
  const postHeight = 1.1;
  // ENU offset: convert local up-offset into world via the ENU frame.
  const signEnu = Cesium.Transforms.eastNorthUpToFixedFrame(signGround);
  const toWorld = (x, y, z) =>
    Cesium.Matrix4.multiplyByPoint(
      signEnu,
      new Cesium.Cartesian3(x, y, z),
      new Cesium.Cartesian3(),
    );
  const billboards = viewer.scene.primitives.add(
    new Cesium.BillboardCollection(),
  );
  billboards.add({
    position: toWorld(0, 0, postHeight / 2),
    image: makePostTexture(),
    width: 0.12,
    height: postHeight,
    sizeInMeters: true,
  });
  billboards.add({
    position: toWorld(0, 0, postHeight + 0.19),
    image: makePlaqueTexture(SIGN_TEXT),
    width: 1.5,
    height: 0.375,
    sizeInMeters: true,
  });

  console.info('[PlacedObjects] sign placed in the front yard.');

  // Front-yard splat: self-hosted 3D Tiles, ENU frame at sampled ground height,
  // centered on SPLAT_YARD with its base on grade. Same pattern as the chair,
  // no ion asset involved.
  let splat = null;
  try {
    // The splat is the ground truth: stored grade, NO lift.
    const splatGround = STORED_GROUND_HEIGHT_M;
    signal?.throwIfAborted();
    const splatAnchor = Cesium.Cartesian3.fromDegrees(
      SPLAT_YARD.lon,
      SPLAT_YARD.lat,
      splatGround,
    );
    const splatEnu = Cesium.Transforms.eastNorthUpToFixedFrame(splatAnchor);
    const splatCenter = Cesium.Matrix4.fromTranslation(
      new Cesium.Cartesian3(
        SPLAT_CENTER_OFFSET.x,
        SPLAT_CENTER_OFFSET.y,
        SPLAT_CENTER_OFFSET.z,
      ),
    );
    const splatMatrix = Cesium.Matrix4.multiply(
      splatEnu,
      splatCenter,
      new Cesium.Matrix4(),
    );
    splat = await Cesium.Cesium3DTileset.fromUrl(SPLAT_URL, {
      modelMatrix: splatMatrix,
    });
    await splat.readyPromise;
    signal?.throwIfAborted();
    viewer.scene.primitives.add(splat);
    viewer.creditDisplay.addStaticCredit(SPLAT_CREDIT);
    console.info(
      `[PlacedObjects] splat ready: radius=${splat.boundingSphere.radius.toFixed(2)} m`,
    );
  } catch (err) {
    if (splat && !splat.isDestroyed()) splat.destroy();
    splat = null;
    if (signal?.aborted || err?.name === 'AbortError') {
      if (chair && !chair.isDestroyed()) {
        if (!viewer.scene.primitives.remove(chair)) chair.destroy();
      }
      if (billboards && !billboards.isDestroyed()) {
        if (!viewer.scene.primitives.remove(billboards)) billboards.destroy();
      }
      viewer.creditDisplay.removeStaticCredit?.(CHAIR_CREDIT);
      signal?.throwIfAborted();
      throw err;
    }
    console.warn('[PlacedObjects] splat failed to load:', err?.message || err);
  }

  let destroyed = false;
  return {
    chair,
    billboards,
    splat,
    groundHeight,
    position: ground,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (chair && !chair.isDestroyed()) {
        if (!viewer.scene.primitives.remove(chair)) chair.destroy();
      }
      if (billboards && !billboards.isDestroyed()) {
        if (!viewer.scene.primitives.remove(billboards)) billboards.destroy();
      }
      if (splat && !splat.isDestroyed()) {
        if (!viewer.scene.primitives.remove(splat)) splat.destroy();
      }
      viewer.creditDisplay.removeStaticCredit?.(CHAIR_CREDIT);
      viewer.creditDisplay.removeStaticCredit?.(SPLAT_CREDIT);
    },
  };
}
