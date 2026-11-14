import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ARCGIS_BCAD_PARCELS_QUERY_ENDPOINT,
  BCAD_DEFAULT_BBOX,
  BCAD_QUERY_FIELDS,
  HERO_BLOCK48_TRACTS,
  REAL_ESTATE_SERVICE_CONFIG,
  SURVEYED_GROUND_DATUMS,
  buildArcGisParcelsQueryUrl,
  calculateEstimatedTax,
  getBcadUrls,
  isTaxExempt,
  resolveAppraisedValue,
} from './realEstateConfig.js';

test('REAL_ESTATE_SERVICE_CONFIG provides standalone frozen configuration', () => {
  assert.ok(Object.isFrozen(REAL_ESTATE_SERVICE_CONFIG));
  assert.equal(
    REAL_ESTATE_SERVICE_CONFIG.endpoint,
    ARCGIS_BCAD_PARCELS_QUERY_ENDPOINT,
  );
  assert.deepEqual(REAL_ESTATE_SERVICE_CONFIG.defaultBbox, BCAD_DEFAULT_BBOX);
  assert.deepEqual(REAL_ESTATE_SERVICE_CONFIG.queryFields, BCAD_QUERY_FIELDS);
  assert.equal(
    REAL_ESTATE_SERVICE_CONFIG.surveyedDatums.birdPondFallbackGroundM,
    -17.5,
  );
  assert.equal(
    REAL_ESTATE_SERVICE_CONFIG.surveyedDatums.liverpoolFallbackGroundM,
    -26.19,
  );
});

test('buildArcGisParcelsQueryUrl constructs standard ESRI ArcGIS REST query with spatial intersect', () => {
  const url = buildArcGisParcelsQueryUrl();
  assert.ok(url.startsWith(ARCGIS_BCAD_PARCELS_QUERY_ENDPOINT));
  assert.ok(url.includes('geometryType=esriGeometryEnvelope'));
  assert.ok(url.includes('spatialRel=esriSpatialRelIntersects'));
  assert.ok(url.includes('outSR=4326'));
  assert.ok(url.includes('f=json'));
  assert.ok(url.includes('PID%2Cgeo_id%2CNAME'));

  const customUrl = buildArcGisParcelsQueryUrl({
    bbox: { xmin: -95.5, ymin: 29.0, xmax: -95.4, ymax: 29.1 },
    outFields: ['PID', 'NAME'],
  });
  assert.ok(customUrl.includes('-95.5%2C29%2C-95.4%2C29.1'));
  assert.ok(customUrl.includes('outFields=PID%2CNAME'));
});

test('resolveAppraisedValue enforces verified 2026 circuit-breaker cap for PID 595430', () => {
  const capped = resolveAppraisedValue('595430', 53990);
  assert.equal(capped.valNum, 22032);
  assert.equal(capped.displayVal, '$22,032 (Tr 6+7A Capped · $53,990 Mkt)');
  assert.equal(capped.estTax, '~$414/yr (Tr 6+7A combined)');
  assert.equal(capped.isCapped, true);

  const regular = resolveAppraisedValue('123456', 150000);
  assert.equal(regular.valNum, 150000);
  assert.equal(regular.displayVal, '$150,000');
  assert.equal(regular.isCapped, false);

  const unappraised = resolveAppraisedValue('999999', 0);
  assert.equal(unappraised.valNum, 0);
  assert.equal(unappraised.displayVal, '');
});

test('isTaxExempt detects governmental and exempt entities', () => {
  assert.equal(isTaxExempt('UNITED STATES OF AMERICA'), true);
  assert.equal(isTaxExempt('Brazoria County Navigation District'), true);
  assert.equal(isTaxExempt('State of Texas Wildlife'), true);
  assert.equal(isTaxExempt('City of Sweeny'), true);
  assert.equal(isTaxExempt('John Doe Private Citizen'), false);
});

test('calculateEstimatedTax computes tax estimates and respects exemptions and overrides', () => {
  assert.equal(calculateEstimatedTax(53990, 'Private', '595430'), '~$414/yr (Tr 6+7A combined)');
  assert.equal(calculateEstimatedTax(200000, 'UNITED STATES FISH AND WILDLIFE', '111111'), '$0 (Exempt)');
  assert.equal(calculateEstimatedTax(100000, 'Private Owner', '222222'), '~$1,880/yr');
  assert.equal(calculateEstimatedTax(0, 'Private Owner', '333333'), '');
});

test('getBcadUrls returns official property and tax portal URLs', () => {
  const urls = getBcadUrls('595430');
  assert.equal(urls.bcadUrl, 'https://esearch.brazoriacad.org/Property/View/595430');
  assert.equal(urls.taxOfficeUrl, 'https://actweb.acttax.com/act_webdev/brazoria/index.jsp');

  const emptyUrls = getBcadUrls('');
  assert.equal(emptyUrls.bcadUrl, 'https://esearch.brazoriacad.org/');
});

test('HERO_BLOCK48_TRACTS contains Block 48 tract set', () => {
  assert.ok(HERO_BLOCK48_TRACTS.has('7'));
  assert.ok(HERO_BLOCK48_TRACTS.has('7A'));
  assert.ok(HERO_BLOCK48_TRACTS.has('6'));
  assert.ok(HERO_BLOCK48_TRACTS.has('TRACT 7'));
  assert.ok(HERO_BLOCK48_TRACTS.has('TRACT 7A'));
  assert.ok(!HERO_BLOCK48_TRACTS.has('88'));
});
