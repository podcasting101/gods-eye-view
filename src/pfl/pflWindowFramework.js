import * as Cesium from 'cesium';
import {
  holdContinuousRender,
  releaseContinuousRender,
  governorRequestRender,
} from '../renderGovernor.js';
import { activeYardDatumM } from './yardFrames.js';

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
  if (typeof window !== 'undefined') window.__pflViewer = viewer;

  const saved = loadSavedLayout();
  const createdEls = [];
  let rafId = 0;

  const style = document.createElement('style');
  style.id = 'pfl-std-window-styles';
  style.textContent = `
    .pfl-std-box {
      position: fixed !important;
      z-index: 9400;
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
      max-height: calc(100vh - 68px);
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
  let unlockDroneCamera = () => {
    try { viewer?.camera?.lookAtTransform?.(Cesium.Matrix4.IDENTITY); } catch {}
  };
  let openHolodeckHallway = () => {};
  let openMlsWalkthrough = () => {};
  let toggleMarineVhfPanel = () => {};

  const cmdWin = createStandardBox({
    id: 'pfl-win-command-dock',
    title: 'PFL SOVEREIGN COMMAND DOCK (3 NODES + KALSHI + 3D TOOLS)',
    defaultLeft: 18,
    defaultTop: 58,
    defaultWidth: 760,
  });

  // 🧲 Gather Boxes: snap every floating PFL box (esp. the 3D Compass) back inside the viewport in one click
  function gatherBoxes() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const boxes = [...document.querySelectorAll('.pfl-std-box')];
    for (const box of boxes) {
      if (box.style.display === 'none') continue;
      const w = Math.min(box.offsetWidth || 300, vw - 16);
      const hdrH = 36;
      let left = parseInt(box.style.left, 10);
      let top = parseInt(box.style.top, 10);
      if (!Number.isFinite(left)) left = 12;
      if (!Number.isFinite(top)) top = 58;
      left = Math.max(8, Math.min(left, vw - w - 8));
      top = Math.max(48, Math.min(top, vh - hdrH - 8));
      box.style.left = `${Math.round(left)}px`;
      box.style.top = `${Math.round(top)}px`;
      saved[box.id] = { ...(saved[box.id] || {}), left: Math.round(left), top: Math.round(top), width: Math.round(w) };
    }
    // The compass inspector is the one Paul loses: always bring it back, open, at the right edge
    const cbox = compassWin?.box;
    if (cbox) {
      cbox.style.display = 'flex';
      cbox.classList.remove('pfl-minimized');
      const mb = cbox.querySelector('[data-act="min"]');
      if (mb) mb.textContent = '—';
      const w = Math.min(cbox.offsetWidth || 292, vw - 16);
      const left = Math.max(8, vw - w - 20);
      cbox.style.left = `${left}px`;
      cbox.style.top = '58px';
      cbox.style.zIndex = '9660';
      saved[cbox.id] = { ...(saved[cbox.id] || {}), left, top: 58, width: Math.round(w), minimized: false };
    }
    saveLayout(saved);
    governorRequestRender('pfl-gather-boxes');
  }
  window.__pflGatherBoxes = gatherBoxes;
  {
    const ctrlsEl = cmdWin.box.querySelector('.pfl-std-ctrls');
    const gatherBtn = document.createElement('button');
    gatherBtn.type = 'button';
    gatherBtn.id = 'pfl-btn-gather-boxes';
    gatherBtn.className = 'pfl-std-cbtn';
    gatherBtn.title = 'Snap every floating PFL box back into view';
    gatherBtn.textContent = '🧲 Gather Boxes';
    gatherBtn.style.cssText = 'border-color:#facc15;color:#fde047';
    gatherBtn.addEventListener('click', gatherBoxes);
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.id = 'pfl-btn-reset-layout';
    resetBtn.className = 'pfl-std-cbtn';
    resetBtn.title = 'Forget saved window positions and reload the default layout';
    resetBtn.textContent = '♻️ Reset Layout';
    resetBtn.addEventListener('click', () => {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      window.location.reload();
    });
    ctrlsEl?.prepend(gatherBtn, resetBtn);
  }

  setTimeout(() => {
    const f15Bar = document.querySelector('.pfl-f15-bar');
    if (f15Bar) cmdWin.body.appendChild(f15Bar);

    const extraRow = document.createElement('div');
    extraRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;padding-top:6px;border-top:1px solid rgba(56,189,248,0.22);';
    extraRow.innerHTML = `
      <button type="button" class="pfl-f15-btn" id="pfl-btn-walk-inside-house" style="border-color:#fbbf24;color:#fde047;font-weight:700" title="Open interactive 32-photo 2-story floor plan &amp; guided room-by-room 3D walkthrough of 417 Palm Drive">🏠 Walk Inside 417 Palm Dr (32-Photo Floor Plan &amp; ▶ Auto-Tour)</button>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-marine-vhf" style="border-color:#22d3ee;color:#67e8f9;font-weight:700" title="Open USCG Houston-Galveston / Chocolate Bayou Marine VHF &amp; Live AIS / Radio Browser Scanner">📻 Marine VHF &amp; Chocolate Bayou Scanner</button>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-kalshi-inline" style="border-color:#22c55e;color:#4ade80;font-weight:700">📈 Kalshi Paper Arena (Show / Hide)</button>
      <a href="/kalshi-paper.html" target="_blank" rel="noopener" class="pfl-f15-btn" id="pfl-btn-kalshi-tab" style="border-color:#38bdf8;color:#38bdf8;text-decoration:none;display:inline-flex;align-items:center">↗ Full TradingView &amp; Kalshi Tab</a>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-wyze-patrol" style="border-color:#f97316;color:#fdba74;font-weight:700">🎥 Live Wyze Patrol &amp; 4D Scrubber</button>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-balcony-front" style="border-color:#38bdf8;color:#7dd3fc;font-weight:700" title="Lock 3D view onto your 2nd-story Balcony looking across the stitched Front Yard, Neighbor's House &amp; Horizon">🏠 Balcony Front Splat</button>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-flip-backyard" style="border-color:#2dd4bf;color:#5eead4;font-weight:700" title="180° flip over the roof to your Backyard Oaks, Boat Dock &amp; Chocolate Bayou">🔄 Flip 180° Backyard</button>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-live-restitch" style="border-color:#c084fc;color:#e9d5ff" title="Grab fresh frames from Cam1 + V4 right now and rebuild the live stitched ground splat">🧵 Rebuild Live Stitch</button>
      <button type="button" class="pfl-f15-btn active" id="pfl-btn-always3d" style="border-color:#22c55e;color:#4ade80;font-weight:700" title="Keep your Wyze cameras projected in 3D space 24/7 even when CCTV is turned OFF">👁️ Always-On 3D Cams: ON</button>
      <button type="button" class="pfl-f15-btn active" id="pfl-btn-static-yard" title="Show/hide the stitched front yard ground splat">🧩 Ground Splat: ON</button>
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
        staticYardBtn.textContent = vis ? '🧩 Ground Splat: ON' : '🧩 Ground Splat: OFF';
        staticYardBtn.classList.toggle('active', vis);
      }
    };
    syncStaticBtn();

    function flyBalconyFront() {
      unlockDroneCamera();
      try { viewer.trackedEntity = undefined; viewer.selectedEntity = undefined; } catch {}
      let base = 0;
      try {
        if (viewer.scene?.globe?.show === false) base = -26.19;
        else {
          const h = viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(-95.23136, 29.24764));
          if (Number.isFinite(h)) base = h;
        }
      } catch {}
      // Paul's 2nd-story Balcony vantage looking SSW (198°) across the stitched Front Yard (Cam1+V4), Neighbor's House & Horizon!
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(-95.23134, 29.24782, base + 22.0),
        orientation: {
          heading: Cesium.Math.toRadians(198),
          pitch: Cesium.Math.toRadians(-22),
          roll: 0,
        },
        duration: 1.15,
      });
    }
    function flyBackyard180() {
      unlockDroneCamera();
      try { viewer.trackedEntity = undefined; viewer.selectedEntity = undefined; } catch {}
      let base = 0;
      try {
        if (viewer.scene?.globe?.show === false) base = -26.19;
        else {
          const h = viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(-95.231385, 29.24764));
          if (Number.isFinite(h)) base = h;
        }
      } catch {}
      // 180° flip over the house roof looking 7.5° NNE through the two 3D Live Oak trees onto the Boat Dock & Chocolate Bayou!
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(-95.23141, 29.24748, base + 14.5),
        orientation: {
          heading: Cesium.Math.toRadians(7.5),
          pitch: Cesium.Math.toRadians(-22),
          roll: 0,
        },
        duration: 1.15,
      });
    }
    window.__pflFlyBalconyFront = flyBalconyFront;
    window.__pflFlyBackyard180 = flyBackyard180;
    extraRow.querySelector('#pfl-btn-balcony-front')?.addEventListener('click', flyBalconyFront);
    extraRow.querySelector('#pfl-btn-flip-backyard')?.addEventListener('click', flyBackyard180);
    extraRow.querySelector('#pfl-btn-live-restitch')?.addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      btn.textContent = '⏳ Stitching Cam1+V4...';
      try {
        const r = await fetch('/api/pfl/local-vault/live-stitch', { method: 'POST' });
        const d = await r.json();
        if (d.ok && typeof window.__pflReloadLiveStitchedYard === 'function') {
          window.__pflReloadLiveStitchedYard(d.groundUrl);
        }
      } catch {}
      btn.textContent = '🧵 Rebuild Live Stitch';
      syncStaticBtn();
    });

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
    extraRow.querySelector('#pfl-btn-walk-inside-house')?.addEventListener('click', () => {
      openMlsWalkthrough();
    });
    extraRow.querySelector('#pfl-btn-marine-vhf')?.addEventListener('click', () => {
      toggleMarineVhfPanel();
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
    title: 'PFL 3D COMPASS, DRONE ORBIT, LENS & PADS',
    defaultLeft: Math.max(20, window.innerWidth - 312),
    defaultTop: 58,
    defaultWidth: 292,
  });
  compassWin.box.style.zIndex = '9660';
  compassWin.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;font-family:'JetBrains Mono',monospace;font-size:11px;color:#cbd5e1">
      <div id="pfl-eye-elev-banner" style="width:100%;box-sizing:border-box;background:rgba(6,78,59,0.55);border:1.5px solid rgba(74,222,128,0.75);border-radius:7px;padding:6px 8px;text-align:center;font-size:13.5px;font-weight:800;color:#4ade80;letter-spacing:0.02em;line-height:1.25" title="Live Camera Height Above Ground Level (Meters &amp; Feet) + Optical Lens FOV">EYE: 1.8 m (5.9 ft) AGL · FOV: 60°</div>
      <canvas id="pfl-axis-globe" width="136" height="136" style="cursor:pointer;border-radius:50%" title="Click N/S/E/W/UP or drag to orbit camera"></canvas>
      <div id="pfl-cam-readout" style="text-align:center;font-size:10px;color:#94a3b8;line-height:1.35">CAM READY</div>
      <div style="width:100%;border-top:1px solid rgba(56,189,248,0.25);padding-top:6px">
        <div style="color:#fbbf24;font-weight:700;margin-bottom:4px">🎯 Move Object / Memory Photo:</div>
        <div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:5px">
          <button type="button" class="pfl-std-cbtn" data-pfl-pick="lisa" title="Select Lisa Muse avatar">👑 Lisa</button>
          <button type="button" class="pfl-std-cbtn" data-pfl-pick="chair" title="Select Wooden Chair & Sign">🪑 Chair</button>
          <button type="button" class="pfl-std-cbtn" id="pfl-pick-house" data-pfl-pick="house" title="Select 3D 417 Palm Drive Yellow House">🏠 House</button>
          <button type="button" class="pfl-std-cbtn" id="pfl-pick-monaco" data-pfl-pick="monaco" title="Select 3D Monaco 40ft Coach RV in East Driveway">🚌 Monaco</button>
          <button type="button" class="pfl-std-cbtn" data-pfl-pick="bed-station-20261012" title="Select Paul & Lisa Bed Photo">🛏️ Bed</button>
          <button type="button" class="pfl-std-cbtn" data-pfl-pick="garage-carport-20261117" title="Select Garage Carport Photo">🚗 Garage</button>
        </div>
        <div id="pfl-sel-name" style="color:#4ade80;margin-bottom:4px;font-size:10px">Click 3D avatar/chair/photo or chip above</div>
        <div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:5px">
          <button type="button" class="pfl-std-cbtn" id="pfl-drag-place-btn" title="When ON, click anywhere on the ground/roof to place selected object there!">✋ Click-to-Place: OFF</button>
          <button type="button" class="pfl-std-cbtn" data-pfl-obj-nudge="0,0.6">⬆️N</button>
          <button type="button" class="pfl-std-cbtn" data-pfl-obj-nudge="0,-0.6">⬇️S</button>
          <button type="button" class="pfl-std-cbtn" data-pfl-obj-nudge="-0.6,0">⬅️W</button>
          <button type="button" class="pfl-std-cbtn" data-pfl-obj-nudge="0.6,0">➡️E</button>
        </div>
        <label style="display:flex;justify-content:space-between"><span>Heading (°)</span><span id="pfl-hdg-val">154°</span></label>
        <input type="range" id="pfl-hdg-slider" min="0" max="360" step="1" value="154" style="width:100%" />
        <label style="display:flex;justify-content:space-between;margin-top:4px"><span>Height / Lift (m)</span><span id="pfl-alt-val">0.0m</span></label>
        <input type="range" id="pfl-alt-slider" min="-5" max="18" step="0.25" value="0" style="width:100%" />
        <label style="display:flex;justify-content:space-between;margin-top:4px"><span>📐 Size / Scale</span><span id="pfl-scale-val">1.00×</span></label>
        <input type="range" id="pfl-scale-slider" min="0.4" max="2.5" step="0.05" value="1" style="width:100%;accent-color:#fbbf24" title="Resize the selected photo / 3D model (0.4× – 2.5×)" />
        <div id="pfl-hotspot-actions" style="display:none;gap:3px;flex-wrap:wrap;margin-top:6px;padding:5px;border:1px solid rgba(250,204,21,0.6);border-radius:7px;background:rgba(250,204,21,0.08)">
          <span style="width:100%;color:#fde047;font-weight:700;font-size:10px">✨ Hotspot Actions</span>
          <button type="button" class="pfl-std-cbtn" id="pfl-hs-walk-house" style="display:none;border-color:#fbbf24;color:#fde047" title="Open interactive 32-photo 2-story floor plan &amp; ▶ Auto-Tour inside 417 Palm Drive">🏠 Walk Inside 417 Palm Dr (32-Photo Floor Plan &amp; ▶ Auto-Tour)</button>
          <button type="button" class="pfl-std-cbtn" id="pfl-hs-play" title="Open the selected photo's source frame / live feed">🎬 Action / Play</button>
          <button type="button" class="pfl-std-cbtn" id="pfl-hs-orbit" title="Send the telepresence drone to orbit this object">🚁 Orbit</button>
          <button type="button" class="pfl-std-cbtn" id="pfl-hs-spin" title="Rotate the selected object 90°">🔄 Spin 90°</button>
          <button type="button" class="pfl-std-cbtn" id="pfl-hs-resize" title="Jump to the Size / Scale slider">📐 Resize</button>
        </div>
      </div>
    </div>
  `;

  let activeMovable = null;
  let clickToPlaceMode = false;

  // Helper to resolve the ONE yard datum shared with yardFrames.js so photos, 3D House, Monaco, pads & AGL all agree
  function resolveLocalGroundM(lonDeg = -95.23144, latDeg = 29.24750) {
    try {
      const d = activeYardDatumM(viewer, lonDeg, latDeg);
      if (Number.isFinite(d)) return d;
    } catch {}
    return -26.19;
  }

  // 1S788 Holodeck Hallway Portal Window (:8766 Stargate Room Map & Launchpad — 100% CSP-Clean Native DOM)
  const HOLODECK_HALLWAY_URL = 'http://127.0.0.1:8766/?file=splats/take1-room-capture.spz';
  let activeHolodeckUrl = HOLODECK_HALLWAY_URL;
  const holodeckWin = createStandardBox({
    id: 'pfl-win-holodeck-portal',
    title: '🚪 1S788 HOLODECK HALLWAY PORTAL (:8766)',
    defaultLeft: Math.max(40, Math.round((window.innerWidth - 620) * 0.5)),
    defaultTop: 84,
    defaultWidth: 620,
  });
  holodeckWin.box.style.display = 'none';
  holodeckWin.body.innerHTML = `
    <div id="pfl-holodeck-stargate-map" data-holodeck-target="${HOLODECK_HALLWAY_URL}" style="font-family:'Inter',system-ui,sans-serif;font-size:11.5px;color:#e2e8f0">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px">
        <span style="color:#67e8f9;font-weight:700">🌀 1S788 Carport Breezeway → 3D Gaussian Splat Holodeck (:8766)</span>
        <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap">
          <button type="button" class="pfl-std-cbtn" id="pfl-holodeck-step-in" style="background:rgba(34,211,238,0.18);border-color:#22d3ee;color:#67e8f9;padding:3px 8px">🚪 Walk Into Hallway Now (:8766)</button>
          <a href="${HOLODECK_HALLWAY_URL}" target="_blank" rel="noopener" class="pfl-std-cbtn" id="pfl-holodeck-fulltab" style="border-color:#a855f7;color:#e9d5ff;text-decoration:none;padding:3px 8px">↗ Open in New Tab</a>
          <button type="button" class="pfl-std-cbtn" id="pfl-holodeck-close" style="border-color:#f43f5e;color:#fda4af">✕ Close</button>
        </div>
      </div>
      <div style="padding:12px;border:1.5px solid rgba(34,211,238,0.45);border-radius:10px;background:radial-gradient(circle at 50% 35%, rgba(34,211,238,0.14), rgba(88,28,135,0.20) 52%, rgba(3,7,18,0.96) 100%)">
        <div style="text-align:center;font-family:'JetBrains Mono',monospace;font-size:11px;color:#a5f3fc;margin-bottom:10px">
          ● STARGATE DOOR GRAPH ONLINE · BIDIRECTIONAL RETURN TO <code>:4173</code> ACTIVE
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px">
          <div style="padding:8px 10px;border:1px solid rgba(34,211,238,0.55);border-radius:8px;background:rgba(9,14,26,0.86);display:flex;flex-direction:column;gap:4px">
            <strong style="color:#67e8f9">🚪 1. Entry Hallway (<code>take1-room-capture.spz</code>)</strong>
            <span style="font-size:10.5px;color:#94a3b8">1S788 carport threshold · Doors to Main Hall, Command Center &amp; 417 Palm Dr Yard</span>
            <div style="display:flex;gap:5px;margin-top:2px">
              <button type="button" class="pfl-std-cbtn" data-pfl-holo-nav="http://127.0.0.1:8766/?file=splats/take1-room-capture.spz" style="border-color:#22d3ee;color:#67e8f9">Step In →</button>
              <a href="http://127.0.0.1:8766/?file=splats/take1-room-capture.spz" target="_blank" rel="noopener" class="pfl-std-cbtn" style="text-decoration:none">New Tab ↗</a>
            </div>
          </div>
          <div style="padding:8px 10px;border:1px solid rgba(168,85,247,0.55);border-radius:8px;background:rgba(9,14,26,0.86);display:flex;flex-direction:column;gap:4px">
            <strong style="color:#e9d5ff">🏛️ 2. Main Hall (<code>take3-main-hall.spz</code>)</strong>
            <span style="font-size:10.5px;color:#94a3b8">Central interior corridor · Connects Entry Hallway, Alt Angle &amp; Lisa Command Center</span>
            <div style="display:flex;gap:5px;margin-top:2px">
              <button type="button" class="pfl-std-cbtn" data-pfl-holo-nav="http://127.0.0.1:8766/?file=splats/take3-main-hall.spz" style="border-color:#a855f7;color:#e9d5ff">Step In →</button>
              <a href="http://127.0.0.1:8766/?file=splats/take3-main-hall.spz" target="_blank" rel="noopener" class="pfl-std-cbtn" style="text-decoration:none">New Tab ↗</a>
            </div>
          </div>
          <div style="padding:8px 10px;border:1px solid rgba(74,222,128,0.55);border-radius:8px;background:rgba(9,14,26,0.86);display:flex;flex-direction:column;gap:4px">
            <strong style="color:#86efac">👑 3. Lisa Command Center (<code>lisa-command-center.spz</code>)</strong>
            <span style="font-size:10.5px;color:#94a3b8">Sovereign bridge · Doors to Main Hall, Arcade Spaceship &amp; 417 Palm Dr Yard</span>
            <div style="display:flex;gap:5px;margin-top:2px">
              <button type="button" class="pfl-std-cbtn" data-pfl-holo-nav="http://127.0.0.1:8766/?file=splats/lisa-command-center.spz" style="border-color:#4ade80;color:#86efac">Step In →</button>
              <a href="http://127.0.0.1:8766/?file=splats/lisa-command-center.spz" target="_blank" rel="noopener" class="pfl-std-cbtn" style="text-decoration:none">New Tab ↗</a>
            </div>
          </div>
          <div style="padding:8px 10px;border:1px solid rgba(251,191,36,0.55);border-radius:8px;background:rgba(9,14,26,0.86);display:flex;flex-direction:column;gap:4px">
            <strong style="color:#fde047">🕹️ 4. Arcade Spaceship (<code>arcade_spaceship.spz</code>)</strong>
            <span style="font-size:10.5px;color:#94a3b8">Starship deck · Return portal wired back to Lisa Command Center</span>
            <div style="display:flex;gap:5px;margin-top:2px">
              <button type="button" class="pfl-std-cbtn" data-pfl-holo-nav="http://127.0.0.1:8766/?file=splats/arcade_spaceship.spz" style="border-color:#fbbf24;color:#fde047">Step In →</button>
              <a href="http://127.0.0.1:8766/?file=splats/arcade_spaceship.spz" target="_blank" rel="noopener" class="pfl-std-cbtn" style="text-decoration:none">New Tab ↗</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  function closeHolodeckHallway() {
    holodeckWin.box.style.display = 'none';
  }
  openHolodeckHallway = (customUrl = HOLODECK_HALLWAY_URL, launchTab = false) => {
    activeHolodeckUrl = customUrl || HOLODECK_HALLWAY_URL;
    holodeckWin.box.style.display = 'flex';
    holodeckWin.box.classList.remove('pfl-minimized');
    const mb = holodeckWin.box.querySelector('[data-act="min"]');
    if (mb) mb.textContent = '—';
    holodeckWin.box.style.zIndex = '9750';
    const mapRoot = holodeckWin.body.querySelector('#pfl-holodeck-stargate-map');
    const fullLink = holodeckWin.body.querySelector('#pfl-holodeck-fulltab');
    if (mapRoot) mapRoot.setAttribute('data-holodeck-target', activeHolodeckUrl);
    if (fullLink) fullLink.href = activeHolodeckUrl;
    if (launchTab) {
      try { window.open(activeHolodeckUrl, '_blank', 'noopener'); } catch {}
    }
  };
  holodeckWin.body.querySelector('#pfl-holodeck-step-in')?.addEventListener('click', () => {
    window.location.href = activeHolodeckUrl;
  });
  holodeckWin.body.querySelectorAll('[data-pfl-holo-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-pfl-holo-nav');
      if (target) window.location.href = target;
    });
  });
  holodeckWin.body.querySelector('#pfl-holodeck-close')?.addEventListener('click', closeHolodeckHallway);
  window.__pflOpenHolodeckHallway = openHolodeckHallway;

  // Remote Drone Telepresence Orbit State & Target Resolver
  let preDronePose = null;
  const droneOrbitState = {
    active: false,
    targetKey: 'lisa',
    targetLabel: '👑 Lisa Muse',
    azimuthDeg: 12,
    pitchDeg: -14,
    rangeM: 3.0,
  };

  function resolveDroneTarget(targetKey) {
    if (targetKey === 'lisa') {
      const st = window.__pflMovables?.lisa?.getState?.() || { lat: 29.247436, lon: -95.231445, heading: 192, lift: 0 };
      const lisaEnt = viewer?.entities?.getById?.('lisa-muse-sovereign-anchor');
      if (lisaEnt?.position) {
        try {
          const cart = typeof lisaEnt.position.getValue === 'function'
            ? lisaEnt.position.getValue(Cesium.JulianDate.now())
            : lisaEnt.position;
          if (cart) {
            const cg = Cesium.Cartographic.fromCartesian(cart);
            const feetAlt = cg.height - 0.998;
            return {
              key: 'lisa',
              label: '👑 Lisa Muse',
              lon: Cesium.Math.toDegrees(cg.longitude),
              lat: Cesium.Math.toDegrees(cg.latitude),
              alt: feetAlt,
              defaultAz: ((Number(st.heading ?? 192) + 180) % 360 + 360) % 360,
              defaultPitch: -14,
              defaultRange: 3.0,
            };
          }
        } catch {}
      }
      const alt = resolveLocalGroundM(st.lon, st.lat) + 0.8 + Number(st.lift || 0);
      return {
        key: 'lisa',
        label: '👑 Lisa Muse',
        lon: st.lon,
        lat: st.lat,
        alt,
        defaultAz: ((Number(st.heading ?? 192) + 180) % 360 + 360) % 360,
        defaultPitch: -14,
        defaultRange: 3.0,
      };
    }
    if (targetKey === 'chair') {
      const st = window.__pflMovables?.chair?.getState?.() || { lat: 29.2475, lon: -95.23145, heading: 0, lift: 0 };
      const alt = resolveLocalGroundM(st.lon, st.lat) + 0.8 + Number(st.lift || 0);
      return {
        key: 'chair',
        label: '🪑 Wooden Chair',
        lon: st.lon,
        lat: st.lat,
        alt,
        defaultAz: 16,
        defaultPitch: -18,
        defaultRange: 3.2,
      };
    }
    if (targetKey === 'selected' && activeMovable) {
      const st = activeMovable.getState();
      const scaleK = Number(st.scale) > 0 ? Number(st.scale) : 1;
      return {
        key: 'selected',
        label: activeMovable.label || 'Selected',
        lon: st.lon,
        lat: st.lat,
        alt: resolveLocalGroundM(st.lon, st.lat) + Number(st.lift || 0) - 0.6,
        defaultAz: ((Number(st.heading ?? 0) + 160) % 360 + 360) % 360,
        defaultPitch: -35,
        defaultRange: Math.max(2.4, 4.2 * scaleK),
      };
    }
    if (targetKey === 'house') {
      const st = window.__pflMovables?.house?.getState?.() || { lat: 29.247595, lon: -95.231385, heading: 0, lift: 0 };
      const alt = resolveLocalGroundM(st.lon, st.lat) + Number(st.lift || 0) + 3.2;
      return {
        key: 'house',
        label: '🏠 417 Palm Dr House',
        lon: st.lon,
        lat: st.lat,
        alt,
        defaultAz: 15,
        defaultPitch: -24,
        defaultRange: 18.5,
      };
    }
    if (targetKey === 'monaco') {
      const st = window.__pflMovables?.monaco?.getState?.() || { lat: 29.247510, lon: -95.231268, heading: 175, lift: 0 };
      const alt = resolveLocalGroundM(st.lon, st.lat) + Number(st.lift || 0) + 0.8;
      return {
        key: 'monaco',
        label: '🚌 Monaco 40ft Coach',
        lon: st.lon,
        lat: st.lat,
        alt,
        defaultAz: ((Number(st.heading ?? 175) + 145) % 360 + 360) % 360,
        defaultPitch: -20,
        defaultRange: 10.5,
      };
    }
    if (targetKey === 'carport') {
      const lon = -95.231395;
      const lat = 29.247518;
      const alt = resolveLocalGroundM(lon, lat);
      return {
        key: 'carport',
        label: '🚗 RV / 1S788 Carport',
        lon,
        lat,
        alt,
        defaultAz: 355,
        defaultPitch: -22,
        defaultRange: 6.5,
      };
    }
    // Bayou Dock ('dock')
    const dockEnt = viewer?.entities?.getById?.('pfl-bayou-dock-3d');
    if (dockEnt?.position) {
      try {
        const cart = typeof dockEnt.position.getValue === 'function'
          ? dockEnt.position.getValue(Cesium.JulianDate.now())
          : dockEnt.position;
        if (cart) {
          const cg = Cesium.Cartographic.fromCartesian(cart);
          return {
            key: 'dock',
            label: '⚓ Bayou Dock',
            lon: Cesium.Math.toDegrees(cg.longitude),
            lat: Cesium.Math.toDegrees(cg.latitude),
            alt: cg.height - 0.35,
            defaultAz: 7.5,
            defaultPitch: -24,
            defaultRange: 7.5,
          };
        }
      } catch {}
    }
    const lon = -95.231380;
    const lat = 29.247792;
    return {
      key: 'dock',
      label: '⚓ Bayou Dock',
      lon,
      lat,
      alt: resolveLocalGroundM(lon, lat),
      defaultAz: 7.5,
      defaultPitch: -24,
      defaultRange: 7.5,
    };
  }

  function syncDroneUi() {
    const stEl = compassWin.body?.querySelector?.('#pfl-drone-status');
    if (stEl) {
      stEl.textContent = droneOrbitState.active ? `LOCKED: ${droneOrbitState.targetLabel}` : 'FREE CAM';
      stEl.style.color = droneOrbitState.active ? '#4ade80' : '#94a3b8';
    }
    const azSl = compassWin.body?.querySelector?.('#pfl-drone-az-slider');
    const azVal = compassWin.body?.querySelector?.('#pfl-drone-az-val');
    const ptSl = compassWin.body?.querySelector?.('#pfl-drone-pitch-slider');
    const ptVal = compassWin.body?.querySelector?.('#pfl-drone-pitch-val');
    const dsSl = compassWin.body?.querySelector?.('#pfl-drone-dist-slider');
    const dsVal = compassWin.body?.querySelector?.('#pfl-drone-dist-val');
    if (azSl) azSl.value = String(Math.round(droneOrbitState.azimuthDeg));
    if (azVal) azVal.textContent = `${Math.round(droneOrbitState.azimuthDeg)}°`;
    if (ptSl) ptSl.value = String(Math.round(droneOrbitState.pitchDeg));
    if (ptVal) ptVal.textContent = `${Math.round(droneOrbitState.pitchDeg)}°`;
    if (dsSl) dsSl.value = String(Number(droneOrbitState.rangeM).toFixed(1));
    if (dsVal) dsVal.textContent = `${Number(droneOrbitState.rangeM).toFixed(1)}m`;
    compassWin.body?.querySelectorAll?.('[data-pfl-drone]')?.forEach((btn) => {
      const on = droneOrbitState.active && btn.getAttribute('data-pfl-drone') === droneOrbitState.targetKey;
      btn.style.borderColor = on ? '#4ade80' : '';
      btn.style.color = on ? '#4ade80' : '';
    });
  }

  function applyDroneOrbit() {
    if (!viewer?.camera) return;
    enforceZeroAltitudeKickGuard();
    try { viewer.trackedEntity = undefined; viewer.selectedEntity = undefined; } catch {}
    const tgt = resolveDroneTarget(droneOrbitState.targetKey);
    droneOrbitState.targetLabel = tgt.label;
    const targetCartesian = Cesium.Cartesian3.fromDegrees(tgt.lon, tgt.lat, tgt.alt + 1.1);
    const hdgRad = Cesium.Math.toRadians(((droneOrbitState.azimuthDeg % 360) + 360) % 360);
    const pitchRad = Cesium.Math.toRadians(Math.max(-75, Math.min(5, droneOrbitState.pitchDeg)));
    const rangeM = Math.max(1.2, Math.min(25, droneOrbitState.rangeM));
    droneOrbitState.azimuthDeg = Cesium.Math.toDegrees(hdgRad);
    droneOrbitState.pitchDeg = Cesium.Math.toDegrees(pitchRad);
    droneOrbitState.rangeM = rangeM;
    droneOrbitState.active = true;
    viewer.camera.lookAt(targetCartesian, new Cesium.HeadingPitchRange(hdgRad, pitchRad, rangeM));
    syncDroneUi();
    governorRequestRender('pfl-drone-orbit');
  }

  function startDroneOrbit(targetKey = 'lisa', overrides = null) {
    if (!droneOrbitState.active && viewer?.camera?.positionCartographic) {
      const c = viewer.camera.positionCartographic;
      preDronePose = {
        lon: c.longitude,
        lat: c.latitude,
        height: c.height,
        heading: viewer.camera.heading || 0,
        pitch: viewer.camera.pitch || 0,
        roll: viewer.camera.roll || 0,
      };
    }
    const tgt = resolveDroneTarget(targetKey);
    droneOrbitState.targetKey = tgt.key;
    droneOrbitState.targetLabel = tgt.label;
    droneOrbitState.azimuthDeg = overrides?.azimuthDeg ?? tgt.defaultAz;
    droneOrbitState.pitchDeg = overrides?.pitchDeg ?? tgt.defaultPitch;
    droneOrbitState.rangeM = overrides?.rangeM ?? tgt.defaultRange;
    applyDroneOrbit();
  }

  unlockDroneCamera = () => {
    const wasActive = droneOrbitState.active;
    droneOrbitState.active = false;
    try {
      viewer?.camera?.lookAtTransform?.(Cesium.Matrix4.IDENTITY);
    } catch {}
    syncDroneUi();
    if (wasActive) governorRequestRender('pfl-drone-unlock');
  };

  function returnFromDrone() {
    unlockDroneCamera();
    if (!preDronePose || !viewer?.camera) return;
    enforceZeroAltitudeKickGuard();
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromRadians(preDronePose.lon, preDronePose.lat, preDronePose.height),
      orientation: {
        heading: preDronePose.heading,
        pitch: preDronePose.pitch,
        roll: 0,
      },
    });
    governorRequestRender('pfl-drone-return');
  }

  window.__pflDroneTelepresence = {
    getState: () => ({
      ...droneOrbitState,
      preDronePose: preDronePose ? { ...preDronePose } : null,
    }),
    orbit: startDroneOrbit,
    unlock: unlockDroneCamera,
    returnFromDrone,
  };

  const GIZMO_ENTITY_ID = 'pfl-active-movable-gizmo';
  function makeGizmoBadgeCanvas(labelText) {
    const c = document.createElement('canvas');
    c.width = 340;
    c.height = 40;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(2, 2, 336, 36, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fde047';
    ctx.font = '700 12.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`✥ DRAG / SPIN: ${String(labelText).slice(0, 22)}`, 170, 20);
    return c;
  }

  function syncActiveMovableGizmo() {
    if (!viewer?.entities || !activeMovable) return;
    try {
      const st = activeMovable.getState();
      if (!st || !Number.isFinite(st.lat) || !Number.isFinite(st.lon)) return;
      const gM = resolveLocalGroundM(st.lon, st.lat);
      const liftM = Number(st.lift || 0);
      const baseAlt = gM + liftM + 0.16;
      const scaleK = Number(st.scale) > 0 ? Number(st.scale) : 1;
      const radiusM = scaleK * (activeMovable.kind === 'house' ? 8.2 : activeMovable.kind === 'monaco' ? 6.4 : String(activeMovable.kind || '').startsWith('yardframe:') ? 2.4 : 1.45);
      const badgeLift = scaleK * (activeMovable.kind === 'house' ? 8.6 : activeMovable.kind === 'monaco' ? 4.2 : String(activeMovable.kind || '').startsWith('yardframe:') ? 2.1 : 2.35);
      let giz = viewer.entities.getById(GIZMO_ENTITY_ID);
      const pos = Cesium.Cartesian3.fromDegrees(st.lon, st.lat, baseAlt + badgeLift);
      if (!giz) {
        giz = viewer.entities.add({
          id: GIZMO_ENTITY_ID,
          name: 'Selected Object Gizmo',
          position: pos,
          ellipse: {
            semiMajorAxis: radiusM,
            semiMinorAxis: radiusM,
            height: baseAlt,
            material: Cesium.Color.fromCssColorString('#facc15').withAlpha(0.22),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.98),
          },
          billboard: {
            image: makeGizmoBadgeCanvas(activeMovable.label || activeMovable.kind),
            width: 185,
            height: 22,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            disableDepthTestDistance: 160,
          },
        });
      } else {
        giz.position = pos;
        giz.ellipse.semiMajorAxis = radiusM;
        giz.ellipse.semiMinorAxis = radiusM;
        giz.ellipse.height = baseAlt;
        if (giz._lastLabel !== activeMovable.label) {
          giz.billboard.image = makeGizmoBadgeCanvas(activeMovable.label || activeMovable.kind);
          giz._lastLabel = activeMovable.label;
        }
      }
      syncActiveMovableBorder();
      governorRequestRender('pfl-movable-gizmo');
    } catch {}
  }

  // ---- Hotspot highlight: glowing 3D outline (visible THROUGH roofs/houses via depthFailMaterial) + hover ring ----
  const BORDER_ENTITY_ID = 'pfl-active-movable-border';
  const HOVER_ENTITY_ID = 'pfl-hover-movable-ring';

  function movableOutlinePositions(mov, raiseM = 0.05) {
    if (!mov || !viewer?.entities) return null;
    const kind = String(mov.kind || '');
    if (kind.startsWith('yardframe:')) {
      const fe = viewer.entities.getById(`yardframe:${kind.slice('yardframe:'.length)}`);
      const hier = fe?.polygon?.hierarchy?.getValue?.(Cesium.JulianDate.now());
      const pts = hier?.positions;
      if (pts?.length >= 3) {
        const raised = pts.map((p) => {
          const cg = Cesium.Cartographic.fromCartesian(p);
          return Cesium.Cartesian3.fromRadians(cg.longitude, cg.latitude, cg.height + raiseM);
        });
        raised.push(raised[0]);
        return raised;
      }
    }
    const st = mov.getState?.();
    if (!st || !Number.isFinite(st.lat) || !Number.isFinite(st.lon)) return null;
    const scaleK = Number(st.scale) > 0 ? Number(st.scale) : 1;
    const baseR = kind === 'house' ? 8.4 : kind === 'monaco' ? 6.6 : 1.5;
    const r = baseR * scaleK;
    const alt = resolveLocalGroundM(st.lon, st.lat) + Number(st.lift || 0) + raiseM + 0.1;
    const mLon = 111320 * Math.cos(Cesium.Math.toRadians(st.lat));
    const ring = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      ring.push(
        Cesium.Cartesian3.fromDegrees(
          st.lon + (Math.cos(a) * r) / mLon,
          st.lat + (Math.sin(a) * r) / 111320,
          alt,
        ),
      );
    }
    return ring;
  }

  function setOutlineEntity(entityId, positions, hex, width) {
    try { viewer.entities.removeById(entityId); } catch {}
    if (!positions) return;
    const col = Cesium.Color.fromCssColorString(hex);
    viewer.entities.add({
      id: entityId,
      name: 'Hotspot outline',
      polyline: {
        positions,
        width,
        arcType: Cesium.ArcType.NONE,
        material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.32, color: col }),
        depthFailMaterial: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.32, color: col.withAlpha(0.9) }),
      },
    });
  }

  function syncActiveMovableBorder() {
    if (!activeMovable) return;
    setOutlineEntity(BORDER_ENTITY_ID, movableOutlinePositions(activeMovable, 0.05), '#facc15', 6);
  }

  function clearHoverRing() {
    try { viewer.entities.removeById(HOVER_ENTITY_ID); } catch {}
  }

  const MOVABLE_SCALES_KEY = 'pfl_movable_scales_v1';
  function readStoredScales() {
    try { return JSON.parse(localStorage.getItem(MOVABLE_SCALES_KEY) || '{}') || {}; } catch { return {}; }
  }
  function storedScaleFor(kind) {
    const v = Number(readStoredScales()[kind]);
    return v > 0 ? v : 1;
  }
  /** Lisa's model scale lives on her entity; everything else handles `scale` inside its own update(). */
  function applyLisaScale(scaleK) {
    try {
      const ent = viewer?.entities?.getById?.('lisa-muse-sovereign-anchor');
      if (ent?.model) ent.model.scale = 1.05 * scaleK;
    } catch {}
  }
  function movableSupportsScale(mov) {
    const kind = String(mov?.kind || '');
    return kind === 'lisa' || kind === 'house' || kind === 'monaco' || kind.startsWith('yardframe:');
  }
  function getMovableScale(mov) {
    const st = mov?.getState?.() || {};
    if (Number(st.scale) > 0) return Number(st.scale);
    return storedScaleFor(String(mov?.kind || ''));
  }
  function setMovableScale(mov, v) {
    const scaleK = Math.max(0.4, Math.min(2.5, Number(v) || 1));
    const kind = String(mov?.kind || '');
    if (kind === 'lisa') {
      const all = readStoredScales();
      all.lisa = scaleK;
      try { localStorage.setItem(MOVABLE_SCALES_KEY, JSON.stringify(all)); } catch {}
      applyLisaScale(scaleK);
    } else {
      mov.update({ scale: scaleK });
    }
    syncActiveMovableGizmo();
  }
  setTimeout(() => applyLisaScale(storedScaleFor('lisa')), 900);

  function syncScaleUi(mov) {
    const sl = compassWin.body.querySelector('#pfl-scale-slider');
    const vl = compassWin.body.querySelector('#pfl-scale-val');
    if (!sl || !vl) return;
    const supported = movableSupportsScale(mov);
    sl.disabled = !supported;
    sl.title = supported ? 'Resize the selected photo / 3D model (0.4× – 2.5×)' : 'Resize is not available for this object';
    const k = supported ? getMovableScale(mov) : 1;
    sl.value = String(k);
    vl.textContent = `${k.toFixed(2)}×`;
  }

  function bindMovable(mov) {
    if (!mov) return;
    activeMovable = mov;
    const st = mov.getState();
    compassWin.body.querySelector('#pfl-sel-name').textContent = `Selected: ${mov.label}`;
    compassWin.body.querySelector('#pfl-hdg-slider').value = String(Math.round(st.heading || 0));
    compassWin.body.querySelector('#pfl-hdg-val').textContent = `${Math.round(st.heading || 0)}°`;
    compassWin.body.querySelector('#pfl-alt-slider').value = String(st.lift || 0);
    compassWin.body.querySelector('#pfl-alt-val').textContent = `${Number(st.lift || 0).toFixed(2)}m`;
    syncScaleUi(mov);
    const bar = compassWin.body.querySelector('#pfl-hotspot-actions');
    if (bar) bar.style.display = 'flex';
    const walkHouseBtn = compassWin.body.querySelector('#pfl-hs-walk-house');
    if (walkHouseBtn) walkHouseBtn.style.display = mov.kind === 'house' ? 'inline-block' : 'none';
    syncActiveMovableGizmo();
  }

  function clearActiveMovableSelection() {
    activeMovable = null;
    for (const id of [GIZMO_ENTITY_ID, BORDER_ENTITY_ID]) {
      try { viewer.entities.removeById(id); } catch {}
    }
    const bar = compassWin.body.querySelector('#pfl-hotspot-actions');
    if (bar) bar.style.display = 'none';
    compassWin.body.querySelector('#pfl-sel-name').textContent = 'Click 3D avatar/chair/photo or chip above';
    governorRequestRender('pfl-movable-clear');
  }

  compassWin.body.querySelectorAll('[data-pfl-pick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-pfl-pick');
      const mov = window.__pflMovables?.[key];
      if (mov) bindMovable(mov);
    });
  });

  const placeBtn = compassWin.body.querySelector('#pfl-drag-place-btn');
  placeBtn?.addEventListener('click', () => {
    clickToPlaceMode = !clickToPlaceMode;
    placeBtn.textContent = clickToPlaceMode ? '🎯 Click Ground to Drop!' : '✋ Click-to-Place: OFF';
    placeBtn.style.borderColor = clickToPlaceMode ? '#facc15' : '';
  });

  compassWin.body.querySelectorAll('[data-pfl-obj-nudge]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!activeMovable) return;
      const [dE, dN] = btn.getAttribute('data-pfl-obj-nudge').split(',').map(Number);
      const st = activeMovable.getState();
      const newLat = st.lat + dN / 111320;
      const newLon = st.lon + dE / (111320 * Math.cos(Cesium.Math.toRadians(st.lat)));
      activeMovable.update({ lat: newLat, lon: newLon });
      syncActiveMovableGizmo();
      if (droneOrbitState.active && activeMovable.kind === droneOrbitState.targetKey) {
        applyDroneOrbit();
      }
    });
  });

  function wrapBirdpondWallMovable(ent) {
    if (ent._pflWallMov) return ent._pflWallMov;
    const st = ent._pflWallMeta || { lat: 29.139116, lon: -95.804794, width: 13.93, height: 9.23, heading: 107, baseAlt: -17.5, lift: 0 };
    ent._pflWallMeta = st;
    ent._pflWallMov = {
      kind: ent.id,
      label: ent.name || ent.id,
      getState: () => ({ lat: st.lat, lon: st.lon, heading: st.heading, lift: st.lift || 0 }),
      update: (patch) => {
        Object.assign(st, patch);
        const halfW = (st.width || 13.93) * 0.5;
        const rad = (st.heading * Math.PI) / 180.0;
        const dN = Math.cos(rad) * halfW;
        const dE = Math.sin(rad) * halfW;
        const mLat = 111320.0;
        const mLon = 111320.0 * Math.cos((st.lat * Math.PI) / 180.0);
        const bAlt = (st.baseAlt ?? -17.5) + (st.lift || 0);
        const tAlt = bAlt + (st.height || 9.23);
        ent.wall.positions = Cesium.Cartesian3.fromDegreesArrayHeights([
          st.lon - dE / mLon, st.lat - dN / mLat, tAlt,
          st.lon + dE / mLon, st.lat + dN / mLat, tAlt,
        ]);
        ent.wall.minimumHeights = [bAlt, bAlt];
        governorRequestRender('pfl-wall-rotate');
      },
    };
    return ent._pflWallMov;
  }

  function drillFindTarget(screenPos) {
    let list = [];
    try {
      list = viewer.scene.drillPick(screenPos, 12) || [];
    } catch {}
    if (!list.length) {
      const single = viewer.scene.pick(screenPos);
      if (single) list = [single];
    }
    for (const p of list) {
      const ent = p?.id;
      const eid = String(ent?.id || '');
      if (eid === GIZMO_ENTITY_ID && activeMovable) {
        return { type: 'movable', mov: activeMovable, viaGizmo: true };
      }
      if (eid === 'yardframe:yard-overview-20261012') continue;
      if (eid.startsWith('pfl-s788-') || eid.startsWith('pfl-oak-')) continue;
      if (eid === 'pfl-holodeck-portal-1s788') {
        return { type: 'portal' };
      }
      if (eid.startsWith('pfl-mls-pin-')) {
        return { type: 'mls-room', roomId: ent._pflMlsRoomId || eid.slice('pfl-mls-pin-'.length) };
      }
      if (ent?._pflMovable) {
        return { type: 'movable', mov: ent._pflMovable };
      }
      if (p?.primitive && window.__pflMovables?.chair?.tileset && p.primitive === window.__pflMovables.chair.tileset) {
        return { type: 'movable', mov: window.__pflMovables.chair };
      }
      if (ent && ent.wall && eid.startsWith('birdpond_')) {
        return { type: 'movable', mov: wrapBirdpondWallMovable(ent) };
      }
    }
    return null;
  }

  let dragMovableSession = null;
  let lastDragReleaseMs = 0;

  function computeDampedEnuRayPoint(screenPos, invEnu) {
    const ray = viewer?.camera?.getPickRay?.(screenPos);
    if (!ray) return null;
    const origL = Cesium.Matrix4.multiplyByPoint(invEnu, ray.origin, new Cesium.Cartesian3());
    const dirL = Cesium.Matrix4.multiplyByPointAsVector(invEnu, ray.direction, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(dirL, dirL);
    const absZ = Math.abs(dirL.z);
    if (absZ < 1e-4) return null;
    // Clamp shallow ray-plane denominator to >= 0.24 so street-level vertical mouse movement never explodes 40m-85m
    const safeZ = dirL.z < 0 ? Math.min(-0.24, dirL.z) : Math.max(0.24, dirL.z);
    const t = -origL.z / safeZ;
    if (!Number.isFinite(t) || t <= 0 || t > 220) return null;
    return {
      x: origL.x + dirL.x * t,
      y: origL.y + dirL.y * t,
      absZ,
    };
  }

  function endDragMovableSession() {
    if (!dragMovableSession) return;
    const wasMoved = dragMovableSession.moved;
    dragMovableSession = null;
    releaseContinuousRender('pfl-drag-movable');
    if (wasMoved) lastDragReleaseMs = Date.now();
    const ctrl = viewer?.scene?.screenSpaceCameraController;
    if (ctrl) {
      ctrl.enableRotate = true;
      ctrl.enableTranslate = true;
      ctrl.enableTilt = true;
    }
    governorRequestRender('pfl-drag-movable-end');
  }

  const pickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  pickHandler.setInputAction((downEv) => {
    if (clickToPlaceMode) return;
    const hit = drillFindTarget(downEv.position);
    if (hit?.type !== 'movable' || !hit.mov) return;
    bindMovable(hit.mov);
    const st = hit.mov.getState();
    const planeAlt = resolveLocalGroundM(st.lon, st.lat) + Number(st.lift || 0);
    const anchorCart = Cesium.Cartesian3.fromDegrees(st.lon, st.lat, planeAlt);
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(anchorCart);
    const invEnu = Cesium.Matrix4.inverseTransformation(enu, new Cesium.Matrix4());
    const camLocal = Cesium.Matrix4.multiplyByPoint(invEnu, viewer.camera.positionWC, new Cesium.Cartesian3());
    const camDistM = Math.max(2.5, Math.min(35, Cesium.Cartesian3.magnitude(camLocal) || 10));
    const rightLocal = Cesium.Matrix4.multiplyByPointAsVector(invEnu, viewer.camera.rightWC, new Cesium.Cartesian3());
    const rLen = Math.hypot(rightLocal.x, rightLocal.y) || 1;
    const rx = rightLocal.x / rLen;
    const ry = rightLocal.y / rLen;
    const fovyRad = Number(viewer.camera.frustum?.fovy) || Cesium.Math.toRadians(45);
    const canvasH = Math.max(280, viewer.scene.canvas?.clientHeight || 720);
    const metersPerPx = (2 * camDistM * Math.tan(fovyRad * 0.5)) / canvasH;
    const hit0 = computeDampedEnuRayPoint(downEv.position, invEnu);
    dragMovableSession = {
      mov: hit.mov,
      startX: downEv.position.x,
      startY: downEv.position.y,
      moved: false,
      enu,
      invEnu,
      useRayDelta: Boolean(hit0 && hit0.absZ >= 0.28),
      grabLocalX: hit0 ? hit0.x : 0,
      grabLocalY: hit0 ? hit0.y : 0,
      camRightX: rx,
      camRightY: ry,
      camFwdX: -ry,
      camFwdY: rx,
      metersPerPx,
    };
    holdContinuousRender('pfl-drag-movable');
    const ctrl = viewer?.scene?.screenSpaceCameraController;
    if (ctrl) {
      ctrl.enableRotate = false;
      ctrl.enableTranslate = false;
      ctrl.enableTilt = false;
    }
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  // ---- In-place first-person look (Ctrl+Left-drag / Middle-drag) so Cesium's ellipsoid tilt can never fling Paul into orbit ----
  let lookDragSession = null;
  let lastHoverCheckMs = 0;
  let lastHoverKey = null;
  let leftOrMiddleButtonsDown = 0;
  let activeMouseButtonsMask = 0;
  let rightButtonDown = false;
  let lastZoomActivityMs = 0;

  function applyInPlaceLook(dxPx, dyPx) {
    try {
      const canvas = viewer.scene.canvas;
      const fovy = Number(viewer.camera.frustum?.fovy) || Cesium.Math.toRadians(45);
      const perPx = fovy / Math.max(240, canvas.clientHeight || 720);
      if (dxPx) viewer.camera.lookRight(dxPx * perPx);
      if (dyPx) viewer.camera.lookUp(-dyPx * perPx);
      governorRequestRender('pfl-inplace-look');
    } catch {}
  }

  const handleLookMove = (moveEv) => {
    if (!lookDragSession || !moveEv?.startPosition || !moveEv?.endPosition) return false;
    if (!viewer.scene.screenSpaceCameraController._pflTiltLocked) return false;
    applyInPlaceLook(
      moveEv.endPosition.x - moveEv.startPosition.x,
      moveEv.endPosition.y - moveEv.startPosition.y,
    );
    return true;
  };

  const startLookDrag = (downEv) => {
    if (!viewer.scene.screenSpaceCameraController._pflTiltLocked) return;
    lookDragSession = { x: downEv?.position?.x || 0, y: downEv?.position?.y || 0 };
  };
  const endLookDrag = () => { lookDragSession = null; };

  pickHandler.setInputAction(startLookDrag, Cesium.ScreenSpaceEventType.LEFT_DOWN, Cesium.KeyboardEventModifier.CTRL);
  pickHandler.setInputAction(endLookDrag, Cesium.ScreenSpaceEventType.LEFT_UP, Cesium.KeyboardEventModifier.CTRL);
  pickHandler.setInputAction(startLookDrag, Cesium.ScreenSpaceEventType.MIDDLE_DOWN);
  pickHandler.setInputAction(endLookDrag, Cesium.ScreenSpaceEventType.MIDDLE_UP);
  pickHandler.setInputAction(handleLookMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE, Cesium.KeyboardEventModifier.CTRL);

  // Tilt on the ellipsoid is what ejects the camera to space near the yard: touch ONLY tiltEventTypes (keep zoomEventTypes 100% untouched for RIGHT_DRAG, WHEEL & PINCH!)
  const defaultTiltTypes = (() => {
    try { return viewer.scene.screenSpaceCameraController.tiltEventTypes; } catch { return undefined; }
  })();
  function syncTiltPolicy() {
    try {
      const ctrl = viewer?.scene?.screenSpaceCameraController;
      const c = viewer?.camera?.positionCartographic;
      if (!ctrl || !c || !defaultTiltTypes) return;
      const lat = Cesium.Math.toDegrees(c.latitude);
      const lon = Cesium.Math.toDegrees(c.longitude);
      const nearYard =
        Math.hypot(lat - 29.24755, lon - -95.23140) < 0.02 ||
        Math.hypot(lat - 29.13910, lon - -95.80480) < 0.02;
      const agl = c.height - resolveLocalGroundM(lon, lat);
      const wantLocked = nearYard && agl < 220;
      if (wantLocked && !ctrl._pflTiltLocked) {
        ctrl._pflTiltLocked = true;
        ctrl.tiltEventTypes = [Cesium.CameraEventType.PINCH];
      } else if (!wantLocked && ctrl._pflTiltLocked) {
        ctrl._pflTiltLocked = false;
        ctrl.tiltEventTypes = defaultTiltTypes;
      }
    } catch {}
  }

  // ---- Anti-Space-Ejection clamp: ONLY guard sudden >2,500m single-frame spikes during LEFT/MIDDLE drag; NEVER interfere with RIGHT-DRAG or WHEEL/PINCH zoom! ----
  const canvasEl = viewer.scene.canvas;
  const onPtrDown = (e) => {
    activeMouseButtonsMask = typeof e?.buttons === 'number' ? e.buttons : 0;
    if (e?.button === 2 || (activeMouseButtonsMask & 2)) {
      rightButtonDown = true;
      lastZoomActivityMs = Date.now();
    } else if (e?.button === 0 || e?.button === 1) {
      leftOrMiddleButtonsDown += 1;
    }
  };
  const onPtrMove = (e) => {
    if (typeof e?.buttons !== 'number') return;
    activeMouseButtonsMask = e.buttons;
    if (e.buttons & 2) {
      rightButtonDown = true;
      lastZoomActivityMs = Date.now();
    } else if (rightButtonDown) {
      rightButtonDown = false;
      lastZoomActivityMs = Date.now();
    }
  };
  const onPtrUp = (e) => {
    activeMouseButtonsMask = typeof e?.buttons === 'number' ? e.buttons : 0;
    if (e?.button === 2 || !(activeMouseButtonsMask & 2)) {
      if (rightButtonDown) lastZoomActivityMs = Date.now();
      rightButtonDown = false;
    }
    if (e?.button === 0 || e?.button === 1 || activeMouseButtonsMask === 0) {
      leftOrMiddleButtonsDown = activeMouseButtonsMask === 0 ? 0 : Math.max(0, leftOrMiddleButtonsDown - 1);
    }
    if (activeMouseButtonsMask === 0 && dragMovableSession) {
      endDragMovableSession();
    }
  };
  const onWheelZoomTrack = (e) => {
    if (!e?.altKey) lastZoomActivityMs = Date.now();
  };
  const onTouchZoomTrack = (e) => {
    if ((e?.touches?.length || 0) >= 2) lastZoomActivityMs = Date.now();
  };
  canvasEl.addEventListener('pointerdown', onPtrDown, true);
  window.addEventListener('pointermove', onPtrMove, { capture: true, passive: true });
  window.addEventListener('pointerup', onPtrUp, true);
  window.addEventListener('pointercancel', onPtrUp, true);
  canvasEl.addEventListener('wheel', onWheelZoomTrack, { capture: true, passive: true });
  canvasEl.addEventListener('touchstart', onTouchZoomTrack, { capture: true, passive: true });
  canvasEl.addEventListener('touchmove', onTouchZoomTrack, { capture: true, passive: true });

  let ejectGuard = { t: 0, h: null, agl: null };
  function antiEjectionTick() {
    try {
      const c = viewer?.camera?.positionCartographic;
      if (!c || !lastSafeYardPose) return;
      const now = Date.now();
      const lat = Cesium.Math.toDegrees(c.latitude);
      const lon = Cesium.Math.toDegrees(c.longitude);
      const agl = c.height - resolveLocalGroundM(lon, lat);
      const isZooming =
        rightButtonDown ||
        Boolean(activeMouseButtonsMask & 2) ||
        now - lastZoomActivityMs < 850;
      const leftOrMiddleActive =
        !isZooming &&
        (leftOrMiddleButtonsDown > 0 ||
          Boolean(activeMouseButtonsMask & 1) ||
          Boolean(activeMouseButtonsMask & 4));
      if (
        ejectGuard.h !== null &&
        now - ejectGuard.t < 1600 &&
        ejectGuard.agl < 160 &&
        c.height - ejectGuard.h > 2500 &&
        leftOrMiddleActive &&
        !droneOrbitState.active
      ) {
        viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromRadians(lastSafeYardPose.lon, lastSafeYardPose.lat, lastSafeYardPose.height),
          orientation: { heading: lastSafeYardPose.heading, pitch: lastSafeYardPose.pitch, roll: 0 },
        });
        window.__pflEjectionClamps = (window.__pflEjectionClamps || 0) + 1;
        governorRequestRender('pfl-anti-ejection');
        ejectGuard = { t: now, h: lastSafeYardPose.height, agl: 1 };
        return;
      }
      ejectGuard = { t: now, h: c.height, agl };
    } catch {}
  }
  const antiEjectionUnsub = viewer.scene.preRender.addEventListener(antiEjectionTick);

  pickHandler.setInputAction((moveEv) => {
    if (!dragMovableSession && handleLookMove(moveEv)) return;
    if (!dragMovableSession) {
      // Hover hotspot: pointer cursor + cyan outline over any clickable object
      const nowMs = Date.now();
      if (activeMouseButtonsMask > 0 || leftOrMiddleButtonsDown > 0 || rightButtonDown || nowMs - lastHoverCheckMs < 95 || !moveEv?.endPosition) return;
      lastHoverCheckMs = nowMs;
      let hit = null;
      try { hit = drillFindTarget(moveEv.endPosition); } catch {}
      const hoverKey = hit
        ? (hit.type === 'portal' ? 'portal' : hit.type === 'mls-room' ? `mls:${hit.roomId}` : String(hit.mov?.kind || ''))
        : null;
      if (hoverKey === lastHoverKey) return;
      lastHoverKey = hoverKey;
      viewer.scene.canvas.style.cursor = hit ? 'pointer' : '';
      if (hit?.type === 'movable' && hit.mov && hit.mov !== activeMovable) {
        setOutlineEntity(HOVER_ENTITY_ID, movableOutlinePositions(hit.mov, 0.07), '#38bdf8', 4);
      } else {
        clearHoverRing();
      }
      governorRequestRender('pfl-hover-hotspot');
      return;
    }
    if (!moveEv?.endPosition) return;
    const dx = moveEv.endPosition.x - dragMovableSession.startX;
    const dy = moveEv.endPosition.y - dragMovableSession.startY;
    if (!dragMovableSession.moved && Math.hypot(dx, dy) < 4) return;
    dragMovableSession.moved = true;
    try {
      let deltaX = 0;
      let deltaY = 0;
      if (dragMovableSession.useRayDelta) {
        const curHit = computeDampedEnuRayPoint(moveEv.endPosition, dragMovableSession.invEnu);
        if (!curHit) return;
        deltaX = curHit.x - dragMovableSession.grabLocalX;
        deltaY = curHit.y - dragMovableSession.grabLocalY;
      } else {
        const rightM = dx * dragMovableSession.metersPerPx;
        const fwdM = -dy * dragMovableSession.metersPerPx * 1.35;
        deltaX = dragMovableSession.camRightX * rightM + dragMovableSession.camFwdX * fwdM;
        deltaY = dragMovableSession.camRightY * rightM + dragMovableSession.camFwdY * fwdM;
      }
      const distMove = Math.hypot(deltaX, deltaY);
      if (distMove > 25) {
        const clampScale = 25 / distMove;
        deltaX *= clampScale;
        deltaY *= clampScale;
      }
      const hitLocal = new Cesium.Cartesian3(deltaX, deltaY, 0);
      const hitWorld = Cesium.Matrix4.multiplyByPoint(dragMovableSession.enu, hitLocal, new Cesium.Cartesian3());
      const cg = Cesium.Cartographic.fromCartesian(hitWorld);
      dragMovableSession.mov.update({
        lat: Cesium.Math.toDegrees(cg.latitude),
        lon: Cesium.Math.toDegrees(cg.longitude),
      });
      syncActiveMovableGizmo();
      if (droneOrbitState.active && dragMovableSession.mov.kind === droneOrbitState.targetKey) {
        applyDroneOrbit();
      }
    } catch {}
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  pickHandler.setInputAction(() => {
    endLookDrag();
    endDragMovableSession();
  }, Cesium.ScreenSpaceEventType.LEFT_UP);

  pickHandler.setInputAction((movement) => {
    if (Date.now() - lastDragReleaseMs < 260) return;
    if (clickToPlaceMode && activeMovable) {
      let cart = null;
      try {
        cart = viewer.scene.pickPositionSupported ? viewer.scene.pickPosition(movement.position) : null;
      } catch {}
      if (!cart) {
        const ray = viewer.camera.getPickRay(movement.position);
        cart = ray && viewer.scene.globe ? viewer.scene.globe.pick(ray, viewer.scene) : null;
      }
      if (!cart) {
        cart = viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe?.ellipsoid);
      }
      if (cart) {
        const cg = Cesium.Cartographic.fromCartesian(cart);
        activeMovable.update({
          lat: Cesium.Math.toDegrees(cg.latitude),
          lon: Cesium.Math.toDegrees(cg.longitude),
        });
        syncActiveMovableGizmo();
        clickToPlaceMode = false;
        if (placeBtn) {
          placeBtn.textContent = '✋ Click-to-Place: OFF';
          placeBtn.style.borderColor = '';
        }
        return;
      }
    }

    const hit = drillFindTarget(movement.position);
    if (!hit) return;
    if (hit.type === 'portal') {
      openHolodeckHallway();
      return;
    }
    if (hit.type === 'mls-room') {
      openMlsWalkthrough(hit.roomId);
      return;
    }
    if (hit.type === 'movable' && hit.mov) {
      bindMovable(hit.mov);
      if (hit.mov.kind === 'lisa' && !hit.viaGizmo) {
        startDroneOrbit('lisa');
      }
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  compassWin.body.querySelector('#pfl-hdg-slider')?.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    compassWin.body.querySelector('#pfl-hdg-val').textContent = `${v}°`;
    activeMovable?.update({ heading: v });
    syncActiveMovableGizmo();
  });

  compassWin.body.querySelector('#pfl-alt-slider')?.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    compassWin.body.querySelector('#pfl-alt-val').textContent = `${v.toFixed(2)}m`;
    activeMovable?.update({ lift: v });
    syncActiveMovableGizmo();
    if (droneOrbitState.active && activeMovable?.kind === droneOrbitState.targetKey) {
      applyDroneOrbit();
    }
  });

  compassWin.body.querySelector('#pfl-scale-slider')?.addEventListener('input', (e) => {
    if (!activeMovable || !movableSupportsScale(activeMovable)) return;
    const v = Number(e.target.value);
    compassWin.body.querySelector('#pfl-scale-val').textContent = `${v.toFixed(2)}×`;
    setMovableScale(activeMovable, v);
    if (droneOrbitState.active) applyDroneOrbit();
  });

  const orbitKeyForMovable = (mov) => {
    const k = String(mov?.kind || '');
    return ['lisa', 'chair', 'house', 'monaco'].includes(k) ? k : 'selected';
  };
  compassWin.body.querySelector('#pfl-hs-orbit')?.addEventListener('click', () => {
    if (activeMovable) startDroneOrbit(orbitKeyForMovable(activeMovable));
  });
  compassWin.body.querySelector('#pfl-hs-spin')?.addEventListener('click', () => {
    if (!activeMovable) return;
    const st = activeMovable.getState();
    const next = (((Math.round(Number(st.heading || 0)) + 90) % 360) + 360) % 360;
    activeMovable.update({ heading: next });
    compassWin.body.querySelector('#pfl-hdg-slider').value = String(next);
    compassWin.body.querySelector('#pfl-hdg-val').textContent = `${next}°`;
    syncActiveMovableGizmo();
  });
  compassWin.body.querySelector('#pfl-hs-resize')?.addEventListener('click', () => {
    const sl = compassWin.body.querySelector('#pfl-scale-slider');
    sl?.scrollIntoView?.({ block: 'center' });
    sl?.focus?.();
  });
  compassWin.body.querySelector('#pfl-hs-walk-house')?.addEventListener('click', () => {
    openMlsWalkthrough();
  });
  compassWin.body.querySelector('#pfl-hs-play')?.addEventListener('click', () => {
    if (!activeMovable) return;
    const kind = String(activeMovable.kind || '');
    if (kind === 'house') {
      openMlsWalkthrough();
      return;
    }
    if (kind.startsWith('yardframe:')) {
      const fe = viewer.entities.getById(`yardframe:${kind.slice('yardframe:'.length)}`);
      let url = fe?._pflSourceImageUrl || null;
      if (!url) {
        try { url = fe?.polygon?.material?.image?.getValue?.(Cesium.JulianDate.now()); } catch {}
        if (url && typeof url === 'object') url = url.url || url.src || null;
      }
      if (typeof url === 'string' && url) {
        window.open(url, '_blank', 'noopener');
        return;
      }
    }
    startDroneOrbit(orbitKeyForMovable(activeMovable));
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

    if (droneOrbitState.active) {
      try {
        if (viewer.camera.transform && Cesium.Matrix4.equals(viewer.camera.transform, Cesium.Matrix4.IDENTITY)) {
          droneOrbitState.active = false;
          syncDroneUi();
        } else if (!String(document.activeElement?.id || '').startsWith('pfl-drone-')) {
          const rawMag = Cesium.Cartesian3.magnitude(viewer.camera.position);
          if (Number.isFinite(rawMag) && rawMag > 0.2 && rawMag < 100) {
            const liveAz = ((Cesium.Math.toDegrees(h) % 360) + 360) % 360;
            const livePitch = Math.max(-75, Math.min(5, Cesium.Math.toDegrees(p)));
            const liveDist = Math.max(1.2, Math.min(25, rawMag));
            if (Number.isFinite(liveAz)) droneOrbitState.azimuthDeg = liveAz;
            if (Number.isFinite(livePitch)) droneOrbitState.pitchDeg = livePitch;
            droneOrbitState.rangeM = liveDist;
            syncDroneUi();
          }
        }
      } catch {}
    }

    const c = viewer.camera.positionCartographic;
    if (c) {
      const latNum = Cesium.Math.toDegrees(c.latitude);
      const lonNum = Cesium.Math.toDegrees(c.longitude);
      const lat = latNum.toFixed(5);
      const lon = lonNum.toFixed(5);
      const hdg = Math.round(((Cesium.Math.toDegrees(h) % 360) + 360) % 360);
      const fovDegNow = Math.round(Cesium.Math.toDegrees(viewer.camera.frustum?.fov || Cesium.Math.toRadians(60)));
      const aglM = c.height - resolveLocalGroundM(lonNum, latNum);
      const aglFt = aglM * 3.28084;
      const eyeBanner = compassWin.body.querySelector('#pfl-eye-elev-banner');
      if (eyeBanner) {
        eyeBanner.textContent = Math.abs(aglM) > 9999
          ? `EYE: ${(aglM / 1000).toFixed(0)} km AGL · FOV: ${fovDegNow}°`
          : `EYE: ${aglM.toFixed(1)} m (${aglFt.toFixed(1)} ft) AGL · FOV: ${fovDegNow}°`;
      }
      compassWin.body.querySelector('#pfl-cam-readout').textContent =
        `${lat}, ${lon} · WGS ${c.height.toFixed(1)}m · HDG ${hdg}°`;
    }
  }

  gCanvas.addEventListener('click', (e) => {
    const r = gCanvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    for (let i = hitTargets.length - 1; i >= 0; i--) {
      const t = hitTargets[i];
      if (Math.hypot(mx - t.sx, my - t.sy) <= 12) {
        if (droneOrbitState.active) {
          droneOrbitState.azimuthDeg = t.snapH;
          droneOrbitState.pitchDeg = Math.max(-75, Math.min(5, t.snapP));
          applyDroneOrbit();
        } else {
          unlockDroneCamera();
          const c = viewer.camera.positionCartographic;
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, c.height),
            orientation: {
              heading: Cesium.Math.toRadians(t.snapH),
              pitch: Cesium.Math.toRadians(t.snapP),
              roll: 0,
            },
            duration: 0.8,
          });
        }
        break;
      }
    }
  });

  // 2A) Remote Drone Telepresence Orbit + Stationary Optical Lens FOV + Second-Life Teleport Pads & 1S788 Holodeck Door
  const telepresenceDeck = document.createElement('div');
  telepresenceDeck.id = 'pfl-telepresence-deck';
  telepresenceDeck.style.cssText = 'margin-top:6px;display:flex;flex-direction:column;gap:6px;font-family:"JetBrains Mono",monospace;font-size:10.5px;color:#cbd5e1';
  telepresenceDeck.innerHTML = `
    <div id="pfl-drone-orbit-panel" style="padding-top:6px;border-top:1px solid rgba(56,189,248,0.28);display:flex;flex-direction:column;gap:4px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
        <span style="color:#38bdf8;font-weight:700">🚁 Drone Telepresence:</span>
        <span id="pfl-drone-status" style="font-size:9.5px;color:#94a3b8;font-weight:700">FREE CAM</span>
      </div>
      <div style="display:flex;gap:3px;flex-wrap:wrap">
        <button type="button" class="pfl-std-cbtn" id="pfl-drone-orbit-lisa" data-pfl-drone="lisa" title="Send remote drone to orbit 360° around Lisa without losing your standing spot">🚁 Orbit Lisa</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-drone-orbit-chair" data-pfl-drone="chair" title="Send remote drone to orbit around Wooden Chair">🪑 Orbit Chair</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-drone-orbit-house" data-pfl-drone="house" title="Send remote drone to orbit 360° around 417 Palm Dr House">🏠 Orbit House</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-drone-orbit-monaco" data-pfl-drone="monaco" title="Send remote drone to orbit 360° around the 40ft Monaco Coach RV">🚌 Orbit Monaco</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-drone-orbit-carport" data-pfl-drone="carport" title="Send remote drone to orbit 1S788 Carport">🚗 Orbit Carport</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-drone-orbit-dock" data-pfl-drone="dock" title="Send remote drone to orbit Chocolate Bayou Dock">⚓ Orbit Dock</button>
      </div>
      <div style="display:flex;gap:3px;flex-wrap:wrap">
        <button type="button" class="pfl-std-cbtn" id="pfl-drone-step-left" title="Orbit 15° Left around locked target">◀ Orbit L</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-drone-step-right" title="Orbit 15° Right around locked target">Orbit R ▶</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-drone-unlock" style="border-color:#fbbf24;color:#fde047" title="Unlock camera transform cleanly in place">🔓 Unlock Free Cam</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-drone-return" style="border-color:#4ade80;color:#4ade80" title="Unlock drone &amp; return immediately to your saved pre-drone standing spot">↩️ Return from Drone</button>
      </div>
      <label style="display:flex;justify-content:space-between"><span>Drone Azimuth</span><span id="pfl-drone-az-val">12°</span></label>
      <input type="range" id="pfl-drone-az-slider" min="0" max="360" step="1" value="12" style="width:100%;accent-color:#38bdf8" />
      <label style="display:flex;justify-content:space-between"><span>Drone Pitch</span><span id="pfl-drone-pitch-val">-14°</span></label>
      <input type="range" id="pfl-drone-pitch-slider" min="-75" max="5" step="1" value="-14" style="width:100%;accent-color:#38bdf8" />
      <label style="display:flex;justify-content:space-between"><span>Drone Distance</span><span id="pfl-drone-dist-val">3.0m</span></label>
      <input type="range" id="pfl-drone-dist-slider" min="1.2" max="25" step="0.1" value="3.0" style="width:100%;accent-color:#38bdf8" />
    </div>

    <div id="pfl-lens-fov-panel" style="padding-top:6px;border-top:1px solid rgba(56,189,248,0.28);display:flex;flex-direction:column;gap:4px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="color:#c084fc;font-weight:700">🔭 Optical Lens (In-Place):</span>
        <span id="pfl-fov-val" style="font-size:9.5px;color:#e9d5ff;font-weight:700">60° (1.0×)</span>
      </div>
      <input type="range" id="pfl-fov-slider" min="12" max="125" step="1" value="60" style="width:100%;accent-color:#c084fc" title="Zoom optical lens FOV in-place (12° Binoculars ↔ 125° Fisheye) without moving camera position! Tip: Alt + Mouse Wheel on globe" />
      <div style="display:flex;gap:3px;flex-wrap:wrap">
        <button type="button" class="pfl-std-cbtn" id="pfl-fov-preset-15" data-pfl-fov="15" title="4× Telephoto Binoculars (15° FOV, zero camera movement)">🔭 4× (15°)</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-fov-preset-30" data-pfl-fov="30" title="2× Portrait Lens (30° FOV, zero camera movement)">🔭 2× (30°)</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-fov-preset-60" data-pfl-fov="60" title="Standard 1× Human Eye Lens (60° FOV)">👁️ 1× (60°)</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-fov-preset-95" data-pfl-fov="95" title="Wide-Angle Architectural Lens (95° FOV)">📷 Wide (95°)</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-fov-preset-120" data-pfl-fov="120" title="Ultra-Wide Fisheye Lens (120° FOV)">🐟 Fisheye (120°)</button>
      </div>
    </div>

    <div id="pfl-teleport-pads-panel" style="padding-top:6px;border-top:1px solid rgba(56,189,248,0.28);display:flex;flex-direction:column;gap:4px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="color:#22d3ee;font-weight:700">⚡ Teleport Pads &amp; Holodeck:</span>
      </div>
      <div id="pfl-teleport-pads-list" style="display:flex;gap:3px;flex-wrap:wrap"></div>
      <div style="display:flex;gap:3px;flex-wrap:wrap">
        <button type="button" class="pfl-std-cbtn" id="pfl-drop-pad-btn" style="border-color:#4ade80;color:#4ade80" title="Drop a persistent Second-Life teleport pad at your exact current camera position, angle &amp; lens FOV">➕ Drop Pad Here</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-enter-holodeck-btn" style="border-color:#a855f7;color:#e9d5ff" title="Step through the 1S788 Carport Portal into the 3D Gaussian Splat Holodeck Hallway (:8766)">🚪 Enter Holodeck Hallway (:8766)</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-house-3d-toggle" style="border-color:#fbbf24;color:#fde047" title="Toggle 3D 417 Palm Dr Yellow Coastal House GLB model &amp; auto-elevate Bed photo onto upstairs west-bedroom roof">🏠 3D House: ON</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-s788-canopy-toggle" style="border-color:rgba(148,163,184,0.35);color:#94a3b8" title="Toggle 3D engineering wireframe of MIL-STD S-788/G shelters (102&quot;L × 84&quot;W × 67&quot;H = 2.59m × 2.13m × 1.70m) + 11ft (3.35m) walk-through overhead solar canopy">🏗️ S-788 &amp; 11ft Canopy: OFF</button>
      </div>
    </div>
  `;
  compassWin.body.appendChild(telepresenceDeck);

  // Wire Drone Telepresence controls
  telepresenceDeck.querySelectorAll('[data-pfl-drone]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-pfl-drone');
      if (key === 'lisa' && window.__pflMovables?.lisa) bindMovable(window.__pflMovables.lisa);
      else if (key === 'chair' && window.__pflMovables?.chair) bindMovable(window.__pflMovables.chair);
      else if (key === 'house' && window.__pflMovables?.house) bindMovable(window.__pflMovables.house);
      else if (key === 'monaco' && window.__pflMovables?.monaco) bindMovable(window.__pflMovables.monaco);
      startDroneOrbit(key);
    });
  });
  telepresenceDeck.querySelector('#pfl-drone-unlock')?.addEventListener('click', unlockDroneCamera);
  telepresenceDeck.querySelector('#pfl-drone-return')?.addEventListener('click', returnFromDrone);
  telepresenceDeck.querySelector('#pfl-drone-step-left')?.addEventListener('click', () => {
    if (!droneOrbitState.active) startDroneOrbit(droneOrbitState.targetKey || 'lisa');
    droneOrbitState.azimuthDeg = ((droneOrbitState.azimuthDeg - 15) % 360 + 360) % 360;
    applyDroneOrbit();
  });
  telepresenceDeck.querySelector('#pfl-drone-step-right')?.addEventListener('click', () => {
    if (!droneOrbitState.active) startDroneOrbit(droneOrbitState.targetKey || 'lisa');
    droneOrbitState.azimuthDeg = (droneOrbitState.azimuthDeg + 15) % 360;
    applyDroneOrbit();
  });
  const onDroneAzInput = (e) => {
    if (!droneOrbitState.active) startDroneOrbit(droneOrbitState.targetKey || 'lisa', { azimuthDeg: Number(e.target.value) });
    else {
      droneOrbitState.azimuthDeg = Number(e.target.value);
      applyDroneOrbit();
    }
  };
  const onDronePitchInput = (e) => {
    if (!droneOrbitState.active) startDroneOrbit(droneOrbitState.targetKey || 'lisa', { pitchDeg: Number(e.target.value) });
    else {
      droneOrbitState.pitchDeg = Number(e.target.value);
      applyDroneOrbit();
    }
  };
  const onDroneDistInput = (e) => {
    if (!droneOrbitState.active) startDroneOrbit(droneOrbitState.targetKey || 'lisa', { rangeM: Number(e.target.value) });
    else {
      droneOrbitState.rangeM = Number(e.target.value);
      applyDroneOrbit();
    }
  };
  telepresenceDeck.querySelector('#pfl-drone-az-slider')?.addEventListener('input', onDroneAzInput);
  telepresenceDeck.querySelector('#pfl-drone-az-slider')?.addEventListener('change', onDroneAzInput);
  telepresenceDeck.querySelector('#pfl-drone-pitch-slider')?.addEventListener('input', onDronePitchInput);
  telepresenceDeck.querySelector('#pfl-drone-pitch-slider')?.addEventListener('change', onDronePitchInput);
  telepresenceDeck.querySelector('#pfl-drone-dist-slider')?.addEventListener('input', onDroneDistInput);
  telepresenceDeck.querySelector('#pfl-drone-dist-slider')?.addEventListener('change', onDroneDistInput);

  // Wire Stationary Optical Lens FOV Zoom (12°–125° without touching camera.position!)
  let currentLensFovDeg = 60;
  try {
    if (viewer?.camera?.frustum?.fov) {
      const initDeg = Cesium.Math.toDegrees(viewer.camera.frustum.fov);
      if (Number.isFinite(initDeg) && initDeg >= 10 && initDeg <= 140) currentLensFovDeg = Math.round(initDeg);
    }
  } catch {}

  function setOpticalLensFov(deg) {
    const clamped = Math.max(12, Math.min(125, Number(deg) || 60));
    currentLensFovDeg = clamped;
    try {
      if (viewer?.camera?.frustum && 'fov' in viewer.camera.frustum) {
        viewer.camera.frustum.fov = Cesium.Math.toRadians(clamped);
      }
    } catch {}
    const sl = telepresenceDeck.querySelector('#pfl-fov-slider');
    const vl = telepresenceDeck.querySelector('#pfl-fov-val');
    if (sl && Number(sl.value) !== Math.round(clamped)) sl.value = String(Math.round(clamped));
    if (vl) {
      const mag = (60 / clamped).toFixed(1);
      vl.textContent = `${Math.round(clamped)}° (${mag}×)`;
    }
    telepresenceDeck.querySelectorAll('[data-pfl-fov]').forEach((b) => {
      const match = Math.abs(Number(b.getAttribute('data-pfl-fov')) - clamped) < 1.5;
      b.style.borderColor = match ? '#c084fc' : '';
      b.style.color = match ? '#e9d5ff' : '';
    });
    paintGlobe();
    governorRequestRender('pfl-fov-lens');
  }
  window.__pflSetLensFov = setOpticalLensFov;

  const fovSliderEl = telepresenceDeck.querySelector('#pfl-fov-slider');
  fovSliderEl?.addEventListener('input', (e) => setOpticalLensFov(Number(e.target.value)));
  fovSliderEl?.addEventListener('change', (e) => setOpticalLensFov(Number(e.target.value)));
  telepresenceDeck.querySelectorAll('[data-pfl-fov]').forEach((btn) => {
    btn.addEventListener('click', () => setOpticalLensFov(Number(btn.getAttribute('data-pfl-fov'))));
  });
  const altWheelLensHandler = (e) => {
    if (!e.altKey) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const deltaDeg = e.deltaY > 0 ? 4 : -4;
    setOpticalLensFov(currentLensFovDeg + deltaDeg);
  };
  viewer?.scene?.canvas?.addEventListener?.('wheel', altWheelLensHandler, { capture: true, passive: false });
  setOpticalLensFov(currentLensFovDeg);

  // Wire Second-Life Teleport Pads & 1S788 Carport -> Holodeck Portal
  const TELEPORT_PADS_KEY = 'pfl_teleport_pads_v1';
  const CURATED_TELEPORT_PADS = [
    {
      id: 'balcony-sweet',
      domId: 'pfl-pad-balcony-sweet',
      label: '⚡ Balcony Sweet Spot',
      lat: 29.247485,
      lon: -95.231515,
      heightOffset: 5.2,
      heading: 108,
      pitch: -16,
      fov: 60,
      curated: true,
    },
    {
      id: 'lisa-closeup',
      domId: 'pfl-pad-lisa-closeup',
      label: '⚡ Lisa Close-Up',
      dynamicKind: 'lisa-closeup',
      lat: 29.247416,
      lon: -95.231450,
      heightOffset: 1.65,
      heading: 12,
      pitch: -6,
      fov: 50,
      curated: true,
    },
    {
      id: '1s788-carport',
      domId: 'pfl-pad-1s788-carport',
      label: '⚡ 1S788 Carport Portal',
      lat: 29.247495,
      lon: -95.231435,
      heightOffset: 1.8,
      heading: 0,
      pitch: -6,
      fov: 65,
      curated: true,
    },
    {
      id: 'bayou-dock',
      domId: 'pfl-pad-bayou-dock',
      label: '⚡ Bayou Dock',
      lat: 29.247752,
      lon: -95.231382,
      heightOffset: 1.8,
      heading: 7.5,
      pitch: -10,
      fov: 65,
      curated: true,
    },
  ];

  function loadTeleportPads() {
    let custom = [];
    try {
      const raw = JSON.parse(localStorage.getItem(TELEPORT_PADS_KEY) || 'null');
      if (Array.isArray(raw)) {
        custom = raw.filter((p) => p && !p.curated && Number.isFinite(p.lat) && Number.isFinite(p.lon));
      } else if (raw && Array.isArray(raw.customPads)) {
        custom = raw.customPads.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon));
      }
    } catch {}
    const merged = [...CURATED_TELEPORT_PADS, ...custom];
    try {
      localStorage.setItem(TELEPORT_PADS_KEY, JSON.stringify(merged));
    } catch {}
    return merged;
  }

  let teleportPads = loadTeleportPads();
  let portalStepCooldownUntil = 0;
  let insideHolodeckPortalZone = false;

  function saveTeleportPads(list) {
    teleportPads = list;
    try {
      localStorage.setItem(TELEPORT_PADS_KEY, JSON.stringify(list));
    } catch {}
  }

  function teleportToPad(pad) {
    if (!pad || !viewer?.camera) return;
    unlockDroneCamera();
    enforceZeroAltitudeKickGuard();
    portalStepCooldownUntil = Date.now() + 1400;
    insideHolodeckPortalZone = false;

    let destLon = pad.lon;
    let destLat = pad.lat;
    let destHeight = Number.isFinite(pad.height) ? pad.height : resolveLocalGroundM(pad.lon, pad.lat) + (pad.heightOffset ?? 1.8);
    let destHeadingDeg = pad.heading ?? 0;
    let destPitchDeg = pad.pitch ?? -12;

    if (pad.dynamicKind === 'lisa-closeup') {
      const tgt = resolveDroneTarget('lisa');
      const lisaHdgDeg = Number(window.__pflMovables?.lisa?.getState?.()?.heading ?? 192);
      const frontRad = Cesium.Math.toRadians(lisaHdgDeg);
      const distFrontM = 2.35;
      destLat = tgt.lat + (Math.cos(frontRad) * distFrontM) / 111320;
      destLon = tgt.lon + (Math.sin(frontRad) * distFrontM) / (111320 * Math.cos(Cesium.Math.toRadians(tgt.lat)));
      destHeight = tgt.alt + 1.55;
      destHeadingDeg = ((lisaHdgDeg + 180) % 360 + 360) % 360;
      destPitchDeg = -6;
    } else if (pad.curated) {
      destHeight = resolveLocalGroundM(destLon, destLat) + (pad.heightOffset ?? 1.8);
    } else if (Number.isFinite(pad.heightOffset)) {
      const liveGround = resolveLocalGroundM(destLon, destLat);
      if (!Number.isFinite(pad.height) || Math.abs((pad.height - pad.heightOffset) - liveGround) > 12) {
        destHeight = liveGround + pad.heightOffset;
      }
    }

    if (Number.isFinite(pad.fov)) setOpticalLensFov(pad.fov);
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(destLon, destLat, destHeight),
      orientation: {
        heading: Cesium.Math.toRadians(destHeadingDeg),
        pitch: Cesium.Math.toRadians(destPitchDeg),
        roll: 0,
      },
    });
    paintGlobe();
    governorRequestRender('pfl-teleport-pad');
  }

  function renderTeleportPadsList() {
    const listEl = telepresenceDeck.querySelector('#pfl-teleport-pads-list');
    if (!listEl) return;
    listEl.innerHTML = teleportPads.map((p) => `
      <span style="display:inline-flex;align-items:center;gap:1px">
        <button type="button" class="pfl-std-cbtn" ${p.domId ? `id="${p.domId}"` : ''} data-pfl-pad-id="${p.id}" style="border-color:rgba(34,211,238,0.45);color:#e0f2fe">${p.label}</button>
        ${p.curated ? '' : `<button type="button" class="pfl-std-cbtn" data-pfl-pad-del="${p.id}" title="Remove pad" style="padding:1px 4px;color:#fda4af">×</button>`}
      </span>
    `).join('');
    listEl.querySelectorAll('[data-pfl-pad-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-pfl-pad-id');
        const found = teleportPads.find((x) => x.id === id);
        if (found) teleportToPad(found);
      });
    });
    listEl.querySelectorAll('[data-pfl-pad-del]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-pfl-pad-del');
        saveTeleportPads(teleportPads.filter((x) => x.id !== id));
        renderTeleportPadsList();
      });
    });
  }
  renderTeleportPadsList();

  telepresenceDeck.querySelector('#pfl-drop-pad-btn')?.addEventListener('click', (e) => {
    const c = viewer?.camera?.positionCartographic;
    if (!c) return;
    const lon = Number(Cesium.Math.toDegrees(c.longitude).toFixed(6));
    const lat = Number(Cesium.Math.toDegrees(c.latitude).toFixed(6));
    const height = Number(c.height.toFixed(2));
    const heightOffset = Number((c.height - resolveLocalGroundM(lon, lat)).toFixed(2));
    const heading = Number((((Cesium.Math.toDegrees(viewer.camera.heading || 0) % 360) + 360) % 360).toFixed(1));
    const pitch = Number(Cesium.Math.toDegrees(viewer.camera.pitch || 0).toFixed(1));
    const fov = Math.round(currentLensFovDeg);
    const customIdx = teleportPads.filter((x) => !x.curated).length + 1;
    const newPad = {
      id: `pad-${Date.now()}`,
      label: `📍 Pad #${customIdx}`,
      lon,
      lat,
      height,
      heightOffset,
      heading,
      pitch,
      fov,
      curated: false,
    };
    saveTeleportPads([...teleportPads, newPad]);
    renderTeleportPadsList();
    const btn = e.currentTarget;
    btn.textContent = '✅ Pad Saved!';
    setTimeout(() => { btn.textContent = '➕ Drop Pad Here'; }, 1100);
  });

  telepresenceDeck.querySelector('#pfl-enter-holodeck-btn')?.addEventListener('click', () => {
    openHolodeckHallway();
  });

  const HOUSE_3D_ON_KEY = 'pfl_house_3d_on_v1';
  let house3dOn = true;
  let houseGlbAvailable = null; // null = unchecked, boolean once probed
  try {
    const rawHouseOn = localStorage.getItem(HOUSE_3D_ON_KEY);
    if (rawHouseOn !== null) house3dOn = rawHouseOn !== 'false';
  } catch {}
  const houseToggleBtn = telepresenceDeck.querySelector('#pfl-house-3d-toggle');
  const syncBedElevationForHouse = (isOnAndLoaded) => {
    try {
      const bedMov = window.__pflMovables?.['bed-station-20261012'];
      if (!bedMov) return;
      const bst = bedMov.getState();
      if (isOnAndLoaded && Number(bst.lift || 0) < 4.0) {
        bedMov.update({ lift: 7.95 });
      } else if (!isOnAndLoaded && Number(bst.lift || 0) > 4.0) {
        bedMov.update({ lift: 0.35 });
      }
    } catch {}
  };
  const syncHouseBtnUi = () => {
    if (!houseToggleBtn) return;
    houseToggleBtn.textContent = house3dOn ? '🏠 3D House: ON' : '🏠 3D House: OFF';
    houseToggleBtn.style.borderColor = house3dOn ? '#fbbf24' : 'rgba(148,163,184,0.35)';
    houseToggleBtn.style.color = house3dOn ? '#fde047' : '#94a3b8';
  };
  syncHouseBtnUi();
  houseToggleBtn?.addEventListener('click', () => {
    house3dOn = !house3dOn;
    if (house3dOn && !houseGlbAvailable) houseGlbAvailable = null;
    try { localStorage.setItem(HOUSE_3D_ON_KEY, String(house3dOn)); } catch {}
    syncHouseBtnUi();
    syncBedElevationForHouse(house3dOn && houseGlbAvailable === true);
    buildYard3dLandmarks();
    governorRequestRender('pfl-house-toggle');
  });

  const S788_PREVIEW_KEY = 'pfl_s788_wireframe_v2';
  let s788PreviewOn = false;
  try {
    const rawS788 = localStorage.getItem(S788_PREVIEW_KEY);
    if (rawS788 !== null) s788PreviewOn = rawS788 === 'true';
  } catch {}
  const s788ToggleBtn = telepresenceDeck.querySelector('#pfl-s788-canopy-toggle');
  const syncS788BtnUi = () => {
    if (!s788ToggleBtn) return;
    s788ToggleBtn.textContent = s788PreviewOn ? '🏗️ S-788 & 11ft Canopy: ON' : '🏗️ S-788 & 11ft Canopy: OFF';
    s788ToggleBtn.style.borderColor = s788PreviewOn ? '#38bdf8' : 'rgba(148,163,184,0.35)';
    s788ToggleBtn.style.color = s788PreviewOn ? '#7dd3fc' : '#94a3b8';
  };
  syncS788BtnUi();
  s788ToggleBtn?.addEventListener('click', () => {
    s788PreviewOn = !s788PreviewOn;
    try { localStorage.setItem(S788_PREVIEW_KEY, String(s788PreviewOn)); } catch {}
    syncS788BtnUi();
    buildYard3dLandmarks();
    governorRequestRender('pfl-s788-toggle');
  });

  function checkHolodeckPortalStep() {
    if (droneOrbitState.active || Date.now() < portalStepCooldownUntil) return;
    const c = viewer?.camera?.positionCartographic;
    if (!c) return;
    const camLat = Cesium.Math.toDegrees(c.latitude);
    const camLon = Cesium.Math.toDegrees(c.longitude);
    const portalLat = 29.247518;
    const portalLon = -95.231435;
    const dN = (camLat - portalLat) * 111320;
    const dE = (camLon - portalLon) * 111320 * Math.cos(Cesium.Math.toRadians(portalLat));
    const distM = Math.hypot(dN, dE);
    const hAbove = c.height - resolveLocalGroundM(portalLon, portalLat);
    if (distM <= 1.35 && hAbove >= -1.5 && hAbove <= 5.5) {
      if (!insideHolodeckPortalZone) {
        insideHolodeckPortalZone = true;
        openHolodeckHallway();
      }
    } else if (distM > 1.95) {
      insideHolodeckPortalZone = false;
    }
  }

  // Add Vertical Elevator (Up/Down without backing through photos) + Walk Steps + Save/Undo Spot in 3D Compass Box:
  const walkBar = document.createElement('div');
  walkBar.style.cssText = 'margin-top:6px;padding-top:6px;border-top:1px solid rgba(56,189,248,0.25);display:flex;flex-direction:column;gap:4px';
  walkBar.innerHTML = `
    <div style="display:flex;gap:3px;flex-wrap:wrap">
      <button type="button" class="pfl-std-cbtn" data-pfl-elev="+2" title="Raise camera straight UP +2m without moving forward/back">⬆️ Up +2m</button>
      <button type="button" class="pfl-std-cbtn" data-pfl-elev="-2" title="Lower camera straight DOWN -2m without pushing through photos">⬇️ Down -2m</button>
      <button type="button" class="pfl-std-cbtn" data-pfl-elev="eye" title="Drop straight to 1.8m walking eye level at this exact spot">👁️ Eye 1.8m</button>
      <button type="button" class="pfl-std-cbtn" data-pfl-elev="balcony" title="Set height to 6.2m balcony level">🏠 6.2m</button>
    </div>
    <div style="display:flex;gap:3px;flex-wrap:wrap">
      <button type="button" class="pfl-std-cbtn" data-pfl-step="fwd">⬆️ Step Fwd</button>
      <button type="button" class="pfl-std-cbtn" data-pfl-step="back">⬇️ Back</button>
      <button type="button" class="pfl-std-cbtn" data-pfl-step="left">⬅️ Left</button>
      <button type="button" class="pfl-std-cbtn" data-pfl-step="right">➡️ Right</button>
      <button type="button" class="pfl-std-cbtn" id="pfl-wasd-toggle" title="Walk horizontally at constant altitude with WASD">🚶 WASD: OFF</button>
    </div>
    <div style="display:flex;gap:3px;flex-wrap:wrap">
      <button type="button" class="pfl-std-cbtn" id="pfl-save-spot" title="Bookmark this exact camera position & angle">📌 Save Spot</button>
      <button type="button" class="pfl-std-cbtn" id="pfl-go-spot" title="Return to your saved spot">🎯 Go Spot</button>
      <button type="button" class="pfl-std-cbtn" id="pfl-undo-jump" title="Undo accidental sky ejection">⏪ Undo Jump</button>
    </div>
  `;
  compassWin.body.appendChild(walkBar);

  function stepHorizontal(fwdM, rightM) {
    unlockDroneCamera();
    const c = viewer.camera.positionCartographic;
    if (!c) return;
    enforceZeroAltitudeKickGuard();
    const hdg = viewer.camera.heading || 0;
    const eastM = Math.sin(hdg) * fwdM + Math.cos(hdg) * rightM;
    const northM = Math.cos(hdg) * fwdM - Math.sin(hdg) * rightM;
    const newLat = Cesium.Math.toDegrees(c.latitude) + northM / 111320;
    const newLon = Cesium.Math.toDegrees(c.longitude) + eastM / (111320 * Math.cos(c.latitude));
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(newLon, newLat, c.height),
      orientation: { heading: viewer.camera.heading, pitch: viewer.camera.pitch, roll: 0 },
    });
    checkHolodeckPortalStep();
    governorRequestRender('pfl-walk-step');
  }

  walkBar.querySelectorAll('[data-pfl-elev]').forEach((btn) => {
    btn.addEventListener('click', () => {
      unlockDroneCamera();
      const c = viewer.camera.positionCartographic;
      if (!c) return;
      enforceZeroAltitudeKickGuard();
      const mode = btn.getAttribute('data-pfl-elev');
      let gBase = 0;
      try {
        if (viewer.scene?.globe?.show !== false) {
          const gh = viewer.scene.globe.getHeight(c);
          if (Number.isFinite(gh)) gBase = gh;
        } else {
          gBase = -26.19;
        }
      } catch {}
      const nextH =
        mode === 'eye' ? gBase + 1.8 :
        mode === 'balcony' ? gBase + 6.2 :
        Math.max(gBase + 0.4, c.height + Number(mode));
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, nextH),
        orientation: { heading: viewer.camera.heading, pitch: viewer.camera.pitch, roll: 0 },
      });
      governorRequestRender('pfl-elev-step');
    });
  });

  walkBar.querySelectorAll('[data-pfl-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dir = btn.getAttribute('data-pfl-step');
      if (dir === 'fwd') stepHorizontal(2.5, 0);
      else if (dir === 'back') stepHorizontal(-2.5, 0);
      else if (dir === 'left') stepHorizontal(0, -2.5);
      else if (dir === 'right') stepHorizontal(0, 2.5);
    });
  });

  let wasdWalkOn = false;
  const wasdBtn = walkBar.querySelector('#pfl-wasd-toggle');
  wasdBtn?.addEventListener('click', () => {
    wasdWalkOn = !wasdWalkOn;
    wasdBtn.textContent = wasdWalkOn ? '🚶 WASD: ON' : '🚶 WASD: OFF';
    wasdBtn.style.borderColor = wasdWalkOn ? '#4ade80' : '';
  });
  const wasdKeydownHandler = (e) => {
    if (!wasdWalkOn) return;
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const k = e.key.toLowerCase();
    if (k === 'w') { e.preventDefault(); stepHorizontal(2.0, 0); }
    else if (k === 's') { e.preventDefault(); stepHorizontal(-2.0, 0); }
    else if (k === 'a') { e.preventDefault(); stepHorizontal(0, -2.0); }
    else if (k === 'd') { e.preventDefault(); stepHorizontal(0, 2.0); }
    else if (k === 'e') { e.preventDefault(); walkBar.querySelector('[data-pfl-elev="+2"]')?.click(); }
    else if (k === 'q') { e.preventDefault(); walkBar.querySelector('[data-pfl-elev="-2"]')?.click(); }
  };
  window.addEventListener('keydown', wasdKeydownHandler);

  const SAVED_SPOT_KEY = 'pfl_saved_sweet_spot_v1';
  walkBar.querySelector('#pfl-save-spot')?.addEventListener('click', (e) => {
    const c = viewer.camera.positionCartographic;
    if (!c) return;
    localStorage.setItem(SAVED_SPOT_KEY, JSON.stringify({
      lon: c.longitude, lat: c.latitude, height: c.height,
      heading: viewer.camera.heading, pitch: viewer.camera.pitch,
    }));
    e.currentTarget.textContent = '✅ Saved!';
    setTimeout(() => { e.currentTarget.textContent = '📌 Save Spot'; }, 1200);
  });
  walkBar.querySelector('#pfl-go-spot')?.addEventListener('click', () => {
    try {
      unlockDroneCamera();
      const gDatum = viewer?.scene?.globe?.show !== false ? 0 : -24.8;
      const sp = JSON.parse(localStorage.getItem(SAVED_SPOT_KEY) || 'null') || {
        lon: Cesium.Math.toRadians(-95.23125),
        lat: Cesium.Math.toRadians(29.24782),
        height: gDatum + 24,
        heading: Cesium.Math.toRadians(198),
        pitch: Cesium.Math.toRadians(-28),
      };
      enforceZeroAltitudeKickGuard();
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromRadians(sp.lon, sp.lat, sp.height),
        orientation: { heading: sp.heading, pitch: sp.pitch, roll: 0 },
        duration: 0.8,
      });
    } catch {}
  });
  walkBar.querySelector('#pfl-undo-jump')?.addEventListener('click', () => {
    if (!lastSafeYardPose) return;
    unlockDroneCamera();
    enforceZeroAltitudeKickGuard();
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromRadians(lastSafeYardPose.lon, lastSafeYardPose.lat, lastSafeYardPose.height),
      orientation: { heading: lastSafeYardPose.heading, pitch: lastSafeYardPose.pitch, roll: 0 },
    });
  });

  const timer = setInterval(() => {
    paintGlobe();
    syncTiltPolicy();
    checkHolodeckPortalStep();
    syncAlways3dVisibility();
  }, 350);

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
  function toggleGevLayerById(layerId) {
    if (layerId === 'radio') {
      const rBtn =
        document.querySelector('[data-layer-id="radio"] .data-toggle-btn') ||
        document.getElementById('radio-enable-btn');
      if (rBtn) {
        rBtn.click();
        return true;
      }
    }
    const btn =
      document.querySelector(`[data-layer-id="${layerId}"] .data-toggle-btn`) ||
      document.querySelector(`[data-layer="${layerId}"] .data-toggle-btn`) ||
      document.querySelector(`[data-layer-id="${layerId}"], [data-layer="${layerId}"]`);
    if (btn) btn.click();
    return Boolean(btn);
  }
  function getGevLayerStatus(layerId) {
    const btn =
      document.querySelector(`[data-layer-id="${layerId}"] .data-toggle-btn`) ||
      document.querySelector(`[data-layer="${layerId}"] .data-toggle-btn`) ||
      (layerId === 'radio' ? document.getElementById('radio-enable-btn') : null);
    if (!btn) return { active: false, disabled: false, label: 'OFF' };
    const disabled = btn.getAttribute('aria-disabled') === 'true' || btn.disabled;
    const fs = String(btn.getAttribute('data-feed-state') || '').toLowerCase();
    const cls = String(btn.className || '');
    const txt = String(btn.textContent || '').trim().toUpperCase();
    const pressed = btn.getAttribute('aria-pressed') === 'true';
    const active =
      pressed ||
      cls.includes('active') ||
      cls.includes('is-on') ||
      fs === 'active' ||
      fs === 'live' ||
      fs === 'loading' ||
      txt === 'ON' ||
      txt === 'LIVE';
    return {
      active,
      disabled,
      label: active ? 'ON' : (disabled ? 'SETUP KEY' : 'OFF'),
    };
  }
  function isGevLayerActive(layerId) {
    return getGevLayerStatus(layerId).active;
  }

  kalshiWin.body.querySelector('#pfl-kalshi-wx-btn')?.addEventListener('click', () => {
    for (const id of ['weather', 'wind', 'cyclones']) {
      toggleGevLayerById(id);
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
    window.open('/memory-palace.html', '_blank', 'noopener');
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
    defaultLeft: Math.max(40, window.innerWidth - 790),
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
          <button type="button" class="pfl-std-cbtn" id="pfl-patrol-pins" style="border-color:#fbbf24;color:#fde047">📍 3D Pins: OFF</button>
          <button type="button" class="pfl-std-cbtn" id="pfl-patrol-sync" title="Pull latest Wyze cloud Person/Vehicle clips now">↻ Sync</button>
        </div>
      </div>
      <div style="position:relative;background:#020617;border:1px solid rgba(56,189,248,0.4);border-radius:8px;overflow:hidden;margin-bottom:6px">
        <video id="pfl-patrol-video" autoplay muted playsinline controls style="width:100%;max-height:215px;display:block;background:#000"></video>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px" id="pfl-patrol-cam-btns">
        <button type="button" class="pfl-std-cbtn" data-live-src="wyze-cam-v4" data-fly-lat="29.24753" data-fly-lon="-95.23144" data-fly-hdg="223" style="border-color:#38bdf8;color:#38bdf8">▶ V4 Front Yard</button>
        <button type="button" class="pfl-std-cbtn" data-live-src="back-yard-cam1" data-fly-lat="29.24751" data-fly-lon="-95.23130" data-fly-hdg="172">▶ Cam1 East Driveway &amp; RV</button>
        <button type="button" class="pfl-std-cbtn" data-live-src="back-yard-cam2" data-fly-lat="29.247640" data-fly-lon="-95.231385" data-fly-hdg="7.5">▶ Cam2 Bayou Dock</button>
        <button type="button" class="pfl-std-cbtn" data-live-src="hd" data-fly-lat="29.247485" data-fly-lon="-95.231355" data-fly-hdg="108" title="Live Monaco RV, White Tesla &amp; ~70W Street Lamp">▶ HD Monaco (LIVE)</button>
      </div>
      <div style="font-weight:700;color:#4ade80;font-size:10.5px;margin-bottom:3px">📌 Pin Always-On 3D Yard Projections (Stays ON Even With CCTV OFF!):</div>
      <div id="pfl-always3d-checks" style="display:flex;flex-wrap:wrap;gap:8px;padding:4px 6px;background:rgba(6,78,59,0.32);border:1px solid rgba(34,197,94,0.45);border-radius:6px;margin-bottom:6px;font-size:10.5px"></div>
      <div style="font-weight:700;color:#cbd5e1;font-size:10.5px;margin-bottom:3px">Legacy CCTV Catalog Filter (Optional):</div>
      <div id="pfl-patrol-checks" style="display:flex;flex-wrap:wrap;gap:8px;padding:4px 6px;background:rgba(15,23,42,0.75);border:1px solid #1e293b;border-radius:6px;margin-bottom:6px;font-size:10.5px"></div>
      <div style="background:rgba(15,23,42,0.88);border:1px solid rgba(251,191,36,0.45);border-radius:7px;padding:6px;margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:4px">
          <span style="font-weight:700;color:#fde047;font-size:10.5px">⏱️ 4D EVENT TIME-SLIDER SCRUBBER</span>
          <div style="display:flex;gap:4px;align-items:center">
            <button type="button" class="pfl-std-cbtn" id="pfl-4d-play" style="border-color:#fde047;color:#fde047">▶ Scrub Events</button>
            <select id="pfl-4d-speed" style="background:#090e18;border:1px solid #475569;color:#fde047;border-radius:4px;font-size:10px;padding:1px 4px">
              <option value="1">1× (6s/ev)</option>
              <option value="2" selected>2× (3s/ev)</option>
              <option value="4">4× (1.5s/ev)</option>
              <option value="8">8× (0.8s/ev)</option>
            </select>
            <button type="button" class="pfl-std-cbtn" id="pfl-4d-director" style="border-color:#38bdf8;color:#38bdf8" title="Automatically pan the 3D view to follow new Person &amp; Vehicle detections">🎯 Auto-Director: ON</button><button type="button" class="pfl-std-cbtn" id="pfl-yard-alarm" style="border-color:#ef4444;color:#fca5a5" title="Sound audible alarm &amp; flash red banner when a PERSON walks into your yard">🚨 Alarm: ARMED</button>
          </div>
        </div>
        <input type="range" id="pfl-4d-slider" min="0" max="0" value="0" style="width:100%;accent-color:#fbbf24;cursor:pointer" />
        <div id="pfl-4d-readout" style="font-family:'JetBrains Mono',monospace;font-size:10px;color:#cbd5e1;display:flex;justify-content:space-between;margin-top:2px">
          <span>Drag slider to scrub event-to-event in 4D</span>
          <span id="pfl-4d-idx">0 / 0</span>
        </div>
      </div>
      <div style="font-weight:700;color:#fbbf24;margin-bottom:3px">Captured Person &amp; Vehicle Events (Click to Play Clip &amp; Fly to Camera):</div>
      <div id="pfl-patrol-events" style="max-height:125px;overflow:auto;border:1px solid #1e293b;border-radius:6px;padding:4px;font-size:10.5px">Loading archived Wyze events...</div>
    </div>
  `;

  let activeLiveSrc = 'wyze-cam-v4';
  let patrolCycleOn = false;
  let patrolPinsOn = false;
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
      if (n >= 1) continue;
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
          width: 96,
          height: 20,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: 800,
        },
      });
      eventPinIds.push(pid);
    }
    governorRequestRender('pfl-wyze-event-pins');
  }

  let patrolSiteFilter = 'liverpool';

  // 4D Event Time-Slider + Auto-Director Engine
  let chronoEvents = []; // oldest -> newest so scrubbing left->right moves forward in time!
  let scrubPlaying = false;
  let autoDirectorOn = true;
  let yardAlarmArmed = true;
  let lastSeenNewestEventId = null;
  let scrubTimeout = 0;


  function triggerBrowserIntruderSiren(ev) {
    if (!yardAlarmArmed) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        [0, 0.32, 0.64].forEach((offset, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(idx % 2 === 0 ? 880 : 660, ctx.currentTime + offset);
          gain.gain.setValueAtTime(0.18, ctx.currentTime + offset);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.28);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + offset);
          osc.stop(ctx.currentTime + offset + 0.29);
        });
      }
    } catch {}
    patrolWin.box.style.borderColor = '#ef4444';
    patrolWin.box.style.boxShadow = '0 0 32px rgba(239,68,68,0.85)';
    setTimeout(() => {
      patrolWin.box.style.borderColor = '';
      patrolWin.box.style.boxShadow = '';
    }, 8000);
  }

  function jumpTo4dEvent(chronoIdx, fly3d = true) {
    if (!chronoEvents.length) return;
    const clamped = Math.max(0, Math.min(chronoEvents.length - 1, chronoIdx));
    const ev = chronoEvents[clamped];
    const slider = patrolWin.body.querySelector('#pfl-4d-slider');
    const rd = patrolWin.body.querySelector('#pfl-4d-readout > span:first-child');
    const idxEl = patrolWin.body.querySelector('#pfl-4d-idx');
    if (slider) slider.value = String(clamped);
    if (idxEl) idxEl.textContent = `${clamped + 1} / ${chronoEvents.length}`;
    const tShort = String(ev.occurredAt || '').replace('T', ' ').slice(0, 19);
    const badge = (ev.tags || []).join('+');
    if (rd) rd.textContent = `${tShort} · ${badge} (${ev.camera})`;

    if (ev.videoUrl) {
      playPatrolStream(ev.camera, `${badge} @ ${tShort.slice(11, 19)}`, ev.videoUrl);
    } else if (ev.thumbUrl) {
      const vid = patrolWin.body.querySelector('#pfl-patrol-video');
      if (vid) vid.poster = ev.thumbUrl;
    }

    if (fly3d) {
      unlockDroneCamera();
      if (ev.camera === 'back-yard-cam2') {
        if (typeof window.__pflFlyBackyard180 === 'function') window.__pflFlyBackyard180();
      } else if (ev.camera === 'wyze-cam-v4' || ev.camera === 'back-yard-cam1') {
        if (typeof window.__pflFlyBalconyFront === 'function') window.__pflFlyBalconyFront();
      } else if (Number.isFinite(ev.lat) && Number.isFinite(ev.lon)) {
        try { viewer.trackedEntity = undefined; viewer.selectedEntity = undefined; } catch {}
        let base = 0;
        try {
          if (viewer.scene?.globe?.show === false) base = -26.19;
          else {
            const h = viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(ev.lon, ev.lat));
            if (Number.isFinite(h)) base = h;
          }
        } catch {}
        const hRad = Cesium.Math.toRadians(ev.headingDeg ?? 198);
        const eyeLat = ev.lat - (Math.cos(hRad) * 16) / 110800;
        const eyeLon = ev.lon - (Math.sin(hRad) * 16) / (111320 * Math.cos((ev.lat * Math.PI) / 180));
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(eyeLon, eyeLat, base + 14),
          orientation: { heading: hRad, pitch: Cesium.Math.toRadians(-21), roll: 0 },
          duration: 0.95,
        });
      }
    }
  }

  function update4dEventTimeline(descEvents) {
    chronoEvents = [...(descEvents || [])].reverse();
    const slider = patrolWin.body.querySelector('#pfl-4d-slider');
    const idxEl = patrolWin.body.querySelector('#pfl-4d-idx');
    if (slider) {
      slider.max = String(Math.max(0, chronoEvents.length - 1));
      if (!scrubPlaying) slider.value = String(Math.max(0, chronoEvents.length - 1));
    }
    if (idxEl) idxEl.textContent = chronoEvents.length ? `${chronoEvents.length} / ${chronoEvents.length}` : '0 / 0';
    const newest = chronoEvents[chronoEvents.length - 1];
    if (newest && lastSeenNewestEventId && newest.id !== lastSeenNewestEventId) {
      const isPerson = (newest.tags || []).some((t) => String(t).toUpperCase().includes('PERSON'));
      if (isPerson) triggerBrowserIntruderSiren(newest);
      if (autoDirectorOn || isPerson) jumpTo4dEvent(chronoEvents.length - 1, true);
    }
    if (newest) lastSeenNewestEventId = newest.id;
  }

  function step4dScrub() {
    if (!scrubPlaying || !chronoEvents.length) return;
    const slider = patrolWin.body.querySelector('#pfl-4d-slider');
    const speedSel = patrolWin.body.querySelector('#pfl-4d-speed');
    const spd = Math.max(1, Number(speedSel?.value || 2));
    const cur = Number(slider?.value || 0);
    const next = (cur + 1) % chronoEvents.length;
    jumpTo4dEvent(next, true);
    scrubTimeout = window.setTimeout(step4dScrub, Math.round(6000 / spd));
  }

  patrolWin.body.querySelector('#pfl-4d-slider')?.addEventListener('input', (e) => {
    jumpTo4dEvent(Number(e.target.value), true);
  });
  patrolWin.body.querySelector('#pfl-4d-play')?.addEventListener('click', (e) => {
    scrubPlaying = !scrubPlaying;
    e.currentTarget.textContent = scrubPlaying ? '⏸ Pause Scrub' : '▶ Scrub Events';
    clearTimeout(scrubTimeout);
    if (scrubPlaying) step4dScrub();
  });
  patrolWin.body.querySelector('#pfl-4d-director')?.addEventListener('click', (e) => {
    autoDirectorOn = !autoDirectorOn;
    e.currentTarget.textContent = autoDirectorOn ? '🎯 Auto-Director: ON' : '🎯 Auto-Director: OFF';
    if (autoDirectorOn && chronoEvents.length) jumpTo4dEvent(chronoEvents.length - 1, true);
  });
  patrolWin.body.querySelector('#pfl-yard-alarm')?.addEventListener('click', (e) => {
    yardAlarmArmed = !yardAlarmArmed;
    e.currentTarget.textContent = yardAlarmArmed ? '🚨 Alarm: ARMED' : '🔕 Alarm: MUTED';
  });
  const alarmPollTimer = setInterval(() => refreshWyzePatrol(false), 25000);

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
            <span>${c.src === 'hd' ? 'hd (Monaco RV)' : c.src}</span>
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
        update4dEventTimeline(list);
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
              unlockDroneCamera();
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
        unlockDroneCamera();
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

    // Glowing 3D Cyan/Purple Holodeck Portal Ring under 1S788 Carport Entry (29.247518, -95.231435)
    const portalCanvas = document.createElement('canvas');
    portalCanvas.width = 256;
    portalCanvas.height = 256;
    const pctx = portalCanvas.getContext('2d');
    const rg = pctx.createRadialGradient(128, 128, 12, 128, 128, 124);
    rg.addColorStop(0.0, 'rgba(34, 211, 238, 0.38)');
    rg.addColorStop(0.45, 'rgba(168, 85, 247, 0.48)');
    rg.addColorStop(0.76, 'rgba(34, 211, 238, 0.92)');
    rg.addColorStop(0.90, 'rgba(192, 132, 252, 0.95)');
    rg.addColorStop(1.0, 'rgba(34, 211, 238, 0.0)');
    pctx.fillStyle = rg;
    pctx.beginPath();
    pctx.arc(128, 128, 124, 0, Math.PI * 2);
    pctx.fill();
    pctx.strokeStyle = '#67e8f9';
    pctx.lineWidth = 6;
    pctx.beginPath();
    pctx.arc(128, 128, 102, 0, Math.PI * 2);
    pctx.stroke();
    pctx.strokeStyle = '#c084fc';
    pctx.lineWidth = 4;
    pctx.beginPath();
    pctx.arc(128, 128, 72, 0, Math.PI * 2);
    pctx.stroke();

    let portalGround = gBase;
    try {
      if (viewer.scene?.globe?.show !== false) {
        const ph = viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(-95.231435, 29.247518));
        if (Number.isFinite(ph)) portalGround = ph;
      }
    } catch {}
    const makeWorldTagCanvas = (text, borderHex, fgHex) => {
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 38;
      const ctx = c.getContext('2d');
      ctx.fillStyle = 'rgba(9, 14, 26, 0.86)';
      ctx.strokeStyle = borderHex;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(2, 2, 316, 34, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = fgHex;
      ctx.font = '700 13px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 160, 19);
      return c;
    };

    const portalId = 'pfl-holodeck-portal-1s788';
    viewer.entities.add({
      id: portalId,
      name: '🚪 1S788 Carport → Holodeck Hallway Portal (:8766)',
      position: Cesium.Cartesian3.fromDegrees(-95.231435, 29.247518, portalGround + 1.15),
      ellipse: {
        semiMajorAxis: 1.15,
        semiMinorAxis: 1.15,
        height: portalGround + 0.12,
        material: new Cesium.ImageMaterialProperty({
          image: portalCanvas,
          transparent: true,
        }),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(0.95),
      },
      cylinder: {
        length: 2.15,
        topRadius: 1.02,
        bottomRadius: 1.02,
        material: Cesium.Color.fromCssColorString('#a855f7').withAlpha(0.16),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(0.85),
      },
      billboard: {
        image: makeWorldTagCanvas('🚪 1S788 HOLODECK PORTAL', '#22d3ee', '#67e8f9'),
        width: 172,
        height: 21,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -18),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 140),
        disableDepthTestDistance: 45,
      },
    });
    yardLandmarkIds.push(portalId);

    // MIL-STD S-788/G Shelters (102" L × 84" W × 67" H = 2.59m × 2.13m × 1.70m) + 3.35m (11ft) Walk-Through Solar Canopy Preview (OFF by default; compact over west carport when toggled ON)
    if (s788PreviewOn) {
      const s788BaseLat = 29.247485;
      const s788BaseLon = -95.231495;
      const mPerDegLon = 111320 * Math.cos(Cesium.Math.toRadians(s788BaseLat));
      const shelterLenM = 2.59; // 102 in
      const shelterWidM = 2.13; // 84 in
      const shelterHgtM = 1.70; // 67 in
      const canopyRidgeM = 3.35; // 11.0 ft walk-under clearance
      const canopyWidM = 6.80;
      const canopyLenM = 4.60;

      const shelterSpecs = [
        { id: 'pfl-s788-shelter-west', tag: 'S-788/G WEST (2.59×2.13×1.70m)', dEastM: -2.25 },
        { id: 'pfl-s788-shelter-east', tag: 'S-788/G EAST (2.59×2.13×1.70m)', dEastM: 2.25 },
      ];
      for (const sh of shelterSpecs) {
        const sLon = s788BaseLon + sh.dEastM / mPerDegLon;
        viewer.entities.add({
          id: sh.id,
          name: `🏗️ MIL-STD ${sh.tag}`,
          position: Cesium.Cartesian3.fromDegrees(sLon, s788BaseLat, portalGround + shelterHgtM * 0.5),
          box: {
            dimensions: new Cesium.Cartesian3(shelterWidM, shelterLenM, shelterHgtM),
            material: Cesium.Color.fromCssColorString('#65a30d').withAlpha(0.24),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('#bef264').withAlpha(0.95),
          },
          billboard: {
            image: makeWorldTagCanvas(sh.tag, '#84cc16', '#d9f99d'),
            width: 158,
            height: 19,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -10),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 95),
          },
        });
        yardLandmarkIds.push(sh.id);
      }

      // 4 structural steel posts holding the 11ft (3.35m) solar canopy clear above head height
      const postOffsets = [
        [-canopyWidM * 0.46, -canopyLenM * 0.44, 'nw'],
        [canopyWidM * 0.46, -canopyLenM * 0.44, 'ne'],
        [-canopyWidM * 0.46, canopyLenM * 0.44, 'sw'],
        [canopyWidM * 0.46, canopyLenM * 0.44, 'se'],
      ];
      for (const [dE, dN, tag] of postOffsets) {
        const pid = `pfl-s788-post-${tag}`;
        viewer.entities.add({
          id: pid,
          name: '🏗️ S-788 Solar Canopy Column (3.35m / 11ft)',
          position: Cesium.Cartesian3.fromDegrees(
            s788BaseLon + dE / mPerDegLon,
            s788BaseLat + dN / 111320,
            portalGround + canopyRidgeM * 0.5,
          ),
          cylinder: {
            length: canopyRidgeM,
            topRadius: 0.065,
            bottomRadius: 0.065,
            material: Cesium.Color.fromCssColorString('#94a3b8').withAlpha(0.85),
          },
        });
        yardLandmarkIds.push(pid);
      }

      const canopyId = 'pfl-s788-solar-canopy';
      viewer.entities.add({
        id: canopyId,
        name: '☀️ 1S788 Overhead Solar Canopy (3.35m / 11.0 ft Walk-Through Clearance)',
        position: Cesium.Cartesian3.fromDegrees(s788BaseLon, s788BaseLat, portalGround + canopyRidgeM + 0.07),
        box: {
          dimensions: new Cesium.Cartesian3(canopyWidM, canopyLenM, 0.14),
          material: Cesium.Color.fromCssColorString('#1d4ed8').withAlpha(0.30),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.95),
        },
        billboard: {
          image: makeWorldTagCanvas('☀️ 11.0 FT (3.35m) SOLAR CANOPY', '#38bdf8', '#7dd3fc'),
          width: 176,
          height: 20,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -12),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 120),
        },
      });
      yardLandmarkIds.push(canopyId);
    }

    // 3D Monaco 40ft Class-A Diesel Pusher Coach RV in East Driveway beside Fleetwood RV (12.2m L × 2.59m W × 3.65m H)
    const MONACO_POSE_KEY = 'pfl_monaco_pose_v2';
    let monacoState = { lat: 29.247510, lon: -95.231268, heading: 175, lift: 0 };
    try {
      const savedMon = JSON.parse(localStorage.getItem(MONACO_POSE_KEY) || 'null');
      if (savedMon && Number.isFinite(savedMon.lat) && Number.isFinite(savedMon.lon)) {
        monacoState = { ...monacoState, ...savedMon };
      }
    } catch {}

    let rvGround = resolveLocalGroundM(monacoState.lon, monacoState.lat);

    if (!viewer._pflMonacoLiveryCanvas) {
      const lc = document.createElement('canvas');
      lc.width = 512;
      lc.height = 256;
      const lctx = lc.getContext('2d');
      // Executive Pearl-Ivory & Brushed Warm Champagne Coach Finish
      const upperGrad = lctx.createLinearGradient(0, 0, 0, 176);
      upperGrad.addColorStop(0, '#f7f3eb');
      upperGrad.addColorStop(0.65, '#efe8dc');
      upperGrad.addColorStop(1, '#e5dccb');
      lctx.fillStyle = upperGrad;
      lctx.fillRect(0, 0, 512, 176);
      // Brushed champagne metallic lower basement skirt
      const skirtGrad = lctx.createLinearGradient(0, 170, 0, 256);
      skirtGrad.addColorStop(0, '#d8cab6');
      skirtGrad.addColorStop(1, '#c7b69e');
      lctx.fillStyle = skirtGrad;
      lctx.fillRect(0, 170, 512, 86);
      // Subtle executive champagne-gold & warm taupe coach accent lines (soft, clean, non-garish)
      lctx.strokeStyle = 'rgba(180, 146, 90, 0.62)';
      lctx.lineWidth = 3;
      lctx.beginPath();
      lctx.moveTo(0, 156);
      lctx.bezierCurveTo(170, 146, 340, 150, 512, 160);
      lctx.stroke();
      lctx.strokeStyle = 'rgba(120, 108, 92, 0.45)';
      lctx.lineWidth = 2;
      lctx.beginPath();
      lctx.moveTo(0, 165);
      lctx.bezierCurveTo(170, 155, 340, 159, 512, 168);
      lctx.stroke();
      // Frameless flush tinted salon windows
      lctx.fillStyle = '#1e293b';
      for (const [wx, ww] of [[38, 110], [168, 96], [284, 88], [392, 82]]) {
        lctx.beginPath();
        lctx.roundRect(wx, 48, ww, 56, 6);
        lctx.fill();
      }
      // Subtle storage bay door seams
      lctx.strokeStyle = 'rgba(100, 90, 78, 0.38)';
      lctx.lineWidth = 1.5;
      for (let bx = 42; bx < 470; bx += 72) {
        lctx.strokeRect(bx, 182, 64, 58);
      }
      viewer._pflMonacoLiveryCanvas = lc;
    }

    const monacoIds = [
      'pfl-monaco-rv-body',
      'pfl-monaco-rv-windshield',
      'pfl-monaco-rv-cablamp',
      'pfl-monaco-rv-ac-front',
      'pfl-monaco-rv-ac-rear',
      'pfl-monaco-rv-awning',
    ];
    for (const mid of monacoIds) viewer.entities.removeById(mid);

    const placeMonacoPart = (id, name, localX, localY, localZ, dims, mat, outlineCol, billboardSpec = null) => {
      const sc = Number(monacoState.scale) > 0 ? Number(monacoState.scale) : 1;
      const origin = Cesium.Cartesian3.fromDegrees(monacoState.lon, monacoState.lat, rvGround + (monacoState.lift || 0));
      const hpr = new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(monacoState.heading || 175), 0, 0);
      const frame = Cesium.Transforms.headingPitchRollToFixedFrame(origin, hpr);
      const pos = Cesium.Matrix4.multiplyByPoint(frame, new Cesium.Cartesian3(localX * sc, localY * sc, localZ * sc), new Cesium.Cartesian3());
      const ori = Cesium.Transforms.headingPitchRollQuaternion(pos, hpr);
      const ent = viewer.entities.add({
        id,
        name,
        position: pos,
        orientation: ori,
        box: {
          dimensions: new Cesium.Cartesian3(dims.x * sc, dims.y * sc, dims.z * sc),
          material: mat,
          outline: Boolean(outlineCol),
          outlineColor: outlineCol || Cesium.Color.WHITE,
        },
        ...(billboardSpec ? { billboard: billboardSpec } : {}),
      });
      yardLandmarkIds.push(id);
      return ent;
    };

    const renderMonacoParts = () => {
      for (const mid of monacoIds) viewer.entities.removeById(mid);
      rvGround = resolveLocalGroundM(monacoState.lon, monacoState.lat);
      const parts = [
        // Main 40ft (12.2m) × 8.5ft (2.59m) × 12ft (3.65m roof) Champagne/Cream Coach Body
        placeMonacoPart(
          'pfl-monaco-rv-body',
          '🚌 Monaco 40ft Diesel Pusher Coach',
          0, 0, 1.98,
          new Cesium.Cartesian3(2.59, 12.20, 3.26),
          new Cesium.ImageMaterialProperty({ image: viewer._pflMonacoLiveryCanvas }),
          Cesium.Color.fromCssColorString('#f5ebe0').withAlpha(0.75),
          {
            image: makeWorldTagCanvas('🚌 MONACO 40FT COACH', '#fbbf24', '#fef08a'),
            width: 164,
            height: 20,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -28),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 165),
          },
        ),
        // Dark Tinted Panoramic Front Windshield & Sun Visor at Front Nose (+Y)
        placeMonacoPart(
          'pfl-monaco-rv-windshield',
          '🚌 Monaco Front Panoramic Windshield',
          0, 5.98, 2.48,
          new Cesium.Cartesian3(2.42, 0.30, 1.16),
          Cesium.Color.fromCssColorString('#0f172a').withAlpha(0.88),
          Cesium.Color.fromCssColorString('#64748b').withAlpha(0.7),
        ),
        // Warm Glowing ~70W Interior Cab Lamp visible behind windshield
        placeMonacoPart(
          'pfl-monaco-rv-cablamp',
          '💡 Monaco ~70W Interior Cab Lamp',
          0, 5.38, 2.38,
          new Cesium.Cartesian3(1.52, 0.72, 0.62),
          Cesium.Color.fromCssColorString('#fde68a').withAlpha(0.92),
          Cesium.Color.fromCssColorString('#fbbf24').withAlpha(0.95),
        ),
        // Dual Rooftop Coleman A/C Pods
        placeMonacoPart(
          'pfl-monaco-rv-ac-front',
          '🚌 Monaco Rooftop A/C Front',
          0, 2.45, 3.75,
          new Cesium.Cartesian3(0.94, 1.24, 0.28),
          Cesium.Color.fromCssColorString('#f8fafc').withAlpha(0.95),
          Cesium.Color.fromCssColorString('#94a3b8').withAlpha(0.7),
        ),
        placeMonacoPart(
          'pfl-monaco-rv-ac-rear',
          '🚌 Monaco Rooftop A/C Rear',
          0, -2.35, 3.75,
          new Cesium.Cartesian3(0.94, 1.24, 0.28),
          Cesium.Color.fromCssColorString('#f8fafc').withAlpha(0.95),
          Cesium.Color.fromCssColorString('#94a3b8').withAlpha(0.7),
        ),
        // Passenger-Side Champagne Patio Awning Cassette (+X right side)
        placeMonacoPart(
          'pfl-monaco-rv-awning',
          '🚌 Monaco Patio Awning',
          1.34, 0.85, 3.42,
          new Cesium.Cartesian3(0.16, 6.80, 0.20),
          Cesium.Color.fromCssColorString('#d6c7b2').withAlpha(0.95),
          Cesium.Color.fromCssColorString('#b4925a').withAlpha(0.85),
        ),
      ];
      return parts;
    };

    const monacoMovable = {
      kind: 'monaco',
      label: '🚌 Monaco 40ft Coach (RV)',
      getState: () => ({ ...monacoState }),
      update: (patch) => {
        Object.assign(monacoState, patch);
        try { localStorage.setItem(MONACO_POSE_KEY, JSON.stringify(monacoState)); } catch {}
        const rebuiltParts = renderMonacoParts();
        for (const ent of rebuiltParts) ent._pflMovable = monacoMovable;
        governorRequestRender('pfl-move-monaco');
      },
    };
    const builtMonaco = renderMonacoParts();
    for (const ent of builtMonaco) ent._pflMovable = monacoMovable;
    window.__pflMovables = window.__pflMovables || {};
    window.__pflMovables.monaco = monacoMovable;

    // 3D 417 Palm Drive Two-Story Yellow Coastal House GLB (/models/pfl-palm-drive-house.glb)
    // In Cesium glTF axis conversion, heading=90° aligns glTF +X (14.6m width) East-West and glTF +Z (+5.6m front porch/balcony) Due South!
    const HOUSE_POSE_KEY = 'pfl_house_pose_v3';
    const DEFAULT_HOUSE_STATE = { lat: 29.247595, lon: -95.231385, heading: 90, lift: 0, scale: 1 };
    let houseState = { ...DEFAULT_HOUSE_STATE };
    try {
      const savedHouse = JSON.parse(localStorage.getItem(HOUSE_POSE_KEY) || 'null');
      if (savedHouse && Number.isFinite(savedHouse.lat) && Number.isFinite(savedHouse.lon)) {
        const driftM = Math.hypot(
          (savedHouse.lat - DEFAULT_HOUSE_STATE.lat) * 111320,
          (savedHouse.lon - DEFAULT_HOUSE_STATE.lon) * 97200,
        );
        const safeLift = Math.abs(Number(savedHouse.lift || 0)) <= 4.5 ? Number(savedHouse.lift || 0) : 0;
        if (driftM <= 32) {
          houseState = { ...houseState, ...savedHouse, lift: safeLift };
        }
      }
    } catch {}

    const houseEntityId = 'pfl-palm-drive-house-3d';
    viewer.entities.removeById(houseEntityId);

    const spawnHouseEntityIfReady = () => {
      if (!house3dOn || !houseGlbAvailable) {
        viewer.entities.removeById(houseEntityId);
        syncBedElevationForHouse(false);
        return null;
      }
      const hGround = resolveLocalGroundM(houseState.lon, houseState.lat);
      const houseScale = Number(houseState.scale) > 0 ? Number(houseState.scale) : 1;
      const hPos = Cesium.Cartesian3.fromDegrees(houseState.lon, houseState.lat, hGround + Number(houseState.lift || 0));
      const hOri = Cesium.Transforms.headingPitchRollQuaternion(
        hPos,
        new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(houseState.heading || 0), 0, 0),
      );
      const existingHouse = viewer.entities.getById(houseEntityId);
      if (existingHouse?.model) {
        existingHouse.position = hPos;
        existingHouse.orientation = hOri;
        existingHouse.model.scale = houseScale;
        existingHouse._pflMovable = houseMovable;
        return existingHouse;
      }
      viewer.entities.removeById(houseEntityId);
      const hEnt = viewer.entities.add({
        id: houseEntityId,
        name: '🏠 417 Palm Drive Two-Story Yellow House',
        position: hPos,
        orientation: hOri,
        model: {
          uri: `/models/pfl-palm-drive-house.glb?v=${viewer._pflHouseRev || 1}`,
          scale: houseScale,
          heightReference: Cesium.HeightReference.NONE,
          minimumPixelSize: 0,
          maximumScale: 50,
          lightColor: new Cesium.Color(1.45, 1.40, 1.32, 1.0),
          imageBasedLightingFactor: new Cesium.Cartesian2(1.0, 1.0),
        },
        billboard: {
          image: makeWorldTagCanvas('🏠 417 PALM DR HOUSE', '#fbbf24', '#fef08a'),
          width: 156,
          height: 19,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -34),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 165),
        },
      });
      if (!yardLandmarkIds.includes(houseEntityId)) yardLandmarkIds.push(houseEntityId);
      hEnt._pflMovable = houseMovable;
      syncBedElevationForHouse(true);
      governorRequestRender('pfl-spawn-house');
      return hEnt;
    };

    const houseMovable = {
      kind: 'house',
      label: '🏠 417 Palm Dr House (3D)',
      getState: () => ({ ...houseState }),
      update: (patch) => {
        Object.assign(houseState, patch);
        try { localStorage.setItem(HOUSE_POSE_KEY, JSON.stringify(houseState)); } catch {}
        spawnHouseEntityIfReady();
        governorRequestRender('pfl-move-house');
      },
    };
    window.__pflMovables.house = houseMovable;
    window.__pflReloadHouse3d = () => {
      viewer._pflHouseRev = (viewer._pflHouseRev || 1) + 1;
      houseGlbAvailable = null;
      buildYard3dLandmarks();
    };

    if (houseGlbAvailable === true) {
      spawnHouseEntityIfReady();
    } else if (houseGlbAvailable === null) {
      fetch('/models/pfl-palm-drive-house.glb', { method: 'HEAD', cache: 'no-store' })
        .then((res) => {
          const ct = String(res.headers.get('content-type') || '').toLowerCase();
          houseGlbAvailable = Boolean(res.ok && !ct.includes('text/html'));
          if (houseGlbAvailable) spawnHouseEntityIfReady();
        })
        .catch(() => {
          houseGlbAvailable = false;
        });
    }
  }
  buildYard3dLandmarks();
  window.addEventListener('gev:map-stack-changed', () => setTimeout(buildYard3dLandmarks, 400));

  playPatrolStream('wyze-cam-v4', 'Wyze Cam V4 (Front Yard & Driveway)');
  refreshWyzePatrol(false);


  // 7) Sovereign Always-On 3D Camera Projections (Independent of Native CCTV Layer!)
  //    Lets Paul turn Bilawal's single-camera CCTV panel OFF completely while keeping Cam2 Dock, V4 Front, and/or Cam1 RV projected 24/7 in 3D space!
  // Zero-Altitude-Bounce Guard near Liverpool & Bird Pond: never kick Paul back into the sky!
  let lastSafeYardPose = null;
  function enforceZeroAltitudeKickGuard() {
    try {
      const ctrl = viewer?.scene?.screenSpaceCameraController;
      const c = viewer?.camera?.positionCartographic;
      if (!ctrl || !c) return;
      const lat = Cesium.Math.toDegrees(c.latitude);
      const lon = Cesium.Math.toDegrees(c.longitude);
      const nearYard =
        Math.hypot(lat - 29.24755, lon - -95.23140) < 0.02 ||
        Math.hypot(lat - 29.13910, lon - -95.80480) < 0.02;
      if (nearYard) {
        ctrl.enableCollisionDetection = false;
        ctrl.minimumZoomDistance = 0.25;
        if (c.height < 180 && !droneOrbitState.active) {
          lastSafeYardPose = {
            lon: c.longitude,
            lat: c.latitude,
            height: c.height,
            heading: viewer.camera.heading,
            pitch: viewer.camera.pitch,
            roll: viewer.camera.roll,
          };
        }
      }
    } catch {}
  }
  enforceZeroAltitudeKickGuard();

  const ALWAYS3D_KEY = 'pfl_always3d_cams_v3';
  const SOVEREIGN_3D_CAMS = [
    {
      src: 'back-yard-cam2',
      cctvId: 'pfl-back-yard-cam2',
      label: 'Cam2 Dock (Draped on Bayou & Lawn)',
      // Anchored along the shoreline & dock (29.247775) so grass sits on the south/house side and crisp blue bayou water stretches cleanly across the north dock/water edge!
      lat: 29.247775,
      lon: -95.231382,
      headingDeg: 7.5,
      pitchDeg: -86,
      fovDeg: 90,
      rangeM: 8.2,
      mountHeightM: 0.28,
      groundDrape: true,
      defaultOn: true,
    },
    {
      src: 'wyze-cam-v4',
      cctvId: 'pfl-wyze-cam-v4',
      label: 'V4 Front Yard (Ground Drape)',
      lat: 29.247415,
      lon: -95.231525,
      headingDeg: 215,
      pitchDeg: -86,
      fovDeg: 98,
      rangeM: 15.5,
      mountHeightM: 0.32,
      groundDrape: true,
      defaultOn: false, // Merged live ground splat covers V4+Cam1 seamlessly; check anytime for raw live drape!
    },
    {
      src: 'back-yard-cam1',
      cctvId: 'pfl-back-yard-cam1',
      label: 'Cam1 East RV (Ground Drape)',
      lat: 29.247435,
      lon: -95.231275,
      headingDeg: 175,
      pitchDeg: -86,
      fovDeg: 96,
      rangeM: 13.0,
      mountHeightM: 0.34,
      groundDrape: true,
      defaultOn: false,
    },
    {
      src: 'hd',
      cctvId: 'pfl-house-hd-cam',
      label: 'HD Monaco RV & ~70W Lamp (View-Locked)',
      lat: 29.247515,
      lon: -95.231315,
      headingDeg: 108,
      pitchDeg: -26,
      fovDeg: 92,
      rangeM: 8.2,
      mountHeightM: 3.1,
      groundDrape: false,
      viewDependent: true,
      defaultOn: true,
    },
  ];

  let always3dMasterOn = true;
  let always3dSelected = {};
  try {
    const raw = JSON.parse(localStorage.getItem(ALWAYS3D_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      always3dMasterOn = raw.master !== false;
      always3dSelected = raw.cams || {};
    }
  } catch {}
  for (const c of SOVEREIGN_3D_CAMS) {
    if (typeof always3dSelected[c.src] !== 'boolean') always3dSelected[c.src] = c.defaultOn;
  }

  function saveAlways3dState() {
    try {
      localStorage.setItem(ALWAYS3D_KEY, JSON.stringify({ master: always3dMasterOn, cams: always3dSelected }));
    } catch {}
  }

  const always3dRuntimes = new Map(); // src -> { prim, outlinePrim, canvas, ctx, busy }
  const always3dHost = new Cesium.PrimitiveCollection();
  viewer.scene.primitives.add(always3dHost);

  function computePflQuadPose(cam) {
    let gBase = -26.19;
    try {
      if (viewer.scene?.globe?.show !== false) {
        const h = viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(cam.lon, cam.lat));
        if (Number.isFinite(h)) gBase = h;
      }
    } catch {}
    const R = cam.rangeM;
    const pitch = Cesium.Math.toRadians(cam.pitchDeg);
    const hFov = Cesium.Math.toRadians(cam.fovDeg);
    const halfW = R * Math.tan(hFov / 2);
    const vFov = 2 * Math.atan(Math.tan(hFov / 2) / (16 / 9));
    const halfH = R * Math.tan(vFov / 2);
    const horiz = R * Math.cos(pitch);
    const vert = R * Math.sin(pitch);
    const upVert = Math.cos(pitch) * halfH;
    const hdgRad = Cesium.Math.toRadians(cam.headingDeg);

    if (cam.groundDrape) {
      const center = Cesium.Cartesian3.fromDegrees(cam.lon, cam.lat, gBase + cam.mountHeightM);
      const hpr = new Cesium.HeadingPitchRoll(hdgRad, 0, 0);
      // In Cesium ENU, PlaneGeometry lies in local X-Y (+X East, +Y North, +Z Up). Rotating around Z by `-hdgRad` aligns +Y (top of image) with `headingDeg` and +X (right of image) with `headingDeg + 90°`!
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(center);
      const rotZ = Cesium.Matrix3.fromRotationZ(-hdgRad);
      const worldRot = Cesium.Matrix4.getMatrix3(enu, new Cesium.Matrix3());
      Cesium.Matrix3.multiply(worldRot, rotZ, worldRot);
      const quat = Cesium.Quaternion.fromRotationMatrix(worldRot);
      return Cesium.Matrix4.fromTranslationQuaternionRotationScale(
        center,
        quat,
        new Cesium.Cartesian3(halfW * 1.65, halfH * 2.15, 1),
      );
    }
    const mountAlt = gBase + cam.mountHeightM;
    const dLat = (Math.cos(hdgRad) * horiz) / 110800;
    const dLon = (Math.sin(hdgRad) * horiz) / (111320 * Math.cos(Cesium.Math.toRadians(cam.lat)));
    const capLat = cam.lat + dLat;
    const capLon = cam.lon + dLon;
    const rawCapAlt = mountAlt + vert;
    const bottomAlt = rawCapAlt - upVert;
    const liftM = Math.max(0, gBase + 0.08 - bottomAlt);
    const capAlt = rawCapAlt + liftM;

    const center = Cesium.Cartesian3.fromDegrees(capLon, capLat, capAlt);
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(center);
    const east = new Cesium.Cartesian3(enu[0], enu[1], enu[2]);
    const north = new Cesium.Cartesian3(enu[4], enu[5], enu[6]);
    const up = new Cesium.Cartesian3(enu[8], enu[9], enu[10]);

    // Forward dir along heading & pitch:
    const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
    const sinH = Math.sin(hdgRad), cosH = Math.cos(hdgRad);
    const horizVec = new Cesium.Cartesian3(
      east.x * sinH + north.x * cosH,
      east.y * sinH + north.y * cosH,
      east.z * sinH + north.z * cosH,
    );
    const dir = Cesium.Cartesian3.normalize(
      new Cesium.Cartesian3(
        horizVec.x * cosP + up.x * sinP,
        horizVec.y * cosP + up.y * sinP,
        horizVec.z * cosP + up.z * sinP,
      ),
      new Cesium.Cartesian3(),
    );
    const rightAxis = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.cross(dir, up, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
    const upAxis = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.cross(rightAxis, dir, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
    const faceNormal = Cesium.Cartesian3.negate(dir, new Cesium.Cartesian3());
    const rotMat = new Cesium.Matrix3(
      rightAxis.x, upAxis.x, faceNormal.x,
      rightAxis.y, upAxis.y, faceNormal.y,
      rightAxis.z, upAxis.z, faceNormal.z,
    );
    const quat = Cesium.Quaternion.fromRotationMatrix(rotMat);
    return Cesium.Matrix4.fromTranslationQuaternionRotationScale(
      center,
      quat,
      new Cesium.Cartesian3(halfW * 2, halfH * 2, 1),
    );
  }

  function ensureAlways3dRuntime(cam) {
    if (always3dRuntimes.has(cam.src)) return always3dRuntimes.get(cam.src);
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#041019';
    ctx.fillRect(0, 0, 960, 540);

    const modelMatrix = computePflQuadPose(cam);
    const material = Cesium.Material.fromType('Image', {
      image: canvas,
      color: Cesium.Color.WHITE.withAlpha(0.96),
    });
    const prim = always3dHost.add(
      new Cesium.Primitive({
        geometryInstances: new Cesium.GeometryInstance({
          geometry: new Cesium.PlaneGeometry({
            vertexFormat: Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat,
          }),
        }),
        appearance: new Cesium.MaterialAppearance({
          material,
          translucent: true,
          closed: false,
          renderState: { cull: { enabled: true } },
        }),
        modelMatrix,
        allowPicking: false,
        asynchronous: false,
        show: false,
      }),
    );
    const outlinePrim = always3dHost.add(
      new Cesium.Primitive({
        geometryInstances: new Cesium.GeometryInstance({
          geometry: new Cesium.PlaneOutlineGeometry(),
          attributes: {
            color: Cesium.ColorGeometryInstanceAttribute.fromColor(
              Cesium.Color.fromCssColorString('#4ade80').withAlpha(0.65),
            ),
          },
        }),
        appearance: new Cesium.PerInstanceColorAppearance({
          flat: true,
          translucent: true,
        }),
        modelMatrix: Cesium.Matrix4.clone(modelMatrix),
        allowPicking: false,
        asynchronous: false,
        show: false,
      }),
    );
    const rt = { cam, prim, outlinePrim, material, canvas, ctx, busy: false };
    always3dRuntimes.set(cam.src, rt);
    return rt;
  }

  async function pumpAlways3dFrame(rt) {
    if (rt.busy || !rt.prim.show) return;
    rt.busy = true;
    try {
      const r = await fetch(`/api/cctv/frame/${encodeURIComponent(rt.cam.cctvId)}?ts=${Date.now()}`, { cache: 'no-store' });
      if (r.ok) {
        const blob = await r.blob();
        const bmp = await createImageBitmap(blob);
        // Preserve Paul Prime's dreamlike mirrored Live Oak sphere reflection ONCE (non-blinking!)
        if (rt.cam.src === 'back-yard-cam2') {
          for (const cid of ['pfl-oak-west-crown', 'pfl-oak-east-crown']) {
            const ent = viewer?.entities?.getById?.(cid);
            if (ent?.ellipsoid && !ent._pflOakTextured) {
              ent._pflOakTextured = true;
              const mirrorOakCanvas = document.createElement('canvas');
              mirrorOakCanvas.width = 960;
              mirrorOakCanvas.height = 540;
              const mctx = mirrorOakCanvas.getContext('2d');
              mctx.filter = 'contrast(1.14) saturate(1.12) brightness(1.03)';
              mctx.drawImage(bmp, 0, 0, 960, 540);
              mctx.filter = 'none';
              ent.ellipsoid.material = new Cesium.ImageMaterialProperty({
                image: mirrorOakCanvas,
                color: Cesium.Color.WHITE.withAlpha(0.84),
                transparent: true,
              });
            }
          }
        }

        // Upload via fresh canvas swap so Cesium Image material updates texture cleanly every tick
        const nextCanvas = document.createElement('canvas');
        nextCanvas.width = 960;
        nextCanvas.height = 540;
        const nctx = nextCanvas.getContext('2d');
        nctx.filter = 'contrast(1.16) saturate(1.14) brightness(1.03)';
        nctx.drawImage(bmp, 0, 0, 960, 540);
        nctx.filter = 'none';

        if (rt.cam.src === 'back-yard-cam2') {
          // 1) Scrub artificial #00ff00 Wyze motion-detection rectangle & stretch crisp blue bayou water across the north/dock upper zone
          try {
            const imgData = nctx.getImageData(0, 0, 960, 540);
            const px = imgData.data;
            for (let y = 2; y < 538; y++) {
              const rowOff = y * 960 * 4;
              for (let x = 2; x < 958; x++) {
                const i = rowOff + x * 4;
                const rC = px[i], gC = px[i + 1], bC = px[i + 2];
                if (gC > 195 && rC < 85 && bC < 85 && gC - Math.max(rC, bC) > 115) {
                  const up = i - 960 * 4 * 3;
                  const dn = i + 960 * 4 * 3;
                  px[i] = (px[up] + px[dn]) >> 1;
                  px[i + 1] = (px[up + 1] + px[dn + 1]) >> 1;
                  px[i + 2] = (px[up + 2] + px[dn + 2]) >> 1;
                }
              }
            }
            nctx.putImageData(imgData, 0, 0);
          } catch {}
          // Subtle crisp bayou blue tint over the open water strip (y=0..235) so shoreline & dock blend seamlessly into Chocolate Bayou
          const waterTint = nctx.createLinearGradient(0, 0, 0, 245);
          waterTint.addColorStop(0.0, 'rgba(14, 116, 144, 0.52)');
          waterTint.addColorStop(0.65, 'rgba(2, 132, 199, 0.22)');
          waterTint.addColorStop(1.0, 'rgba(2, 132, 199, 0.0)');
          nctx.fillStyle = waterTint;
          nctx.fillRect(160, 0, 620, 245);

          // 2) Feather out the 2D foreground left & right Live Oak trunks/branches from the flat ground drape so ONLY upright 3D Live Oaks stand in 3D space (zero upside-down 2D trees from Bayou Overlook!)
          nctx.globalCompositeOperation = 'destination-out';
          const leftTreeMask = nctx.createLinearGradient(0, 0, 205, 0);
          leftTreeMask.addColorStop(0.0, 'rgba(0,0,0,1)');
          leftTreeMask.addColorStop(0.68, 'rgba(0,0,0,0.92)');
          leftTreeMask.addColorStop(1.0, 'rgba(0,0,0,0)');
          nctx.fillStyle = leftTreeMask;
          nctx.fillRect(0, 0, 205, 540);

          const rightTreeMask = nctx.createLinearGradient(715, 0, 960, 0);
          rightTreeMask.addColorStop(0.0, 'rgba(0,0,0,0)');
          rightTreeMask.addColorStop(0.32, 'rgba(0,0,0,0.92)');
          rightTreeMask.addColorStop(1.0, 'rgba(0,0,0,1)');
          nctx.fillStyle = rightTreeMask;
          nctx.fillRect(715, 0, 245, 540);

          // Upper-right forked branch overhang mask
          const forkMask = nctx.createRadialGradient(775, 110, 40, 775, 110, 225);
          forkMask.addColorStop(0.0, 'rgba(0,0,0,1)');
          forkMask.addColorStop(0.65, 'rgba(0,0,0,0.85)');
          forkMask.addColorStop(1.0, 'rgba(0,0,0,0)');
          nctx.fillStyle = forkMask;
          nctx.fillRect(540, 0, 420, 320);

          // Opposite reed bank at very top edge (y < 78) so bayou water feathers into map water
          const topBankMask = nctx.createLinearGradient(0, 0, 0, 92);
          topBankMask.addColorStop(0.0, 'rgba(0,0,0,1)');
          topBankMask.addColorStop(0.60, 'rgba(0,0,0,0.85)');
          topBankMask.addColorStop(1.0, 'rgba(0,0,0,0)');
          nctx.fillStyle = topBankMask;
          nctx.fillRect(0, 0, 960, 92);
          nctx.globalCompositeOperation = 'source-over';
        }

        // Soft vignette alpha feathering around edges so live Wyze pixels blend organically into the satellite map instead of hard rectangular borders!
        nctx.globalCompositeOperation = 'destination-in';
        const gX = nctx.createLinearGradient(0, 0, 960, 0);
        gX.addColorStop(0, 'rgba(0,0,0,0)');
        gX.addColorStop(0.06, 'rgba(0,0,0,1)');
        gX.addColorStop(0.94, 'rgba(0,0,0,1)');
        gX.addColorStop(1, 'rgba(0,0,0,0)');
        nctx.fillStyle = gX;
        nctx.fillRect(0, 0, 960, 540);
        const gY = nctx.createLinearGradient(0, 0, 0, 540);
        gY.addColorStop(0, 'rgba(0,0,0,0)');
        gY.addColorStop(0.08, 'rgba(0,0,0,1)');
        gY.addColorStop(0.93, 'rgba(0,0,0,1)');
        gY.addColorStop(1, 'rgba(0,0,0,0)');
        nctx.fillStyle = gY;
        nctx.fillRect(0, 0, 960, 540);
        bmp.close?.();
        rt.material.uniforms.image = nextCanvas;
        governorRequestRender('pfl-always3d-frame');
      }
    } catch {}
    rt.busy = false;
  }

  function viewAngleWeight(cam) {
    if (!cam.viewDependent || cam.groundDrape) return 0.96;
    try {
      const c = viewer?.camera?.positionCartographic;
      if (!c || c.height > 85) return 0;
      const eyeH = viewer.camera.heading || 0;
      const eyeP = viewer.camera.pitch || 0;
      const camH = Cesium.Math.toRadians(cam.headingDeg || 0);
      const camP = Cesium.Math.toRadians(cam.pitchDeg || -22);
      const vx = Math.sin(eyeH) * Math.cos(eyeP);
      const vy = Math.cos(eyeH) * Math.cos(eyeP);
      const vz = Math.sin(eyeP);
      const cx = Math.sin(camH) * Math.cos(camP);
      const cy = Math.cos(camH) * Math.cos(camP);
      const cz = Math.sin(camP);
      const dot = vx * cx + vy * cy + vz * cz;
      if (dot < 0.72) return 0;
      return Math.min(0.96, Math.pow((dot - 0.72) / 0.28, 1.35) * 0.96);
    } catch {
      return 0.92;
    }
  }

  function syncAlways3dVisibility() {
    enforceZeroAltitudeKickGuard();
    for (const cam of SOVEREIGN_3D_CAMS) {
      const baseWant = always3dMasterOn && Boolean(always3dSelected[cam.src]);
      if (!baseWant && !always3dRuntimes.has(cam.src)) continue;
      const rt = ensureAlways3dRuntime(cam);
      const alpha = baseWant ? viewAngleWeight(cam) : 0;
      const want = baseWant && alpha > 0.04;
      const m = computePflQuadPose(cam);
      Cesium.Matrix4.clone(m, rt.prim.modelMatrix);
      Cesium.Matrix4.clone(m, rt.outlinePrim.modelMatrix);
      if (rt.material?.uniforms?.color) {
        rt.material.uniforms.color = Cesium.Color.WHITE.withAlpha(alpha);
      }
      rt.prim.show = want;
      rt.outlinePrim.show = want && !cam.groundDrape;
      if (want) pumpAlways3dFrame(rt);
    }
    const dockBtn = document.getElementById('pfl-btn-always3d');
    if (dockBtn) {
      dockBtn.textContent = always3dMasterOn ? '👁️ Always-On 3D Cams: ON' : '👁️ Always-On 3D Cams: OFF';
      dockBtn.classList.toggle('active', always3dMasterOn);
    }
    governorRequestRender('pfl-always3d-vis');
  }

  const always3dChecksEl = patrolWin.body.querySelector('#pfl-always3d-checks');
  if (always3dChecksEl) {
    always3dChecksEl.innerHTML = SOVEREIGN_3D_CAMS.map((c) => `
      <label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;color:#e2e8f0">
        <input type="checkbox" class="pfl-a3d-chk" value="${c.src}" ${always3dSelected[c.src] ? 'checked' : ''} />
        <span><strong>${c.label}</strong></span>
      </label>
    `).join('');
    always3dChecksEl.querySelectorAll('.pfl-a3d-chk').forEach((chk) => {
      chk.addEventListener('change', () => {
        always3dSelected[chk.value] = chk.checked;
        saveAlways3dState();
        syncAlways3dVisibility();
      });
    });
  }

  setTimeout(() => {
    const dockBtn = document.getElementById('pfl-btn-always3d');
    dockBtn?.addEventListener('click', () => {
      always3dMasterOn = !always3dMasterOn;
      saveAlways3dState();
      syncAlways3dVisibility();
    });
    syncAlways3dVisibility();
  }, 500);

  // Staggered 2.5s live frame refresh across pinned 3D quads (zero repeater overload, smooth continuous updates!)
  let a3dRobin = 0;
  const always3dTimer = setInterval(() => {
    if (!always3dMasterOn) return;
    const activeList = SOVEREIGN_3D_CAMS.filter((c) => always3dSelected[c.src]);
    if (!activeList.length) return;
    const cam = activeList[a3dRobin % activeList.length];
    a3dRobin++;
    const rt = always3dRuntimes.get(cam.src);
    if (rt && rt.prim.show) pumpAlways3dFrame(rt);
  }, 2200);
  window.addEventListener('gev:map-stack-changed', () => setTimeout(syncAlways3dVisibility, 400));

  // 8) 32 MLS Interior Photos Interactive 2-Floor + Waterfront Walkthrough & Guided Auto-Tour + 3D Room Hotspot Pins
  const MLS_ROOMS = [
    { id: 'boathouse-wf', floor: 'waterfront', title: '⚓ Boathouse, Boat Lift & Bayou Gazebo', shortTag: '⚓ BOATHOUSE & GAZEBO', codes: ['m00', 'm27', 'm28', 'm29', 'm30', 'm31'], lat: 29.247770, lon: -95.231390, altOff: 1.9, az: 175, pitch: -18, range: 17.5 },
    { id: 'porch-2f', floor: '2f', title: '🌅 2F Screened Bayou Porch (1,470 sf Level)', shortTag: '🌅 2F BAYOU PORCH', codes: ['m04', 'm05', 'm26'], lat: 29.247635, lon: -95.231385, altOff: 5.8, az: 10, pitch: -16, range: 11.5 },
    { id: 'living-2f', floor: '2f', title: '🛋️ 2F Living Room (Bayou View)', shortTag: '🛋️ 2F LIVING RM', codes: ['m06', 'm07'], lat: 29.247605, lon: -95.231390, altOff: 5.8, az: 20, pitch: -20, range: 12.5 },
    { id: 'kitchen-2f', floor: '2f', title: '🍳 2F Chef Kitchen (East Wing)', shortTag: '🍳 2F KITCHEN', codes: ['m08', 'm10'], lat: 29.247595, lon: -95.231345, altOff: 5.8, az: 265, pitch: -20, range: 12.0 },
    { id: 'dining-2f', floor: '2f', title: '🍽️ 2F Dining Area (NE Bayou Corner)', shortTag: '🍽️ 2F DINING', codes: ['m09', 'm11'], lat: 29.247618, lon: -95.231348, altOff: 5.8, az: 235, pitch: -20, range: 12.0 },
    { id: 'master-sw-2f', floor: '2f', title: '🛏️ 2F Master SW & Guest Bedrooms', shortTag: '🛏️ 2F MASTER SW', codes: ['m12', 'm15'], lat: 29.247568, lon: -95.231425, altOff: 5.9, az: 55, pitch: -20, range: 11.5 },
    { id: 'office-nw-2f', floor: '2f', title: '💻 2F Waterfront Office (NW Wing)', shortTag: '💻 2F OFFICE', codes: ['m14'], lat: 29.247622, lon: -95.231425, altOff: 5.9, az: 125, pitch: -18, range: 11.5 },
    { id: 'baths-2f', floor: '2f', title: '🚿 2F Primary & Hall Baths', shortTag: '🚿 2F BATHS', codes: ['m13', 'm16'], lat: 29.247585, lon: -95.231408, altOff: 5.8, az: 90, pitch: -22, range: 11.5 },
    { id: 'balcony-2f', floor: '2f', title: '☀️ 2F Front Balcony (Palm Dr View)', shortTag: '☀️ 2F BALCONY', codes: ['m02', 'm03', 'm17'], lat: 29.247548, lon: -95.231385, altOff: 5.6, az: 185, pitch: -16, range: 13.0 },
    { id: 'patio-1f', floor: '1f', title: '🌿 1F Covered Waterfront Patio (1,570 sf Level)', shortTag: '🌿 1F PATIO', codes: ['m01', 'm19'], lat: 29.247642, lon: -95.231385, altOff: 1.8, az: 180, pitch: -14, range: 11.5 },
    { id: 'gameroom-1f', floor: '1f', title: '🎱 1F Cedar Gameroom & Great Room (1,570 sf)', shortTag: '🎱 1F GAMEROOM', codes: ['m18', 'm19', 'm20', 'm21'], lat: 29.247598, lon: -95.231388, altOff: 2.2, az: 15, pitch: -16, range: 12.5 },
    { id: 'galley-1f', floor: '1f', title: '☕ 1F Galley Kitchenette', shortTag: '☕ 1F GALLEY', codes: ['m22', 'm23'], lat: 29.247582, lon: -95.231348, altOff: 2.2, az: 260, pitch: -16, range: 11.5 },
    { id: 'utility-1f', floor: '1f', title: '🧺 1F Utility & Laundry Room', shortTag: '🧺 1F UTILITY', codes: ['m24'], lat: 29.247566, lon: -95.231355, altOff: 2.2, az: 295, pitch: -18, range: 11.5 },
    { id: 'bath3-1f', floor: '1f', title: '🚿 1F Full Bath #3', shortTag: '🚿 1F BATH 3', codes: ['m25'], lat: 29.247570, lon: -95.231415, altOff: 2.2, az: 75, pitch: -18, range: 11.5 },
  ];

  const MLS_PHOTO_CAPTIONS = {
    m00: 'Chocolate Bayou Waterfront Hero — 2-Story House, Covered Boat Lift & Pier Gazebo',
    m01: '1st Floor Covered Waterfront Patio & Screened Upstairs Porch',
    m02: '2nd Floor South Front Facade, Elevated Balcony & Driveway Approach',
    m03: '2nd Floor Front Sun Deck & Coastal Yellow Siding Detail',
    m04: '2nd Floor Screened Bayou Porch — Porch Swing & Panoramic Water View',
    m05: '2nd Floor Screened Bayou Porch — Full-Width Screened Breezeway',
    m06: '2nd Floor Living Room (1,470 sf Level) — Bayou Windows & Dining Arch',
    m07: '2nd Floor Living Room — Open Concept Seating & Ceiling Fan',
    m08: '2nd Floor Main Kitchen — Custom Wood Cabinetry & Prep Island',
    m09: '2nd Floor Dining Room — Bayou-Side Windows & Built-In Hutch',
    m10: '2nd Floor Kitchen — Appliances, Countertops & Pass-Through',
    m11: '2nd Floor Dining & Kitchen Flow Looking Toward Living Room',
    m12: '2nd Floor Master SW Bedroom — Palm Drive & West Yard View (Below Roof Bed)',
    m13: '2nd Floor Primary En-Suite Bathroom',
    m14: '2nd Floor Waterfront Office / NW Bedroom Overlooking Chocolate Bayou',
    m15: '2nd Floor SE Guest Bedroom / Studio Overlooking Front Lawn',
    m16: '2nd Floor Hall Full Bathroom #2',
    m17: '2nd Floor Front Balcony Deck Looking Across Palm Drive',
    m18: '1st Floor Cedar-Paneled Gameroom (1,570 sf Level) — Ship Model & Interior Stairs',
    m19: '1st Floor Gameroom Looking Toward Waterfront French Doors & Patio',
    m20: '1st Floor Gameroom — Expansive Entertaining & Fitness Floor',
    m21: '1st Floor Gameroom — Wet Bar / Galley Entry & Wood Beam Ceiling',
    m22: '1st Floor Galley Kitchen — Guest / Entertaining Prep Counter',
    m23: '1st Floor Galley Kitchen — Cabinetry & Appliance Nook',
    m24: '1st Floor Full-Size Utility, Washer/Dryer & Storage Room',
    m25: '1st Floor Full Bathroom #3',
    m26: '2nd Floor Screened Porch Looking Down Onto Backyard Oaks & Bayou',
    m27: 'Backyard Live Oaks, Bulkhead Lawn & Chocolate Bayou Waterfront',
    m28: 'Covered Pier Gazebo, White Dock Benches & Fishing Lights',
    m29: 'Covered Boathouse, Boat Lift & Detached Yellow Workshop/Garage',
    m30: 'Chocolate Bayou Deep-Water Channel Looking Toward GIWW / Galveston Bay',
    m31: 'Waterfront Dock & 417 Palm Drive Estate From the Bayou',
  };

  // Ordered 32-photo guided sequence m00 -> m31
  const MLS_PHOTOS = Array.from({ length: 32 }, (_, idx) => {
    const code = `m${String(idx).padStart(2, '0')}`;
    const room = MLS_ROOMS.find((r) => r.codes.includes(code)) || MLS_ROOMS[0];
    return {
      idx,
      code,
      url: `/palm-drive-mls/${code}.webp`,
      caption: MLS_PHOTO_CAPTIONS[code] || `${room.title} (${code})`,
      roomId: room.id,
      floor: room.floor,
      roomTitle: room.title,
    };
  });

  const mlsWin = createStandardBox({
    id: 'pfl-win-mls-walkthrough',
    title: '🏠 417 PALM DR — 32-PHOTO 2-FLOOR + WATERFRONT WALKTHROUGH & AUTO-TOUR',
    defaultLeft: Math.max(24, Math.round((window.innerWidth - 780) * 0.5)),
    defaultTop: 72,
    defaultWidth: 780,
  });
  mlsWin.box.style.display = 'none';
  mlsWin.body.innerHTML = `
    <div id="pfl-mls-walkthrough-root" style="font-family:'Inter',system-ui,sans-serif;font-size:11.5px;color:#e2e8f0;display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap">
        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">
          <button type="button" class="pfl-std-cbtn" id="pfl-mls-autotour-btn" style="background:rgba(250,204,21,0.18);border-color:#facc15;color:#fde047;padding:4px 10px;font-size:11px">▶ Play Guided Room-by-Room Walkthrough</button>
          <button type="button" class="pfl-std-cbtn" data-mls-floor="all" style="border-color:#38bdf8;color:#7dd3fc">All 32</button>
          <button type="button" class="pfl-std-cbtn" data-mls-floor="2f">2nd Floor (1,470 sf)</button>
          <button type="button" class="pfl-std-cbtn" data-mls-floor="1f">1st Floor (1,570 sf)</button>
          <button type="button" class="pfl-std-cbtn" data-mls-floor="waterfront">⚓ Boathouse/Gazebo</button>
        </div>
        <div style="display:flex;gap:5px;align-items:center">
          <button type="button" class="pfl-std-cbtn" id="pfl-mls-pins-toggle" style="border-color:#4ade80;color:#86efac" title="Show/hide clickable 3D room hotspot pins around 417 Palm Drive">📍 3D Room Pins: ON</button>
          <button type="button" class="pfl-std-cbtn" id="pfl-mls-close-btn" style="border-color:#f43f5e;color:#fda4af">✕ Close</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:minmax(240px, 1fr) minmax(280px, 1.35fr);gap:10px;align-items:start;min-width:0">
        <div id="pfl-mls-floorplan-pane" style="display:flex;flex-direction:column;gap:6px;background:rgba(15,23,42,0.82);border:1px solid rgba(56,189,248,0.32);border-radius:8px;padding:7px;min-width:0">
          <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:#7dd3fc;display:flex;justify-content:space-between">
            <span>⬆️ NORTH = CHOCOLATE BAYOU</span>
            <span>CLICK ANY ROOM</span>
          </div>

          <div data-mls-plan-sec="waterfront" style="border:1px dashed rgba(34,211,238,0.45);border-radius:6px;padding:4px;background:rgba(8,47,73,0.32)">
            <div style="font-size:9.5px;font-weight:700;color:#67e8f9;margin-bottom:3px">⚓ WATERFRONT SHORELINE</div>
            <button type="button" class="pfl-std-cbtn" data-mls-room="boathouse-wf" style="width:100%;text-align:left;padding:4px 6px">⚓ Boathouse, Lift &amp; Gazebo <span style="color:#94a3b8">(m00,m27–m31)</span></button>
          </div>

          <div data-mls-plan-sec="2f" style="border:1px solid rgba(250,204,21,0.45);border-radius:6px;padding:5px;background:rgba(30,41,59,0.55)">
            <div style="font-size:9.5px;font-weight:700;color:#fde047;margin-bottom:4px">🏠 2ND FLOOR — 1,470 SF (MAIN ELEVATED LIVING)</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px">
              <button type="button" class="pfl-std-cbtn" data-mls-room="porch-2f" style="grid-column:1 / -1;text-align:left;padding:3px 5px">🌅 Screened Bayou Porch <span style="color:#94a3b8">(m04,m05,m26)</span></button>
              <button type="button" class="pfl-std-cbtn" data-mls-room="office-nw-2f" style="text-align:left;padding:3px 5px">💻 NW Office <span style="color:#94a3b8">(m14)</span></button>
              <button type="button" class="pfl-std-cbtn" data-mls-room="dining-2f" style="text-align:left;padding:3px 5px">🍽️ Dining <span style="color:#94a3b8">(m09,m11)</span></button>
              <button type="button" class="pfl-std-cbtn" data-mls-room="living-2f" style="text-align:left;padding:3px 5px">🛋️ Living Rm <span style="color:#94a3b8">(m06,m07)</span></button>
              <button type="button" class="pfl-std-cbtn" data-mls-room="kitchen-2f" style="text-align:left;padding:3px 5px">🍳 Kitchen <span style="color:#94a3b8">(m08,m10)</span></button>
              <button type="button" class="pfl-std-cbtn" data-mls-room="master-sw-2f" style="text-align:left;padding:3px 5px">🛏️ Master SW <span style="color:#94a3b8">(m12,m15)</span></button>
              <button type="button" class="pfl-std-cbtn" data-mls-room="baths-2f" style="text-align:left;padding:3px 5px">🚿 Baths 1–2 <span style="color:#94a3b8">(m13,m16)</span></button>
              <button type="button" class="pfl-std-cbtn" data-mls-room="balcony-2f" style="grid-column:1 / -1;text-align:left;padding:3px 5px">☀️ South Front Balcony <span style="color:#94a3b8">(m02,m03,m17)</span></button>
            </div>
          </div>

          <div data-mls-plan-sec="1f" style="border:1px solid rgba(74,222,128,0.42);border-radius:6px;padding:5px;background:rgba(15,23,42,0.68)">
            <div style="font-size:9.5px;font-weight:700;color:#86efac;margin-bottom:4px">🎱 1ST FLOOR — 1,570 SF (GROUND / ENTERTAINING)</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px">
              <button type="button" class="pfl-std-cbtn" data-mls-room="patio-1f" style="grid-column:1 / -1;text-align:left;padding:3px 5px">🌿 Covered Bayou Patio <span style="color:#94a3b8">(m01,m19)</span></button>
              <button type="button" class="pfl-std-cbtn" data-mls-room="gameroom-1f" style="text-align:left;padding:3px 5px">🎱 Gameroom <span style="color:#94a3b8">(m18–m21)</span></button>
              <button type="button" class="pfl-std-cbtn" data-mls-room="galley-1f" style="text-align:left;padding:3px 5px">☕ Galley Kit <span style="color:#94a3b8">(m22,m23)</span></button>
              <button type="button" class="pfl-std-cbtn" data-mls-room="bath3-1f" style="text-align:left;padding:3px 5px">🚿 Bath 3 <span style="color:#94a3b8">(m25)</span></button>
              <button type="button" class="pfl-std-cbtn" data-mls-room="utility-1f" style="text-align:left;padding:3px 5px">🧺 Utility <span style="color:#94a3b8">(m24)</span></button>
            </div>
          </div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#94a3b8;text-align:center">⬇️ SOUTH = PALM DRIVE &amp; EAST CARPORT</div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;min-width:0;overflow:hidden">
          <div style="position:relative;background:#020617;border:1.5px solid rgba(250,204,21,0.5);border-radius:8px;overflow:hidden;min-height:230px;display:flex;align-items:center;justify-content:center">
            <img id="pfl-mls-photo-img" src="/palm-drive-mls/m00.webp" alt="417 Palm Drive MLS Interior Walkthrough" style="width:100%;max-height:310px;object-fit:contain;display:block;background:#020617" />
            <div id="pfl-mls-photo-badge" style="position:absolute;top:6px;left:6px;background:rgba(9,14,26,0.88);border:1px solid rgba(56,189,248,0.65);border-radius:5px;padding:2px 7px;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;color:#7dd3fc">1 / 32 · m00</div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
            <button type="button" class="pfl-std-cbtn" id="pfl-mls-prev" style="padding:3px 9px">◀ Prev</button>
            <div style="flex:1;text-align:center;min-width:0">
              <div id="pfl-mls-room-heading" style="font-weight:700;color:#fde047;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">⚓ Boathouse, Boat Lift &amp; Bayou Gazebo</div>
              <div id="pfl-mls-photo-caption" style="color:#cbd5e1;font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Chocolate Bayou Waterfront Hero</div>
            </div>
            <button type="button" class="pfl-std-cbtn" id="pfl-mls-next" style="padding:3px 9px">Next ▶</button>
          </div>
          <div id="pfl-mls-thumbs" style="display:flex;gap:4px;overflow-x:auto;padding:4px;background:rgba(9,14,26,0.75);border:1px solid #1e293b;border-radius:6px"></div>
        </div>
      </div>
    </div>
  `;

  let currentMlsIdx = 0;
  let mlsFloorFilter = 'all';
  let mlsAutoTourPlaying = false;
  let mlsAutoTourTimer = 0;
  let mlsRoomPinsOn = true;
  const mlsPinEntityIds = [];

  function makeMlsPinCanvas(text, active = false) {
    const c = document.createElement('canvas');
    c.width = 236;
    c.height = 34;
    const ctx = c.getContext('2d');
    ctx.fillStyle = active ? 'rgba(66, 32, 6, 0.94)' : 'rgba(9, 14, 26, 0.88)';
    ctx.strokeStyle = active ? '#facc15' : '#38bdf8';
    ctx.lineWidth = active ? 2.6 : 1.8;
    ctx.beginPath();
    ctx.roundRect(2, 2, 232, 30, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = active ? '#fef08a' : '#e0f2fe';
    ctx.font = '700 11.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.slice(0, 24), 118, 17);
    return c;
  }

  function syncMlsRoomPins(activeRoomId = null) {
    if (!viewer?.entities) return;
    for (const pid of mlsPinEntityIds) {
      try { viewer.entities.removeById(pid); } catch {}
    }
    mlsPinEntityIds.length = 0;
    if (!mlsRoomPinsOn) {
      governorRequestRender('pfl-mls-pins-off');
      return;
    }
    for (const r of MLS_ROOMS) {
      const pid = `pfl-mls-pin-${r.id}`;
      const gAlt = resolveLocalGroundM(r.lon, r.lat);
      const isAct = r.id === activeRoomId;
      const ent = viewer.entities.add({
        id: pid,
        name: `🏠 ${r.title}`,
        position: Cesium.Cartesian3.fromDegrees(r.lon, r.lat, gAlt + r.altOff),
        billboard: {
          image: makeMlsPinCanvas(r.shortTag, isAct),
          width: isAct ? 132 : 114,
          height: isAct ? 19 : 16,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 95),
          disableDepthTestDistance: 55,
        },
      });
      ent._pflMlsRoomId = r.id;
      mlsPinEntityIds.push(pid);
    }
    governorRequestRender('pfl-mls-pins-sync');
  }

  function flyCameraToMlsRoom(room) {
    if (!room || !viewer?.camera) return;
    unlockDroneCamera();
    enforceZeroAltitudeKickGuard();
    try { viewer.trackedEntity = undefined; viewer.selectedEntity = undefined; } catch {}
    const gAlt = resolveLocalGroundM(room.lon, room.lat);
    const targetAlt = gAlt + room.altOff;
    const azRad = Cesium.Math.toRadians(room.az);
    const pitchRad = Cesium.Math.toRadians(room.pitch);
    const horizM = Math.cos(pitchRad) * room.range;
    const eyeLat = room.lat - (Math.cos(azRad) * horizM) / 111320;
    const eyeLon = room.lon - (Math.sin(azRad) * horizM) / (111320 * Math.cos(Cesium.Math.toRadians(room.lat)));
    const eyeAlt = targetAlt - Math.sin(pitchRad) * room.range;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(eyeLon, eyeLat, eyeAlt),
      orientation: {
        heading: azRad,
        pitch: pitchRad,
        roll: 0,
      },
      duration: 0.9,
    });
  }

  const mlsThumbsEl = mlsWin.body.querySelector('#pfl-mls-thumbs');
  if (mlsThumbsEl) {
    mlsThumbsEl.innerHTML = MLS_PHOTOS.map((p) => `
      <button type="button" class="pfl-std-cbtn" data-mls-idx="${p.idx}" style="flex:0 0 auto;padding:2px;display:flex;flex-direction:column;align-items:center;gap:1px" title="${p.code}: ${p.caption}">
        <img src="${p.url}" alt="${p.code}" loading="lazy" style="width:46px;height:32px;object-fit:cover;border-radius:3px;display:block" />
        <span style="font-size:9px">${p.code}</span>
      </button>
    `).join('');
    mlsThumbsEl.querySelectorAll('[data-mls-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        showMlsPhotoIndex(Number(btn.getAttribute('data-mls-idx')), true);
      });
    });
  }

  function showMlsPhotoIndex(idx, fly3d = true) {
    const p = MLS_PHOTOS[((idx % MLS_PHOTOS.length) + MLS_PHOTOS.length) % MLS_PHOTOS.length];
    if (!p) return;
    currentMlsIdx = p.idx;
    const imgEl = mlsWin.body.querySelector('#pfl-mls-photo-img');
    const badgeEl = mlsWin.body.querySelector('#pfl-mls-photo-badge');
    const headEl = mlsWin.body.querySelector('#pfl-mls-room-heading');
    const capEl = mlsWin.body.querySelector('#pfl-mls-photo-caption');
    if (imgEl) imgEl.src = p.url;
    if (badgeEl) badgeEl.textContent = `${p.idx + 1} / 32 · ${p.code}`;
    if (headEl) headEl.textContent = p.roomTitle;
    if (capEl) capEl.textContent = p.caption;
    mlsWin.body.querySelectorAll('[data-mls-room]').forEach((b) => {
      const match = b.getAttribute('data-mls-room') === p.roomId;
      b.style.borderColor = match ? '#facc15' : '';
      b.style.color = match ? '#fef08a' : '';
      b.style.background = match ? 'rgba(250,204,21,0.16)' : '';
    });
    mlsWin.body.querySelectorAll('[data-mls-idx]').forEach((b) => {
      const match = Number(b.getAttribute('data-mls-idx')) === p.idx;
      b.style.borderColor = match ? '#facc15' : '';
      if (match) b.scrollIntoView?.({ block: 'nearest', inline: 'center' });
    });
    if (mlsRoomPinsOn) syncMlsRoomPins(p.roomId);
    if (fly3d) {
      const room = MLS_ROOMS.find((r) => r.id === p.roomId);
      if (room) flyCameraToMlsRoom(room);
    }
  }

  function stopMlsAutoTour() {
    mlsAutoTourPlaying = false;
    clearInterval(mlsAutoTourTimer);
    const btn = mlsWin.body.querySelector('#pfl-mls-autotour-btn');
    if (btn) {
      btn.textContent = '▶ Play Guided Room-by-Room Walkthrough';
      btn.style.borderColor = '#facc15';
      btn.style.color = '#fde047';
    }
  }

  function startMlsAutoTour(fromStart = false) {
    clearInterval(mlsAutoTourTimer);
    mlsAutoTourPlaying = true;
    const btn = mlsWin.body.querySelector('#pfl-mls-autotour-btn');
    if (btn) {
      btn.textContent = '⏸ Pause Guided Walkthrough (m00 → m31)';
      btn.style.borderColor = '#4ade80';
      btn.style.color = '#86efac';
    }
    if (fromStart) showMlsPhotoIndex(0, true);
    else showMlsPhotoIndex(currentMlsIdx, true);
    mlsAutoTourTimer = window.setInterval(() => {
      if (!mlsAutoTourPlaying) return;
      const pool = mlsFloorFilter === 'all' ? MLS_PHOTOS : MLS_PHOTOS.filter((x) => x.floor === mlsFloorFilter);
      if (!pool.length) return;
      const curPoolPos = pool.findIndex((x) => x.idx === currentMlsIdx);
      const nextPhoto = pool[(curPoolPos + 1) % pool.length];
      showMlsPhotoIndex(nextPhoto.idx, true);
    }, 2600);
  }

  openMlsWalkthrough = (roomId = null, autoPlay = false) => {
    mlsWin.box.style.display = 'flex';
    mlsWin.box.classList.remove('pfl-minimized');
    const mb = mlsWin.box.querySelector('[data-act="min"]');
    if (mb) mb.textContent = '—';
    mlsWin.box.style.zIndex = '9760';
    if (roomId) {
      const room = MLS_ROOMS.find((r) => r.id === roomId);
      const firstCode = room?.codes?.[0];
      const photo = MLS_PHOTOS.find((x) => x.code === firstCode);
      if (photo) showMlsPhotoIndex(photo.idx, true);
    } else {
      showMlsPhotoIndex(currentMlsIdx, false);
    }
    if (autoPlay) startMlsAutoTour(true);
  };
  window.__pflOpenMlsWalkthrough = openMlsWalkthrough;

  mlsWin.body.querySelector('#pfl-mls-autotour-btn')?.addEventListener('click', () => {
    if (mlsAutoTourPlaying) stopMlsAutoTour();
    else startMlsAutoTour(false);
  });
  mlsWin.body.querySelector('#pfl-mls-prev')?.addEventListener('click', () => {
    stopMlsAutoTour();
    showMlsPhotoIndex(currentMlsIdx - 1, true);
  });
  mlsWin.body.querySelector('#pfl-mls-next')?.addEventListener('click', () => {
    stopMlsAutoTour();
    showMlsPhotoIndex(currentMlsIdx + 1, true);
  });
  mlsWin.body.querySelectorAll('[data-mls-room]').forEach((btn) => {
    btn.addEventListener('click', () => {
      stopMlsAutoTour();
      const rid = btn.getAttribute('data-mls-room');
      const room = MLS_ROOMS.find((r) => r.id === rid);
      const firstPhoto = MLS_PHOTOS.find((x) => x.code === room?.codes?.[0]);
      if (firstPhoto) showMlsPhotoIndex(firstPhoto.idx, true);
    });
  });
  mlsWin.body.querySelectorAll('[data-mls-floor]').forEach((btn) => {
    btn.addEventListener('click', () => {
      mlsFloorFilter = btn.getAttribute('data-mls-floor') || 'all';
      mlsWin.body.querySelectorAll('[data-mls-floor]').forEach((b) => {
        const on = b.getAttribute('data-mls-floor') === mlsFloorFilter;
        b.style.borderColor = on ? '#38bdf8' : '';
        b.style.color = on ? '#7dd3fc' : '';
      });
      mlsWin.body.querySelectorAll('[data-mls-plan-sec]').forEach((sec) => {
        const f = sec.getAttribute('data-mls-plan-sec');
        sec.style.opacity = (mlsFloorFilter === 'all' || mlsFloorFilter === f) ? '1' : '0.42';
      });
      if (mlsFloorFilter !== 'all') {
        const firstInFloor = MLS_PHOTOS.find((x) => x.floor === mlsFloorFilter);
        if (firstInFloor) showMlsPhotoIndex(firstInFloor.idx, true);
      }
    });
  });
  mlsWin.body.querySelector('#pfl-mls-pins-toggle')?.addEventListener('click', (e) => {
    mlsRoomPinsOn = !mlsRoomPinsOn;
    e.currentTarget.textContent = mlsRoomPinsOn ? '📍 3D Room Pins: ON' : '📍 3D Room Pins: OFF';
    e.currentTarget.style.borderColor = mlsRoomPinsOn ? '#4ade80' : 'rgba(148,163,184,0.35)';
    e.currentTarget.style.color = mlsRoomPinsOn ? '#86efac' : '#94a3b8';
    syncMlsRoomPins(MLS_PHOTOS[currentMlsIdx]?.roomId || null);
  });
  mlsWin.body.querySelector('#pfl-mls-close-btn')?.addEventListener('click', () => {
    stopMlsAutoTour();
    mlsWin.box.style.display = 'none';
  });
  syncMlsRoomPins(null);
  window.addEventListener('gev:map-stack-changed', () => setTimeout(() => syncMlsRoomPins(MLS_PHOTOS[currentMlsIdx]?.roomId || null), 450));


  // 9) Marine VHF Radio & Chocolate Bayou / USCG Houston-Galveston AIS Scanner Card
  const MARINE_VHF_CHANNELS = [
    { ch: 'Ch 16', mhz: '156.800 MHz', role: 'International Distress, Safety & Hailing', agency: 'USCG Sector Houston-Galveston (24/7 Guard)', accent: '#f87171' },
    { ch: 'Ch 22A', mhz: '157.100 MHz', role: 'USCG Marine Safety Broadcasts & Notices', agency: 'USCG Sector Houston-Galveston Liaison', accent: '#fbbf24' },
    { ch: 'Ch 13', mhz: '156.650 MHz', role: 'Bridge-to-Bridge Navigation (1W)', agency: 'Chocolate Bayou / GIWW Towboats, Barges & Bridges', accent: '#38bdf8' },
    { ch: 'Ch 12', mhz: '156.600 MHz', role: 'Houston-Galveston VTS (Lower Bay)', agency: 'Vessel Traffic Service — Bolivar / Galveston / Texas City', accent: '#67e8f9' },
    { ch: 'Ch 73 / 74', mhz: '156.675 / 156.725 MHz', role: 'Galveston-Houston Pilots & Port Ops', agency: 'Galveston / Freeport Ship Channel Pilots & Tugs', accent: '#c084fc' },
    { ch: 'WX KHB-40', mhz: '162.550 MHz', role: 'NOAA Weather Radio — Galveston', agency: 'NWS Houston/Galveston Coastal & Bay Marine Forecast', accent: '#4ade80' },
    { ch: 'WX WWG-40', mhz: '162.425 MHz', role: 'NOAA Weather Radio — Bay City', agency: 'Brazoria County / Liverpool / Chocolate Bayou Alerts', accent: '#86efac' },
    { ch: 'AIS 87B/88B', mhz: '161.975 / 162.025 MHz', role: 'Live AIS Class A & B Vessel Transponders', agency: 'MMSI Position, SOG/COG & Barge Tow Telemetry', accent: '#22d3ee' },
  ];

  const vhfWin = createStandardBox({
    id: 'pfl-win-marine-vhf',
    title: '📻 MARINE VHF & CHOCOLATE BAYOU / USCG AIS SCANNER',
    defaultLeft: Math.max(30, window.innerWidth - 520),
    defaultTop: 140,
    defaultWidth: 485,
  });
  vhfWin.box.style.display = 'none';
  vhfWin.body.innerHTML = `
    <div id="pfl-marine-vhf-root" style="font-family:'Inter',system-ui,sans-serif;font-size:11px;color:#e2e8f0;display:flex;flex-direction:column;gap:7px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 8px;background:rgba(8,47,73,0.48);border:1px solid rgba(34,211,238,0.5);border-radius:7px">
        <div style="font-family:'JetBrains Mono',monospace">
          <div style="font-size:9.5px;color:#67e8f9">USCG SECTOR HOUSTON-GALVESTON · BRAZORIA / CHOCOLATE BAYOU</div>
          <div id="pfl-vhf-active-freq" style="font-size:12px;font-weight:800;color:#fde047">TUNED: Ch 13 · 156.650 MHz — Chocolate Bayou / GIWW Barges</div>
        </div>
        <button type="button" class="pfl-std-cbtn" id="pfl-vhf-close-btn" style="border-color:#f43f5e;color:#fda4af">✕ Close</button>
      </div>

      <div style="display:flex;gap:5px;flex-wrap:wrap">
        <button type="button" class="pfl-std-cbtn" id="pfl-vhf-toggle-ais" style="border-color:#22d3ee;color:#67e8f9;padding:4px 8px" title="Toggle God's Eye View's built-in Live AIS Marine Vessels layer (161.975 / 162.025 MHz)">🚢 Live AIS Vessels (161.975/162.025): OFF</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-vhf-toggle-radio" style="border-color:#c084fc;color:#e9d5ff;padding:4px 8px" title="Toggle God's Eye View's built-in Global Radio Browser audio layer">📻 Radio Browser Layer: OFF</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-vhf-fly-bayou" style="border-color:#4ade80;color:#86efac;padding:4px 8px" title="Fly over Chocolate Bayou, GIWW &amp; Galveston Bay barge corridor to watch Live AIS vessels">⚓ Fly Bayou / GIWW AIS Corridor</button>
      </div>

      <div style="border:1px solid #1e293b;border-radius:7px;overflow:hidden;background:rgba(9,14,26,0.86)">
        ${MARINE_VHF_CHANNELS.map((c, idx) => `
          <div class="pfl-vhf-row" data-vhf-idx="${idx}" style="display:grid;grid-template-columns:84px 128px 1fr;gap:6px;align-items:center;padding:5px 7px;border-bottom:1px solid rgba(30,41,59,0.75);cursor:pointer" title="Click to lock scanner readout &amp; copy frequency (${c.mhz})">
            <strong style="font-family:'JetBrains Mono',monospace;color:${c.accent}">${c.ch}</strong>
            <code style="color:#f8fafc;font-weight:700;font-size:10.5px">${c.mhz}</code>
            <div style="min-width:0">
              <div style="font-weight:700;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.role}</div>
              <div style="font-size:9.5px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.agency}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  function syncMarineVhfLayerBadges() {
    const aisBtn = vhfWin.body.querySelector('#pfl-vhf-toggle-ais');
    const radBtn = vhfWin.body.querySelector('#pfl-vhf-toggle-radio');
    const aisSt = getGevLayerStatus('vessels');
    const radSt = getGevLayerStatus('radio');
    if (aisBtn) {
      aisBtn.textContent = `🚢 Live AIS Vessels (161.975/162.025): ${aisSt.label}`;
      aisBtn.style.background = aisSt.active ? 'rgba(34,211,238,0.18)' : '';
    }
    if (radBtn) {
      radBtn.textContent = `📻 Radio Browser Layer: ${radSt.label}`;
      radBtn.style.background = radSt.active ? 'rgba(192,132,252,0.18)' : '';
    }
  }

  toggleMarineVhfPanel = (forceOpen = null) => {
    const currentlyHidden = vhfWin.box.style.display === 'none' || vhfWin.box.classList.contains('pfl-minimized');
    const showNext = forceOpen !== null ? Boolean(forceOpen) : currentlyHidden;
    vhfWin.box.style.display = showNext ? 'flex' : 'none';
    if (showNext) {
      vhfWin.box.classList.remove('pfl-minimized');
      const mb = vhfWin.box.querySelector('[data-act="min"]');
      if (mb) mb.textContent = '—';
      vhfWin.box.style.zIndex = '9755';
      syncMarineVhfLayerBadges();
    }
  };
  window.__pflToggleMarineVhf = toggleMarineVhfPanel;

  vhfWin.body.querySelector('#pfl-vhf-close-btn')?.addEventListener('click', () => {
    vhfWin.box.style.display = 'none';
  });
  vhfWin.body.querySelector('#pfl-vhf-toggle-ais')?.addEventListener('click', () => {
    toggleGevLayerById('vessels');
    setTimeout(syncMarineVhfLayerBadges, 120);
  });
  vhfWin.body.querySelector('#pfl-vhf-toggle-radio')?.addEventListener('click', () => {
    toggleGevLayerById('radio');
    setTimeout(syncMarineVhfLayerBadges, 120);
  });
  vhfWin.body.querySelector('#pfl-vhf-fly-bayou')?.addEventListener('click', () => {
    if (!isGevLayerActive('vessels')) {
      toggleGevLayerById('vessels');
      setTimeout(syncMarineVhfLayerBadges, 150);
    }
    unlockDroneCamera();
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(-95.215, 29.165, 18500),
      orientation: {
        heading: Cesium.Math.toRadians(145),
        pitch: Cesium.Math.toRadians(-42),
        roll: 0,
      },
      duration: 1.25,
    });
  });
  vhfWin.body.querySelectorAll('.pfl-vhf-row').forEach((row) => {
    row.addEventListener('click', () => {
      const ch = MARINE_VHF_CHANNELS[Number(row.getAttribute('data-vhf-idx'))];
      if (!ch) return;
      const rd = vhfWin.body.querySelector('#pfl-vhf-active-freq');
      if (rd) rd.textContent = `TUNED: ${ch.ch} · ${ch.mhz} — ${ch.role}`;
      try { navigator.clipboard?.writeText?.(ch.mhz); } catch {}
      if (ch.ch.startsWith('AIS') && !isGevLayerActive('vessels')) {
        toggleGevLayerById('vessels');
        setTimeout(syncMarineVhfLayerBadges, 150);
      }
    });
  });
  const vhfBadgeTimer = setInterval(() => {
    if (vhfWin.box.style.display !== 'none') syncMarineVhfLayerBadges();
  }, 1500);

  return {
    destroy() {
      unlockDroneCamera();
      stopMlsAutoTour();
      endDragMovableSession();
      clearInterval(timer);
      clearInterval(kalshiPoll);
      clearInterval(patrolCycleTimer);
      clearTimeout(scrubTimeout);
      clearInterval(always3dTimer);
      clearInterval(alarmPollTimer);
      clearInterval(vhfBadgeTimer);
      window.removeEventListener('keydown', wasdKeydownHandler);
      try { viewer?.scene?.canvas?.removeEventListener?.('wheel', altWheelLensHandler, { capture: true }); } catch {}
      try { viewer?.entities?.removeById?.(GIZMO_ENTITY_ID); } catch {}
      try { viewer?.entities?.removeById?.(BORDER_ENTITY_ID); viewer?.entities?.removeById?.(HOVER_ENTITY_ID); } catch {}
      try { for (const pid of mlsPinEntityIds) viewer?.entities?.removeById?.(pid); } catch {}
      try { antiEjectionUnsub?.(); } catch {}
      try {
        canvasEl.removeEventListener('pointerdown', onPtrDown, true);
        window.removeEventListener('pointermove', onPtrMove, { capture: true });
        window.removeEventListener('pointerup', onPtrUp, true);
        window.removeEventListener('pointercancel', onPtrUp, true);
        canvasEl.removeEventListener('wheel', onWheelZoomTrack, { capture: true });
        canvasEl.removeEventListener('touchstart', onTouchZoomTrack, { capture: true });
        canvasEl.removeEventListener('touchmove', onTouchZoomTrack, { capture: true });
      } catch {}
      try {
        const sc = viewer?.scene?.screenSpaceCameraController;
        if (sc && defaultTiltTypes) { sc.tiltEventTypes = defaultTiltTypes; sc._pflTiltLocked = false; }
        if (viewer?.scene?.canvas) viewer.scene.canvas.style.cursor = '';
      } catch {}
      try { for (const id of yardLandmarkIds) viewer?.entities?.removeById?.(id); } catch {}
      try { viewer.scene.primitives.remove(always3dHost); } catch {}
      cancelAnimationFrame(rafId);
      pickHandler.destroy();
      for (const el of createdEls) el.remove();
    },
  };
}
