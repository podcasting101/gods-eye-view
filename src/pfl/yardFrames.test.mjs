import assert from 'node:assert/strict';
import test from 'node:test';
import * as Cesium from 'cesium';
import {
  computeCorners,
  DEFAULT_GROUND_CLEARANCE_M,
  defaultParams,
  flipFrameParams,
  frameAnchorHeightM,
  FRAME_TEXTURE_COORDINATES,
  LAYOUT_KEY,
  YARD_FRAMES,
} from './yardFrames.js';

function localCorners(params) {
  const anchor = Cesium.Cartesian3.fromDegrees(
    params.camLon,
    params.camLat,
    frameAnchorHeightM(params),
  );
  const inverse = Cesium.Matrix4.inverseTransformation(
    Cesium.Transforms.eastNorthUpToFixedFrame(anchor),
    new Cesium.Matrix4(),
  );
  return computeCorners(params).positions.map((position) =>
    Cesium.Matrix4.multiplyByPoint(inverse, position, new Cesium.Cartesian3()),
  );
}

function bearingDegrees(vector) {
  return (
    ((Cesium.Math.toDegrees(Math.atan2(vector.x, vector.y)) % 360) + 360) % 360
  );
}

test('yard frame layout keeps the published persistence key and corner UVs', () => {
  assert.equal(LAYOUT_KEY, 'gev-yardframes-layout-v2');
  assert.deepEqual(FRAME_TEXTURE_COORDINATES, [
    [0, 1],
    [1, 1],
    [1, 0],
    [0, 0],
  ]);
});

test('road frame right edge follows the real-road cross-axis', () => {
  const road = YARD_FRAMES.find((frame) => frame.id === 'back-yard-cam1-plan');
  const params = defaultParams({ ...road, flat: false });
  const [bottomLeft, bottomRight] = localCorners(params);
  const right = Cesium.Cartesian3.subtract(
    bottomRight,
    bottomLeft,
    new Cesium.Cartesian3(),
  );

  // Camera heading is 350°; the image's horizontal road axis is +90° from it.
  assert.ok(Math.abs(bearingDegrees(right) - 80) < 0.01);
  assert.equal(params.flat, false);
});

test('yard frames default to north-up ground placement', () => {
  for (const frame of YARD_FRAMES) {
    const params = defaultParams(frame);
    assert.equal(params.flat, true, frame.id);
    assert.equal(params.headingDeg, 0, frame.id);
    assert.equal(params.groundOffsetM, DEFAULT_GROUND_CLEARANCE_M, frame.id);
    assert.equal(
      frameAnchorHeightM(params),
      -26.19 + DEFAULT_GROUND_CLEARANCE_M,
      frame.id,
    );
  }
});

test('flat frames point upward without mirroring their top edge', () => {
  const road = YARD_FRAMES.find((frame) => frame.id === 'back-yard-cam1-plan');
  const params = defaultParams(road);
  const [bottomLeft, bottomRight, topRight, topLeft] = localCorners(params);
  const right = Cesium.Cartesian3.subtract(
    bottomRight,
    bottomLeft,
    new Cesium.Cartesian3(),
  );
  const up = Cesium.Cartesian3.subtract(
    topLeft,
    bottomLeft,
    new Cesium.Cartesian3(),
  );
  const normal = Cesium.Cartesian3.cross(
    right,
    Cesium.Cartesian3.subtract(topRight, bottomRight, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );

  const upBearing = bearingDegrees(up);
  assert.ok(Math.min(upBearing, 360 - upBearing) < 0.01);
  assert.ok(normal.z > 0);
});

test('per-frame flip turns an upside-down landing by 180 degrees', () => {
  const params = defaultParams(YARD_FRAMES[0]);
  flipFrameParams(params);
  assert.equal(params.headingDeg, 180);
  flipFrameParams(params);
  assert.equal(params.headingDeg, 0);
});

test('a frame can still opt into the original standing camera placement', () => {
  const bed = YARD_FRAMES.find((frame) => frame.id === 'bed-station-20261012');
  assert.equal(defaultParams(bed).flat, true);
  const standing = defaultParams({ ...bed, flat: false });
  assert.equal(standing.flat, false);
  assert.equal(standing.headingDeg, bed.headingDeg);
  assert.equal(frameAnchorHeightM(standing), -26.19 + bed.camHeightM);
});
