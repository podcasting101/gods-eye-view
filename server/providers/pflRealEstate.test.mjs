import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BCAD_PROPERTY_URL,
  CURATED_COMPS,
  buildComps,
  buildCompsPayload,
  clearRealEstateCache,
  computeMetrics,
  median,
  parcelsFromFeatures,
  parseBboxParam,
  parseDeed,
  ringCentroid,
} from './pflRealEstate.js';

const square = (x, y, d = 0.0002) => [
  [
    [x, y],
    [x + d, y],
    [x + d, y + d],
    [x, y + d],
    [x, y],
  ],
];

test('parseDeed extracts newest recent instrument and ignores old ones', () => {
  assert.deepEqual(parseDeed('2026000336 , 2002055433 , 1997005266'), {
    deedYear: 2026,
    instrument: '2026000336',
  });
  assert.deepEqual(parseDeed('2025012084 , V1353P007'), {
    deedYear: 2025,
    instrument: '2025012084',
  });
  assert.deepEqual(parseDeed('2024036940 , 2004023671').deedYear, 2024);
  assert.equal(parseDeed('2007-026320'), null);
  assert.equal(parseDeed('V1590P485'), null);
  assert.equal(parseDeed(''), null);
});

test('ringCentroid picks the largest ring', () => {
  const small = square(0, 0, 1)[0];
  const big = square(10, 10, 4)[0];
  assert.deepEqual(ringCentroid([small, big]), { lat: 12, lon: 12 });
  assert.equal(ringCentroid([]), null);
});

test('parseBboxParam validates order, count and span', () => {
  assert.deepEqual(parseBboxParam('-95.825,29.125,-95.785,29.155'), [-95.825, 29.125, -95.785, 29.155]);
  assert.equal(parseBboxParam('1,2,3'), null);
  assert.equal(parseBboxParam('5,5,1,1'), null);
  assert.equal(parseBboxParam('-96,29,-95,30'), null);
});

test('median handles odd, even and empty', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
});

test('curated comps carry the required Paul hub benchmarks', () => {
  const byId = Object.fromEntries(CURATED_COMPS.map((c) => [c.id, c]));
  assert.equal(byId['cur-106-palm'].price, 399900);
  assert.equal(byId['cur-106-palm'].soldDate, '2026-03-20');
  assert.equal(byId['cur-410-palm'].price, 289999);
  assert.equal(byId['cur-410-palm'].lat, 29.24716);
  assert.equal(byId['cur-212-dehart'].instrument, '2026000336');
  assert.equal(byId['cur-122-s-circle'].instrument, '2025012084');
  assert.equal(byId['cur-fm524-tract7'].price, 52043);
  assert.equal(byId['cur-fm524-tract7'].targetPrice, 25000);
  assert.equal(byId['cur-417-palm'].sqft, 3040);
  assert.equal(BCAD_PROPERTY_URL(214140), 'https://propaccess.trueautomation.com/clientdb/Property.aspx?cid=51&prop_id=214140');
});

function fakeFetch(features) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ features }),
  });
}

test('buildCompsPayload merges live BCAD with curated and computes metrics', async () => {
  clearRealEstateCache();
  const features = [
    {
      attributes: { PID: 248889, SITUS: '212 DEHART ST', DOCUMENT: '2026000336 , 2002055433', appraised_val: 132045, Land_Acreage: 0.519, py_owner_name: 'TRIBBLE  JENNIFER' },
      geometry: { rings: square(-95.236, 29.2507) },
    },
    {
      attributes: { PID: 999001, SITUS: '555 TEST RD', DOCUMENT: '2025099999', appraised_val: 50000, Land_Acreage: 2, py_owner_name: 'DOE JOHN' },
      geometry: { rings: square(-95.235, 29.2512) },
    },
    {
      attributes: { PID: 214140, SITUS: '417 PALM DR CR 776', DOCUMENT: '2004-016881', appraised_val: 407330, Land_Acreage: 0.3496, py_owner_name: 'BRACEWELL PAUL' },
      geometry: { rings: square(-95.2313, 29.2475) },
    },
  ];
  const payload = await buildCompsPayload({
    site: 'liverpool',
    bbox: [-95.242, 29.2435, -95.226, 29.254],
    fetchImpl: fakeFetch(features),
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.live.error, null);
  const ids = payload.comps.map((c) => c.id);
  assert.ok(ids.includes('bcad-999001'));
  const dehart = payload.comps.find((c) => c.id === 'cur-212-dehart');
  assert.equal(dehart.bcadLive, true);
  assert.equal(dehart.owner, 'TRIBBLE JENNIFER');
  assert.equal(dehart.badge, 'DEED 2026');
  const live = payload.comps.find((c) => c.id === 'bcad-999001');
  assert.equal(live.kind, 'deed');
  assert.equal(live.instrument, '2025099999');
  assert.ok(live.bcadUrl.endsWith('prop_id=999001'));
  const sold = payload.comps.find((c) => c.id === 'cur-106-palm');
  const subj = payload.comps.find((c) => c.id === 'cur-417-palm');
  assert.equal(subj.acres, 0.5);
  assert.equal(subj.bcadAcres, 0.3496);
  assert.equal(sold.badge, 'SOLD $400K');
  assert.equal(sold.valueType, 'sold');
  assert.ok(payload.metrics.waterfrontPremiumPct > 0);
  assert.equal(payload.metrics.ave.subject.includes('417 Palm'), true);
  assert.ok(payload.metrics.ave.low < payload.metrics.ave.mid && payload.metrics.ave.mid < payload.metrics.ave.high);
  assert.match(payload.metrics.pitch.lisa, /Lisa Muse/);
});

test('upstream results are cached for 5 minutes and stale-on-error', async () => {
  clearRealEstateCache();
  let calls = 0;
  const f = async () => {
    calls += 1;
    return { ok: true, status: 200, json: async () => ({ features: [] }) };
  };
  const bbox = [-95.825, 29.125, -95.785, 29.155];
  await buildCompsPayload({ site: 'sweeny', bbox, fetchImpl: f });
  const first = calls;
  const second = await buildCompsPayload({ site: 'sweeny', bbox, fetchImpl: f });
  assert.equal(calls, first);
  assert.equal(second.live.cached, true);
  const tract = second.comps.find((c) => c.kind === 'tract');
  assert.equal(second.metrics.ave.mid, tract.price === 52043 ? Math.round(7.33 * 7100) : 0);
});

test('upstream failure still returns curated comps with live.error', async () => {
  clearRealEstateCache();
  const payload = await buildCompsPayload({
    site: 'liverpool',
    bbox: [-95.242, 29.2435, -95.226, 29.254],
    fetchImpl: async () => {
      throw new Error('network down');
    },
  });
  assert.equal(payload.ok, true);
  assert.match(payload.live.error, /network down/);
  assert.ok(payload.comps.some((c) => c.id === 'cur-417-palm'));
});

test('buildComps without parcels and computeMetrics sweeny pitch', () => {
  const comps = buildComps('sweeny', [], null);
  assert.equal(comps.length, 1);
  const m = computeMetrics('sweeny', comps);
  assert.equal(m.ave.mid, 52043);
  assert.match(m.pitch.lisa, /\$25,000/);
});

test('parcelsFromFeatures dedupes by PID and falls back to legal_acreage', () => {
  const parcels = parcelsFromFeatures([
    { attributes: { PID: 1, SITUS: 'A', Land_Acreage: 0, legal_acreage: 0.4, appraised_val: 10 }, geometry: { rings: square(1, 1) } },
    { attributes: { PID: 1, SITUS: 'A', Land_Acreage: 0, legal_acreage: 0.4, appraised_val: 10 }, geometry: { rings: square(2, 2) } },
  ]);
  assert.equal(parcels.length, 1);
  assert.equal(parcels[0].acres, 0.4);
});
