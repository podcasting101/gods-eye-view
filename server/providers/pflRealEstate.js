/**
 * PFL Virtual Real Estate Agent — Live Sold & Deed Comps Provider
 * (/api/pfl/real-estate/comps?site=liverpool|sweeny|bbox&bbox=xmin,ymin,xmax,ymax)
 *
 * Merges:
 *   1. LIVE official Brazoria County CAD ArcGIS REST parcels with recorded deed
 *      transfers (DOCUMENT instrument year 2024/2025/2026) + key Palm Dr /
 *      Abstract 88 Block 48 neighbours (centroid, PID, owner, appraised value,
 *      acreage, official BCAD link).
 *   2. Curated MLS / HAR / Zillow closed-sale benchmarks around Paul's hubs.
 * and computes "Virtual Broker" valuation metrics + Lisa/Harry pitch notes.
 * Upstream ArcGIS responses are cached for 5 minutes (with stale-on-error).
 */

export const BCAD_ARCGIS_QUERY_URL =
  'https://arcgis-web.brazoriacountytx.gov/arcgis/rest/services/general/Parcels/MapServer/1/query';
export const BCAD_PROPERTY_URL = (pid) =>
  `https://propaccess.trueautomation.com/clientdb/Property.aspx?cid=51&prop_id=${encodeURIComponent(pid)}`;
export const ZILLOW_SEARCH_URL = (address) =>
  `https://www.zillow.com/homes/${encodeURIComponent(String(address).replace(/\s+/g, '-'))}_rb/`;

export const COMPS_CACHE_TTL_MS = 5 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 12_000;
const MAX_BBOX_SPAN_DEG = 0.25;
const TAX_RATE = 0.0188;
const RECENT_DEED_YEARS = new Set([2024, 2025, 2026]);

export const SITE_BBOXES = Object.freeze({
  liverpool: Object.freeze([-95.242, 29.2435, -95.226, 29.254]),
  sweeny: Object.freeze([-95.825, 29.125, -95.785, 29.155]),
});

const SITE_META = Object.freeze({
  liverpool: {
    name: 'Liverpool / Chocolate Bayou (77577)',
    center: { lat: 29.24752, lon: -95.23144 },
    neighborWhere: "SITUS LIKE '%PALM%'",
  },
  sweeny: {
    name: 'Sweeny / Bird Pond (77480) — Abstract 88 Block 48',
    center: { lat: 29.139116, lon: -95.804794 },
    neighborWhere: "legal_desc LIKE '%A0088%'",
  },
  bbox: { name: 'Custom bbox', center: null, neighborWhere: null },
});

/**
 * Curated verified closed-sale + BCAD benchmark comps.
 * `kind`: subject | sold | deed | comp | tract.  `pid` joins live BCAD data.
 */
export const CURATED_COMPS = Object.freeze([
  {
    id: 'cur-417-palm',
    site: 'liverpool',
    kind: 'subject',
    address: '417 Palm Dr CR 776, Liverpool TX 77577',
    pid: 214140,
    lat: 29.24752,
    lon: -95.23144,
    sqft: 3040,
    acres: 0.5,
    appraised: 407330,
    waterfront: true,
    photos: 32,
    source: 'Zillow/MLS 32-photo subject listing + BCAD',
    note: 'Subject flagship — 3,040 sqft on 0.50 ac, Chocolate Bayou frontage.',
  },
  {
    id: 'cur-106-palm',
    site: 'liverpool',
    kind: 'sold',
    address: '106 Palm Dr CR 776, Liverpool TX 77577',
    pid: 214154,
    lat: 29.24604,
    lon: -95.23582,
    sqft: 1120,
    price: 399900,
    soldDate: '2026-03-20',
    waterfront: true,
    source: 'MLS/HAR closed sale',
    note: 'Waterfront 1,120 sqft — closed 2026-03-20.',
  },
  {
    id: 'cur-410-palm',
    site: 'liverpool',
    kind: 'sold',
    address: '410 Palm Dr CR 776, Liverpool TX 77577',
    pid: 214171,
    lat: 29.24716,
    lon: -95.23168,
    sqft: 1088,
    price: 289999,
    soldDate: '2025-03-12',
    waterfront: false,
    source: 'MLS/HAR closed sale',
    note: 'Across the street from 417 Palm Dr — closed 2025-03-12.',
  },
  {
    id: 'cur-212-dehart',
    site: 'liverpool',
    kind: 'deed',
    address: '212 Dehart St, Liverpool TX 77577',
    pid: 248889,
    lat: 29.25072,
    lon: -95.23612,
    deedYear: 2026,
    instrument: '2026000336',
    appraised: 132045,
    waterfront: false,
    source: 'BCAD 2026 recorded deed',
  },
  {
    id: 'cur-122-s-circle',
    site: 'liverpool',
    kind: 'deed',
    address: '122 S Circle Dr, Liverpool TX 77577',
    pid: 240147,
    lat: 29.24495,
    lon: -95.23823,
    deedYear: 2025,
    instrument: '2025012084',
    appraised: 152080,
    waterfront: false,
    source: 'BCAD 2025 recorded deed',
  },
  {
    id: 'cur-710-cr776',
    site: 'liverpool',
    kind: 'comp',
    address: '710 CR 776 Palm, Liverpool TX 77577',
    pid: 497176,
    lat: 29.24651,
    lon: -95.23235,
    appraised: 519550,
    waterfront: true,
    source: 'BCAD appraisal (waterfront comp)',
  },
  {
    id: 'cur-227-palm',
    site: 'liverpool',
    kind: 'comp',
    address: '227 Palm Dr, Liverpool TX 77577',
    pid: 214130,
    lat: 29.24746,
    lon: -95.23391,
    appraised: 563490,
    waterfront: true,
    source: 'BCAD appraisal (waterfront comp)',
  },
  {
    id: 'cur-fm524-tract7',
    site: 'sweeny',
    kind: 'tract',
    address: 'FM 524 / CR 488 Tract 7, Sweeny TX 77480 (Abstract 88 Block 48)',
    pid: null,
    lat: 29.139116,
    lon: -95.804794,
    acres: 7.33,
    pricePerAcre: 7100,
    price: 52043,
    priceType: 'comp-value',
    targetPrice: 25000,
    waterfront: false,
    source: 'Legado land comp @ $7,100/ac (Ava 50% target $25,000)',
    note: '7.33 ac × $7,100/ac = $52,043. Ava 50% interest target: $25,000.',
  },
]);

// ------------------------------------------------------------------ helpers

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Extract the newest recent (2024–2026) recorded instrument from BCAD DOCUMENT. */
export function parseDeed(documentField) {
  const tokens = clean(documentField)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  let best = null;
  for (const token of tokens) {
    const m = /^(20\d{2})-?(\d{6})$/.exec(token);
    if (!m) continue;
    const year = Number(m[1]);
    if (!best || year > best.deedYear || (year === best.deedYear && token > best.instrument))
      best = { deedYear: year, instrument: `${m[1]}${m[2]}` };
  }
  return best && RECENT_DEED_YEARS.has(best.deedYear) ? best : null;
}

/** Area-weighted-ish centroid of the largest ring (simple vertex mean of bbox-largest ring). */
export function ringCentroid(rings) {
  if (!Array.isArray(rings) || !rings.length) return null;
  let best = null;
  let bestArea = -1;
  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < 3) continue;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const [x, y] of ring) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const area = (maxX - minX) * (maxY - minY);
    if (area > bestArea) {
      bestArea = area;
      best = { lon: (minX + maxX) / 2, lat: (minY + maxY) / 2, ring };
    }
  }
  return best ? { lat: best.lat, lon: best.lon } : null;
}

export function median(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function parseBboxParam(raw) {
  const parts = String(raw ?? '')
    .split(',')
    .map((p) => Number(p.trim()));
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return null;
  const [xmin, ymin, xmax, ymax] = parts;
  if (xmin >= xmax || ymin >= ymax) return null;
  if (xmin < -180 || xmax > 180 || ymin < -90 || ymax > 90) return null;
  if (xmax - xmin > MAX_BBOX_SPAN_DEG || ymax - ymin > MAX_BBOX_SPAN_DEG) return null;
  return [xmin, ymin, xmax, ymax];
}

/** Collapse ArcGIS polygon features (many rings per PID) into one record per PID. */
export function parcelsFromFeatures(features) {
  const byPid = new Map();
  for (const f of features || []) {
    const a = f?.attributes || {};
    const pid = num(a.PID || a.prop_id);
    if (!pid) continue;
    const c = ringCentroid(f.geometry?.rings);
    const prev = byPid.get(pid);
    const acres = num(a.Land_Acreage) || num(a.legal_acreage);
    const rec = {
      pid,
      situs: clean(a.SITUS) || clean(a.OLD_BCAD_GIS_SITUS),
      owner: clean(a.py_owner_name),
      appraised: num(a.appraised_val),
      acres,
      document: clean(a.DOCUMENT),
      tract: clean(a.NAME),
      lat: c?.lat ?? null,
      lon: c?.lon ?? null,
    };
    if (!prev) byPid.set(pid, rec);
    else if (prev.lat == null && c) byPid.set(pid, { ...prev, lat: rec.lat, lon: rec.lon });
  }
  return [...byPid.values()];
}

function estTax(appraised) {
  return appraised > 0 ? Math.round(appraised * TAX_RATE) : 0;
}

function shortPrice(n) {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  return `$${Math.round(n / 1000)}K`;
}

function badgeFor(comp) {
  if (comp.kind === 'sold') return `SOLD ${shortPrice(comp.price)}`;
  if (comp.kind === 'subject') return `SUBJECT ${shortPrice(comp.appraised)}`;
  if (comp.kind === 'tract') return `TRACT ${shortPrice(comp.price)}`;
  if (comp.kind === 'deed') return `DEED ${comp.deedYear}`;
  if (comp.kind === 'comp') return `COMP ${shortPrice(comp.appraised)}`;
  return `BCAD ${shortPrice(comp.appraised)}`;
}

function finalizeComp(raw) {
  const comp = { ...raw };
  if (comp.pid) comp.bcadUrl = BCAD_PROPERTY_URL(comp.pid);
  else comp.bcadUrl = 'https://propaccess.trueautomation.com/clientdb/?cid=51';
  comp.zillowUrl = ZILLOW_SEARCH_URL(comp.address || 'Brazoria County TX');
  const taxBasis = comp.appraised || 0;
  comp.estTaxPerYear = estTax(taxBasis);
  comp.valueUsd = comp.price || comp.appraised || 0;
  comp.valueType = comp.price
    ? comp.kind === 'sold'
      ? 'sold'
      : comp.priceType || 'comp-value'
    : 'appraised';
  comp.badge = badgeFor(comp);
  return comp;
}

/** Merge curated comps with live BCAD parcels for one site. */
export function buildComps(site, parcels, bbox) {
  const inBox = (c) =>
    !bbox ||
    (c.lon >= bbox[0] && c.lon <= bbox[2] && c.lat >= bbox[1] && c.lat <= bbox[3]);
  const byPid = new Map(parcels.map((p) => [p.pid, p]));
  const out = [];
  const usedPids = new Set();
  for (const cur of CURATED_COMPS) {
    if (site !== 'bbox' && cur.site !== site) continue;
    if (site === 'bbox' && !inBox(cur)) continue;
    const live = cur.pid ? byPid.get(cur.pid) : null;
    const merged = { ...cur, curated: true };
    if (live) {
      usedPids.add(live.pid);
      merged.owner = live.owner;
      merged.situs = live.situs;
      merged.liveAppraised = live.appraised;
      merged.appraised = live.appraised || cur.appraised;
      merged.acres = cur.acres || live.acres;
      merged.bcadAcres = live.acres || null;
      merged.document = live.document;
      merged.bcadLive = true;
      const d = parseDeed(live.document);
      if (d && !merged.instrument) {
        merged.deedYear = d.deedYear;
        merged.instrument = d.instrument;
      }
      if (live.lat != null && cur.kind !== 'subject' && cur.kind !== 'sold') {
        merged.lat = live.lat;
        merged.lon = live.lon;
      }
    }
    out.push(finalizeComp(merged));
  }
  for (const p of parcels) {
    if (usedPids.has(p.pid) || p.lat == null) continue;
    const d = parseDeed(p.document);
    if (!d && !p.situs) continue;
    out.push(
      finalizeComp({
        id: `bcad-${p.pid}`,
        site,
        kind: d ? 'deed' : 'neighbor',
        address: p.situs || `PID ${p.pid}`,
        pid: p.pid,
        owner: p.owner,
        lat: p.lat,
        lon: p.lon,
        appraised: p.appraised,
        acres: p.acres,
        document: p.document,
        deedYear: d?.deedYear,
        instrument: d?.instrument,
        waterfront: false,
        curated: false,
        bcadLive: true,
        source: d ? `BCAD live recorded deed ${d.deedYear}` : 'BCAD live neighbor parcel',
      }),
    );
  }
  const rank = { subject: 0, sold: 1, tract: 2, deed: 3, comp: 4, neighbor: 5 };
  out.sort(
    (a, b) =>
      (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9) ||
      (b.deedYear || 0) - (a.deedYear || 0) ||
      (b.valueUsd || 0) - (a.valueUsd || 0),
  );
  return out;
}

const fmt$ = (n) => (Number.isFinite(n) && n != null ? `$${Math.round(n).toLocaleString('en-US')}` : 'n/a');

/** Virtual Broker valuation metrics + Lisa/Harry pitch notes. */
export function computeMetrics(site, comps) {
  const sold = comps.filter((c) => c.kind === 'sold' && c.price && c.sqft);
  const soldPerSqft = sold.map((c) => c.price / c.sqft);
  const soldWf = sold.filter((c) => c.waterfront).map((c) => c.price / c.sqft);
  const soldInland = sold.filter((c) => !c.waterfront).map((c) => c.price / c.sqft);
  const medSoldPsf = median(soldPerSqft);
  const waterfrontPremiumPct =
    soldWf.length && soldInland.length ? (median(soldWf) / median(soldInland) - 1) * 100 : null;

  const perAcre = (c) => (c.acres >= 0.1 && c.appraised > 0 ? c.appraised / c.acres : NaN);
  const bcadWf = comps.filter((c) => c.waterfront && c.appraised).map(perAcre);
  const bcadOther = comps
    .filter((c) => !c.waterfront && c.appraised && c.kind !== 'tract' && c.acres >= 0.1)
    .map(perAcre);
  const medianPerAcre = median(
    comps.filter((c) => c.kind !== 'tract').map(perAcre),
  );
  const bcadWaterfrontPremiumPct =
    bcadWf.length && bcadOther.length
      ? (median(bcadWf) / median(bcadOther) - 1) * 100
      : null;

  const metrics = {
    soldCount: sold.length,
    deedCount: comps.filter((c) => c.kind === 'deed').length,
    liveBcadParcels: comps.filter((c) => c.bcadLive).length,
    medianSoldPerSqft: medSoldPsf ? Math.round(medSoldPsf) : null,
    medianBcadPerAcre: medianPerAcre ? Math.round(medianPerAcre) : null,
    waterfrontPremiumPct:
      waterfrontPremiumPct != null ? Math.round(waterfrontPremiumPct) : null,
    bcadWaterfrontPremiumPct:
      bcadWaterfrontPremiumPct != null ? Math.round(bcadWaterfrontPremiumPct) : null,
    ave: null,
    pitch: { lisa: '', harry: '' },
    disclaimer:
      'Indicative broker opinion built from closed sales + public BCAD data; not a licensed appraisal.',
  };

  if (site === 'liverpool' || site === 'bbox') {
    const subject = comps.find((c) => c.kind === 'subject');
    if (subject && soldPerSqft.length) {
      const lo = Math.min(...soldPerSqft) * subject.sqft;
      const hi = Math.max(...soldPerSqft) * subject.sqft;
      const mid = medSoldPsf * subject.sqft;
      metrics.ave = {
        subject: subject.address,
        method: 'median closed $/sqft × subject sqft (range = min..max sold $/sqft)',
        low: Math.round(lo),
        mid: Math.round(mid),
        high: Math.round(hi),
        bcadAppraised: subject.appraised,
        bcadToMidRatio: subject.appraised ? +(subject.appraised / mid).toFixed(2) : null,
        caveat:
          'Comps are small 1,088–1,120 sqft homes; $/sqft usually falls as size grows, so treat the high end as a ceiling.',
      };
      metrics.pitch.lisa =
        `👑 Lisa Muse: ${subject.address} is a ${subject.sqft.toLocaleString()} sqft flagship on ${subject.acres} ac with Chocolate Bayou frontage. ` +
        `Two closed sales on Palm Dr set the tape: 106 Palm sold ${fmt$(399900)} (waterfront, ${Math.round(399900 / 1120)} $/sqft) and 410 Palm sold ${fmt$(289999)} (across the street, ${Math.round(289999 / 1088)} $/sqft). ` +
        `Waterfront carries about a ${metrics.waterfrontPremiumPct ?? '?'}% $/sqft premium. BCAD has it at ${fmt$(subject.appraised)} — well under the ${fmt$(metrics.ave.low)}–${fmt$(metrics.ave.high)} comp-implied range.`;
      metrics.pitch.harry =
        `🕵️ Harry: Recorded deeds are the leading indicator — 212 Dehart St (2026000336) and 122 S Circle Dr (2025012084) show inland lots trade near ${fmt$(132045)}–${fmt$(152080)} appraised. ` +
        `Palm Dr waterfront BCAD comps 710 CR 776 (${fmt$(519550)}) and 227 Palm Dr (${fmt$(563490)}) bracket a bayou-front ceiling. ` +
        `Median BCAD $/ac across live parcels: ${fmt$(metrics.medianBcadPerAcre)}. ` +
        `Texas is non-disclosure: closed prices come from MLS/HAR, not the deed — verify before quoting.`;
    }
  }
  if (site === 'sweeny') {
    const tract = comps.find((c) => c.kind === 'tract');
    if (tract) {
      metrics.ave = {
        subject: tract.address,
        method: 'acres × Legado $/ac comp',
        low: Math.round(tract.acres * tract.pricePerAcre * 0.85),
        mid: Math.round(tract.acres * tract.pricePerAcre),
        high: Math.round(tract.acres * tract.pricePerAcre * 1.15),
        pricePerAcre: tract.pricePerAcre,
        targetPrice: tract.targetPrice,
        bcadMedianPerAcre: metrics.medianBcadPerAcre,
        caveat: '±15% band is a heuristic; Legado $/ac is a single comp.',
      };
      metrics.pitch.lisa =
        `👑 Lisa Muse: Tract 7 is ${tract.acres} ac at the FM 524 / CR 488 corner. The Legado comp at ${fmt$(tract.pricePerAcre)}/ac implies ${fmt$(metrics.ave.mid)}; our Ava 50% target is ${fmt$(tract.targetPrice)} — a clean entry at roughly ${Math.round((tract.targetPrice / metrics.ave.mid) * 100)}% of comp value.`;
      metrics.pitch.harry =
        `🕵️ Harry: ${metrics.deedCount} live BCAD deed transfers (2024–2026) inside the Sweeny/Bird Pond box; median BCAD appraised ${fmt$(metrics.medianBcadPerAcre)}/ac. ` +
        `Appraisal runs below market in Brazoria — use deed activity, not BCAD, as the price signal.`;
    }
  }
  if (!metrics.pitch.lisa)
    metrics.pitch.lisa = `👑 Lisa Muse: ${comps.length} comps in view. Median BCAD ${fmt$(metrics.medianBcadPerAcre)}/ac.`;
  if (!metrics.pitch.harry)
    metrics.pitch.harry = `🕵️ Harry: ${metrics.deedCount} recent recorded deeds in the box.`;
  return metrics;
}

// ------------------------------------------------------------- live upstream

const cache = new Map(); // key -> { at, value }
const inflight = new Map();

async function arcgisQuery({ where, bbox, fetchImpl = fetch }) {
  const params = new URLSearchParams({
    where,
    geometry: bbox.join(','),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields:
      'PID,SITUS,OLD_BCAD_GIS_SITUS,py_owner_name,appraised_val,DOCUMENT,Land_Acreage,legal_acreage,NAME',
    returnGeometry: 'true',
    outSR: '4326',
    resultRecordCount: '500',
    f: 'json',
  });
  const res = await fetchImpl(`${BCAD_ARCGIS_QUERY_URL}?${params}`, {
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`BCAD ArcGIS HTTP ${res.status}`);
  const body = await res.json();
  if (body?.error) throw new Error(`BCAD ArcGIS: ${body.error.message || 'query error'}`);
  return body.features || [];
}

export const DEED_WHERE =
  "DOCUMENT LIKE '2026%' OR DOCUMENT LIKE '2025%' OR DOCUMENT LIKE '2024%'";

async function fetchLiveParcels(site, bbox, fetchImpl) {
  const key = `${site}|${bbox.join(',')}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < COMPS_CACHE_TTL_MS)
    return { ...hit.value, cached: true, ageMs: Date.now() - hit.at };
  if (inflight.has(key)) return inflight.get(key);
  const work = (async () => {
    try {
      const jobs = [arcgisQuery({ where: DEED_WHERE, bbox, fetchImpl })];
      const neighborWhere = SITE_META[site]?.neighborWhere;
      if (neighborWhere) jobs.push(arcgisQuery({ where: neighborWhere, bbox, fetchImpl }));
      const settled = await Promise.allSettled(jobs);
      if (settled.every((s) => s.status === 'rejected'))
        throw settled[0].reason;
      const features = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
      const partialError = settled.find((s) => s.status === 'rejected')?.reason?.message;
      const value = {
        parcels: parcelsFromFeatures(features),
        fetchedAt: new Date().toISOString(),
        partialError,
      };
      cache.set(key, { at: Date.now(), value });
      return { ...value, cached: false, ageMs: 0 };
    } catch (error) {
      if (hit)
        return {
          ...hit.value,
          cached: true,
          stale: true,
          ageMs: Date.now() - hit.at,
          error: String(error?.message || error),
        };
      return { parcels: [], cached: false, error: String(error?.message || error) };
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, work);
  return work;
}

/** Build the full comps payload (exported for tests; accepts injected fetch). */
export async function buildCompsPayload({ site, bbox, fetchImpl } = {}) {
  const live = await fetchLiveParcels(site, bbox, fetchImpl);
  const comps = buildComps(site, live.parcels, site === 'bbox' ? bbox : null);
  const metrics = computeMetrics(site, comps);
  return {
    ok: true,
    site,
    siteName: SITE_META[site].name,
    center: SITE_META[site].center,
    bbox,
    generatedAt: new Date().toISOString(),
    source: {
      live: BCAD_ARCGIS_QUERY_URL,
      deedFilter: DEED_WHERE,
      curated: 'MLS/HAR/Zillow closed-sale benchmarks (Paul PFL hubs)',
    },
    live: {
      parcels: live.parcels.length,
      cached: !!live.cached,
      stale: !!live.stale,
      ageMs: live.ageMs ?? 0,
      fetchedAt: live.fetchedAt || null,
      error: live.error || live.partialError || null,
    },
    count: comps.length,
    metrics,
    comps,
  };
}

export function clearRealEstateCache() {
  cache.clear();
  inflight.clear();
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'public, max-age=60',
  });
  res.end(text);
}

export function pflRealEstateProxy() {
  const install = (server) => {
    server.middlewares.use('/api/pfl/real-estate', async (req, res, next) => {
      try {
        const url = new URL(req.url || '/', 'http://localhost');
        if (url.pathname !== '/comps' && url.pathname !== '/comps/') {
          if (typeof next === 'function') return next();
          return sendJson(res, 404, { ok: false, error: 'not found' });
        }
        if (req.method && req.method !== 'GET')
          return sendJson(res, 405, { ok: false, error: 'GET only' });
        const site = (url.searchParams.get('site') || 'liverpool').toLowerCase();
        if (!['liverpool', 'sweeny', 'bbox'].includes(site))
          return sendJson(res, 400, { ok: false, error: 'site must be liverpool|sweeny|bbox' });
        let bbox = SITE_BBOXES[site] ? [...SITE_BBOXES[site]] : null;
        if (site === 'bbox' || url.searchParams.has('bbox')) {
          const parsed = parseBboxParam(url.searchParams.get('bbox'));
          if (!parsed)
            return sendJson(res, 400, {
              ok: false,
              error: `bbox=xmin,ymin,xmax,ymax in WGS84 required (max span ${MAX_BBOX_SPAN_DEG}°)`,
            });
          bbox = parsed;
        }
        return sendJson(res, 200, await buildCompsPayload({ site, bbox }));
      } catch (error) {
        return sendJson(res, 500, { ok: false, error: String(error?.message || error) });
      }
    });
  };
  return {
    name: 'pfl-real-estate',
    configureServer: install,
    configurePreviewServer: install,
  };
}
