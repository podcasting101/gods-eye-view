import * as Cesium from 'cesium';
import {
  holdContinuousRender,
  releaseContinuousRender,
  governorRequestRender,
} from '../renderGovernor.js';
import { activeYardDatumM, BED_PAUL_AVATAR_CATALOG } from './yardFrames.js';
import {
  resolveTerrainGroundM,
  isFlatEllipsoidGlobe,
  STORED_GROUND_HEIGHT_M,
} from './placedObjects.js';
import { cameraFlightActive } from '../render/cesium/internals.js';
import { createSexWorldDemoTour } from './sexWorldDemoTour.js';
import {
  parsePhotoMetadata,
  extractVisualVectorFromImage,
  correlatePhotoToAnchors,
} from './photoVectorAlign.js';
import { ALBUM_2018_ITEMS, ALBUM_2018_ERA } from './album2018Manifest.js';

const STORAGE_KEY = 'pfl_gev_windows_v6';
const IS_LOCAL_NODE = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);

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
    #pfl-win-command-dock.pfl-minimized {
      width: auto !important;
      max-width: calc(100vw - 16px) !important;
    }
    #pfl-dual-pads-grid {
      width: 100%;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(195px, 1fr));
      gap: 6px;
      align-items: stretch;
    }
    #pfl-camera-pad-card,
    #pfl-object-pad-card {
      min-width: 0;
      padding: 6px;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      gap: 5px;
      box-sizing: border-box;
    }
    #pfl-camera-pad-card {
      border: 1px solid rgba(56, 189, 248, 0.35);
      background: rgba(15, 23, 42, 0.72);
    }
    #pfl-axis-globe,
    #pfl-obj-move-ball {
      width: min(128px, 100%);
      height: auto;
      aspect-ratio: 1 / 1;
      flex-shrink: 0;
      display: block;
    }
    @media (max-width: 1180px) {
      .pfl-std-box.pfl-minimized {
        max-width: 248px !important;
      }
      #pfl-win-command-dock.pfl-minimized {
        width: auto !important;
        max-width: calc(100vw - 16px) !important;
        box-sizing: border-box !important;
      }
      #pfl-win-command-dock.pfl-minimized .pfl-compact-hide {
        display: none !important;
      }
      #pfl-win-command-dock.pfl-minimized .pfl-std-hdr {
        padding: 4px 6px !important;
        gap: 4px !important;
      }
      #pfl-win-command-dock.pfl-minimized .pfl-std-cbtn {
        padding: 1px 4px !important;
        font-size: 9.5px !important;
      }
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
    .pfl-std-hdr > span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
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
    /* Keep upper-left GOD'S EYE VIEW brand header compact (~half size) below docked bar */
    #title-bar {
      top: 42px !important;
      left: 12px !important;
      transform: scale(0.54) !important;
      transform-origin: top left !important;
    }
  `;
  document.head.appendChild(style);
  createdEls.push(style);

  let topBoxZ = 9665;
  function bringBoxToFront(el) {
    if (!el) return;
    el.style.zIndex = String(++topBoxZ);
  }

  function createStandardBox({ id, title, defaultLeft, defaultTop, defaultWidth, defaultMinimized = false }) {
    const cfg = saved[id] || {};
    const initMin = typeof cfg.minimized === 'boolean' ? cfg.minimized : Boolean(defaultMinimized);
    const box = document.createElement('div');
    box.id = id;
    box.className = 'pfl-std-box' + (initMin ? ' pfl-minimized' : '');
    box.style.left = (cfg.left ?? defaultLeft) + 'px';
    box.style.top = (cfg.top ?? defaultTop) + 'px';
    if (cfg.width || defaultWidth) box.style.width = (cfg.width ?? defaultWidth) + 'px';
    if (cfg.height && cfg.height >= 120) box.style.height = cfg.height + 'px';
    let scale = Number(cfg.scale) || 1.0;
    box.style.fontSize = Math.round(12 * scale) + 'px';
    box.style.transformOrigin = 'top left';
    if (scale !== 1) box.style.transform = `scale(${scale})`;
    box.addEventListener('pointerdown', () => bringBoxToFront(box));

    const hdr = document.createElement('div');
    hdr.className = 'pfl-std-hdr';
    hdr.innerHTML = `
      <span>✥ ${title}</span>
      <div class="pfl-std-ctrls">
        <button type="button" class="pfl-std-cbtn" data-act="smaller" title="Decrease font/scale">A−</button>
        <button type="button" class="pfl-std-cbtn" data-act="bigger" title="Increase font/scale">A+</button>
        <button type="button" class="pfl-std-cbtn" data-act="min" title="Minimize / Expand">${initMin ? '▢' : '—'}</button>
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
      if (e.target.closest('button, a')) return;
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
          if (!isMin) {
            if (!userResizedHeight || userResizedHeight < 120) box.style.height = '';
            bringBoxToFront(box);
          }
        } else if (act === 'bigger') {
          scale = Math.min(1.6, +(scale + 0.1).toFixed(2));
          box.style.transform = `scale(${scale})`;
          bringBoxToFront(box);
        } else if (act === 'smaller') {
          scale = Math.max(0.7, +(scale - 0.1).toFixed(2));
          box.style.transform = `scale(${scale})`;
          bringBoxToFront(box);
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
  let stopDroneAutoOrbit = () => {};
  let stopFlightPathPlay = () => {};
  let openHolodeckHallway = () => {};
  let openMlsWalkthrough = () => {};
  let toggleMarineVhfPanel = () => {};

  const cmdWin = createStandardBox({
    id: 'pfl-win-command-dock',
    title: '🧭 PFL COMMAND DOCK',
    defaultLeft: 8,
    defaultTop: 6,
    defaultWidth: 556,
    defaultMinimized: true,
  });

  const soccerBarEl = document.getElementById('pfl-soccer-timeline-bar');
  if (soccerBarEl) {
    const soccerWin = createStandardBox({
      id: 'pfl-win-soccer-timeline',
      title: '⚽ 3v3 STADIUM TIMELINE',
      defaultLeft: 8,
      defaultTop: Math.max(160, (window.innerHeight || 900) - 162),
      defaultWidth: 465,
      defaultMinimized: true,
    });
    soccerWin.box.style.zIndex = '9655';
    soccerBarEl.style.cssText =
      'position:static;width:100%;max-width:none;background:transparent;border:none;' +
      'border-radius:0;padding:2px 0;box-shadow:none;backdrop-filter:none;' +
      'display:flex;flex-direction:column;gap:6px;color:#e2e8f0;font-family:Inter,system-ui,sans-serif;font-size:11px';
    const innerMinBtn = soccerBarEl.querySelector('#pfl-soc-min-btn');
    if (innerMinBtn) innerMinBtn.style.display = 'none';
    soccerWin.body.appendChild(soccerBarEl);
  }

  // 🧲 Gather Boxes: neatly dock all floating PFL boxes into non-overlapping perimeter slots
  function gatherBoxes() {
    const vw = window.innerWidth || 1440;
    const vh = window.innerHeight || 900;
    const dockSlots = {
      'pfl-win-command-dock': { left: 8, top: 6, minimize: true },
      'pfl-win-soccer-timeline': { left: 8, top: Math.max(160, vh - 162), minimize: true },
      'pfl-win-wyze-patrol': { left: 8, top: Math.max(240, vh - 86), minimize: true },
      'pfl-win-kalshi-arena': { left: 8, top: Math.max(200, vh - 124), minimize: true },
      'pfl-win-local-vault': { left: Math.min(390, Math.max(8, vw - 480)), top: Math.max(240, vh - 86), minimize: true },
    };
    const boxes = [...document.querySelectorAll('.pfl-std-box')];
    for (const box of boxes) {
      if (box.style.display === 'none') continue;
      if (box.id === 'pfl-win-3d-compass-inspector') continue;
      const w = Math.min(box.offsetWidth || 320, vw - 16);
      const slot = dockSlots[box.id];
      const left = slot ? Math.max(8, Math.min(slot.left, vw - w - 8)) : Math.max(8, Math.min(parseInt(box.style.left, 10) || 12, vw - w - 8));
      const top = slot ? Math.max(6, Math.min(slot.top, vh - 44)) : Math.max(52, Math.min(parseInt(box.style.top, 10) || 64, vh - 44));
      box.style.left = `${Math.round(left)}px`;
      box.style.top = `${Math.round(top)}px`;
      if (slot?.minimize) {
        box.classList.add('pfl-minimized');
        const mb = box.querySelector('[data-act="min"]');
        if (mb) mb.textContent = '▢';
      }
      saved[box.id] = {
        ...(saved[box.id] || {}),
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(w),
        ...(slot?.minimize ? { minimized: true } : {}),
      };
    }
    // The compass inspector is the one Paul uses most: bring it open cleanly at the right edge
    const cbox = compassWin?.box;
    if (cbox) {
      cbox.style.display = 'flex';
      cbox.classList.remove('pfl-minimized');
      const mb = cbox.querySelector('[data-act="min"]');
      if (mb) mb.textContent = '—';
      const w = Math.min(cbox.offsetWidth || 468, vw - 16);
      const left = Math.max(8, vw - w - 16);
      cbox.style.left = `${left}px`;
      cbox.style.top = '118px';
      bringBoxToFront(cbox);
      saved[cbox.id] = { ...(saved[cbox.id] || {}), left, top: 118, width: Math.round(w), minimized: false };
    }
    saveLayout(saved);
    governorRequestRender('pfl-gather-boxes');
  }
  window.__pflGatherBoxes = gatherBoxes;
  {
    const hdrEl = cmdWin.box.querySelector('.pfl-std-hdr');
    const titleSpan = hdrEl?.querySelector('span');
    if (hdrEl && titleSpan) {
      const returnLink = document.createElement('a');
      returnLink.id = 'pfl-return-main-site';
      returnLink.href = 'https://sex-world.ai/';
      returnLink.className = 'pfl-std-cbtn';
      returnLink.title = 'Return to Sex-World.ai Main Portal';
      returnLink.style.cssText = 'background:rgba(236,72,153,0.20);border-color:#ec4899;color:#f9a8d4;text-decoration:none;white-space:nowrap;flex-shrink:0';
      returnLink.innerHTML = '↩ Sex-World<span class="pfl-compact-hide">.ai</span>';
      hdrEl.insertBefore(returnLink, titleSpan);
      titleSpan.innerHTML = '🧭 <span class="pfl-compact-hide">PFL </span>CMD<span class="pfl-compact-hide"> DOCK</span>';
    }
    const ctrlsEl = cmdWin.box.querySelector('.pfl-std-ctrls');
    const hdrHolodeckBtn = document.createElement('a');
    hdrHolodeckBtn.id = 'pfl-hdr-holodeck-btn';
    hdrHolodeckBtn.href = IS_LOCAL_NODE ? 'http://127.0.0.1:8766/' : '/holodeck/';
    hdrHolodeckBtn.target = '_blank';
    hdrHolodeckBtn.rel = 'noopener';
    hdrHolodeckBtn.className = 'pfl-std-cbtn';
    hdrHolodeckBtn.title = 'Enter the 3D Gaussian Splat Holodeck Server';
    hdrHolodeckBtn.style.cssText = 'background:rgba(34,211,238,0.22);border-color:#22d3ee;color:#67e8f9;text-decoration:none;white-space:nowrap;flex-shrink:0;font-weight:700';
    hdrHolodeckBtn.innerHTML = '🌐 Holodeck';

    const rbacPill = document.createElement('span');
    rbacPill.id = 'pfl-rbac-pill';
    rbacPill.className = 'pfl-std-cbtn';
    rbacPill.title = 'Active login status badge (Admin = your 3D object moves & sizes auto-save globally; Guests edit locally only)';
    rbacPill.style.cssText = 'border-color:#38bdf8;color:#7dd3fc;white-space:nowrap;flex-shrink:0;cursor:default';
    rbacPill.textContent = IS_LOCAL_NODE ? '👑 Local Admin' : '👁️ Guest';

    const gatherBtn = document.createElement('button');
    gatherBtn.type = 'button';
    gatherBtn.id = 'pfl-btn-gather-boxes';
    gatherBtn.className = 'pfl-std-cbtn';
    gatherBtn.title = 'Snap all open floating UI windows back on screen (does not move 3D house/RV/photos)';
    gatherBtn.innerHTML = '🧲<span class="pfl-compact-hide"> Gather</span>';
    gatherBtn.style.cssText = 'border-color:#facc15;color:#fde047';
    gatherBtn.addEventListener('click', gatherBoxes);
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.id = 'pfl-btn-reset-layout';
    resetBtn.className = 'pfl-std-cbtn';
    resetBtn.title = 'Reset floating UI window positions/sizes to default corners and reload (keeps your saved 3D scene)';
    resetBtn.innerHTML = '♻️<span class="pfl-compact-hide"> Reset</span>';
    resetBtn.addEventListener('click', () => {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      window.location.reload();
    });
    const bedAvatarSelect = document.createElement('select');
    bedAvatarSelect.id = 'pfl-paul-bed-avatar-select';
    bedAvatarSelect.className = 'pfl-std-cbtn';
    bedAvatarSelect.title = 'Choose 3D avatar mapped onto Paul\'s Bed LiveWire wireframe (defaults to Wireframe)';
    bedAvatarSelect.style.cssText = 'border-color:#38bdf8;color:#7dd3fc;background:rgba(9,14,26,0.95);font-family:"JetBrains Mono",monospace;font-size:10px;max-width:158px;flex-shrink:0';
    const avatarCatalog = window.__pflGetBedPaulAvatarCatalog?.() || BED_PAUL_AVATAR_CATALOG;
    for (const item of avatarCatalog) {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.label;
      bedAvatarSelect.appendChild(opt);
    }
    const curBedAv = window.__pflGetBedPaulAvatar?.() || 'wireframe';
    bedAvatarSelect.value = curBedAv;
    const syncAllBedAvatarSelects = (val) => {
      document.querySelectorAll('#pfl-paul-bed-avatar-select, #pfl-compass-paul-avatar-select').forEach((sel) => {
        if (sel.value !== val) sel.value = val;
      });
    };
    window.__pflSyncBedPaulAvatarUi = syncAllBedAvatarSelects;
    for (const ev of ['mousedown', 'pointerdown', 'click']) {
      bedAvatarSelect.addEventListener(ev, (e) => e.stopPropagation());
    }
    bedAvatarSelect.addEventListener('change', () => {
      const chosen = window.__pflSetBedPaulAvatar ? window.__pflSetBedPaulAvatar(bedAvatarSelect.value) : bedAvatarSelect.value;
      syncAllBedAvatarSelects(chosen);
      const compassBedBtn = compassWin?.body?.querySelector?.('#pfl-bed-livewire-btn');
      if (compassBedBtn && window.__pflGetBedLiveWireState?.()?.enabled !== false) {
        compassBedBtn.textContent = '🛏️ Bed LiveWire: ON';
        compassBedBtn.style.borderColor = '#38bdf8';
        compassBedBtn.style.color = '#7dd3fc';
      }
      governorRequestRender('pfl-bed-paul-avatar');
    });

    const shareViewBtn = document.createElement('button');
    shareViewBtn.type = 'button';
    shareViewBtn.id = 'pfl-btn-share-live-view';
    shareViewBtn.className = 'pfl-std-cbtn';
    shareViewBtn.title = 'Capture current 3D viewpoint & camera link into a dynamic short URL with live preview image & favicon';
    shareViewBtn.style.cssText = 'background:rgba(16,185,129,0.20);border-color:#10b981;color:#6ee7b7;white-space:nowrap;flex-shrink:0;font-weight:700';
    shareViewBtn.innerHTML = '🔗 Share View';
    for (const ev of ['mousedown', 'pointerdown', 'click']) {
      shareViewBtn.addEventListener(ev, (e) => e.stopPropagation());
    }
    shareViewBtn.addEventListener('click', async () => {
      const origLabel = '🔗 Share View';
      shareViewBtn.textContent = '📸 Capturing...';
      try {
        let targetUrl = typeof window !== 'undefined' ? window.location.href : 'https://sex-world.ai/gods-eye-view/';
        if (!/#.*lat=/i.test(targetUrl) && viewer?.camera) {
          const c = viewer.camera.positionCartographic;
          if (c) {
            const lat = Cesium.Math.toDegrees(c.latitude).toFixed(5);
            const lon = Cesium.Math.toDegrees(c.longitude).toFixed(5);
            const alt = Number(c.height || 0).toFixed(1);
            const hdg = Math.round(((Cesium.Math.toDegrees(viewer.camera.heading || 0) % 360) + 360) % 360);
            const pch = Math.round(Cesium.Math.toDegrees(viewer.camera.pitch || -0.35));
            const baseOrigin = IS_LOCAL_NODE ? `${window.location.origin}/` : 'https://sex-world.ai/gods-eye-view/';
            targetUrl = `${baseOrigin}#v=2&lat=${lat}&lon=${lon}&alt=${alt}&heading=${hdg}&pitch=${pch}&roll=0&style=normal&hud=tactical`;
          }
        }
        let imageDataUrl = '';
        try {
          viewer.scene.render();
          const glCanvas = viewer.scene.canvas;
          if (glCanvas && glCanvas.width > 0 && glCanvas.height > 0) {
            const cw = 1200;
            const ch = 630;
            const outC = document.createElement('canvas');
            outC.width = cw;
            outC.height = ch;
            const ctx = outC.getContext('2d');
            if (ctx) {
              const srcAspect = glCanvas.width / glCanvas.height;
              const dstAspect = cw / ch;
              let sx = 0, sy = 0, sw = glCanvas.width, sh = glCanvas.height;
              if (srcAspect > dstAspect) {
                sw = glCanvas.height * dstAspect;
                sx = (glCanvas.width - sw) * 0.5;
              } else {
                sh = glCanvas.width / dstAspect;
                sy = (glCanvas.height - sh) * 0.5;
              }
              ctx.drawImage(glCanvas, sx, sy, sw, sh, 0, 0, cw, ch);
              imageDataUrl = outC.toDataURL('image/jpeg', 0.85);
            }
            const favC = document.createElement('canvas');
            favC.width = 64;
            favC.height = 64;
            const fCtx = favC.getContext('2d');
            if (fCtx) {
              const sq = Math.min(glCanvas.width, glCanvas.height);
              fCtx.drawImage(glCanvas, (glCanvas.width - sq) * 0.5, (glCanvas.height - sq) * 0.5, sq, sq, 0, 0, 64, 64);
              const favUri = favC.toDataURL('image/png');
              document.querySelectorAll('link[rel~="icon"]').forEach((lnk) => {
                if (lnk.getAttribute('sizes') !== 'any') lnk.href = favUri;
              });
            }
          }
        } catch {}

        let copiedUrl = targetUrl;
        if (imageDataUrl && !IS_LOCAL_NODE) {
          const resp = await fetch('/api/share_view.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              targetUrl,
              title: "God's Eye View · Live 3D Viewpoint",
              description: "Interactive 3D God's Eye View live camera snapshot & spatial coordinates.",
              imageDataUrl,
            }),
          });
          if (resp.ok) {
            const res = await resp.json();
            if (res?.ok && res.shortUrl) {
              copiedUrl = res.shortUrl;
              window.__pflLastShareResult = res;
              shareViewBtn.textContent = `✅ /g/${res.slug}`;
              shareViewBtn.title = `Copied ${res.shortUrl} · Preview: ${res.previewUrl}`;
            }
          }
        }
        try { await navigator.clipboard?.writeText?.(copiedUrl); } catch {}
        if (!shareViewBtn.textContent.startsWith('✅')) {
          shareViewBtn.textContent = '✅ Link Copied';
          shareViewBtn.title = `Copied: ${copiedUrl}`;
        }
      } catch {
        shareViewBtn.textContent = '⚠ Share Err';
      }
      setTimeout(() => {
        shareViewBtn.textContent = origLabel;
      }, 5000);
    });

    const quickFovBtn = document.createElement('button');
    quickFovBtn.type = 'button';
    quickFovBtn.id = 'pfl-btn-quick-fov';
    quickFovBtn.className = 'pfl-std-cbtn';
    quickFovBtn.title = 'Cycle camera field of view (60° -> 95° Wide -> 115° Ultra-Wide) for indoor viewing without clipping';
    quickFovBtn.style.cssText = 'border-color:#c084fc;color:#e9d5ff;background:rgba(88,28,135,0.35);white-space:nowrap;flex-shrink:0';
    quickFovBtn.textContent = '🔭 60°';
    quickFovBtn.addEventListener('click', () => {
      const fovNow = Math.round(Cesium.Math.toDegrees(viewer?.camera?.frustum?.fov || Cesium.Math.toRadians(60)));
      const nextFov = fovNow < 80 ? 95 : (fovNow < 110 ? 115 : 60);
      window.__pflSetLensFov?.(nextFov);
      quickFovBtn.textContent = `🔭 ${nextFov}°`;
    });

    ctrlsEl?.prepend(hdrHolodeckBtn, shareViewBtn, quickFovBtn, bedAvatarSelect, rbacPill, gatherBtn, resetBtn);
  }

  setTimeout(() => {
    const portalNav = document.createElement('div');
    portalNav.id = 'pfl-portal-nav-bar';
    portalNav.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid rgba(236,72,153,0.28);font-family:"JetBrains Mono",monospace;font-size:10px';
    const loginRedirect = encodeURIComponent(window.location.href || 'https://sex-world.ai/gods-eye-view/');
    portalNav.innerHTML = `
      <a href="https://sex-world.ai/" class="pfl-std-cbtn" style="border-color:#ec4899;color:#f9a8d4;text-decoration:none">🏠 Home</a>
      <a href="https://sex-world.ai/companions/" class="pfl-std-cbtn" style="text-decoration:none">🤖 Companions</a>
      <a href="https://sex-world.ai/vendors/" class="pfl-std-cbtn" style="text-decoration:none">🏭 Vendors</a>
      <a href="https://sex-world.ai/sanctuary/" class="pfl-std-cbtn" style="text-decoration:none">🛸 Sanctuary 3D</a>
      <a href="https://sex-world.ai/byo-ai/" class="pfl-std-cbtn" style="text-decoration:none">🧬 BYO-AI</a>
      <a href="https://sex-world.ai/concierge.html" class="pfl-std-cbtn" style="text-decoration:none">🥂 Showroom</a>
      <a href="https://sex-world.ai/shop/" class="pfl-std-cbtn" style="text-decoration:none">🛍️ Shop</a>
      <a href="https://sex-world.ai/my-account/" class="pfl-std-cbtn" style="text-decoration:none">👤 Account</a>
      <a id="pfl-portal-auth-link" href="https://sex-world.ai/wp-login.php?redirect_to=${loginRedirect}" class="pfl-std-cbtn" style="border-color:#38bdf8;color:#7dd3fc;text-decoration:none;margin-left:auto">🔐 Log In</a>
    `;
    cmdWin.body.prepend(portalNav);

    const f15Bar = document.querySelector('.pfl-f15-bar');
    if (f15Bar) cmdWin.body.appendChild(f15Bar);

    const extraRow = document.createElement('div');
    extraRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;padding-top:6px;border-top:1px solid rgba(56,189,248,0.22);';
    extraRow.innerHTML = `
      <button type="button" class="pfl-f15-btn" id="pfl-btn-sexworld-demo" style="border-color:#ec4899;color:#f9a8d4;font-weight:700" title="Launch 6-stop guided global showcase tour for Sex-World.ai">🎬 Sex-World Demo</button>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-open-compass" style="border-color:#38bdf8;color:#7dd3fc;font-weight:700" title="Open 3D Compass Ball, Walk/WASD Controls, Rotate/Spin &amp; Object Mover">🧭 3D Compass, Walk &amp; Move Objects</button>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-nav-pins" style="border-color:#facc15;color:#fde047;font-weight:700" title="View &amp; jump to pinned addresses or drop a new navigation pin">📍 Pins</button>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-walk-inside-house" style="border-color:#fbbf24;color:#fde047;font-weight:700" title="Open interactive 32-photo 2-story floor plan &amp; guided room-by-room 3D walkthrough of 417 Palm Drive">🏠 Walk Inside 417 Palm Dr (32-Photo Floor Plan &amp; ▶ Auto-Tour)</button>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-marine-vhf" style="border-color:#22d3ee;color:#67e8f9;font-weight:700" title="Open USCG Houston-Galveston / Chocolate Bayou Marine VHF &amp; Live AIS / Radio Browser Scanner">📻 Marine VHF &amp; Chocolate Bayou Scanner</button>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-kalshi-inline" style="border-color:#22c55e;color:#4ade80;font-weight:700">📈 Kalshi Paper Arena (Show / Hide)</button>
      <button type="button" class="pfl-f15-btn active" id="pfl-dock-polymarket-btn" style="border-color:#a855f7;color:#d8b4fe;font-weight:700" title="Show or hide Polymarket prediction odds markers on the globe">📊 Polymarket: ON</button>
      <a href="/kalshi-paper.html" target="_blank" rel="noopener" class="pfl-f15-btn" id="pfl-btn-kalshi-tab" style="border-color:#38bdf8;color:#38bdf8;text-decoration:none;display:inline-flex;align-items:center">↗ Full TradingView &amp; Kalshi Tab</a>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-wyze-patrol" style="border-color:#f97316;color:#fdba74;font-weight:700">🎥 Live Wyze Patrol &amp; 4D Scrubber</button>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-balcony-front" style="border-color:#38bdf8;color:#7dd3fc;font-weight:700" title="Lock 3D view onto your 2nd-story Balcony looking across the stitched Front Yard, Neighbor's House &amp; Horizon">🏠 Balcony Front Splat</button>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-roof-tripod" style="border-color:#facc15;color:#fde047;font-weight:700" title="Snap to Paul's Roof Hero Tripod viewpoint over 417 Palm Dr, Rooftop Bed LiveWire &amp; 3v3 Stadium">🎯 Roof Tripod</button>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-flip-backyard" style="border-color:#2dd4bf;color:#5eead4;font-weight:700" title="180° flip over the roof to your Backyard Oaks, Boat Dock &amp; Chocolate Bayou">🔄 Flip 180° Backyard</button>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-live-restitch" style="border-color:#c084fc;color:#e9d5ff" title="Grab fresh frames from Cam1 + V4 right now and rebuild the live stitched ground splat">🧵 Rebuild Live Stitch</button>
      <button type="button" class="pfl-f15-btn active" id="pfl-btn-always3d" style="border-color:#22c55e;color:#4ade80;font-weight:700" title="Keep your Wyze cameras projected in 3D space 24/7 even when CCTV is turned OFF">👁️ Always-On 3D Cams: ON</button>
      <button type="button" class="pfl-f15-btn active" id="pfl-btn-static-yard" title="Show/hide the stitched front yard ground splat">🧩 Ground Splat: ON</button>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-arrange">🖼️ Arrange Yard Photos</button>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-fire">🔥 Yard Fire &amp; Legs</button>
      <button type="button" class="pfl-f15-btn active" id="pfl-btn-lisa-soccer" style="border-color:#22c55e;color:#4ade80;font-weight:700" title="Fly to 417 Palm Dr street &amp; toggle Lisa Griffin Street Soccer GLB + physics ball">⚽ Lisa Street Soccer: ON</button>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-vault-inline" style="border-color:#a855f7;color:#d8b4fe;font-weight:700">🏛️ Local Palace &amp; Wyze Vault</button>
      <a href="/memory-palace.html" target="_blank" rel="noopener" class="pfl-f15-btn" id="pfl-btn-palace" style="text-decoration:none;display:inline-flex;align-items:center">↗ Full Memory Palace</a>
      <a href="/livewire/" target="_blank" rel="noopener" class="pfl-f15-btn" id="pfl-btn-livewire" style="border-color:#f43f5e;color:#fda4af;font-weight:700;text-decoration:none;display:inline-flex;align-items:center" title="Open LiveWire Cloud Stage (sex-world.ai/livewire/) — Free 3D Orbit, JenniCam Push & Swarm Chat">🎥 LiveWire Cloud ↗</a>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-livewire-dock" style="border-color:#ec4899;color:#f9a8d4;font-weight:700" title="Show/Hide inline LiveWire Telemetry, Stage Feed & Swarm Chat inside God's Eye View">📡 LiveWire Monitor</button>
      <a href="http://127.0.0.1:8093/" target="_blank" rel="noopener" class="pfl-f15-btn" id="pfl-btn-livewire-local" style="border-color:#94a3b8;color:#cbd5e1;text-decoration:none;display:inline-flex;align-items:center" title="Open Local Desktop LiveWire Studio (:8093)">🖥️ :8093 ↗</a>
      <button type="button" class="pfl-f15-btn" id="pfl-btn-reel-export" style="border-color:#a855f7;color:#e9d5ff;font-weight:700" title="Export active GEV Story or 417 Palm Dr camera sequence as Reel Studio JSON for FFmpeg / HyperFrames">🎬 Export → Reel Studio</button>
      <a href="http://127.0.0.1:8093/concierge" target="_blank" rel="noopener" class="pfl-f15-btn" id="pfl-btn-concierge" style="border-color:#d4af37;color:#fde047;font-weight:700;text-decoration:none;display:inline-flex;align-items:center">🥂 PFL Concierge ↗</a>
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
      const base = resolveLocalGroundM(-95.23136, 29.24764);
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
      const base = resolveLocalGroundM(-95.231385, 29.24764);
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
    function flyRoofTripod() {
      unlockDroneCamera();
      try { viewer.trackedEntity = undefined; viewer.selectedEntity = undefined; } catch {}
      try { window.__pflSetSoccerTimeline?.({ camMode: 'free' }); } catch {}
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(-95.23141, 29.24765, -9.2),
        orientation: {
          heading: Cesium.Math.toRadians(158),
          pitch: Cesium.Math.toRadians(-22),
          roll: 0,
        },
        duration: 1.0,
      });
    }
    window.__pflFlyRoofTripod = flyRoofTripod;
    window.__pflFlyBalconyFront = flyBalconyFront;
    window.__pflFlyBackyard180 = flyBackyard180;
    extraRow.querySelector('#pfl-btn-roof-tripod')?.addEventListener('click', flyRoofTripod);
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
    extraRow.querySelector('#pfl-btn-lisa-soccer')?.addEventListener('click', (ev) => {
      const btn = ev.currentTarget;
      const curOn = window.__pflGetLisaSoccerState?.()?.enabled !== false;
      const next = typeof window.__pflToggleLisaSoccer === 'function' ? window.__pflToggleLisaSoccer(!curOn) : !curOn;
      btn.textContent = next ? '⚽ Lisa Street Soccer: ON' : '⚽ Lisa Street Soccer: OFF';
      btn.classList.toggle('active', next);
      if (next) {
        unlockDroneCamera();
        const gBase = resolveLocalGroundM(-95.231385, 29.247222);
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(-95.231385, 29.24700, gBase + 9.5),
          orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-16), roll: 0 },
          duration: 1.0,
        });
      }
    });
    extraRow.querySelector('#pfl-dock-polymarket-btn')?.addEventListener('click', () => {
      if (typeof window.__pflTogglePolymarket === 'function') {
        const next = window.__pflTogglePolymarket();
        syncPolymarketButtons(next);
      }
    });
    if (typeof window.__pflPolymarketVisible === 'function') {
      syncPolymarketButtons(window.__pflPolymarketVisible());
    }
    extraRow.querySelector('#pfl-btn-sexworld-demo')?.addEventListener('click', () => {
      sexWorldDemo.start(0);
    });
    extraRow.querySelector('#pfl-btn-nav-pins')?.addEventListener('click', () => {
      compassWin.box.style.display = 'flex';
      compassWin.box.classList.remove('pfl-minimized');
      const mb = compassWin.box.querySelector('[data-act="min"]');
      if (mb) mb.textContent = '—';
      bringBoxToFront(compassWin.box);
      const vw = window.innerWidth || 1440;
      const vh = window.innerHeight || 900;
      const w = compassWin.box.offsetWidth || 280;
      const left = Math.max(8, Math.min(parseInt(compassWin.box.style.left, 10) || (vw - w - 16), vw - w - 12));
      const top = Math.max(48, Math.min(parseInt(compassWin.box.style.top, 10) || 118, vh - 120));
      compassWin.box.style.left = `${left}px`;
      compassWin.box.style.top = `${top}px`;
      paintGlobe();
      compassWin.body.querySelector('#pfl-nav-pins-box')?.scrollIntoView?.({ block: 'start' });
    });
    extraRow.querySelector('#pfl-btn-open-compass')?.addEventListener('click', () => {
      compassWin.box.style.display = 'flex';
      compassWin.box.classList.remove('pfl-minimized');
      const mb = compassWin.box.querySelector('[data-act="min"]');
      if (mb) mb.textContent = '—';
      bringBoxToFront(compassWin.box);
      const vw = window.innerWidth || 1440;
      const vh = window.innerHeight || 900;
      const w = compassWin.box.offsetWidth || 468;
      const left = Math.max(8, Math.min(parseInt(compassWin.box.style.left, 10) || (vw - w - 18), vw - w - 12));
      const top = Math.max(48, Math.min(parseInt(compassWin.box.style.top, 10) || 118, vh - 120));
      compassWin.box.style.left = `${left}px`;
      compassWin.box.style.top = `${top}px`;
      paintGlobe();
      compassWin.body.scrollTop = 0;
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
    extraRow.querySelector('#pfl-btn-livewire-dock')?.addEventListener('click', () => {
      if (typeof window.__pflToggleLiveWireMonitor === 'function') {
        window.__pflToggleLiveWireMonitor();
      }
    });
    extraRow.querySelector('#pfl-btn-reel-export')?.addEventListener('click', () => {
      if (typeof window.__pflExportStoryForReelStudio === 'function') {
        window.__pflExportStoryForReelStudio();
      }
    });
  }, 400);

  // 2) Bird Pond 3D Axis Compass Globe + Live Camera / Selected 3D Object Inspector Box (Dual Side-by-Side Pads)
  const compassWin = createStandardBox({
    id: 'pfl-win-3d-compass-inspector',
    title: 'PFL 3D COMPASS, DRONE ORBIT, LENS & PADS',
    defaultLeft: Math.max(8, (window.innerWidth || 1440) - 484),
    defaultTop: 222,
    defaultWidth: 468,
    defaultMinimized: true,
  });
  compassWin.box.style.zIndex = '9660';
  compassWin.box.style.maxHeight = 'calc(100vh - 76px)';
  compassWin.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;font-family:'JetBrains Mono',monospace;font-size:11px;color:#cbd5e1">
      <div id="pfl-eye-elev-banner" style="width:100%;box-sizing:border-box;background:rgba(6,78,59,0.55);border:1.5px solid rgba(74,222,128,0.75);border-radius:7px;padding:5px 8px;text-align:center;font-size:13px;font-weight:800;color:#4ade80;letter-spacing:0.02em;line-height:1.25" title="Live Camera Height Above Ground Level (Meters &amp; Feet) + Optical Lens FOV">EYE: 1.8 m (5.9 ft) AGL · FOV: 60°</div>
      <div id="pfl-cam-readout" style="text-align:center;font-size:10px;color:#94a3b8;line-height:1.3">CAM READY</div>
      <div id="pfl-drag-pan-row" style="width:100%;display:flex;gap:4px">
        <button type="button" class="pfl-std-cbtn" id="pfl-drag-pan-toggle" style="flex:1;border-color:#22c55e;color:#4ade80" title="Lock Yaw on Left-Drag near houses (Google Maps flat pan — use Ctrl+Drag or Compass Ball below to rotate)">✋ Drag: PAN (Flat)</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-compass-snap-btn" style="border-color:#f472b6;color:#fbcfe8;font-weight:700" title="Instant WebGL PNG Screenshot right next to Orbit Ball">📸 Snap</button>
      </div>
      <div id="pfl-dual-pads-grid">
        <div id="pfl-camera-pad-card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;min-height:24px">
            <span style="color:#38bdf8;font-weight:700;font-size:10.5px;letter-spacing:0.03em">🧭 CAMERA</span>
            <button type="button" class="pfl-std-cbtn" id="pfl-wasd-toggle" style="font-size:9.5px;padding:2px 6px" title="Walk horizontally with W/A/S/D keys, Q/E for height">⌨️ WASD: OFF</button>
          </div>
          <div style="height:18px;line-height:18px;font-size:9.5px;color:#7dd3fc;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Orbit Ball · Click Axis</div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
            <canvas id="pfl-axis-globe" width="136" height="136" style="cursor:grab;touch-action:none;border-radius:50%" title="Drag anywhere on ball to orbit/tilt camera, or click N/S/E/W/UP"></canvas>
            <div style="font-size:8.5px;color:#94a3b8;text-align:center;line-height:1.25">N/S/E/W/UP Orbit</div>
          </div>
          <div id="pfl-walk-nav-slot" style="min-width:0"></div>
        </div>
        <div id="pfl-object-pad-card" style="border:1px solid rgba(251,191,36,0.38);background:rgba(15,23,42,0.72)">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;min-height:24px">
            <span style="color:#fbbf24;font-weight:700;font-size:10.5px;letter-spacing:0.03em">🎯 OBJECT</span>
            <div style="display:flex;align-items:center;gap:3px">
              <a id="pfl-obj-login-link" href="https://sex-world.ai/wp-login.php" class="pfl-std-cbtn" style="display:none;font-size:9.5px;padding:2px 6px;border-color:#f59e0b;color:#fde047;text-decoration:none" title="Admin login to edit shared scene objects">🔐 Login</a>
              <button type="button" class="pfl-std-cbtn" id="pfl-publish-layout-btn" style="font-size:9.5px;padding:2px 6px;border-color:#22c55e;color:#4ade80" title="Publish current scene layout to Sex-World.ai for all visitors (Admin Only)">💾 Save</button>
            </div>
          </div>
          <div id="pfl-sel-name" style="height:18px;line-height:18px;color:#4ade80;font-size:9.5px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🗺️ Map (Click any object)</div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
            <canvas id="pfl-obj-move-ball" width="128" height="128" style="cursor:grab;touch-action:none;border-radius:50%" title="Inner puck: drag XY on ground · Outer cyan ring: spin Heading 0°–360° · Gold 3D Tilt handle (▲T) or Shift+drag: Tilt UP/DOWN (-90° to +90°)"></canvas>
            <div style="font-size:8.5px;color:#94a3b8;text-align:center;line-height:1.25">XY Move · Outer Ring Spin</div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px">
            <button type="button" class="pfl-std-cbtn" data-pfl-obj-rot="-15" style="min-height:30px;font-size:11px;font-weight:700;border-color:rgba(250,204,21,0.55);color:#fde047" title="Rotate selected object -15° CCW">⟲ L</button>
            <button type="button" class="pfl-std-cbtn" data-pfl-obj-cam="0,1" style="min-height:30px;font-size:13px;font-weight:700;border-color:rgba(56,189,248,0.7);color:#7dd3fc" title="Slide selected object away from camera">▲</button>
            <button type="button" class="pfl-std-cbtn" data-pfl-obj-rot="15" style="min-height:30px;font-size:11px;font-weight:700;border-color:rgba(250,204,21,0.55);color:#fde047" title="Rotate selected object +15° CW">⟳ R</button>
            <button type="button" class="pfl-std-cbtn" data-pfl-lift-delta="0.25" style="min-height:30px;font-size:11px;font-weight:700;border-color:rgba(74,222,128,0.6);color:#4ade80" title="Raise selected object +0.25m">⬆ Up</button>
            <button type="button" class="pfl-std-cbtn" data-pfl-obj-cam="-1,0" style="min-height:30px;font-size:13px;font-weight:700;border-color:rgba(56,189,248,0.7);color:#7dd3fc" title="Slide selected object screen-left">◀</button>
            <button type="button" class="pfl-std-cbtn" data-pfl-obj-cam="0,-1" style="min-height:30px;font-size:13px;font-weight:700;border-color:rgba(56,189,248,0.7);color:#7dd3fc" title="Slide selected object toward camera">▼</button>
            <button type="button" class="pfl-std-cbtn" data-pfl-obj-cam="1,0" style="min-height:30px;font-size:13px;font-weight:700;border-color:rgba(56,189,248,0.7);color:#7dd3fc" title="Slide selected object screen-right">▶</button>
            <button type="button" class="pfl-std-cbtn" data-pfl-lift-delta="-0.25" style="min-height:30px;font-size:11px;font-weight:700;border-color:rgba(74,222,128,0.6);color:#4ade80" title="Lower selected object -0.25m">⬇ Dn</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:3px">
            <button type="button" class="pfl-std-cbtn" data-pfl-obj-rot="-5" style="font-size:10px;padding:3px 2px" title="Fine rotate -5° CCW">↺5°</button>
            <button type="button" class="pfl-std-cbtn" data-pfl-obj-rot="5" style="font-size:10px;padding:3px 2px" title="Fine rotate +5° CW">↻5°</button>
            <button type="button" class="pfl-std-cbtn" data-pfl-obj-rot="90" style="font-size:10px;padding:3px 2px" title="Rotate +90°">🔄90°</button>
            <button type="button" class="pfl-std-cbtn" id="pfl-lift-zero-btn" style="font-size:10px;padding:3px 2px;border-color:#22c55e;color:#4ade80" title="Reset Height / Lift override to 0.00m ground">🎯0m</button>
          </div>
          <div style="display:flex;gap:3px;flex-wrap:wrap">
            <button type="button" class="pfl-std-cbtn" id="pfl-reset-selected-btn" style="border-color:#fbbf24;color:#fde047" title="Reset just the currently selected object back to where it was before you moved it">↺ Reset</button>
            <button type="button" class="pfl-std-cbtn" id="pfl-lock-house-btn" style="border-color:#22c55e;color:#4ade80" title="Lock 417 Palm Dr House against accidental mouse drags">🔒 House</button>
            <button type="button" class="pfl-std-cbtn" id="pfl-drag-place-btn" title="When ON, click anywhere on ground/roof to drop object">✋ Drop</button>
            <button type="button" class="pfl-std-cbtn" id="pfl-nudge-step-btn" title="Cycle move step size (0.1m / 0.25m / 1.0m)">📏 .25m</button>
            <button type="button" class="pfl-std-cbtn" id="pfl-drag-speed-btn" style="border-color:#38bdf8;color:#7dd3fc" title="Cycle mouse drag sensitivity">🐢 0.30×</button>
            <button type="button" class="pfl-std-cbtn" id="pfl-reset-all-objects-btn" style="border-color:#38bdf8;color:#7dd3fc" title="Reset House, Monaco RV, Lisa, Chair &amp; Yard Photos back to surveyed positions">↺ All</button>
            <button type="button" class="pfl-std-cbtn" id="pfl-avatar-light-btn" style="border-color:#5eead4;color:#ccfbf1" title="Cycle uniform character illumination: Uniform Unlit (bright even at night) / Studio Fill / Scene Sun">🔆 Light: Uniform</button>
            <button type="button" class="pfl-std-cbtn" id="pfl-bed-livewire-btn" style="border-color:#38bdf8;color:#7dd3fc" title="Overlay live LiveWire DWPose skeleton &amp; rig onto Paul &amp; Lisa's rooftop Bed Photo">🛏️ Bed LiveWire: ON</button>
            <select class="pfl-std-cbtn" id="pfl-compass-paul-avatar-select" style="border-color:#38bdf8;color:#7dd3fc;background:rgba(9,14,26,0.95);max-width:165px" title="Map a 3D GLB outfit onto Paul's live bed wireframe"></select>
          </div>
          <label style="display:flex;justify-content:space-between;font-size:10px"><span>Heading (°)</span><span id="pfl-hdg-val">154°</span></label>
          <input type="range" id="pfl-hdg-slider" min="0" max="360" step="1" value="154" style="width:100%" />
          <label style="display:flex;justify-content:space-between;font-size:10px"><span>Height / Lift (m)</span><span id="pfl-alt-val">0.00m</span></label>
          <input type="range" id="pfl-alt-slider" min="-35" max="35" step="0.1" value="0" style="width:100%" title="Manual vertical height override (-35 m to +35 m)" />
          <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;font-size:10px">
            <span>🪜 Tilt / Pitch (°)</span>
            <div style="display:flex;gap:3px;align-items:center">
              <button type="button" class="pfl-std-cbtn" data-pfl-tilt-delta="-10" style="padding:1px 5px;font-size:9.5px" title="Tilt photo down/back -10°">−10°</button>
              <span id="pfl-tilt-val" style="min-width:28px;text-align:center;color:#fde047;font-weight:700">0°</span>
              <button type="button" class="pfl-std-cbtn" data-pfl-tilt-delta="10" style="padding:1px 5px;font-size:9.5px" title="Tilt headboard / wall UP +10°">+10°</button>
              <button type="button" class="pfl-std-cbtn" id="pfl-tilt-flat-btn" style="padding:1px 5px;font-size:9.5px" title="Lay flat on roof/floor (0°)">Flat</button>
              <button type="button" class="pfl-std-cbtn" id="pfl-tilt-stand-btn" style="padding:1px 5px;font-size:9.5px;border-color:#fbbf24;color:#fde047" title="Tilt upright into the air (+75° wall)">🧱 Up</button>
            </div>
          </div>
          <input type="range" id="pfl-tilt-slider" min="-90" max="90" step="1" value="0" style="width:100%;accent-color:#fbbf24" title="Tilt selected photo UP/DOWN (-90° to +90°) — lift headboard &amp; wall off the roof" />
          <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;font-size:10px">
            <span>📐 Size</span>
            <div style="display:flex;gap:3px;align-items:center">
              <button type="button" class="pfl-std-cbtn" data-pfl-scale-delta="-0.1" title="Shrink selected object by 0.10×">−</button>
              <span id="pfl-scale-val">1.00×</span>
              <button type="button" class="pfl-std-cbtn" data-pfl-scale-delta="0.1" title="Enlarge selected object by 0.10×">+</button>
            </div>
          </div>
          <input type="range" id="pfl-scale-slider" min="0.25" max="3.5" step="0.05" value="1" style="width:100%;accent-color:#fbbf24" title="Resize the selected photo / 3D model (0.25× – 3.50×)" />
          <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;font-size:10px">
            <span>💧 Opacity</span>
            <span id="pfl-opacity-val">1.00</span>
          </div>
          <input type="range" id="pfl-opacity-slider" min="0.1" max="1" step="0.05" value="1" style="width:100%;accent-color:#38bdf8" title="Adjust transparency / opacity (0.10 – 1.00)" />
          <div id="pfl-hotspot-actions" style="display:none;gap:3px;flex-wrap:wrap;margin-top:4px;padding:4px;border:1px solid rgba(250,204,21,0.6);border-radius:7px;background:rgba(250,204,21,0.08)">
            <span style="width:100%;color:#fde047;font-weight:700;font-size:9.5px">✨ Hotspot Actions</span>
            <button type="button" class="pfl-std-cbtn" id="pfl-hs-walk-house" style="display:none;border-color:#fbbf24;color:#fde047" title="Open 32-photo 2-story floor plan &amp; Auto-Tour">🏠 Walk Inside</button>
            <button type="button" class="pfl-std-cbtn" id="pfl-hs-play" title="Open source view / play">🎬 Play</button>
            <button type="button" class="pfl-std-cbtn" id="pfl-hs-orbit" title="Send telepresence drone to orbit this object">🚁 Orbit</button>
            <button type="button" class="pfl-std-cbtn" id="pfl-hs-spin" title="Rotate selected object 90°">🔄 90°</button>
            <button type="button" class="pfl-std-cbtn" id="pfl-hs-resize" title="Focus Size slider">📐 Size</button>
          </div>
        </div>
      </div>
      <details id="pfl-photo-align-box" style="width:100%;box-sizing:border-box;padding:5px;border:1px solid rgba(34,211,238,0.5);border-radius:7px;background:rgba(8,47,73,0.45)">
        <summary style="cursor:pointer;color:#67e8f9;font-weight:700;font-size:10px;list-style:none">📷 Photo / 360° / 3D &amp; 4D Time Machine ▾</summary>
        <div style="display:flex;flex-direction:column;gap:4px;margin-top:5px">
          <div style="display:flex;gap:3px;flex-wrap:wrap">
            <input type="file" id="pfl-photo-file-input" accept="image/*,.jpg,.jpeg,.png,.webp" multiple style="display:none" />
            <button type="button" class="pfl-std-cbtn" id="pfl-photo-drop-btn" style="flex:1;border-color:#22d3ee;color:#67e8f9" title="Drop 2D, 3D Stereo, or 360° equirectangular photos — extracts EXIF GPS/DateTimeOriginal/GPano &amp; auto-aligns via visual feature vectors">📷 Drop Photos / 360° / 3D</button>
            <button type="button" class="pfl-std-cbtn" id="pfl-photo-lock-btn" style="border-color:#4ade80;color:#86efac" title="Lock &amp; index selected photo vector pose locally">🔗 Lock &amp; Index Selected</button>
          </div>
          <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
            <span style="font-size:9.5px;color:#94a3b8;white-space:nowrap">🕰️ 4D Era:</span>
            <select id="pfl-era-select" style="flex:1;min-width:140px;background:#0f172a;color:#fde047;border:1px solid #334155;border-radius:4px;padding:2px 4px;font-size:9.5px">
              <option value="all">All Eras (2018 + Live 2026)</option>
              <option value="2026">Live 2026 Survey</option>
              <option value="2018-11-04">Nov 4, 2018 (21× LG-R105 360°)</option>
            </select>
            <button type="button" class="pfl-std-cbtn" id="pfl-360-orbs-toggle" style="border-color:#38bdf8;color:#7dd3fc" title="Show/hide clickable floating 360° Time Orbs around 417 Palm Dr">🌐 360° Orbs: ON</button>
            <button type="button" class="pfl-std-cbtn" id="pfl-time-machine-spot-btn" style="border-color:#facc15;color:#fde047" title="Find nearest 360° spheres at your current standing position &amp; play 2018 → 2026 over time">▶️ Play Spot Time</button>
          </div>
          <div id="pfl-photo-align-status" style="font-size:9px;color:#a5f3fc;line-height:1.25">21× Nov 4 2018 360° spheres indexed · Click any orb or Drop Photos</div>
        </div>
      </details>
      <details id="pfl-sketchfab-box" style="width:100%;box-sizing:border-box;padding:5px;border:1px solid rgba(168,85,247,0.45);border-radius:7px;background:rgba(15,23,42,0.8)">
        <summary style="cursor:pointer;color:#e9d5ff;font-weight:700;font-size:10px;list-style:none">📦 Sketchfab &amp; Local GLB Loader ▾</summary>
        <div style="display:flex;flex-direction:column;gap:4px;margin-top:5px">
          <div style="display:flex;gap:3px">
            <input type="text" id="pfl-sf-query" placeholder="Search Sketchfab 3D..." style="flex:1;min-width:0;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:4px;padding:2px 5px;font-size:10px" />
            <button type="button" class="pfl-std-cbtn" id="pfl-sf-search-btn" style="border-color:#a855f7;color:#e9d5ff">🔍</button>
            <input type="file" id="pfl-glb-file-input" accept=".glb,.gltf" style="display:none" />
            <button type="button" class="pfl-std-cbtn" id="pfl-glb-file-btn" style="border-color:#22c55e;color:#86efac" title="Drop any local .glb / .gltf (Mixamo, Ready Player Me, Blender) onto the current view">📁 Drop Local .glb</button>
          </div>
          <div style="display:flex;gap:3px;align-items:center">
            <input type="password" id="pfl-sf-token" placeholder="Sketchfab API Token (saved locally)" style="flex:1;min-width:0;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:4px;padding:2px 5px;font-size:9.5px" />
            <a href="https://sketchfab.com/settings/password" target="_blank" rel="noopener" class="pfl-std-cbtn" style="text-decoration:none;border-color:#38bdf8;color:#7dd3fc" title="Open your Sketchfab account settings to copy your personal API Token">🔑</a>
          </div>
          <div id="pfl-sf-status" style="font-size:9px;color:#94a3b8;line-height:1.25">Search downloadable models or drop a local .glb</div>
          <div id="pfl-sf-results" style="display:flex;flex-direction:column;gap:3px;max-height:130px;overflow:auto"></div>
        </div>
      </details>
      <div id="pfl-nav-pins-box" style="width:100%;border-top:1px solid rgba(56,189,248,0.25);padding-top:6px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;margin-bottom:4px">
          <span id="pfl-nav-pins-hdr" style="color:#38bdf8;font-weight:700">📍 Navigation Pins (Personal)</span>
          <button type="button" class="pfl-std-cbtn" id="pfl-pin-here-btn" style="border-color:#facc15;color:#fde047" title="Drop your own clickable navigation pin at the center of your view">📌 Pin Here</button>
        </div>
        <div id="pfl-nav-pins-list" style="display:flex;flex-direction:column;gap:4px;max-height:132px;overflow:auto"></div>
      </div>
    </div>
  `;

  let activeMovable = null;
  let clickToPlaceMode = false;
  let houseDragLocked = true;
  let panDragMode = true;
  let dragSpeedIdx = 0;
  let nudgeStepIdx = 1;
  let dragShiftHeld = false;
  const padRepeatIntervals = new Set();
  const clearAllPadRepeats = () => {
    for (const tid of padRepeatIntervals) clearInterval(tid);
    padRepeatIntervals.clear();
  };
  let buildYard3dLandmarks = () => {};
  let open360ViewerModal = () => {};
  let sync360SphereEntities = () => {};
  let walkCollisionsOn = true;
  const HOUSE_DEFAULT_POSE = { lat: 29.2475785, lon: -95.231348, heading: 99, lift: -0.5, scale: 1, opacity: 1 };
  const MONACO_DEFAULT_POSE = { lat: 29.2474149, lon: -95.2311799, heading: 24, lift: 0, scale: 1, opacity: 1 };
  const DOCK_DEFAULT_POSE = { lat: 29.247786, lon: -95.231388, heading: 14, lift: 0, scale: 1, opacity: 1 };

  function houseLocalToGeo(localEastM, localNorthM, hState = null) {
    const hs = hState || window.__pflMovables?.house?.getState?.() || HOUSE_DEFAULT_POSE;
    const hdgDeg = Number(hs.heading ?? HOUSE_DEFAULT_POSE.heading);
    const deltaRad = Cesium.Math.toRadians(hdgDeg - 104);
    const cosA = Math.cos(deltaRad);
    const sinA = Math.sin(deltaRad);
    const worldEastM = localEastM * cosA + localNorthM * sinA;
    const worldNorthM = -localEastM * sinA + localNorthM * cosA;
    const lat = Number(hs.lat) + worldNorthM / 111320;
    const lon = Number(hs.lon) + worldEastM / (111320 * Math.cos(Cesium.Math.toRadians(Number(hs.lat))));
    return { lat, lon, worldEastM, worldNorthM };
  }

  function geoToHouseLocal(lat, lon, hState = null) {
    const hs = hState || window.__pflMovables?.house?.getState?.() || HOUSE_DEFAULT_POSE;
    const hdgDeg = Number(hs.heading ?? HOUSE_DEFAULT_POSE.heading);
    const wN = (lat - Number(hs.lat)) * 111320;
    const wE = (lon - Number(hs.lon)) * 111320 * Math.cos(Cesium.Math.toRadians(Number(hs.lat)));
    const deltaRad = Cesium.Math.toRadians(hdgDeg - 104);
    const cosA = Math.cos(deltaRad);
    const sinA = Math.sin(deltaRad);
    return {
      x: wE * cosA - wN * sinA,
      y: wE * sinA + wN * cosA,
    };
  }

  const RBAC_TIERS = {
    admin:   { label: 'Admin',   canEditGlobalScene: true,  canPublishGlobalLayout: true,  canAddPersonalPins: true },
    curator: { label: 'Curator', canEditGlobalScene: false, canPublishGlobalLayout: false, canAddPersonalPins: true },
    member:  { label: 'Member',  canEditGlobalScene: false, canPublishGlobalLayout: false, canAddPersonalPins: true },
    guest:   { label: 'Guest',   canEditGlobalScene: false, canPublishGlobalLayout: false, canAddPersonalPins: true },
  };
  let rbacState = IS_LOCAL_NODE
    ? {
        loaded: true,
        loggedIn: true,
        userId: 1,
        userLogin: 'paulprime',
        displayName: 'Paul Prime (Local)',
        wpRoles: ['administrator'],
        tier: 'admin',
        capabilities: { ...RBAC_TIERS.admin },
        nonce: '',
      }
    : {
        loaded: false,
        loggedIn: false,
        userId: 0,
        userLogin: '',
        displayName: 'Guest',
        wpRoles: [],
        tier: 'guest',
        capabilities: { ...RBAC_TIERS.guest },
        nonce: '',
      };
  const isGlobalEditAllowed = () => Boolean(IS_LOCAL_NODE || rbacState.capabilities?.canEditGlobalScene);

  const sexWorldDemo = createSexWorldDemoTour({
    viewer,
    onBeforeFly: () => {
      unlockDroneCamera();
      cmdWin.box.classList.add('pfl-minimized');
      const mb = cmdWin.box.querySelector('[data-act="min"]');
      if (mb) mb.textContent = '▢';
    },
    onOpenMlsWalkthrough: () => openMlsWalkthrough(),
  });

  // ---- Persistent Clickable Navigation Pins (Canvas Billboards + Points, Zero Cesium Labels!) ----
  const NAV_PINS_KEY = 'pfl_nav_pins_v1';
  const NAV_PIN_ENTITY_PREFIX = 'pfl-nav-pin:';
  const navPinEntityIds = new Set();
  const DEFAULT_SEED_PIN = {
    id: 'pin-4006-fawn-creek',
    label: "4006 Fawn Creek Dr, Kingwood, TX (Lisa Grifo's House)",
    lat: 30.065543,
    lon: -95.202311,
    pinnedAt: 1795280000000,
  };

  function loadNavPins() {
    try {
      const raw = localStorage.getItem(NAV_PINS_KEY);
      if (raw === null) {
        const seeded = [{ ...DEFAULT_SEED_PIN }];
        localStorage.setItem(NAV_PINS_KEY, JSON.stringify(seeded));
        return seeded;
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)))
        : [];
    } catch {
      return [{ ...DEFAULT_SEED_PIN }];
    }
  }
  let navPins = loadNavPins();

  function saveNavPins() {
    try { localStorage.setItem(NAV_PINS_KEY, JSON.stringify(navPins.slice(0, 25))); } catch {}
  }

  function makeNavPinCanvas(pin) {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 332;
    c.height = 68;
    const ctx = c.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = 'rgba(9, 14, 26, 0.94)';
    ctx.beginPath();
    ctx.roundRect(4, 4, 324, 46, 10);
    ctx.fill();

    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.roundRect(4, 4, 324, 46, 10);
    ctx.stroke();

    // Pointer tip
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(158, 50);
    ctx.lineTo(174, 50);
    ctx.lineTo(166, 65);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fde047';
    ctx.font = '800 12.5px "Inter", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`📍 ${String(pin.label || 'Pinned Destination').slice(0, 34)}`, 14, 10);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '700 10.5px "JetBrains Mono", monospace';
    ctx.fillText(`${Number(pin.lat).toFixed(5)}, ${Number(pin.lon).toFixed(5)} · CLICK PIN TO ZOOM`, 14, 30);

    return c;
  }

  function syncNavPinEntities() {
    if (!viewer?.entities) return;
    for (const eid of [...navPinEntityIds]) {
      try { viewer.entities.removeById(eid); } catch {}
      navPinEntityIds.delete(eid);
    }
    for (const pin of navPins) {
      const eid = `${NAV_PIN_ENTITY_PREFIX}${pin.id}`;
      const canvas = makeNavPinCanvas(pin);
      const ent = viewer.entities.add({
        id: eid,
        name: `📍 ${pin.label}`,
        position: Cesium.Cartesian3.fromDegrees(Number(pin.lon), Number(pin.lat), 2),
        point: {
          pixelSize: 10,
          color: Cesium.Color.fromCssColorString('#facc15'),
          outlineColor: Cesium.Color.fromCssColorString('#0ea5e9'),
          outlineWidth: 2.5,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        ...(canvas
          ? {
              billboard: {
                image: canvas,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                pixelOffset: new Cesium.Cartesian2(0, -10),
                heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                scaleByDistance: new Cesium.NearFarScalar(120, 1.0, 120000, 0.55),
                eyeOffset: new Cesium.Cartesian3(0, 0, -10),
              },
            }
          : {}),
      });
      if (ent) ent._pflNavPinId = pin.id;
      navPinEntityIds.add(eid);
    }
    governorRequestRender('pfl-nav-pins-sync');
  }

  function flyToNavPin(pin, rangeM = 140) {
    if (!pin || !viewer?.camera) return;
    unlockDroneCamera();
    try { viewer.trackedEntity = undefined; viewer.selectedEntity = undefined; } catch {}
    const lat = Number(pin.lat);
    const lon = Number(pin.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    let groundH = 0;
    try {
      if (viewer.scene?.globe?.show !== false) {
        const gh = viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(lon, lat));
        if (Number.isFinite(gh) && gh > -80 && gh < 5000) groundH = gh;
      } else {
        const sh = viewer.scene.sampleHeight?.(Cesium.Cartographic.fromDegrees(lon, lat));
        if (Number.isFinite(sh) && sh > -80 && sh < 5000) groundH = sh;
      }
    } catch {}
    holdContinuousRender('pfl-nav-pin-fly');
    const release = () => {
      releaseContinuousRender('pfl-nav-pin-fly');
      governorRequestRender('pfl-nav-pin-arrived');
    };
    const bs = new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(lon, lat, groundH + 8), 18);
    viewer.camera.flyToBoundingSphere(bs, {
      offset: new Cesium.HeadingPitchRange(Cesium.Math.toRadians(15), Cesium.Math.toRadians(-42), rangeM),
      duration: 1.4,
      complete: release,
      cancel: release,
    });
  }

  function renderNavPinsList() {
    const hdrEl = compassWin.body.querySelector('#pfl-nav-pins-hdr');
    if (hdrEl) hdrEl.textContent = `📍 Navigation Pins (${navPins.length})`;
    const dockBtn = document.getElementById('pfl-btn-nav-pins');
    if (dockBtn) dockBtn.textContent = `📍 Pins (${navPins.length})`;
    const listEl = compassWin.body.querySelector('#pfl-nav-pins-list');
    if (!listEl) return;
    if (!navPins.length) {
      listEl.innerHTML = '<div style="font-size:10px;color:#64748b">Search an address in LOCATION or click Pin Here.</div>';
      return;
    }
    listEl.innerHTML = navPins.map((p) => {
      const safeLbl = String(p.label || 'Pin').replace(/[<>&"]/g, '');
      return `
        <div style="display:flex;align-items:center;gap:3px;padding:3px 4px;border:1px solid rgba(56,189,248,0.22);border-radius:6px;background:rgba(15,23,42,0.72)">
          <button type="button" class="pfl-std-cbtn" data-pin-fly="${p.id}" style="flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:none;background:transparent;padding:1px 3px;color:#fde047" title="Fly to ${safeLbl} (${Number(p.lat).toFixed(5)}, ${Number(p.lon).toFixed(5)})">📍 ${safeLbl}</button>
          <button type="button" class="pfl-std-cbtn" data-pin-close="${p.id}" style="padding:1px 5px;font-size:9.5px;border-color:#38bdf8;color:#7dd3fc" title="Close-up rooftop zoom (70m)">🔍70m</button>
          <button type="button" class="pfl-std-cbtn" data-pin-del="${p.id}" style="padding:1px 5px;font-size:9.5px;border-color:rgba(244,63,94,0.5);color:#fda4af" title="Delete pin">✕</button>
        </div>
      `;
    }).join('');
    listEl.querySelectorAll('[data-pin-fly]').forEach((b) => {
      b.addEventListener('click', () => {
        const pin = navPins.find((p) => p.id === b.getAttribute('data-pin-fly'));
        if (pin) flyToNavPin(pin, 140);
      });
    });
    listEl.querySelectorAll('[data-pin-close]').forEach((b) => {
      b.addEventListener('click', () => {
        const pin = navPins.find((p) => p.id === b.getAttribute('data-pin-close'));
        if (pin) flyToNavPin(pin, 70);
      });
    });
    listEl.querySelectorAll('[data-pin-del]').forEach((b) => {
      b.addEventListener('click', () => removeNavPin(b.getAttribute('data-pin-del')));
    });
  }

  function addNavPin({ lat, lon, label }) {
    const nLat = Number(lat);
    const nLon = Number(lon);
    if (!Number.isFinite(nLat) || !Number.isFinite(nLon)) return null;
    const cleanLabel = String(label || `${nLat.toFixed(5)}, ${nLon.toFixed(5)}`).trim();
    const matchIdx = navPins.findIndex(
      (p) => Math.hypot(Number(p.lat) - nLat, Number(p.lon) - nLon) < 0.00035,
    );
    let item;
    if (matchIdx >= 0) {
      item = { ...navPins[matchIdx], lat: nLat, lon: nLon, label: cleanLabel, pinnedAt: Date.now() };
      navPins.splice(matchIdx, 1);
      navPins.unshift(item);
    } else {
      item = {
        id: `pin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        label: cleanLabel,
        lat: nLat,
        lon: nLon,
        pinnedAt: Date.now(),
      };
      navPins.unshift(item);
      if (navPins.length > 25) navPins = navPins.slice(0, 25);
    }
    saveNavPins();
    syncNavPinEntities();
    renderNavPinsList();
    return item;
  }

  function removeNavPin(id) {
    navPins = navPins.filter((p) => p.id !== id);
    saveNavPins();
    syncNavPinEntities();
    renderNavPinsList();
  }

  function pinCameraCenter(customLabel = null) {
    if (!viewer?.camera) return null;
    const canvas = viewer.scene?.canvas;
    const center = new Cesium.Cartesian2((canvas?.clientWidth || 1280) * 0.5, (canvas?.clientHeight || 800) * 0.5);
    let cart = null;
    try {
      const ray = viewer.camera.getPickRay(center);
      if (ray && viewer.scene?.globe?.show !== false) cart = viewer.scene.globe.pick(ray, viewer.scene);
    } catch {}
    if (!cart) {
      try { cart = viewer.camera.pickEllipsoid(center, viewer.scene?.globe?.ellipsoid); } catch {}
    }
    let lat; let lon;
    if (cart) {
      const cg = Cesium.Cartographic.fromCartesian(cart);
      lat = Cesium.Math.toDegrees(cg.latitude);
      lon = Cesium.Math.toDegrees(cg.longitude);
    } else {
      const c = viewer.camera.positionCartographic;
      if (!c) return null;
      lat = Cesium.Math.toDegrees(c.latitude);
      lon = Cesium.Math.toDegrees(c.longitude);
    }
    return addNavPin({ lat, lon, label: customLabel || `View Pin (${lat.toFixed(4)}, ${lon.toFixed(4)})` });
  }

  const onGevSearchPin = (ev) => {
    const d = ev?.detail;
    if (!d || !Number.isFinite(Number(d.lat)) || !Number.isFinite(Number(d.lon))) return;
    addNavPin({ lat: Number(d.lat), lon: Number(d.lon), label: d.label || d.query });
  };
  window.addEventListener('gev:search-pin', onGevSearchPin);
  compassWin.body.querySelector('#pfl-pin-here-btn')?.addEventListener('click', () => pinCameraCenter());
  window.__pflNavPins = {
    list: () => [...navPins],
    add: addNavPin,
    remove: removeNavPin,
    flyTo: (id, rangeM = 140) => {
      const pin = navPins.find((p) => p.id === id);
      if (pin) flyToNavPin(pin, rangeM);
      return Boolean(pin);
    },
    pinCameraCenter,
  };
  syncNavPinEntities();
  renderNavPinsList();

  compassWin.body.querySelector('#pfl-drag-pan-toggle')?.addEventListener('click', (e) => {
    panDragMode = !panDragMode;
    e.currentTarget.textContent = panDragMode ? '✋ Drag: PAN (Flat)' : '🌍 Drag: CESIUM';
    e.currentTarget.style.borderColor = panDragMode ? '#22c55e' : '#38bdf8';
    e.currentTarget.style.color = panDragMode ? '#4ade80' : '#7dd3fc';
  });
  compassWin.body.querySelector('#pfl-compass-snap-btn')?.addEventListener('click', (e) => {
    const b = e.currentTarget;
    let ok = false;
    try {
      if (typeof window.__pflCaptureSnapshot === 'function') {
        ok = window.__pflCaptureSnapshot();
      } else if (viewer?.scene?.canvas) {
        viewer.scene.render();
        const a = document.createElement('a');
        a.href = viewer.scene.canvas.toDataURL('image/png');
        a.download = `pfl-gev-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        ok = true;
      }
    } catch {}
    if (b) {
      b.textContent = ok ? '✅ Saved!' : '⚠️ Retry';
      setTimeout(() => { b.textContent = '📸 Snap'; }, 1200);
    }
  });

  function syncRbacUi() {
    const canEdit = isGlobalEditAllowed();
    const pill = document.getElementById('pfl-rbac-pill');
    const authLink = document.getElementById('pfl-portal-auth-link');
    const pubBtn = compassWin.body.querySelector('#pfl-publish-layout-btn');
    const objLoginLink = compassWin.body.querySelector('#pfl-obj-login-link');
    const banner = compassWin.body.querySelector('#pfl-obj-rbac-banner');
    const loginHref = `https://sex-world.ai/wp-login.php?redirect_to=${encodeURIComponent(window.location.href || 'https://sex-world.ai/gods-eye-view/')}`;

    if (pill) {
      if (IS_LOCAL_NODE) {
        pill.textContent = '👑 Local Admin';
        pill.style.borderColor = '#4ade80';
        pill.style.color = '#4ade80';
      } else if (rbacState.tier === 'admin') {
        pill.textContent = `👑 ${rbacState.displayName || 'Admin'}`;
        pill.style.borderColor = '#4ade80';
        pill.style.color = '#4ade80';
      } else if (rbacState.loggedIn) {
        pill.textContent = `👤 ${rbacState.displayName || 'Member'} (${rbacState.tier})`;
        pill.style.borderColor = '#facc15';
        pill.style.color = '#fde047';
      } else {
        pill.textContent = '👁️ Guest';
        pill.style.borderColor = '#38bdf8';
        pill.style.color = '#7dd3fc';
      }
    }
    if (authLink) {
      if (rbacState.loggedIn && !IS_LOCAL_NODE) {
        authLink.href = rbacState.tier === 'admin' ? 'https://sex-world.ai/wp-admin/' : 'https://sex-world.ai/my-account/';
        authLink.textContent = rbacState.tier === 'admin' ? `👑 ${rbacState.displayName} (WP Admin)` : `👤 ${rbacState.displayName}`;
        authLink.style.borderColor = rbacState.tier === 'admin' ? '#4ade80' : '#facc15';
        authLink.style.color = rbacState.tier === 'admin' ? '#4ade80' : '#fde047';
      } else if (!IS_LOCAL_NODE) {
        authLink.href = loginHref;
        authLink.textContent = '🔐 Log In';
      }
    }
    if (pubBtn) {
      pubBtn.style.display = canEdit ? 'inline-block' : 'none';
    }
    if (objLoginLink) {
      objLoginLink.href = loginHref;
      objLoginLink.style.display = canEdit ? 'none' : 'inline-block';
    }
    if (banner) {
      if (canEdit) {
        banner.innerHTML = IS_LOCAL_NODE
          ? '👑 <b>Admin (Localhost)</b> · Full Edit · Roles: Admin=Publish · Member/Guest=Own Pins'
          : `👑 <b>${rbacState.displayName || 'Admin'}</b> · Global Edit &amp; Publish ON · Guests keep own Pins`;
        banner.style.borderColor = 'rgba(74,222,128,0.45)';
        banner.style.color = '#86efac';
      } else {
        banner.innerHTML = `👁️ <b>Guest Sandbox</b> · Move objects locally · Changes do NOT save globally (Admin only) · <a href="${loginHref}" style="color:#fde047;text-decoration:underline">Admin Login</a>`;
        banner.style.borderColor = 'rgba(245,158,11,0.55)';
        banner.style.color = '#fde68a';
      }
    }
    compassWin.body.querySelectorAll('#pfl-object-pad-card input[type="range"]').forEach((el) => {
      if (el.id === 'pfl-scale-slider') {
        el.disabled = !movableSupportsScale(activeMovable);
      } else if (el.id === 'pfl-tilt-slider') {
        el.disabled = !movableSupportsTilt(activeMovable);
      } else {
        el.disabled = false;
      }
    });
  }

  function flashRbacLockBanner() {
    const target =
      compassWin.body.querySelector('#pfl-obj-rbac-banner') ||
      compassWin.body.querySelector('#pfl-obj-login-link') ||
      compassWin.body.querySelector('#pfl-sel-name');
    if (!target) return;
    target.style.boxShadow = '0 0 0 2px #f59e0b';
    setTimeout(() => { target.style.boxShadow = ''; }, 900);
  }

  const SCENE_LAYOUT_TS_KEY = 'pfl_scene_layout_synced_ts_v1';
  const SCENE_LAYOUT_KEYS = [
    'house',
    'monaco',
    'dock',
    'lisa',
    'chair',
    'garage-carport-20261117',
    'yard-overview-20261012',
    'bed-station-20261012',
    'back-yard-cam2-water',
    'house-side-20261012',
    'back-yard-cam1-plan',
    'stadium-scoreboard',
  ];
  function collectSceneLayoutSnapshot() {
    const pick = (k) => {
      const st = window.__pflMovables?.[k]?.getState?.();
      return st ? {
        lat: Number(st.lat),
        lon: Number(st.lon),
        heading: Number(st.heading ?? 0),
        ...(Number.isFinite(Number(st.tilt)) ? { tilt: Number(st.tilt) } : {}),
        lift: Number(st.lift ?? 0),
        scale: Number(st.scale ?? 1),
        opacity: Number(st.opacity ?? 1),
      } : null;
    };
    const objects = {};
    for (const k of SCENE_LAYOUT_KEYS) {
      const val = pick(k);
      if (val) objects[k] = val;
    }
    return { objects };
  }

  const lastSavedObjectPoses = new Map();
  let isApplyingPublishedLayout = false;
  let adminAutoPublishTimer = null;
  function scheduleAdminAutoPublish() {
    if (IS_LOCAL_NODE || !isGlobalEditAllowed() || isApplyingPublishedLayout) return;
    if (adminAutoPublishTimer) clearTimeout(adminAutoPublishTimer);
    adminAutoPublishTimer = setTimeout(() => {
      adminAutoPublishTimer = null;
      publishGlobalLayout(compassWin.body.querySelector('#pfl-publish-layout-btn'));
    }, 1200);
  }

  window.__pflNotifyYardFrameUserEdit = (frameId) => {
    if (isGlobalEditAllowed()) {
      try { localStorage.setItem(SCENE_LAYOUT_TS_KEY, String(Date.now())); } catch {}
      scheduleAdminAutoPublish();
    }
    if (activeMovable && activeMovable.kind === `yardframe:${frameId}`) {
      syncObjectSliders(activeMovable);
      syncActiveMovableGizmo();
    }
  };

  function applyPublishedSceneLayout(layoutObj, retryMissing = true) {
    if (!layoutObj || typeof layoutObj !== 'object') return;
    const objs = layoutObj.objects && typeof layoutObj.objects === 'object' ? layoutObj.objects : {};
    const missing = [];
    isApplyingPublishedLayout = true;
    try {
      for (const k of SCENE_LAYOUT_KEYS) {
        const pose = objs[k];
        if (!pose || typeof pose !== 'object') continue;
        if (!Number.isFinite(Number(pose.lat)) || !Number.isFinite(Number(pose.lon))) continue;
        const mov = window.__pflMovables?.[k];
        if (!mov?.update) {
          missing.push(k);
          continue;
        }
        lastSavedObjectPoses.set(k, {
          lat: Number(pose.lat),
          lon: Number(pose.lon),
          heading: Number(pose.heading ?? 0),
          ...(Number.isFinite(Number(pose.tilt)) ? { tilt: Number(pose.tilt) } : {}),
          lift: Number(pose.lift ?? 0),
          scale: Number(pose.scale ?? 1) || 1,
          opacity: Number.isFinite(Number(pose.opacity)) ? Number(pose.opacity) : 1,
        });
        try {
          mov.update({
            lat: Number(pose.lat),
            lon: Number(pose.lon),
            heading: Number(pose.heading ?? 0),
            ...(Number.isFinite(Number(pose.tilt)) ? { tilt: Number(pose.tilt) } : {}),
            lift: Number(pose.lift ?? 0),
            scale: Number(pose.scale ?? 1) || 1,
            opacity: Number.isFinite(Number(pose.opacity)) ? Number(pose.opacity) : 1,
            _autoSync: true,
          });
        } catch {}
      }
      if (activeMovable) bindMovable(activeMovable);
    } finally {
      isApplyingPublishedLayout = false;
    }
    if (retryMissing && missing.length > 0) {
      const partial = { objects: Object.fromEntries(missing.map((k) => [k, objs[k]])) };
      setTimeout(() => applyPublishedSceneLayout(partial, false), 1200);
    }
  }

  async function publishGlobalLayout(btnEl) {
    if (!isGlobalEditAllowed()) {
      flashRbacLockBanner();
      return;
    }
    if (IS_LOCAL_NODE) {
      if (btnEl) {
        btnEl.textContent = '✅ Saved!';
        setTimeout(() => { btnEl.textContent = '💾 Save'; }, 1400);
      }
      return;
    }
    if (btnEl) btnEl.textContent = '⏳ Saving...';
    try {
      const snapshot = collectSceneLayoutSnapshot();
      const res = await fetch('/api/pfl-scene-layout.php', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(rbacState.nonce ? { 'X-PFL-WP-Nonce': rbacState.nonce } : {}),
        },
        body: JSON.stringify({ ...snapshot, nonce: rbacState.nonce }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        for (const [k, pose] of Object.entries(snapshot.objects || {})) {
          if (pose) lastSavedObjectPoses.set(k, { ...pose });
        }
        try { localStorage.setItem(SCENE_LAYOUT_TS_KEY, String(data.layout?.updatedAtMs || Date.now())); } catch {}
        if (btnEl) {
          btnEl.textContent = '✅ Published!';
          setTimeout(() => { btnEl.textContent = '💾 Save'; }, 1600);
        }
      } else {
        if (btnEl) {
          btnEl.textContent = `❌ ${res.status || 'Err'}`;
          setTimeout(() => { btnEl.textContent = '💾 Save'; }, 1800);
        }
      }
    } catch {
      if (btnEl) {
        btnEl.textContent = '❌ Net Err';
        setTimeout(() => { btnEl.textContent = '💾 Save'; }, 1800);
      }
    }
  }

  syncRbacUi();
  compassWin.body.querySelector('#pfl-publish-layout-btn')?.addEventListener('click', (e) => {
    publishGlobalLayout(e.currentTarget);
  });

  if (!IS_LOCAL_NODE) {
    fetch('/api/pfl-scene-layout.php', { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || !data.ok) return;
        if (data.rbac && typeof data.rbac === 'object') {
          rbacState = { ...rbacState, ...data.rbac, loaded: true };
        }
        syncRbacUi();
        const srvMs = Number(data.layout?.updatedAtMs || 0);
        const locMs = Number(localStorage.getItem(SCENE_LAYOUT_TS_KEY) || 0);
        if (data.layout && (!isGlobalEditAllowed() || srvMs > locMs)) {
          applyPublishedSceneLayout(data.layout);
          if (srvMs > 0) {
            try { localStorage.setItem(SCENE_LAYOUT_TS_KEY, String(srvMs)); } catch {}
          }
        }
      })
      .catch(() => {});
  }

  compassWin.body.querySelector('#pfl-lock-house-btn')?.addEventListener('click', (e) => {
    houseDragLocked = !houseDragLocked;
    e.currentTarget.textContent = houseDragLocked ? '🔒 House' : '🔓 House';
    e.currentTarget.style.borderColor = houseDragLocked ? '#22c55e' : '#f59e0b';
    e.currentTarget.style.color = houseDragLocked ? '#4ade80' : '#fde047';
  });

  compassWin.body.querySelector('#pfl-reset-house-btn')?.addEventListener('click', () => {
    if (!isGlobalEditAllowed()) { flashRbacLockBanner(); return; }
    try {
      localStorage.removeItem('pfl_house_pose_v3');
      localStorage.removeItem('pfl_house_pose_v4');
    } catch {}
    const hMov = window.__pflMovables?.house;
    if (hMov) {
      hMov.update({ ...HOUSE_DEFAULT_POSE });
      if (activeMovable?.kind === 'house') bindMovable(hMov);
    }
    governorRequestRender('pfl-reset-house');
  });

  compassWin.body.querySelector('#pfl-reset-all-objects-btn')?.addEventListener('click', () => {
    if (!isGlobalEditAllowed()) { flashRbacLockBanner(); return; }
    for (const k of ['pfl_house_pose_v3', 'pfl_house_pose_v4', 'pfl_monaco_pose_v2', 'pfl_monaco_pose_v3', 'pfl_dock_pose_v1', 'pfl_custom_objects_v1', 'pfl_movable_scales_v1', 'gev-yardframes-layout-v1']) {
      try { localStorage.removeItem(k); } catch {}
    }
    try { window.__pflMovables?.house?.update?.({ ...HOUSE_DEFAULT_POSE }); } catch {}
    try { window.__pflMovables?.monaco?.update?.({ ...MONACO_DEFAULT_POSE }); } catch {}
    try { window.__pflMovables?.dock?.update?.({ ...DOCK_DEFAULT_POSE }); } catch {}
    try { window.__pflMovables?.lisa?.update?.({ lat: 29.247436, lon: -95.231445, heading: 192, lift: 0, scale: 1, opacity: 1 }); } catch {}
    try { window.__pflMovables?.chair?.update?.({ lat: 29.247434, lon: -95.231426, heading: 192, lift: 0, scale: 1, opacity: 1 }); } catch {}
    try { buildYard3dLandmarks(); } catch {}
    if (activeMovable) bindMovable(activeMovable);
    governorRequestRender('pfl-reset-all-objects');
  });

  // Helper to resolve the ONE yard datum shared with yardFrames.js so photos, 3D House, Monaco, pads & AGL all agree
  function resolveLocalGroundM(lonDeg = -95.23144, latDeg = 29.24750) {
    const nearLiverpool = Math.hypot(Number(latDeg) - 29.24755, Number(lonDeg) - -95.23140) < 0.08;
    try {
      const d = nearLiverpool
        ? activeYardDatumM(viewer, lonDeg, latDeg)
        : resolveTerrainGroundM(viewer, lonDeg, latDeg, 0.0);
      if (Number.isFinite(d)) return d;
    } catch {}
    return nearLiverpool ? -26.19 : 0.0;
  }

  function resolveHouseGroundM(lonDeg, latDeg) {
    const center = resolveLocalGroundM(lonDeg, latDeg);
    if (!viewer?.scene?.globe?.show) return center;
    // Sample 4 footprint corners so sloping World Terrain never buries the 1F slab at any corner
    const samples = [center];
    for (const [dLat, dLon] of [[-0.000055, -0.00008], [-0.000055, 0.00008], [0.000055, -0.00008], [0.000055, 0.00008]]) {
      const s = resolveLocalGroundM(lonDeg + dLon, latDeg + dLat);
      if (Number.isFinite(s) && s > center - 1.5 && s < center + 2.2) samples.push(s);
    }
    return Math.max(...samples);
  }

  // 1S788 Holodeck Hallway Portal Window (Cloud /holodeck/ when public, :8766 when local node — 100% CSP-Clean Native DOM)
  const HOLODECK_BASE_URL = IS_LOCAL_NODE ? 'http://127.0.0.1:8766/' : '/holodeck/';
  const HOLODECK_HALLWAY_URL = `${HOLODECK_BASE_URL}?file=splats/take1-room-capture.spz`;
  function resolveHolodeckRoomForId(roomId) {
    const rid = String(roomId || '').toLowerCase();
    let file = 'splats/take1-room-capture.spz';
    let label = '🚪 Parlor & 7 Hats';
    if (['gameroom-1f', 'patio-1f', 'galley-1f', 'utility-1f', 'bath3-1f'].includes(rid)) {
      file = 'splats/take2-alternate-angle.spz';
      label = '🏋️ 1F Fitness (Lisa Workout)';
    } else if (['kitchen-2f', 'dining-2f', 'baths-2f'].includes(rid)) {
      file = 'splats/take3-main-hall.spz';
      label = '🏛️ Main Hall & Telling Room';
    } else if (rid === 'master-sw-2f') {
      file = 'splats/bedroom-10view.spz';
      label = '🛏️ The Red Suite';
    } else if (rid === 'office-nw-2f') {
      file = 'splats/lisa-command-center.spz';
      label = '👑 Lisa Command & Schoolroom';
    } else if (rid === 'boathouse-wf') {
      file = 'splats/arcade_spaceship.spz';
      label = '🕹️ Arcade Lounge & Quarters';
    }
    return { file, label, url: `${HOLODECK_BASE_URL}?file=${file}` };
  }
  let activeHolodeckUrl = HOLODECK_HALLWAY_URL;
  const holodeckWin = createStandardBox({
    id: 'pfl-win-holodeck-portal',
    title: IS_LOCAL_NODE ? '🚪 1S788 HOLODECK HALLWAY PORTAL (:8766)' : '🚪 1S788 CLOUD HOLODECK PORTAL (/holodeck/)',
    defaultLeft: Math.max(40, Math.round((window.innerWidth - 620) * 0.5)),
    defaultTop: 84,
    defaultWidth: 620,
  });
  holodeckWin.box.style.display = 'none';
  holodeckWin.body.innerHTML = `
    <div id="pfl-holodeck-stargate-map" data-holodeck-target="${HOLODECK_HALLWAY_URL}" style="font-family:'Inter',system-ui,sans-serif;font-size:11.5px;color:#e2e8f0">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px">
        <span style="color:#67e8f9;font-weight:700">🌀 1S788 Carport Breezeway → 3D Gaussian Splat Holodeck</span>
        <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap">
          <button type="button" class="pfl-std-cbtn" id="pfl-holodeck-step-in" style="background:rgba(34,211,238,0.18);border-color:#22d3ee;color:#67e8f9;padding:3px 8px">🚪 Walk Into Hallway Now</button>
          <a href="${HOLODECK_HALLWAY_URL}" target="_blank" rel="noopener" class="pfl-std-cbtn" id="pfl-holodeck-fulltab" style="border-color:#a855f7;color:#e9d5ff;text-decoration:none;padding:3px 8px">↗ Open in New Tab</a>
          <button type="button" class="pfl-std-cbtn" id="pfl-holodeck-close" style="border-color:#f43f5e;color:#fda4af">✕ Close</button>
        </div>
      </div>
      <div style="padding:12px;border:1.5px solid rgba(34,211,238,0.45);border-radius:10px;background:radial-gradient(circle at 50% 35%, rgba(34,211,238,0.14), rgba(88,28,135,0.20) 52%, rgba(3,7,18,0.96) 100%)">
        <div style="text-align:center;font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#a5f3fc;margin-bottom:8px;line-height:1.4">
          🌀 <b>STARGATE TRANSPORT RING</b> · Step into the glowing cyan ring or click below to beam from outdoor 417 Palm Dr into your indoor 3D Gaussian Splats (<code>${IS_LOCAL_NODE ? '127.0.0.1:8766' : '/holodeck/'}</code>), or toggle the self-hosted Yard 3D Splat right here!
        </div>
        <div style="display:flex;justify-content:center;gap:6px;flex-wrap:wrap;margin-bottom:9px">
          <button type="button" class="pfl-std-cbtn" id="pfl-holodeck-splat-btn" style="border-color:#22d3ee;color:#67e8f9;padding:4px 9px">✨ Yard 3D Point Splat: OFF</button>
          <span id="pfl-holodeck-server-badge" style="font-family:'JetBrains Mono',monospace;font-size:10px;padding:4px 8px;border:1px solid #334155;border-radius:5px;color:#94a3b8">${IS_LOCAL_NODE ? 'Local Splat Server (:8766) Ready' : 'Cloud Splat Holodeck (/holodeck/) Ready'}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px">
          <div style="padding:8px 10px;border:1px solid rgba(34,211,238,0.55);border-radius:8px;background:rgba(9,14,26,0.86);display:flex;flex-direction:column;gap:4px">
            <strong style="color:#67e8f9">🚪 1. The Parlor &amp; 7-Hat Check-In (<code>take1-room-capture.spz</code>)</strong>
            <span style="font-size:10.5px;color:#94a3b8">BLWL Neon Marquee, Lisa Holmes, Lisa Muse, Paul Prime &amp; One John Ledger</span>
            <div style="display:flex;gap:5px;margin-top:2px">
              <button type="button" class="pfl-std-cbtn" data-pfl-holo-nav="${HOLODECK_BASE_URL}?file=splats/take1-room-capture.spz" style="border-color:#22d3ee;color:#67e8f9">Step In →</button>
              <a href="${HOLODECK_BASE_URL}?file=splats/take1-room-capture.spz" target="_blank" rel="noopener" class="pfl-std-cbtn" style="text-decoration:none">New Tab ↗</a>
            </div>
          </div>
          <div style="padding:8px 10px;border:1px solid rgba(74,222,128,0.65);border-radius:8px;background:rgba(6,78,59,0.28);display:flex;flex-direction:column;gap:4px">
            <strong style="color:#86efac">🏋️ 2. 1F Fitness Gameroom — Lisa Workout (<code>take2-alternate-angle.spz</code>)</strong>
            <span style="font-size:10.5px;color:#94a3b8">Zillow 1F exercise balls + Lisa Morning Workout animation &amp; pose wall</span>
            <div style="display:flex;gap:5px;margin-top:2px">
              <button type="button" class="pfl-std-cbtn" data-pfl-holo-nav="${HOLODECK_BASE_URL}?file=splats/take2-alternate-angle.spz" style="border-color:#22c55e;color:#4ade80">Step In →</button>
              <a href="${HOLODECK_BASE_URL}?file=splats/take2-alternate-angle.spz" target="_blank" rel="noopener" class="pfl-std-cbtn" style="text-decoration:none">New Tab ↗</a>
            </div>
          </div>
          <div style="padding:8px 10px;border:1px solid rgba(168,85,247,0.55);border-radius:8px;background:rgba(9,14,26,0.86);display:flex;flex-direction:column;gap:4px">
            <strong style="color:#e9d5ff">🏛️ 3. Main Hall &amp; Telling Room Lock (<code>take3-main-hall.spz</code>)</strong>
            <span style="font-size:10.5px;color:#94a3b8">Girls' suite corridor · Wren, Harry Maybourne &amp; locked Telling Room door</span>
            <div style="display:flex;gap:5px;margin-top:2px">
              <button type="button" class="pfl-std-cbtn" data-pfl-holo-nav="${HOLODECK_BASE_URL}?file=splats/take3-main-hall.spz" style="border-color:#a855f7;color:#e9d5ff">Step In →</button>
              <a href="${HOLODECK_BASE_URL}?file=splats/take3-main-hall.spz" target="_blank" rel="noopener" class="pfl-std-cbtn" style="text-decoration:none">New Tab ↗</a>
            </div>
          </div>
          <div style="padding:8px 10px;border:1px solid rgba(236,72,153,0.55);border-radius:8px;background:rgba(9,14,26,0.86);display:flex;flex-direction:column;gap:4px">
            <strong style="color:#f9a8d4">🛏️ 4. The Red Suite (<code>bedroom-10view.spz</code>)</strong>
            <span style="font-size:10.5px;color:#94a3b8">Upstairs Telling Room sanctuary · Lisa Holmes &amp; Paul Prime</span>
            <div style="display:flex;gap:5px;margin-top:2px">
              <button type="button" class="pfl-std-cbtn" data-pfl-holo-nav="${HOLODECK_BASE_URL}?file=splats/bedroom-10view.spz" style="border-color:#ec4899;color:#f9a8d4">Step In →</button>
              <a href="${HOLODECK_BASE_URL}?file=splats/bedroom-10view.spz" target="_blank" rel="noopener" class="pfl-std-cbtn" style="text-decoration:none">New Tab ↗</a>
            </div>
          </div>
          <div style="padding:8px 10px;border:1px solid rgba(74,222,128,0.55);border-radius:8px;background:rgba(9,14,26,0.86);display:flex;flex-direction:column;gap:4px">
            <strong style="color:#86efac">👑 5. Lisa Command &amp; Schoolroom (<code>lisa-command-center.spz</code>)</strong>
            <span style="font-size:10.5px;color:#94a3b8">Spycraft Academy (Troi) · Lisa Muse &amp; Wren ops bridge</span>
            <div style="display:flex;gap:5px;margin-top:2px">
              <button type="button" class="pfl-std-cbtn" data-pfl-holo-nav="${HOLODECK_BASE_URL}?file=splats/lisa-command-center.spz" style="border-color:#4ade80;color:#86efac">Step In →</button>
              <a href="${HOLODECK_BASE_URL}?file=splats/lisa-command-center.spz" target="_blank" rel="noopener" class="pfl-std-cbtn" style="text-decoration:none">New Tab ↗</a>
            </div>
          </div>
          <div style="padding:8px 10px;border:1px solid rgba(251,191,36,0.55);border-radius:8px;background:rgba(9,14,26,0.86);display:flex;flex-direction:column;gap:4px">
            <strong style="color:#fde047">🕹️ 6. Arcade Jukebox Lounge (<code>arcade_spaceship.spz</code>)</strong>
            <span style="font-size:10.5px;color:#94a3b8">La Grange Jukebox &amp; Guest Suite · Portal to 01 Command Deck</span>
            <div style="display:flex;gap:5px;margin-top:2px">
              <button type="button" class="pfl-std-cbtn" data-pfl-holo-nav="${HOLODECK_BASE_URL}?file=splats/arcade_spaceship.spz" style="border-color:#fbbf24;color:#fde047">Step In →</button>
              <a href="${HOLODECK_BASE_URL}?file=splats/arcade_spaceship.spz" target="_blank" rel="noopener" class="pfl-std-cbtn" style="text-decoration:none">New Tab ↗</a>
            </div>
          </div>
          <div style="padding:8px 10px;border:1px solid rgba(192,132,252,0.55);border-radius:8px;background:rgba(9,14,26,0.86);display:flex;flex-direction:column;gap:4px">
            <strong style="color:#d8b4fe">🛸 7. 01 Command Deck (<code>01-command-deck.splat</code>)</strong>
            <span style="font-size:10.5px;color:#94a3b8">HunyuanWorld bridge splat deck · Paul Prime &amp; Lisa Muse</span>
            <div style="display:flex;gap:5px;margin-top:2px">
              <button type="button" class="pfl-std-cbtn" data-pfl-holo-nav="${HOLODECK_BASE_URL}?file=splats/01-command-deck.splat" style="border-color:#c084fc;color:#d8b4fe">Step In →</button>
              <a href="${HOLODECK_BASE_URL}?file=splats/01-command-deck.splat" target="_blank" rel="noopener" class="pfl-std-cbtn" style="text-decoration:none">New Tab ↗</a>
            </div>
          </div>
          ${IS_LOCAL_NODE ? `<div style="padding:8px 10px;border:1px solid rgba(56,189,248,0.55);border-radius:8px;background:rgba(9,14,26,0.86);display:flex;flex-direction:column;gap:4px">
            <strong style="color:#7dd3fc">🏫 Local Chinese Classroom (<code>classroom.ply</code>)</strong>
            <span style="font-size:10.5px;color:#94a3b8">High-detail 283 MB local Splat Server (:8766) schoolroom</span>
            <div style="display:flex;gap:5px;margin-top:2px">
              <button type="button" class="pfl-std-cbtn" data-pfl-holo-nav="http://127.0.0.1:8766/?file=splats/classroom.ply" style="border-color:#38bdf8;color:#7dd3fc">Step In →</button>
              <a href="http://127.0.0.1:8766/?file=splats/classroom.ply" target="_blank" rel="noopener" class="pfl-std-cbtn" style="text-decoration:none">New Tab ↗</a>
            </div>
          </div>` : ''}
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
  holodeckWin.body.querySelector('#pfl-holodeck-splat-btn')?.addEventListener('click', () => {
    const on = Boolean(window.__pflToggleLegacyPointSplat?.());
    const hb = holodeckWin.body.querySelector('#pfl-holodeck-splat-btn');
    if (hb) {
      hb.textContent = on ? '✨ Yard 3D Point Splat: ON' : '✨ Yard 3D Point Splat: OFF';
      hb.style.borderColor = on ? '#4ade80' : '#22d3ee';
      hb.style.color = on ? '#86efac' : '#67e8f9';
    }
    const tb = document.getElementById('pfl-yard-splat-toggle');
    if (tb) {
      tb.textContent = on ? '✨ Yard 3D Splat: ON' : '✨ Yard 3D Splat: OFF';
      tb.style.borderColor = on ? '#22d3ee' : 'rgba(148,163,184,0.35)';
      tb.style.color = on ? '#67e8f9' : '#94a3b8';
    }
    governorRequestRender('pfl-holodeck-splat-toggle');
  });
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
    stopDroneAutoOrbit();
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
      const radiusM = scaleK * (activeMovable.kind === 'house' ? 8.2 : activeMovable.kind === 'monaco' ? 6.4 : activeMovable.kind === 'dock' ? 4.2 : String(activeMovable.kind || '').startsWith('yardframe:') ? 2.4 : 1.45);
      const badgeLift = scaleK * (activeMovable.kind === 'house' ? 8.6 : activeMovable.kind === 'monaco' ? 4.2 : activeMovable.kind === 'dock' ? 2.2 : String(activeMovable.kind || '').startsWith('yardframe:') ? 2.1 : 2.35);
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
    const baseR = kind === 'house' ? 8.4 : kind === 'monaco' ? 6.6 : kind === 'dock' ? 4.2 : 1.5;
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
    if (!positions) {
      try { viewer.entities.removeById(entityId); } catch {}
      return;
    }
    const existing = viewer.entities.getById(entityId);
    if (existing?.polyline) {
      existing.polyline.positions = positions;
      return;
    }
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
    return Boolean(kind);
  }
  function movableSupportsTilt(mov) {
    const kind = String(mov?.kind || '');
    if (kind.startsWith('yardframe:') || kind === 'stadium-scoreboard') return true;
    const st = mov?.getState?.();
    return Boolean(st && typeof st.tilt === 'number' && Number.isFinite(st.tilt));
  }
  function getMovableScale(mov) {
    const st = mov?.getState?.() || {};
    if (Number(st.scale) > 0) return Number(st.scale);
    return storedScaleFor(String(mov?.kind || ''));
  }
  function getMovableOpacity(mov) {
    const st = mov?.getState?.() || {};
    return Number.isFinite(Number(st.opacity)) ? Math.max(0.05, Math.min(1, Number(st.opacity))) : 1;
  }

  let paintObjMoveBall = () => {};
  function syncObjectSliders(mov) {
    if (!mov) return;
    const st = mov.getState() || {};
    const hdg = (((Math.round(Number(st.heading || 0)) % 360) + 360) % 360);
    const lift = Number(st.lift || 0);
    const canTilt = movableSupportsTilt(mov);
    const tiltDeg = canTilt ? Math.max(-90, Math.min(90, Math.round(Number(st.tilt || 0)))) : 0;
    const hdgSl = compassWin.body.querySelector('#pfl-hdg-slider');
    const hdgVl = compassWin.body.querySelector('#pfl-hdg-val');
    if (hdgSl) hdgSl.value = String(hdg);
    if (hdgVl) hdgVl.textContent = `${hdg}°`;
    const altSl = compassWin.body.querySelector('#pfl-alt-slider');
    const altVl = compassWin.body.querySelector('#pfl-alt-val');
    const liftZeroBtn = compassWin.body.querySelector('#pfl-lift-zero-btn');
    const highLift = Math.abs(lift) > 0.35;
    if (altSl) altSl.value = String(lift);
    if (altVl) {
      altVl.textContent = highLift ? `${lift.toFixed(2)}m ⚠️` : `${lift.toFixed(2)}m`;
      altVl.style.color = highLift ? '#f87171' : '#e2e8f0';
    }
    if (liftZeroBtn) {
      liftZeroBtn.style.borderColor = highLift ? '#ef4444' : '#22c55e';
      liftZeroBtn.style.color = highLift ? '#fca5a5' : '#4ade80';
      liftZeroBtn.style.background = highLift ? 'rgba(239,68,68,0.22)' : '';
    }
    const tiltSl = compassWin.body.querySelector('#pfl-tilt-slider');
    const tiltVl = compassWin.body.querySelector('#pfl-tilt-val');
    if (tiltSl) {
      tiltSl.disabled = !canTilt;
      tiltSl.value = String(tiltDeg);
    }
    if (tiltVl) {
      tiltVl.textContent = canTilt ? `${tiltDeg}°` : 'n/a';
      tiltVl.style.color = canTilt && Math.abs(tiltDeg) >= 5 ? '#fde047' : '#94a3b8';
    }
    compassWin.body.querySelectorAll('[data-pfl-tilt-delta], #pfl-tilt-flat-btn, #pfl-tilt-stand-btn').forEach((b) => {
      b.disabled = !canTilt;
    });

    const scSl = compassWin.body.querySelector('#pfl-scale-slider');
    const scVl = compassWin.body.querySelector('#pfl-scale-val');
    if (scSl && scVl) {
      const k = Math.max(0.25, Math.min(3.5, getMovableScale(mov)));
      scSl.disabled = !movableSupportsScale(mov);
      scSl.value = String(k);
      scVl.textContent = `${k.toFixed(2)}×`;
    }
    const opSl = compassWin.body.querySelector('#pfl-opacity-slider');
    const opVl = compassWin.body.querySelector('#pfl-opacity-val');
    if (opSl && opVl) {
      const op = getMovableOpacity(mov);
      opSl.disabled = false;
      opSl.value = String(op);
      opVl.textContent = op.toFixed(2);
    }
    const selEl = compassWin.body.querySelector('#pfl-sel-name');
    if (selEl) {
      selEl.textContent = `${mov.label} · ${hdg}°`;
      selEl.style.color = '#fde047';
    }
    const orbSelBtn = compassWin.body.querySelector('#pfl-drone-orbit-selected');
    if (orbSelBtn) {
      const shortLbl = String(mov.label || mov.kind).replace(/\s*\(.*?\)\s*/g, '').trim().slice(0, 18);
      orbSelBtn.textContent = `🎯 Orbit ${shortLbl}`;
    }
    paintObjMoveBall();
  }

  function applyActiveObjectPatch(patch) {
    if (!activeMovable) return false;
    const isDragging = typeof window !== 'undefined' && Boolean(window.__pflDraggingMovable);
    if (!isDragging && isGlobalEditAllowed()) {
      try { localStorage.setItem(SCENE_LAYOUT_TS_KEY, String(Date.now())); } catch {}
    }
    activeMovable.update(patch);
    syncObjectSliders(activeMovable);
    syncActiveMovableGizmo();
    if (droneOrbitState.active && (activeMovable.kind === droneOrbitState.targetKey || droneOrbitState.targetKey === 'selected')) {
      applyDroneOrbit();
    }
    if (!isDragging && isGlobalEditAllowed()) scheduleAdminAutoPublish();
    return true;
  }

  function setMovableScale(mov, v) {
    if (!mov) return;
    const scaleK = Math.max(0.25, Math.min(3.5, Math.round((Number(v) || 1) * 20) / 20));
    if (mov === activeMovable) {
      applyActiveObjectPatch({ scale: scaleK });
    } else {
      if (isGlobalEditAllowed()) {
        try { localStorage.setItem(SCENE_LAYOUT_TS_KEY, String(Date.now())); } catch {}
      }
      mov.update({ scale: scaleK });
      syncActiveMovableGizmo();
      if (isGlobalEditAllowed()) scheduleAdminAutoPublish();
    }
  }

  function stepObjectCameraRelative(fwdM, rightM) {
    if (!activeMovable) return;
    const st = activeMovable.getState();
    const hdg = viewer?.camera?.heading || 0;
    const dE = Math.sin(hdg) * fwdM + Math.cos(hdg) * rightM;
    const dN = Math.cos(hdg) * fwdM - Math.sin(hdg) * rightM;
    const newLat = st.lat + dN / 111320;
    const newLon = st.lon + dE / (111320 * Math.cos(Cesium.Math.toRadians(st.lat)));
    applyActiveObjectPatch({ lat: newLat, lon: newLon });
  }

  function stepObjectHeading(deltaDeg) {
    if (!activeMovable) return;
    const st = activeMovable.getState();
    const next = (((Math.round(Number(st.heading || 0) + Number(deltaDeg || 0)) % 360) + 360) % 360);
    applyActiveObjectPatch({ heading: next });
  }

  let selectedInitialPose = null;
  function bindMovable(mov) {
    if (!mov) return;
    if (mov !== activeMovable) {
      try {
        const st = mov.getState?.();
        selectedInitialPose = st ? { ...st } : null;
      } catch {
        selectedInitialPose = null;
      }
    }
    activeMovable = mov;
    syncObjectSliders(mov);
    const bar = compassWin.body.querySelector('#pfl-hotspot-actions');
    if (bar) bar.style.display = 'flex';
    const walkHouseBtn = compassWin.body.querySelector('#pfl-hs-walk-house');
    if (walkHouseBtn) walkHouseBtn.style.display = mov.kind === 'house' ? 'inline-block' : 'none';
    syncActiveMovableGizmo();
  }
  if (typeof window !== 'undefined') window.__pflBindMovable = bindMovable;

  function clearActiveMovableSelection() {
    activeMovable = null;
    selectedInitialPose = null;
    for (const id of [GIZMO_ENTITY_ID, BORDER_ENTITY_ID]) {
      try { viewer.entities.removeById(id); } catch {}
    }
    const bar = compassWin.body.querySelector('#pfl-hotspot-actions');
    if (bar) bar.style.display = 'none';
    const selEl = compassWin.body.querySelector('#pfl-sel-name');
    if (selEl) {
      selEl.textContent = '🗺️ Map (Click any object)';
      selEl.style.color = '#4ade80';
    }
    const orbSelBtn = compassWin.body.querySelector('#pfl-drone-orbit-selected');
    if (orbSelBtn) orbSelBtn.textContent = '🎯 Orbit Selected';
    paintObjMoveBall();
    governorRequestRender('pfl-movable-clear');
  }

  compassWin.body.querySelector('#pfl-reset-selected-btn')?.addEventListener('click', () => {
    if (!activeMovable) return;
    const rawKind = String(activeMovable.kind || '');
    const frameId = rawKind.startsWith('yardframe:') ? rawKind.slice(10) : rawKind;
    const SURVEY_DEFAULTS = {
      house: { ...HOUSE_DEFAULT_POSE },
      monaco: { ...MONACO_DEFAULT_POSE },
      dock: { ...DOCK_DEFAULT_POSE },
      lisa: { lat: 29.247436, lon: -95.231445, heading: 192, lift: 0, scale: 1, opacity: 1 },
      chair: { lat: 29.247434, lon: -95.231426, heading: 192, lift: 0, scale: 1, opacity: 1 },
    };
    const surveyFallback = rawKind.startsWith('yardframe:')
      ? (window.__pflYardFrameSurveyDefault?.(frameId) || selectedInitialPose)
      : (SURVEY_DEFAULTS[rawKind] || selectedInitialPose);
    const savedAnchor = lastSavedObjectPoses.get(frameId) || lastSavedObjectPoses.get(rawKind) || selectedInitialPose;
    const cur = activeMovable.getState?.() || {};
    const differsFrom = (ref) =>
      Boolean(
        ref &&
          (Math.abs((cur.lat || 0) - (ref.lat || 0)) > 1e-7 ||
            Math.abs((cur.lon || 0) - (ref.lon || 0)) > 1e-7 ||
            Math.abs((cur.heading || 0) - (ref.heading || 0)) > 0.5 ||
            Math.abs(Number(cur.tilt || 0) - Number(ref.tilt || 0)) > 0.5 ||
            Math.abs((cur.lift || 0) - (ref.lift || 0)) > 0.01 ||
            Math.abs((cur.scale || 1) - (ref.scale || 1)) > 0.01 ||
            Math.abs((cur.opacity ?? 1) - (ref.opacity ?? 1)) > 0.01),
      );
    const targetPose = differsFrom(savedAnchor) ? savedAnchor : (surveyFallback || savedAnchor);
    if (targetPose) applyActiveObjectPatch(targetPose);
  });

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
    placeBtn.textContent = clickToPlaceMode ? '🎯 Click Ground!' : '✋ Drop';
    placeBtn.style.borderColor = clickToPlaceMode ? '#facc15' : '';
  });

  const DRAG_SPEED_PRESETS = [
    { mult: 0.30, label: '🐢 0.30×' },
    { mult: 0.55, label: '🚶 0.55×' },
    { mult: 1.0, label: '🐇 1.0×' },
  ];
  const NUDGE_STEP_PRESETS = [0.1, 0.25, 1.0];

  const dragSpeedBtn = compassWin.body.querySelector('#pfl-drag-speed-btn');
  dragSpeedBtn?.addEventListener('click', () => {
    dragSpeedIdx = (dragSpeedIdx + 1) % DRAG_SPEED_PRESETS.length;
    const p = DRAG_SPEED_PRESETS[dragSpeedIdx];
    dragSpeedBtn.textContent = p.label;
    dragSpeedBtn.style.borderColor = dragSpeedIdx === 0 ? '#38bdf8' : dragSpeedIdx === 1 ? '#facc15' : '#f43f5e';
    dragSpeedBtn.style.color = dragSpeedIdx === 0 ? '#7dd3fc' : dragSpeedIdx === 1 ? '#fde047' : '#fda4af';
  });

  const nudgeStepBtn = compassWin.body.querySelector('#pfl-nudge-step-btn');
  nudgeStepBtn?.addEventListener('click', () => {
    nudgeStepIdx = (nudgeStepIdx + 1) % NUDGE_STEP_PRESETS.length;
    const v = NUDGE_STEP_PRESETS[nudgeStepIdx];
    nudgeStepBtn.textContent = `📏 ${v < 1 ? String(v).replace(/^0/, '') : v}m`;
  });

  // Bird Pond 3D Object Move, 0–360° Spin Ring, Live 3D Quad Preview & Tilt Handle (<canvas id="pfl-obj-move-ball">)
  const objBallCanvas = compassWin.body.querySelector('#pfl-obj-move-ball');
  const objBallCtx = objBallCanvas?.getContext?.('2d');
  let objBallMode = null; // null | 'xy' | 'spin' | 'tilt'
  let objBallDragOffset = { x: 0, y: 0 };
  let objTiltKnobPos = { x: 94, y: 64 };

  paintObjMoveBall = () => {
    if (!objBallCtx) return;
    const W = 128, H = 128, cx = 64, cy = 64, ringR = 50, puckMaxR = 20;
    objBallCtx.clearRect(0, 0, W, H);
    const grad = objBallCtx.createRadialGradient(cx - 10, cy - 10, 4, cx, cy, ringR + 10);
    grad.addColorStop(0, 'rgba(30, 41, 59, 0.96)');
    grad.addColorStop(1, 'rgba(9, 14, 26, 0.98)');
    objBallCtx.fillStyle = grad;
    objBallCtx.beginPath();
    objBallCtx.arc(cx, cy, ringR + 10, 0, Math.PI * 2);
    objBallCtx.fill();

    // Outer cyan 0°–360° spin ring
    objBallCtx.strokeStyle = activeMovable ? 'rgba(56, 189, 248, 0.85)' : 'rgba(148, 163, 184, 0.35)';
    objBallCtx.lineWidth = 5;
    objBallCtx.beginPath();
    objBallCtx.arc(cx, cy, ringR, 0, Math.PI * 2);
    objBallCtx.stroke();

    for (let deg = 0; deg < 360; deg += 30) {
      const a = ((deg - 90) * Math.PI) / 180;
      const inner = deg % 90 === 0 ? ringR - 7 : ringR - 4;
      objBallCtx.strokeStyle = deg % 90 === 0 ? '#fde047' : 'rgba(148,163,184,0.5)';
      objBallCtx.lineWidth = deg % 90 === 0 ? 2 : 1;
      objBallCtx.beginPath();
      objBallCtx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      objBallCtx.lineTo(cx + Math.cos(a) * (ringR + 3), cy + Math.sin(a) * (ringR + 3));
      objBallCtx.stroke();
    }

    // Inner XY crosshair well
    objBallCtx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    objBallCtx.lineWidth = 1;
    objBallCtx.beginPath();
    objBallCtx.arc(cx, cy, 34, 0, Math.PI * 2);
    objBallCtx.moveTo(cx - 26, cy);
    objBallCtx.lineTo(cx + 26, cy);
    objBallCtx.moveTo(cx, cy - 26);
    objBallCtx.lineTo(cx, cy + 26);
    objBallCtx.stroke();

    const st = activeMovable?.getState?.() || {};
    const hdgDeg = Number(st.heading || 0);
    const canTilt = movableSupportsTilt(activeMovable);
    const tiltDeg = canTilt ? Math.max(-90, Math.min(90, Number(st.tilt || 0))) : 0;
    const hRad = ((hdgDeg - 90) * Math.PI) / 180;
    const kx = cx + Math.cos(hRad) * ringR;
    const ky = cy + Math.sin(hRad) * ringR;

    // Live 3D object orientation preview plane (rotated by object heading + tilt, viewed from Cesium camera)
    if (activeMovable && viewer?.camera) {
      const camH = viewer.camera.heading || 0;
      const camP = viewer.camera.pitch || 0;
      const ch = Math.cos(camH), sh = Math.sin(camH);
      const cp = Math.cos(camP), sp = Math.sin(camP);
      const objH = (hdgDeg * Math.PI) / 180;
      const objT = (tiltDeg * Math.PI) / 180;
      const proj = (e, n, u) => {
        const rx = e * ch + n * sh;
        const rz = -e * sh + n * ch;
        const ry = u * cp - rz * sp;
        return [cx + rx * 23, cy - ry * 23];
      };
      const rE = Math.cos(objH), rN = -Math.sin(objH);
      const uE = Math.sin(objH) * Math.cos(objT), uN = Math.cos(objH) * Math.cos(objT), uZ = Math.sin(objT);
      const corners = [
        proj(-rE - uE, -rN - uN, -uZ),
        proj(rE - uE, rN - uN, -uZ),
        proj(rE + uE, rN + uN, uZ),
        proj(-rE + uE, -rN + uN, uZ),
      ];
      objBallCtx.fillStyle = 'rgba(250, 204, 21, 0.16)';
      objBallCtx.strokeStyle = 'rgba(250, 204, 21, 0.65)';
      objBallCtx.lineWidth = 1.4;
      objBallCtx.beginPath();
      objBallCtx.moveTo(corners[0][0], corners[0][1]);
      for (let i = 1; i < 4; i++) objBallCtx.lineTo(corners[i][0], corners[i][1]);
      objBallCtx.closePath();
      objBallCtx.fill();
      objBallCtx.stroke();
      // Bright amber top/headboard edge + up normal arrow
      objBallCtx.strokeStyle = '#f59e0b';
      objBallCtx.lineWidth = 2.6;
      objBallCtx.beginPath();
      objBallCtx.moveTo(corners[2][0], corners[2][1]);
      objBallCtx.lineTo(corners[3][0], corners[3][1]);
      objBallCtx.stroke();
      const topMid = proj(uE * 1.15, uN * 1.15, uZ * 1.15);
      objBallCtx.strokeStyle = '#4ade80';
      objBallCtx.lineWidth = 1.6;
      objBallCtx.beginPath();
      objBallCtx.moveTo(cx, cy);
      objBallCtx.lineTo(topMid[0], topMid[1]);
      objBallCtx.stroke();
    }

    // Heading spoke & cyan ring knob
    objBallCtx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    objBallCtx.lineWidth = 1.5;
    objBallCtx.beginPath();
    objBallCtx.moveTo(cx, cy);
    objBallCtx.lineTo(kx, ky);
    objBallCtx.stroke();

    objBallCtx.fillStyle = activeMovable ? '#38bdf8' : '#64748b';
    objBallCtx.beginPath();
    objBallCtx.arc(kx, ky, 6.2, 0, Math.PI * 2);
    objBallCtx.fill();
    objBallCtx.strokeStyle = '#0f172a';
    objBallCtx.lineWidth = 1.5;
    objBallCtx.stroke();

    // Right meridian 3D Tilt arc & draggable Gold Handle (-90°..+90°)
    const arcR = 32;
    objBallCtx.strokeStyle = canTilt ? 'rgba(251, 191, 36, 0.55)' : 'rgba(100, 116, 139, 0.25)';
    objBallCtx.lineWidth = 2.4;
    objBallCtx.beginPath();
    objBallCtx.arc(cx, cy, arcR, -Math.PI * 0.46, Math.PI * 0.46);
    objBallCtx.stroke();
    const tiltRad = (tiltDeg * Math.PI) / 180;
    const tx = cx + Math.cos(tiltRad) * arcR;
    const ty = cy - Math.sin(tiltRad) * arcR;
    objTiltKnobPos = { x: tx, y: ty };

    objBallCtx.fillStyle = objBallMode === 'tilt' ? '#fef08a' : canTilt ? '#f59e0b' : '#475569';
    objBallCtx.beginPath();
    objBallCtx.arc(tx, ty, 7.2, 0, Math.PI * 2);
    objBallCtx.fill();
    objBallCtx.strokeStyle = '#0f172a';
    objBallCtx.lineWidth = 1.5;
    objBallCtx.stroke();
    objBallCtx.fillStyle = '#0f172a';
    objBallCtx.font = '800 7.5px "JetBrains Mono", monospace';
    objBallCtx.textAlign = 'center';
    objBallCtx.textBaseline = 'middle';
    objBallCtx.fillText(canTilt ? 'T' : '·', tx, ty + 0.5);

    // Inner XY drag puck
    const px = cx + Math.max(-puckMaxR, Math.min(puckMaxR, objBallDragOffset.x));
    const py = cy + Math.max(-puckMaxR, Math.min(puckMaxR, objBallDragOffset.y));
    objBallCtx.fillStyle = objBallMode === 'xy' ? '#facc15' : activeMovable ? '#fbbf24' : '#475569';
    objBallCtx.beginPath();
    objBallCtx.arc(px, py, 10.5, 0, Math.PI * 2);
    objBallCtx.fill();
    objBallCtx.strokeStyle = '#0f172a';
    objBallCtx.lineWidth = 1.5;
    objBallCtx.stroke();

    objBallCtx.fillStyle = '#0f172a';
    objBallCtx.font = '800 8.5px "JetBrains Mono", monospace';
    objBallCtx.textAlign = 'center';
    objBallCtx.textBaseline = 'middle';
    objBallCtx.fillText(activeMovable ? `${Math.round(((hdgDeg % 360) + 360) % 360)}°` : 'NONE', px, py);
  };
  paintObjMoveBall();

  let objBallPtr = null;
  if (objBallCanvas) {
    const toObjBallCoords = (e) => {
      const r = objBallCanvas.getBoundingClientRect();
      return {
        mx: ((e.clientX - r.left) * 128) / Math.max(1, r.width),
        my: ((e.clientY - r.top) * 128) / Math.max(1, r.height),
      };
    };
    objBallCanvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !activeMovable) return;
      const { mx, my } = toObjBallCoords(e);
      const dx = mx - 64;
      const dy = my - 64;
      const dist = Math.hypot(dx, dy);
      const tiltKnobDist = Math.hypot(mx - objTiltKnobPos.x, my - objTiltKnobPos.y);
      const canTilt = movableSupportsTilt(activeMovable);
      const startAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      const stNow = activeMovable.getState?.() || {};
      const startHeading = Number(stNow.heading || 0);
      const startTilt = Number(stNow.tilt || 0);
      if (canTilt && (tiltKnobDist <= 13 || e.shiftKey)) {
        objBallMode = 'tilt';
      } else if (dist >= 39) {
        objBallMode = 'spin';
      } else {
        objBallMode = 'xy';
      }
      objBallPtr = { id: e.pointerId, lastX: mx, lastY: my, startY: my, startAngleDeg, startHeading, startTilt };
      objBallCanvas.style.cursor = 'grabbing';
      try { objBallCanvas.setPointerCapture(e.pointerId); } catch {}
      holdContinuousRender('pfl-obj-ball');
    });
    objBallCanvas.addEventListener('pointermove', (e) => {
      if (!objBallPtr || e.pointerId !== objBallPtr.id || !activeMovable) return;
      const { mx, my } = toObjBallCoords(e);
      if (objBallMode === 'tilt') {
        const nextTilt = Math.max(-90, Math.min(90, Math.round(objBallPtr.startTilt + (objBallPtr.startY - my) * 1.9)));
        applyActiveObjectPatch({ tilt: nextTilt });
      } else if (objBallMode === 'spin') {
        const curAngleDeg = (Math.atan2(my - 64, mx - 64) * 180) / Math.PI;
        const deltaDeg = ((curAngleDeg - objBallPtr.startAngleDeg + 540) % 360) - 180;
        applyActiveObjectPatch({
          heading: Math.round(((objBallPtr.startHeading + deltaDeg) % 360 + 360) % 360),
        });
      } else if (objBallMode === 'xy') {
        const ddx = mx - objBallPtr.lastX;
        const ddy = my - objBallPtr.lastY;
        objBallPtr.lastX = mx;
        objBallPtr.lastY = my;
        objBallDragOffset = { x: mx - 64, y: my - 64 };
        const stepM = NUDGE_STEP_PRESETS[nudgeStepIdx] || 0.25;
        const mPerPx = Math.max(0.03, stepM * 0.22);
        stepObjectCameraRelative(-ddy * mPerPx, ddx * mPerPx);
      }
    });
    const endObjBallDrag = (e) => {
      if (!objBallPtr || (e && e.pointerId !== undefined && e.pointerId !== objBallPtr.id)) return;
      objBallPtr = null;
      objBallMode = null;
      objBallDragOffset = { x: 0, y: 0 };
      objBallCanvas.style.cursor = 'grab';
      paintObjMoveBall();
      releaseContinuousRender('pfl-obj-ball');
    };
    objBallCanvas.addEventListener('pointerup', endObjBallDrag);
    objBallCanvas.addEventListener('pointercancel', endObjBallDrag);
  }

  function wrapBirdpondWallMovable(ent) {
    if (ent._pflWallMov) return ent._pflWallMov;
    const st = ent._pflWallMeta || { lat: 29.139116, lon: -95.804794, width: 13.93, height: 9.23, heading: 107, baseAlt: -17.5, lift: 0, scale: 1, opacity: 1 };
    ent._pflWallMeta = st;
    const baseW = Number(st.baseWidth || st.width || 13.93);
    const baseH = Number(st.baseHeight || st.height || 9.23);
    st.baseWidth = baseW;
    st.baseHeight = baseH;
    ent._pflWallMov = {
      kind: ent.id,
      label: ent.name || ent.id,
      getState: () => ({ lat: st.lat, lon: st.lon, heading: st.heading, lift: st.lift || 0, scale: st.scale || 1, opacity: st.opacity ?? 1 }),
      update: (patch) => {
        Object.assign(st, patch);
        const sc = Math.max(0.25, Math.min(3.5, Number(st.scale || 1)));
        const op = Math.max(0.05, Math.min(1, Number(st.opacity ?? 1)));
        const halfW = baseW * sc * 0.5;
        const rad = (st.heading * Math.PI) / 180.0;
        const dN = Math.cos(rad) * halfW;
        const dE = Math.sin(rad) * halfW;
        const mLat = 111320.0;
        const mLon = 111320.0 * Math.cos((st.lat * Math.PI) / 180.0);
        const bAlt = (st.baseAlt ?? -17.5) + (st.lift || 0);
        const tAlt = bAlt + baseH * sc;
        ent.wall.positions = Cesium.Cartesian3.fromDegreesArrayHeights([
          st.lon - dE / mLon, st.lat - dN / mLat, tAlt,
          st.lon + dE / mLon, st.lat + dN / mLat, tAlt,
        ]);
        ent.wall.minimumHeights = [bAlt, bAlt];
        if (ent.wall.material) {
          try { ent.wall.material.color = Cesium.Color.WHITE.withAlpha(op); } catch {}
        }
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
      if (eid.startsWith('pfl-neo4j-')) {
        return null;
      }
      if (eid === GIZMO_ENTITY_ID && activeMovable) {
        return { type: 'movable', mov: activeMovable, viaGizmo: true };
      }
      if (eid === 'yardframe:yard-overview-20261012') continue;
      if (eid.startsWith('pfl-s788-') || eid.startsWith('pfl-oak-')) continue;
      if (eid === 'pfl-holodeck-portal-1s788') {
        return { type: 'portal' };
      }
      if (ent?._pfl360Item) {
        return { type: 'sphere360', item: ent._pfl360Item };
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
    // Analytic ray-plane fallback for translucent / Google-3D-overlapped portal & dock targets
    const ray = viewer?.camera?.getPickRay?.(screenPos);
    const hitLocalPlaneEnu = (lon, lat, altM) => {
      if (!ray || !Number.isFinite(lon) || !Number.isFinite(lat)) return null;
      const originCart = Cesium.Cartesian3.fromDegrees(lon, lat, altM);
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(originCart);
      const invEnu = Cesium.Matrix4.inverseTransformation(enu, new Cesium.Matrix4());
      const ro = Cesium.Matrix4.multiplyByPoint(invEnu, ray.origin, new Cesium.Cartesian3());
      const rd = Cesium.Matrix4.multiplyByPointAsVector(invEnu, ray.direction, new Cesium.Cartesian3());
      if (Math.abs(rd.z) <= 1e-4) return null;
      const tHit = -ro.z / rd.z;
      return tHit > 0 && tHit < 220 ? { ex: ro.x + rd.x * tHit, ey: ro.y + rd.y * tHit } : null;
    };
    if (ray) {
      try {
        const portalEnt = viewer.entities.getById('pfl-holodeck-portal-1s788');
        const pCart = portalEnt?.position?.getValue?.(Cesium.JulianDate.now());
        if (pCart) {
          const pcg = Cesium.Cartographic.fromCartesian(pCart);
          const pHit = hitLocalPlaneEnu(Cesium.Math.toDegrees(pcg.longitude), Cesium.Math.toDegrees(pcg.latitude), pcg.height - 0.9);
          if (pHit && Math.hypot(pHit.ex, pHit.ey) <= 1.35) return { type: 'portal' };
        }
        const dockMov = window.__pflMovables?.dock;
        const ds = dockMov?.getState?.();
        if (ds && Number.isFinite(ds.lat) && Number.isFinite(ds.lon)) {
          const dSc = Math.max(0.25, Math.min(3.5, Number(ds.scale) || 1));
          const dG = resolveLocalGroundM(ds.lon, ds.lat) + Number(ds.lift || 0) + 0.35 * dSc;
          const dHit = hitLocalPlaneEnu(ds.lon, ds.lat, dG);
          if (dHit) {
            const rad = Cesium.Math.toRadians(ds.heading || 0);
            const lx = dHit.ex * Math.cos(rad) - dHit.ey * Math.sin(rad);
            const ly = dHit.ex * Math.sin(rad) + dHit.ey * Math.cos(rad);
            if (Math.abs(lx) <= 2.3 * dSc && Math.abs(ly) <= 3.5 * dSc) {
              return { type: 'movable', mov: dockMov };
            }
          }
        }
      } catch {}
    }
    return null;
  }

  let dragMovableSession = null;
  let lastDragReleaseMs = 0;
  let dragRafId = 0;
  let pendingDragEndPos = null;

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
    if (dragRafId) {
      cancelAnimationFrame(dragRafId);
      dragRafId = 0;
    }
    pendingDragEndPos = null;
    if (!dragMovableSession) return;
    const wasMoved = dragMovableSession.moved;
    dragMovableSession = null;
    if (typeof window !== 'undefined') {
      window.__pflDraggingMovable = false;
      try { window.__pflFlushYardFramesLayout?.(); } catch {}
    }
    releaseContinuousRender('pfl-drag-movable');
    if (wasMoved) {
      lastDragReleaseMs = Date.now();
      if (isGlobalEditAllowed()) {
        try { localStorage.setItem(SCENE_LAYOUT_TS_KEY, String(Date.now())); } catch {}
        scheduleAdminAutoPublish();
      }
    }
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
    if (houseDragLocked && hit.mov.kind === 'house') return;
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
    if (typeof window !== 'undefined') window.__pflDraggingMovable = true;
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

  // ---- Anti-Space-Ejection clamp & Low-Altitude Flat ENU Pan (prevents Cesium look3D/rotate3D spin near houses/Google 3D) ----
  const canvasEl = viewer.scene.canvas;
  let panDragSession = null;

  function endPanDragSession() {
    if (!panDragSession) return;
    const wasMoved = panDragSession.moved;
    panDragSession = null;
    try {
      const ctrl = viewer?.scene?.screenSpaceCameraController;
      if (ctrl && !dragMovableSession) {
        ctrl.enableRotate = true;
        ctrl.enableTilt = true;
      }
      releaseContinuousRender('pfl-flat-pan');
    } catch {}
    if (wasMoved) {
      lastDragReleaseMs = Date.now();
      governorRequestRender('pfl-flat-pan-end');
    }
  }

  function applyFlatHorizontalPan(dx, dy, aglM) {
    try {
      const cam = viewer?.camera;
      if (!cam || !cam.positionWC) return;
      const ellipsoid = viewer.scene?.globe?.ellipsoid || Cesium.Ellipsoid.WGS84;
      const up = ellipsoid.geodeticSurfaceNormal(cam.positionWC, new Cesium.Cartesian3());
      const projectHoriz = (vec, out) => {
        const dot = Cesium.Cartesian3.dot(vec, up);
        const scaled = Cesium.Cartesian3.multiplyByScalar(up, dot, new Cesium.Cartesian3());
        Cesium.Cartesian3.subtract(vec, scaled, out);
        const mag = Cesium.Cartesian3.magnitude(out);
        if (mag > 1e-4) Cesium.Cartesian3.multiplyByScalar(out, 1 / mag, out);
        return mag > 1e-4;
      };
      const eastRightH = new Cesium.Cartesian3();
      const fwdH = new Cesium.Cartesian3();
      if (!projectHoriz(cam.rightWC, eastRightH)) return;
      if (!projectHoriz(cam.directionWC, fwdH)) {
        Cesium.Cartesian3.cross(up, eastRightH, fwdH);
        Cesium.Cartesian3.normalize(fwdH, fwdH);
      }
      const fovy = Number(cam.frustum?.fovy) || Cesium.Math.toRadians(45);
      const canvasH = Math.max(240, canvasEl.clientHeight || 720);
      const scaleDist = Math.max(8, Math.min(1800, Math.abs(aglM)));
      const metersPerPx = Math.max(0.04, Math.min(18, (2 * scaleDist * Math.tan(fovy * 0.5)) / canvasH));
      const moveR = Cesium.Cartesian3.multiplyByScalar(eastRightH, -dx * metersPerPx, new Cesium.Cartesian3());
      const moveF = Cesium.Cartesian3.multiplyByScalar(fwdH, dy * metersPerPx * 1.15, new Cesium.Cartesian3());
      const delta = Cesium.Cartesian3.add(moveR, moveF, new Cesium.Cartesian3());
      const nextPos = Cesium.Cartesian3.add(cam.positionWC, delta, new Cesium.Cartesian3());
      cam.setView({
        destination: nextPos,
        orientation: { heading: cam.heading, pitch: cam.pitch, roll: 0 },
      });
    } catch {}
  }

  const onPtrDown = (e) => {
    activeMouseButtonsMask = typeof e?.buttons === 'number' ? e.buttons : 0;
    if (e?.button === 2 || (activeMouseButtonsMask & 2)) {
      rightButtonDown = true;
      lastZoomActivityMs = Date.now();
      endPanDragSession();
      return;
    }
    if (e?.button === 0 || e?.button === 1) {
      leftOrMiddleButtonsDown += 1;
    }
    if (
      panDragMode &&
      e?.button === 0 &&
      !e.ctrlKey &&
      !e.shiftKey &&
      !e.altKey &&
      !clickToPlaceMode &&
      !droneOrbitState.active &&
      !dragMovableSession
    ) {
      try {
        const c = viewer?.camera?.positionCartographic;
        if (c) {
          const lat = Cesium.Math.toDegrees(c.latitude);
          const lon = Cesium.Math.toDegrees(c.longitude);
          const agl = c.height - resolveLocalGroundM(lon, lat);
          if (agl < 1800) {
            const rect = canvasEl.getBoundingClientRect();
            const localPos = new Cesium.Cartesian2(e.clientX - rect.left, e.clientY - rect.top);
            const hit = drillFindTarget(localPos);
            const isInteractiveObj = hit && (
              hit.type === 'portal' ||
              hit.type === 'mls-room' ||
              (hit.type === 'movable' && !(houseDragLocked && hit.mov?.kind === 'house'))
            );
            if (!isInteractiveObj) {
              panDragSession = {
                id: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                lastX: e.clientX,
                lastY: e.clientY,
                moved: false,
                agl: Math.max(8, agl),
              };
              const ctrl = viewer?.scene?.screenSpaceCameraController;
              if (ctrl) {
                ctrl.enableRotate = false;
                ctrl.enableTilt = false;
              }
            }
          }
        }
      } catch {}
    }
  };
  const onPtrMove = (e) => {
    if (typeof e?.buttons === 'number') {
      activeMouseButtonsMask = e.buttons;
      if (e.buttons & 2) {
        rightButtonDown = true;
        lastZoomActivityMs = Date.now();
      } else if (rightButtonDown) {
        rightButtonDown = false;
        lastZoomActivityMs = Date.now();
      }
    }
    if (panDragSession && (e.pointerId === panDragSession.id || panDragSession.id === undefined)) {
      if (typeof e?.buttons === 'number' && !(e.buttons & 1)) {
        endPanDragSession();
        return;
      }
      const total = Math.hypot(e.clientX - panDragSession.startX, e.clientY - panDragSession.startY);
      if (!panDragSession.moved && total < 4) return;
      if (!panDragSession.moved) {
        panDragSession.moved = true;
        holdContinuousRender('pfl-flat-pan');
      }
      const dx = e.clientX - panDragSession.lastX;
      const dy = e.clientY - panDragSession.lastY;
      panDragSession.lastX = e.clientX;
      panDragSession.lastY = e.clientY;
      if (dx || dy) {
        applyFlatHorizontalPan(dx, dy, panDragSession.agl);
        governorRequestRender('pfl-flat-pan');
      }
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
    if (panDragSession && (e?.button === 0 || activeMouseButtonsMask === 0 || e?.type === 'pointercancel' || e?.type === 'blur')) {
      endPanDragSession();
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
  window.addEventListener('blur', onPtrUp);
  canvasEl.addEventListener('wheel', onWheelZoomTrack, { capture: true, passive: true });
  canvasEl.addEventListener('touchstart', onTouchZoomTrack, { capture: true, passive: true });
  canvasEl.addEventListener('touchmove', onTouchZoomTrack, { capture: true, passive: true });

  let ejectGuard = { t: 0, h: null, agl: null };
  function antiEjectionTick() {
    try {
      const c = viewer?.camera?.positionCartographic;
      if (!c) return;
      const now = Date.now();
      const lat = Cesium.Math.toDegrees(c.latitude);
      const lon = Cesium.Math.toDegrees(c.longitude);
      const nearYard =
        Math.hypot(lat - 29.24755, lon - -95.23140) < 0.02 ||
        Math.hypot(lat - 29.13910, lon - -95.80480) < 0.02;
      if (nearYard) {
        enforceZeroAltitudeKickGuard();
        if (viewer?.camera?.frustum && 'near' in viewer.camera.frustum && c.height < 140) {
          viewer.camera.frustum.near = 0.08;
        }
        const isFlying = cameraFlightActive(viewer?.camera);
        const isShareRestoring = Boolean(
          typeof window !== 'undefined' && window.__pflShareRestoreActive,
        );
        const nearLiverpool = Math.hypot(lat - 29.24755, lon - -95.23140) < 0.02;
        const rawGround = resolveLocalGroundM(lon, lat);
        const safeGround =
          nearLiverpool && isFlatEllipsoidGlobe(viewer)
            ? Math.min(rawGround, STORED_GROUND_HEIGHT_M)
            : rawGround;
        const floorH = safeGround + 0.85;
        if (!droneOrbitState.active && !isFlying && !isShareRestoring && c.height < floorH) {
          viewer.camera.setView({
            destination: Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, floorH),
            orientation: { heading: viewer.camera.heading, pitch: viewer.camera.pitch, roll: 0 },
          });
          governorRequestRender('pfl-ground-floor');
          return;
        }
      }
      if (!lastSafeYardPose) return;
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
    pendingDragEndPos = { x: moveEv.endPosition.x, y: moveEv.endPosition.y };
    if (dragRafId) return;
    dragRafId = requestAnimationFrame(() => {
      dragRafId = 0;
      const sess = dragMovableSession;
      const pos = pendingDragEndPos;
      if (!sess || !pos) return;
      const dx = pos.x - sess.startX;
      const dy = pos.y - sess.startY;
      if (!sess.moved && Math.hypot(dx, dy) < 4) return;
      sess.moved = true;
      try {
        let deltaX = 0;
        let deltaY = 0;
        const dragMult = dragShiftHeld ? 0.10 : (DRAG_SPEED_PRESETS[dragSpeedIdx]?.mult ?? 0.30);
        if (sess.useRayDelta) {
          const curHit = computeDampedEnuRayPoint(pos, sess.invEnu);
          if (!curHit) return;
          deltaX = (curHit.x - sess.grabLocalX) * dragMult;
          deltaY = (curHit.y - sess.grabLocalY) * dragMult;
        } else {
          const rightM = dx * sess.metersPerPx * dragMult;
          const fwdM = -dy * sess.metersPerPx * dragMult;
          deltaX = sess.camRightX * rightM + sess.camFwdX * fwdM;
          deltaY = sess.camRightY * rightM + sess.camFwdY * fwdM;
        }
        const distMove = Math.hypot(deltaX, deltaY);
        if (distMove > 25) {
          const clampScale = 25 / distMove;
          deltaX *= clampScale;
          deltaY *= clampScale;
        }
        const hitLocal = new Cesium.Cartesian3(deltaX, deltaY, 0);
        const hitWorld = Cesium.Matrix4.multiplyByPoint(sess.enu, hitLocal, new Cesium.Cartesian3());
        const cg = Cesium.Cartographic.fromCartesian(hitWorld);
        sess.mov.update({
          lat: Cesium.Math.toDegrees(cg.latitude),
          lon: Cesium.Math.toDegrees(cg.longitude),
        });
        syncActiveMovableGizmo();
        if (droneOrbitState.active && sess.mov.kind === droneOrbitState.targetKey) {
          applyDroneOrbit();
        }
      } catch {}
    });
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  pickHandler.setInputAction(() => {
    endLookDrag();
    endDragMovableSession();
  }, Cesium.ScreenSpaceEventType.LEFT_UP);

  pickHandler.setInputAction((movement) => {
    if (Date.now() - lastDragReleaseMs < 260) return;
    if (clickToPlaceMode && activeMovable && !(houseDragLocked && activeMovable.kind === 'house')) {
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
        applyActiveObjectPatch({
          lat: Cesium.Math.toDegrees(cg.latitude),
          lon: Cesium.Math.toDegrees(cg.longitude),
        });
        clickToPlaceMode = false;
        if (placeBtn) {
          placeBtn.textContent = '✋ Drop';
          placeBtn.style.borderColor = '';
        }
        return;
      }
    }

    try {
      const pinPicks = viewer.scene.drillPick(movement.position, 8) || [];
      for (const pk of pinPicks) {
        const pinId = pk?.id?._pflNavPinId || (typeof pk?.id?.id === 'string' && pk.id.id.startsWith(NAV_PIN_ENTITY_PREFIX) ? pk.id.id.slice(NAV_PIN_ENTITY_PREFIX.length) : null);
        if (pinId) {
          const pin = navPins.find((p) => p.id === pinId);
          if (pin) {
            flyToNavPin(pin, 140);
            return;
          }
        }
      }
    } catch {}

    const hit = drillFindTarget(movement.position);
    if (!hit) {
      let pickedNeo4j = false;
      try {
        const np = viewer.scene.drillPick(movement.position, 10) || [];
        pickedNeo4j = np.some((p) => String(p?.id?.id || '').startsWith('pfl-neo4j-'));
      } catch {}
      if (!pickedNeo4j && activeMovable) clearActiveMovableSelection();
      return;
    }
    if (hit.type === 'portal') {
      openHolodeckHallway();
      return;
    }
    if (hit.type === 'sphere360' && hit.item) {
      open360ViewerModal(hit.item);
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

  window.addEventListener('pfl:neo4j-selected', (ev) => {
    const d = ev?.detail;
    const selEl = compassWin.body.querySelector('#pfl-sel-name');
    if (!selEl) return;
    if (d && d.label) {
      if (activeMovable) clearActiveMovableSelection();
      selEl.textContent = `🕸️ ${d.label} (${d.type || 'Neo4j'})`;
      selEl.style.color = '#7dd3fc';
    } else if (!activeMovable) {
      selEl.textContent = '🗺️ Map (Click any object)';
      selEl.style.color = '#4ade80';
    }
  });

  compassWin.body.querySelector('#pfl-hdg-slider')?.addEventListener('input', (e) => {
    applyActiveObjectPatch({ heading: Number(e.target.value) });
  });

  const applyActiveLift = (nextLift) => {
    if (!activeMovable) return;
    const clamped = Math.max(-35, Math.min(35, Math.round(Number(nextLift || 0) * 20) / 20));
    applyActiveObjectPatch({ lift: clamped });
  };

  compassWin.body.querySelector('#pfl-alt-slider')?.addEventListener('input', (e) => {
    applyActiveLift(Number(e.target.value));
  });
  compassWin.body.querySelector('#pfl-lift-zero-btn')?.addEventListener('click', () => {
    applyActiveLift(0);
  });

  const applyActiveTilt = (nextTilt) => {
    if (!activeMovable || !movableSupportsTilt(activeMovable)) return;
    const clamped = Math.max(-90, Math.min(90, Math.round(Number(nextTilt || 0))));
    applyActiveObjectPatch({ tilt: clamped });
  };
  compassWin.body.querySelector('#pfl-tilt-slider')?.addEventListener('input', (e) => {
    applyActiveTilt(Number(e.target.value));
  });
  compassWin.body.querySelectorAll('[data-pfl-tilt-delta]').forEach((btn) => {
    const delta = Number(btn.getAttribute('data-pfl-tilt-delta') || 0);
    attachPadRepeat(btn, () => {
      if (!activeMovable || !movableSupportsTilt(activeMovable)) return;
      const cur = Number(activeMovable.getState()?.tilt || 0);
      applyActiveTilt(cur + delta);
    });
  });
  compassWin.body.querySelector('#pfl-tilt-flat-btn')?.addEventListener('click', () => {
    applyActiveTilt(0);
  });
  compassWin.body.querySelector('#pfl-tilt-stand-btn')?.addEventListener('click', () => {
    applyActiveTilt(75);
  });

  compassWin.body.querySelector('#pfl-scale-slider')?.addEventListener('input', (e) => {
    if (!activeMovable || !movableSupportsScale(activeMovable)) return;
    setMovableScale(activeMovable, Number(e.target.value));
  });
  compassWin.body.querySelectorAll('[data-pfl-scale-delta]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!activeMovable) return;
      const next = getMovableScale(activeMovable) + Number(btn.getAttribute('data-pfl-scale-delta') || 0);
      setMovableScale(activeMovable, next);
    });
  });

  compassWin.body.querySelector('#pfl-opacity-slider')?.addEventListener('input', (e) => {
    if (!activeMovable) return;
    const op = Math.max(0.05, Math.min(1, Number(e.target.value) || 1));
    applyActiveObjectPatch({ opacity: op });
  });

  const orbitKeyForMovable = (mov) => {
    const k = String(mov?.kind || '');
    return ['lisa', 'chair', 'house', 'monaco'].includes(k) ? k : 'selected';
  };
  compassWin.body.querySelector('#pfl-hs-orbit')?.addEventListener('click', () => {
    if (activeMovable) startDroneOrbit(orbitKeyForMovable(activeMovable));
  });
  compassWin.body.querySelector('#pfl-hs-spin')?.addEventListener('click', () => {
    stepObjectHeading(90);
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

  // ---- Sketchfab Model Search/Download + Local GLB Dropper into Object Pad ----
  const SKETCHFAB_TOKEN_KEY = 'pfl_sketchfab_token';
  const sfQueryIn = compassWin.body.querySelector('#pfl-sf-query');
  const sfTokenIn = compassWin.body.querySelector('#pfl-sf-token');
  const sfSearchBtn = compassWin.body.querySelector('#pfl-sf-search-btn');
  const sfStatusEl = compassWin.body.querySelector('#pfl-sf-status');
  const sfResultsEl = compassWin.body.querySelector('#pfl-sf-results');
  const glbFileIn = compassWin.body.querySelector('#pfl-glb-file-input');
  const glbFileBtn = compassWin.body.querySelector('#pfl-glb-file-btn');
  const createdGlbUrls = [];
  const customGlbEntityIds = [];
  let avatarLightMode = 'bright';
  let customGlbCounter = 0;

  function makeGlbShaderForMode(mode) {
    if (mode === 'sun' || typeof Cesium.CustomShader !== 'function') return undefined;
    try {
      if (mode === 'bright') {
        return new Cesium.CustomShader({
          lightingModel: Cesium.LightingModel.UNLIT,
          fragmentShaderText: 'void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) { material.diffuse = min(vec3(1.0), material.diffuse * 1.12); }',
        });
      }
      return new Cesium.CustomShader({
        lightingModel: Cesium.LightingModel.PBR,
        fragmentShaderText: 'void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) { material.emissive += material.diffuse * 0.65; }',
      });
    } catch {
      return undefined;
    }
  }

  function applyGlobalAvatarLightMode(mode) {
    avatarLightMode = ['bright', 'studio', 'sun'].includes(mode) ? mode : 'bright';
    const sh = makeGlbShaderForMode(avatarLightMode);
    for (const eid of customGlbEntityIds) {
      const ent = viewer?.entities?.getById?.(eid);
      if (ent?.model) {
        try {
          ent.model.customShader = sh;
          ent.model.lightColor = avatarLightMode === 'sun' ? Cesium.Color.WHITE : new Cesium.Color(1.9, 1.85, 1.75, 1.0);
        } catch {}
      }
    }
    try {
      const lisaEnt = viewer?.entities?.getById?.('lisa-muse-sovereign-anchor');
      if (lisaEnt?.model) lisaEnt.model.customShader = sh;
    } catch {}
    try {
      window.__pflSetSoccerTimeline?.({ lightMode: avatarLightMode });
    } catch {}
    const lBtn = compassWin.body?.querySelector?.('#pfl-avatar-light-btn');
    if (lBtn) {
      lBtn.textContent = avatarLightMode === 'bright' ? '🔆 Light: Uniform' : avatarLightMode === 'studio' ? '💡 Light: Studio' : '🌙 Light: Sun';
      lBtn.style.borderColor = avatarLightMode === 'sun' ? '#64748b' : '#5eead4';
    }
    governorRequestRender('pfl-avatar-light-mode');
  }

  compassWin.body.querySelector('#pfl-avatar-light-btn')?.addEventListener('click', () => {
    const order = ['bright', 'studio', 'sun'];
    applyGlobalAvatarLightMode(order[(order.indexOf(avatarLightMode) + 1) % order.length]);
  });

  const bedLwBtn = compassWin.body.querySelector('#pfl-bed-livewire-btn');
  const syncBedLwBtn = (on) => {
    if (!bedLwBtn) return;
    bedLwBtn.textContent = on ? '🛏️ Bed LiveWire: ON' : '🛏️ Bed LiveWire: OFF';
    bedLwBtn.style.borderColor = on ? '#38bdf8' : '#64748b';
    bedLwBtn.style.color = on ? '#7dd3fc' : '#94a3b8';
  };
  syncBedLwBtn(window.__pflGetBedLiveWireState?.()?.enabled !== false);
  bedLwBtn?.addEventListener('click', () => {
    const cur = window.__pflGetBedLiveWireState?.()?.enabled !== false;
    const next = window.__pflSetBedLiveWireOverlay ? window.__pflSetBedLiveWireOverlay(!cur) : !cur;
    syncBedLwBtn(Boolean(next));
  });

  const compassBedSel = compassWin.body.querySelector('#pfl-compass-paul-avatar-select');
  if (compassBedSel) {
    const cat = window.__pflGetBedPaulAvatarCatalog?.() || BED_PAUL_AVATAR_CATALOG;
    for (const item of cat) {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.label;
      compassBedSel.appendChild(opt);
    }
    compassBedSel.value = window.__pflGetBedPaulAvatar?.() || 'wireframe';
    compassBedSel.addEventListener('change', () => {
      const chosen = window.__pflSetBedPaulAvatar ? window.__pflSetBedPaulAvatar(compassBedSel.value) : compassBedSel.value;
      if (typeof window.__pflSyncBedPaulAvatarUi === 'function') window.__pflSyncBedPaulAvatarUi(chosen);
      syncBedLwBtn(window.__pflGetBedLiveWireState?.()?.enabled !== false);
      governorRequestRender('pfl-bed-paul-avatar');
    });
  }

  try {
    const savedTok = localStorage.getItem(SKETCHFAB_TOKEN_KEY) || '';
    if (sfTokenIn && savedTok) sfTokenIn.value = savedTok;
  } catch {}
  sfTokenIn?.addEventListener('change', () => {
    try { localStorage.setItem(SKETCHFAB_TOKEN_KEY, String(sfTokenIn.value || '').trim()); } catch {}
  });

  function currentDropLatLon() {
    try {
      const canvas = viewer?.scene?.canvas;
      if (canvas) {
        const centerPx = new Cesium.Cartesian2(canvas.clientWidth * 0.5, canvas.clientHeight * 0.5);
        const ray = viewer.camera.getPickRay(centerPx);
        const pick = ray ? viewer.scene.globe?.pick?.(ray, viewer.scene) : null;
        if (pick) {
          const cg = Cesium.Cartographic.fromCartesian(pick);
          const lat = Cesium.Math.toDegrees(cg.latitude);
          const lon = Cesium.Math.toDegrees(cg.longitude);
          if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
        }
      }
      const cc = viewer?.camera?.positionCartographic;
      if (cc && cc.height < 8000) {
        return { lat: Cesium.Math.toDegrees(cc.latitude), lon: Cesium.Math.toDegrees(cc.longitude) };
      }
    } catch {}
    return { lat: 29.24755, lon: -95.23142 };
  }

  function spawnCustomGlbMovable({ label, uri }) {
    const idNum = ++customGlbCounter;
    const kind = `custom-glb-${idNum}`;
    const entityId = `pfl-${kind}`;
    const drop = currentDropLatLon();
    const state = { lat: drop.lat, lon: drop.lon, heading: 0, lift: 0, scale: 1, opacity: 1 };
    const syncEntity = () => {
      const g = resolveLocalGroundM(state.lon, state.lat);
      const pos = Cesium.Cartesian3.fromDegrees(state.lon, state.lat, g + Number(state.lift || 0));
      const ori = Cesium.Transforms.headingPitchRollQuaternion(
        pos,
        new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(state.heading || 0), 0, 0),
      );
      const sc = Math.max(0.1, Math.min(20, Number(state.scale) > 0 ? Number(state.scale) : 1));
      const op = Math.max(0.05, Math.min(1, Number(state.opacity ?? 1)));
      const ex = viewer.entities.getById(entityId);
      if (ex?.model) {
        ex.position = pos;
        ex.orientation = ori;
        ex.model.scale = sc;
        ex.model.color = Cesium.Color.WHITE.withAlpha(op);
        return ex;
      }
      const ent = viewer.entities.add({
        id: entityId,
        name: label,
        position: pos,
        orientation: ori,
        model: {
          uri,
          scale: sc,
          color: Cesium.Color.WHITE.withAlpha(op),
          heightReference: Cesium.HeightReference.NONE,
          minimumPixelSize: 16,
          maximumScale: 80,
          lightColor: avatarLightMode === 'sun' ? Cesium.Color.WHITE : new Cesium.Color(1.9, 1.85, 1.75, 1.0),
          imageBasedLightingFactor: avatarLightMode === 'sun' ? new Cesium.Cartesian2(1, 1) : new Cesium.Cartesian2(1.25, 0.9),
          customShader: makeGlbShaderForMode(avatarLightMode),
        },
      });
      customGlbEntityIds.push(entityId);
      yardLandmarkIds.push(entityId);
      return ent;
    };
    const mov = {
      kind,
      label: `📦 ${label}`.slice(0, 32),
      getState: () => ({ ...state }),
      update: (patch) => {
        Object.assign(state, patch);
        const e = syncEntity();
        if (e) e._pflMovable = mov;
        governorRequestRender('pfl-move-custom-glb');
      },
    };
    window.__pflMovables = window.__pflMovables || {};
    window.__pflMovables[kind] = mov;
    const ent = syncEntity();
    if (ent) ent._pflMovable = mov;
    bindMovable(mov);
    governorRequestRender('pfl-spawn-custom-glb');
    return mov;
  }

  async function runSketchfabSearch() {
    const q = String(sfQueryIn?.value || '').trim();
    if (!q) {
      if (sfStatusEl) sfStatusEl.textContent = 'Enter a search term (e.g. "RV", "chair", "tree").';
      return;
    }
    if (sfStatusEl) sfStatusEl.textContent = 'Searching Sketchfab...';
    if (sfResultsEl) sfResultsEl.innerHTML = '';
    try {
      const url = `https://api.sketchfab.com/v3/search?type=models&downloadable=true&count=8&q=${encodeURIComponent(q)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rows = Array.isArray(data?.results) ? data.results : [];
      if (sfStatusEl) sfStatusEl.textContent = rows.length ? `Found ${rows.length} downloadable model(s):` : 'No downloadable models found.';
      for (const m of rows) {
        const uid = String(m?.uid || '');
        const mName = String(m?.name || uid || 'Sketchfab Model').slice(0, 34);
        const rowEl = document.createElement('div');
        rowEl.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:4px;font-size:9.5px;background:rgba(30,41,59,0.7);padding:2px 4px;border-radius:4px';
        const lbl = document.createElement('span');
        lbl.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;color:#e2e8f0';
        lbl.textContent = mName;
        const dropBtn = document.createElement('button');
        dropBtn.type = 'button';
        dropBtn.className = 'pfl-std-cbtn';
        dropBtn.textContent = '⬇ Drop';
        dropBtn.style.cssText = 'flex-shrink:0;border-color:#a855f7;color:#e9d5ff;padding:1px 5px';
        dropBtn.addEventListener('click', async () => {
          const tok = String(sfTokenIn?.value || '').trim();
          if (!tok) {
            if (sfStatusEl) sfStatusEl.textContent = 'Paste your personal Sketchfab API token above (click 🔑) to download GLBs.';
            sfTokenIn?.focus();
            return;
          }
          try { localStorage.setItem(SKETCHFAB_TOKEN_KEY, tok); } catch {}
          if (sfStatusEl) sfStatusEl.textContent = `Fetching "${mName}" GLB...`;
          try {
            const dlRes = await fetch(`https://api.sketchfab.com/v3/models/${encodeURIComponent(uid)}/download`, {
              headers: { Authorization: `Token ${tok}` },
            });
            if (!dlRes.ok) throw new Error(`Sketchfab download HTTP ${dlRes.status}`);
            const dlJson = await dlRes.json();
            const glbUrl = dlJson?.glb?.url || dlJson?.gltf?.url || '';
            if (!glbUrl) throw new Error('No GLB archive available for this model');
            const binRes = await fetch(glbUrl);
            if (!binRes.ok) throw new Error(`GLB CDN HTTP ${binRes.status}`);
            const blob = await binRes.blob();
            const objUrl = URL.createObjectURL(blob);
            createdGlbUrls.push(objUrl);
            spawnCustomGlbMovable({ label: mName, uri: objUrl });
            if (sfStatusEl) sfStatusEl.textContent = `Dropped "${mName}"! Use Object Pad to place & size.`;
          } catch (dlErr) {
            if (sfStatusEl) sfStatusEl.textContent = `Sketchfab drop failed: ${dlErr?.message || dlErr}`;
          }
        });
        rowEl.append(lbl, dropBtn);
        sfResultsEl?.appendChild(rowEl);
      }
    } catch (err) {
      if (sfStatusEl) sfStatusEl.textContent = `Sketchfab search error: ${err?.message || err}`;
    }
  }
  sfSearchBtn?.addEventListener('click', runSketchfabSearch);
  sfQueryIn?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); runSketchfabSearch(); }
  });
  glbFileBtn?.addEventListener('click', () => glbFileIn?.click());
  glbFileIn?.addEventListener('change', () => {
    const file = glbFileIn.files?.[0];
    if (!file) return;
    const objUrl = URL.createObjectURL(file);
    createdGlbUrls.push(objUrl);
    spawnCustomGlbMovable({ label: file.name, uri: objUrl });
    if (sfStatusEl) sfStatusEl.textContent = `Loaded local model: ${file.name}`;
    glbFileIn.value = '';
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

  let axisDrag = null;
  let axisJustDraggedAt = 0;
  gCanvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    axisDrag = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      moved: false,
    };
    gCanvas.style.cursor = 'grabbing';
    try { gCanvas.setPointerCapture(e.pointerId); } catch {}
  });
  gCanvas.addEventListener('pointermove', (e) => {
    if (!axisDrag || e.pointerId !== axisDrag.id) return;
    const totalMove = Math.hypot(e.clientX - axisDrag.startX, e.clientY - axisDrag.startY);
    if (!axisDrag.moved && totalMove < 4) return;
    if (!axisDrag.moved) {
      axisDrag.moved = true;
      holdContinuousRender('pfl-axis-drag');
    }
    const dx = e.clientX - axisDrag.lastX;
    const dy = e.clientY - axisDrag.lastY;
    axisDrag.lastX = e.clientX;
    axisDrag.lastY = e.clientY;
    if (droneOrbitState.active) {
      droneOrbitState.azimuthDeg = ((droneOrbitState.azimuthDeg + dx * 0.65) % 360 + 360) % 360;
      droneOrbitState.pitchDeg = Math.max(-75, Math.min(5, droneOrbitState.pitchDeg - dy * 0.45));
      applyDroneOrbit();
    } else if (viewer?.camera) {
      const nextHdg = (viewer.camera.heading || 0) + Cesium.Math.toRadians(dx * 0.55);
      const nextPitch = Math.max(
        Cesium.Math.toRadians(-89),
        Math.min(Cesium.Math.toRadians(15), (viewer.camera.pitch || -0.4) - Cesium.Math.toRadians(dy * 0.4)),
      );
      viewer.camera.setView({
        destination: viewer.camera.positionWC.clone(),
        orientation: { heading: nextHdg, pitch: nextPitch, roll: 0 },
      });
    }
    paintGlobe();
    governorRequestRender('pfl-axis-drag');
  });
  const endAxisDrag = (e) => {
    if (!axisDrag || (e && e.pointerId !== undefined && e.pointerId !== axisDrag.id)) return;
    const wasMoved = axisDrag.moved;
    axisDrag = null;
    gCanvas.style.cursor = 'grab';
    if (wasMoved) {
      axisJustDraggedAt = Date.now();
      releaseContinuousRender('pfl-axis-drag');
    }
  };
  gCanvas.addEventListener('pointerup', endAxisDrag);
  gCanvas.addEventListener('pointercancel', endAxisDrag);

  gCanvas.addEventListener('click', (e) => {
    if (Date.now() - axisJustDraggedAt < 260) return;
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
        <button type="button" class="pfl-std-cbtn" id="pfl-drone-orbit-selected" style="border-color:#fde047;color:#fde047;font-weight:700" title="Send drone to orbit whichever object you currently have selected">🎯 Orbit Selected</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-drone-orbit-lisa" data-pfl-drone="lisa" title="Send remote drone to orbit 360° around Lisa without losing your standing spot">🚁 Orbit Lisa</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-drone-orbit-chair" data-pfl-drone="chair" title="Send remote drone to orbit around Wooden Chair">🪑 Orbit Chair</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-drone-orbit-house" data-pfl-drone="house" title="Send remote drone to orbit 360° around 417 Palm Dr House">🏠 Orbit House</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-drone-orbit-monaco" data-pfl-drone="monaco" title="Send remote drone to orbit 360° around the 40ft Monaco Coach RV">🚌 Orbit Monaco</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-drone-orbit-carport" data-pfl-drone="carport" title="Send remote drone to orbit 1S788 Carport">🚗 Orbit Carport</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-drone-orbit-dock" data-pfl-drone="dock" title="Send remote drone to orbit Chocolate Bayou Dock">⚓ Orbit Dock</button>
      </div>
      <div style="display:flex;gap:3px;flex-wrap:wrap">
        <button type="button" class="pfl-std-cbtn" id="pfl-drone-play-toggle" style="border-color:#22c55e;color:#4ade80;font-weight:700" title="Continuously sweep 360° smoothly around the locked target">▶️ Play 360°</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-drone-step-left" title="Orbit 15° Left around locked target">◀ Orbit L</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-drone-step-right" title="Orbit 15° Right around locked target">Orbit R ▶</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-drone-unlock" style="border-color:#fbbf24;color:#fde047" title="Unlock camera transform cleanly in place">🔓 Unlock</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-drone-return" style="border-color:#4ade80;color:#4ade80" title="Unlock drone &amp; return immediately to your saved pre-drone standing spot">↩️ Return</button>
      </div>
      <div style="display:flex;gap:3px;flex-wrap:wrap;align-items:center;padding:4px 5px;border:1px solid rgba(56,189,248,0.22);border-radius:6px;background:rgba(15,23,42,0.5)">
        <span style="color:#38bdf8;font-weight:700;font-size:9.5px">🛤️ Flight Path:</span>
        <button type="button" class="pfl-std-cbtn" id="pfl-fp-add" title="Add current camera viewpoint as next Flight Path stop">➕ Waypoint</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-fp-play" style="border-color:#4ade80;color:#4ade80" title="Fly smoothly through saved Flight Path waypoints">▶️ Play Path (0)</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-fp-clear" title="Clear saved Flight Path waypoints">🗑️</button>
      </div>
      <div style="font-size:8.5px;color:#94a3b8;line-height:1.25">Tip: Bottom ▶ (1×) advances satellites/planes track clock; use ▶️ Play 360° or Flight Path above to animate camera!</div>
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
        <button type="button" class="pfl-std-cbtn" id="pfl-enter-holodeck-btn" style="border-color:#a855f7;color:#e9d5ff" title="${IS_LOCAL_NODE ? 'Step through the 1S788 Carport Portal into the 3D Gaussian Splat Holodeck Hallway (:8766)' : 'Step through the 1S788 Cloud Holodeck Portal into your hosted 3D Gaussian Splats (/holodeck/)'}">${IS_LOCAL_NODE ? '🚪 Enter Holodeck Hallway (:8766)' : '🚪 Enter Cloud Holodeck (/holodeck/)'}</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-house-3d-toggle" style="border-color:#fbbf24;color:#fde047" title="Toggle 3D 417 Palm Dr Yellow Coastal House GLB model &amp; auto-elevate Bed photo onto upstairs west-bedroom roof">🏠 3D House: ON</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-world-labels-toggle" style="border-color:#38bdf8;color:#7dd3fc" title="Show or hide floating 3D text labels &amp; map tags so you can inspect clean ground-level views (keeps 3D models, spheres &amp; photos visible)">🏷️ Labels: ON</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-yard-splat-toggle" style="border-color:rgba(148,163,184,0.35);color:#94a3b8" title="Toggle self-hosted 417 Palm Dr Front Yard 3D Gaussian Point Splat tileset">✨ Yard 3D Splat: OFF</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-walk-collisions-toggle" style="border-color:#4ade80;color:#86efac" title="Toggle solid 3D wall colliders with Front, Carport &amp; Bayou Doorways">🧱 Collisions: ON</button>
        <button type="button" class="pfl-std-cbtn" id="pfl-s788-canopy-toggle" style="border-color:rgba(148,163,184,0.35);color:#94a3b8" title="Toggle 3D engineering wireframe of MIL-STD S-788/G shelters (102&quot;L × 84&quot;W × 67&quot;H = 2.59m × 2.13m × 1.70m) + 11ft (3.35m) walk-through overhead solar canopy">🏗️ S-788 &amp; 11ft Canopy: OFF</button>
      </div>
    </div>
  `;
  compassWin.body.appendChild(telepresenceDeck);

  // Wire Drone Telepresence controls, 360° Play & Flight Path Builder
  telepresenceDeck.querySelector('#pfl-drone-orbit-selected')?.addEventListener('click', () => {
    const mov = activeMovable || window.__pflMovables?.monaco || window.__pflMovables?.lisa;
    if (mov && !activeMovable) bindMovable(mov);
    startDroneOrbit(mov ? orbitKeyForMovable(mov) : 'lisa');
  });
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

  let dronePlayRaf = 0;
  let dronePlayLastTs = 0;
  const playOrbitBtn = telepresenceDeck.querySelector('#pfl-drone-play-toggle');
  stopDroneAutoOrbit = () => {
    if (dronePlayRaf) {
      cancelAnimationFrame(dronePlayRaf);
      dronePlayRaf = 0;
      releaseContinuousRender('pfl-drone-play');
    }
    dronePlayLastTs = 0;
    if (playOrbitBtn) {
      playOrbitBtn.textContent = '▶️ Play 360°';
      playOrbitBtn.style.borderColor = '#22c55e';
      playOrbitBtn.style.color = '#4ade80';
    }
  };
  playOrbitBtn?.addEventListener('click', () => {
    if (dronePlayRaf) {
      stopDroneAutoOrbit();
      return;
    }
    stopFlightPathPlay();
    if (!droneOrbitState.active) {
      const mov = activeMovable || window.__pflMovables?.monaco || window.__pflMovables?.lisa;
      startDroneOrbit(mov ? orbitKeyForMovable(mov) : 'lisa');
    }
    playOrbitBtn.textContent = '⏸️ Pause 360°';
    playOrbitBtn.style.borderColor = '#f59e0b';
    playOrbitBtn.style.color = '#fde047';
    holdContinuousRender('pfl-drone-play');
    const stepOrbit = (ts) => {
      if (!droneOrbitState.active) {
        stopDroneAutoOrbit();
        return;
      }
      if (dronePlayLastTs > 0) {
        const dt = Math.min(0.1, (ts - dronePlayLastTs) / 1000);
        droneOrbitState.azimuthDeg = (droneOrbitState.azimuthDeg + dt * 18) % 360;
        applyDroneOrbit();
      }
      dronePlayLastTs = ts;
      dronePlayRaf = requestAnimationFrame(stepOrbit);
    };
    dronePlayRaf = requestAnimationFrame(stepOrbit);
  });

  const FLIGHT_PATH_KEY = 'pfl_flight_path_v1';
  let flightPath = [];
  try {
    const rawFp = JSON.parse(localStorage.getItem(FLIGHT_PATH_KEY) || '[]');
    if (Array.isArray(rawFp)) flightPath = rawFp.filter((w) => Number.isFinite(Number(w?.lat)) && Number.isFinite(Number(w?.lon)));
  } catch {}
  let fpTimer = 0;
  let fpPlaying = false;
  const fpPlayBtn = telepresenceDeck.querySelector('#pfl-fp-play');
  const syncFpUi = () => {
    if (!fpPlayBtn) return;
    fpPlayBtn.textContent = fpPlaying ? `⏹️ Stop Path (${flightPath.length})` : `▶️ Play Path (${flightPath.length})`;
    fpPlayBtn.style.borderColor = fpPlaying ? '#f43f5e' : '#4ade80';
    fpPlayBtn.style.color = fpPlaying ? '#fda4af' : '#4ade80';
  };
  stopFlightPathPlay = () => {
    if (fpTimer) {
      clearTimeout(fpTimer);
      fpTimer = 0;
    }
    fpPlaying = false;
    syncFpUi();
  };
  syncFpUi();
  telepresenceDeck.querySelector('#pfl-fp-add')?.addEventListener('click', (e) => {
    const c = viewer?.camera?.positionCartographic;
    if (!c) return;
    flightPath.push({
      lon: c.longitude,
      lat: c.latitude,
      height: c.height,
      heading: viewer.camera.heading || 0,
      pitch: viewer.camera.pitch || -0.35,
    });
    try { localStorage.setItem(FLIGHT_PATH_KEY, JSON.stringify(flightPath.slice(-24))); } catch {}
    syncFpUi();
    const b = e.currentTarget;
    b.textContent = `✅ WP #${flightPath.length}`;
    setTimeout(() => { b.textContent = '➕ Waypoint'; }, 1000);
  });
  telepresenceDeck.querySelector('#pfl-fp-clear')?.addEventListener('click', () => {
    stopFlightPathPlay();
    flightPath = [];
    try { localStorage.removeItem(FLIGHT_PATH_KEY); } catch {}
    syncFpUi();
  });
  fpPlayBtn?.addEventListener('click', () => {
    if (fpPlaying) {
      stopFlightPathPlay();
      return;
    }
    if (!flightPath.length) {
      const b = fpPlayBtn;
      b.textContent = '➕ Add WP 1st';
      setTimeout(syncFpUi, 1200);
      return;
    }
    stopDroneAutoOrbit();
    unlockDroneCamera();
    fpPlaying = true;
    syncFpUi();
    let idx = 0;
    const flyNext = () => {
      if (!fpPlaying || idx >= flightPath.length) {
        stopFlightPathPlay();
        return;
      }
      const wp = flightPath[idx++];
      enforceZeroAltitudeKickGuard();
      viewer?.camera?.flyTo?.({
        destination: Cesium.Cartesian3.fromRadians(wp.lon, wp.lat, wp.height),
        orientation: { heading: wp.heading, pitch: wp.pitch, roll: 0 },
        duration: 1.8,
      });
      fpTimer = setTimeout(flyNext, 2200);
    };
    flyNext();
  });

  telepresenceDeck.querySelector('#pfl-drone-unlock')?.addEventListener('click', () => {
    stopDroneAutoOrbit();
    stopFlightPathPlay();
    unlockDroneCamera();
  });
  telepresenceDeck.querySelector('#pfl-drone-return')?.addEventListener('click', () => {
    stopDroneAutoOrbit();
    stopFlightPathPlay();
    returnFromDrone();
  });
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

  function syncLensFovUiOnly(deg) {
    const clamped = Math.max(12, Math.min(125, Number(deg) || 60));
    currentLensFovDeg = clamped;
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
    const qfBtn = document.getElementById('pfl-btn-quick-fov');
    if (qfBtn) qfBtn.textContent = `🔭 ${Math.round(clamped)}°`;
  }

  function setOpticalLensFov(deg) {
    const clamped = Math.max(12, Math.min(125, Number(deg) || 60));
    currentLensFovDeg = clamped;
    try {
      if (viewer?.camera?.frustum && 'fov' in viewer.camera.frustum) {
        viewer.camera.frustum.fov = Cesium.Math.toRadians(clamped);
      }
    } catch {}
    syncLensFovUiOnly(clamped);
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
  // Sync readout/buttons without clobbering Cesium's startup float FOV
  syncLensFovUiOnly(currentLensFovDeg);

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
        bedMov.update({ lift: 7.95, _autoSync: true });
      } else if (!isOnAndLoaded && Number(bst.lift || 0) > 4.0) {
        bedMov.update({ lift: 0.35, _autoSync: true });
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

  const WORLD_LABELS_KEY = 'pfl_world_labels_on_v1';
  let worldLabelsOn = true;
  try {
    const rawLbl = localStorage.getItem(WORLD_LABELS_KEY);
    if (rawLbl !== null) worldLabelsOn = rawLbl !== 'false';
  } catch {}
  const worldLabelsBtn = telepresenceDeck.querySelector('#pfl-world-labels-toggle');
  const setEntityLabelsVisible = (ent, visible) => {
    if (!ent) return;
    try {
      if (ent.billboard) ent.billboard.show = visible;
      if (ent.label) ent.label.show = visible;
    } catch {}
  };
  const applyWorldLabelsVisibility = () => {
    try {
      for (const ent of viewer?.entities?.values || []) setEntityLabelsVisible(ent, worldLabelsOn);
      const dsCount = viewer?.dataSources?.length || 0;
      for (let i = 0; i < dsCount; i++) {
        const ds = viewer.dataSources.get(i);
        for (const ent of ds?.entities?.values || []) setEntityLabelsVisible(ent, worldLabelsOn);
      }
    } catch {}
    governorRequestRender('pfl-world-labels');
  };
  const syncLabelsBtnUi = () => {
    if (!worldLabelsBtn) return;
    worldLabelsBtn.textContent = worldLabelsOn ? '🏷️ Labels: ON' : '🏷️ Labels: OFF';
    worldLabelsBtn.style.borderColor = worldLabelsOn ? '#38bdf8' : 'rgba(148,163,184,0.35)';
    worldLabelsBtn.style.color = worldLabelsOn ? '#7dd3fc' : '#94a3b8';
  };
  const setWorldLabels = (on) => {
    worldLabelsOn = Boolean(on);
    try { localStorage.setItem(WORLD_LABELS_KEY, String(worldLabelsOn)); } catch {}
    syncLabelsBtnUi();
    applyWorldLabelsVisibility();
    return worldLabelsOn;
  };
  syncLabelsBtnUi();
  worldLabelsBtn?.addEventListener('click', () => setWorldLabels(!worldLabelsOn));
  window.__pflSetWorldLabels = setWorldLabels;
  try {
    viewer?.entities?.collectionChanged?.addEventListener?.((_col, added) => {
      if (!worldLabelsOn && Array.isArray(added)) {
        for (const ent of added) setEntityLabelsVisible(ent, false);
      }
    });
  } catch {}
  if (!worldLabelsOn) setTimeout(applyWorldLabelsVisibility, 1200);

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

  const yardSplatToggleBtn = telepresenceDeck.querySelector('#pfl-yard-splat-toggle');
  yardSplatToggleBtn?.addEventListener('click', () => {
    const on = Boolean(window.__pflToggleLegacyPointSplat?.());
    yardSplatToggleBtn.textContent = on ? '✨ Yard 3D Splat: ON' : '✨ Yard 3D Splat: OFF';
    yardSplatToggleBtn.style.borderColor = on ? '#22d3ee' : 'rgba(148,163,184,0.35)';
    yardSplatToggleBtn.style.color = on ? '#67e8f9' : '#94a3b8';
    const hb = holodeckWin.body.querySelector('#pfl-holodeck-splat-btn');
    if (hb) hb.textContent = on ? '✨ Yard 3D Point Splat: ON' : '✨ Yard 3D Point Splat: OFF';
    governorRequestRender('pfl-yard-splat-toggle');
  });

  const walkCollToggleBtn = telepresenceDeck.querySelector('#pfl-walk-collisions-toggle');
  walkCollToggleBtn?.addEventListener('click', () => {
    walkCollisionsOn = !walkCollisionsOn;
    walkCollToggleBtn.textContent = walkCollisionsOn ? '🧱 Collisions: ON' : '🧱 Collisions: OFF';
    walkCollToggleBtn.style.borderColor = walkCollisionsOn ? '#4ade80' : 'rgba(148,163,184,0.35)';
    walkCollToggleBtn.style.color = walkCollisionsOn ? '#86efac' : '#94a3b8';
  });

  function checkHolodeckPortalStep() {
    if (droneOrbitState.active || Date.now() < portalStepCooldownUntil) return;
    const c = viewer?.camera?.positionCartographic;
    if (!c) return;
    const camLat = Cesium.Math.toDegrees(c.latitude);
    const camLon = Cesium.Math.toDegrees(c.longitude);
    const pGeo = houseLocalToGeo(8.2, -4.8);
    const dN = (camLat - pGeo.lat) * 111320;
    const dE = (camLon - pGeo.lon) * 111320 * Math.cos(Cesium.Math.toRadians(pGeo.lat));
    const distM = Math.hypot(dN, dE);
    const hAbove = c.height - resolveLocalGroundM(pGeo.lon, pGeo.lat);
    if (distM <= 1.35 && hAbove >= -1.5 && hAbove <= 5.5) {
      if (!insideHolodeckPortalZone) {
        insideHolodeckPortalZone = true;
        openHolodeckHallway();
      }
    } else if (distM > 1.95) {
      insideHolodeckPortalZone = false;
    }
  }

  function resolveWalkWithCollisions(fromLat, fromLon, toLat, toLon, camHeightM) {
    if (!walkCollisionsOn) return { lat: toLat, lon: toLon, enteredDoor: false };
    const agl = camHeightM - resolveLocalGroundM(toLon, toLat);
    if (!Number.isFinite(agl) || agl > 8.8) return { lat: toLat, lon: toLon, enteredDoor: false };
    const p0 = geoToHouseLocal(fromLat, fromLon);
    const p1 = geoToHouseLocal(toLat, toLon);
    // Exterior house wall shell (|x| <= 7.85, |y| <= 4.75) with generous 3m walkable doorway corridors
    const inExteriorBand = (pt) => Math.abs(pt.x) <= 8.05 && Math.abs(pt.y) <= 5.05;
    const inInteriorVoid = (pt) => Math.abs(pt.x) < 7.25 && Math.abs(pt.y) < 4.25;
    const inDoorCorridor = (pt) =>
      Math.abs(pt.x) <= 1.65 && Math.abs(pt.y) <= 5.65 || // North Bayou & South Front doorways
      (pt.x >= 6.8 && pt.x <= 8.6 && pt.y >= -1.5 && pt.y <= 1.5); // East Carport breezeway doorway

    let nextLat = toLat;
    let nextLon = toLon;
    let enteredDoor = false;
    if (inExteriorBand(p1) && !inInteriorVoid(p1) && !inDoorCorridor(p1)) {
      // Slide cleanly along axis with smaller penetration so walls never dead-stop diagonal walking
      if (Math.abs(p0.x) > 7.85) {
        return { lat: toLat, lon: fromLon, enteredDoor: false };
      }
      return { lat: fromLat, lon: toLon, enteredDoor: false };
    }
    if (inInteriorVoid(p1) && !inInteriorVoid(p0)) {
      enteredDoor = true;
    }
    // Keep clear of Monaco RV Coach body (width 2.8m, length 12.4m)
    const mon = window.__pflMovables?.monaco?.getState?.();
    if (mon && Number.isFinite(mon.lat) && agl < 4.0) {
      const mRad = Cesium.Math.toRadians(Number(mon.heading || 194));
      const dE = (toLon - mon.lon) * 111320 * Math.cos(Cesium.Math.toRadians(mon.lat));
      const dN = (toLat - mon.lat) * 111320;
      const mx = dE * Math.cos(mRad) - dN * Math.sin(mRad);
      const my = dE * Math.sin(mRad) + dN * Math.cos(mRad);
      if (Math.abs(mx) < 1.45 && Math.abs(my) < 6.25) {
        return { lat: fromLat, lon: toLon, enteredDoor: false };
      }
    }
    return { lat: nextLat, lon: nextLon, enteredDoor };
  }

  // Add LiveWire 3D Walk Pad layout (matching LiveWire splat_stage.html 4x2 grid) inside left Camera & Walk card:
  const walkBar = document.createElement('div');
  walkBar.style.cssText = 'display:flex;flex-direction:column;gap:4px';
  walkBar.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px">
      <button type="button" class="pfl-std-cbtn" data-pfl-look="left" style="min-height:30px;font-size:11px;font-weight:700;border-color:rgba(250,204,21,0.55);color:#fde047" title="Turn view 15° left in place">⟲ L</button>
      <button type="button" class="pfl-std-cbtn" data-pfl-step="fwd" style="min-height:30px;font-size:13px;font-weight:700;border-color:rgba(56,189,248,0.7);color:#7dd3fc" title="Walk forward">▲</button>
      <button type="button" class="pfl-std-cbtn" data-pfl-look="right" style="min-height:30px;font-size:11px;font-weight:700;border-color:rgba(250,204,21,0.55);color:#fde047" title="Turn view 15° right in place">⟳ R</button>
      <button type="button" class="pfl-std-cbtn" data-pfl-elev="+2" style="min-height:30px;font-size:11px;font-weight:700;border-color:rgba(74,222,128,0.6);color:#4ade80" title="Raise camera straight UP +2m without moving forward/back">⬆ Up</button>
      <button type="button" class="pfl-std-cbtn" data-pfl-step="left" style="min-height:30px;font-size:13px;font-weight:700;border-color:rgba(56,189,248,0.7);color:#7dd3fc" title="Strafe left">◀</button>
      <button type="button" class="pfl-std-cbtn" data-pfl-step="back" style="min-height:30px;font-size:13px;font-weight:700;border-color:rgba(56,189,248,0.7);color:#7dd3fc" title="Walk backward">▼</button>
      <button type="button" class="pfl-std-cbtn" data-pfl-step="right" style="min-height:30px;font-size:13px;font-weight:700;border-color:rgba(56,189,248,0.7);color:#7dd3fc" title="Strafe right">▶</button>
      <button type="button" class="pfl-std-cbtn" data-pfl-elev="-2" style="min-height:30px;font-size:11px;font-weight:700;border-color:rgba(74,222,128,0.6);color:#4ade80" title="Lower camera straight DOWN -2m without pushing through photos">⬇ Dn</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:3px">
      <button type="button" class="pfl-std-cbtn" data-pfl-look="up" style="font-size:10px;padding:3px 2px" title="Pitch view up 10°">🔼 Up</button>
      <button type="button" class="pfl-std-cbtn" data-pfl-look="down" style="font-size:10px;padding:3px 2px" title="Pitch view down 10°">🔽 Dn</button>
      <button type="button" class="pfl-std-cbtn" data-pfl-elev="eye" style="font-size:10px;padding:3px 2px" title="Drop straight to 1.8m walking eye level at this exact spot">👁️ 1.8m</button>
      <button type="button" class="pfl-std-cbtn" data-pfl-elev="balcony" style="font-size:10px;padding:3px 2px" title="Set height to 6.2m balcony level">🏠 6.2m</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px">
      <button type="button" class="pfl-std-cbtn" id="pfl-save-spot" style="font-size:10px" title="Bookmark this exact camera position &amp; angle">📌 Save</button>
      <button type="button" class="pfl-std-cbtn" id="pfl-go-spot" style="font-size:10px" title="Return to your saved spot">🎯 Go</button>
      <button type="button" class="pfl-std-cbtn" id="pfl-undo-jump" style="font-size:10px" title="Undo accidental sky ejection">⏪ Undo</button>
    </div>
    <div id="pfl-walk-hint" style="display:none;font-size:9.5px;color:#4ade80;font-family:'JetBrains Mono',monospace">WASD active: W/A/S/D walk · Q/E height</div>
  `;
  (compassWin.body.querySelector('#pfl-walk-nav-slot') || compassWin.body).appendChild(walkBar);

  function stepHorizontal(fwdM, rightM) {
    unlockDroneCamera();
    const c = viewer.camera.positionCartographic;
    if (!c) return;
    enforceZeroAltitudeKickGuard();
    const hdg = viewer.camera.heading || 0;
    const eastM = Math.sin(hdg) * fwdM + Math.cos(hdg) * rightM;
    const northM = Math.cos(hdg) * fwdM - Math.sin(hdg) * rightM;
    const curLat = Cesium.Math.toDegrees(c.latitude);
    const curLon = Cesium.Math.toDegrees(c.longitude);
    const rawLat = curLat + northM / 111320;
    const rawLon = curLon + eastM / (111320 * Math.cos(c.latitude));
    const solved = resolveWalkWithCollisions(curLat, curLon, rawLat, rawLon, c.height);
    if (solved.enteredDoor) {
      const wh = compassWin.body.querySelector('#pfl-walk-hint');
      if (wh) {
        wh.style.display = 'block';
        wh.textContent = '🚪 Inside 417 Palm Dr — click 🌐 360° or 🏠 Walk Inside to explore!';
      }
    }
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(solved.lon, solved.lat, c.height),
      orientation: { heading: viewer.camera.heading, pitch: viewer.camera.pitch, roll: 0 },
    });
    checkHolodeckPortalStep();
    governorRequestRender('pfl-walk-step');
  }

  function applyElevationMode(mode) {
    unlockDroneCamera();
    const c = viewer.camera.positionCartographic;
    if (!c) return;
    enforceZeroAltitudeKickGuard();
    const gBase = resolveLocalGroundM(Cesium.Math.toDegrees(c.longitude), Cesium.Math.toDegrees(c.latitude));
    const nextH =
      mode === 'eye' ? gBase + 1.8 :
      mode === 'balcony' ? gBase + 6.2 :
      Math.max(gBase + 0.4, c.height + Number(mode));
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, nextH),
      orientation: { heading: viewer.camera.heading, pitch: viewer.camera.pitch, roll: 0 },
    });
    governorRequestRender('pfl-elev-step');
  }

  function applyWalkStepDir(dir) {
    if (dir === 'fwd') stepHorizontal(2.5, 0);
    else if (dir === 'back') stepHorizontal(-2.5, 0);
    else if (dir === 'left') stepHorizontal(0, -2.5);
    else if (dir === 'right') stepHorizontal(0, 2.5);
  }

  function applyLookDir(dir) {
    if (!viewer?.camera) return;
    unlockDroneCamera();
    const curH = viewer.camera.heading || 0;
    const curP = viewer.camera.pitch || -0.35;
    const nextH = dir === 'left' ? curH - Cesium.Math.toRadians(15)
      : dir === 'right' ? curH + Cesium.Math.toRadians(15)
      : curH;
    const nextP = dir === 'up' ? Math.min(Cesium.Math.toRadians(15), curP + Cesium.Math.toRadians(10))
      : dir === 'down' ? Math.max(Cesium.Math.toRadians(-89), curP - Cesium.Math.toRadians(10))
      : curP;
    viewer.camera.setView({
      destination: viewer.camera.positionWC.clone(),
      orientation: { heading: nextH, pitch: nextP, roll: 0 },
    });
    paintGlobe();
    governorRequestRender('pfl-look-step');
  }

  function attachPadRepeat(btn, actionFn) {
    let tid = 0;
    let skipNextClick = false;
    const stop = () => {
      if (tid) {
        clearInterval(tid);
        padRepeatIntervals.delete(tid);
        tid = 0;
      }
    };
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      stop();
      skipNextClick = true;
      actionFn();
      tid = setInterval(actionFn, 160);
      padRepeatIntervals.add(tid);
    });
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('blur', stop);
    btn.addEventListener('click', () => {
      if (skipNextClick) {
        skipNextClick = false;
        return;
      }
      actionFn();
    });
  }

  walkBar.querySelectorAll('[data-pfl-elev]').forEach((btn) => {
    const mode = btn.getAttribute('data-pfl-elev');
    if (mode === '+2' || mode === '-2') {
      attachPadRepeat(btn, () => applyElevationMode(mode));
    } else {
      btn.addEventListener('click', () => applyElevationMode(mode));
    }
  });

  walkBar.querySelectorAll('[data-pfl-step]').forEach((btn) => {
    const dir = btn.getAttribute('data-pfl-step');
    attachPadRepeat(btn, () => applyWalkStepDir(dir));
  });

  walkBar.querySelectorAll('[data-pfl-look]').forEach((btn) => {
    const dir = btn.getAttribute('data-pfl-look');
    if (dir === 'left' || dir === 'right') {
      attachPadRepeat(btn, () => applyLookDir(dir));
    } else {
      btn.addEventListener('click', () => applyLookDir(dir));
    }
  });

  compassWin.body.querySelectorAll('[data-pfl-obj-cam]').forEach((btn) => {
    const [rM, fM] = btn.getAttribute('data-pfl-obj-cam').split(',').map(Number);
    attachPadRepeat(btn, () => {
      const stepM = NUDGE_STEP_PRESETS[nudgeStepIdx] || 0.25;
      stepObjectCameraRelative(fM * stepM, rM * stepM);
    });
  });
  compassWin.body.querySelectorAll('[data-pfl-obj-rot]').forEach((btn) => {
    const deg = Number(btn.getAttribute('data-pfl-obj-rot') || 0);
    if (Math.abs(deg) === 15 || Math.abs(deg) === 5) {
      attachPadRepeat(btn, () => stepObjectHeading(deg));
    } else {
      btn.addEventListener('click', () => stepObjectHeading(deg));
    }
  });
  compassWin.body.querySelectorAll('[data-pfl-lift-delta]').forEach((btn) => {
    const delta = Number(btn.getAttribute('data-pfl-lift-delta') || 0);
    attachPadRepeat(btn, () => {
      if (!activeMovable) return;
      const cur = Number(activeMovable.getState()?.lift || 0);
      applyActiveLift(cur + delta);
    });
  });

  let wasdWalkOn = false;
  const wasdBtn = compassWin.body.querySelector('#pfl-wasd-toggle');
  const walkHintEl = walkBar.querySelector('#pfl-walk-hint');
  wasdBtn?.addEventListener('click', () => {
    wasdWalkOn = !wasdWalkOn;
    wasdBtn.textContent = wasdWalkOn ? '⌨️ WASD: ON' : '⌨️ WASD: OFF';
    wasdBtn.style.borderColor = wasdWalkOn ? '#4ade80' : '';
    if (walkHintEl) walkHintEl.style.display = wasdWalkOn ? 'block' : 'none';
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
    else if (k === 'e') { e.preventDefault(); applyElevationMode('+2'); }
    else if (k === 'q') { e.preventDefault(); applyElevationMode('-2'); }
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
    const targetBtn = e.currentTarget;
    targetBtn.textContent = '✅ Saved!';
    setTimeout(() => { targetBtn.textContent = '📌 Save'; }, 1200);
  });
  walkBar.querySelector('#pfl-go-spot')?.addEventListener('click', () => {
    try {
      unlockDroneCamera();
      const gDatum = resolveLocalGroundM(-95.23125, 29.24782);
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
    if (!compassWin.box.classList.contains('pfl-minimized')) paintGlobe();
    syncTiltPolicy();
    checkHolodeckPortalStep();
    syncAlways3dVisibility();
  }, 350);

  // 3) Movable / Sizable Embedded Kalshi & Schwab Paper-Trading Box (Live Server Ledger + Weather Contracts)
  const kalshiWin = createStandardBox({
    id: 'pfl-win-kalshi-arena',
    title: '📈 KALSHI WEATHER & MACRO PAPER ARENA ($100 LIVE SEATS)',
    defaultLeft: 8,
    defaultTop: Math.max(200, (window.innerHeight || 900) - 124),
    defaultWidth: 365,
    defaultMinimized: true,
  });
  kalshiWin.body.innerHTML = `
    <div style="font-family:'Inter',system-ui,sans-serif;font-size:11.5px;color:#e2e8f0">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px">
        <span id="pfl-kalshi-mode-lbl" style="color:#4ade80;font-weight:700">● Live Kalshi Weather/Macro Book (.cache/ledger)</span>
        <div style="display:flex;gap:4px">
          <button type="button" class="pfl-std-cbtn active" id="pfl-toggle-polymarket" style="border-color:#a855f7;color:#d8b4fe" title="Show or hide Polymarket prediction odds markers on the globe">📊 Polymarket: ON</button>
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
      <div id="pfl-inline-trades" style="max-height:115px;overflow:auto;border:1px solid #1e293b;border-radius:6px;padding:4px;font-size:10.5px;margin-bottom:6px"></div>
      <div style="font-weight:700;color:#38bdf8;margin-bottom:3px">Live Weather / Macro Contracts:</div>
      <div id="pfl-inline-markets" style="max-height:115px;overflow:auto;border:1px solid #1e293b;border-radius:6px;padding:4px;font-size:10.5px;margin-bottom:6px">
        Loading live Kalshi Houston Temp, Austin Temp, S&amp;P &amp; BTC markets...
      </div>
      <div id="pfl-kalshi-order-row" style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">
        <input id="pfl-bet-tkr" placeholder="KXHIGHTHOU-26NOV21-B77.5" style="flex:1;min-width:130px;background:#090e18;border:1px solid #334155;color:#fff;padding:3px 6px;border-radius:4px;font-size:10.5px" />
        <select id="pfl-bet-side" style="background:#090e18;border:1px solid #334155;color:#fff;padding:3px;border-radius:4px;font-size:10.5px"><option>YES</option><option>NO</option></select>
        <input id="pfl-bet-qty" type="number" value="20" style="width:46px;background:#090e18;border:1px solid #334155;color:#fff;padding:3px;border-radius:4px;font-size:10.5px" />
        <input id="pfl-bet-px" type="number" value="54" style="width:44px;background:#090e18;border:1px solid #334155;color:#fff;padding:3px;border-radius:4px;font-size:10.5px" title="Entry ¢" />
        <button type="button" class="pfl-std-cbtn" id="pfl-bet-submit" style="background:#38bdf8;color:#041019;border:none;padding:4px 8px">Place Bet</button>
      </div>
      <div id="pfl-kalshi-readonly-note" style="display:none;padding:5px 8px;border:1px solid rgba(56,189,248,0.35);border-radius:6px;background:rgba(15,23,42,0.85);font-size:10.5px;color:#94a3b8">
        🔒 <strong>Read-Only Public Leaderboard</strong> — paper trade submission is locked to Paul's local node (<code>localhost:4173</code>).
      </div>
    </div>
  `;

  function syncPolymarketButtons(vis) {
    const on = typeof vis === 'boolean' ? vis : (typeof window.__pflPolymarketVisible === 'function' ? window.__pflPolymarketVisible() : true);
    const lbl = on ? '📊 Polymarket: ON' : '📊 Polymarket: OFF';
    for (const id of ['pfl-toggle-polymarket', 'pfl-dock-polymarket-btn']) {
      const btn = document.getElementById(id);
      if (btn) {
        btn.textContent = lbl;
        btn.classList.toggle('active', Boolean(on));
      }
    }
  }

  async function refreshInlineKalshi() {
    const lbEl = kalshiWin.body.querySelector('#pfl-inline-lb');
    const trEl = kalshiWin.body.querySelector('#pfl-inline-trades');
    const mkEl = kalshiWin.body.querySelector('#pfl-inline-markets');
    const modeLbl = kalshiWin.body.querySelector('#pfl-kalshi-mode-lbl');
    const orderRow = kalshiWin.body.querySelector('#pfl-kalshi-order-row');
    const roNote = kalshiWin.body.querySelector('#pfl-kalshi-readonly-note');
    if (!lbEl || !mkEl) return;
    try {
      const r = await fetch('/api/pfl/kalshi');
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'Failed');
      const isReadOnly = Boolean(d.readOnly) || !IS_LOCAL_NODE;
      if (modeLbl) {
        modeLbl.textContent = isReadOnly
          ? '● Live Swarm Paper Leaderboard (Read-Only · Trading Locked)'
          : '● Live Kalshi Weather/Macro Book (.cache/ledger)';
        modeLbl.style.color = isReadOnly ? '#38bdf8' : '#4ade80';
      }
      if (orderRow) orderRow.style.display = isReadOnly ? 'none' : 'flex';
      if (roNote) roNote.style.display = isReadOnly ? 'block' : 'none';

      lbEl.innerHTML = (d.leaderboard || [])
        .map((row) => {
          const col = row.pnl > 0 ? '#4ade80' : row.pnl < 0 ? '#f87171' : '#94a3b8';
          const sign = row.pnl > 0 ? '+' : '';
          return `<tr><td><strong>${row.name}</strong></td><td>$${Number(row.cash || 0).toFixed(2)}</td><td style="color:#cbd5e1">$${Number(row.posVal || 0).toFixed(2)} <span style="color:#64748b">(${row.count || 0})</span></td><td><strong>$${Number(row.equity || 0).toFixed(2)}</strong></td><td style="color:${col};font-weight:700">${sign}$${Number(row.pnl || 0).toFixed(2)}</td></tr>`;
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
              const isSettled = t.liveQuote?.status === 'finalized' || t.liveQuote?.status === 'settled';
              const badge = isSettled
                ? (t.markCents >= 99 ? '<span style="color:#4ade80;font-weight:700">[WON]</span>' : '<span style="color:#94a3b8">[SETTLED]</span>')
                : '<span style="color:#38bdf8;font-weight:700">[LIVE]</span>';
              return `<div class="pfl-trade-row" data-idx="${idx}" style="padding:3px 2px;border-bottom:1px solid rgba(30,41,59,0.6);cursor:pointer" title="Click to drill into position math &amp; Kalshi link">
                ${badge} <strong>${t.owner.split(' ')[0]}</strong> · <span style="color:${t.side === 'YES' ? '#4ade80' : '#f87171'};font-weight:700">${t.side}×${t.qty}</span> <code>${t.ticker}</code> @${t.entryCents}¢ → <strong>${t.markCents}¢</strong> (<span style="color:${pnlCol};font-weight:700">${pnlStr}</span> · Val $${valD} on $${costD})
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
                ${isReadOnly ? '' : '<a href="/kalshi-paper.html" target="_blank" rel="noopener" style="color:#38bdf8;font-weight:700">Open Candlestick Workbench ↗</a>'}
              </div>
            `;
            drill.querySelector('#pfl-close-drill')?.addEventListener('click', (e) => {
              e.stopPropagation();
              drill.style.display = 'none';
            });
            const tkrIn = kalshiWin.body.querySelector('#pfl-bet-tkr');
            const pxIn = kalshiWin.body.querySelector('#pfl-bet-px');
            if (tkrIn) tkrIn.value = t.ticker;
            if (pxIn) pxIn.value = String(t.markCents || t.entryCents);
          });
        });
      }
      mkEl.innerHTML = (d.markets || [])
        .map(
          (m) =>
            `<div class="pfl-mkt-pick" data-tkr="${m.ticker}" data-ask="${m.yesAsk || m.mid}" style="display:flex;justify-content:space-between;gap:6px;padding:3px 2px;border-bottom:1px solid rgba(30,41,59,0.7);cursor:pointer" title="${isReadOnly ? 'Live Kalshi quote' : 'Click to load into bet ticket'}">
              <span><strong>${m.ticker}</strong> · ${m.eventTitle} (${m.bracket})</span>
              <span style="color:#4ade80;white-space:nowrap;font-weight:700">${m.yesBid}¢/${m.yesAsk}¢</span>
            </div>`,
        )
        .join('');
      mkEl.querySelectorAll('.pfl-mkt-pick').forEach((row) => {
        row.addEventListener('click', () => {
          const tkrIn = kalshiWin.body.querySelector('#pfl-bet-tkr');
          const pxIn = kalshiWin.body.querySelector('#pfl-bet-px');
          if (tkrIn) tkrIn.value = row.dataset.tkr || '';
          if (pxIn) pxIn.value = row.dataset.ask || '50';
        });
      });
    } catch (err) {
      mkEl.textContent = 'Kalshi feed error: ' + err.message;
    }
  }

  kalshiWin.body.querySelector('#pfl-toggle-polymarket')?.addEventListener('click', () => {
    if (typeof window.__pflTogglePolymarket === 'function') {
      const next = window.__pflTogglePolymarket();
      syncPolymarketButtons(next);
    }
  });
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
  const kalshiPoll = setInterval(() => {
    if (!kalshiWin.box.classList.contains('pfl-minimized') && kalshiWin.box.style.display !== 'none') {
      refreshInlineKalshi();
    }
  }, 45000);


  // 4) Movable / Sizable Local Memory Palace, Uploaded Splats & Wyze Camera Vault (starts neatly minimized until clicked!)
  const vaultWin = createStandardBox({
    id: 'pfl-win-local-vault',
    title: '🏛️ LOCAL MEMORY PALACE, UPLOADED SPLATS & WYZE CAMERAS',
    defaultLeft: Math.min(390, Math.max(8, (window.innerWidth || 1440) - 480)),
    defaultTop: Math.max(240, (window.innerHeight || 900) - 86),
    defaultWidth: 460,
  });
  vaultWin.box.style.display = 'none';
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
    if (!IS_LOCAL_NODE) {
      const sumEl = vaultWin.body.querySelector('#pfl-vault-summary');
      if (sumEl) sumEl.textContent = '● Public Showcase Mode — Local splats & LAN Wyze vault isolated on localhost:4173';
      return;
    }
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
    defaultLeft: 8,
    defaultTop: Math.max(240, (window.innerHeight || 900) - 86),
    defaultWidth: 365,
    defaultMinimized: true,
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
        <video id="pfl-patrol-video" autoplay muted playsinline controls style="width:100%;max-height:215px;object-fit:contain;display:block;background:#000"></video>
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
    if (!IS_LOCAL_NODE && !mediaOverrideUrl) {
      vid.removeAttribute('src');
      if (stEl) stEl.textContent = '● Public Mode — Private LAN Wyze RTSP streams isolated on local PC';
      return;
    }
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
  const alarmPollTimer = IS_LOCAL_NODE ? setInterval(() => refreshWyzePatrol(false), 25000) : null;

  async function refreshWyzePatrol(triggerHarvest = false) {
    if (!IS_LOCAL_NODE) {
      const stEl = patrolWin.body.querySelector('#pfl-patrol-status');
      if (stEl) stEl.textContent = '● Public Mode — Private LAN Wyze RTSP streams isolated on local PC';
      const evEl = patrolWin.body.querySelector('#pfl-patrol-events');
      if (evEl) evEl.innerHTML = '<div style="color:#94a3b8;padding:4px">Private home Wyze events are not exposed on public sex-world.ai.</div>';
      return;
    }
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
  buildYard3dLandmarks = () => {
    if (!viewer?.entities) return;
    for (const id of yardLandmarkIds) viewer.entities.removeById(id);
    yardLandmarkIds.length = 0;

    const gBase = resolveLocalGroundM(-95.23138, 29.24768);

    const oaks = [
      // West Live Oak (left trunk in Cam2 view, aligned on Brazoria CAD Lot 23 NW lawn)
      { id: 'pfl-oak-west', name: '🌳 Backyard West Live Oak (Cam2 Left Frame)', lat: 29.247702, lon: -95.231432, trunkH: 4.2, crownR: 4.8, crownH: 6.4 },
      // East Live Oak (forked foreground tree on right side of Cam2 view, Lot 23 NE lawn)
      { id: 'pfl-oak-east', name: '🌳 Backyard East Forked Live Oak (Cam2 Right Frame)', lat: 29.247694, lon: -95.231328, trunkH: 4.5, crownR: 4.6, crownH: 6.8 },
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
          material: viewer._pflOakMirrorCanvas
            ? new Cesium.ImageMaterialProperty({
                image: viewer._pflOakMirrorCanvas,
                color: Cesium.Color.WHITE.withAlpha(0.84),
                transparent: true,
              })
            : Cesium.Color.fromCssColorString('#1e4620').withAlpha(0.52),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#4ade80').withAlpha(0.35),
        },
      });
      yardLandmarkIds.push(tid, cid);
    }

    const applyOakMirrorMaterial = (canvas) => {
      if (!canvas) return;
      for (const cid of ['pfl-oak-west-crown', 'pfl-oak-east-crown']) {
        const ent = viewer?.entities?.getById?.(cid);
        if (ent?.ellipsoid && !ent._pflOakLiveTextured) {
          ent.ellipsoid.material = new Cesium.ImageMaterialProperty({
            image: canvas,
            color: Cesium.Color.WHITE.withAlpha(0.84),
            transparent: true,
          });
        }
      }
      governorRequestRender('pfl-oak-mirror-ready');
    };
    if (!viewer._pflOakMirrorCanvas && typeof Image !== 'undefined') {
      const oakImg = new Image();
      oakImg.onload = () => {
        try {
          const mirrorOakCanvas = document.createElement('canvas');
          mirrorOakCanvas.width = 960;
          mirrorOakCanvas.height = 540;
          const mctx = mirrorOakCanvas.getContext('2d');
          mctx.filter = 'contrast(1.14) saturate(1.12) brightness(1.03)';
          mctx.drawImage(oakImg, 0, 0, 960, 540);
          mctx.filter = 'none';
          viewer._pflOakMirrorCanvas = mirrorOakCanvas;
          applyOakMirrorMaterial(mirrorOakCanvas);
        } catch {}
      };
      oakImg.src = '/yard-frames/back-yard-cam2-2026-10-12.jpg';
    }

    function makeWorldTagCanvas(text, borderHex, fgHex) {
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
    }

    // Wooden Bayou Dock at Brazoria CAD Lot 23 shoreline, aligned straight out into Chocolate Bayou (14° NNE axis) — clickable & draggable
    const DOCK_POSE_KEY = 'pfl_dock_pose_v1';
    let dockState = { ...DOCK_DEFAULT_POSE };
    try {
      const savedDock = JSON.parse(localStorage.getItem(DOCK_POSE_KEY) || 'null');
      if (savedDock && Number.isFinite(savedDock.lat) && Number.isFinite(savedDock.lon)) {
        dockState = { ...dockState, ...savedDock };
      }
    } catch {}
    const dockId = 'pfl-bayou-dock-3d';
    const renderDockEntity = () => {
      const dGround = resolveLocalGroundM(dockState.lon, dockState.lat);
      const dScale = Math.max(0.25, Math.min(3.5, Number(dockState.scale) > 0 ? Number(dockState.scale) : 1));
      const dOp = Math.max(0.05, Math.min(1, Number(dockState.opacity ?? 1)));
      const dPos = Cesium.Cartesian3.fromDegrees(dockState.lon, dockState.lat, dGround + Number(dockState.lift || 0) + 0.35 * dScale);
      const dOri = Cesium.Transforms.headingPitchRollQuaternion(
        dPos,
        new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(dockState.heading ?? 14), 0, 0),
      );
      viewer.entities.removeById(dockId);
      const dEnt = viewer.entities.add({
        id: dockId,
        name: '⚓ 417 Palm Dr Chocolate Bayou Dock',
        position: dPos,
        orientation: dOri,
        box: {
          dimensions: new Cesium.Cartesian3(3.8 * dScale, 6.2 * dScale, 0.42 * dScale),
          material: dOp >= 0.99
            ? Cesium.Color.fromCssColorString('#7c5c3e')
            : Cesium.Color.fromCssColorString('#7c5c3e').withAlpha(dOp),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#38bdf8').withAlpha(Math.min(1, 0.85 * dOp)),
        },
        billboard: {
          image: makeWorldTagCanvas('⚓ BAYOU DOCK', '#38bdf8', '#7dd3fc'),
          width: 112,
          height: 17,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -34),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 120),
          disableDepthTestDistance: 40,
        },
      });
      if (!yardLandmarkIds.includes(dockId)) yardLandmarkIds.push(dockId);
      dEnt._pflMovable = dockMovable;
      return dEnt;
    };
    const dockMovable = {
      kind: 'dock',
      label: '⚓ 417 Palm Dr Bayou Dock',
      getState: () => ({ ...dockState }),
      update: (patch) => {
        Object.assign(dockState, patch);
        try { localStorage.setItem(DOCK_POSE_KEY, JSON.stringify(dockState)); } catch {}
        renderDockEntity();
        governorRequestRender('pfl-move-dock');
      },
    };
    renderDockEntity();
    window.__pflMovables = window.__pflMovables || {};
    window.__pflMovables.dock = dockMovable;

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

    const portalGeo = houseLocalToGeo(8.2, -4.8);
    const portalGround = resolveLocalGroundM(portalGeo.lon, portalGeo.lat);

    const portalId = 'pfl-holodeck-portal-1s788';
    viewer.entities.add({
      id: portalId,
      name: '🚪 Stargate Transport Ring → 1S788 Holodeck Hallway',
      position: Cesium.Cartesian3.fromDegrees(portalGeo.lon, portalGeo.lat, portalGround + 1.15),
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

    // 3D Monaco 40ft Class-A Diesel Pusher Coach RV in East Lot 24 Driveway (12.2m L × 2.59m W × 3.65m H)
    const MONACO_POSE_KEY = 'pfl_monaco_pose_v3';
    const MONACO_GROUND_CLEARANCE_M = 0.35;
    let monacoState = { ...MONACO_DEFAULT_POSE };
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
      const sc = Math.max(0.25, Math.min(3.5, Number(monacoState.scale) > 0 ? Number(monacoState.scale) : 1));
      const origin = Cesium.Cartesian3.fromDegrees(
        monacoState.lon,
        monacoState.lat,
        rvGround + MONACO_GROUND_CLEARANCE_M + Number(monacoState.lift || 0),
      );
      const monHdg = Number.isFinite(Number(monacoState.heading)) ? Number(monacoState.heading) : 14;
      const hpr = new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(monHdg), 0, 0);
      const frame = Cesium.Transforms.headingPitchRollToFixedFrame(origin, hpr);
      const pos = Cesium.Matrix4.multiplyByPoint(frame, new Cesium.Cartesian3(localX * sc, localY * sc, localZ * sc), new Cesium.Cartesian3());
      const ori = Cesium.Transforms.headingPitchRollQuaternion(pos, hpr);
      const existing = viewer.entities.getById(id);
      if (existing?.box) {
        existing.position = pos;
        existing.orientation = ori;
        existing.box.dimensions = new Cesium.Cartesian3(dims.x * sc, dims.y * sc, dims.z * sc);
        existing.box.material = mat;
        if (outlineCol) existing.box.outlineColor = outlineCol;
        return existing;
      }
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
      if (!yardLandmarkIds.includes(id)) yardLandmarkIds.push(id);
      return ent;
    };

    const renderMonacoParts = () => {
      rvGround = resolveLocalGroundM(monacoState.lon, monacoState.lat);
      const op = Math.max(0.05, Math.min(1, Number(monacoState.opacity ?? 1)));
      const parts = [
        // Main 40ft (12.2m) × 8.5ft (2.59m) × 12ft (3.65m roof) Champagne/Cream Coach Body
        placeMonacoPart(
          'pfl-monaco-rv-body',
          '🚌 Monaco 40ft Diesel Pusher Coach',
          0, 0, 1.98,
          new Cesium.Cartesian3(2.59, 12.20, 3.26),
          new Cesium.ImageMaterialProperty({
            image: viewer._pflMonacoLiveryCanvas,
            transparent: op < 0.99,
            color: Cesium.Color.WHITE.withAlpha(op),
          }),
          Cesium.Color.fromCssColorString('#f5ebe0').withAlpha(0.75 * op),
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
          Cesium.Color.fromCssColorString('#0f172a').withAlpha(0.88 * op),
          Cesium.Color.fromCssColorString('#64748b').withAlpha(0.7 * op),
        ),
        // Warm Glowing ~70W Interior Cab Lamp visible behind windshield
        placeMonacoPart(
          'pfl-monaco-rv-cablamp',
          '💡 Monaco ~70W Interior Cab Lamp',
          0, 5.38, 2.38,
          new Cesium.Cartesian3(1.52, 0.72, 0.62),
          Cesium.Color.fromCssColorString('#fde68a').withAlpha(0.92 * op),
          Cesium.Color.fromCssColorString('#fbbf24').withAlpha(0.95 * op),
        ),
        // Dual Rooftop Coleman A/C Pods
        placeMonacoPart(
          'pfl-monaco-rv-ac-front',
          '🚌 Monaco Rooftop A/C Front',
          0, 2.45, 3.75,
          new Cesium.Cartesian3(0.94, 1.24, 0.28),
          Cesium.Color.fromCssColorString('#f8fafc').withAlpha(0.95 * op),
          Cesium.Color.fromCssColorString('#94a3b8').withAlpha(0.7 * op),
        ),
        placeMonacoPart(
          'pfl-monaco-rv-ac-rear',
          '🚌 Monaco Rooftop A/C Rear',
          0, -2.35, 3.75,
          new Cesium.Cartesian3(0.94, 1.24, 0.28),
          Cesium.Color.fromCssColorString('#f8fafc').withAlpha(0.95 * op),
          Cesium.Color.fromCssColorString('#94a3b8').withAlpha(0.7 * op),
        ),
        // Passenger-Side Champagne Patio Awning Cassette (+X right side)
        placeMonacoPart(
          'pfl-monaco-rv-awning',
          '🚌 Monaco Patio Awning',
          1.34, 0.85, 3.42,
          new Cesium.Cartesian3(0.16, 6.80, 0.20),
          Cesium.Color.fromCssColorString('#d6c7b2').withAlpha(0.95 * op),
          Cesium.Color.fromCssColorString('#b4925a').withAlpha(0.85 * op),
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

    // 3D 417 Palm Drive Two-Story Coastal House GLB (/models/pfl-palm-drive-house.glb, real walkable shell + wrap balconies)
    // heading=104° aligns glTF +X along Palm Dr ESE (14.8° S of E) and +Z toward Palm Dr SSW (194.8°)
    const HOUSE_POSE_KEY = 'pfl_house_pose_v4';
    const DEFAULT_HOUSE_STATE = { ...HOUSE_DEFAULT_POSE };
    let houseState = { ...DEFAULT_HOUSE_STATE };
    try {
      const savedHouse = JSON.parse(localStorage.getItem(HOUSE_POSE_KEY) || 'null');
      if (savedHouse && Number.isFinite(savedHouse.lat) && Number.isFinite(savedHouse.lon)) {
        const driftM = Math.hypot(
          (savedHouse.lat - DEFAULT_HOUSE_STATE.lat) * 111320,
          (savedHouse.lon - DEFAULT_HOUSE_STATE.lon) * 97200,
        );
        const safeLift = Math.abs(Number(savedHouse.lift || 0)) <= 35 ? Number(savedHouse.lift || 0) : 0;
        if (driftM <= 250) {
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
      const hGround = resolveHouseGroundM(houseState.lon, houseState.lat);
      const houseScale = Math.max(0.25, Math.min(3.5, Number(houseState.scale) > 0 ? Number(houseState.scale) : 1));
      const houseOpacity = Math.max(0.05, Math.min(1, Number(houseState.opacity ?? 1)));
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
        existingHouse.model.color = Cesium.Color.WHITE.withAlpha(houseOpacity);
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
          uri: `/models/pfl-palm-drive-house.glb?v=${viewer._pflHouseRev || 13}`,
          scale: houseScale,
          color: Cesium.Color.WHITE.withAlpha(houseOpacity),
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
        // Move House-parented Stargate portal, indoor MLS pins & 360° spheres dynamically with House
        try {
          const pEnt = viewer?.entities?.getById?.(portalId);
          if (pEnt) {
            const pg = houseLocalToGeo(8.2, -4.8, houseState);
            const pGround = resolveLocalGroundM(pg.lon, pg.lat);
            pEnt.position = Cesium.Cartesian3.fromDegrees(pg.lon, pg.lat, pGround + 1.15);
            if (pEnt.ellipse) pEnt.ellipse.height = pGround + 0.12;
          }
          if (typeof syncMlsRoomPins === 'function') syncMlsRoomPins(null);
          if (typeof sync360SphereEntities === 'function') sync360SphereEntities();
        } catch {}
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
  const sampleYardDatumSig = () => [
    resolveLocalGroundM(-95.23138, 29.24768),
    resolveLocalGroundM(-95.231268, 29.247510),
    resolveLocalGroundM(-95.231385, 29.247595),
    resolveLocalGroundM(-95.231445, 29.247436),
  ].map((v) => Math.round(Number(v || 0) * 5) / 5).join('|');
  let lastGroundedDatumSig = sampleYardDatumSig();
  let terrainSyncTimer = null;
  const scheduleTerrainReground = (force = false, delayMs = 220) => {
    if (terrainSyncTimer) clearTimeout(terrainSyncTimer);
    terrainSyncTimer = setTimeout(() => {
      terrainSyncTimer = null;
      if (force && viewer) viewer._pflUniformGoogleDatumM = undefined;
      const nextSig = sampleYardDatumSig();
      if (!force && nextSig === lastGroundedDatumSig) return;
      lastGroundedDatumSig = nextSig;
      try { buildYard3dLandmarks(); } catch {}
      try { window.__pflMovables?.lisa?.update?.({}); } catch {}
      try { window.__pflMovables?.chair?.update?.({}); } catch {}
      try { window.__pflMovables?.house?.update?.({}); } catch {}
      try { window.__pflMovables?.monaco?.update?.({}); } catch {}
      try { window.__pflMovables?.dock?.update?.({}); } catch {}
      try { if (typeof sync360SphereEntities === 'function') sync360SphereEntities(); } catch {}
      try { syncActiveMovableGizmo(); } catch {}
    }, delayMs);
  };
  const onMapOrTilesSettled = () => scheduleTerrainReground(true, 350);
  window.addEventListener('gev:map-stack-changed', onMapOrTilesSettled);
  window.addEventListener('gev:google3d-settled', onMapOrTilesSettled);
  const terrainProviderUnsub = viewer?.scene?.terrainProviderChanged?.addEventListener?.(() => {
    scheduleTerrainReground(true, 200);
  }) || null;
  const globeTileProgressUnsub = viewer?.scene?.globe?.tileLoadProgressEvent?.addEventListener?.((pending) => {
    if (pending === 0) scheduleTerrainReground(false, 220);
  }) || null;

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
        if (viewer.scene?._depthPlane) {
          viewer.scene._depthPlane._ellipsoidOffset = -500;
        }
        if (viewer.scene?.globe && c.height < 220) {
          viewer.scene.globe.depthTestAgainstTerrain = false;
        }
        if (viewer.camera?.frustum && 'near' in viewer.camera.frustum && c.height < 140) {
          viewer.camera.frustum.near = 0.12;
        }
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
    const gBase = resolveLocalGroundM(cam.lon, cam.lat);
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
        // Preserve Paul Prime's dreamlike mirrored Live Oak sphere reflection (upgrading static mirror to live Cam2 frames when local backend is up)
        if (rt.cam.src === 'back-yard-cam2') {
          for (const cid of ['pfl-oak-west-crown', 'pfl-oak-east-crown']) {
            const ent = viewer?.entities?.getById?.(cid);
            if (ent?.ellipsoid && !ent._pflOakLiveTextured) {
              ent._pflOakLiveTextured = true;
              const mirrorOakCanvas = document.createElement('canvas');
              mirrorOakCanvas.width = 960;
              mirrorOakCanvas.height = 540;
              const mctx = mirrorOakCanvas.getContext('2d');
              mctx.filter = 'contrast(1.14) saturate(1.12) brightness(1.03)';
              mctx.drawImage(bmp, 0, 0, 960, 540);
              mctx.filter = 'none';
              viewer._pflOakMirrorCanvas = mirrorOakCanvas;
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

  function isCameraNearLiverpoolYard() {
    const c = viewer?.camera?.positionCartographic;
    if (!c || c.height > 2500) return false;
    return Math.hypot(Cesium.Math.toDegrees(c.latitude) - 29.24755, Cesium.Math.toDegrees(c.longitude) - -95.23140) < 0.05;
  }

  function syncAlways3dVisibility() {
    enforceZeroAltitudeKickGuard();
    const allowLive = IS_LOCAL_NODE && isCameraNearLiverpoolYard();
    const dockBtn = document.getElementById('pfl-btn-always3d');
    if (dockBtn) {
      const wantLabel = !IS_LOCAL_NODE
        ? '👁️ Always-On 3D Cams: LOCAL ONLY'
        : always3dMasterOn ? '👁️ Always-On 3D Cams: ON' : '👁️ Always-On 3D Cams: OFF';
      if (dockBtn.textContent !== wantLabel) {
        dockBtn.textContent = wantLabel;
        dockBtn.classList.toggle('active', IS_LOCAL_NODE && always3dMasterOn);
      }
    }
    if (!allowLive) {
      let anyHidden = false;
      for (const rt of always3dRuntimes.values()) {
        if (rt.prim.show || rt.outlinePrim.show) {
          rt.prim.show = false;
          rt.outlinePrim.show = false;
          anyHidden = true;
        }
      }
      if (anyHidden) governorRequestRender('pfl-always3d-vis');
      return;
    }
    let anyChanged = false;
    for (const cam of SOVEREIGN_3D_CAMS) {
      const baseWant = always3dMasterOn && Boolean(always3dSelected[cam.src]);
      if (!baseWant && !always3dRuntimes.has(cam.src)) continue;
      const rt = ensureAlways3dRuntime(cam);
      const alpha = baseWant ? viewAngleWeight(cam) : 0;
      const want = baseWant && alpha > 0.04;
      const outlineWant = want && !cam.groundDrape;
      if (rt.prim.show !== want || rt.outlinePrim.show !== outlineWant) {
        anyChanged = true;
      }
      const m = computePflQuadPose(cam);
      Cesium.Matrix4.clone(m, rt.prim.modelMatrix);
      Cesium.Matrix4.clone(m, rt.outlinePrim.modelMatrix);
      if (rt.material?.uniforms?.color) {
        rt.material.uniforms.color = Cesium.Color.WHITE.withAlpha(alpha);
      }
      rt.prim.show = want;
      rt.outlinePrim.show = outlineWant;
      if (want) pumpAlways3dFrame(rt);
    }
    if (anyChanged) governorRequestRender('pfl-always3d-vis');
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
    if (!IS_LOCAL_NODE || !always3dMasterOn || !isCameraNearLiverpoolYard()) return;
    const activeList = SOVEREIGN_3D_CAMS.filter((c) => always3dSelected[c.src]);
    if (!activeList.length) return;
    const cam = activeList[a3dRobin % activeList.length];
    a3dRobin++;
    const rt = always3dRuntimes.get(cam.src);
    if (rt && rt.prim.show) pumpAlways3dFrame(rt);
  }, 2200);
  window.addEventListener('gev:map-stack-changed', () => setTimeout(syncAlways3dVisibility, 400));

  // 8) 32 MLS Interior Photos Interactive 2-Floor + Waterfront Walkthrough & Guided Auto-Tour + 3D Room Hotspot Pins (House-Parented!)
  const MLS_ROOMS = [
    { id: 'boathouse-wf', floor: 'waterfront', title: '⚓ Boathouse, Boat Lift & Bayou Gazebo', shortTag: '⚓ BOATHOUSE & GAZEBO', codes: ['m00', 'm27', 'm28', 'm29', 'm30', 'm31'], lat: 29.247786, lon: -95.231388, altOff: 1.9, az: 194, pitch: -18, range: 17.5 },
    { id: 'porch-2f', floor: '2f', title: '🌅 2F Screened Bayou Porch (1,470 sf Level)', shortTag: '🌅 2F BAYOU PORCH', codes: ['m04', 'm05', 'm26'], relHouse: [0.0, 5.4], lat: 29.247635, lon: -95.231385, altOff: 5.8, az: 14, pitch: -16, range: 11.5 },
    { id: 'living-2f', floor: '2f', title: '🛋️ 2F Living Room (Bayou View)', shortTag: '🛋️ 2F LIVING RM', codes: ['m06', 'm07'], relHouse: [0.0, 2.0], lat: 29.247605, lon: -95.231390, altOff: 5.8, az: 14, pitch: -20, range: 12.5 },
    { id: 'kitchen-2f', floor: '2f', title: '🍳 2F Chef Kitchen (East Wing)', shortTag: '🍳 2F KITCHEN', codes: ['m08', 'm10'], relHouse: [4.0, 1.2], lat: 29.247595, lon: -95.231345, altOff: 5.8, az: 284, pitch: -20, range: 12.0 },
    { id: 'dining-2f', floor: '2f', title: '🍽️ 2F Dining Area (NE Bayou Corner)', shortTag: '🍽️ 2F DINING', codes: ['m09', 'm11'], relHouse: [3.8, 3.2], lat: 29.247618, lon: -95.231348, altOff: 5.8, az: 235, pitch: -20, range: 12.0 },
    { id: 'master-sw-2f', floor: '2f', title: '🛏️ 2F Master SW & Guest Bedrooms', shortTag: '🛏️ 2F MASTER SW', codes: ['m12', 'm15'], relHouse: [-4.4, -2.0], lat: 29.247568, lon: -95.231425, altOff: 5.9, az: 55, pitch: -20, range: 11.5 },
    { id: 'office-nw-2f', floor: '2f', title: '💻 2F Waterfront Office (NW Wing)', shortTag: '💻 2F OFFICE', codes: ['m14'], relHouse: [-4.5, 2.4], lat: 29.247622, lon: -95.231425, altOff: 5.9, az: 125, pitch: -18, range: 11.5 },
    { id: 'baths-2f', floor: '2f', title: '🚿 2F Primary & Hall Baths', shortTag: '🚿 2F BATHS', codes: ['m13', 'm16'], relHouse: [-2.8, 0.2], lat: 29.247585, lon: -95.231408, altOff: 5.8, az: 104, pitch: -22, range: 11.5 },
    { id: 'balcony-2f', floor: '2f', title: '☀️ 2F Front Balcony (Palm Dr View)', shortTag: '☀️ 2F BALCONY', codes: ['m02', 'm03', 'm17'], relHouse: [0.0, -5.6], lat: 29.247548, lon: -95.231385, altOff: 5.6, az: 194, pitch: -16, range: 13.0 },
    { id: 'patio-1f', floor: '1f', title: '🌿 1F Covered Waterfront Patio (1,570 sf Level)', shortTag: '🌿 1F PATIO', codes: ['m01', 'm19'], relHouse: [0.0, 5.4], lat: 29.247642, lon: -95.231385, altOff: 1.8, az: 194, pitch: -14, range: 11.5 },
    { id: 'gameroom-1f', floor: '1f', title: '🎱 1F Cedar Gameroom & Great Room (1,570 sf)', shortTag: '🎱 1F GAMEROOM', codes: ['m18', 'm19', 'm20', 'm21'], relHouse: [0.0, 0.6], lat: 29.247598, lon: -95.231388, altOff: 2.2, az: 14, pitch: -16, range: 12.5 },
    { id: 'galley-1f', floor: '1f', title: '☕ 1F Galley Kitchenette', shortTag: '☕ 1F GALLEY', codes: ['m22', 'm23'], relHouse: [3.9, 0.0], lat: 29.247582, lon: -95.231348, altOff: 2.2, az: 284, pitch: -16, range: 11.5 },
    { id: 'utility-1f', floor: '1f', title: '🧺 1F Utility & Laundry Room', shortTag: '🧺 1F UTILITY', codes: ['m24'], relHouse: [3.2, -2.5], lat: 29.247566, lon: -95.231355, altOff: 2.2, az: 295, pitch: -18, range: 11.5 },
    { id: 'bath3-1f', floor: '1f', title: '🚿 1F Full Bath #3', shortTag: '🚿 1F BATH 3', codes: ['m25'], relHouse: [-3.4, -1.8], lat: 29.247570, lon: -95.231415, altOff: 2.2, az: 75, pitch: -18, range: 11.5 },
  ];

  function resolveMlsRoomWorld(room) {
    if (!room) return { lat: 29.247585, lon: -95.231378, altOff: 2.0, az: 14 };
    if (Array.isArray(room.relHouse)) {
      const hs = window.__pflMovables?.house?.getState?.() || HOUSE_DEFAULT_POSE;
      const g = houseLocalToGeo(room.relHouse[0], room.relHouse[1], hs);
      const lift = Number(hs.lift || 0);
      const az = ((room.az + (Number(hs.heading ?? 104) - 104)) % 360 + 360) % 360;
      return { lat: g.lat, lon: g.lon, altOff: room.altOff + lift, az };
    }
    return { lat: room.lat, lon: room.lon, altOff: room.altOff, az: room.az };
  }

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
  mlsWin.box.style.minWidth = '340px';
  mlsWin.box.style.minHeight = '280px';
  mlsWin.body.style.display = 'flex';
  mlsWin.body.style.flexDirection = 'column';
  mlsWin.body.innerHTML = `
    <div id="pfl-mls-walkthrough-root" style="height:100%;min-height:0;font-family:'Inter',system-ui,sans-serif;font-size:11.5px;color:#e2e8f0;display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap">
        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">
          <button type="button" class="pfl-std-cbtn" id="pfl-mls-autotour-btn" style="background:rgba(250,204,21,0.18);border-color:#facc15;color:#fde047;padding:4px 10px;font-size:11px">▶ Play Guided Room-by-Room Walkthrough</button>
          <button type="button" class="pfl-std-cbtn" data-mls-floor="all" style="border-color:#38bdf8;color:#7dd3fc">All 32</button>
          <button type="button" class="pfl-std-cbtn" data-mls-floor="2f">2nd Floor (1,470 sf)</button>
          <button type="button" class="pfl-std-cbtn" data-mls-floor="1f">1st Floor (1,570 sf)</button>
          <button type="button" class="pfl-std-cbtn" data-mls-floor="waterfront">⚓ Boathouse/Gazebo</button>
        </div>
        <div style="display:flex;gap:5px;align-items:center">
          <button type="button" class="pfl-std-cbtn" id="pfl-mls-enter-splat" style="border-color:#22c55e;color:#86efac;background:rgba(6,78,59,0.45);font-weight:700" title="Beam directly from this 417 Palm Dr room into its walkable 3D Gaussian Splat Holodeck suite">🌀 Enter Room Splat</button>
          <button type="button" class="pfl-std-cbtn" id="pfl-mls-360-btn" style="border-color:#22d3ee;color:#67e8f9" title="Open interactive 360° Sphere &amp; Nov 4 2018 ↔ 2026 Time Machine for this room">🌐 360° Interactive View</button>
          <button type="button" class="pfl-std-cbtn" id="pfl-mls-pins-toggle" style="border-color:#4ade80;color:#86efac" title="Show/hide clickable 3D room hotspot pins around 417 Palm Drive">📍 3D Room Pins: ON</button>
          <button type="button" class="pfl-std-cbtn" id="pfl-mls-close-btn" style="border-color:#f43f5e;color:#fda4af">✕ Close</button>
        </div>
      </div>

      <div style="flex:1 1 auto;min-height:0;display:grid;grid-template-columns:minmax(240px, 1fr) minmax(280px, 1.35fr);gap:10px;align-items:stretch;min-width:0">
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
            <div style="font-size:9.5px;font-weight:700;color:#fde047;margin-bottom:4px">🏠 2ND FLOOR — 1,470 SF (ARCHITECTURAL PLAN · CLICK ANY ROOM)</div>
            <svg viewBox="0 0 260 144" style="width:100%;height:auto;display:block;margin-bottom:4px;background:rgba(2,6,23,0.7);border:1px solid rgba(250,204,21,0.28);border-radius:4px">
              <g data-mls-room="porch-2f" style="cursor:pointer"><rect x="6" y="4" width="248" height="22" rx="3" fill="rgba(56,189,248,0.16)" stroke="#38bdf8" stroke-width="1.2"/><text x="130" y="18" text-anchor="middle" fill="#bae6fd" font-size="8.5" font-weight="700">SCREENED BAYOU PORCH (m04, m05, m26)</text></g>
              <g data-mls-room="office-nw-2f" style="cursor:pointer"><rect x="6" y="29" width="76" height="42" rx="2" fill="rgba(30,41,59,0.85)" stroke="#64748b" stroke-width="1.2"/><text x="44" y="48" text-anchor="middle" fill="#e2e8f0" font-size="8" font-weight="700">NW OFFICE</text><text x="44" y="59" text-anchor="middle" fill="#94a3b8" font-size="7">(m14)</text></g>
              <g data-mls-room="living-2f" style="cursor:pointer"><rect x="85" y="29" width="90" height="42" rx="2" fill="rgba(30,41,59,0.85)" stroke="#64748b" stroke-width="1.2"/><text x="130" y="48" text-anchor="middle" fill="#e2e8f0" font-size="8" font-weight="700">LIVING RM</text><text x="130" y="59" text-anchor="middle" fill="#94a3b8" font-size="7">(m06, m07)</text></g>
              <g data-mls-room="dining-2f" style="cursor:pointer"><rect x="178" y="29" width="76" height="42" rx="2" fill="rgba(30,41,59,0.85)" stroke="#64748b" stroke-width="1.2"/><text x="216" y="48" text-anchor="middle" fill="#e2e8f0" font-size="8" font-weight="700">NE DINING</text><text x="216" y="59" text-anchor="middle" fill="#94a3b8" font-size="7">(m09, m11)</text></g>
              <g data-mls-room="master-sw-2f" style="cursor:pointer"><rect x="6" y="74" width="104" height="43" rx="2" fill="rgba(250,204,21,0.12)" stroke="#fbbf24" stroke-width="1.3"/><rect x="84" y="84" width="22" height="24" rx="2" fill="rgba(251,191,36,0.28)" stroke="#fde047" stroke-width="1"/><text x="45" y="92" text-anchor="middle" fill="#fef08a" font-size="8" font-weight="700">MASTER SW</text><text x="45" y="103" text-anchor="middle" fill="#cbd5e1" font-size="6.8">🛏️ Bed→Kitchen Wall</text></g>
              <g data-mls-room="baths-2f" style="cursor:pointer"><rect x="113" y="74" width="54" height="43" rx="2" fill="rgba(30,41,59,0.85)" stroke="#64748b" stroke-width="1.2"/><text x="140" y="93" text-anchor="middle" fill="#e2e8f0" font-size="7.5" font-weight="700">BATHS 1–2</text><text x="140" y="104" text-anchor="middle" fill="#94a3b8" font-size="6.8">(m13,m16)</text></g>
              <g data-mls-room="kitchen-2f" style="cursor:pointer"><rect x="170" y="74" width="84" height="43" rx="2" fill="rgba(30,41,59,0.85)" stroke="#94a3b8" stroke-width="1.3"/><text x="212" y="93" text-anchor="middle" fill="#e2e8f0" font-size="8" font-weight="700">CHEF KITCHEN</text><text x="212" y="104" text-anchor="middle" fill="#94a3b8" font-size="7">(m08, m10)</text></g>
              <g data-mls-room="balcony-2f" style="cursor:pointer"><rect x="6" y="120" width="248" height="20" rx="3" fill="rgba(245,158,11,0.14)" stroke="#f59e0b" stroke-width="1.2"/><text x="130" y="133" text-anchor="middle" fill="#fde68a" font-size="8" font-weight="700">SOUTH FRONT BALCONY — PALM DR (m02, m03, m17)</text></g>
            </svg>
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
            <div style="font-size:9.5px;font-weight:700;color:#86efac;margin-bottom:4px">🎱 1ST FLOOR — 1,570 SF (GROUND / ENTERTAINING PLAN)</div>
            <svg viewBox="0 0 260 88" style="width:100%;height:auto;display:block;margin-bottom:4px;background:rgba(2,6,23,0.7);border:1px solid rgba(74,222,128,0.28);border-radius:4px">
              <g data-mls-room="patio-1f" style="cursor:pointer"><rect x="6" y="4" width="248" height="20" rx="3" fill="rgba(74,222,128,0.14)" stroke="#4ade80" stroke-width="1.2"/><text x="130" y="17" text-anchor="middle" fill="#bbf7d0" font-size="8" font-weight="700">1F COVERED WATERFRONT PATIO (m01, m19)</text></g>
              <g data-mls-room="gameroom-1f" style="cursor:pointer"><rect x="6" y="27" width="144" height="56" rx="2" fill="rgba(30,41,59,0.85)" stroke="#64748b" stroke-width="1.2"/><text x="78" y="51" text-anchor="middle" fill="#e2e8f0" font-size="8.2" font-weight="700">CEDAR GAMEROOM + STAIRS</text><text x="78" y="63" text-anchor="middle" fill="#94a3b8" font-size="7">(m18, m19, m20, m21)</text></g>
              <g data-mls-room="galley-1f" style="cursor:pointer"><rect x="153" y="27" width="101" height="27" rx="2" fill="rgba(30,41,59,0.85)" stroke="#64748b" stroke-width="1.2"/><text x="203" y="43" text-anchor="middle" fill="#e2e8f0" font-size="7.8" font-weight="700">GALLEY (m22,m23)</text></g>
              <g data-mls-room="bath3-1f" style="cursor:pointer"><rect x="153" y="57" width="49" height="26" rx="2" fill="rgba(30,41,59,0.85)" stroke="#64748b" stroke-width="1.2"/><text x="177" y="73" text-anchor="middle" fill="#e2e8f0" font-size="7.2" font-weight="700">BATH3</text></g>
              <g data-mls-room="utility-1f" style="cursor:pointer"><rect x="205" y="57" width="49" height="26" rx="2" fill="rgba(30,41,59,0.85)" stroke="#64748b" stroke-width="1.2"/><text x="229" y="73" text-anchor="middle" fill="#e2e8f0" font-size="7.2" font-weight="700">UTIL</text></g>
            </svg>
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

        <div style="display:flex;flex-direction:column;gap:6px;min-width:0;min-height:0;height:100%;overflow:hidden">
          <div style="position:relative;flex:1 1 260px;min-height:160px;background:#020617;border:1.5px solid rgba(250,204,21,0.5);border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center">
            <img id="pfl-mls-photo-img" src="/palm-drive-mls/m00.webp" alt="417 Palm Drive MLS Interior Walkthrough" style="width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;display:block;background:#020617" />
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
      const rw = resolveMlsRoomWorld(r);
      const gAlt = resolveLocalGroundM(rw.lon, rw.lat);
      const isAct = r.id === activeRoomId;
      const ent = viewer.entities.add({
        id: pid,
        name: `🏠 ${r.title}`,
        position: Cesium.Cartesian3.fromDegrees(rw.lon, rw.lat, gAlt + rw.altOff),
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
    const rw = resolveMlsRoomWorld(room);
    const gAlt = resolveLocalGroundM(rw.lon, rw.lat);
    const targetAlt = gAlt + rw.altOff;
    const azRad = Cesium.Math.toRadians(rw.az);
    const pitchRad = Cesium.Math.toRadians(room.pitch);
    const horizM = Math.cos(pitchRad) * room.range;
    const eyeLat = rw.lat - (Math.cos(azRad) * horizM) / 111320;
    const eyeLon = rw.lon - (Math.sin(azRad) * horizM) / (111320 * Math.cos(Cesium.Math.toRadians(rw.lat)));
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
    const splatBtn = mlsWin.body.querySelector('#pfl-mls-enter-splat');
    if (imgEl) imgEl.src = p.url;
    if (badgeEl) badgeEl.textContent = `${p.idx + 1} / 32 · ${p.code}`;
    if (headEl) headEl.textContent = p.roomTitle;
    if (capEl) capEl.textContent = p.caption;
    if (splatBtn) {
      const targetHolo = resolveHolodeckRoomForId(p.roomId);
      splatBtn.setAttribute('data-holo-url', targetHolo.url);
      splatBtn.textContent = `🌀 Splat: ${targetHolo.label}`;
    }
    mlsWin.body.querySelectorAll('[data-mls-room]').forEach((b) => {
      const match = b.getAttribute('data-mls-room') === p.roomId;
      const svgRect = b.querySelector?.('rect');
      if (svgRect) {
        svgRect.setAttribute('stroke', match ? '#facc15' : '#64748b');
        svgRect.setAttribute('stroke-width', match ? '2.2' : '1.2');
        svgRect.setAttribute('fill', match ? 'rgba(250,204,21,0.28)' : 'rgba(30,41,59,0.85)');
      } else {
        b.style.borderColor = match ? '#facc15' : '';
        b.style.color = match ? '#fef08a' : '';
        b.style.background = match ? 'rgba(250,204,21,0.16)' : '';
      }
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
  mlsWin.body.querySelector('#pfl-mls-enter-splat')?.addEventListener('click', () => {
    const rid = MLS_PHOTOS[currentMlsIdx]?.roomId || 'living-2f';
    const target = resolveHolodeckRoomForId(rid);
    window.location.href = target.url;
  });
  mlsWin.body.querySelector('#pfl-mls-360-btn')?.addEventListener('click', () => {
    const rid = MLS_PHOTOS[currentMlsIdx]?.roomId || 'kitchen-2f';
    const match = ALBUM_2018_ITEMS.find((s) => s.roomId === rid) || ALBUM_2018_ITEMS[9];
    open360ViewerModal(match);
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

  // 10) Photo / 360° / 3D Vector Auto-Aligner + 21× Historical Nov 4, 2018 360° Sphere Orbs & 4D Time Machine
  const CUSTOM_PHOTO_INDEX_KEY = 'pfl_custom_photo_index_v1';
  const createdPhotoUrls = [];
  const customPhotoItems = [];
  let active4dEraFilter = 'all';
  let orbs360Visible = true;
  const sphereEntityIds = [];
  const customPhotoEntityIds = [];

  function resolveSphereWorldPose(it) {
    if (!it) return { lat: 29.247585, lon: -95.231378, altOff: 1.8, heading: 14 };
    if (Array.isArray(it.relHouse)) {
      const hs = window.__pflMovables?.house?.getState?.() || HOUSE_DEFAULT_POSE;
      const g = houseLocalToGeo(it.relHouse[0], it.relHouse[1], hs);
      const lift = Number(hs.lift || 0);
      const hdg = ((Number(it.heading || 0) + (Number(hs.heading ?? 104) - 104)) % 360 + 360) % 360;
      return { lat: g.lat, lon: g.lon, altOff: (Number(it.altOff) || 1.9) + lift, heading: hdg };
    }
    return {
      lat: Number(it.lat || 29.247585),
      lon: Number(it.lon || -95.231378),
      altOff: Number(it.altOff) || 1.8,
      heading: Number(it.heading || 14),
    };
  }

  function make360OrbBadgeCanvas(item) {
    const c = document.createElement('canvas');
    c.width = 216;
    c.height = 38;
    const ctx = c.getContext('2d');
    const isHighlight = Boolean(item.downloadedMatch);
    ctx.fillStyle = isHighlight ? 'rgba(66, 32, 6, 0.94)' : 'rgba(8, 47, 73, 0.92)';
    ctx.strokeStyle = isHighlight ? '#facc15' : item.custom ? '#4ade80' : '#22d3ee';
    ctx.lineWidth = isHighlight ? 2.5 : 1.8;
    ctx.beginPath();
    ctx.roundRect(2, 2, 212, 34, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = isHighlight ? '#fef08a' : '#e0f2fe';
    ctx.font = '700 10.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const shortTag = `${item.custom ? '🆕' : '🌐'} ${String(item.label || '360°').slice(0, 22)}`;
    ctx.fillText(shortTag, 108, 13);
    ctx.fillStyle = '#7dd3fc';
    ctx.font = '600 8.5px "JetBrains Mono", monospace';
    ctx.fillText(String(item.capturedAt || item.era || '360°').slice(0, 24), 108, 27);
    return c;
  }

  function allIndexed360Items() {
    const custom360 = customPhotoItems.filter((x) => x.is360);
    return [...ALBUM_2018_ITEMS, ...custom360].filter((x) => {
      if (active4dEraFilter === 'all') return true;
      if (active4dEraFilter === '2026') return Boolean(x.custom && !String(x.era || '').startsWith('2018'));
      return x.era === active4dEraFilter;
    });
  }

  sync360SphereEntities = () => {
    if (!viewer?.entities) return;
    for (const id of sphereEntityIds) {
      try { viewer.entities.removeById(id); } catch {}
    }
    sphereEntityIds.length = 0;
    if (!orbs360Visible) {
      governorRequestRender('pfl-360-orbs-off');
      return;
    }
    for (const item of allIndexed360Items()) {
      const eid = `pfl-360-orb-${item.id}`;
      const wp = resolveSphereWorldPose(item);
      const gAlt = resolveLocalGroundM(wp.lon, wp.lat);
      const orbR = item.downloadedMatch ? 0.28 : 0.24;
      const ent = viewer.entities.add({
        id: eid,
        name: `🌐 360° Sphere · ${item.label} (${item.capturedAt})`,
        position: Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, gAlt + wp.altOff),
        ellipsoid: {
          radii: new Cesium.Cartesian3(orbR, orbR, orbR),
          material: Cesium.Color.fromCssColorString(item.downloadedMatch ? '#facc15' : '#22d3ee').withAlpha(0.72),
          outline: true,
          outlineColor: Cesium.Color.WHITE.withAlpha(0.85),
        },
        billboard: {
          image: make360OrbBadgeCanvas(item),
          width: 126,
          height: 22,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -14),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 88),
          disableDepthTestDistance: 35,
        },
      });
      ent._pfl360Item = item;
      sphereEntityIds.push(eid);
    }
    governorRequestRender('pfl-360-orbs-sync');
  };

  // Interactive CSP-Clean Canvas 2D Equirectangular 360° Panorama + 4D Time Machine Modal
  const viewer360Win = createStandardBox({
    id: 'pfl-win-360-viewer',
    title: '🌐 360° INTERACTIVE SPHERE & 4D TIME MACHINE (2018 ↔ 2026)',
    defaultLeft: Math.max(24, Math.round((window.innerWidth - 700) * 0.5)),
    defaultTop: 68,
    defaultWidth: 700,
  });
  viewer360Win.box.style.display = 'none';
  viewer360Win.box.style.zIndex = '9785';
  viewer360Win.box.style.minWidth = '320px';
  viewer360Win.box.style.minHeight = '280px';
  viewer360Win.body.style.display = 'flex';
  viewer360Win.body.style.flexDirection = 'column';
  viewer360Win.body.style.overflow = 'hidden';
  viewer360Win.body.innerHTML = `
    <div style="height:100%;min-height:0;display:flex;flex-direction:column;gap:7px;font-family:'Inter',system-ui,sans-serif;font-size:11px;color:#e2e8f0">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap">
        <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">
          <button type="button" class="pfl-std-cbtn" id="pfl-360-prev" style="padding:3px 8px">◀ Prev Spot</button>
          <button type="button" class="pfl-std-cbtn" id="pfl-360-next" style="padding:3px 8px">Next Spot ▶</button>
          <button type="button" class="pfl-std-cbtn" id="pfl-360-time-play" style="border-color:#facc15;color:#fde047;background:rgba(250,204,21,0.16);padding:3px 9px">▶️ Play Over Time (2018 → 2026)</button>
          <button type="button" class="pfl-std-cbtn" id="pfl-360-enter-splat" style="border-color:#22c55e;color:#86efac;background:rgba(6,78,59,0.45);padding:3px 9px;font-weight:700" title="Walk directly inside this room's high-detail 3D Gaussian Splat suite in Holodeck">🌀 Walk in Splat Holodeck</button>
          <button type="button" class="pfl-std-cbtn" id="pfl-360-align-cam" style="border-color:#22d3ee;color:#67e8f9;padding:3px 8px" title="Teleport Cesium 3D Camera here matching exact look heading">🧭 Sync 3D Globe Here</button>
        </div>
        <button type="button" class="pfl-std-cbtn" id="pfl-360-close" style="border-color:#f43f5e;color:#fda4af">✕ Close</button>
      </div>
      <div id="pfl-360-meta-bar" style="font-family:'JetBrains Mono',monospace;font-size:10px;color:#7dd3fc;background:rgba(9,14,26,0.88);border:1px solid rgba(56,189,248,0.35);border-radius:6px;padding:4px 8px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">
        <span id="pfl-360-title-lbl">🌐 360° Panorama</span>
        <span id="pfl-360-pose-lbl">🧭 HDG 14° · PITCH 0° · FOV 95°</span>
      </div>
      <div id="pfl-360-stage" style="flex:1 1 350px;min-height:160px;position:relative;border-radius:8px;overflow:hidden;border:1.5px solid rgba(34,211,238,0.55);background:#020617">
        <canvas id="pfl-360-canvas" width="480" height="270" style="width:100%;height:100%;display:block;cursor:grab;touch-action:none"></canvas>
        <img id="pfl-360-compare-2026" alt="2026 MLS Room Comparison" style="display:none;position:absolute;right:8px;bottom:8px;width:36%;height:auto;max-height:44%;object-fit:contain;background:#020617;border:2px solid #facc15;border-radius:6px;box-shadow:0 4px 18px rgba(0,0,0,0.8);cursor:pointer" title="Click to toggle full 2026 MLS room photo" />
        <div id="pfl-360-compare-tag" style="display:none;position:absolute;right:12px;bottom:12px;background:rgba(9,14,26,0.88);color:#fde047;font-family:'JetBrains Mono',monospace;font-size:9px;padding:2px 5px;border-radius:4px;pointer-events:none">2026 MLS COMPARE</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:10px;color:#94a3b8">Drag anywhere to look 360° · Wheel to zoom FOV · 🕰️ PIP compares matching 2026 MLS room</span>
        <div style="display:flex;gap:4px">
          <button type="button" class="pfl-std-cbtn" data-pfl-360-fov="65" style="font-size:9.5px">FOV 65°</button>
          <button type="button" class="pfl-std-cbtn" data-pfl-360-fov="95" style="font-size:9.5px;border-color:#38bdf8;color:#7dd3fc">FOV 95°</button>
          <button type="button" class="pfl-std-cbtn" data-pfl-360-fov="115" style="font-size:9.5px">Wide 115°</button>
        </div>
      </div>
    </div>
  `;

  const stage360El = viewer360Win.body.querySelector('#pfl-360-stage');
  const canvas360 = viewer360Win.body.querySelector('#pfl-360-canvas');
  const ctx360 = canvas360?.getContext?.('2d');
  const compareImgEl = viewer360Win.body.querySelector('#pfl-360-compare-2026');
  const compareTagEl = viewer360Win.body.querySelector('#pfl-360-compare-tag');
  let active360Item = null;
  let panoYawDeg = 0; // offset inside equirectangular image relative to item.heading
  let panoPitchDeg = 0;
  let panoFovDeg = 95;
  let srcPanoData = null;
  let srcPanoW = 0;
  let srcPanoH = 0;
  let out360ImgData = ctx360 ? ctx360.createImageData(480, 270) : null;
  let timePlay360Timer = 0;
  let timePlay360Mode = false;
  let resize360Raf = 0;

  function sync360CanvasSize() {
    if (!canvas360 || !ctx360 || !stage360El) return;
    const rect = stage360El.getBoundingClientRect();
    const rw = Math.round(rect.width);
    const rh = Math.round(rect.height);
    if (rw < 20 || rh < 20) return;
    const scale = Math.min(
      1,
      Math.sqrt(135000 / Math.max(1, rw * rh)),
      640 / rw,
      480 / rh,
    );
    const nextW = Math.max(160, Math.round(rw * scale));
    const nextH = Math.max(120, Math.round(rh * scale));
    if (canvas360.width !== nextW || canvas360.height !== nextH) {
      canvas360.width = nextW;
      canvas360.height = nextH;
      out360ImgData = ctx360.createImageData(nextW, nextH);
    }
    if (srcPanoData) render360Projection();
  }
  if (stage360El && typeof ResizeObserver !== 'undefined') {
    const stage360Ro = new ResizeObserver(() => {
      if (resize360Raf) cancelAnimationFrame(resize360Raf);
      resize360Raf = requestAnimationFrame(() => {
        resize360Raf = 0;
        sync360CanvasSize();
      });
    });
    stage360Ro.observe(stage360El);
  }

  function render360Projection() {
    if (!ctx360 || !canvas360 || !srcPanoData) return;
    const W = canvas360.width || 480;
    const H = canvas360.height || 270;
    if (!out360ImgData || out360ImgData.width !== W || out360ImgData.height !== H) {
      out360ImgData = ctx360.createImageData(W, H);
    }
    const out = out360ImgData.data;
    const yawRad = (panoYawDeg * Math.PI) / 180;
    const pitchRad = (panoPitchDeg * Math.PI) / 180;
    let halfH = Math.tan(((panoFovDeg * 0.5) * Math.PI) / 180) * (9 / 16);
    let halfW = halfH * (W / H);
    const maxHalfW = Math.tan((67.5 * Math.PI) / 180);
    if (halfW > maxHalfW) {
      halfW = maxHalfW;
      halfH = halfW * (H / W);
    }
    const sinY = Math.sin(yawRad), cosY = Math.cos(yawRad);
    const sinP = Math.sin(pitchRad), cosP = Math.cos(pitchRad);
    const twoPiInv = 1 / (Math.PI * 2);
    const piInv = 1 / Math.PI;

    for (let y = 0; y < H; y++) {
      const ny = (0.5 - y / H) * 2 * halfH;
      for (let x = 0; x < W; x++) {
        const nx = (x / W - 0.5) * 2 * halfW;
        // Local ray (right=nx, up=ny, fwd=1) rotated by pitch then yaw
        const dy = ny * cosP + sinP;
        const dz0 = -ny * sinP + cosP;
        const rx = nx * cosY + dz0 * sinY;
        const rz = -nx * sinY + dz0 * cosY;
        const ry = dy;
        const rLen = Math.hypot(rx, ry, rz) || 1;
        const theta = Math.atan2(rx, rz); // [-PI, PI] -> equirectangular X
        const phi = Math.asin(Math.max(-1, Math.min(1, ry / rLen))); // [-PI/2, PI/2]
        let u = (0.5 + theta * twoPiInv) * srcPanoW;
        let v = (0.5 - phi * piInv) * srcPanoH;
        const sx = ((Math.floor(u) % srcPanoW) + srcPanoW) % srcPanoW;
        const sy = Math.max(0, Math.min(srcPanoH - 1, Math.floor(v)));
        const sIdx = (sy * srcPanoW + sx) * 4;
        const dIdx = (y * W + x) * 4;
        out[dIdx] = srcPanoData[sIdx];
        out[dIdx + 1] = srcPanoData[sIdx + 1];
        out[dIdx + 2] = srcPanoData[sIdx + 2];
        out[dIdx + 3] = 255;
      }
    }
    ctx360.putImageData(out360ImgData, 0, 0);
    const poseLbl = viewer360Win.body.querySelector('#pfl-360-pose-lbl');
    if (poseLbl && active360Item) {
      const wp = resolveSphereWorldPose(active360Item);
      const compassHdg = (((Math.round(wp.heading + panoYawDeg) % 360) + 360) % 360);
      poseLbl.textContent = `🧭 ${compassHdg}° · PITCH ${Math.round(panoPitchDeg)}° · FOV ${Math.round(panoFovDeg)}°`;
    }
  }

  function loadEquirectangularSource(item, desiredCompassHeading = null) {
    if (!item || !ctx360) return;
    active360Item = item;
    const wp = resolveSphereWorldPose(item);
    panoYawDeg = desiredCompassHeading != null ? (((desiredCompassHeading - wp.heading + 540) % 360) - 180) : 0;
    panoPitchDeg = 0;

    const titleLbl = viewer360Win.body.querySelector('#pfl-360-title-lbl');
    if (titleLbl) {
      titleLbl.textContent = `${item.label} · 🕰️ ${item.capturedAt || item.era} · ${item.camera || '360°'}`;
    }
    const enterSplatBtn = viewer360Win.body.querySelector('#pfl-360-enter-splat');
    if (enterSplatBtn) {
      const targetHolo = resolveHolodeckRoomForId(item.roomId);
      enterSplatBtn.setAttribute('data-holo-url', targetHolo.url);
      enterSplatBtn.textContent = `🌀 Walk Splat: ${targetHolo.label}`;
    }

    // Show matching 2026 MLS room comparison PIP when available
    const room = MLS_ROOMS.find((r) => r.id === item.roomId);
    const code = room?.codes?.[0];
    if (compareImgEl && compareTagEl) {
      if (code) {
        compareImgEl.src = `/palm-drive-mls/${code}.webp`;
        compareImgEl.style.display = 'block';
        compareTagEl.style.display = 'block';
        compareTagEl.textContent = `2026 MLS · ${room.shortTag}`;
      } else {
        compareImgEl.style.display = 'none';
        compareTagEl.style.display = 'none';
      }
    }

    sync360CanvasSize();
    const cw = canvas360.width || 480;
    const ch = canvas360.height || 270;
    ctx360.fillStyle = '#090e1a';
    ctx360.fillRect(0, 0, cw, ch);
    ctx360.fillStyle = '#7dd3fc';
    ctx360.font = '700 13px "JetBrains Mono", monospace';
    ctx360.textAlign = 'center';
    ctx360.fillText('Loading 5660×2830 360° sphere...', cw / 2, ch / 2);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (active360Item?.id !== item.id) return;
      const off = document.createElement('canvas');
      off.width = 1440;
      off.height = 720;
      const octx = off.getContext('2d');
      octx.drawImage(img, 0, 0, 1440, 720);
      const idata = octx.getImageData(0, 0, 1440, 720);
      srcPanoData = idata.data;
      srcPanoW = 1440;
      srcPanoH = 720;
      render360Projection();
    };
    img.onerror = () => {
      if (active360Item?.id !== item.id) return;
      const ew = canvas360.width || 480;
      const eh = canvas360.height || 270;
      ctx360.fillStyle = '#090e1a';
      ctx360.fillRect(0, 0, ew, eh);
      ctx360.fillStyle = '#f87171';
      ctx360.fillText('Failed to decode 360° image', ew / 2, eh / 2);
    };
    img.src = item.file || item.url;
  }

  let drag360Ptr = null;
  canvas360?.addEventListener('pointerdown', (e) => {
    drag360Ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw: panoYawDeg, pitch: panoPitchDeg };
    canvas360.style.cursor = 'grabbing';
    try { canvas360.setPointerCapture(e.pointerId); } catch {}
  });
  canvas360?.addEventListener('pointermove', (e) => {
    if (!drag360Ptr || e.pointerId !== drag360Ptr.id) return;
    const dx = e.clientX - drag360Ptr.x;
    const dy = e.clientY - drag360Ptr.y;
    panoYawDeg = drag360Ptr.yaw - dx * 0.28;
    panoPitchDeg = Math.max(-72, Math.min(72, drag360Ptr.pitch + dy * 0.24));
    render360Projection();
  });
  const end360Drag = () => {
    drag360Ptr = null;
    if (canvas360) canvas360.style.cursor = 'grab';
  };
  canvas360?.addEventListener('pointerup', end360Drag);
  canvas360?.addEventListener('pointercancel', end360Drag);
  canvas360?.addEventListener('wheel', (e) => {
    e.preventDefault();
    panoFovDeg = Math.max(40, Math.min(125, panoFovDeg + Math.sign(e.deltaY) * 6));
    render360Projection();
  }, { passive: false });

  viewer360Win.body.querySelectorAll('[data-pfl-360-fov]').forEach((b) => {
    b.addEventListener('click', () => {
      panoFovDeg = Number(b.getAttribute('data-pfl-360-fov')) || 95;
      render360Projection();
    });
  });

  function stop360TimePlay() {
    timePlay360Mode = false;
    clearInterval(timePlay360Timer);
    const pb = viewer360Win.body.querySelector('#pfl-360-time-play');
    if (pb) pb.textContent = '▶️ Play Over Time (2018 → 2026)';
  }

  open360ViewerModal = (item, desiredHeadingDeg = null, autoPlayTime = false) => {
    const pool = allIndexed360Items();
    const resolved = typeof item === 'string'
      ? (pool.find((x) => x.id === item || String(x.id).includes(item) || String(x.file || '').includes(item))
         || ALBUM_2018_ITEMS.find((x) => x.id === item || String(x.id).includes(item) || String(x.file || '').includes(item)))
      : (typeof item === 'number' ? (pool[item] || ALBUM_2018_ITEMS[item]) : item);
    const target = resolved || pool[9] || ALBUM_2018_ITEMS[9];
    if (!target) return;
    viewer360Win.box.style.display = 'flex';
    sync360CanvasSize();
    viewer360Win.box.classList.remove('pfl-minimized');
    const mb = viewer360Win.box.querySelector('[data-act="min"]');
    if (mb) mb.textContent = '—';
    viewer360Win.box.style.zIndex = '9790';
    loadEquirectangularSource(target, desiredHeadingDeg);
    if (autoPlayTime) {
      timePlay360Mode = true;
      clearInterval(timePlay360Timer);
      const pb = viewer360Win.body.querySelector('#pfl-360-time-play');
      if (pb) pb.textContent = '⏸ Pause Time Machine (2018 ↔ 2026)';
      let tick = 0;
      timePlay360Timer = window.setInterval(() => {
        if (!timePlay360Mode) return;
        tick++;
        const curPool = allIndexed360Items();
        if (!curPool.length) return;
        // Alternate showing 2026 comparison PIP pulse & advancing along Paul's 2018 timeline!
        if (compareImgEl && tick % 2 === 1 && compareImgEl.style.display === 'block') {
          compareImgEl.style.width = '54%';
        } else {
          if (compareImgEl) compareImgEl.style.width = '36%';
          const i = curPool.findIndex((x) => x.id === active360Item?.id);
          const nxt = curPool[(i + 1) % curPool.length];
          loadEquirectangularSource(nxt, desiredHeadingDeg);
        }
      }, 2400);
    }
  };
  window.__pflOpen360Viewer = open360ViewerModal;

  viewer360Win.body.querySelector('#pfl-360-close')?.addEventListener('click', () => {
    stop360TimePlay();
    viewer360Win.box.style.display = 'none';
  });
  viewer360Win.body.querySelector('#pfl-360-prev')?.addEventListener('click', () => {
    stop360TimePlay();
    const pool = allIndexed360Items();
    const idx = pool.findIndex((x) => x.id === active360Item?.id);
    if (pool.length) loadEquirectangularSource(pool[(idx - 1 + pool.length) % pool.length]);
  });
  viewer360Win.body.querySelector('#pfl-360-next')?.addEventListener('click', () => {
    stop360TimePlay();
    const pool = allIndexed360Items();
    const idx = pool.findIndex((x) => x.id === active360Item?.id);
    if (pool.length) loadEquirectangularSource(pool[(idx + 1) % pool.length]);
  });
  viewer360Win.body.querySelector('#pfl-360-time-play')?.addEventListener('click', () => {
    if (timePlay360Mode) stop360TimePlay();
    else open360ViewerModal(active360Item, null, true);
  });
  viewer360Win.body.querySelector('#pfl-360-enter-splat')?.addEventListener('click', () => {
    const rid = active360Item?.roomId || 'living-2f';
    const target = resolveHolodeckRoomForId(rid);
    window.location.href = target.url;
  });
  viewer360Win.body.querySelector('#pfl-360-align-cam')?.addEventListener('click', () => {
    if (!active360Item || !viewer?.camera) return;
    unlockDroneCamera();
    enforceZeroAltitudeKickGuard();
    const wp = resolveSphereWorldPose(active360Item);
    const gAlt = resolveLocalGroundM(wp.lon, wp.lat);
    const targetHeading = (((wp.heading + panoYawDeg) % 360) + 360) % 360;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, gAlt + wp.altOff),
      orientation: {
        heading: Cesium.Math.toRadians(targetHeading),
        pitch: Cesium.Math.toRadians(panoPitchDeg * 0.5),
        roll: 0,
      },
      duration: 0.9,
    });
  });

  function playTimeMachineAtCameraSpot() {
    const c = viewer?.camera?.positionCartographic;
    const pool = allIndexed360Items();
    if (!pool.length) return;
    if (!c) {
      open360ViewerModal(pool[0], null, true);
      return;
    }
    const camLat = Cesium.Math.toDegrees(c.latitude);
    const camLon = Cesium.Math.toDegrees(c.longitude);
    const camHdgDeg = ((Cesium.Math.toDegrees(viewer.camera.heading || 0) % 360) + 360) % 360;
    const camAgl = c.height - resolveLocalGroundM(camLon, camLat);
    let best = pool[0];
    let bestScore = Infinity;
    for (const s of pool) {
      const wp = resolveSphereWorldPose(s);
      const dHoriz = Math.hypot((wp.lat - camLat) * 111320, (wp.lon - camLon) * 97200);
      const dVert = Math.abs(wp.altOff - Math.max(1.0, Math.min(8.0, camAgl)));
      const score = dHoriz + dVert * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
    }
    const alignStatusEl = compassWin.body.querySelector('#pfl-photo-align-status');
    if (alignStatusEl) {
      alignStatusEl.textContent = `🕰️ Time Machine @ ${Math.round(bestScore)}m away: ${best.label} (${best.capturedAt})`;
    }
    open360ViewerModal(best, camHdgDeg, true);
  }
  window.__pflPlayTimeMachineSpot = playTimeMachineAtCameraSpot;

  function buildPhotoAnchorsList() {
    const out = MLS_ROOMS.map((r) => {
      const rw = resolveMlsRoomWorld(r);
      return { id: r.id, label: r.title, lat: rw.lat, lon: rw.lon, altOff: r.altOff, heading: rw.az };
    });
    for (const s of ALBUM_2018_ITEMS) {
      const wp = resolveSphereWorldPose(s);
      out.push({ id: s.id, label: s.label, lat: wp.lat, lon: wp.lon, altOff: wp.altOff, heading: wp.heading });
    }
    return out;
  }

  function addCustomAlignedPhotoToWorld(item) {
    customPhotoItems.push(item);
    if (item.is360) {
      sync360SphereEntities();
      return;
    }
    const pid = `pfl-custom-photo-${item.id}`;
    viewer.entities.removeById(pid);
    const wp = resolveSphereWorldPose(item);
    const gAlt = resolveLocalGroundM(wp.lon, wp.lat);
    const ent = viewer.entities.add({
      id: pid,
      name: `📷 ${item.label} (${item.mediaKind || '2D'})`,
      position: Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, gAlt + (Number(item.altOff) || 1.8)),
      orientation: Cesium.Transforms.headingPitchRollQuaternion(
        Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, gAlt + (Number(item.altOff) || 1.8)),
        new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(wp.heading || 14), 0, 0),
      ),
      billboard: {
        image: item.url,
        width: 140,
        height: 92,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 140),
      },
    });
    customPhotoEntityIds.push(pid);
    governorRequestRender('pfl-custom-photo-added');
  }

  const photoFileIn = compassWin.body.querySelector('#pfl-photo-file-input');
  const photoDropBtn = compassWin.body.querySelector('#pfl-photo-drop-btn');
  const photoStatusEl = compassWin.body.querySelector('#pfl-photo-align-status');
  const eraSelEl = compassWin.body.querySelector('#pfl-era-select');
  const orbsToggleBtn = compassWin.body.querySelector('#pfl-360-orbs-toggle');

  photoDropBtn?.addEventListener('click', () => photoFileIn?.click());
  photoFileIn?.addEventListener('change', async () => {
    const files = Array.from(photoFileIn.files || []);
    if (!files.length) return;
    const anchors = buildPhotoAnchorsList();
    let alignedCount = 0;
    let lastAligned = null;
    for (const file of files) {
      try {
        const buf = await file.arrayBuffer();
        const url = URL.createObjectURL(file);
        createdPhotoUrls.push(url);
        const img = new Image();
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
          img.src = url;
        });
        const meta = parsePhotoMetadata(buf, { width: img.naturalWidth, height: img.naturalHeight });
        const vec = extractVisualVectorFromImage(img);
        const corr = correlatePhotoToAnchors(vec, meta, anchors);
        const item = {
          id: `cust-${Date.now()}-${alignedCount}`,
          label: file.name.replace(/\.[^.]+$/, '').slice(0, 28),
          url,
          file: url,
          is360: meta.is360,
          is3dStereo: meta.is3dStereo,
          mediaKind: meta.mediaKind,
          capturedAt: meta.dateTimeOriginal || new Date(file.lastModified || Date.now()).toISOString().slice(0, 19).replace('T', ' '),
          era: (meta.dateTimeOriginal || '').startsWith('2018') ? ALBUM_2018_ERA : '2026',
          camera: meta.model || meta.make || 'User Upload',
          lat: corr.lat,
          lon: corr.lon,
          altOff: meta.is360 ? 1.85 : corr.altOff,
          heading: corr.heading,
          confidence: corr.confidence,
          usedGps: corr.usedGps,
          custom: true,
        };
        addCustomAlignedPhotoToWorld(item);
        lastAligned = item;
        alignedCount++;
      } catch {}
    }
    photoFileIn.value = '';
    if (photoStatusEl && lastAligned) {
      photoStatusEl.textContent = `✅ Aligned ${alignedCount} ${lastAligned.mediaKind} · ${lastAligned.usedGps ? 'EXIF GPS' : 'Visual Vector'} (${Math.round(lastAligned.confidence * 100)}%) · ${lastAligned.capturedAt}`;
    }
    if (lastAligned?.is360) {
      open360ViewerModal(lastAligned);
    }
  });

  eraSelEl?.addEventListener('change', () => {
    active4dEraFilter = eraSelEl.value || 'all';
    sync360SphereEntities();
    if (photoStatusEl) {
      photoStatusEl.textContent = `🕰️ Era filter: ${active4dEraFilter} (${allIndexed360Items().length} spheres visible)`;
    }
  });
  orbsToggleBtn?.addEventListener('click', () => {
    orbs360Visible = !orbs360Visible;
    orbsToggleBtn.textContent = orbs360Visible ? '🌐 360° Orbs: ON' : '🌐 360° Orbs: OFF';
    orbsToggleBtn.style.borderColor = orbs360Visible ? '#38bdf8' : 'rgba(148,163,184,0.35)';
    orbsToggleBtn.style.color = orbs360Visible ? '#7dd3fc' : '#94a3b8';
    sync360SphereEntities();
  });
  compassWin.body.querySelector('#pfl-time-machine-spot-btn')?.addEventListener('click', () => {
    playTimeMachineAtCameraSpot();
  });
  compassWin.body.querySelector('#pfl-photo-lock-btn')?.addEventListener('click', () => {
    try {
      const idxData = customPhotoItems.map(({ id, label, lat, lon, heading, altOff, mediaKind, capturedAt, era }) => ({
        id, label, lat, lon, heading, altOff, mediaKind, capturedAt, era,
      }));
      localStorage.setItem(CUSTOM_PHOTO_INDEX_KEY, JSON.stringify(idxData));
      if (photoStatusEl) photoStatusEl.textContent = `🔗 Indexed ${allIndexed360Items().length} spheres + ${idxData.length} custom photos locally.`;
    } catch {}
  });
  sync360SphereEntities();

  // Prominent bottom-right Quick-Add (+) button right beside EN locale picker
  const quickAddBtn = document.createElement('button');
  quickAddBtn.type = 'button';
  quickAddBtn.id = 'pfl-quick-add-btn';
  quickAddBtn.title = 'Add .GLB 3D model, Photo / 360° sphere, or Pin';
  quickAddBtn.setAttribute('aria-label', 'Add 3D model, photo, or pin');
  quickAddBtn.style.cssText = 'position:fixed;right:98px;bottom:14px;z-index:9600;width:36px;height:36px;border-radius:999px;border:1.5px solid #22c55e;background:rgba(6,78,59,0.92);color:#4ade80;font-size:22px;font-weight:800;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.65);backdrop-filter:blur(8px)';
  quickAddBtn.textContent = '+';

  const quickAddMenu = document.createElement('div');
  quickAddMenu.id = 'pfl-quick-add-menu';
  quickAddMenu.style.cssText = 'position:fixed;right:98px;bottom:56px;z-index:9601;min-width:196px;padding:6px;border-radius:10px;background:rgba(9,14,26,0.96);border:1.5px solid rgba(34,197,94,0.6);box-shadow:0 10px 28px rgba(0,0,0,0.75);display:none;flex-direction:column;gap:5px;font-family:"Inter",system-ui,sans-serif';
  quickAddMenu.innerHTML = `
    <button type="button" class="pfl-std-cbtn" id="pfl-qadd-glb" style="text-align:left;padding:5px 8px;border-color:#22c55e;color:#86efac">📁 Add .GLB / .GLTF Model</button>
    <button type="button" class="pfl-std-cbtn" id="pfl-qadd-photo" style="text-align:left;padding:5px 8px;border-color:#22d3ee;color:#67e8f9">📷 Add Photo / 360° Sphere</button>
    <button type="button" class="pfl-std-cbtn" id="pfl-qadd-pin" style="text-align:left;padding:5px 8px;border-color:#facc15;color:#fde047">📌 Drop Navigation Pin</button>
    <button type="button" class="pfl-std-cbtn" id="pfl-qadd-sf" style="text-align:left;padding:5px 8px;border-color:#a855f7;color:#e9d5ff">📦 Search Sketchfab 3D</button>
  `;
  document.body.append(quickAddBtn, quickAddMenu);
  createdEls.push(quickAddBtn, quickAddMenu);

  const setQuickAddOpen = (open) => {
    quickAddMenu.style.display = open ? 'flex' : 'none';
  };
  quickAddBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setQuickAddOpen(quickAddMenu.style.display === 'none');
  });
  quickAddMenu.querySelector('#pfl-qadd-glb')?.addEventListener('click', () => {
    setQuickAddOpen(false);
    glbFileIn?.click();
  });
  quickAddMenu.querySelector('#pfl-qadd-photo')?.addEventListener('click', () => {
    setQuickAddOpen(false);
    compassWin.body.querySelector('#pfl-photo-file-input')?.click();
  });
  quickAddMenu.querySelector('#pfl-qadd-pin')?.addEventListener('click', () => {
    setQuickAddOpen(false);
    pinCameraCenter();
  });
  quickAddMenu.querySelector('#pfl-qadd-sf')?.addEventListener('click', () => {
    setQuickAddOpen(false);
    compassWin.box.style.display = 'flex';
    compassWin.box.classList.remove('pfl-minimized');
    const mb = compassWin.box.querySelector('[data-act="min"]');
    if (mb) mb.textContent = '—';
    bringBoxToFront(compassWin.box);
    const sfBox = compassWin.body.querySelector('#pfl-sketchfab-box');
    if (sfBox) sfBox.open = true;
    sfQueryIn?.focus();
  });
  const onDocClickQuickAdd = (e) => {
    if (quickAddMenu.style.display === 'none') return;
    if (quickAddBtn.contains(e.target) || quickAddMenu.contains(e.target)) return;
    setQuickAddOpen(false);
  };
  document.addEventListener('click', onDocClickQuickAdd);

  // ---- Inline LiveWire Cloud Monitor + Story-to-ReelStudio Exporter (v12.7) ----
  const livewireWin = createStandardBox({
    id: 'pfl-win-livewire-monitor',
    title: '📡 LIVEWIRE CLOUD RELAY & SWARM MONITOR',
    defaultLeft: 18,
    defaultTop: 220,
    defaultWidth: 420,
    defaultMinimized: true,
  });
  livewireWin.box.style.display = 'none';
  livewireWin.box.style.zIndex = '9692';
  livewireWin.body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:7px;font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#e2e8f0">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap">
        <span id="pfl-lw-privacy-badge" style="padding:3px 7px;border-radius:6px;background:rgba(6,78,59,0.55);border:1px solid #34d399;color:#86efac;font-weight:700">🕶️ PRIVACY SHIELDED</span>
        <div style="display:flex;gap:4px">
          <a href="/livewire/" target="_blank" rel="noopener" class="pfl-std-cbtn" style="text-decoration:none;border-color:#f43f5e;color:#fda4af">🌐 3D Stage ↗</a>
          <button type="button" class="pfl-std-cbtn" id="pfl-lw-refresh-btn" style="border-color:#38bdf8;color:#7dd3fc">⟳</button>
        </div>
      </div>
      <div style="position:relative;width:100%;aspect-ratio:16/9;background:#040812;border:1px solid rgba(56,189,248,0.35);border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center">
        <img id="pfl-lw-push-img" alt="LiveWire 3D Stage" style="display:none;width:100%;height:100%;object-fit:contain" />
        <canvas id="pfl-lw-skel-canvas" width="480" height="270" style="width:100%;height:100%;display:block"></canvas>
        <div id="pfl-lw-stage-cap" style="position:absolute;left:6px;bottom:5px;padding:2px 6px;border-radius:5px;background:rgba(4,8,18,0.82);font-size:9.5px;color:#94a3b8">Sparse Pose Skeleton · waiting for relay</div>
      </div>
      <div id="pfl-lw-metrics" style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;font-size:9.5px;background:rgba(15,23,42,0.75);padding:5px;border-radius:6px;border:1px solid rgba(51,65,85,0.7)">
        <div>Paul: <b id="pfl-lw-paul" style="color:#38bdf8">--</b></div>
        <div>Lisa: <b id="pfl-lw-mood" style="color:#f472b6">--</b></div>
        <div>Zone: <b id="pfl-lw-zone" style="color:#fbbf24">--</b></div>
      </div>
      <div style="background:rgba(8,14,26,0.85);border:1px solid rgba(56,189,248,0.25);border-radius:6px;padding:6px">
        <div style="color:#7dd3fc;font-weight:700;font-size:9.5px;margin-bottom:4px">💬 LIVE SWARM CHAT &amp; MATRIX TEXT</div>
        <div id="pfl-lw-chat-list" style="display:flex;flex-direction:column;gap:3px;max-height:140px;overflow:auto;font-size:10px;line-height:1.3"></div>
      </div>
    </div>
  `;

  let lwPollTimer = 0;
  let lastLwFrameSeq = -1;
  const LW_POSE_PAIRS = [
    ['0', '1'], ['1', '2'], ['2', '3'], ['3', '4'],
    ['1', '5'], ['5', '6'], ['6', '7'], ['1', '8'], ['1', '11'],
    ['8', '9'], ['9', '10'], ['11', '12'], ['12', '13'],
  ];

  function drawSparsePoseCanvas(data) {
    const cvs = livewireWin.body.querySelector('#pfl-lw-skel-canvas');
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    const w = cvs.width, h = cvs.height;
    ctx.fillStyle = '#050914';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(56,189,248,0.16)';
    ctx.lineWidth = 1;
    for (let x = 32; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 32; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    const sp = data?.sparse_pose || {};
    const p2 = sp.paul_joints_2d || {};
    const sx = w / 910, sy = h / 512;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.4;
    for (const [a, b] of LW_POSE_PAIRS) {
      if (p2[a] && p2[b]) {
        ctx.beginPath();
        ctx.moveTo(p2[a][0] * sx, p2[a][1] * sy);
        ctx.lineTo(p2[b][0] * sx, p2[b][1] * sy);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#7dd3fc';
    for (const pt of Object.values(p2)) {
      if (!Array.isArray(pt) || pt.length < 2) continue;
      ctx.beginPath();
      ctx.arc(pt[0] * sx, pt[1] * sy, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    const dz = sp.doll_zones_2d || {};
    ctx.fillStyle = '#f472b6';
    for (const [name, pt] of Object.entries(dz)) {
      if (!Array.isArray(pt) || pt.length < 2) continue;
      ctx.beginPath();
      ctx.arc(pt[0] * sx, pt[1] * sy, 3.0, 0, Math.PI * 2);
      ctx.fill();
      if (name === 'lips_face') {
        ctx.fillStyle = '#f9a8d4';
        ctx.font = 'bold 10px JetBrains Mono, monospace';
        ctx.fillText('Lisa', pt[0] * sx + 5, pt[1] * sy + 3);
        ctx.fillStyle = '#f472b6';
      }
    }
  }

  async function refreshLiveWireMonitor() {
    if (livewireWin.box.style.display === 'none' || livewireWin.box.classList.contains('pfl-minimized')) return;
    try {
      const r = await fetch(`/api/livewire_relay.php?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      const badge = livewireWin.body.querySelector('#pfl-lw-privacy-badge');
      const imgEl = livewireWin.body.querySelector('#pfl-lw-push-img');
      const cvs = livewireWin.body.querySelector('#pfl-lw-skel-canvas');
      const cap = livewireWin.body.querySelector('#pfl-lw-stage-cap');
      const liveCam = Boolean(d.go_live && !d.hide_public_cams && !d.stale);
      if (badge) {
        if (liveCam) {
          badge.textContent = `🔴 LIVE IMAGE + POSE (${Number(d.age_sec || 0).toFixed(1)}s)`;
          badge.style.background = 'rgba(153,27,27,0.72)';
          badge.style.borderColor = '#f87171';
          badge.style.color = '#fecaca';
        } else if (d.relay_active && !d.stale) {
          badge.textContent = '🦴 POSE + CHAT LIVE (CAM SHIELDED)';
          badge.style.background = 'rgba(8,47,73,0.75)';
          badge.style.borderColor = '#38bdf8';
          badge.style.color = '#7dd3fc';
        } else {
          badge.textContent = '🕶️ PRIVACY SHIELDED / STANDBY';
          badge.style.background = 'rgba(6,78,59,0.55)';
          badge.style.borderColor = '#34d399';
          badge.style.color = '#86efac';
        }
      }
      if (imgEl && cvs) {
        if (liveCam && d.image_url) {
          if (d.frame_seq !== lastLwFrameSeq) {
            lastLwFrameSeq = d.frame_seq;
            imgEl.src = `${d.image_url}${d.image_url.includes('?') ? '&' : '?'}seq=${d.frame_seq}&t=${Date.now()}`;
          }
          imgEl.style.display = 'block';
          cvs.style.display = 'none';
          if (cap) cap.textContent = `Clean 3D/Stage Push · seq #${d.frame_seq || 0}`;
        } else {
          imgEl.style.display = 'none';
          cvs.style.display = 'block';
          drawSparsePoseCanvas(d);
          if (cap) cap.textContent = d.stale ? 'Relay idle · flip Go Live in :8093' : 'Sparse 3D Telemetry Mirror (Cam Hidden)';
        }
      }
      const tel = d.telemetry || {};
      const paulEl = livewireWin.body.querySelector('#pfl-lw-paul');
      const moodEl = livewireWin.body.querySelector('#pfl-lw-mood');
      const zoneEl = livewireWin.body.querySelector('#pfl-lw-zone');
      if (paulEl) paulEl.textContent = tel.paul_status || '--';
      if (moodEl) moodEl.textContent = tel.lisa_mood || '--';
      if (zoneEl) zoneEl.textContent = `${tel.contact_zone || 'none'} (sqz ${tel.squeeze_count || 0})`;
      const chatBox = livewireWin.body.querySelector('#pfl-lw-chat-list');
      if (chatBox && Array.isArray(d.chat_feed)) {
        chatBox.replaceChildren();
        for (const msg of d.chat_feed.slice(-8)) {
          const row = document.createElement('div');
          row.style.cssText = 'padding:2px 4px;border-left:2px solid #38bdf8;background:rgba(15,23,42,0.6)';
          const hdr = document.createElement('span');
          hdr.style.color = '#7dd3fc';
          hdr.textContent = `[${msg.ts || ''}] ${msg.speaker || 'Swarm'}: `;
          const body = document.createElement('span');
          body.style.color = '#f1f5f9';
          body.textContent = msg.text || '';
          row.append(hdr, body);
          chatBox.appendChild(row);
        }
        chatBox.scrollTop = chatBox.scrollHeight;
      }
    } catch {}
  }

  window.__pflToggleLiveWireMonitor = (forceOpen) => {
    const isHidden = livewireWin.box.style.display === 'none' || livewireWin.box.classList.contains('pfl-minimized');
    const open = typeof forceOpen === 'boolean' ? forceOpen : isHidden;
    livewireWin.box.style.display = open ? 'flex' : 'none';
    if (open) {
      livewireWin.box.classList.remove('pfl-minimized');
      const mb = livewireWin.box.querySelector('[data-act="min"]');
      if (mb) mb.textContent = '—';
      bringBoxToFront(livewireWin.box);
      refreshLiveWireMonitor();
      clearInterval(lwPollTimer);
      lwPollTimer = setInterval(refreshLiveWireMonitor, 1600);
    } else {
      clearInterval(lwPollTimer);
      lwPollTimer = 0;
    }
    return open;
  };
  livewireWin.body.querySelector('#pfl-lw-refresh-btn')?.addEventListener('click', refreshLiveWireMonitor);

  window.__pflExportStoryForReelStudio = (sceneId = null) => {
    try {
      const director = window.__godsEyeView?.sceneDirector;
      const scenes = director?.storyScenes?.() || [];
      const activeId = sceneId || director?.getPlaybackTimingState?.()?.snapshot?.sceneId || scenes[0]?.id;
      const picked = scenes.find((s) => s.id === activeId) || scenes[0] || {};
      const shots = director?.listShots?.(picked.id || '') || [];
      const payload = {
        format: 'pfl-viral-reel-storyboard-v1',
        exportedAt: new Date().toISOString(),
        storyId: picked.id || 'gev-custom-story',
        title: picked.title || '417 Palm Drive Director Cut',
        fps: 24,
        resolution: '1920x1080',
        fadeSec: 0.45,
        cuts: shots.map((s, idx) => ({
          index: idx + 1,
          id: s.id,
          title: s.title || `Shot ${idx + 1}`,
          startSec: Number(s.startSec || 0),
          durationSec: Number(s.durationSec || 5),
          holdSec: Number(s.holdSec || 2),
          transition: idx === 0 ? 'fade-in' : 'crossfade',
          camera: s.camera || null,
        })),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(payload.storyId || 'story').replace(/[^a-z0-9-_]/gi, '_')}-reel-studio.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      return payload;
    } catch {
      return null;
    }
  };

  const onDragShiftDown = (e) => { if (e.key === 'Shift') dragShiftHeld = true; };
  const onDragShiftUp = (e) => { if (e.key === 'Shift') dragShiftHeld = false; };
  const onDragShiftBlur = () => { dragShiftHeld = false; clearAllPadRepeats(); };
  window.addEventListener('keydown', onDragShiftDown);
  window.addEventListener('keyup', onDragShiftUp);
  window.addEventListener('blur', onDragShiftBlur);

  return {
    destroy() {
      stopDroneAutoOrbit();
      stopFlightPathPlay();
      unlockDroneCamera();
      stopMlsAutoTour();
      stop360TimePlay();
      endDragMovableSession();
      endPanDragSession();
      clearAllPadRepeats();
      if (terrainSyncTimer) clearTimeout(terrainSyncTimer);
      try { if (typeof terrainProviderUnsub === 'function') terrainProviderUnsub(); } catch {}
      try { if (typeof globeTileProgressUnsub === 'function') globeTileProgressUnsub(); } catch {}
      sexWorldDemo.destroy();
      clearInterval(timer);
      clearInterval(kalshiPoll);
      clearInterval(lwPollTimer);
      clearInterval(patrolCycleTimer);
      clearTimeout(scrubTimeout);
      clearInterval(always3dTimer);
      clearInterval(alarmPollTimer);
      clearInterval(vhfBadgeTimer);
      window.removeEventListener('keydown', wasdKeydownHandler);
      window.removeEventListener('keydown', onDragShiftDown);
      window.removeEventListener('keyup', onDragShiftUp);
      window.removeEventListener('blur', onDragShiftBlur);
      document.removeEventListener('click', onDocClickQuickAdd);
      window.removeEventListener('gev:search-pin', onGevSearchPin);
      window.removeEventListener('gev:map-stack-changed', onMapOrTilesSettled);
      window.removeEventListener('gev:google3d-settled', onMapOrTilesSettled);
      try { viewer?.scene?.canvas?.removeEventListener?.('wheel', altWheelLensHandler, { capture: true }); } catch {}
      try { viewer?.entities?.removeById?.(GIZMO_ENTITY_ID); } catch {}
      try { viewer?.entities?.removeById?.(BORDER_ENTITY_ID); viewer?.entities?.removeById?.(HOVER_ENTITY_ID); } catch {}
      try { for (const pid of mlsPinEntityIds) viewer?.entities?.removeById?.(pid); } catch {}
      try { for (const sid of sphereEntityIds) viewer?.entities?.removeById?.(sid); } catch {}
      try { for (const cid of customPhotoEntityIds) viewer?.entities?.removeById?.(cid); } catch {}
      try { for (const nid of navPinEntityIds) viewer?.entities?.removeById?.(nid); navPinEntityIds.clear(); } catch {}
      try { antiEjectionUnsub?.(); } catch {}
      try {
        canvasEl.removeEventListener('pointerdown', onPtrDown, true);
        window.removeEventListener('pointermove', onPtrMove, { capture: true });
        window.removeEventListener('pointerup', onPtrUp, true);
        window.removeEventListener('pointercancel', onPtrUp, true);
        window.removeEventListener('blur', onPtrUp);
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
      try { for (const u of createdGlbUrls) URL.revokeObjectURL(u); createdGlbUrls.length = 0; } catch {}
      try { for (const u of createdPhotoUrls) URL.revokeObjectURL(u); createdPhotoUrls.length = 0; } catch {}
      pickHandler.destroy();
      for (const el of createdEls) el.remove();
    },
  };
}
