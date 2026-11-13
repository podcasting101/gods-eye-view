import * as Cesium from 'cesium';
import { governorRequestRender } from '../renderGovernor.js';

/**
 * Standardized PFL Cadastral & Spatial Layout Plugin for God's Eye View.
 *
 * Connects local God's Eye View directly to:
 *  1. Official Brazoria County CAD Layer 1 (ArcGIS REST Parcels MapServer/1)
 *     for Abstract 88 (D. McNeel League), Block 48 Tracts 1–7A and neighbors.
 *  2. Bird Pond / Pepper Way live 3D layout endpoint (`save_layout.php`).
 *
 * Architectural note:
 *  - Uses ultra-compact, transparent halo-stroked HTML5 <canvas> billboards
 *    (10px/9px micro-typography, >75% smaller than legacy banners, zero dark boxes)
 *    so `noCesiumLabels.test.mjs` remains 100% satisfied.
 *  - Enforces 16-azimuth polygon interior chord bounds AND a priority-sorted
 *    screen-space AABB collision solver on `scene.preRender` so zero text overlap
 *    can ever occur at any zoom, tilt, or landing vantage.
 */

export const BCAD_PARCELS_QUERY_URL =
  'https://arcgis-web.brazoriacountytx.gov/arcgis/rest/services/general/Parcels/MapServer/1/query' +
  '?geometry=-95.814,29.132,-95.794,29.148&geometryType=esriGeometryEnvelope&inSR=4326' +
  '&spatialRel=esriSpatialRelIntersects' +
  '&outFields=PID,NAME,py_owner_name,legal_acreage,appraised_val,SITUS,DOCUMENT,legal_desc' +
  '&outSR=4326&f=json';

export const BIRDPOND_BASE_URL = 'https://elitespyworlds.com/birdpond';
export const BIRDPOND_LAYOUT_URL = `${BIRDPOND_BASE_URL}/save_layout.php`;

// Surveyed WGS84 ellipsoid fallback for Sweeny / Bird Pond (~9m NAVD88 - ~26.5m geoid)
const BIRDPOND_FALLBACK_GROUND_M = -17.5;

function makeSignCanvas(bgHex, borderHex, title, subtitle) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#5c4033';
  ctx.fillRect(68, 150, 22, 106);
  ctx.fillRect(422, 150, 22, 106);
  ctx.fillStyle = bgHex;
  ctx.fillRect(24, 18, 464, 152);
  ctx.strokeStyle = borderHex;
  ctx.lineWidth = 8;
  ctx.strokeRect(30, 24, 452, 140);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = '800 42px "Segoe UI", Arial, sans-serif';
  ctx.fillText(title, 256, 84, 424);
  if (subtitle) {
    ctx.fillStyle = borderHex;
    ctx.font = '700 26px "Segoe UI", Arial, sans-serif';
    ctx.fillText(subtitle, 256, 134, 424);
  }
  return c;
}

function computeWallSegment(lat, lon, widthM, headingDeg) {
  const halfW = widthM * 0.5;
  const az = ((Number(headingDeg) || 0) * Math.PI) / 180.0;
  // Wall normal faces headingDeg; wall span runs perpendicular (headingDeg + 90°)
  const spanRad = az + Math.PI * 0.5;
  const dN = Math.cos(spanRad) * halfW;
  const dE = Math.sin(spanRad) * halfW;
  const mLat = 111320.0;
  const mLon = 111320.0 * Math.cos((lat * Math.PI) / 180.0);
  return {
    lon1: lon - dE / mLon,
    lat1: lat - dN / mLat,
    lon2: lon + dE / mLon,
    lat2: lat + dN / mLat,
  };
}

async function resolveGroundElevation(viewer, lon, lat) {
  try {
    const tp = viewer?.terrainProvider;
    if (tp && typeof Cesium.sampleTerrainMostDetailed === 'function' && tp.availability) {
      const [pt] = await Cesium.sampleTerrainMostDetailed(tp, [
        Cesium.Cartographic.fromDegrees(lon, lat),
      ]);
      if (pt && Number.isFinite(pt.height)) return pt.height;
    }
  } catch {
    // Fall back to globe height or surveyed constant
  }
  const h = viewer?.scene?.globe?.getHeight?.(Cesium.Cartographic.fromDegrees(lon, lat));
  return Number.isFinite(h) ? h : BIRDPOND_FALLBACK_GROUND_M;
}

async function syncBirdPondObjects({ viewer, fetchImpl, signal, entities, isDestroyed }) {
  const res = await fetchImpl(`${BIRDPOND_LAYOUT_URL}?_t=${Date.now()}`, { signal });
  if (!res?.ok) return;
  const layout = await res.json();
  if (!layout || isDestroyed()) return;

  const groundM = await resolveGroundElevation(viewer, -95.804794, 29.139116);
  if (isDestroyed()) return;

  const defaultWalls = [
    {
      id: 'tract6_gate_wall',
      name: 'Gate Street Photo (2024)',
      image: `${BIRDPOND_BASE_URL}/photos/gate_2024.jpg`,
      lat: 29.13911615582293,
      lon: -95.80479376352282,
      width: 13.92696,
      height: 9.226611,
      heading: 107.0,
    },
    {
      id: 'lisa_at_gate_photo',
      name: 'Lisa Muse — at the Gate',
      image: `${BIRDPOND_BASE_URL}/photos/agent.jpg`,
      lat: 29.1391111,
      lon: -95.804848,
      width: 1.5,
      height: 2.0,
      heading: 2.0,
    },
    {
      id: 'pepper_way_mailbox',
      name: 'Pepper Way Mailbox (2724 FM 524)',
      image: () => makeSignCanvas('#1e293b', '#f8fafc', '2724 FM 524', 'PEPPER WAY'),
      lat: 29.139104,
      lon: -95.804431,
      width: 0.95,
      height: 1.25,
      heading: 122.0,
    },
    {
      id: 'pepper_way_sign',
      name: 'Pepper Way Entrance Sign',
      image: () => makeSignCanvas('#14532d', '#fde047', 'PEPPER WAY', 'PRIVATE SOVEREIGN RD'),
      lat: 29.13903,
      lon: -95.80458,
      width: 3.6,
      height: 1.7,
      heading: 122.0,
    },
    {
      id: 'for_sale_billboard',
      name: 'FOR SALE Billboard',
      image: () => makeSignCanvas('#7f1d1d', '#fef08a', 'FOR SALE', 'FM 524 FRONTAGE'),
      lat: 29.13884,
      lon: -95.8055,
      width: 5.2,
      height: 2.5,
      heading: 102.0,
    },
    {
      id: 'tract7_title_board',
      name: 'Tract 7 Title Breakdown',
      image: `${BIRDPOND_BASE_URL}/photos/tract7-pie.png`,
      lat: 29.139093,
      lon: -95.804716,
      width: 2.8,
      height: 2.8,
      heading: 122.0,
    },
    {
      id: 'proposed_dance_bayou_bridge',
      name: 'Proposed Dance Bayou Bridge',
      image: `${BIRDPOND_BASE_URL}/photos/bridge-proposed.png`,
      lat: 29.1354,
      lon: -95.8042,
      width: 12.0,
      height: 6.8,
      heading: 0.0,
    },
  ];

  const gw = layout.gate_wall || {};
  const objs = layout.objects || {};

  for (const base of defaultWalls) {
    const ov = base.id === 'tract6_gate_wall' ? gw : objs[base.id] || {};
    const lat = typeof ov.lat === 'number' ? ov.lat : base.lat;
    const lon = typeof ov.lon === 'number' ? ov.lon : base.lon;
    const heading = typeof ov.heading === 'number' ? ov.heading : base.heading;
    const scale =
      base.id === 'tract6_gate_wall' && typeof ov.width === 'number' && ov.width > 0
        ? ov.width / base.width
        : typeof ov.scale === 'number' && ov.scale > 0
          ? ov.scale
          : 1.0;
    const opacity = typeof ov.opacity === 'number' ? ov.opacity : 1.0;
    const baseAlt = groundM + (typeof ov.baseAlt === 'number' ? ov.baseAlt : 0);
    const w = base.width * scale;
    const h = base.height * scale;
    const imgSrc = typeof base.image === 'function' ? base.image() : base.image;
    if (!imgSrc) continue;

    const isCutout =
      typeof base.image === 'function' || /\.png(\?|$)/i.test(String(imgSrc));
    const seg = computeWallSegment(lat, lon, w, heading);
    entities.push(
      viewer.entities.add({
        id: `birdpond_${base.id}`,
        name: `Bird Pond · ${base.name}`,
        wall: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights([
            seg.lon1,
            seg.lat1,
            baseAlt + h,
            seg.lon2,
            seg.lat2,
            baseAlt + h,
          ]),
          minimumHeights: [baseAlt, baseAlt],
          material: new Cesium.ImageMaterialProperty({
            image: imgSrc,
            transparent: isCutout || opacity < 0.995,
            color: Cesium.Color.WHITE.withAlpha(opacity),
          }),
        },
      }),
    );
  }

  for (const p of Array.isArray(layout.pins) ? layout.pins : []) {
    if (!p?.id || p.type !== 'photo' || !p.imageUrl) continue;
    const ov = objs[p.id] || {};
    const lat = Number(ov.lat ?? p.lat ?? 29.139116);
    const lon = Number(ov.lon ?? p.lon ?? -95.804794);
    const heading = Number(ov.heading ?? p.heading ?? 107.0);
    const scale = Number(ov.scale ?? p.scale ?? 1.0) || 1.0;
    const opacity = Number(ov.opacity ?? p.opacity ?? 1.0);
    const w = (Number(p.width) || 2.4) * scale;
    const h = (Number(p.height) || 1.8) * scale;
    const baseAlt = groundM + (Number(ov.baseAlt ?? p.baseAlt) || 0);
    const url = p.imageUrl.startsWith('http')
      ? p.imageUrl
      : `${BIRDPOND_BASE_URL}/${p.imageUrl.replace(/^\/+/, '')}`;
    const seg = computeWallSegment(lat, lon, w, heading);
    entities.push(
      viewer.entities.add({
        id: `birdpond_pin_${p.id}`,
        name: `Bird Pond · ${p.title || 'Uploaded Photo'}`,
        wall: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights([
            seg.lon1,
            seg.lat1,
            baseAlt + h,
            seg.lon2,
            seg.lat2,
            baseAlt + h,
          ]),
          minimumHeights: [baseAlt, baseAlt],
          material: new Cesium.ImageMaterialProperty({
            image: url,
            transparent: true,
            color: Cesium.Color.WHITE.withAlpha(opacity),
          }),
        },
      }),
    );
  }

  const busOv = objs.paul_beaver_coach || {};
  const busLat = typeof busOv.lat === 'number' ? busOv.lat : 29.14176;
  const busLon = typeof busOv.lon === 'number' ? busOv.lon : -95.801859;
  const busHeading = typeof busOv.heading === 'number' ? busOv.heading : 45.0;
  const busScale = typeof busOv.scale === 'number' && busOv.scale > 0 ? busOv.scale : 1.0;
  const busOpacity = typeof busOv.opacity === 'number' ? busOv.opacity : 1.0;
  const busPos = Cesium.Cartesian3.fromDegrees(busLon, busLat, groundM + 1.8);
  entities.push(
    viewer.entities.add({
      id: 'birdpond_paul_beaver_coach',
      name: "Bird Pond · Paul's Beaver Monaco Coach",
      position: busPos,
      orientation: Cesium.Transforms.headingPitchRollQuaternion(
        busPos,
        new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(busHeading), 0, 0),
      ),
      model: {
        uri: `${BIRDPOND_BASE_URL}/models/monaco_beaver_coach.glb`,
        scale: busScale,
        color: Cesium.Color.WHITE.withAlpha(busOpacity),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    }),
  );
  governorRequestRender('pfl-birdpond-objects-sync');
}

export const HERO_BLOCK48_TRACTS = Object.freeze(
  new Set(['1', '2', '3', '4', '5', '6', '7', '7A']),
);

const HERO_PRIORITY = Object.freeze({
  '7': 100,
  '7A': 96,
  '6': 95,
  '5': 90,
  '4': 88,
  '3': 86,
  '2': 84,
  '1': 82,
});

export function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToSegmentSq(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return (px - x1) ** 2 + (py - y1) ** 2;
  const t = Math.max(
    0,
    Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)),
  );
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return (px - projX) ** 2 + (py - projY) ** 2;
}

function raySegmentHitMeters(ox, oy, dx, dy, x1, y1, x2, y2) {
  const sx = x2 - x1;
  const sy = y2 - y1;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-12) return Infinity;
  const qpx = x1 - ox;
  const qpy = y1 - oy;
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * dy - qpy * dx) / denom;
  if (t > 0.01 && u >= -1e-6 && u <= 1.000001) return t;
  return Infinity;
}

export function computeVisualBoxCenter(ring) {
  if (!ring || ring.length < 3) {
    return {
      lon: -95.8048,
      lat: 29.1391,
      areaSqM: 400,
      innerRadiusM: 10,
      dirClearanceM: new Float32Array(16).fill(10),
    };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < ring.length; i++) {
    if (ring[i][0] < minX) minX = ring[i][0];
    if (ring[i][0] > maxX) maxX = ring[i][0];
    if (ring[i][1] < minY) minY = ring[i][1];
    if (ring[i][1] > maxY) maxY = ring[i][1];
  }
  const cosLat = Math.cos(((minY + maxY) * 0.5 * Math.PI) / 180.0);
  const mPerDegLon = 111320.0 * cosLat;
  const mPerDegLat = 111320.0;

  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const x0 = ring[i][0] - minX;
    const y0 = ring[i][1] - minY;
    const x1 = ring[i + 1][0] - minX;
    const y1 = ring[i + 1][1] - minY;
    const cross = x0 * y1 - x1 * y0;
    a2 += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  const areaSqM = Math.abs(a2) * 0.5 * mPerDegLon * mPerDegLat;
  let candLon = (minX + maxX) * 0.5;
  let candLat = (minY + maxY) * 0.5;
  if (Math.abs(a2) > 1e-12) {
    candLon = minX + cx / (3 * a2);
    candLat = minY + cy / (3 * a2);
  }

  let bestLon = candLon;
  let bestLat = candLat;
  let bestDistSqM = -1;
  const steps = 24;
  const candidates = [[candLon, candLat]];
  for (let ix = 1; ix < steps; ix++) {
    for (let iy = 1; iy < steps; iy++) {
      candidates.push([
        minX + (maxX - minX) * (ix / steps),
        minY + (maxY - minY) * (iy / steps),
      ]);
    }
  }
  for (let c = 0; c < candidates.length; c++) {
    const [px, py] = candidates[c];
    if (!pointInRing(px, py, ring)) continue;
    let minEdgeSqM = Infinity;
    const pxM = px * mPerDegLon;
    const pyM = py * mPerDegLat;
    for (let e = 0; e < ring.length - 1; e++) {
      const dSq = distToSegmentSq(
        pxM,
        pyM,
        ring[e][0] * mPerDegLon,
        ring[e][1] * mPerDegLat,
        ring[e + 1][0] * mPerDegLon,
        ring[e + 1][1] * mPerDegLat,
      );
      if (dSq < minEdgeSqM) minEdgeSqM = dSq;
    }
    if (c === 0) minEdgeSqM *= 1.12;
    if (minEdgeSqM > bestDistSqM) {
      bestDistSqM = minEdgeSqM;
      bestLon = px;
      bestLat = py;
    }
  }

  const innerRadiusM = Math.max(3.5, Math.sqrt(Math.max(bestDistSqM, 0)));
  const ox = bestLon * mPerDegLon;
  const oy = bestLat * mPerDegLat;
  const dirClearanceM = new Float32Array(16);
  for (let k = 0; k < 16; k++) {
    const az = (k * Math.PI) / 8.0; // 0 = North (+Y), PI/2 = East (+X)
    const dx = Math.sin(az);
    const dy = Math.cos(az);
    let minHit = Infinity;
    for (let e = 0; e < ring.length - 1; e++) {
      const hit = raySegmentHitMeters(
        ox,
        oy,
        dx,
        dy,
        ring[e][0] * mPerDegLon,
        ring[e][1] * mPerDegLat,
        ring[e + 1][0] * mPerDegLon,
        ring[e + 1][1] * mPerDegLat,
      );
      if (hit < minHit) minHit = hit;
    }
    dirClearanceM[k] = Number.isFinite(minHit)
      ? Math.max(3.0, Math.min(minHit, 600.0))
      : innerRadiusM;
  }

  return { lon: bestLon, lat: bestLat, areaSqM, innerRadiusM, dirClearanceM };
}

function sampleChordMeters(dirClearanceM, azimuthRad) {
  const twoPi = Math.PI * 2.0;
  const norm = ((azimuthRad % twoPi) + twoPi) % twoPi;
  const idxA = Math.round((norm / twoPi) * 16) % 16;
  const idxB = (idxA + 8) % 16;
  return dirClearanceM[idxA] + dirClearanceM[idxB];
}

function formatConciseOwner(owner) {
  if (!owner) return '';
  if (owner.includes('UNITED STATES')) return 'USA';
  if (owner.includes('JORDY')) return 'Cindy Jordy';
  if (owner.includes('BRACEWELL')) return 'Paul Bracewell';
  if (owner.includes('SHETTY')) return 'Shetty';
  if (owner.includes('BARBER')) return 'Barber';
  if (owner.includes('CHALIN')) return 'Chalin';
  if (owner.includes('MEDINA')) return 'Medina';
  if (owner.includes('TONAN')) return 'Tonan';
  const words = owner.split(/[\s,&]+/).filter(Boolean);
  const base = words.slice(0, 2).join(' ');
  return base.length > 16 ? `${base.slice(0, 15)}…` : base;
}

function renderMicroTextCanvas(line1, line2, accentHex = '#fde047', isHero = false) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const dpr = 2; // HiDPI backing store, displayed at 1x CSS px so text is razor-sharp at 9-10px
  const f1Px = isHero ? 10.5 : 9.5;
  const f2Px = isHero ? 9.0 : 8.5;
  const f1 = `${isHero ? 800 : 700} ${f1Px}px "Segoe UI", system-ui, Arial, sans-serif`;
  const f2 = `600 ${f2Px}px "Segoe UI", system-ui, Arial, sans-serif`;

  ctx.font = f1;
  const w1 = ctx.measureText(line1).width;
  ctx.font = f2;
  const w2 = line2 ? ctx.measureText(line2).width : 0;

  const padX = 5;
  const padY = 3;
  const lineGap = 2;
  const cssW = Math.ceil(Math.max(w1, w2) + padX * 2);
  const cssH = Math.ceil(padY * 2 + f1Px + (line2 ? lineGap + f2Px : 0) + 2);

  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.scale(dpr, dpr);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  ctx.font = f1;
  ctx.strokeStyle = 'rgba(3, 7, 18, 0.96)';
  ctx.lineWidth = 3.0;
  ctx.strokeText(line1, cssW / 2, padY);
  ctx.fillStyle = accentHex;
  ctx.fillText(line1, cssW / 2, padY);

  if (line2) {
    const y2 = padY + f1Px + lineGap;
    ctx.font = f2;
    ctx.strokeStyle = 'rgba(3, 7, 18, 0.96)';
    ctx.lineWidth = 2.6;
    ctx.strokeText(line2, cssW / 2, y2);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(line2, cssW / 2, y2);
  }

  return { canvas, cssW, cssH };
}

export async function loadBrazoriaCadPlugin({
  viewer,
  signal,
  fetchImpl = globalThis.fetch,
} = {}) {
  const entities = [];
  const labelRecords = [];
  let removePreRender = null;
  let destroyed = false;

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    if (typeof removePreRender === 'function') {
      removePreRender();
      removePreRender = null;
    }
    for (const ent of entities) {
      viewer?.entities?.remove?.(ent);
    }
    entities.length = 0;
    labelRecords.length = 0;
    governorRequestRender('pfl-bcad-destroy');
  };

  if (!viewer || typeof fetchImpl !== 'function') {
    return { entities, destroy };
  }

  const response = await fetchImpl(BCAD_PARCELS_QUERY_URL, { signal });
  if (!response.ok) {
    throw new Error(`BCAD GIS HTTP ${response.status}`);
  }
  const data = await response.json();
  signal?.throwIfAborted?.();

  const placedAnchors = [];
  for (const f of data?.features || []) {
    const rings = f?.geometry?.rings;
    if (!rings?.length) continue;
    const attrs = f.attributes || {};
    const pidNum = Number(attrs.PID || 0);
    const pid = pidNum > 0 ? String(pidNum) : '';
    const tractName = String(attrs.NAME || '').trim().toUpperCase();
    if (!pid && !tractName) continue;

    const legalDesc = String(attrs.legal_desc || '').toUpperCase();
    const isBlock48 = legalDesc.includes('BLOCK 48') || legalDesc.includes('BLK 48');
    const isHero = isBlock48 && HERO_BLOCK48_TRACTS.has(tractName);
    const owner = String(attrs.py_owner_name || '').replace(/\s+/g, ' ').trim();
    const acNum = Number(attrs.legal_acreage || 0);
    const ac = acNum > 0 ? `${acNum.toFixed(acNum < 10 ? 2 : 1)}ac` : '';
    const val = attrs.appraised_val ? `$${Number(attrs.appraised_val).toLocaleString()}` : '';
    const situs = String(attrs.SITUS || '').replace(/\s+/g, ' ').trim();

    const descHtml = `
      <div style="font-family:system-ui,sans-serif;padding:10px;color:#e2e8f0;background:#0f172a;border-radius:8px;font-size:12px">
        <div style="font-weight:700;color:#fde047;font-size:14px;margin-bottom:4px">
          ${tractName ? `Tract ${tractName}` : `Parcel ${pid}`}${isBlock48 ? ' · Block 48' : ''}
        </div>
        <div><strong>PID:</strong> ${pid || 'N/A'}</div>
        <div><strong>Owner:</strong> ${owner || 'Unlisted'}</div>
        ${ac ? `<div><strong>Legal Acreage:</strong> ${ac}</div>` : ''}
        ${val ? `<div><strong>Appraised Value:</strong> ${val}</div>` : ''}
        ${situs ? `<div><strong>Situs:</strong> ${situs}</div>` : ''}
      </div>`;

    for (const ring of rings) {
      if (!ring || ring.length < 3) continue;
      const flat = [];
      for (const pt of ring) flat.push(pt[0], pt[1]);
      entities.push(
        viewer.entities.add({
          name: `BCAD ${tractName ? `Tract ${tractName}` : `PID ${pid}`}`,
          description: descHtml,
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(flat),
            width: isHero ? 2.6 : 1.5,
            material: Cesium.Color.fromCssColorString(isHero ? '#38bdf8' : '#0284c7').withAlpha(
              isHero ? 0.92 : 0.65,
            ),
            clampToGround: true,
          },
        }),
      );
    }

    if (rings[0]?.length > 2) {
      const ctr = computeVisualBoxCenter(rings[0]);
      const cosLat = Math.cos((ctr.lat * Math.PI) / 180.0);
      const nearExisting = placedAnchors.find((a) => {
        const dx = (a.lon - ctr.lon) * 111320.0 * cosLat;
        const dy = (a.lat - ctr.lat) * 111320.0;
        return Math.hypot(dx, dy) < 14.0;
      });
      if (nearExisting) continue;
      placedAnchors.push({ lon: ctr.lon, lat: ctr.lat });

      const tagText = tractName ? `Tr ${tractName}` : `PID ${pid}`;
      let detailLine1 = tagText;
      let detailLine2 = '';
      let accent = '#bae6fd';
      if (isHero) {
        accent = '#fde047';
        if (tractName === '7') {
          detailLine1 = 'Tr 7 · 7.33ac';
          detailLine2 = 'Ava 50% · Pepper · Kee';
        } else if (tractName === '6' || tractName === '7A') {
          detailLine1 = `Tr ${tractName} · 2.17ac`;
          detailLine2 = 'Paul Bracewell';
        } else {
          detailLine1 = `Tr ${tractName}${ac ? ` · ${ac}` : ''}`;
          detailLine2 = formatConciseOwner(owner);
        }
      } else if (isBlock48) {
        accent = '#fef08a';
        detailLine1 = tractName ? `Tr ${tractName}` : `PID ${pid}`;
        detailLine2 = formatConciseOwner(owner) || ac;
      } else {
        detailLine1 = tractName ? `Tr ${tractName}` : ac || `PID ${pid}`;
        detailLine2 = formatConciseOwner(owner);
      }

      const tagSprite = renderMicroTextCanvas(tagText, '', accent, isHero);
      const detailSprite = renderMicroTextCanvas(detailLine1, detailLine2, accent, isHero);
      if (!tagSprite || !detailSprite) continue;

      const posWC = Cesium.Cartesian3.fromDegrees(ctr.lon, ctr.lat, 1.8);
      const isRoadStrip = isHero && (tractName === '6' || tractName === '7A');
      const ent = viewer.entities.add({
        name: `BCAD ${tagText}`,
        description: descHtml,
        position: posWC,
        show: false,
        billboard: {
          image: tagSprite.canvas,
          width: tagSprite.cssW,
          height: tagSprite.cssH,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          disableDepthTestDistance: 1800,
        },
      });
      entities.push(ent);

      const priority =
        (isHero ? (HERO_PRIORITY[tractName] || 80) * 1e6 : isBlock48 ? 1e5 : 0) +
        Math.min(99999, ctr.areaSqM);

      labelRecords.push({
        ent,
        posWC,
        isHero,
        isBlock48,
        isRoadStrip,
        priority,
        dirClearanceM: ctr.dirClearanceM,
        tagSprite,
        detailSprite,
        mode: 0, // 0=hidden, 1=tag, 2=detail
      });
    }
  }

  labelRecords.sort((a, b) => b.priority - a.priority);

  if (viewer.scene?.preRender?.addEventListener) {
    const scratchWin = new Cesium.Cartesian2();
    const onPreRender = () => {
      if (destroyed || !labelRecords.length) return;
      const cam = viewer.camera;
      const carto = cam?.positionCartographic;
      const alt = carto ? carto.height : 500;
      const pitch = cam?.pitch ?? -1.0;
      const pitchDeg = Cesium.Math.toDegrees(pitch);
      const heading = cam?.heading ?? 0.0;

      if (alt < 42.0 || alt > 3200.0 || pitchDeg > -20.0) {
        for (let i = 0; i < labelRecords.length; i++) {
          if (labelRecords[i].ent.show) labelRecords[i].ent.show = false;
        }
        return;
      }

      const canvasW = viewer.canvas?.clientWidth || 1280;
      const canvasH = viewer.canvas?.clientHeight || 800;
      const fovy = cam?.frustum?.fovy || 1.0472;
      const focalPx = canvasH / (2.0 * Math.tan(fovy * 0.5));
      const sinPitch = Math.max(0.12, -Math.sin(pitch));
      const camPos = cam.positionWC;
      const occupied = [];
      const padX = 10;
      const padY = 7;

      const collides = (cx, cy, w, h) => {
        const l = cx - w * 0.5 - padX;
        const r = cx + w * 0.5 + padX;
        const t = cy - h * 0.5 - padY;
        const b = cy + h * 0.5 + padY;
        if (l < 6 || r > canvasW - 6 || t < 6 || b > canvasH - 6) return true;
        for (let j = 0; j < occupied.length; j++) {
          const o = occupied[j];
          if (l < o[2] && r > o[0] && t < o[3] && b > o[1]) return true;
        }
        return false;
      };

      for (let i = 0; i < labelRecords.length; i++) {
        const rec = labelRecords[i];
        const ent = rec.ent;
        const dist = Cesium.Cartesian3.distance(camPos, rec.posWC);
        const maxDist = rec.isHero ? 2600.0 : rec.isBlock48 ? 1400.0 : 900.0;
        if (dist > maxDist || dist < 20.0) {
          if (ent.show) ent.show = false;
          continue;
        }

        const win = Cesium.SceneTransforms.worldToWindowCoordinates(
          viewer.scene,
          rec.posWC,
          scratchWin,
        );
        if (!win || !Number.isFinite(win.x) || !Number.isFinite(win.y)) {
          if (ent.show) ent.show = false;
          continue;
        }

        const chordRightM = sampleChordMeters(rec.dirClearanceM, heading + Math.PI * 0.5);
        const chordFwdM = sampleChordMeters(rec.dirClearanceM, heading);
        let availW = (chordRightM / dist) * focalPx * 0.76;
        let availH = ((chordFwdM * sinPitch) / dist) * focalPx * 0.76;

        if (rec.isRoadStrip) {
          const alongPx = (Math.max(chordRightM, chordFwdM) / dist) * focalPx;
          availW = Math.max(availW, Math.min(48, alongPx * 0.28));
          availH = Math.max(availH, 16);
        }

        const detW = rec.detailSprite.cssW;
        const detH = rec.detailSprite.cssH;
        const tagW = rec.tagSprite.cssW;
        const tagH = rec.tagSprite.cssH;

        let chosenMode = 0;
        let drawW = 0;
        let drawH = 0;

        if (
          !rec.isRoadStrip &&
          availW >= detW * 1.15 &&
          availH >= detH * 1.15 &&
          !collides(win.x, win.y, detW, detH)
        ) {
          chosenMode = 2;
          drawW = detW;
          drawH = detH;
        } else if (
          availW >= tagW * (rec.isHero ? 0.85 : 1.05) &&
          availH >= tagH * (rec.isHero ? 0.85 : 1.05) &&
          !collides(win.x, win.y, tagW, tagH)
        ) {
          chosenMode = 1;
          drawW = tagW;
          drawH = tagH;
        }

        if (chosenMode === 0) {
          if (ent.show) ent.show = false;
          continue;
        }

        if (rec.mode !== chosenMode) {
          rec.mode = chosenMode;
          const spr = chosenMode === 2 ? rec.detailSprite : rec.tagSprite;
          ent.billboard.image = spr.canvas;
          ent.billboard.width = spr.cssW;
          ent.billboard.height = spr.cssH;
        }
        if (!ent.show) ent.show = true;
        occupied.push([
          win.x - drawW * 0.5,
          win.y - drawH * 0.5,
          win.x + drawW * 0.5,
          win.y + drawH * 0.5,
        ]);
      }
    };
    viewer.scene.preRender.addEventListener(onPreRender);
    removePreRender = () => {
      viewer.scene?.preRender?.removeEventListener?.(onPreRender);
    };
  }

  try {
    await syncBirdPondObjects({
      viewer,
      fetchImpl,
      signal,
      entities,
      isDestroyed: () => destroyed,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    console.warn('[PFL BirdPond] Live 3D object sync skipped:', err);
  }

  governorRequestRender('pfl-bcad-load');
  return { entities, destroy };
}
