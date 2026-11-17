import * as Cesium from 'cesium';
import { governorRequestRender } from '../renderGovernor.js';

const STORAGE_KEY = 'pfl_gev_windows_v1';

function loadSavedLayout() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLayout(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function loadPflWindowFramework({ viewer }) {
  if (typeof document === 'undefined') return { destroy() {} };

  const saved = loadSavedLayout();
  const createdEls = [];
  let rafId = 0;

  const style = document.createElement('style');
  style.id = 'pfl-std-window-styles';
  style.textContent = `
    .pfl-std-box {
      position: fixed !important;
      z-index: 9400 !important;
      background: rgba(9, 14, 26, 0.92) !important;
      border: 1.5px solid rgba(56, 189, 248, 0.55) !important;
      border-radius: 12px !important;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.65) !important;
      backdrop-filter: blur(10px);
      display: flex;
      flex-direction: column;
      resize: both;
      overflow: hidden;
      min-width: 180px;
      min-height: 36px;
      transform-origin: top left;
    }
    .pfl-std-box.pfl-minimized > :not(.pfl-std-hdr) {
      display: none !important;
    }
    .pfl-std-box.pfl-minimized {
      height: 34px !important;
      min-height: 34px !important;
      resize: none !important;
    }
    .pfl-std-hdr {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 5px 10px;
      background: linear-gradient(90deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.95));
      border-bottom: 1px solid rgba(56, 189, 248, 0.3);
      cursor: grab;
      user-select: none;
      font-family: 'JetBrains Mono', 'Inter', system-ui, sans-serif;
      font-size: 11px;
      font-weight: 700;
      color: #38bdf8;
      letter-spacing: 0.04em;
    }
    .pfl-std-hdr:active { cursor: grabbing; }
    .pfl-std-ctrls { display: flex; align-items: center; gap: 4px; }
    .pfl-std-cbtn {
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid rgba(148, 163, 184, 0.35);
      color: #e2e8f0;
      border-radius: 5px;
      padding: 1px 6px;
      font-size: 10px;
      font-weight: 700;
      cursor: pointer;
      line-height: 1.3;
    }
    .pfl-std-cbtn:hover { border-color: #38bdf8; color: #38bdf8; }
    .pfl-std-body {
      padding: 8px 10px;
      overflow: auto;
      flex: 1;
    }
    .pfl-std-corner {
      position: absolute;
      right: 2px;
      bottom: 1px;
      font-size: 10px;
      color: #38bdf8;
      pointer-events: none;
      opacity: 0.85;
    }
    /* Hide ALL cluttered duplicate floating buttons once consolidated into PFL Sovereign Dock */
    #gev-arrange-toggle,
    #gev-arrange-dock-btn,
    #gev-fire-video-btn,
    #gev-memory-palace-btn,
    #pfl-s42-dock-btn {
      display: none !important;
    }
    /* Pin Cesium Ion credit neatly in bottom-left 8px corner instead of 30% up screen */
    html body #cesium-credits,
    html body:not(.ui-clean-view):not(.recording-mode) #cesium-credits {
      bottom: 6px !important;
      left: 12px !important;
      top: auto !important;
      opacity: 0.62 !important;
    }
    .pfl-f15-bar {
      position: static !important;
      transform: none !important;
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      padding: 4px 2px !important;
      flex-wrap: wrap !important;
    }
  `;
  document.head.appendChild(style);
  createdEls.push(style);

  function createStandardBox({ id, title, defaultLeft, defaultTop, defaultWidth }) {
    const cfg = saved[id] || {};
    const box = document.createElement('div');
    box.id = id;
    box.className = 'pfl-std-box' + (cfg.minimized ? ' pfl-minimized' : '');
    box.style.left = (cfg.left ?? defaultLeft) + 'px';
    box.style.top = (cfg.top ?? defaultTop) + 'px';
    if (cfg.width || defaultWidth) box.style.width = (cfg.width ?? defaultWidth) + 'px';
    if (cfg.height) box.style.height = cfg.height + 'px';
    let scale = Number(cfg.scale) || 1.0;
    box.style.fontSize = Math.round(12 * scale) + 'px';

    const hdr = document.createElement('div');
    hdr.className = 'pfl-std-hdr';
    hdr.innerHTML = `
      <span>✥ ${title}</span>
      <div class="pfl-std-ctrls">
        <button type="button" class="pfl-std-cbtn" data-act="smaller" title="Decrease font/scale">A−</button>
        <button type="button" class="pfl-std-cbtn" data-act="bigger" title="Increase font/scale">A+</button>
        <button type="button" class="pfl-std-cbtn" data-act="min" title="Minimize / Expand">${cfg.minimized ? '▢' : '—'}</button>
      </div>
    `;
    const body = document.createElement('div');
    body.className = 'pfl-std-body';
    const corner = document.createElement('div');
    corner.className = 'pfl-std-corner';
    corner.textContent = '◢';

    box.append(hdr, body, corner);
    document.body.appendChild(box);
    createdEls.push(box);

    function persist() {
      saved[id] = {
        left: parseInt(box.style.left, 10) || defaultLeft,
        top: parseInt(box.style.top, 10) || defaultTop,
        width: box.offsetWidth,
        height: box.classList.contains('pfl-minimized') ? (saved[id]?.height || null) : box.offsetHeight,
        minimized: box.classList.contains('pfl-minimized'),
        scale,
      };
      saveLayout(saved);
    }

    hdr.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const origL = box.offsetLeft;
      const origT = box.offsetTop;
      hdr.setPointerCapture(e.pointerId);
      const onMove = (ev) => {
        box.style.left = Math.max(0, origL + (ev.clientX - startX)) + 'px';
        box.style.top = Math.max(0, origT + (ev.clientY - startY)) + 'px';
      };
      const onUp = () => {
        hdr.removeEventListener('pointermove', onMove);
        hdr.removeEventListener('pointerup', onUp);
        persist();
      };
      hdr.addEventListener('pointermove', onMove);
      hdr.addEventListener('pointerup', onUp);
    });

    hdr.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.getAttribute('data-act');
        if (act === 'min') {
          const isMin = box.classList.toggle('pfl-minimized');
          btn.textContent = isMin ? '▢' : '—';
        } else if (act === 'bigger') {
          scale = Math.min(1.6, +(scale + 0.1).toFixed(2));
          box.style.transform = `scale(${scale})`;
        } else if (act === 'smaller') {
          scale = Math.max(0.7, +(scale - 0.1).toFixed(2));
          box.style.transform = `scale(${scale})`;
        }
        persist();
      });
    });

    const ro = new ResizeObserver(() => persist());
    ro.observe(box);
    return { box, body };
  }

  // 1) Wrap PFL Sovereign Nodes, Flight 15, Kalshi Arena & Yard Tools in ONE Movable/Sizable Box
  const cmdWin = createStandardBox({
    id: 'pfl-win-command-dock',
    title: 'PFL SOVEREIGN COMMAND DOCK (3 NODES + KALSHI + 3D TOOLS)',
    defaultLeft: 18,
    defaultTop: 58,
    defaultWidth: 760,
  });

  setTimeout(() => {
    const f15Bar = document.querySelector('.pfl-f15-bar');
    if (f15Bar) cmdWin.body.appendChild(f15Bar);

    const extraRow = document.createElement('div');
    extraRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;padding-top:6px;border-top:1px solid rgba(56,189,248,0.22);';
    extraRow.innerHTML = `
      <button type="button" class="pfl-f15-btn" id="pfl-btn-kalshi-inline" style="border-color:#22c55e;color:#4ade80;font-weight:700">📈 Kalshi Paper Arena (Show / Hide)</button>
      <a href="/kalshi-paper.html" target="_blank" rel="noopener" class="pfl-f15-btn" id="pfl-btn-kalshi-tab" style="border-color:#38bdf8;color:#38bdf8;text-decoration:none;display:inline-flex;align-items:center">↗ Full TradingView &amp; Kalshi Tab</a>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-arrange">🖼️ Arrange Yard Photos</button>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-fire">🔥 Yard Fire &amp; Legs</button>
      <a href="/memory-palace.html" target="_blank" rel="noopener" class="pfl-f15-btn" id="pfl-btn-palace" style="text-decoration:none;display:inline-flex;align-items:center">🏛️ 3D Memory Palace ↗</a>
      <a href="https://elitespyworlds.com/birdpond/adventure.html" target="_blank" rel="noopener" class="pfl-f15-btn" id="pfl-btn-birdpond-ext" style="text-decoration:none;display:inline-flex;align-items:center">🌿 EliteSpyWorlds Bird Pond ↗</a>
    `;
    cmdWin.body.appendChild(extraRow);

    extraRow.querySelector('#pfl-btn-arrange')?.addEventListener('click', (ev) => {
      const on = typeof window.__pflToggleArrangeYard === 'function'
        ? window.__pflToggleArrangeYard()
        : ((document.getElementById('gev-arrange-toggle')?.click()), true);
      ev.currentTarget.classList.toggle('active', Boolean(on));
    });
    extraRow.querySelector('#pfl-btn-fire')?.addEventListener('click', () => {
      if (typeof window.__pflOpenFireModal === 'function') window.__pflOpenFireModal();
      else document.getElementById('gev-fire-video-btn')?.click();
    });
    extraRow.querySelector('#pfl-btn-kalshi-inline')?.addEventListener('click', () => {
      const isHidden = kalshiWin.box.style.display === 'none' || kalshiWin.box.classList.contains('pfl-minimized');
      kalshiWin.box.style.display = isHidden ? 'flex' : 'none';
      if (isHidden) {
        kalshiWin.box.classList.remove('pfl-minimized');
        const minBtn = kalshiWin.box.querySelector('[data-act="min"]');
        if (minBtn) minBtn.textContent = '—';
        kalshiWin.box.style.zIndex = '9680';
      }
    });
  }, 400);

  // 2) Bird Pond 3D Axis Compass Globe + Live Camera / Selected 3D Object Inspector Box
  const compassWin = createStandardBox({
    id: 'pfl-win-3d-compass-inspector',
    title: 'PFL 3D COMPASS GLOBE & OBJECT ROTATOR',
    defaultLeft: window.innerWidth - 265,
    defaultTop: 62,
    defaultWidth: 245,
  });
  compassWin.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;font-family:'JetBrains Mono',monospace;font-size:11px;color:#cbd5e1">
      <canvas id="pfl-axis-globe" width="136" height="136" style="cursor:pointer;border-radius:50%" title="Click N/S/E/W/UP or drag to orbit camera"></canvas>
      <div id="pfl-cam-readout" style="text-align:center;font-size:10px;color:#94a3b8;line-height:1.35">CAM READY</div>
      <div style="width:100%;border-top:1px solid rgba(56,189,248,0.25);padding-top:6px">
        <div style="color:#fbbf24;font-weight:700;margin-bottom:4px">🎯 Click Any 3D Photo / Object:</div>
        <div id="pfl-sel-name" style="color:#e2e8f0;margin-bottom:4px;font-size:10px">None selected (click Gate photo)</div>
        <label style="display:flex;justify-content:space-between"><span>Heading (°)</span><span id="pfl-hdg-val">107°</span></label>
        <input type="range" id="pfl-hdg-slider" min="0" max="360" step="1" value="107" style="width:100%" />
        <label style="display:flex;justify-content:space-between;margin-top:4px"><span>Elevation Offset (m)</span><span id="pfl-alt-val">0.0m</span></label>
        <input type="range" id="pfl-alt-slider" min="-10" max="25" step="0.5" value="0" style="width:100%" />
      </div>
    </div>
  `;

  // Wire click-to-select & live rotation on ANY Bird Pond wall or 3D entity
  let selectedWall = null;
  const pickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  pickHandler.setInputAction((movement) => {
    const picked = viewer.scene.pick(movement.position);
    const ent = picked?.id;
    if (ent && ent.wall && String(ent.id || '').startsWith('birdpond_')) {
      selectedWall = ent;
      const st = ent._pflWallMeta || { lat: 29.139116, lon: -95.804794, width: 13.93, height: 9.23, heading: 107, baseAlt: -17.5, lift: 0 };
      ent._pflWallMeta = st;
      compassWin.body.querySelector('#pfl-sel-name').textContent = ent.name || ent.id;
      compassWin.body.querySelector('#pfl-hdg-slider').value = String(Math.round(st.heading));
      compassWin.body.querySelector('#pfl-hdg-val').textContent = `${Math.round(st.heading)}°`;
      compassWin.body.querySelector('#pfl-alt-slider').value = String(st.lift || 0);
      compassWin.body.querySelector('#pfl-alt-val').textContent = `${(st.lift || 0).toFixed(1)}m`;
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  function updateSelectedWall() {
    if (!selectedWall || !selectedWall._pflWallMeta) return;
    const st = selectedWall._pflWallMeta;
    const halfW = (st.width || 13.93) * 0.5;
    const rad = (st.heading * Math.PI) / 180.0;
    const dN = Math.cos(rad) * halfW;
    const dE = Math.sin(rad) * halfW;
    const mLat = 111320.0;
    const mLon = 111320.0 * Math.cos((st.lat * Math.PI) / 180.0);
    const bAlt = (st.baseAlt ?? -17.5) + (st.lift || 0);
    const tAlt = bAlt + (st.height || 9.23);
    selectedWall.wall.positions = Cesium.Cartesian3.fromDegreesArrayHeights([
      st.lon - dE / mLon, st.lat - dN / mLat, tAlt,
      st.lon + dE / mLon, st.lat + dN / mLat, tAlt,
    ]);
    selectedWall.wall.minimumHeights = [bAlt, bAlt];
    governorRequestRender('pfl-wall-rotate');
  }

  compassWin.body.querySelector('#pfl-hdg-slider')?.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    compassWin.body.querySelector('#pfl-hdg-val').textContent = `${v}°`;
    if (selectedWall?._pflWallMeta) {
      selectedWall._pflWallMeta.heading = v;
      updateSelectedWall();
    }
  });

  compassWin.body.querySelector('#pfl-alt-slider')?.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    compassWin.body.querySelector('#pfl-alt-val').textContent = `${v.toFixed(1)}m`;
    if (selectedWall?._pflWallMeta) {
      selectedWall._pflWallMeta.lift = v;
      updateSelectedWall();
    }
  });

  // Render the 3D Axis Compass Ball (ported directly from Bird Pond adventure.html)
  const gCanvas = compassWin.body.querySelector('#pfl-axis-globe');
  const gCtx = gCanvas.getContext('2d');
  const AXES = [
    { lbl: 'N',  dir: [0, 0, -1], col: '#22c55e', snapH: 0,   snapP: -18 },
    { lbl: 'S',  dir: [0, 0, 1],  col: '#166534', snapH: 180, snapP: -18 },
    { lbl: 'E',  dir: [1, 0, 0],  col: '#ef4444', snapH: 90,  snapP: -18 },
    { lbl: 'W',  dir: [-1, 0, 0], col: '#991b1b', snapH: 270, snapP: -18 },
    { lbl: 'UP', dir: [0, 1, 0],  col: '#38bdf8', snapH: 0,   snapP: -88 },
  ];
  let hitTargets = [];

  function paintGlobe() {
    if (!viewer?.camera) return;
    const W = 136, H = 136, cx = 68, cy = 68, R = 50;
    gCtx.clearRect(0, 0, W, H);
    const grad = gCtx.createRadialGradient(cx - 12, cy - 12, 5, cx, cy, R + 8);
    grad.addColorStop(0, 'rgba(30, 41, 59, 0.96)');
    grad.addColorStop(1, 'rgba(9, 14, 26, 0.98)');
    gCtx.fillStyle = grad;
    gCtx.beginPath();
    gCtx.arc(cx, cy, R + 8, 0, Math.PI * 2);
    gCtx.fill();
    gCtx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
    gCtx.lineWidth = 1.5;
    gCtx.stroke();

    const h = viewer.camera.heading || 0;
    const p = viewer.camera.pitch || 0;
    const ch = Math.cos(h), sh = Math.sin(h);
    const cp = Math.cos(p), sp = Math.sin(p);

    const projected = AXES.map((a) => {
      const [x, y, z] = a.dir;
      const rx = x * ch + z * sh;
      const rz = -x * sh + z * ch;
      const ry = y * cp - rz * sp;
      const depth = y * sp + rz * cp;
      return { ...a, sx: cx + rx * R, sy: cy - ry * R, depth };
    }).sort((a, b) => a.depth - b.depth);

    hitTargets = projected;
    for (const pt of projected) {
      gCtx.strokeStyle = pt.col;
      gCtx.lineWidth = pt.depth >= 0 ? 2.2 : 1.1;
      gCtx.beginPath();
      gCtx.moveTo(cx, cy);
      gCtx.lineTo(pt.sx, pt.sy);
      gCtx.stroke();

      gCtx.fillStyle = pt.col;
      gCtx.beginPath();
      gCtx.arc(pt.sx, pt.sy, pt.depth >= 0 ? 9 : 6, 0, Math.PI * 2);
      gCtx.fill();

      gCtx.fillStyle = '#fff';
      gCtx.font = '700 9px "JetBrains Mono", monospace';
      gCtx.textAlign = 'center';
      gCtx.textBaseline = 'middle';
      gCtx.fillText(pt.lbl, pt.sx, pt.sy);
    }

    const c = viewer.camera.positionCartographic;
    if (c) {
      const lat = Cesium.Math.toDegrees(c.latitude).toFixed(5);
      const lon = Cesium.Math.toDegrees(c.longitude).toFixed(5);
      const hdg = Math.round(Cesium.Math.toDegrees(h) % 360);
      compassWin.body.querySelector('#pfl-cam-readout').textContent =
        `${lat}, ${lon} · ALT ${c.height.toFixed(1)}m · HDG ${hdg}°`;
    }
  }

  gCanvas.addEventListener('click', (e) => {
    const r = gCanvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    for (let i = hitTargets.length - 1; i >= 0; i--) {
      const t = hitTargets[i];
      if (Math.hypot(mx - t.sx, my - t.sy) <= 12) {
        const c = viewer.camera.positionCartographic;
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, Math.max(15, c.height)),
          orientation: {
            heading: Cesium.Math.toRadians(t.snapH),
            pitch: Cesium.Math.toRadians(t.snapP),
            roll: 0,
          },
          duration: 0.8,
        });
        break;
      }
    }
  });

  const timer = setInterval(paintGlobe, 350);

  // 3) Movable / Sizable Embedded Kalshi & Schwab Paper-Trading Box (Live Server Ledger + Weather Contracts)
  const kalshiWin = createStandardBox({
    id: 'pfl-win-kalshi-arena',
    title: '📈 KALSHI WEATHER & MACRO PAPER ARENA ($100 LIVE SEATS)',
    defaultLeft: 20,
    defaultTop: 215,
    defaultWidth: 495,
  });
  kalshiWin.body.innerHTML = `
    <div style="font-family:'Inter',system-ui,sans-serif;font-size:11.5px;color:#e2e8f0">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px">
        <span style="color:#4ade80;font-weight:700">● Live Kalshi Weather/Macro Book (.cache/ledger)</span>
        <div style="display:flex;gap:4px">
          <button type="button" class="pfl-std-cbtn" id="pfl-kalshi-wx-btn" title="Toggle swirling Wind & Weather Radar layers">🌪️ Swirl Weather/Wind</button>
          <button type="button" class="pfl-std-cbtn" id="pfl-kalshi-refresh">↻ Sync Quotes</button>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:6px">
        <thead>
          <tr style="color:#94a3b8;border-bottom:1px solid #1e293b;text-align:left">
            <th style="padding:2px">Seat</th><th>Cash</th><th>Open</th><th>Equity</th><th>Live P&amp;L</th>
          </tr>
        </thead>
        <tbody id="pfl-inline-lb">
          <tr><td colspan="5" style="color:#94a3b8">Syncing live Kalshi marks...</td></tr>
        </tbody>
      </table>
      <div style="font-weight:700;color:#fbbf24;margin-bottom:3px">Active Swarm Paper Tickets (Marked to Live Kalshi Orderbook):</div>
      <div id="pfl-inline-trades" style="max-height:95px;overflow:auto;border:1px solid #1e293b;border-radius:6px;padding:4px;font-size:10.5px;margin-bottom:6px"></div>
      <div style="font-weight:700;color:#38bdf8;margin-bottom:3px">Click Any Live Weather / Macro Contract to Paper-Bet:</div>
      <div id="pfl-inline-markets" style="max-height:115px;overflow:auto;border:1px solid #1e293b;border-radius:6px;padding:4px;font-size:10.5px;margin-bottom:6px">
        Loading live Kalshi Houston Temp, Austin Temp, S&amp;P &amp; BTC markets...
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">
        <input id="pfl-bet-tkr" placeholder="KXHIGHTHOU-26NOV18-B73.5" style="flex:1;min-width:130px;background:#090e18;border:1px solid #334155;color:#fff;padding:3px 6px;border-radius:4px;font-size:10.5px" />
        <select id="pfl-bet-side" style="background:#090e18;border:1px solid #334155;color:#fff;padding:3px;border-radius:4px;font-size:10.5px"><option>YES</option><option>NO</option></select>
        <input id="pfl-bet-qty" type="number" value="20" style="width:46px;background:#090e18;border:1px solid #334155;color:#fff;padding:3px;border-radius:4px;font-size:10.5px" />
        <input id="pfl-bet-px" type="number" value="53" style="width:44px;background:#090e18;border:1px solid #334155;color:#fff;padding:3px;border-radius:4px;font-size:10.5px" title="Entry ¢" />
        <button type="button" class="pfl-std-cbtn" id="pfl-bet-submit" style="background:#38bdf8;color:#041019;border:none;padding:4px 8px">Place Bet</button>
      </div>
    </div>
  `;

  async function refreshInlineKalshi() {
    const lbEl = kalshiWin.body.querySelector('#pfl-inline-lb');
    const trEl = kalshiWin.body.querySelector('#pfl-inline-trades');
    const mkEl = kalshiWin.body.querySelector('#pfl-inline-markets');
    if (!lbEl || !mkEl) return;
    try {
      const r = await fetch('/api/pfl/kalshi');
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'Failed');
      lbEl.innerHTML = (d.leaderboard || [])
        .map((row) => {
          const col = row.pnl > 0 ? '#4ade80' : row.pnl < 0 ? '#f87171' : '#94a3b8';
          const sign = row.pnl > 0 ? '+' : '';
          return `<tr><td><strong>${row.name}</strong></td><td>$${row.cash.toFixed(2)}</td><td>${row.count} ($${row.posVal.toFixed(2)})</td><td><strong>$${row.equity.toFixed(2)}</strong></td><td style="color:${col};font-weight:700">${sign}$${row.pnl.toFixed(2)}</td></tr>`;
        })
        .join('');
      if (trEl) {
        trEl.innerHTML = (d.trades || [])
          .map(
            (t) =>
              `<div style="padding:2px 0;border-bottom:1px solid rgba(30,41,59,0.6)"><strong>${t.owner.split(' ')[0]}</strong> · <span style="color:${t.side === 'YES' ? '#4ade80' : '#f87171'};font-weight:700">${t.side}×${t.qty}</span> <code>${t.ticker}</code> @${t.entryCents}¢ → mark <strong>${t.markCents}¢</strong> <span style="color:#94a3b8">(${t.thesis})</span></div>`,
          )
          .join('');
      }
      mkEl.innerHTML = (d.markets || [])
        .map(
          (m) =>
            `<div class="pfl-mkt-pick" data-tkr="${m.ticker}" data-ask="${m.yesAsk || m.mid}" style="display:flex;justify-content:space-between;gap:6px;padding:3px 2px;border-bottom:1px solid rgba(30,41,59,0.7);cursor:pointer" title="Click to load into bet ticket">
              <span><strong>${m.ticker}</strong> · ${m.eventTitle} (${m.bracket})</span>
              <span style="color:#4ade80;white-space:nowrap;font-weight:700">${m.yesBid}¢/${m.yesAsk}¢</span>
            </div>`,
        )
        .join('');
      mkEl.querySelectorAll('.pfl-mkt-pick').forEach((row) => {
        row.addEventListener('click', () => {
          kalshiWin.body.querySelector('#pfl-bet-tkr').value = row.dataset.tkr || '';
          kalshiWin.body.querySelector('#pfl-bet-px').value = row.dataset.ask || '50';
        });
      });
    } catch (err) {
      mkEl.textContent = 'Kalshi feed error: ' + err.message;
    }
  }

  kalshiWin.body.querySelector('#pfl-kalshi-refresh')?.addEventListener('click', refreshInlineKalshi);
  kalshiWin.body.querySelector('#pfl-bet-submit')?.addEventListener('click', async () => {
    const ticker = kalshiWin.body.querySelector('#pfl-bet-tkr')?.value?.trim();
    if (!ticker) return;
    const side = kalshiWin.body.querySelector('#pfl-bet-side')?.value || 'YES';
    const qty = Number(kalshiWin.body.querySelector('#pfl-bet-qty')?.value) || 20;
    const entryCents = Number(kalshiWin.body.querySelector('#pfl-bet-px')?.value) || 50;
    await fetch('/api/pfl/kalshi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: 'Paul Prime', ticker, side, qty, entryCents, thesis: 'Paul Prime live weather/macro paper order' }),
    });
    refreshInlineKalshi();
  });
  kalshiWin.body.querySelector('#pfl-kalshi-wx-btn')?.addEventListener('click', () => {
    for (const id of ['weather', 'wind', 'cyclones']) {
      const toggle = document.querySelector(`[data-layer-id="${id}"], [data-layer="${id}"]`);
      if (toggle) toggle.click();
    }
  });
  refreshInlineKalshi();
  const kalshiPoll = setInterval(refreshInlineKalshi, 20000);

  return {
    destroy() {
      clearInterval(timer);
      clearInterval(kalshiPoll);
      cancelAnimationFrame(rafId);
      pickHandler.destroy();
      for (const el of createdEls) el.remove();
    },
  };
}
