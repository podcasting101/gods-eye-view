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
    if (cfg.height && cfg.height >= 120) box.style.height = cfg.height + 'px';
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

    let userResizedHeight = (cfg.height && cfg.height >= 120) ? cfg.height : null;
    function persist() {
      const isMin = box.classList.contains('pfl-minimized');
      if (!isMin && box.style.height) {
        const h = parseInt(box.style.height, 10) || box.offsetHeight;
        userResizedHeight = h >= 120 ? h : null;
      }
      saved[id] = {
        left: parseInt(box.style.left, 10) || defaultLeft,
        top: parseInt(box.style.top, 10) || defaultTop,
        width: Math.max(200, box.offsetWidth || defaultWidth || 320),
        height: userResizedHeight,
        minimized: isMin,
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
          if (!isMin && (!userResizedHeight || userResizedHeight < 120)) {
            box.style.height = '';
          }
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

    hdr.addEventListener('dblclick', () => {
      const minBtn = hdr.querySelector('[data-act="min"]');
      minBtn?.click();
    });
    const ro = new ResizeObserver(() => {
      if (!box.classList.contains('pfl-minimized') && box.offsetHeight >= 120) persist();
    });
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
      <button type="button" class="pfl-f15-btn" id="pfl-btn-wyze-patrol" style="border-color:#f97316;color:#fdba74;font-weight:700">🎥 Live Wyze Patrol &amp; Events</button>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-static-yard" title="Show/hide the old static seamed yard photo splat vs live 3D camera feeds">🧩 Static Yard Splat: OFF</button>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-arrange">🖼️ Arrange Yard Photos</button>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-fire">🔥 Yard Fire &amp; Legs</button>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-vault-inline" style="border-color:#a855f7;color:#d8b4fe;font-weight:700">🏛️ Local Palace &amp; Wyze Vault</button>
      <a href="/memory-palace.html" target="_blank" rel="noopener" class="pfl-f15-btn" id="pfl-btn-palace" style="text-decoration:none;display:inline-flex;align-items:center">↗ Full Memory Palace</a>
      <a href="http://127.0.0.1:8093/" target="_blank" rel="noopener" class="pfl-f15-btn" id="pfl-btn-livewire" style="border-color:#f43f5e;color:#fda4af;text-decoration:none;display:inline-flex;align-items:center">🎥 LiveWire (:8093) ↗</a>
      <a href="https://elitespyworlds.com/birdpond/adventure.html" target="_blank" rel="noopener" class="pfl-f15-btn" id="pfl-btn-birdpond-ext" style="text-decoration:none;display:inline-flex;align-items:center">🌿 EliteSpyWorlds Bird Pond ↗</a>
    `;
    cmdWin.body.appendChild(extraRow);

    const staticYardBtn = extraRow.querySelector('#pfl-btn-static-yard');
    const syncStaticBtn = () => {
      const vis = typeof window.__pflGetYardFramesVisible === 'function' ? window.__pflGetYardFramesVisible() : false;
      if (staticYardBtn) {
        staticYardBtn.textContent = vis ? '🧩 Static Yard Splat: ON' : '🧩 Static Yard Splat: OFF';
        staticYardBtn.classList.toggle('active', vis);
      }
    };
    syncStaticBtn();
    staticYardBtn?.addEventListener('click', () => {
      const cur = typeof window.__pflGetYardFramesVisible === 'function' ? window.__pflGetYardFramesVisible() : false;
      if (typeof window.__pflSetYardFramesVisible === 'function') window.__pflSetYardFramesVisible(!cur);
      syncStaticBtn();
    });
    extraRow.querySelector('#pfl-btn-wyze-patrol')?.addEventListener('click', () => {
      const isHidden = patrolWin.box.style.display === 'none' || patrolWin.box.classList.contains('pfl-minimized') || patrolWin.box.offsetHeight < 90;
      patrolWin.box.style.display = isHidden ? 'flex' : 'none';
      if (isHidden) {
        patrolWin.box.classList.remove('pfl-minimized');
        if (parseInt(patrolWin.box.style.height || '999', 10) < 120) patrolWin.box.style.height = '';
        const mb = patrolWin.box.querySelector('[data-act="min"]');
        if (mb) mb.textContent = '—';
        patrolWin.box.style.zIndex = '9695';
        refreshWyzePatrol();
      }
    });
    extraRow.querySelector('#pfl-btn-arrange')?.addEventListener('click', (ev) => {
      const on = typeof window.__pflToggleArrangeYard === 'function'
        ? window.__pflToggleArrangeYard()
        : ((document.getElementById('gev-arrange-toggle')?.click()), true);
      ev.currentTarget.classList.toggle('active', Boolean(on));
      syncStaticBtn();
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
            <th style="padding:2px">Seat</th><th>Cash</th><th>Pos Value</th><th>Equity</th><th>Live P&amp;L</th>
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
          return `<tr><td><strong>${row.name}</strong></td><td>$${row.cash.toFixed(2)}</td><td style="color:#cbd5e1">$${row.posVal.toFixed(2)} <span style="color:#64748b">(${row.count})</span></td><td><strong>$${row.equity.toFixed(2)}</strong></td><td style="color:${col};font-weight:700">${sign}$${row.pnl.toFixed(2)}</td></tr>`;
        })
        .join('');
      if (trEl) {
        trEl.innerHTML = `<div id="pfl-trade-drill" style="display:none;background:#0b1324;border:1px solid #38bdf8;border-radius:6px;padding:6px;margin-bottom:5px;font-size:10.5px"></div>` +
          (d.trades || [])
            .map((t, idx) => {
              const costD = ((t.qty * t.entryCents) / 100).toFixed(2);
              const valD = ((t.qty * t.markCents) / 100).toFixed(2);
              const pnlD = ((t.qty * (t.markCents - t.entryCents)) / 100);
              const pnlStr = (pnlD >= 0 ? '+' : '') + '$' + pnlD.toFixed(2);
              const pnlCol = pnlD > 0 ? '#4ade80' : pnlD < 0 ? '#f87171' : '#94a3b8';
              return `<div class="pfl-trade-row" data-idx="${idx}" style="padding:3px 2px;border-bottom:1px solid rgba(30,41,59,0.6);cursor:pointer" title="Click to drill into position math &amp; Kalshi link">
                <strong>${t.owner.split(' ')[0]}</strong> · <span style="color:${t.side === 'YES' ? '#4ade80' : '#f87171'};font-weight:700">${t.side}×${t.qty}</span> <code>${t.ticker}</code> @${t.entryCents}¢ → <strong>${t.markCents}¢</strong> (<span style="color:${pnlCol};font-weight:700">${pnlStr}</span> · Val $${valD} on $${costD})
              </div>`;
            })
            .join('');
        trEl.querySelectorAll('.pfl-trade-row').forEach((row) => {
          row.addEventListener('click', () => {
            const t = (d.trades || [])[Number(row.dataset.idx)];
            const drill = trEl.querySelector('#pfl-trade-drill');
            if (!t || !drill) return;
            const costD = ((t.qty * t.entryCents) / 100).toFixed(2);
            const valD = ((t.qty * t.markCents) / 100).toFixed(2);
            const maxPay = (t.qty * 1.0).toFixed(2);
            const pnlD = ((t.qty * (t.markCents - t.entryCents)) / 100);
            const seriesSlug = t.ticker.split('-')[0].toLowerCase();
            drill.style.display = 'block';
            drill.innerHTML = `
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
                <strong style="color:#38bdf8">🔍 ${t.owner} — ${t.title || t.ticker}</strong>
                <button type="button" class="pfl-std-cbtn" id="pfl-close-drill">✕</button>
              </div>
              <div><strong>Contract:</strong> <code>${t.ticker}</code> · <strong>Side:</strong> ${t.side} × ${t.qty} contracts (Max Payout $${maxPay})</div>
              <div><strong>Cost Basis:</strong> $${costD} (@${t.entryCents}¢) · <strong>Current Mark Value:</strong> $${valD} (@${t.markCents}¢) · <strong>Net P&amp;L:</strong> <strong style="color:${pnlD >= 0 ? '#4ade80' : '#f87171'}">${pnlD >= 0 ? '+' : ''}$${pnlD.toFixed(2)}</strong></div>
              <div style="color:#94a3b8;margin-top:2px"><strong>Thesis:</strong> ${t.thesis}</div>
              <div style="margin-top:4px;display:flex;gap:8px">
                <a href="https://kalshi.com/markets/${seriesSlug}" target="_blank" rel="noopener" style="color:#4ade80;font-weight:700">Open Live on Kalshi.com ↗</a>
                <a href="/kalshi-paper.html" target="_blank" rel="noopener" style="color:#38bdf8;font-weight:700">Open Candlestick Workbench ↗</a>
              </div>
            `;
            drill.querySelector('#pfl-close-drill')?.addEventListener('click', (e) => {
              e.stopPropagation();
              drill.style.display = 'none';
            });
            kalshiWin.body.querySelector('#pfl-bet-tkr').value = t.ticker;
            kalshiWin.body.querySelector('#pfl-bet-px').value = String(t.markCents || t.entryCents);
          });
        });
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


  // 4) Movable / Sizable Local Memory Palace, Uploaded Splats & Wyze Camera Vault (starts neatly minimized until clicked!)
  const vaultWin = createStandardBox({
    id: 'pfl-win-local-vault',
    title: '🏛️ LOCAL MEMORY PALACE, UPLOADED SPLATS & WYZE CAMERAS',
    defaultLeft: Math.max(40, window.innerWidth - 560),
    defaultTop: 435,
    defaultWidth: 530,
  });
  if (!saved['pfl-win-local-vault']) {
    vaultWin.box.classList.add('pfl-minimized');
    const mb = vaultWin.box.querySelector('[data-act="min"]');
    if (mb) mb.textContent = '▢';
  }
  vaultWin.body.innerHTML = `
    <div style="font-family:'Inter',system-ui,sans-serif;font-size:11.5px;color:#e2e8f0">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px">
        <span style="color:#d8b4fe;font-weight:700" id="pfl-vault-summary">Scanning local server splats &amp; Wyze cameras...</span>
        <div style="display:flex;gap:4px">
          <button type="button" class="pfl-std-cbtn" id="pfl-vault-embed-mp">🏛️ Embed Palace Here</button>
          <button type="button" class="pfl-std-cbtn" id="pfl-vault-refresh">↻ Rescan Disk</button>
        </div>
      </div>
      <div id="pfl-vault-iframe-wrap" style="display:none;margin-bottom:8px;border:1px solid rgba(168,85,247,0.5);border-radius:8px;overflow:hidden">
        <iframe id="pfl-vault-iframe" style="width:100%;height:300px;border:none;background:#050811"></iframe>
      </div>
      <div style="font-weight:700;color:#38bdf8;margin-bottom:3px">Uploaded Local 3D Splats &amp; GLB Scenes (Private to This Server):</div>
      <div id="pfl-vault-splats" style="max-height:145px;overflow:auto;border:1px solid #1e293b;border-radius:6px;padding:4px;font-size:10.5px;margin-bottom:6px">Loading...</div>
      <div style="font-weight:700;color:#4ade80;margin-bottom:3px">Local Wyze / RTSP Camera Frames &amp; Live Hooks:</div>
      <div id="pfl-vault-cams" style="max-height:110px;overflow:auto;border:1px solid #1e293b;border-radius:6px;padding:4px;font-size:10.5px">Loading...</div>
    </div>
  `;

  async function refreshLocalVault() {
    try {
      const r = await fetch('/api/pfl/local-vault');
      const d = await r.json();
      if (!d.ok) return;
      const sumEl = vaultWin.body.querySelector('#pfl-vault-summary');
      if (sumEl) sumEl.textContent = `● ${d.splatCount} Local 3D Splats/GLBs · ${d.yardFrameCount} Wyze Frames`;
      const spEl = vaultWin.body.querySelector('#pfl-vault-splats');
      if (spEl) {
        spEl.innerHTML = (d.splats || []).map((s) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 2px;border-bottom:1px solid rgba(30,41,59,0.65)">
            <span><strong>${s.name}</strong> <span style="color:#94a3b8">(${s.sizeMB} MB · ${s.ext.toUpperCase()})</span></span>
            <a href="${s.holodeckUrl}" target="_blank" rel="noopener" style="color:#d8b4fe;text-decoration:none;font-weight:700">Load 3D ↗</a>
          </div>
        `).join('');
      }
      const cmEl = vaultWin.body.querySelector('#pfl-vault-cams');
      if (cmEl) {
        const camRows = (d.cameras || []).map((c) => `
          <div style="padding:2px 0;border-bottom:1px solid rgba(30,41,59,0.65)">
            <strong style="color:#4ade80">🎥 ${c.name || c.id}</strong> · <span style="color:#94a3b8">${c.location || c.role || 'RTSP/Wyze'}</span>
          </div>
        `).join('');
        const frameRows = (d.yardFrames || []).map((f) => `
          <div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid rgba(30,41,59,0.5)">
            <span>📷 ${f.name} (${f.sizeMB} MB)</span>
            <a href="${f.url}" target="_blank" rel="noopener" style="color:#38bdf8;text-decoration:none">View ↗</a>
          </div>
        `).join('');
        cmEl.innerHTML = camRows + frameRows;
      }
    } catch {}
  }

  vaultWin.body.querySelector('#pfl-vault-refresh')?.addEventListener('click', refreshLocalVault);
  vaultWin.body.querySelector('#pfl-vault-embed-mp')?.addEventListener('click', () => {
    const wrap = vaultWin.body.querySelector('#pfl-vault-iframe-wrap');
    const ifr = vaultWin.body.querySelector('#pfl-vault-iframe');
    if (!wrap || !ifr) return;
    const opening = wrap.style.display === 'none';
    wrap.style.display = opening ? 'block' : 'none';
    if (opening && !ifr.src) ifr.src = '/memory-palace.html';
  });
  setTimeout(() => {
    document.getElementById('pfl-btn-vault-inline')?.addEventListener('click', () => {
      const isHidden = vaultWin.box.style.display === 'none' || vaultWin.box.classList.contains('pfl-minimized');
      vaultWin.box.style.display = isHidden ? 'flex' : 'none';
      if (isHidden) {
        vaultWin.box.classList.remove('pfl-minimized');
        const mb = vaultWin.box.querySelector('[data-act="min"]');
        if (mb) mb.textContent = '—';
        vaultWin.box.style.zIndex = '9690';
        refreshLocalVault();
      }
    });
  }, 450);
  refreshLocalVault();


  // 5) Movable / Sizable Live Wyze Video Patrol, Camera ON/OFF Rotation & Person/Vehicle Events
  const patrolWin = createStandardBox({
    id: 'pfl-win-wyze-patrol',
    title: '🎥 PFL LIVE WYZE VIDEO PATROL & MOTION EVENTS',
    defaultLeft: Math.max(40, window.innerWidth - 495),
    defaultTop: 110,
    defaultWidth: 465,
  });
  if (parseInt(patrolWin.box.style.height || '999', 10) < 120) patrolWin.box.style.height = '';
  patrolWin.body.innerHTML = `
    <div style="font-family:'Inter',system-ui,sans-serif;font-size:11.5px;color:#e2e8f0">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px">
        <span style="color:#4ade80;font-weight:700" id="pfl-patrol-status">● Live H.264 Stream Ready (wyze-cam-v4)</span>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button type="button" class="pfl-std-cbtn" id="pfl-patrol-rec20" style="border-color:#f43f5e;color:#fda4af" title="Record smooth 20fps 8-second H.264 clip directly from local go2rtc RTSP">⏺ Rec 8s (20fps)</button>
          <button type="button" class="pfl-std-cbtn" id="pfl-patrol-site" style="border-color:#38bdf8;color:#38bdf8" title="Filter between strictly 417 Palm Dr cameras vs shared Wyze cameras (Michael Mertz)">🏠 Yard Only</button>
          <button type="button" class="pfl-std-cbtn" id="pfl-patrol-cycle" style="border-color:#22c55e;color:#4ade80">⟳ Auto-Cycle: OFF</button>
          <button type="button" class="pfl-std-cbtn" id="pfl-patrol-pins" style="border-color:#fbbf24;color:#fde047">📍 3D Pins: ON</button>
          <button type="button" class="pfl-std-cbtn" id="pfl-patrol-sync" title="Pull latest Wyze cloud Person/Vehicle clips now">↻ Sync</button>
        </div>
      </div>
      <div style="position:relative;background:#020617;border:1px solid rgba(56,189,248,0.4);border-radius:8px;overflow:hidden;margin-bottom:6px">
        <video id="pfl-patrol-video" autoplay muted playsinline controls style="width:100%;max-height:215px;display:block;background:#000"></video>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px" id="pfl-patrol-cam-btns">
        <button type="button" class="pfl-std-cbtn" data-live-src="wyze-cam-v4" data-fly-lat="29.24753" data-fly-lon="-95.23144" data-fly-hdg="223" style="border-color:#38bdf8;color:#38bdf8">▶ V4 Front Yard</button>
        <button type="button" class="pfl-std-cbtn" data-live-src="back-yard-cam1" data-fly-lat="29.24751" data-fly-lon="-95.23130" data-fly-hdg="172">▶ Cam1 East Driveway &amp; RV</button>
        <button type="button" class="pfl-std-cbtn" data-live-src="back-yard-cam2" data-fly-lat="29.247640" data-fly-lon="-95.231380" data-fly-hdg="0">▶ Cam2 Bayou Dock</button>
        <button type="button" class="pfl-std-cbtn" data-live-src="hd" data-fly-lat="29.24756" data-fly-lon="-95.23136" data-fly-hdg="92" title="Standby until remounted on Monaco">▶ HD (Standby)</button>
      </div>
      <div style="font-weight:700;color:#cbd5e1;font-size:10.5px;margin-bottom:3px">Active 3D CCTV Rotation Checkboxes (Uncheck Sky/Idle Cams):</div>
      <div id="pfl-patrol-checks" style="display:flex;flex-wrap:wrap;gap:8px;padding:4px 6px;background:rgba(15,23,42,0.75);border:1px solid #1e293b;border-radius:6px;margin-bottom:6px;font-size:10.5px"></div>
      <div style="font-weight:700;color:#fbbf24;margin-bottom:3px">Captured Person &amp; Vehicle Events (Click to Play Clip &amp; Fly to Camera):</div>
      <div id="pfl-patrol-events" style="max-height:135px;overflow:auto;border:1px solid #1e293b;border-radius:6px;padding:4px;font-size:10.5px">Loading archived Wyze events...</div>
    </div>
  `;

  let activeLiveSrc = 'wyze-cam-v4';
  let patrolCycleOn = false;
  let patrolPinsOn = true;
  let enabledLiveSrcs = ['wyze-cam-v4', 'back-yard-cam1', 'back-yard-cam2'];
  const eventPinIds = [];

  function makeEventPinCanvas(label, sub) {
    const c = document.createElement('canvas');
    c.width = 220;
    c.height = 44;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(9, 14, 26, 0.88)';
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(2, 2, 216, 40, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fde047';
    ctx.font = '700 12px "JetBrains Mono", monospace';
    ctx.fillText(label.slice(0, 24), 10, 18);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '600 10px "Inter", sans-serif';
    ctx.fillText(sub.slice(0, 30), 10, 34);
    return c;
  }

  function playPatrolStream(src, labelText, mediaOverrideUrl = null) {
    const vid = patrolWin.body.querySelector('#pfl-patrol-video');
    const stEl = patrolWin.body.querySelector('#pfl-patrol-status');
    if (!vid) return;
    if (mediaOverrideUrl) {
      vid.src = mediaOverrideUrl;
      vid.play().catch(() => {});
      if (stEl) stEl.textContent = `🎬 Event Clip: ${labelText}`;
      return;
    }
    activeLiveSrc = src;
    vid.src = `/api/pfl/local-vault/wyze-live/${encodeURIComponent(src)}?t=${Date.now()}`;
    vid.play().catch(() => {});
    if (stEl) stEl.textContent = `● LIVE H.264: ${labelText || src}`;
    patrolWin.body.querySelectorAll('[data-live-src]').forEach((b) => {
      const match = b.getAttribute('data-live-src') === src;
      b.style.borderColor = match ? '#38bdf8' : 'rgba(148,163,184,0.35)';
      b.style.color = match ? '#38bdf8' : '#e2e8f0';
    });
  }

  function syncEventPinsToGlobe(events) {
    for (const id of eventPinIds) viewer?.entities?.removeById?.(id);
    eventPinIds.length = 0;
    if (!patrolPinsOn || !viewer?.entities) return;
    // Group latest event per camera with slight offset so pins never stack identically
    const seenPerCam = new Map();
    for (const ev of (events || []).filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon)).slice(0, 10)) {
      const n = seenPerCam.get(ev.camera) || 0;
      seenPerCam.set(ev.camera, n + 1);
      if (n >= 3) continue;
      const pid = `pfl-wyze-ev-${ev.id}`;
      const tagStr = (ev.tags || ['EVENT']).join('+');
      const timeShort = String(ev.occurredAt || '').slice(11, 19) || ev.day;
      const lat = Number(ev.lat || 29.24753) + n * 0.000018;
      const lon = Number(ev.lon || -95.23146) + n * 0.000018;
      let groundBase = -26.19;
      try {
        if (viewer.scene?.globe?.show !== false) {
          const h = viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(lon, lat));
          if (Number.isFinite(h)) groundBase = h;
        }
      } catch {}
      viewer.entities.add({
        id: pid,
        name: `🚨 ${tagStr} · ${ev.cameraLabel}`,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, groundBase + 3.2 + n * 1.4),
        billboard: {
          image: makeEventPinCanvas(`🚨 ${tagStr} (${timeShort})`, ev.camera),
          width: 155,
          height: 31,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: 800,
        },
      });
      eventPinIds.push(pid);
    }
    governorRequestRender('pfl-wyze-event-pins');
  }

  let patrolSiteFilter = 'liverpool';
  async function refreshWyzePatrol(triggerHarvest = false) {
    try {
      const r = await fetch(`/api/pfl/local-vault/wyze-events?site=${encodeURIComponent(patrolSiteFilter)}`, {
        method: triggerHarvest ? 'POST' : 'GET',
      });
      const d = await r.json();
      if (!d.ok) return;
      const checksEl = patrolWin.body.querySelector('#pfl-patrol-checks');
      if (checksEl && Array.isArray(d.allCameras)) {
        enabledLiveSrcs = d.allCameras.filter((c) => c.enabled).map((c) => c.src);
        checksEl.innerHTML = d.allCameras.map((c) => `
          <label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer">
            <input type="checkbox" class="pfl-cam-chk" value="${c.id}" ${c.enabled ? 'checked' : ''} />
            <span>${c.src === 'hd' ? 'HD (Sky/Monaco Standby)' : c.src}</span>
          </label>
        `).join('');
        checksEl.querySelectorAll('.pfl-cam-chk').forEach((chk) => {
          chk.addEventListener('change', async () => {
            const enabledIds = [...checksEl.querySelectorAll('.pfl-cam-chk:checked')].map((el) => el.value);
            if (!enabledIds.length) {
              chk.checked = true;
              return;
            }
            await fetch('/api/pfl/local-vault/wyze-cameras', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ enabledIds }),
            });
            refreshWyzePatrol(false);
          });
        });
      }
      const evEl = patrolWin.body.querySelector('#pfl-patrol-events');
      if (evEl) {
        const list = d.events || [];
        syncEventPinsToGlobe(list);
        evEl.innerHTML = list.length
          ? list.map((ev, idx) => {
              const tShort = String(ev.occurredAt || '').replace('T', ' ').slice(0, 19);
              const badge = (ev.tags || []).join(' · ');
              return `
                <div class="pfl-ev-row" data-idx="${idx}" style="display:flex;align-items:center;gap:6px;padding:4px 2px;border-bottom:1px solid rgba(30,41,59,0.7);cursor:pointer" title="Click to play captured video clip &amp; fly to camera">
                  ${ev.thumbUrl ? `<img src="${ev.thumbUrl}" style="width:54px;height:32px;object-fit:cover;border-radius:4px;border:1px solid #334155" loading="lazy" />` : ''}
                  <div style="flex:1;min-width:0">
                    <div style="color:#fde047;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">🚨 ${badge} — ${ev.camera}</div>
                    <div style="color:#94a3b8;font-size:10px">${tShort}</div>
                  </div>
                  <span style="color:#38bdf8;font-weight:700;font-size:10px">${ev.videoUrl ? '▶ Clip' : '📷 View'}</span>
                </div>
              `;
            }).join('')
          : '<div style="color:#94a3b8;padding:4px">No exterior events found yet.</div>';
        evEl.querySelectorAll('.pfl-ev-row').forEach((row) => {
          row.addEventListener('click', () => {
            const ev = (d.events || [])[Number(row.dataset.idx)];
            if (!ev) return;
            if (ev.videoUrl) {
              playPatrolStream(ev.camera, `${(ev.tags || []).join('+')} @ ${String(ev.occurredAt).slice(11, 19)}`, ev.videoUrl);
            } else if (ev.thumbUrl) {
              window.open(ev.thumbUrl, '_blank');
            }
            if (Number.isFinite(ev.lat) && Number.isFinite(ev.lon)) {
              try { viewer.trackedEntity = undefined; viewer.selectedEntity = undefined; } catch {}
              let base = 0;
              try {
                if (viewer.scene?.globe?.show === false) base = -26.19;
                else {
                  const h = viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(ev.lon, ev.lat));
                  if (Number.isFinite(h)) base = h;
                }
              } catch {}
              const hRad = Cesium.Math.toRadians(ev.headingDeg ?? 354);
              const backM = 16.0;
              const eyeLat = ev.lat - (Math.cos(hRad) * backM) / 110800;
              const eyeLon = ev.lon - (Math.sin(hRad) * backM) / (111320 * Math.cos((ev.lat * Math.PI) / 180));
              viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(eyeLon, eyeLat, base + 13.5),
                orientation: {
                  heading: hRad,
                  pitch: Cesium.Math.toRadians(-21),
                  roll: 0,
                },
                duration: 1.15,
              });
            }
          });
        });
      }
    } catch {}
  }

  patrolWin.body.querySelectorAll('[data-live-src]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const src = btn.getAttribute('data-live-src');
      playPatrolStream(src, btn.textContent.replace('▶ ', ''));
      const lat = Number(btn.getAttribute('data-fly-lat'));
      const lon = Number(btn.getAttribute('data-fly-lon'));
      const hdg = Number(btn.getAttribute('data-fly-hdg'));
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        let base = 0;
        try {
          if (viewer.scene?.globe?.show === false) base = -26.19;
          else {
            const h = viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(lon, lat));
            if (Number.isFinite(h)) base = h;
          }
        } catch {}
        try { viewer.trackedEntity = undefined; viewer.selectedEntity = undefined; } catch {}
        const hRad = Cesium.Math.toRadians(hdg ?? 354);
        const backM = 16.0;
        const eyeLat = lat - (Math.cos(hRad) * backM) / 110800;
        const eyeLon = lon - (Math.sin(hRad) * backM) / (111320 * Math.cos((lat * Math.PI) / 180));
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(eyeLon, eyeLat, base + 13.5),
          orientation: {
            heading: hRad,
            pitch: Cesium.Math.toRadians(-21),
            roll: 0,
          },
          duration: 1.1,
        });
      }
    });
  });

  patrolWin.body.querySelector('#pfl-patrol-cycle')?.addEventListener('click', (e) => {
    patrolCycleOn = !patrolCycleOn;
    e.currentTarget.textContent = patrolCycleOn ? '⟳ Auto-Cycle: ON (12s)' : '⟳ Auto-Cycle: OFF';
  });
  patrolWin.body.querySelector('#pfl-patrol-pins')?.addEventListener('click', (e) => {
    patrolPinsOn = !patrolPinsOn;
    e.currentTarget.textContent = patrolPinsOn ? '📍 3D Event Pins: ON' : '📍 3D Event Pins: OFF';
    refreshWyzePatrol(false);
  });
  patrolWin.body.querySelector('#pfl-patrol-rec20')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.textContent = '⏺ Recording 20fps...';
    try {
      const r = await fetch(`/api/pfl/local-vault/record-clip?src=${encodeURIComponent(activeLiveSrc)}&sec=8`, { method: 'POST' });
      const d = await r.json();
      await refreshWyzePatrol(false);
      if (d.ok && d.clip?.fname) {
        playPatrolStream(activeLiveSrc, `20fps Local Capture (${activeLiveSrc})`, `/api/pfl/local-vault/local-clip/${encodeURIComponent(d.clip.fname)}`);
      }
    } catch {}
    btn.textContent = '⏺ Rec 8s (20fps)';
  });
  patrolWin.body.querySelector('#pfl-patrol-site')?.addEventListener('click', (e) => {
    patrolSiteFilter = patrolSiteFilter === 'liverpool' ? 'all' : 'liverpool';
    e.currentTarget.textContent = patrolSiteFilter === 'liverpool' ? '🏠 Yard Only' : '🌐 Yard + Shared';
    refreshWyzePatrol(false);
  });
  patrolWin.body.querySelector('#pfl-patrol-sync')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.textContent = '⏳ Syncing...';
    await refreshWyzePatrol(true);
    btn.textContent = '↻ Sync Events';
  });

  const patrolCycleTimer = setInterval(() => {
    if (!patrolCycleOn || patrolWin.box.style.display === 'none' || patrolWin.box.classList.contains('pfl-minimized')) return;
    if (!enabledLiveSrcs.length) return;
    const idx = (enabledLiveSrcs.indexOf(activeLiveSrc) + 1) % enabledLiveSrcs.length;
    playPatrolStream(enabledLiveSrcs[idx], enabledLiveSrcs[idx]);
  }, 12000);


  // 6) 3D Backyard Live Oak Trees, Wooden Bayou Dock & PID 214140 Lot Outline (Anchored to Brazoria CAD Ortho)
  const yardLandmarkIds = [];
  function buildYard3dLandmarks() {
    if (!viewer?.entities) return;
    for (const id of yardLandmarkIds) viewer.entities.removeById(id);
    yardLandmarkIds.length = 0;

    let gBase = -26.19;
    try {
      if (viewer.scene?.globe?.show !== false) {
        const h = viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(-95.23138, 29.24768));
        if (Number.isFinite(h)) gBase = h;
      }
    } catch {}

    const oaks = [
      // West Live Oak (left trunk in Cam2 view, framing the left edge of dock & water)
      { id: 'pfl-oak-west', name: '🌳 Backyard West Live Oak (Cam2 Left Frame)', lat: 29.247705, lon: -95.231430, trunkH: 4.2, crownR: 4.8, crownH: 6.4 },
      // East Live Oak (forked foreground tree on right side of Cam2 view, right beside smoker/white box)
      { id: 'pfl-oak-east', name: '🌳 Backyard East Forked Live Oak (Cam2 Right Frame)', lat: 29.247695, lon: -95.231325, trunkH: 4.5, crownR: 4.6, crownH: 6.8 },
    ];

    for (const t of oaks) {
      const tid = `${t.id}-trunk`;
      const cid = `${t.id}-crown`;
      viewer.entities.add({
        id: tid,
        name: t.name,
        position: Cesium.Cartesian3.fromDegrees(t.lon, t.lat, gBase + t.trunkH * 0.5),
        cylinder: {
          length: t.trunkH,
          topRadius: 0.28,
          bottomRadius: 0.42,
          material: Cesium.Color.fromCssColorString('#4a3525').withAlpha(0.92),
        },
      });
      viewer.entities.add({
        id: cid,
        name: t.name,
        position: Cesium.Cartesian3.fromDegrees(t.lon, t.lat, gBase + t.trunkH + t.crownH * 0.38),
        ellipsoid: {
          radii: new Cesium.Cartesian3(t.crownR, t.crownR * 0.92, t.crownH * 0.52),
          material: Cesium.Color.fromCssColorString('#1e4620').withAlpha(0.52),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#4ade80').withAlpha(0.35),
        },
      });
      yardLandmarkIds.push(tid, cid);
    }

    // Wooden Bayou Dock at exact ortho shoreline (29.24779, -95.23138)
    const dockId = 'pfl-bayou-dock-3d';
    viewer.entities.add({
      id: dockId,
      name: '⚓ 417 Palm Dr Chocolate Bayou Dock',
      position: Cesium.Cartesian3.fromDegrees(-95.231380, 29.247792, gBase + 0.35),
      orientation: Cesium.Transforms.headingPitchRollQuaternion(
        Cesium.Cartesian3.fromDegrees(-95.231380, 29.247792, gBase + 0.35),
        new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(354), 0, 0),
      ),
      box: {
        dimensions: new Cesium.Cartesian3(4.2, 5.4, 0.35),
        material: Cesium.Color.fromCssColorString('#7c5c3e').withAlpha(0.85),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.75),
      },
    });
    yardLandmarkIds.push(dockId);
  }
  buildYard3dLandmarks();
  window.addEventListener('gev:map-stack-changed', () => setTimeout(buildYard3dLandmarks, 400));

  playPatrolStream('wyze-cam-v4', 'Wyze Cam V4 (Front Yard & Driveway)');
  refreshWyzePatrol(false);

  return {
    destroy() {
      clearInterval(timer);
      clearInterval(kalshiPoll);
      clearInterval(patrolCycleTimer);
      cancelAnimationFrame(rafId);
      pickHandler.destroy();
      for (const el of createdEls) el.remove();
    },
  };
}
