import assert from 'node:assert/strict';
import test from 'node:test';
import * as Cesium from 'cesium';
import {
  BED_PAUL_AVATAR_CATALOG,
  computeBedPaulRetargetPose,
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

test('Paul bed avatar catalog keeps wireframe first and includes all 6 outfit GLBs', () => {
  assert.equal(BED_PAUL_AVATAR_CATALOG[0].id, 'wireframe');
  assert.equal(BED_PAUL_AVATAR_CATALOG[0].uri, null);
  const ids = new Set(BED_PAUL_AVATAR_CATALOG.map((item) => item.id));
  for (const id of ['paul-nasa', 'paul-shorts', 'paul-suit', 'paul-vest', 'paul-casual', 'paul-medieval']) {
    assert.ok(ids.has(id), `Expected catalog id: ${id}`);
  }
});

test('computeBedPaulRetargetPose retargets crossed right leg (knee occluded) and raised right hand', () => {
  const liveSample = {
    0: [613.2, 75.4],
    1: [630.4, 117.5],
    2: [583.1, 115.3],
    3: [527.1, 148.3],
    4: [575.5, 88.7],
    5: [678.0, 119.4],
    6: [710.6, 185.4],
    7: [738.4, 252.6],
    8: [607.1, 231.4],
    9: null,
    10: [681.1, 392.1],
    11: [677.0, 241.6],
    12: [682.6, 330.3],
    13: [667.8, 483.1],
  };
  const ret = computeBedPaulRetargetPose(liveSample, 3.0, 1.69);
  assert.ok(Number.isFinite(ret.glbScale) && ret.glbScale > 0.25 && ret.glbScale < 2.2);
  assert.ok(ret.angles.rightUpLegZ > 0.16, `Expected right leg crossed (+Z), got ${ret.angles.rightUpLegZ}`);
  assert.ok(ret.angles.rightUpLegLiftX > 0, `Expected crossed right thigh lift, got ${ret.angles.rightUpLegLiftX}`);
  assert.ok(ret.angles.rightForeArmX < -0.5, `Expected bent right forearm toward face, got ${ret.angles.rightForeArmX}`);
  assert.ok(ret.angles.rightForeArmZ < 0, `Expected forward forearm lift toward nose, got ${ret.angles.rightForeArmZ}`);
});
