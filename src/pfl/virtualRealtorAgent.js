/**
 * PFL Virtual Real Estate Agent & Sold Comps (God's Eye View).
 *
 * Self-mounting movable/minimizable HUD (#pfl-win-virtual-realtor) + launcher
 * (#pfl-btn-virtual-realtor, appended to #pfl-win-command-dock .pfl-std-body
 * when present). Data: /api/pfl/real-estate/comps (live BCAD deed transfers +
 * curated MLS/HAR sold comps + broker metrics).
 *
 * 3D pins are crisp <canvas> billboard signs + translucent ground rings.
 * NO Cesium text labels (see src/noCesiumLabels.test.mjs).
 */
import * as Cesium from 'cesium';
import { governorRequestRender } from '../renderGovernor.js';
import { inputFor } from '../input/dispatcher.js';

export const REALTOR_API = '/api/pfl/real-estate/comps';
export const REALTOR_SITES = Object.freeze(['liverpool', 'sweeny']);
const SITE_TITLES = { liverpool: '🏡 Liverpool', sweeny: '🌿 Sweeny' };
const FALLBACK_GROUND_M = { liverpool: -26.19, sweeny: -17.5 };
const KIND_STYLE = {
  sold: { fill: '#16a34a', edge: '#bbf7d0', ring: '#22c55e' },
  deed: { fill: '#d97706', edge: '#fde68a', ring: '#f59e0b' },
  comp: { fill: '#0891b2', edge: '#a5f3fc', ring: '#22d3ee' },
  subject: { fill: '#ca8a04', edge: '#fef08a', ring: '#facc15' },
  tract: { fill: '#7c3aed', edge: '#ddd6fe', ring: '#a78bfa' },
  neighbor: { fill: '#475569', edge: '#cbd5e1', ring: '#94a3b8' },
};

// ---------------------------------------------------------------- pure helpers

export const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

export const money = (n) =>
  Number.isFinite(Number(n)) && Number(n) > 0
    ? `$${Math.round(Number(n)).toLocaleString('en-US')}`
    : '—';

/** Radius (m) of a circle with the parcel's acreage; clamped for visibility. */
export function ringRadiusMeters(acres) {
  const a = Number(acres);
  const r = Number.isFinite(a) && a > 0 ? Math.sqrt((a * 4046.8564224) / Math.PI) : 0;
  return Math.min(120, Math.max(12, r));
}

/** Facts shown on a comp's tour brief. */
export function compFacts(comp) {
  const price = comp?.valueUsd || 0;
  const valueLabel =
    comp?.valueType === 'sold'
      ? 'Sold Price'
      : comp?.valueType === 'comp-value'
        ? 'Comp Value'
        : 'Appraised Value';
  const perSqft = comp?.price && comp?.sqft ? Math.round(comp.price / comp.sqft) : null;
  const perAcre =
    price && comp?.acres ? Math.round((comp.price || comp.appraised) / comp.acres) : null;
  return {
    valueLabel,
    value: price,
    appraised: comp?.appraised || 0,
    deed: comp?.instrument
      ? `${comp.instrument}${comp.deedYear ? ` (${comp.deedYear})` : ''}`
      : '—',
    acres: comp?.acres || null,
    sqft: comp?.sqft || null,
    soldDate: comp?.soldDate || null,
    estTax: comp?.estTaxPerYear || 0,
    perSqft,
    perAcre,
    owner: comp?.owner || '',
  };
}

/** Lisa/Harry per-property tour brief (plain text, safe for speech + clipboard). */
export function buildBrokerBrief(comp, metrics) {
  const f = compFacts(comp);
  const bits = [];
  bits.push(`${comp.address}.`);
  if (comp.kind === 'sold')
    bits.push(
      `Closed ${f.soldDate || 'recently'} at ${money(f.value)}${f.perSqft ? `, about ${f.perSqft} dollars per square foot` : ''}${comp.waterfront ? ', waterfront' : ''}.`,
    );
  else if (comp.kind === 'subject')
    bits.push(
      `Subject flagship: ${f.sqft?.toLocaleString?.() || ''} square feet on ${f.acres} acres, county appraised at ${money(f.appraised)}.`,
    );
  else if (comp.kind === 'tract')
    bits.push(
      `${f.acres} acres at ${money(comp.pricePerAcre)} per acre implies ${money(f.value)}. Our target for the Ava fifty percent is ${money(comp.targetPrice)}.`,
    );
  else if (comp.kind === 'deed')
    bits.push(
      `Recorded deed ${f.deed}, county appraised at ${money(f.appraised)}${f.acres ? ` on ${f.acres} acres` : ''}.`,
    );
  else bits.push(`County appraised at ${money(f.appraised)}${comp.waterfront ? ', waterfront comp' : ''}.`);
  if (f.estTax) bits.push(`Estimated taxes about ${money(f.estTax)} a year.`);
  if (metrics?.waterfrontPremiumPct != null && comp.waterfront)
    bits.push(`Waterfront carries roughly a ${metrics.waterfrontPremiumPct} percent premium per square foot.`);
  const speech = bits.join(' ');
  const lisa = metrics?.pitch?.lisa || '';
  const harry = metrics?.pitch?.harry || '';
  const text = [
    '👑 Lisa Muse / 🕵️ Harry — Virtual Realtor Tour Brief',
    speech,
    f.owner ? `Owner of record: ${f.owner}.` : '',
    lisa,
    harry,
    `BCAD: ${comp.bcadUrl}`,
  ]
    .filter(Boolean)
    .join('\n');
  return { speech, text, facts: f };
}

/** Plain text spoken by Web Speech: strip emoji + URLs. */
export function speechSafe(text) {
  return String(text || '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Paint a crisp pin sign (pill + pointer) and return a data URL. Browser only. */
export function renderSignDataUrl(text, kind, doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return '';
  const style = KIND_STYLE[kind] || KIND_STYLE.neighbor;
  const scale = 2;
  const w = 168 * scale;
  const h = 56 * scale;
  const canvas = doc.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.scale(scale, scale);
  const pw = 168;
  const ph = 40;
  const r = 10;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(pw, 0, pw, ph, r);
  ctx.arcTo(pw, ph, 0, ph, r);
  ctx.lineTo(pw / 2 + 8, ph);
  ctx.lineTo(pw / 2, ph + 12);
  ctx.lineTo(pw / 2 - 8, ph);
  ctx.arcTo(0, ph, 0, 0, r);
  ctx.arcTo(0, 0, pw, 0, r);
  ctx.closePath();
  ctx.fillStyle = style.fill;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = style.edge;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 20;
  ctx.font = `800 ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  while (ctx.measureText(text).width > pw - 16 && size > 11) {
    size -= 1;
    ctx.font = `800 ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  }
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 3;
  ctx.fillText(text, pw / 2, ph / 2 + 1);
  return canvas.toDataURL('image/png');
}

/** Absolute ellipsoid base height for a site when the globe is hidden. */
export function groundBaseFor(viewer, comp) {
  const globeOn = viewer?.scene?.globe?.show !== false;
  if (globeOn) return { reference: 'ground', height: 0 };
  return { reference: 'none', height: FALLBACK_GROUND_M[comp.site] ?? FALLBACK_GROUND_M.liverpool };
}

// --------------------------------------------------------------------- styles

const STYLE_ID = 'pfl-virtual-realtor-style';
const CSS = `
#pfl-win-virtual-realtor{position:fixed;right:18px;top:58px;width:460px;max-height:82vh;display:none;flex-direction:column;z-index:1190;
 background:rgba(8,13,24,.96);border:1px solid rgba(250,204,21,.45);border-radius:10px;color:#e2e8f0;
 font:12px/1.4 'Inter',system-ui,sans-serif;box-shadow:0 10px 36px rgba(0,0,0,.6);backdrop-filter:blur(6px)}
#pfl-win-virtual-realtor.pfl-vr-open{display:flex}
#pfl-win-virtual-realtor .pfl-vr-hdr{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;cursor:grab;user-select:none;
 background:linear-gradient(90deg,rgba(30,22,4,.98),rgba(41,32,8,.95));border-bottom:1px solid rgba(250,204,21,.35);font-weight:800;color:#facc15;letter-spacing:.03em}
#pfl-win-virtual-realtor .pfl-vr-hdr:active{cursor:grabbing}
#pfl-win-virtual-realtor .pfl-vr-cbtn,#pfl-win-virtual-realtor .pfl-vr-btn{background:rgba(15,23,42,.9);border:1px solid rgba(148,163,184,.4);color:#e2e8f0;
 border-radius:6px;padding:3px 8px;font-size:11px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-block}
#pfl-win-virtual-realtor .pfl-vr-cbtn:hover,#pfl-win-virtual-realtor .pfl-vr-btn:hover{border-color:#facc15;color:#facc15}
#pfl-win-virtual-realtor .pfl-vr-btn.active{background:rgba(250,204,21,.18);border-color:#facc15;color:#facc15}
#pfl-win-virtual-realtor.pfl-vr-min .pfl-vr-body{display:none}
#pfl-win-virtual-realtor .pfl-vr-body{overflow:auto;padding:8px 10px;display:flex;flex-direction:column;gap:8px}
#pfl-win-virtual-realtor .pfl-vr-tabs{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
#pfl-win-virtual-realtor .pfl-vr-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
#pfl-win-virtual-realtor .pfl-vr-metric{background:rgba(30,41,59,.7);border:1px solid rgba(71,85,105,.6);border-radius:6px;padding:4px 6px}
#pfl-win-virtual-realtor .pfl-vr-metric b{display:block;font-size:13px;color:#fde68a}
#pfl-win-virtual-realtor .pfl-vr-metric span{font-size:10px;color:#94a3b8}
#pfl-win-virtual-realtor table{width:100%;border-collapse:collapse;font-size:11px}
#pfl-win-virtual-realtor th{text-align:left;color:#94a3b8;font-weight:700;padding:2px 4px;position:sticky;top:0;background:rgba(8,13,24,.98)}
#pfl-win-virtual-realtor td{padding:3px 4px;border-top:1px solid rgba(51,65,85,.6)}
#pfl-win-virtual-realtor tr.pfl-vr-row{cursor:pointer}
#pfl-win-virtual-realtor tr.pfl-vr-row:hover,#pfl-win-virtual-realtor tr.pfl-vr-row.sel{background:rgba(250,204,21,.12)}
#pfl-win-virtual-realtor .pfl-vr-tbl{max-height:190px;overflow:auto;border:1px solid rgba(51,65,85,.6);border-radius:6px}
#pfl-win-virtual-realtor .pfl-vr-tag{display:inline-block;padding:0 6px;border-radius:999px;font-weight:800;font-size:10px;color:#fff}
#pfl-win-virtual-realtor .pfl-vr-brief{border:1px solid rgba(250,204,21,.4);border-radius:8px;padding:8px;background:rgba(30,22,4,.55)}
#pfl-win-virtual-realtor .pfl-vr-facts{display:grid;grid-template-columns:1fr 1fr;gap:3px 10px;margin:6px 0}
#pfl-win-virtual-realtor .pfl-vr-facts div span{color:#94a3b8}
#pfl-win-virtual-realtor .pfl-vr-pitch{white-space:pre-wrap;color:#cbd5e1;margin:4px 0}
#pfl-win-virtual-realtor .pfl-vr-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
#pfl-win-virtual-realtor .pfl-vr-status{color:#94a3b8;font-size:10px}
#pfl-btn-virtual-realtor.pfl-f15-btn{border-color:#facc15;color:#fde68a;font-weight:700}
#pfl-btn-virtual-realtor.active{background:rgba(250,204,21,.2)}
#pfl-btn-virtual-realtor.pfl-vr-floating{position:fixed;left:18px;bottom:44px;z-index:1180;background:rgba(15,23,42,.92);border:1px solid #facc15;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:11px}
`;

// -------------------------------------------------------------------- the agent

export function initVirtualRealtorAgent(viewer, options = {}) {
  const noop = { destroy() {}, open() {}, toggle() {}, select() {}, getState: () => ({}) };
  if (typeof document === 'undefined' || typeof window === 'undefined' || !viewer) return noop;
  try {
    window.__pflVirtualRealtor?.destroy?.();
  } catch {
    /* previous instance already gone */
  }

  const fetchImpl = options.fetchImpl || ((...a) => fetch(...a));
  const storageKey = 'pfl_virtual_realtor_v1';
  const state = {
    enabled: false,
    minimized: false,
    site: 'liverpool',
    data: {},
    selectedId: null,
    loading: false,
    error: '',
    speaking: false,
  };
  let destroyed = false;
  const pinEntities = [];
  let highlight = null;
  const signCache = new Map();
  const disposers = [];

  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch {
      return {};
    }
  })();
  const persist = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ left: saved.left, top: saved.top }));
    } catch {
      /* storage unavailable */
    }
  };
  const render = () => {
    try {
      governorRequestRender('pfl-virtual-realtor');
    } catch {
      viewer.scene?.requestRender?.();
    }
  };

  // ---- DOM
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.id = 'pfl-win-virtual-realtor';
  panel.innerHTML = `
    <div class="pfl-vr-hdr">
      <span>🏡 VIRTUAL REALTOR · SOLD COMPS</span>
      <span style="display:flex;gap:4px">
        <button type="button" class="pfl-vr-cbtn" data-act="refresh" title="Reload live BCAD deeds">⟳</button>
        <button type="button" class="pfl-vr-cbtn" data-act="min" title="Minimize / restore">—</button>
        <button type="button" class="pfl-vr-cbtn" data-act="close" title="Turn off sold comps">✕</button>
      </span>
    </div>
    <div class="pfl-vr-body">
      <div class="pfl-vr-tabs" id="pfl-vr-tabs"></div>
      <div class="pfl-vr-metrics" id="pfl-vr-metrics"></div>
      <div class="pfl-vr-tbl"><table><thead><tr><th>Pin</th><th>Address</th><th>Value</th><th>Ac</th></tr></thead><tbody id="pfl-vr-rows"></tbody></table></div>
      <div class="pfl-vr-brief" id="pfl-vr-brief"></div>
      <div class="pfl-vr-status" id="pfl-vr-status"></div>
    </div>`;
  if (Number.isFinite(saved.left)) panel.style.left = `${saved.left}px`;
  if (Number.isFinite(saved.top)) {
    panel.style.top = `${saved.top}px`;
  }
  if (Number.isFinite(saved.left)) panel.style.right = 'auto';
  document.body.appendChild(panel);

  const $ = (sel) => panel.querySelector(sel);
  const tabsEl = $('#pfl-vr-tabs');
  const metricsEl = $('#pfl-vr-metrics');
  const rowsEl = $('#pfl-vr-rows');
  const briefEl = $('#pfl-vr-brief');
  const statusEl = $('#pfl-vr-status');

  // ---- launcher button
  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.id = 'pfl-btn-virtual-realtor';
  launcher.className = 'pfl-f15-btn';
  launcher.title = 'Toggle 3D sold/deed comp pins + Virtual Realtor panel';
  const syncLauncher = () => {
    launcher.textContent = `🏡 Sold Comps & Virtual Realtor: ${state.enabled ? 'ON' : 'OFF'}`;
    launcher.classList.toggle('active', state.enabled);
  };
  syncLauncher();
  launcher.addEventListener('click', () => toggle());

  const mountLauncher = () => {
    const body = document.querySelector('#pfl-win-command-dock .pfl-std-body');
    if (!body) return false;
    if (launcher.parentElement !== body) {
      launcher.classList.remove('pfl-vr-floating');
      body.appendChild(launcher);
    }
    return true;
  };
  let observer = null;
  let floatTimer = null;
  let giveUpTimer = null;
  if (!mountLauncher()) {
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => {
        if (mountLauncher()) {
          observer?.disconnect();
          observer = null;
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      giveUpTimer = setTimeout(() => {
        observer?.disconnect();
        observer = null;
      }, 180000);
    }
    // Command dock may never appear (e.g. framework disabled): keep a floating launcher.
    floatTimer = setTimeout(() => {
      if (!destroyed && !launcher.isConnected) {
        launcher.classList.add('pfl-vr-floating');
        document.body.appendChild(launcher);
      }
    }, 15000);
  }

  // ---- 3D entities
  const compEntityPosition = (comp) => {
    const base = groundBaseFor(viewer, comp);
    return { base, position: Cesium.Cartesian3.fromDegrees(comp.lon, comp.lat, base.height) };
  };
  const heightRef = (base) =>
    base.reference === 'ground'
      ? Cesium.HeightReference.RELATIVE_TO_GROUND
      : Cesium.HeightReference.NONE;

  function signFor(comp) {
    const key = `${comp.kind}|${comp.badge}`;
    if (!signCache.has(key)) signCache.set(key, renderSignDataUrl(comp.badge, comp.kind));
    return signCache.get(key);
  }

  function clearPins() {
    for (const ent of pinEntities.splice(0)) {
      try {
        viewer.entities.remove(ent);
      } catch {
        /* already removed */
      }
    }
    if (highlight) {
      try {
        viewer.entities.remove(highlight);
      } catch {
        /* already removed */
      }
      highlight = null;
    }
  }

  function buildPins() {
    clearPins();
    if (!state.enabled) return;
    for (const site of REALTOR_SITES) {
      for (const comp of state.data[site]?.comps || []) {
        if (!Number.isFinite(comp.lat) || !Number.isFinite(comp.lon)) continue;
        const style = KIND_STYLE[comp.kind] || KIND_STYLE.neighbor;
        const { base, position } = compEntityPosition({ ...comp, site });
        const ref = heightRef(base);
        const ring = viewer.entities.add({
          id: `pfl-realtor-ring-${site}-${comp.id}`,
          name: `Parcel ring ${comp.address}`,
          position,
          ellipse: {
            semiMajorAxis: ringRadiusMeters(comp.kind === 'neighbor' ? 0.2 : comp.acres),
            semiMinorAxis: ringRadiusMeters(comp.kind === 'neighbor' ? 0.2 : comp.acres),
            height: base.height + (ref === Cesium.HeightReference.NONE ? 0.3 : 0.3),
            heightReference: ref,
            material: Cesium.Color.fromCssColorString(style.ring).withAlpha(
              comp.kind === 'neighbor' ? 0.1 : 0.22,
            ),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString(style.ring).withAlpha(0.85),
            outlineWidth: 2,
          },
        });
        ring._pflRealtorComp = { ...comp, site };
        pinEntities.push(ring);
        if (comp.kind === 'neighbor') continue;
        const pin = viewer.entities.add({
          id: `pfl-realtor-pin-${site}-${comp.id}`,
          name: comp.badge,
          position,
          billboard: {
            image: signFor(comp),
            scale: 0.5,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            heightReference: ref,
            pixelOffset: new Cesium.Cartesian2(0, -14),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(60, 1.15, 6000, 0.55),
          },
        });
        pin._pflRealtorComp = { ...comp, site };
        pinEntities.push(pin);
      }
    }
    render();
  }

  function highlightComp(comp) {
    if (highlight) {
      try {
        viewer.entities.remove(highlight);
      } catch {
        /* already removed */
      }
      highlight = null;
    }
    if (!comp) return;
    const { base, position } = compEntityPosition(comp);
    const r = ringRadiusMeters(comp.acres) + 6;
    highlight = viewer.entities.add({
      id: 'pfl-realtor-highlight',
      name: 'Selected comp',
      position,
      ellipse: {
        semiMajorAxis: r,
        semiMinorAxis: r,
        height: base.height + 0.5,
        heightReference: heightRef(base),
        material: Cesium.Color.fromCssColorString('#facc15').withAlpha(0.35),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#fde047'),
        outlineWidth: 3,
      },
    });
  }

  function flyTo(comp) {
    try {
      const { position } = compEntityPosition(comp);
      viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(position, 45), {
        offset: new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(25),
          Cesium.Math.toRadians(-38),
          ringRadiusMeters(comp.acres) * 3 + 90,
        ),
        duration: 1.6,
      });
    } catch (error) {
      console.warn('[Virtual Realtor] flyTo failed:', error);
    }
  }

  // ---- panel rendering
  const allComps = () => state.data[state.site]?.comps || [];
  const findComp = (id) => {
    for (const site of REALTOR_SITES) {
      const c = (state.data[site]?.comps || []).find((x) => x.id === id);
      if (c) return { ...c, site };
    }
    return null;
  };

  function renderTabs() {
    tabsEl.innerHTML =
      REALTOR_SITES.map(
        (s) =>
          `<button type="button" class="pfl-vr-btn${s === state.site ? ' active' : ''}" data-site="${s}">${SITE_TITLES[s]}</button>`,
      ).join('') +
      `<button type="button" class="pfl-vr-btn" data-act="speak-site" title="Speak the site's Lisa/Harry pitch">🎙️ Site Pitch</button>`;
  }

  function renderMetrics() {
    const m = state.data[state.site]?.metrics;
    if (!m) {
      metricsEl.innerHTML = '';
      return;
    }
    const ave = m.ave;
    const cells = [
      [money(m.medianBcadPerAcre), 'Median BCAD $/ac'],
      [m.waterfrontPremiumPct != null ? `+${m.waterfrontPremiumPct}%` : '—', 'Waterfront $/sqft premium'],
      [ave ? money(ave.mid) : '—', 'Automated Valuation Est.'],
      [m.medianSoldPerSqft ? `$${m.medianSoldPerSqft}/sf` : '—', 'Median sold $/sqft'],
      [String(m.deedCount ?? 0), 'Live deeds 2024–26'],
      [ave ? `${money(ave.low)}–${money(ave.high)}` : '—', 'AVE range'],
    ];
    metricsEl.innerHTML = cells
      .map(([v, l]) => `<div class="pfl-vr-metric"><b>${escapeHtml(v)}</b><span>${escapeHtml(l)}</span></div>`)
      .join('');
  }

  function renderRows() {
    const rows = allComps().filter((c) => c.kind !== 'neighbor');
    if (!rows.length) {
      rowsEl.innerHTML = `<tr><td colspan="4" class="pfl-vr-status">${state.loading ? 'Loading live BCAD deeds…' : 'No comps yet.'}</td></tr>`;
      return;
    }
    rowsEl.innerHTML = rows
      .map((c) => {
        const st = KIND_STYLE[c.kind] || KIND_STYLE.neighbor;
        return `<tr class="pfl-vr-row${c.id === state.selectedId ? ' sel' : ''}" data-id="${escapeHtml(c.id)}">
          <td><span class="pfl-vr-tag" style="background:${st.fill}">${escapeHtml(c.badge)}</span></td>
          <td>${escapeHtml(String(c.address).replace(/, (Liverpool|Sweeny) TX \d+/, ''))}${c.bcadLive ? ' <span title="Live BCAD">●</span>' : ''}</td>
          <td>${money(c.valueUsd)}</td>
          <td>${c.acres ? Number(c.acres).toFixed(2) : '—'}</td></tr>`;
      })
      .join('');
  }

  function renderBrief() {
    const comp = state.selectedId ? findComp(state.selectedId) : null;
    if (!comp) {
      briefEl.innerHTML = `<b>👑 Lisa Muse / 🕵️ Harry Virtual Realtor Tour Brief</b><div class="pfl-vr-pitch">Click a 3D pin or a row to fly to the property and get the broker brief.</div>`;
      return;
    }
    const metrics = state.data[comp.site]?.metrics;
    const brief = buildBrokerBrief(comp, metrics);
    const f = brief.facts;
    briefEl.innerHTML = `
      <b>👑 Lisa Muse / 🕵️ Harry Virtual Realtor Tour Brief</b>
      <div style="margin-top:4px;font-weight:800;color:#fde68a">${escapeHtml(comp.address)}</div>
      <div class="pfl-vr-facts">
        <div><span>${escapeHtml(f.valueLabel)}:</span> <b>${money(f.value)}</b></div>
        <div><span>BCAD Appraised:</span> <b>${money(f.appraised)}</b></div>
        <div><span>Deed #:</span> <b>${escapeHtml(f.deed)}</b></div>
        <div><span>Acreage:</span> <b>${f.acres ? Number(f.acres).toFixed(2) + ' ac' : '—'}</b></div>
        <div><span>Est. Taxes:</span> <b>${f.estTax ? money(f.estTax) + '/yr' : '—'}</b></div>
        <div><span>${f.perSqft ? '$/sqft' : '$/ac'}:</span> <b>${f.perSqft ? '$' + f.perSqft : f.perAcre ? money(f.perAcre) : '—'}</b></div>
        ${f.sqft ? `<div><span>Living area:</span> <b>${f.sqft.toLocaleString()} sqft</b></div>` : ''}
        ${f.soldDate ? `<div><span>Sold:</span> <b>${escapeHtml(f.soldDate)}</b></div>` : ''}
        ${f.owner ? `<div style="grid-column:1/-1"><span>Owner of record:</span> ${escapeHtml(f.owner)}</div>` : ''}
      </div>
      <div class="pfl-vr-pitch">${escapeHtml(metrics?.pitch?.lisa || '')}</div>
      <div class="pfl-vr-pitch">${escapeHtml(metrics?.pitch?.harry || '')}</div>
      <div class="pfl-vr-actions">
        <a class="pfl-vr-btn" id="pfl-vr-bcad" href="${escapeHtml(comp.bcadUrl)}" target="_blank" rel="noopener noreferrer">Open BCAD Record ↗</a>
        <a class="pfl-vr-btn" id="pfl-vr-zillow" href="${escapeHtml(comp.zillowUrl)}" target="_blank" rel="noopener noreferrer">Zillow Search ↗</a>
        <button type="button" class="pfl-vr-btn" id="pfl-vr-speak" data-act="speak">${state.speaking ? '⏹ Stop Pitch' : '🎙️ Speak Broker Pitch'}</button>
        <button type="button" class="pfl-vr-btn" id="pfl-vr-copy" data-act="copy">📋 Copy Brief</button>
      </div>`;
  }

  function renderStatus() {
    const d = state.data[state.site];
    statusEl.textContent = state.error
      ? `⚠ ${state.error}`
      : d
        ? `${d.count} comps · live BCAD parcels ${d.live.parcels}${d.live.cached ? ' (cached)' : ''}${d.live.error ? ` · ⚠ ${d.live.error}` : ''} · ${d.metrics.disclaimer}`
        : state.loading
          ? 'Loading…'
          : '';
  }

  function renderAll() {
    renderTabs();
    renderMetrics();
    renderRows();
    renderBrief();
    renderStatus();
  }

  // ---- speech / clipboard
  function stopSpeech() {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* speech unavailable */
    }
    state.speaking = false;
  }
  function speak(text) {
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
      state.error = 'Web Speech is unavailable in this browser — use Copy Brief.';
      renderStatus();
      return;
    }
    if (state.speaking) {
      stopSpeech();
      renderBrief();
      return;
    }
    const utter = new SpeechSynthesisUtterance(speechSafe(text));
    utter.rate = 1.02;
    utter.onend = utter.onerror = () => {
      state.speaking = false;
      if (!destroyed) renderBrief();
    };
    state.speaking = true;
    synth.speak(utter);
    renderBrief();
  }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      state.error = '';
      statusEl.textContent = '📋 Brief copied to clipboard.';
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        statusEl.textContent = '📋 Brief copied to clipboard.';
      } catch {
        statusEl.textContent = '⚠ Copy failed — select the brief text manually.';
      }
      ta.remove();
    }
  }

  // ---- data
  async function load(force = false) {
    state.loading = true;
    state.error = '';
    renderAll();
    const results = await Promise.allSettled(
      REALTOR_SITES.map(async (site) => {
        const res = await fetchImpl(`${REALTOR_API}?site=${site}${force ? `&t=${Date.now()}` : ''}`);
        if (!res.ok) throw new Error(`comps ${site} HTTP ${res.status}`);
        return [site, await res.json()];
      }),
    );
    if (destroyed) return;
    for (const r of results) {
      if (r.status === 'fulfilled') state.data[r.value[0]] = r.value[1];
      else state.error = String(r.reason?.message || r.reason);
    }
    state.loading = false;
    buildPins();
    renderAll();
  }

  // ---- selection
  function select(comp, { fly = true } = {}) {
    const c = typeof comp === 'string' ? findComp(comp) : comp;
    if (!c) return;
    if (!state.enabled) setEnabled(true);
    state.selectedId = c.id;
    if (c.site && c.site !== state.site) state.site = c.site;
    stopSpeech();
    highlightComp(c);
    if (fly) flyTo(c);
    openPanel();
    renderAll();
    rowsEl.querySelector('tr.sel')?.scrollIntoView?.({ block: 'nearest' });
    render();
  }

  // ---- open/close/toggle
  function openPanel() {
    panel.classList.add('pfl-vr-open');
    panel.classList.remove('pfl-vr-min');
    state.minimized = false;
  }
  function setEnabled(on) {
    state.enabled = !!on;
    syncLauncher();
    if (state.enabled) {
      openPanel();
      if (!state.data.liverpool && !state.data.sweeny) load();
      else buildPins();
      renderAll();
    } else {
      stopSpeech();
      panel.classList.remove('pfl-vr-open');
      clearPins();
      render();
    }
  }
  function toggle() {
    setEnabled(!state.enabled);
  }
  window.__pflOpenVirtualRealtor = () => {
    if (!state.enabled) setEnabled(true);
    else openPanel();
  };

  // ---- panel events
  panel.addEventListener('click', (ev) => {
    const target = ev.target.closest?.('[data-act],[data-site],tr.pfl-vr-row');
    if (!target) return;
    if (target.dataset.site) {
      state.site = target.dataset.site;
      renderAll();
      return;
    }
    if (target.matches('tr.pfl-vr-row')) {
      select(target.dataset.id);
      return;
    }
    const act = target.dataset.act;
    if (act === 'close') setEnabled(false);
    else if (act === 'min') {
      state.minimized = !panel.classList.contains('pfl-vr-min');
      panel.classList.toggle('pfl-vr-min', state.minimized);
    } else if (act === 'refresh') load(true);
    else if (act === 'speak' || act === 'copy') {
      const comp = findComp(state.selectedId);
      if (!comp) return;
      const brief = buildBrokerBrief(comp, state.data[comp.site]?.metrics);
      if (act === 'speak') speak(brief.speech + ' ' + (state.data[comp.site]?.metrics?.pitch?.lisa || ''));
      else copyText(brief.text);
    } else if (act === 'speak-site') {
      const p = state.data[state.site]?.metrics?.pitch;
      if (p) speak(`${p.lisa} ${p.harry}`);
    }
  });

  // drag
  const hdr = panel.querySelector('.pfl-vr-hdr');
  let drag = null;
  const onMove = (ev) => {
    if (!drag) return;
    const left = Math.max(0, Math.min(window.innerWidth - 80, ev.clientX - drag.dx));
    const top = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - drag.dy));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = 'auto';
    saved.left = left;
    saved.top = top;
  };
  const onUp = () => {
    if (drag) persist();
    drag = null;
  };
  hdr.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('button')) return;
    const rect = panel.getBoundingClientRect();
    drag = { dx: ev.clientX - rect.left, dy: ev.clientY - rect.top };
    ev.preventDefault();
  });
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  disposers.push(
    () => window.removeEventListener('pointermove', onMove),
    () => window.removeEventListener('pointerup', onUp),
  );

  // ---- 3D LEFT_CLICK on a pin. The app's single input dispatcher
  // (src/input/dispatcher.js) owns the ScreenSpaceEventHandler (the repo's
  // inputOwnership guard forbids layers binding their own); it hands every
  // subscriber the same LEFT_CLICK with the engine pick attached.
  let unsubscribeClick = null;
  try {
    unsubscribeClick = (options.inputFor || inputFor)(viewer).onClick((click) => {
      if (!state.enabled) return;
      let ent = click?.pick?.id ?? click?.native?.pick?.id;
      if (!ent?._pflRealtorComp && click?.screenPosition) {
        try {
          ent = viewer.scene.pick(
            new Cesium.Cartesian2(click.screenPosition.x, click.screenPosition.y),
          )?.id;
        } catch {
          return;
        }
      }
      if (ent?._pflRealtorComp) select(ent._pflRealtorComp);
    });
  } catch (error) {
    console.warn('[Virtual Realtor] click subscription unavailable:', error);
  }

  renderAll();

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stopSpeech();
    clearPins();
    try {
      unsubscribeClick?.();
    } catch {
      /* subscription already released */
    }
    observer?.disconnect();
    clearTimeout(floatTimer);
    clearTimeout(giveUpTimer);
    for (const d of disposers) d();
    panel.remove();
    launcher.remove();
    style.remove();
    if (window.__pflVirtualRealtor === api) delete window.__pflVirtualRealtor;
    delete window.__pflOpenVirtualRealtor;
    render();
  }

  const api = {
    destroy,
    open: () => window.__pflOpenVirtualRealtor(),
    toggle,
    select,
    reload: () => load(true),
    getState: () => ({ ...state, pins: pinEntities.length }),
    panel,
    launcher,
  };
  window.__pflVirtualRealtor = api;
  return api;
}
