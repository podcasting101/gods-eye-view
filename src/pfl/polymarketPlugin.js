import * as Cesium from 'cesium';
import { governorRequestRender } from '../renderGovernor.js';

/**
 * God's Eye View Real-Time Polymarket Prediction Odds Layer (`src/pfl/polymarketPlugin.js`).
 *
 * Fetches `/gev-intel/polymarket-radar.json` (built from Polymarket Gamma API by
 * `scripts/build_gev_polymarket_radar.py`) and renders geocoded world-event markets
 * onto a dedicated `Cesium.CustomDataSource`.
 *
 * Strictly complies with `noCesiumLabels.test.mjs`: zero Cesium Label/LabelGraphics
 * usage — all markers render crisp `<canvas>` badge billboards plus glowing points.
 */

export const POLYMARKET_RADAR_URL = '/gev-intel/polymarket-radar.json';

const CATEGORY_COLORS = Object.freeze({
  geopolitics: '#f97316',
  politics: '#38bdf8',
  markets: '#22c55e',
  macro: '#10b981',
  tech: '#a855f7',
  space: '#facc15',
  energy: '#ef4444',
  crypto: '#eab308',
  trade: '#14b8a6',
});

export function formatUsdCompact(value) {
  const num = Number(value) || 0;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

export function formatMarkerPct(yesPrice) {
  const pct = Math.max(0, Math.min(100, (Number(yesPrice) || 0) * 100));
  return pct >= 10 || pct === 0 ? `${pct.toFixed(0)}%` : `${pct.toFixed(1)}%`;
}

export function makePolymarketBadgeCanvas(marker) {
  if (typeof document === 'undefined') return null;
  const accent = CATEGORY_COLORS[marker?.category] || '#38bdf8';
  const canvas = document.createElement('canvas');
  canvas.width = 340;
  canvas.height = 76;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = 'rgba(10, 15, 28, 0.90)';
  ctx.beginPath();
  ctx.roundRect(3, 3, 334, 70, 10);
  ctx.fill();

  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.roundRect(3, 3, 334, 70, 10);
  ctx.stroke();

  // Odds pill on right
  const pctText = formatMarkerPct(marker?.yesPrice);
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(262, 10, 64, 24, 6);
  ctx.fill();

  ctx.fillStyle = '#090d18';
  ctx.font = '800 13px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pctText, 294, 22);

  // Region header
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = accent;
  ctx.font = '800 11px "JetBrains Mono", monospace';
  const regionTag = `POLY · ${String(marker?.region || 'GLOBAL').toUpperCase()}`;
  ctx.fillText(regionTag.slice(0, 32), 12, 11);

  // Market title
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 14px "Inter", system-ui, sans-serif';
  ctx.fillText(String(marker?.title || 'Prediction Market').slice(0, 38), 12, 30);

  // Volume & Outcome footer
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 11px "JetBrains Mono", monospace';
  const volText = `24H ${formatUsdCompact(marker?.volume24hr)} · ${String(marker?.topOutcome || 'Yes').slice(0, 28)}`;
  ctx.fillText(volText, 12, 52);

  return canvas;
}

function buildMarkerDescriptionHtml(marker) {
  const pct = formatMarkerPct(marker?.yesPrice);
  const accent = CATEGORY_COLORS[marker?.category] || '#38bdf8';
  const url = String(marker?.url || 'https://polymarket.com').replace(/"/g, '&quot;');
  return `
    <div style="font-family:system-ui,sans-serif;padding:12px;color:#e2e8f0;background:#0f172a;border-radius:8px">
      <div style="font-size:11px;font-weight:700;color:${accent};letter-spacing:.06em;text-transform:uppercase">
        Polymarket Real-Time Odds · ${marker?.region || 'Global'}
      </div>
      <h2 style="margin:6px 0 8px;font-size:15px;color:#f8fafc">${marker?.title || ''}</h2>
      <p style="margin:0 0 6px;font-size:13px">
        <strong>Lead Contract:</strong> ${marker?.topOutcome || 'Yes'} —
        <span style="color:${accent};font-weight:700">${pct} implied</span>
      </p>
      <p style="margin:0 0 8px;font-size:12px;color:#94a3b8">
        <strong>24h Volume:</strong> ${formatUsdCompact(marker?.volume24hr)} &nbsp;|&nbsp;
        <strong>Liquidity:</strong> ${formatUsdCompact(marker?.liquidity)}
      </p>
      <a href="${url}" target="_blank" rel="noopener noreferrer"
         style="display:inline-block;padding:6px 10px;background:${accent};color:#090d18;font-weight:700;border-radius:6px;text-decoration:none;font-size:12px">
        Open Market on Polymarket
      </a>
    </div>`;
}

export async function loadPolymarketPlugin({
  viewer,
  signal,
  fetchImpl = typeof fetch === 'function' ? fetch : null,
  radarUrl = POLYMARKET_RADAR_URL,
} = {}) {
  if (!viewer || !fetchImpl) {
    return { count: 0, destroy: () => {} };
  }

  let dataSource = null;
  let destroyed = false;

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    if (dataSource && viewer.dataSources?.contains?.(dataSource)) {
      viewer.dataSources.remove(dataSource, true);
    }
    dataSource = null;
    governorRequestRender('pfl-polymarket-destroy');
  };

  try {
    const res = await fetchImpl(`${radarUrl}?_t=${Date.now()}`, { signal });
    signal?.throwIfAborted?.();
    if (!res?.ok) return { count: 0, destroy };

    const payload = await res.json();
    if (destroyed || !Array.isArray(payload?.markers)) return { count: 0, destroy };

    dataSource = new Cesium.CustomDataSource('pfl-polymarket-radar');
    const displayCond = new Cesium.DistanceDisplayCondition(45000, 35000000);
    const scaleDist = new Cesium.NearFarScalar(80000, 1.0, 14000000, 0.55);

    for (const marker of payload.markers) {
      const lat = Number(marker?.lat);
      const lon = Number(marker?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const accentHex = CATEGORY_COLORS[marker?.category] || '#38bdf8';
      const badgeCanvas = makePolymarketBadgeCanvas(marker);

      dataSource.entities.add({
        id: String(marker.id || `poly-${lat}-${lon}`),
        name: `Polymarket · ${marker.title}`,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 12000),
        point: {
          pixelSize: 9,
          color: Cesium.Color.fromCssColorString(accentHex),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          distanceDisplayCondition: displayCond,
        },
        billboard: badgeCanvas
          ? {
              image: badgeCanvas,
              width: 220,
              height: 49,
              pixelOffset: new Cesium.Cartesian2(0, -32),
              distanceDisplayCondition: displayCond,
              scaleByDistance: scaleDist,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            }
          : undefined,
        description: buildMarkerDescriptionHtml(marker),
      });
    }

    await viewer.dataSources.add(dataSource);
    signal?.throwIfAborted?.();
    governorRequestRender('pfl-polymarket-load');
    return {
      count: dataSource.entities.values.length,
      dataSource,
      destroy,
    };
  } catch (error) {
    destroy();
    throw error;
  }
}
