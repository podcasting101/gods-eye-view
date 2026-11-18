import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import {
  buildBrokerBrief,
  compFacts,
  escapeHtml,
  initVirtualRealtorAgent,
  money,
  ringRadiusMeters,
  speechSafe,
} from './virtualRealtorAgent.js';

const SOLD = {
  id: 'cur-106-palm',
  kind: 'sold',
  badge: 'SOLD $400K',
  address: '106 Palm Dr CR 776, Liverpool TX 77577',
  lat: 29.24604,
  lon: -95.23582,
  sqft: 1120,
  price: 399900,
  valueUsd: 399900,
  valueType: 'sold',
  soldDate: '2026-03-20',
  waterfront: true,
  appraised: 265770,
  estTaxPerYear: 4996,
  bcadUrl: 'https://propaccess.trueautomation.com/clientdb/Property.aspx?cid=51&prop_id=214154',
  zillowUrl: 'https://www.zillow.com/homes/106-Palm_rb/',
};
const DEED = {
  id: 'bcad-1',
  kind: 'deed',
  badge: 'DEED 2026',
  address: '212 Dehart St',
  lat: 29.2507,
  lon: -95.2361,
  acres: 0.519,
  appraised: 132045,
  valueUsd: 132045,
  valueType: 'appraised',
  instrument: '2026000336',
  deedYear: 2026,
  estTaxPerYear: 2482,
  owner: 'TRIBBLE JENNIFER',
  bcadUrl: 'https://propaccess.trueautomation.com/clientdb/Property.aspx?cid=51&prop_id=248889',
  zillowUrl: 'https://www.zillow.com/homes/212-Dehart_rb/',
};
const NEIGHBOR = { ...DEED, id: 'bcad-n', kind: 'neighbor', badge: 'BCAD $100K' };
const METRICS = {
  waterfrontPremiumPct: 34,
  medianBcadPerAcre: 320000,
  medianSoldPerSqft: 312,
  deedCount: 1,
  ave: { low: 800000, mid: 950000, high: 1090000 },
  pitch: { lisa: '👑 Lisa Muse: pitch', harry: '🕵️ Harry: notes' },
  disclaimer: 'test',
};
const payload = (site) => ({
  ok: true,
  site,
  count: 3,
  live: { parcels: 2, cached: false, error: null },
  metrics: METRICS,
  comps: [SOLD, DEED, NEIGHBOR],
});

test('pure helpers format facts and briefs', () => {
  assert.equal(money(399900), '$399,900');
  assert.equal(money(0), '—');
  assert.equal(escapeHtml('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
  assert.ok(ringRadiusMeters(0.5) >= 12 && ringRadiusMeters(500) === 120 && ringRadiusMeters(null) === 12);
  const f = compFacts(SOLD);
  assert.equal(f.valueLabel, 'Sold Price');
  assert.equal(f.perSqft, 357);
  assert.equal(compFacts(DEED).deed, '2026000336 (2026)');
  const brief = buildBrokerBrief(SOLD, METRICS);
  assert.match(brief.text, /Virtual Realtor Tour Brief/);
  assert.match(brief.speech, /Closed 2026-03-20 at \$399,900/);
  assert.match(brief.speech, /34 percent premium/);
  assert.doesNotMatch(speechSafe(brief.text), /https?:|👑/);
});

test('initVirtualRealtorAgent is a safe no-op without a DOM or viewer', () => {
  const api = initVirtualRealtorAgent(null);
  assert.equal(typeof api.destroy, 'function');
  api.destroy();
});

test('panel, launcher, canvas pins (no labels), click-to-brief and teardown', async () => {
  const win = new Window({ url: 'http://127.0.0.1:4173/' });
  const saved = { document: globalThis.document, window: globalThis.window };
  globalThis.window = win;
  globalThis.document = win.document;
  try {
    win.document.body.innerHTML =
      '<div id="pfl-win-command-dock"><div class="pfl-std-body"></div></div>';
    const added = [];
    const flights = [];
    const viewer = {
      scene: {
        canvas: win.document.createElement('canvas'),
        globe: { show: false },
        pick: () => undefined,
        requestRender() {},
      },
      camera: { flyToBoundingSphere: (...args) => flights.push(args) },
      entities: {
        add(options) {
          const ent = { ...options };
          added.push(ent);
          return ent;
        },
        remove(ent) {
          const i = added.indexOf(ent);
          if (i >= 0) added.splice(i, 1);
        },
      },
    };
    const urls = [];
    let clickHandler = null;
    let unsubscribed = false;
    const api = initVirtualRealtorAgent(viewer, {
      inputFor: () => ({
        onClick: (fn) => {
          clickHandler = fn;
          return () => {
            unsubscribed = true;
          };
        },
      }),
      fetchImpl: async (url) => {
        urls.push(url);
        return { ok: true, status: 200, json: async () => payload(new URL(url, 'http://x').searchParams.get('site')) };
      },
    });

    const panel = win.document.getElementById('pfl-win-virtual-realtor');
    const launcher = win.document.querySelector('#pfl-win-command-dock .pfl-std-body #pfl-btn-virtual-realtor');
    assert.ok(panel && launcher, 'panel + launcher mounted in command dock');
    assert.equal(panel.classList.contains('pfl-vr-open'), false, 'starts hidden');
    assert.equal(added.length, 0, 'no pins until toggled ON');

    launcher.click();
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(panel.classList.contains('pfl-vr-open'));
    assert.match(launcher.textContent, /ON/);
    assert.deepEqual(urls.map((u) => u.split('?')[1].split('&')[0]).sort(), ['site=liverpool', 'site=sweeny']);
    // per site: SOLD, DEED, NEIGHBOR rings + SOLD, DEED pins = 5 entities
    assert.equal(added.length, 10);
    assert.ok(added.every((e) => !('label' in e)), 'zero label graphics');
    const pins = added.filter((e) => e.billboard);
    assert.equal(pins.length, 4);
    assert.ok(pins.every((p) => p._pflRealtorComp?.id));
    assert.ok(added.filter((e) => e.ellipse).length >= 6);

    const row = [...panel.querySelectorAll('tr.pfl-vr-row')].find((r) => r.dataset.id === 'cur-106-palm');
    assert.ok(row);
    row.click();
    assert.equal(flights.length, 1, 'flies to property');
    assert.ok(added.some((e) => e.id === 'pfl-realtor-highlight'), 'highlights');
    const bcad = panel.querySelector('#pfl-vr-bcad');
    assert.match(bcad.getAttribute('href'), /propaccess\.trueautomation\.com.*prop_id=214154/);
    assert.ok(panel.querySelector('#pfl-vr-zillow'));
    assert.match(panel.querySelector('#pfl-vr-speak').textContent, /Speak Broker Pitch/);
    assert.match(panel.textContent, /Sold Price:\s*\$399,900/);

    window.__pflOpenVirtualRealtor();
    assert.equal(typeof win.__pflOpenVirtualRealtor, 'function');

    // Clicking a 3D pin (LEFT_CLICK via the dispatcher) selects its comp.
    const deedPin = pins.find((p) => p._pflRealtorComp.id === 'bcad-1');
    clickHandler({ pick: { id: deedPin }, screenPosition: { x: 1, y: 1 } });
    assert.equal(flights.length, 2);
    assert.match(panel.querySelector('#pfl-vr-bcad').getAttribute('href'), /prop_id=248889/);
    assert.match(panel.textContent, /Deed #:\s*2026000336 \(2026\)/);
    clickHandler({ pick: { id: {} }, screenPosition: { x: 1, y: 1 } });
    assert.equal(flights.length, 2, 'non-realtor picks are ignored');

    launcher.click();
    assert.equal(panel.classList.contains('pfl-vr-open'), false);
    assert.equal(added.length, 0, 'pins removed when OFF');

    api.destroy();
    assert.equal(unsubscribed, true);
    assert.equal(win.document.getElementById('pfl-win-virtual-realtor'), null);
    assert.equal(win.document.getElementById('pfl-btn-virtual-realtor'), null);
  } finally {
    globalThis.document = saved.document;
    globalThis.window = saved.window;
    await win.happyDOM.close();
  }
});
