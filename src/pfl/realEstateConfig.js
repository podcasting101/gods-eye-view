/**
 * Standalone Real Estate Service Configuration for Project Free Life / God's Eye View.
 *
 * Decouples official Brazoria County CAD ArcGIS REST service endpoints,
 * parcel bounding envelopes, tax appraisal calculations, circuit-breaker
 * homestead valuation overrides, and official county property lookup links
 * from display logic.
 */

export const ARCGIS_BCAD_PARCELS_QUERY_ENDPOINT =
  'https://arcgis-web.brazoriacountytx.gov/arcgis/rest/services/general/Parcels/MapServer/1/query';

export const BCAD_DEFAULT_BBOX = Object.freeze({
  xmin: -95.814,
  ymin: 29.132,
  xmax: -95.794,
  ymax: 29.148,
});

export const BCAD_QUERY_FIELDS = Object.freeze([
  'PID',
  'geo_id',
  'NAME',
  'py_owner_name',
  'legal_acreage',
  'appraised_val',
  'SITUS',
  'OLD_BCAD_GIS_SITUS',
  'DOCUMENT',
  'legal_desc',
]);

export const BIRDPOND_BASE_URL = 'https://elitespyworlds.com/birdpond';
export const BIRDPOND_LAYOUT_URL = `${BIRDPOND_BASE_URL}/save_layout.php`;

/**
 * Surveyed WGS84 ellipsoid fallback elevations (m) for PFL sites.
 * - Sweeny / Bird Pond: ~9m NAVD88 orthometric height - ~26.5m geoid undulation = -17.5m
 * - Liverpool / Station: surveyed grade -26.19m
 */
export const SURVEYED_GROUND_DATUMS = Object.freeze({
  birdPondFallbackGroundM: -17.5,
  liverpoolFallbackGroundM: -26.19,
});

/**
 * Abstract 88 (D. McNeel League), Block 48 Hero Tracts.
 */
export const HERO_BLOCK48_TRACTS = Object.freeze(
  new Set([
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '7A',
    'TRACT 1',
    'TRACT 2',
    'TRACT 3',
    'TRACT 4',
    'TRACT 5',
    'TRACT 6',
    'TRACT 7',
    'TRACT 7A',
  ]),
);

/**
 * Explicit statutory / circuit-breaker appraisal overrides.
 * PID 595430 (Tract 6 & 7A): Verified 2026 circuit-breaker capped appraisal $22,032
 * ($53,990 uncapped market).
 */
export const APPRAISAL_OVERRIDES = Object.freeze({
  '595430': Object.freeze({
    pid: '595430',
    appraisedVal: 22032,
    marketVal: 53990,
    displayVal: '$22,032 (Tr 6+7A Capped · $53,990 Mkt)',
    estTax: '~$414/yr (Tr 6+7A combined)',
    tract: 'Tract 6 + 7A',
    notes: '2026 statutory circuit-breaker capped valuation',
  }),
});

export const TAX_EXEMPT_KEYWORDS = Object.freeze([
  'UNITED STATES',
  'BRAZORIA COUNTY',
  'STATE OF TEXAS',
  'CITY OF SWEENY',
  'SWEENY ISD',
]);

/**
 * Builds the canonical ArcGIS REST query URL for parcel polygons and attributes.
 */
export function buildArcGisParcelsQueryUrl({
  endpoint = ARCGIS_BCAD_PARCELS_QUERY_ENDPOINT,
  bbox = BCAD_DEFAULT_BBOX,
  outFields = BCAD_QUERY_FIELDS,
  outSR = 4326,
  inSR = 4326,
  format = 'json',
} = {}) {
  const geomParam = `${bbox.xmin},${bbox.ymin},${bbox.xmax},${bbox.ymax}`;
  const fieldsParam = Array.isArray(outFields) ? outFields.join(',') : outFields;
  return (
    `${endpoint}?geometry=${encodeURIComponent(geomParam)}` +
    `&geometryType=esriGeometryEnvelope&inSR=${inSR}` +
    `&spatialRel=esriSpatialRelIntersects` +
    `&outFields=${encodeURIComponent(fieldsParam)}` +
    `&outSR=${outSR}&f=${encodeURIComponent(format)}`
  );
}

/**
 * Checks whether an owner entity is tax-exempt.
 */
export function isTaxExempt(ownerName) {
  const upper = String(ownerName || '').toUpperCase();
  return TAX_EXEMPT_KEYWORDS.some((kw) => upper.includes(kw));
}

/**
 * Calculates or resolves the estimated annual ad-valorem tax.
 */
export function calculateEstimatedTax(valNum, ownerName, pid) {
  const pidKey = String(pid || '').trim();
  if (APPRAISAL_OVERRIDES[pidKey]?.estTax) {
    return APPRAISAL_OVERRIDES[pidKey].estTax;
  }
  if (isTaxExempt(ownerName)) {
    return '$0 (Exempt)';
  }
  if (typeof valNum === 'number' && valNum > 0) {
    return `~$${Math.round(valNum * 0.0188).toLocaleString()}/yr`;
  }
  return '';
}

/**
 * Resolves the statutory appraised value, handling circuit-breaker caps.
 */
export function resolveAppraisedValue(pid, rawGisVal) {
  const pidKey = String(pid || '').trim();
  const override = APPRAISAL_OVERRIDES[pidKey];
  if (override) {
    return {
      valNum: override.appraisedVal,
      displayVal: override.displayVal,
      estTax: override.estTax,
      isCapped: true,
    };
  }
  const numericVal = Number(rawGisVal || 0);
  return {
    valNum: numericVal,
    displayVal: numericVal > 0 ? `$${numericVal.toLocaleString()}` : '',
    estTax: '',
    isCapped: false,
  };
}

/**
 * Official county property records and tax portal URLs.
 */
export function getBcadUrls(pid) {
  const pidTrim = String(pid || '').trim();
  return {
    bcadUrl: pidTrim
      ? `https://esearch.brazoriacad.org/Property/View/${encodeURIComponent(pidTrim)}`
      : 'https://esearch.brazoriacad.org/',
    taxOfficeUrl: 'https://actweb.acttax.com/act_webdev/brazoria/index.jsp',
  };
}

export const REAL_ESTATE_SERVICE_CONFIG = Object.freeze({
  endpoint: ARCGIS_BCAD_PARCELS_QUERY_ENDPOINT,
  defaultBbox: BCAD_DEFAULT_BBOX,
  queryFields: BCAD_QUERY_FIELDS,
  queryUrl: buildArcGisParcelsQueryUrl(),
  surveyedDatums: SURVEYED_GROUND_DATUMS,
  heroBlock48Tracts: HERO_BLOCK48_TRACTS,
  appraisalOverrides: APPRAISAL_OVERRIDES,
  buildQueryUrl: buildArcGisParcelsQueryUrl,
  resolveAppraisedValue,
  calculateEstimatedTax,
  getBcadUrls,
  isTaxExempt,
});
