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
 * Architectural note: Renders crisp HTML5 <canvas> billboard badges rather than
 * Cesium LabelGraphics so `noCesiumLabels.test.mjs` and GEV world-overlay rules
 * remain 100% satisfied while scaling up cleanly as the camera zooms to ground.
 */

export const BCAD_PARCELS_QUERY_URL =
  'https://arcgis-web.brazoriacountytx.gov/arcgis/rest/services/general/Parcels/MapServer/1/query' +
  '?geometry=-95.814,29.132,-95.794,29.148&geometryType=esriGeometryEnvelope&inSR=4326' +
  '&spatialRel=esriSpatialRelIntersects' +
  '&outFields=PID,NAME,py_owner_name,legal_acreage,appraised_val,SITUS,DOCUMENT,legal_desc' +
  '&outSR=4326&f=json';

export const BIRDPOND_LAYOUT_URL =
  'https://elitespyworlds.com/birdpond/save_layout.php';

export const HERO_BLOCK48_TRACTS = Object.freeze(
  new Set(['1', '2', '3', '4', '5', '6', '7', '7A']),
);

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

export function computeVisualBoxCenter(ring) {
  if (!ring || ring.length < 3) return { lon: -95.8048, lat: 29.1391 };
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
  let candLon = (minX + maxX) * 0.5;
  let candLat = (minY + maxY) * 0.5;
  if (Math.abs(a2) > 1e-12) {
    candLon = minX + cx / (3 * a2);
    candLat = minY + cy / (3 * a2);
  }
  let bestLon = candLon;
  let bestLat = candLat;
  let bestDist = -1;
  const steps = 14;
  const candidates = [[candLon, candLat]];
  for (let ix = 1; ix < steps; ix++) {
    for (let iy = 1; iy < steps; iy++) {
      candidates.push([
        minX + (maxX - minX) * (ix / steps),
        minY + (maxY - minY) * (iy / steps),
      ]);
    }
  }
  const cosLat = Math.cos(((minY + maxY) * 0.5 * Math.PI) / 180.0);
  for (let c = 0; c < candidates.length; c++) {
    const [px, py] = candidates[c];
    if (!pointInRing(px, py, ring)) continue;
    let minEdgeSq = Infinity;
    for (let e = 0; e < ring.length - 1; e++) {
      const dSq = distToSegmentSq(
        px * cosLat,
        py,
        ring[e][0] * cosLat,
        ring[e][1],
        ring[e + 1][0] * cosLat,
        ring[e + 1][1],
      );
      if (dSq < minEdgeSq) minEdgeSq = dSq;
    }
    if (c === 0) minEdgeSq *= 1.25;
    if (minEdgeSq > bestDist) {
      bestDist = minEdgeSq;
      bestLon = px;
      bestLat = py;
    }
  }
  return { lon: bestLon, lat: bestLat };
}

function renderBadgeCanvas(line1, line2, accentHex = '#fde047', isHero = false) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const f1 = isHero
    ? '900 28px "Arial Black", "Segoe UI", sans-serif'
    : '800 22px "Segoe UI", Arial, sans-serif';
  const f2 = isHero
    ? '700 19px "Segoe UI", Arial, sans-serif'
    : '600 18px "Segoe UI", Arial, sans-serif';
  ctx.font = f1;
  const w1 = ctx.measureText(line1).width;
  ctx.font = f2;
  const w2 = line2 ? ctx.measureText(line2).width : 0;
  const padX = 20;
  const padY = 12;
  canvas.width = Math.ceil(Math.max(w1, w2) + padX * 2);
  canvas.height = line2 ? (isHero ? 78 : 68) : 46;

  ctx.fillStyle = 'rgba(8, 15, 30, 0.82)';
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = isHero ? 3 : 2;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(2, 2, canvas.width - 4, canvas.height - 4, 10);
  else ctx.rect(2, 2, canvas.width - 4, canvas.height - 4);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = f1;
  ctx.fillStyle = accentHex;
  ctx.fillText(line1, canvas.width / 2, padY - 2);
  if (line2) {
    ctx.font = f2;
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(line2, canvas.width / 2, isHero ? 44 : 38);
  }
  return canvas;
}

export async function loadBrazoriaCadPlugin({ viewer, signal, fetchImpl = globalThis.fetch } = {}) {
  const entities = [];
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    for (const ent of entities) {
      viewer?.entities?.remove?.(ent);
    }
    entities.length = 0;
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

  const labeledCenters = new Set();
  for (const f of data?.features || []) {
    const rings = f?.geometry?.rings;
    if (!rings?.length) continue;
    const attrs = f.attributes || {};
    const pid = attrs.PID || '';
    const tractName = String(attrs.NAME || '').trim().toUpperCase();
    const legalDesc = String(attrs.legal_desc || '').toUpperCase();
    const isBlock48 = legalDesc.includes('BLOCK 48') || legalDesc.includes('BLK 48');
    const isHero = isBlock48 && HERO_BLOCK48_TRACTS.has(tractName);
    const owner = String(attrs.py_owner_name || '').replace(/\s+/g, ' ').trim();
    const shortOwner = owner.length > 34 ? `${owner.slice(0, 34)}…` : owner;
    const ac = attrs.legal_acreage ? `${Number(attrs.legal_acreage).toFixed(2)} ac` : '';
    const val = attrs.appraised_val ? `$${Number(attrs.appraised_val).toLocaleString()}` : '';
    const situs = String(attrs.SITUS || '').replace(/\s+/g, ' ').trim();

    for (const ring of rings) {
      if (!ring || ring.length < 3) continue;
      const flat = [];
      for (const pt of ring) flat.push(pt[0], pt[1]);
      entities.push(
        viewer.entities.add({
          name: `BCAD PID ${pid}`,
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(flat),
            width: isHero ? 3.2 : 2.0,
            material: Cesium.Color.fromCssColorString(isHero ? '#38bdf8' : '#0284c7').withAlpha(
              isHero ? 0.95 : 0.72,
            ),
            clampToGround: true,
          },
        }),
      );
    }

    if (rings[0]?.length > 2 && (pid || tractName)) {
      const ctr = computeVisualBoxCenter(rings[0]);
      const dedupKey = `${tractName}:${ctr.lon.toFixed(5)}:${ctr.lat.toFixed(5)}`;
      if (labeledCenters.has(dedupKey)) continue;
      labeledCenters.add(dedupKey);

      let line1 = '';
      let line2 = '';
      let accent = '#bae6fd';
      let maxDist = 1800;
      if (isHero) {
        line1 = `TRACT ${tractName}`;
        line2 =
          tractName === '7'
            ? 'AVA 50% · PEPPER · KEE · PAUL · 7.33 ac'
            : tractName === '6' || tractName === '7A'
              ? `PAUL EDWIN BRACEWELL III · ${ac || '2.17 ac'}`
              : `${shortOwner || `PID ${pid}`}${ac ? ` · ${ac}` : ''}`;
        accent = '#fde047';
        maxDist = 5200;
      } else if (isBlock48 && tractName) {
        line1 = `TRACT ${tractName}${ac ? ` · ${ac}` : ''}${val ? ` · ${val}` : ''}`;
        line2 = `${shortOwner || `PID ${pid}`}${situs ? ` · ${situs}` : ''}`;
        accent = '#fef08a';
        maxDist = 3200;
      } else {
        line1 = `${tractName ? `Tr ${tractName} · ` : ''}${ac || `PID ${pid}`}${val ? ` · ${val}` : ''}`;
        line2 = `${shortOwner || `PID ${pid}`}${situs ? ` · ${situs}` : ''}`;
      }

      const badge = renderBadgeCanvas(line1, line2, accent, isHero);
      if (badge) {
        entities.push(
          viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(ctr.lon, ctr.lat, 3.0),
            billboard: {
              image: badge,
              verticalOrigin: Cesium.VerticalOrigin.CENTER,
              horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
              scaleByDistance: new Cesium.NearFarScalar(14, 1.15, 1800, 0.32),
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, maxDist),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          }),
        );
      }
    }
  }

  governorRequestRender('pfl-bcad-load');
  return { entities, destroy };
}
