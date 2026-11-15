import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PFL_ENTITY_TAXONOMY,
  buildPflNeo4jClusters,
  countUnexpandedNeighbors,
  expandClusterNode,
  loadNeo4jPersonalLayer,
} from './neo4jPersonalLayer.js';
import {
  STARSHIP_FLIGHT15_EVENT,
  STARBASE_PAD1_TOWER,
  STARBASE_MARSH_CAM_POSE,
  SHIP42_CATCH_14_FRAMES,
  formatEventCountdown,
  interpolateShip42State,
  interpolateCatch14Frame,
  projectStarbasePoint,
} from './starshipEventTheater.js';

test('PFL_ENTITY_TAXONOMY defines the exact 5 canonical top-level qualifiers', () => {
  assert.deepEqual(Object.keys(PFL_ENTITY_TAXONOMY), [
    'PERSON',
    'PLACE',
    'THING',
    'IDEA',
    'EVENT',
  ]);
  assert.equal(PFL_ENTITY_TAXONOMY.EVENT.id, 5);
  assert.ok(PFL_ENTITY_TAXONOMY.EVENT.subtypes.includes('milestone'));
  assert.ok(PFL_ENTITY_TAXONOMY.EVENT.subtypes.includes('incident'));
});

test('buildPflNeo4jClusters attaches dossiers and primary source URLs to every node across all 3 constellations', () => {
  const clusters = buildPflNeo4jClusters({
    entity_web: {
      nodes: [
        { name: '#4287 (@all:localhost): Prime Order Sovereign Twin' },
        { name: '#4288 (@all:localhost): Mirror Me Vol 6' },
        { name: '#4289 (@all:localhost): Starbase Telemetry' },
      ],
    },
  });
  assert.equal(clusters.length, 3);
  assert.deepEqual(
    clusters.map((c) => c.id),
    ['liverpool', 'birdpond', 'starbase'],
  );

  for (const cluster of clusters) {
    assert.ok(cluster.nodes.length >= 7, `${cluster.id} has rich node set`);
    for (const node of cluster.nodes) {
      assert.ok(
        node.dossier && node.dossier.length > 20,
        `${node.id} has dossier`,
      );
      assert.ok(
        Array.isArray(node.sources) && node.sources.length >= 1,
        `${node.id} has primary sources`,
      );
      for (const src of node.sources) {
        assert.ok(
          src.url.startsWith('https://') || src.url.startsWith('/'),
          `${node.id} source URL is valid: ${src.url}`,
        );
      }
    }
  }
});

test('expandClusterNode sprouts 2nd-ring Starbase & Nick T3 neighbors at scale-appropriate distances', () => {
  const clusters = buildPflNeo4jClusters();
  const sb = clusters.find((c) => c.id === 'starbase');
  const lv = clusters.find((c) => c.id === 'liverpool');

  assert.equal(
    countUnexpandedNeighbors(sb.nodes, sb.edges, 'sb-flight15-event'),
    2,
  );
  const sbExp = expandClusterNode(sb, 'sb-flight15-event');
  assert.equal(sbExp.newlySprouted, 2);
  assert.deepEqual(sbExp.activatedIds.sort(), [
    'sb-faa-notam',
    'sb-nsf-stream-node',
  ]);
  assert.equal(
    countUnexpandedNeighbors(sb.nodes, sb.edges, 'sb-flight15-event'),
    0,
  );

  // Macro Starbase sprouted node should sit >100m from parent (not 5m yard spacing)
  const parent = sb.nodes.find((n) => n.id === 'sb-flight15-event');
  const child = sb.nodes.find((n) => n.id === 'sb-faa-notam');
  const approxDistM = Math.hypot(
    (child.lat - parent.lat) * 111320,
    (child.lon - parent.lon) * 111320 * Math.cos((parent.lat * Math.PI) / 180),
  );
  assert.ok(
    approxDistM > 150 && approxDistM < 450,
    `Starbase macro spawn distance=${approxDistM}`,
  );

  // Nick Vasilescu node sprouts T3 Code + Parallax open-source studio
  assert.equal(countUnexpandedNeighbors(lv.nodes, lv.edges, 'lv-nick-t3'), 2);
  const lvExp = expandClusterNode(lv, 'lv-nick-t3');
  assert.equal(lvExp.newlySprouted, 2);
  assert.deepEqual(lvExp.activatedIds.sort(), [
    'lv-parallax-repo',
    'lv-t3-codes-thing',
  ]);
});

test('loadNeo4jPersonalLayer supports interactive selectNode, neighbor sprouting, and clean destroy', async () => {
  const added = [];
  const removed = [];
  const mockViewer = {
    entities: {
      add: (opts) => {
        const ent = { ...opts };
        added.push(ent);
        return ent;
      },
      remove: (ent) => removed.push(ent),
    },
  };

  const layer = await loadNeo4jPersonalLayer({
    viewer: mockViewer,
    fetchImpl: async () => ({ ok: false }),
  });

  assert.ok(added.length > 30);
  const sel = layer.selectNode('sb-bilawal-idea', {
    expand: true,
    openHud: true,
  });
  assert.ok(sel);
  assert.equal(sel.clusterId, 'starbase');
  assert.equal(sel.newlySprouted, 1);
  assert.ok(sel.sources.some((s) => s.url.includes('BilawalSidhu')));
  assert.equal(layer.getSelectedNodeId(), 'sb-bilawal-idea');

  layer.destroy();
  assert.equal(removed.length, added.length);
});

test('formatEventCountdown computes T-minus and T-plus strings accurately', () => {
  const target = Date.parse('2026-11-14T21:17:00Z');
  const twoHoursBefore = target - (2 * 3600 + 45 * 60 + 9) * 1000;
  const cd = formatEventCountdown(twoHoursBefore, target);
  assert.equal(cd.formatted, 'T-02:45:09');
  assert.equal(cd.isComplete, false);

  const afterCatch = target + 65 * 1000;
  const cdPost = formatEventCountdown(afterCatch, target);
  assert.equal(cdPost.formatted, 'T+00:01:05');
  assert.equal(cdPost.isComplete, true);
});

test('interpolateShip42State interpolates descent from 115km Entry Interface to 112m Mechazilla Catch', () => {
  const entry = interpolateShip42State(0);
  assert.equal(entry.altM, 115000);
  assert.ok(entry.mach > 24);

  const mid = interpolateShip42State(0.5);
  assert.ok(mid.altM < 60000 && mid.altM > 20000);

  const catchPt = interpolateShip42State(1);
  assert.equal(catchPt.altM, 112);
  assert.equal(catchPt.lat, STARSHIP_FLIGHT15_EVENT.starbasePad2.lat);
  assert.equal(catchPt.lon, STARSHIP_FLIGHT15_EVENT.starbasePad2.lon);
});

test('STARBASE_MARSH_CAM_POSE and SHIP42_CATCH_14_FRAMES match triangulated composite trajectory', () => {
  assert.equal(STARBASE_MARSH_CAM_POSE.lat, 25.9899);
  assert.equal(STARBASE_MARSH_CAM_POSE.lon, -97.17764);
  assert.equal(STARBASE_MARSH_CAM_POSE.altM, 3.5);
  assert.equal(STARBASE_MARSH_CAM_POSE.headingDeg, 66.73);
  assert.equal(STARBASE_MARSH_CAM_POSE.pitchDeg, 14.78);
  assert.equal(STARBASE_MARSH_CAM_POSE.modelUrl, '/models/starship_s42.glb');

  assert.equal(SHIP42_CATCH_14_FRAMES.length, 14);
  assert.equal(SHIP42_CATCH_14_FRAMES[0].altM, 1066);
  assert.equal(SHIP42_CATCH_14_FRAMES[0].pitchDeg, 3);
  assert.equal(SHIP42_CATCH_14_FRAMES[0].throttle, 0);

  // Strictly monotonic descent from Frame 1 (1,066 m) to Frame 14 (127 m)
  for (let i = 1; i < SHIP42_CATCH_14_FRAMES.length; i++) {
    assert.ok(
      SHIP42_CATCH_14_FRAMES[i].altM < SHIP42_CATCH_14_FRAMES[i - 1].altM,
      `Frame ${i + 1} altM descends monotonically`,
    );
  }

  // Raptor engines burn through Frames 5-13
  for (let i = 4; i <= 12; i++) {
    assert.ok(
      SHIP42_CATCH_14_FRAMES[i].throttle >= 0.6,
      `Frame ${i + 1} Raptor burn active`,
    );
  }

  const f14 = SHIP42_CATCH_14_FRAMES[13];
  assert.equal(f14.frame, 14);
  assert.equal(f14.altM, 127);
  assert.equal(f14.pitchDeg, 90);
  const pad2DistM = Math.hypot(
    (f14.lat - STARSHIP_FLIGHT15_EVENT.starbasePad2.lat) * 110790,
    (f14.lon - STARSHIP_FLIGHT15_EVENT.starbasePad2.lon) *
      111320 *
      Math.cos((25.99677 * Math.PI) / 180),
  );
  assert.ok(
    pad2DistM < 32,
    `Frame 14 rests inside Pad 2 chopsticks (${pad2DistM.toFixed(1)}m)`,
  );
});

test('interpolateCatch14Frame & projectStarbasePoint register Pad 2, Pad 1, and 14 frames in 682x1024 lens', () => {
  const start = interpolateCatch14Frame(0);
  const mid = interpolateCatch14Frame(0.5);
  const end = interpolateCatch14Frame(1);
  assert.equal(start.frameNearest, 1);
  assert.equal(start.altM, 1066);
  assert.ok(mid.altM < 650 && mid.altM > 400);
  assert.equal(end.frameNearest, 14);
  assert.equal(end.altM, 127);

  const clamped = interpolateCatch14Frame(2.5);
  assert.equal(clamped.u, 1);

  const pad2Base = projectStarbasePoint(
    STARSHIP_FLIGHT15_EVENT.starbasePad2,
    STARBASE_MARSH_CAM_POSE,
    682,
    1024,
  );
  const pad2Top = projectStarbasePoint(
    { ...STARSHIP_FLIGHT15_EVENT.starbasePad2, altM: 8 + 146 },
    STARBASE_MARSH_CAM_POSE,
    682,
    1024,
  );
  const pad1Base = projectStarbasePoint(
    STARBASE_PAD1_TOWER,
    STARBASE_MARSH_CAM_POSE,
    682,
    1024,
  );
  const pad1Top = projectStarbasePoint(
    { ...STARBASE_PAD1_TOWER, altM: STARBASE_PAD1_TOWER.altM + 146 },
    STARBASE_MARSH_CAM_POSE,
    682,
    1024,
  );

  // Pixel-locked registration against composite photograph (Pad 2 at x~405, Pad 1 at x~541, y_top=831/848, y_bot~955)
  assert.ok(
    Math.abs(pad2Top.x - 406) < 4,
    `Pad 2 X locked near 406px (got ${pad2Top.x.toFixed(1)})`,
  );
  assert.ok(
    Math.abs(pad2Top.y - 831) < 4,
    `Pad 2 top Y locked near 831px (got ${pad2Top.y.toFixed(1)})`,
  );
  assert.ok(
    Math.abs(pad1Top.x - 541) < 5,
    `Pad 1 X locked near 541px (got ${pad1Top.x.toFixed(1)})`,
  );
  assert.ok(
    Math.abs(pad1Top.y - 848) < 4,
    `Pad 1 top Y locked near 848px (got ${pad1Top.y.toFixed(1)})`,
  );
  assert.ok(
    pad2Base.y > 945 && pad1Base.y > 945,
    'Towers sit cleanly on Boca Chica horizon (~955px)',
  );
  assert.ok(
    pad2Base.y - pad2Top.y > pad1Base.y - pad1Top.y,
    'Pad 2 appears taller than Pad 1',
  );

  // Frame 1 upper-left sky (118, 75); Frame 14 caught at Pad 2 chopsticks (428, 855)
  const p1 = projectStarbasePoint(
    SHIP42_CATCH_14_FRAMES[0],
    STARBASE_MARSH_CAM_POSE,
    682,
    1024,
  );
  const p14 = projectStarbasePoint(
    SHIP42_CATCH_14_FRAMES[13],
    STARBASE_MARSH_CAM_POSE,
    682,
    1024,
  );
  assert.ok(
    p1.inView && Math.hypot(p1.x - 118.4, p1.y - 75.4) < 4,
    `Frame 1 locked (${p1.x.toFixed(1)}, ${p1.y.toFixed(1)})`,
  );
  assert.ok(
    p14.inView && Math.hypot(p14.x - 427.8, p14.y - 854.8) < 4,
    `Frame 14 caught at Pad 2 (${p14.x.toFixed(1)}, ${p14.y.toFixed(1)})`,
  );
});
