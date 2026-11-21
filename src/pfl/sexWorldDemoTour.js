import * as Cesium from 'cesium';
import {
  governorRequestRender,
  holdContinuousRender,
  releaseContinuousRender,
} from '../renderGovernor.js';

/**
 * Interactive & auto-playing 6-stop Global Showcase Demo for Sex-World.ai
 * ("Adult-Themed Global Events, Luxury Hospitality & 3D Sanctuary").
 *
 * Strictly complies with `noCesiumLabels.test.mjs`: zero Cesium Label/LabelGraphics
 * usage — renders `<canvas>` beacon billboards + glowing points only.
 */

const DEMO_PIN_ID = 'pfl-sexworld-demo-pin';
const DEMO_HOLD_FLY = 'sexworld-demo-fly';

export const SEX_WORLD_DEMO_STOPS = Object.freeze([
  {
    id: 'global-pulse',
    badge: 'GLOBAL ORBIT & ODDS',
    title: 'Global Live Orbit & Polymarket Pulse',
    subtitle: 'Real-time CelesTrak orbital pass + geocoded live global prediction odds across Americas, Europe, Levant & Asia.',
    lat: 28.0,
    lon: -42.0,
    altM: 11500000,
    headingDeg: 0,
    pitchDeg: -88,
    durationS: 2.0,
    holdMs: 7000,
    pinTag: '🌍 GLOBAL PULSE',
  },
  {
    id: 'vegas-strip',
    badge: 'NORTH AMERICA NIGHTLIFE',
    title: 'Las Vegas Strip — Luxury Hospitality & Adult Entertainment Corridor',
    subtitle: 'Instant 3D flyover of iconic entertainment resorts — toggle VISUAL → Google 3D for full 3D skyline architecture.',
    lat: 36.1147,
    lon: -115.1728,
    altM: 680,
    headingDeg: 12,
    pitchDeg: -34,
    durationS: 2.2,
    holdMs: 7500,
    pinTag: '🎰 LAS VEGAS STRIP',
  },
  {
    id: 'amsterdam-canal',
    badge: 'EUROPEAN SANCTUARY HUB',
    title: 'Amsterdam Historic Canal District — European Adult Sanctuary',
    subtitle: 'Connected global weather radar, air/maritime traffic & European sanctuary hubs linked to Sex-World.ai.',
    lat: 52.3731,
    lon: 4.8922,
    altM: 560,
    headingDeg: 35,
    pitchDeg: -36,
    durationS: 2.2,
    holdMs: 7500,
    pinTag: '💎 AMSTERDAM HUB',
  },
  {
    id: 'starbase-tx',
    badge: '4D LAUNCH THEATER',
    title: 'Starbase Boca Chica — Live 4D Starship Flight 15 Theater',
    subtitle: 'Telemetry-driven Mechazilla catch & orbital launch simulation pinned directly onto the Texas Gulf Coast.',
    lat: 25.99677,
    lon: -97.15799,
    altM: 950,
    headingDeg: 145,
    pitchDeg: -32,
    durationS: 2.2,
    holdMs: 7500,
    pinTag: '🚀 STARBASE PAD 2',
  },
  {
    id: 'liverpool-hq',
    badge: 'WATERFRONT ESTATE',
    title: '417 Palm Drive — Waterfront Sanctuary, 3D Villa & Interior Walkthrough',
    subtitle: 'Interactive 3D coastal estate, 40ft Monaco Coach, live Wyze cameras & 32-photo 2-story interior tour.',
    lat: 29.2483,
    lon: -95.2313,
    altM: 58,
    headingDeg: 196,
    pitchDeg: -23,
    durationS: 2.3,
    holdMs: 8500,
    relativeGround: true,
    fallbackGroundM: -26.19,
    pinTag: '👑 417 PALM DR',
    actionLabel: '🏠 Walk Inside 417 Palm Dr',
  },
  {
    id: 'fawn-creek-pin',
    badge: 'ADDRESS PINNING',
    title: 'House-Level Address Search & Clickable Pins — 4006 Fawn Creek Dr',
    subtitle: 'Type any street address in LOCATION to zoom directly onto the rooftop and drop a saved navigation pin.',
    lat: 30.065543,
    lon: -95.202311,
    altM: 165,
    headingDeg: 15,
    pitchDeg: -42,
    durationS: 2.1,
    holdMs: 8000,
    pinTag: '📍 4006 FAWN CREEK DR',
  },
]);

function makeDemoPinCanvas(tag, subTitle) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 68;
  const ctx = c.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = 'rgba(9, 14, 26, 0.94)';
  ctx.beginPath();
  ctx.roundRect(4, 4, 312, 46, 10);
  ctx.fill();

  const grad = ctx.createLinearGradient(4, 4, 316, 50);
  grad.addColorStop(0, '#ec4899');
  grad.addColorStop(0.5, '#facc15');
  grad.addColorStop(1, '#38bdf8');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.roundRect(4, 4, 312, 46, 10);
  ctx.stroke();

  // Pointer stem at bottom center
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.moveTo(152, 50);
  ctx.lineTo(168, 50);
  ctx.lineTo(160, 64);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#fde047';
  ctx.font = '800 12px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(String(tag || '').slice(0, 30), 160, 10);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '600 11px "Inter", system-ui, sans-serif';
  ctx.fillText(String(subTitle || '').slice(0, 38), 160, 29);

  return c;
}

function safeSurfaceHeight(viewer, lon, lat, fallbackM = 0) {
  try {
    if (viewer?.scene?.globe?.show !== false) {
      const gh = viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(lon, lat));
      if (Number.isFinite(gh) && gh > -80 && gh < 5000) return gh;
    }
    const sh = viewer?.scene?.sampleHeight?.(Cesium.Cartographic.fromDegrees(lon, lat));
    if (Number.isFinite(sh) && sh > -80 && sh < 5000) return sh;
  } catch {}
  return Number.isFinite(fallbackM) ? fallbackM : 0;
}

export function createSexWorldDemoTour({
  viewer,
  onBeforeFly = null,
  onOpenMlsWalkthrough = null,
} = {}) {
  let running = false;
  let autoPlay = true;
  let currentIdx = 0;
  let advanceTimer = null;
  let cardEl = null;

  const clearTimer = () => {
    if (advanceTimer !== null) {
      clearTimeout(advanceTimer);
      advanceTimer = null;
    }
  };

  const removePin = () => {
    try { viewer?.entities?.removeById?.(DEMO_PIN_ID); } catch {}
  };

  const renderPin = (stop) => {
    if (!viewer?.entities || !stop) return;
    removePin();
    const img = makeDemoPinCanvas(stop.pinTag || stop.badge, stop.title);
    viewer.entities.add({
      id: DEMO_PIN_ID,
      name: `🎬 ${stop.title}`,
      position: Cesium.Cartesian3.fromDegrees(stop.lon, stop.lat, 3),
      point: {
        pixelSize: 11,
        color: Cesium.Color.fromCssColorString('#ec4899'),
        outlineColor: Cesium.Color.fromCssColorString('#fde047'),
        outlineWidth: 2.5,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      ...(img
        ? {
            billboard: {
              image: img,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -10),
              heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              eyeOffset: new Cesium.Cartesian3(0, 0, -12),
            },
          }
        : {}),
    });
    governorRequestRender('sexworld-demo-pin');
  };

  const ensureCard = () => {
    if (typeof document === 'undefined' || cardEl) return cardEl;
    cardEl = document.createElement('div');
    cardEl.id = 'pfl-sexworld-demo-card';
    cardEl.style.cssText = [
      'position:fixed',
      'left:50%',
      'top:54px',
      'transform:translateX(-50%)',
      'width:min(540px, calc(100vw - 24px))',
      'z-index:9820',
      'display:none',
      'flex-direction:column',
      'gap:8px',
      'padding:12px 14px',
      'border-radius:14px',
      'background:linear-gradient(145deg, rgba(15, 12, 28, 0.94), rgba(9, 14, 26, 0.94))',
      'border:1.5px solid rgba(236, 72, 153, 0.72)',
      'box-shadow:0 18px 46px rgba(0, 0, 0, 0.72)',
      'backdrop-filter:blur(12px)',
      'font-family:"Inter", system-ui, sans-serif',
      'color:#f8fafc',
    ].join(';');
    document.body.appendChild(cardEl);
    return cardEl;
  };

  const syncCard = () => {
    if (!running || typeof document === 'undefined') {
      if (cardEl) cardEl.style.display = 'none';
      return;
    }
    const el = ensureCard();
    if (!el) return;
    const stop = SEX_WORLD_DEMO_STOPS[currentIdx] || SEX_WORLD_DEMO_STOPS[0];
    const dots = SEX_WORLD_DEMO_STOPS.map((s, idx) => {
      const active = idx === currentIdx;
      return `<button type="button" data-demo-idx="${idx}" title="${s.title}" style="border:none;border-radius:999px;height:8px;width:${active ? '22px' : '8px'};cursor:pointer;background:${active ? '#facc15' : 'rgba(148,163,184,0.45)'};padding:0;transition:width .18s"></button>`;
    }).join('');

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <span style="font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:800;color:#f472b6;letter-spacing:.06em">
          🎬 SEX-WORLD.AI SHOWCASE · STOP ${currentIdx + 1} / ${SEX_WORLD_DEMO_STOPS.length} · ${stop.badge}
        </span>
        <button type="button" id="pfl-demo-exit" style="background:rgba(15,23,42,0.9);border:1px solid rgba(244,63,94,0.6);color:#fda4af;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;cursor:pointer">✕ Exit Demo</button>
      </div>
      <div style="font-size:14.5px;font-weight:800;color:#fde047;line-height:1.25">${stop.title}</div>
      <div style="font-size:12px;color:#cbd5e1;line-height:1.4">${stop.subtitle}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding-top:4px;border-top:1px solid rgba(148,163,184,0.2)">
        <div style="display:flex;align-items:center;gap:5px">${dots}</div>
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
          ${stop.actionLabel ? `<button type="button" id="pfl-demo-stop-action" style="background:rgba(251,191,36,0.16);border:1px solid #fbbf24;color:#fde047;border-radius:6px;padding:3px 9px;font-size:11px;font-weight:700;cursor:pointer">${stop.actionLabel}</button>` : ''}
          <a href="https://sex-world.ai/sanctuary/" target="_blank" rel="noopener" style="background:rgba(236,72,153,0.16);border:1px solid rgba(236,72,153,0.65);color:#f9a8d4;border-radius:6px;padding:3px 9px;font-size:11px;font-weight:700;text-decoration:none">🥂 Sanctuary ↗</a>
          <button type="button" id="pfl-demo-prev" style="background:rgba(15,23,42,0.9);border:1px solid rgba(56,189,248,0.45);color:#e2e8f0;border-radius:6px;padding:3px 9px;font-size:11px;font-weight:700;cursor:pointer">⏮ Prev</button>
          <button type="button" id="pfl-demo-playpause" style="background:rgba(34,197,94,0.18);border:1px solid #4ade80;color:#86efac;border-radius:6px;padding:3px 9px;font-size:11px;font-weight:700;cursor:pointer">${autoPlay ? '⏸ Pause' : '▶ Auto-Play'}</button>
          <button type="button" id="pfl-demo-next" style="background:rgba(56,189,248,0.22);border:1px solid #38bdf8;color:#7dd3fc;border-radius:6px;padding:3px 9px;font-size:11px;font-weight:700;cursor:pointer">⏭ Next</button>
        </div>
      </div>
    `;
    el.style.display = 'flex';

    el.querySelector('#pfl-demo-exit')?.addEventListener('click', () => stop());
    el.querySelector('#pfl-demo-prev')?.addEventListener('click', () => prev());
    el.querySelector('#pfl-demo-next')?.addEventListener('click', () => next());
    el.querySelector('#pfl-demo-playpause')?.addEventListener('click', () => {
      autoPlay = !autoPlay;
      clearTimer();
      syncCard();
      if (autoPlay && running) scheduleNext(SEX_WORLD_DEMO_STOPS[currentIdx]?.holdMs || 7500);
    });
    el.querySelector('#pfl-demo-stop-action')?.addEventListener('click', () => {
      autoPlay = false;
      clearTimer();
      syncCard();
      if (typeof onOpenMlsWalkthrough === 'function') onOpenMlsWalkthrough();
    });
    el.querySelectorAll('[data-demo-idx]')?.forEach((btn) => {
      btn.addEventListener('click', () => goTo(Number(btn.getAttribute('data-demo-idx')) || 0));
    });
  };

  const scheduleNext = (ms) => {
    clearTimer();
    if (!running || !autoPlay) return;
    advanceTimer = setTimeout(() => {
      if (running && autoPlay) next();
    }, ms);
  };

  const goTo = (index) => {
    const len = SEX_WORLD_DEMO_STOPS.length;
    currentIdx = ((index % len) + len) % len;
    const stopItem = SEX_WORLD_DEMO_STOPS[currentIdx];
    running = true;
    clearTimer();
    try { onBeforeFly?.(); } catch {}
    renderPin(stopItem);
    syncCard();

    if (viewer?.camera) {
      try { viewer.trackedEntity = undefined; viewer.selectedEntity = undefined; } catch {}
      const baseH = stopItem.relativeGround
        ? safeSurfaceHeight(viewer, stopItem.lon, stopItem.lat, stopItem.fallbackGroundM ?? 0)
        : 0;
      const targetAlt = baseH + stopItem.altM;
      holdContinuousRender(DEMO_HOLD_FLY);
      const releaseFlight = () => {
        releaseContinuousRender(DEMO_HOLD_FLY);
        governorRequestRender('sexworld-demo-arrived');
      };
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(stopItem.lon, stopItem.lat, targetAlt),
        orientation: {
          heading: Cesium.Math.toRadians(stopItem.headingDeg || 0),
          pitch: Cesium.Math.toRadians(stopItem.pitchDeg || -35),
          roll: 0,
        },
        duration: stopItem.durationS || 2.2,
        complete: releaseFlight,
        cancel: releaseFlight,
      });
    }
    scheduleNext(stopItem.holdMs || 7500);
    return { index: currentIdx, stop: stopItem };
  };

  const start = (index = 0) => {
    autoPlay = true;
    return goTo(index);
  };

  const next = () => goTo(currentIdx + 1);
  const prev = () => goTo(currentIdx - 1);

  const stop = () => {
    running = false;
    clearTimer();
    releaseContinuousRender(DEMO_HOLD_FLY);
    removePin();
    if (cardEl) cardEl.style.display = 'none';
    governorRequestRender('sexworld-demo-stop');
  };

  const destroy = () => {
    stop();
    if (cardEl) {
      cardEl.remove();
      cardEl = null;
    }
  };

  if (typeof window !== 'undefined') {
    window.__pflSexWorldDemo = {
      start,
      stop,
      next,
      prev,
      goTo,
      isRunning: () => running,
      currentIndex: () => currentIdx,
      stops: SEX_WORLD_DEMO_STOPS,
    };
  }

  return { start, stop, next, prev, goTo, destroy };
}
