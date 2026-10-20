import assert from 'node:assert/strict';
import test from 'node:test';
import * as Cesium from 'cesium';
import {
  computeCorners,
  defaultParams,
  FRAME_TEXTURE_COORDINATES,
  LAYOUT_KEY,
  YARD_FRAMES,
} from './yardFrames.js';

function localCorners(params) {
  const anchor = Cesium.Cartesian3.fromDegrees(
    params.camLon,
    params.camLat,
    -26.19 + params.camHeightM,
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
  assert.equal(LAYOUT_KEY, 'gev-yardframes-layout-v1');
  assert.deepEqual(FRAME_TEXTURE_COORDINATES, [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]);
});

test('road frame right edge follows the real-road cross-axis', () => {
  const road = YARD_FRAMES.find((frame) => frame.id === 'back-yard-cam1-plan');
  const params = defaultParams(road);
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

test('flat frames point upward without mirroring their top edge', () => {
  const road = YARD_FRAMES.find((frame) => frame.id === 'back-yard-cam1-plan');
  const params = { ...defaultParams(road), flat: true };
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

  assert.ok(Math.abs(bearingDegrees(up) - 350) < 0.01);
  assert.ok(normal.z > 0);
});

test('bed frame defaults to standing and can be laid flat explicitly', () => {
  const bed = YARD_FRAMES.find((frame) => frame.id === 'bed-station-20261012');
  assert.equal(defaultParams(bed).flat, false);
  assert.equal(defaultParams({ ...bed, flat: true }).flat, true);
});
