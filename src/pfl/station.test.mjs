import assert from 'node:assert/strict';
import test from 'node:test';
import { CITY_POIS } from '../cityPois.js';
import { SOVEREIGN_ANCHOR, sovereignAnchorHeight } from './station.js';

test('Sovereign Anchor uses the handed-off Liverpool coordinate and datum', () => {
  assert.deepEqual(
    {
      latitude: SOVEREIGN_ANCHOR.latitude,
      longitude: SOVEREIGN_ANCHOR.longitude,
    },
    { latitude: 29.24752, longitude: -95.23144 },
  );
  assert.equal(sovereignAnchorHeight(), -24.392);
});

test('PFL Liverpool search preset lands on the Sovereign Anchor', () => {
  const preset = CITY_POIS.pfl_liverpool;
  assert.equal(preset.pois[0].lat, SOVEREIGN_ANCHOR.latitude);
  assert.equal(preset.pois[0].lon, SOVEREIGN_ANCHOR.longitude);
  assert.equal(preset.groundElevation, -26.19);
});
