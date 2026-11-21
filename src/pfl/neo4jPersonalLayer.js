import * as Cesium from 'cesium';
import {
  claimPointer,
  isPointerFree,
  releasePointer,
} from '../data/inputOwnership.js';
import {
  governorRequestRender,
  holdContinuousRender,
  releaseContinuousRender,
} from '../renderGovernor.js';
import {
  METERS_PER_DEG_LAT,
  applySavedNeo4jGraphState,
  createGraphEdge,
  createGraphNode,
  expandNodeNeighbors,
  getConnectedComponentIds,
  metersPerDegLon,
  serializeNeo4jGraphState,
  spawnNeighborPosition,
  stepNeo4jForceSimulation,
} from './neo4jForceGraph.js';
import { STORED_GROUND_HEIGHT_M } from './placedObjects.js';

/**
 * Canonical 5 Top-Level PFL / Neo4j Qualifiers from `public.entity_taxonomy` (level = 0).
 */
export const PFL_ENTITY_TAXONOMY = Object.freeze({
  PERSON: Object.freeze({
    id: 1,
    name: 'PERSON',
    color: '#38bdf8',
    description: 'Human or human-like identity',
    subtypes: Object.freeze([
      'human_contact',
      'industry_figure',
      'agent',
      'persona_hat',
    ]),
  }),
  PLACE: Object.freeze({
    id: 2,
    name: 'PLACE',
    color: '#22c55e',
    description: 'Physical or virtual location',
    subtypes: Object.freeze(['location', 'property', 'virtual_space']),
  }),
  THING: Object.freeze({
    id: 3,
    name: 'THING',
    color: '#2dd4bf',
    description: 'Tangible or organizational object',
    subtypes: Object.freeze([
      'company',
      'product_system',
      'document',
      'object',
    ]),
  }),
  IDEA: Object.freeze({
    id: 4,
    name: 'IDEA',
    color: '#a855f7',
    description: 'Concept, rule, framework, value',
    subtypes: Object.freeze([
      'concept',
      'business_concept',
      'golden_rule',
      'framework',
    ]),
  }),
  EVENT: Object.freeze({
    id: 5,
    name: 'EVENT',
    color: '#f97316',
    description:
      'Something that happened or will happen (4th-dimension Time anchor)',
    subtypes: Object.freeze(['milestone', 'incident', 'announcement']),
  }),
});

export const NEO4J_ANCHOR_ORIGINS = Object.freeze({
  liverpool: Object.freeze({
    id: 'liverpool',
    name: 'PFL Liverpool Sovereign Node',
    lat: 29.24752,
    lon: -95.23144,
    alt: STORED_GROUND_HEIGHT_M + 4.4,
    minAlt: STORED_GROUND_HEIGHT_M + 2.1,
    maxAlt: STORED_GROUND_HEIGHT_M + 12.5,
    spawnRadiusM: 6.8,
    altSpreadM: 0.75,
    cameraOffsetDeg: 0.00024,
    cameraAltLiftM: 12.0,
  }),
  birdpond: Object.freeze({
    id: 'birdpond',
    name: 'PFL Bird Pond — Pepper Way',
    lat: 29.13912,
    lon: -95.80479,
    alt: -13.6,
    minAlt: -16.0,
    maxAlt: -5.0,
    spawnRadiusM: 6.8,
    altSpreadM: 0.75,
    cameraOffsetDeg: 0.00026,
    cameraAltLiftM: 14.0,
  }),
  starbase: Object.freeze({
    id: 'starbase',
    name: 'SpaceX Starbase Orbital Pad 2',
    lat: 25.99677,
    lon: -97.15799,
    alt: 185.0,
    minAlt: 55.0,
    maxAlt: 380.0,
    spawnRadiusM: 285.0,
    altSpreadM: 34.0,
    cameraOffsetDeg: 0.011,
    cameraAltLiftM: 420.0,
  }),
});

const STORAGE_PREFIX = 'pfl_neo4j_cluster_v2_';
const NEO4J_LOOKUP_URL = 'https://elitespyworlds.com/birdpond/neo4j_lookup.php';

const EXTERNAL_ENTITY_NODE_MAP = Object.freeze({
  'pfl-f15-mechazilla-tower': 'sb-pad2-place',
  'pfl-f15-ship42-live-marker': 'sb-ship42-thing',
  'pfl-f15-booster22-zone': 'sb-booster22-thing',
  'pfl-f15-hazard-box': 'sb-faa-notam',
  'lisa-muse-sovereign-anchor': 'lv-lisa-muse',
});

function createRichNode({
  dossier = '',
  sources = [],
  streamId = null,
  eventTimeIso = null,
  ...base
}) {
  const node = createGraphNode(base);
  node.dossier = String(dossier || base.note || '');
  node.sources = Array.isArray(sources)
    ? sources.map((s) => ({
        title: String(s.title || s.label || 'Original Source'),
        url: String(s.url || ''),
        badge: String(s.badge || 'Source'),
        streamId: s.streamId ? String(s.streamId) : null,
      }))
    : [];
  node.streamId = streamId ? String(streamId) : null;
  node.eventTimeIso = eventTimeIso ? String(eventTimeIso) : null;
  return node;
}

/**
 * Counts unexpanded inactive neighbors in a cluster for the (+N) sphere badge.
 */
export function countUnexpandedNeighbors(nodes = [], edges = [], nodeId) {
  let count = 0;
  for (const e of edges) {
    const otherId = e.from === nodeId ? e.to : e.to === nodeId ? e.from : null;
    if (!otherId) continue;
    const nb = nodes.find((x) => x.id === otherId);
    if (nb && !nb.active) count++;
  }
  return count;
}

/**
 * Expands a node's 2nd-ring neighbors using `expandNodeNeighbors` + `spawnNeighborPosition`
 * scaled to the cluster's physical footprint (e.g. 285m at Starbase vs 6.8m at Liverpool/Bird Pond).
 */
export function expandClusterNode(cluster, nodeId) {
  if (!cluster) return { newlySprouted: 0, activatedIds: [], node: null };
  const target = cluster.nodes.find((n) => n.id === nodeId);
  if (!target) return { newlySprouted: 0, activatedIds: [], node: null };

  const previouslyInactive = new Set(
    cluster.nodes.filter((n) => !n.active).map((n) => n.id),
  );
  const res = expandNodeNeighbors(cluster.nodes, cluster.edges, nodeId);

  const newlyActivated = cluster.nodes.filter(
    (n) => n.active && previouslyInactive.has(n.id),
  );
  const origin = cluster.origin || NEO4J_ANCHOR_ORIGINS.liverpool;
  const radiusM = origin.spawnRadiusM || 6.8;
  const altSpreadM = origin.altSpreadM || 0.75;

  newlyActivated.forEach((nb, idx) => {
    const pos = spawnNeighborPosition(target, idx, newlyActivated.length, {
      radiusM,
      origin,
    });
    nb.lat = pos.lat;
    nb.lon = pos.lon;
    nb.alt = Math.max(
      origin.minAlt,
      Math.min(origin.maxAlt, target.alt + ((idx % 3) - 1) * altSpreadM),
    );
    nb.x2d = pos.x2d;
    nb.y2d = pos.y2d;
  });

  // Activate any edge connecting two active nodes
  for (const edge of cluster.edges) {
    const a = cluster.nodes.find((n) => n.id === edge.from);
    const b = cluster.nodes.find((n) => n.id === edge.to);
    if (a?.active && b?.active) {
      edge.active = true;
    }
  }

  return {
    newlySprouted: res.newlySprouted,
    activatedIds: newlyActivated.map((n) => n.id),
    node: target,
  };
}

const _sphereTexCache = new Map();

/**
 * Standard Bird Pond / Neo4j 3D Volumetric Shaded Glossy Sphere Sprite with
 * selection ring and (+N) unexpanded neighbor badge.
 */
function getNeo4jSphereTexture(
  colorHex,
  isSelected,
  isExpanded,
  unexpandedCount,
) {
  if (typeof document === 'undefined') return null;
  const key = `${colorHex}_${isSelected ? 1 : 0}_${isExpanded ? 1 : 0}_${unexpandedCount}`;
  if (_sphereTexCache.has(key)) return _sphereTexCache.get(key);

  const size = 96;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return null;

  const cx = size / 2;
  const cy = size / 2;
  const r = isSelected ? 33 : 28;

  // Outer ambient glow
  const glow = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r * 1.42);
  glow.addColorStop(
    0,
    isSelected ? 'rgba(253, 224, 71, 0.65)' : `${colorHex}66`,
  );
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.42, 0, Math.PI * 2);
  ctx.fill();

  // 3D volumetric shaded sphere body
  const grad = ctx.createRadialGradient(
    cx - r * 0.32,
    cy - r * 0.34,
    r * 0.08,
    cx,
    cy,
    r,
  );
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.26, colorHex);
  grad.addColorStop(0.84, colorHex);
  grad.addColorStop(1, '#070b14');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Rim ring (gold when selected, crisp white/cyan when expandable)
  ctx.lineWidth = isSelected ? 3.5 : unexpandedCount > 0 ? 2.4 : 1.6;
  ctx.strokeStyle = isSelected
    ? '#fde047'
    : unexpandedCount > 0
      ? 'rgba(255,255,255,0.92)'
      : 'rgba(255,255,255,0.52)';
  ctx.stroke();

  // Top-left specular highlight
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.beginPath();
  ctx.ellipse(
    cx - r * 0.28,
    cy - r * 0.32,
    r * 0.26,
    r * 0.14,
    -Math.PI / 5,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // (+N) unexpanded neighbor count badge
  if (unexpandedCount > 0) {
    const bx = cx + r * 0.68;
    const by = cy - r * 0.68;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(bx, by, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();
    ctx.fillStyle = '#7dd3fc';
    ctx.font = '800 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`+${unexpandedCount}`, bx, by + 0.5);
  }

  _sphereTexCache.set(key, c);
  return c;
}

function makeNodeBadgeCanvas(
  qualifier,
  title,
  subtitle,
  accentHex,
  { isSelected = false, sourceCount = 0, unexpandedCount = 0 } = {},
) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 368;
  c.height = 82;
  const ctx = c.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = isSelected
    ? 'rgba(15, 23, 42, 0.96)'
    : 'rgba(8, 13, 24, 0.89)';
  ctx.beginPath();
  ctx.roundRect(4, 4, 360, 74, 12);
  ctx.fill();

  ctx.strokeStyle = isSelected ? '#fde047' : accentHex || '#38bdf8';
  ctx.lineWidth = isSelected ? 3.2 : 2.4;
  ctx.beginPath();
  ctx.roundRect(4, 4, 360, 74, 12);
  ctx.stroke();

  ctx.fillStyle = accentHex || '#38bdf8';
  ctx.font = '800 14px "JetBrains Mono", monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(`[${qualifier}]`, 14, 11);

  if (subtitle) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 11.5px "JetBrains Mono", monospace';
    ctx.fillText(String(subtitle).slice(0, 26), 108, 12);
  }

  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 17px "Inter", system-ui, sans-serif';
  ctx.fillText(String(title || '').slice(0, 29), 14, 31);

  const footerParts = [];
  if (sourceCount > 0) footerParts.push(`${sourceCount} src ↗`);
  if (unexpandedCount > 0) footerParts.push(`+${unexpandedCount} linked`);
  else footerParts.push('Click to inspect');

  ctx.fillStyle = isSelected ? '#fde047' : '#38bdf8';
  ctx.font = '600 11px "JetBrains Mono", monospace';
  ctx.fillText(footerParts.join(' · '), 14, 56);

  return c;
}

function makeEdgeRelCanvas(relText, accentHex, isHighlighted = false) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 224;
  c.height = 34;
  const ctx = c.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = isHighlighted
    ? 'rgba(15, 23, 42, 0.94)'
    : 'rgba(10, 15, 28, 0.80)';
  ctx.beginPath();
  ctx.roundRect(2, 2, 220, 30, 8);
  ctx.fill();

  ctx.strokeStyle = isHighlighted
    ? '#fde047'
    : accentHex || 'rgba(56, 189, 248, 0.55)';
  ctx.lineWidth = isHighlighted ? 2.2 : 1.4;
  ctx.beginPath();
  ctx.roundRect(2, 2, 220, 30, 8);
  ctx.stroke();

  ctx.fillStyle = isHighlighted ? '#fef08a' : '#cbd5e1';
  ctx.font = '600 12px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${String(relText || '').slice(0, 21)} ⟷`, 112, 17);
  return c;
}

/**
 * Builds the 3 canonical PFL 3D constellations (Liverpool, Bird Pond, Starbase)
 * with rich dossiers, verified primary original sources, `bpId` Neo4j bindings,
 * and 2nd-ring expandable neighbors (`active: false`).
 */
export function buildPflNeo4jClusters(gevIntelData = null) {
  const clusters = [];

  // =========================================================================
  // 1. Liverpool Sovereign Node Constellation (Paul's Personal Yard Anchor)
  // =========================================================================
  const lv = NEO4J_ANCHOR_ORIGINS.liverpool;
  const lvNodes = [
    createRichNode({
      id: 'lv-paul-prime',
      bpId: 'person:paul-bracewell',
      label: 'Paul Prime',
      type: 'PERSON',
      color: PFL_ENTITY_TAXONOMY.PERSON.color,
      lat: lv.lat,
      lon: lv.lon,
      alt: lv.alt + 1.4,
      x2d: 215,
      y2d: 185,
      note: 'human_contact (#6) · Founder & Sovereign Coordinator',
      dossier:
        'Founder of Project Free Life (PFL) & Sovereign Anchor across Liverpool HQ and Bird Pond (Tract 6+7A). Directs the 5-qualifier digital twin graph (Person, Place, Thing, Idea, Event) and continuous Mirror Me life-logging pipeline.',
      sources: [
        {
          title: 'Paul Prime Digital Twin · NotebookLM Vol. 6',
          url: 'https://notebooklm.google.com/notebook/85f63355-8c81-4f35-89dd-6e475ae4e441',
          badge: 'NotebookLM ↗',
        },
        {
          title: 'PFL 4D Spatial Memory Palace (Local)',
          url: '/memory-palace.html',
          badge: '4D Palace ↗',
        },
        {
          title: 'Elite Spy Worlds · Bird Pond 3D Twin',
          url: 'https://elitespyworlds.com/birdpond/adventure.html',
          badge: 'Live 3D ↗',
        },
      ],
      active: true,
    }),
    createRichNode({
      id: 'lv-sovereign-node',
      label: 'Liverpool Sovereign Node',
      type: 'PLACE',
      color: PFL_ENTITY_TAXONOMY.PLACE.color,
      lat: lv.lat + 0.000045,
      lon: lv.lon - 0.00004,
      alt: lv.alt,
      x2d: 145,
      y2d: 135,
      note: 'property (#11) · 29.24752N, -95.23144W · 35.45 mi ENE of Bird Pond',
      dossier:
        'Primary PFL Liverpool operational yard & compute node in Brazoria County, TX (29.24752°N, -95.23144°W). Anchors the 12-camera Wyze perimeter harvester, RTX GPUs, and 274.8-mile SSW telemetry sightline to SpaceX Starbase.',
      sources: [
        {
          title: 'Brazoria County CAD Property Search',
          url: 'https://propaccess.trueautomation.com/clientdb/?cid=51',
          badge: 'County CAD ↗',
        },
        {
          title: 'Local Neo4j Graphiti Fusion Index JSON',
          url: '/gev-intel/index.json',
          badge: 'Graphiti JSON ↗',
        },
      ],
      active: true,
    }),
    createRichNode({
      id: 'lv-lisa-muse',
      bpId: 'agent:lisa-muse',
      label: 'Lisa Muse (@lisa-muse)',
      type: 'PERSON',
      color: '#f472b6',
      lat: lv.lat - 0.00004,
      lon: lv.lon + 0.000045,
      alt: lv.alt + 0.8,
      x2d: 285,
      y2d: 130,
      note: 'agent (#8) · Sovereign Anchor & Creative Co-Watcher',
      dossier:
        '3D embodied Sovereign Anchor (`lisa_muse.glb`) at Liverpool yard & Bird Pond gate. Co-watching Starship Flight 15 re-entry and chopstick catch alongside Paul Prime, Lisa Holmes, Harry, and Friday.',
      sources: [
        {
          title: 'Bird Pond 3D Gate Anchor (v2.7)',
          url: 'https://elitespyworlds.com/birdpond/adventure.html',
          badge: 'Bird Pond 3D ↗',
        },
        {
          title: '4D Memory Palace Avatar Stage',
          url: '/memory-palace.html',
          badge: 'Palace ↗',
        },
      ],
      active: true,
    }),
    createRichNode({
      id: 'lv-lisa-holmes',
      label: 'Lisa Holmes (@lisa)',
      type: 'PERSON',
      color: '#e879f9',
      lat: lv.lat + 0.00005,
      lon: lv.lon + 0.00005,
      alt: lv.alt + 1.1,
      x2d: 315,
      y2d: 195,
      note: 'agent (#8) · Chief of Staff & Voice/Customization Lead',
      dossier:
        'PFL Chief of Staff managing swarm customizations, Voicebox TTS cloning profiles, and cross-surface communications across Buzz and WhatsApp.',
      sources: [
        {
          title: 'Paul Prime Digital Twin · NotebookLM Vol. 6',
          url: 'https://notebooklm.google.com/notebook/85f63355-8c81-4f35-89dd-6e475ae4e441',
          badge: 'NotebookLM ↗',
        },
      ],
      active: true,
    }),
    createRichNode({
      id: 'lv-harry',
      label: 'Harry Maybourne (@harry)',
      type: 'PERSON',
      color: '#fbbf24',
      lat: lv.lat - 0.00005,
      lon: lv.lon - 0.000045,
      alt: lv.alt + 1.8,
      x2d: 145,
      y2d: 245,
      note: 'agent (#8) · Technical Principal & 4D OSINT Builder',
      dossier:
        "Swarm Technical Principal auditing Postgres task pipelines, Windmill Mirror Me video chunking, and God's Eye View 4D OSINT reconstructions.",
      sources: [
        {
          title: 'Harry Maybourne NotebookLM Workspace',
          url: 'https://notebooklm.google.com/notebook/22380c62-4eef-4cfd-9229-a36c8cf36daf',
          badge: 'Harry NBLM ↗',
        },
        {
          title: 'Local Neo4j Graphiti Fusion Index',
          url: '/gev-intel/index.json',
          badge: 'JSON Source ↗',
        },
      ],
      active: true,
    }),
    createRichNode({
      id: 'lv-friday',
      label: 'Friday (@friday)',
      type: 'PERSON',
      color: '#818cf8',
      lat: lv.lat + 0.00002,
      lon: lv.lon + 0.000075,
      alt: lv.alt + 0.6,
      x2d: 295,
      y2d: 255,
      note: 'agent (#8) · CTO Architecture & Telemetry Watch',
      dossier:
        'Swarm Coordinator & cron telemetry monitor tracking mission windows, system health, and escalation dispatch.',
      sources: [
        {
          title: 'Local Neo4j Graphiti Fusion Index',
          url: '/gev-intel/index.json',
          badge: 'Telemetry ↗',
        },
      ],
      active: true,
    }),
    createRichNode({
      id: 'lv-wyze-harvester',
      label: 'Wyze 12-Cam Harvester',
      type: 'THING',
      color: PFL_ENTITY_TAXONOMY.THING.color,
      lat: lv.lat - 0.000065,
      lon: lv.lon + 0.00001,
      alt: lv.alt - 0.5,
      x2d: 105,
      y2d: 185,
      note: 'product_system (#14) · Person-priority archiver + PFL GEV Add-on',
      dossier:
        'Automated 12-camera Wyze Bridge RTSP & person-detection archiver projecting calibrated yard camera frames directly onto the Cesium terrain.',
      sources: [
        {
          title: '4D Spatial Memory Palace · Camera Timeline',
          url: '/memory-palace.html',
          badge: 'Camera Replay ↗',
        },
      ],
      active: true,
    }),
    createRichNode({
      id: 'lv-kenneth-event',
      label: 'Kenneth Truck & Yard Sweep',
      type: 'EVENT',
      color: PFL_ENTITY_TAXONOMY.EVENT.color,
      lat: lv.lat + 0.000068,
      lon: lv.lon - 0.00001,
      alt: lv.alt - 0.3,
      x2d: 85,
      y2d: 115,
      eventTimeIso: '2026-11-11T09:35:00-06:00',
      note: 'incident (#22) · 09:35 arrival, 11:37 canal person, 12:07 departure',
      dossier:
        'Multi-camera 4D yard timeline incident: 09:35 white pickup arrival, 11:37 canal-side person detection, and 12:07 departure fused into Neo4j episodic memory.',
      sources: [
        {
          title: '4D Spatial Memory Palace · Incident Scrubber',
          url: '/memory-palace.html',
          badge: 'Incident Footage ↗',
        },
        {
          title: 'Graphiti Entity Web Feed',
          url: '/gev-intel/index.json',
          badge: 'Event Log ↗',
        },
      ],
      active: true,
    }),
    createRichNode({
      id: 'lv-spatial-palace',
      label: '4D Spatial Memory Palace',
      type: 'IDEA',
      color: PFL_ENTITY_TAXONOMY.IDEA.color,
      lat: lv.lat,
      lon: lv.lon - 0.000078,
      alt: lv.alt + 2.2,
      x2d: 205,
      y2d: 95,
      note: 'framework (#20) · PFL + Bilawal Sidhu 4D Graphiti Fusion',
      dossier:
        'Core PFL architecture uniting 3D Cesium photogrammetry + 4th-dimension Time (`EVENT`) + Neo4j Graphiti relationships so every person, place, thing, idea, and event links back to raw primary evidence.',
      sources: [
        {
          title: 'Open Local 4D Spatial Memory Palace',
          url: '/memory-palace.html',
          badge: 'Open App ↗',
        },
        {
          title: "Bilawal Sidhu · God's Eye View Repository",
          url: 'https://github.com/bilawalsidhu/gods-eye-view',
          badge: 'GitHub ↗',
        },
      ],
      active: true,
    }),
    createRichNode({
      id: 'lv-nick-t3',
      label: 'Nick Vasilescu · T3 + Parallax',
      type: 'PERSON',
      color: PFL_ENTITY_TAXONOMY.PERSON.color,
      lat: lv.lat + 0.000072,
      lon: lv.lon + 0.000032,
      alt: lv.alt + 2.4,
      x2d: 235,
      y2d: 295,
      note: 'industry_figure (#7) · 15-Agent Teardown Swarm & T3 Code (t3.codes)',
      dossier:
        'Creator of the 15-agent Orgo + Hermes + T3 Code parallel product teardown workflow ("Reverse-engineering Higgsfield into open-source Parallax"). Click this node to sprout his T3 Code & Parallax repository nodes.',
      sources: [
        {
          title: 'YouTube · 15-Agent Higgsfield Teardown Video',
          url: 'https://www.youtube.com/watch?v=OEqm3w_7ACg',
          badge: 'YouTube Source ↗',
        },
        {
          title: 'T3 Code Multi-Agent Orchestrator (t3.codes)',
          url: 'https://t3.codes',
          badge: 't3.codes ↗',
        },
        {
          title: 'GitHub · nickvasilescu/parallax',
          url: 'https://github.com/nickvasilescu/parallax',
          badge: 'GitHub Repo ↗',
        },
      ],
      active: true,
    }),
    // Expandable 2nd-ring Liverpool nodes (`active: false` -> shows +N badge on parent!)
    createRichNode({
      id: 'lv-t3-codes-thing',
      label: 'T3 Code + Orgo 15-Agent Spec',
      type: 'THING',
      color: PFL_ENTITY_TAXONOMY.THING.color,
      lat: lv.lat + 0.0001,
      lon: lv.lon + 0.00006,
      alt: lv.alt + 2.8,
      note: 'product_system (#14) · Parallel Chrome CDP Component Teardown',
      dossier:
        'Each of 15 specialist agents owns one isolated product vertical via Chrome DevTools Protocol (`127.0.0.1:9223`), emitting deterministic rebuildable specs rather than monolithic chat summaries.',
      sources: [
        {
          title: 'T3 Code Official Site',
          url: 'https://t3.codes',
          badge: 't3.codes ↗',
        },
        {
          title: 'Nick Vasilescu · Full Walkthrough Video',
          url: 'https://www.youtube.com/watch?v=OEqm3w_7ACg',
          badge: 'YouTube ↗',
        },
      ],
      active: false,
    }),
    createRichNode({
      id: 'lv-parallax-repo',
      label: 'Parallax Open-Source Studio',
      type: 'THING',
      color: '#34d399',
      lat: lv.lat + 0.00011,
      lon: lv.lon + 0.00001,
      alt: lv.alt + 3.0,
      note: 'product_system (#14) · Open-Source Rebuild Output',
      dossier:
        "Open-source AI media studio synthesized by Nick Vasilescu's 15-agent teardown swarm — benchmark reference for PFL's Elite Spy Worlds replication.",
      sources: [
        {
          title: 'GitHub · nickvasilescu/parallax',
          url: 'https://github.com/nickvasilescu/parallax',
          badge: 'GitHub ↗',
        },
      ],
      active: false,
    }),
    createRichNode({
      id: 'lv-mirror-me-vol6',
      label: 'Mirror Me Vol. 6 (<200MB Chunker)',
      type: 'THING',
      color: '#60a5fa',
      lat: lv.lat - 0.00009,
      lon: lv.lon - 0.00007,
      alt: lv.alt + 2.5,
      note: 'document (#15) · Auto-Chunked OBS & Michael Mertz Call Archive',
      dossier:
        "Windmill `f/w/mirror_me` lossless `ffmpeg` segmenter splitting >180 MB OBS recordings and phone calls into <200 MB parts synced into Paul's active NotebookLM Digital Twin volume.",
      sources: [
        {
          title: 'NotebookLM Volume 6 (85f63355)',
          url: 'https://notebooklm.google.com/notebook/85f63355-8c81-4f35-89dd-6e475ae4e441',
          badge: 'NotebookLM Vol.6 ↗',
        },
      ],
      active: false,
    }),
  ];

  const lvEdges = [
    createGraphEdge({
      from: 'lv-paul-prime',
      to: 'lv-sovereign-node',
      relFwd: 'SOVEREIGN_AT',
      relRev: 'ANCHORS_FOUNDER',
    }),
    createGraphEdge({
      from: 'lv-paul-prime',
      to: 'lv-lisa-muse',
      relFwd: 'WATCHES_WITH',
      relRev: 'ANCHORS_FOR',
    }),
    createGraphEdge({
      from: 'lv-paul-prime',
      to: 'lv-lisa-holmes',
      relFwd: 'WATCHES_WITH',
      relRev: 'CHIEF_OF_STAFF_TO',
    }),
    createGraphEdge({
      from: 'lv-paul-prime',
      to: 'lv-harry',
      relFwd: 'DIRECTS_AGENT',
      relRev: 'BUILDS_4D_FOR',
    }),
    createGraphEdge({
      from: 'lv-paul-prime',
      to: 'lv-friday',
      relFwd: 'COORDINATES',
      relRev: 'MONITORS_CRON_FOR',
    }),
    createGraphEdge({
      from: 'lv-sovereign-node',
      to: 'lv-wyze-harvester',
      relFwd: 'GUARDED_BY',
      relRev: 'PROTECTS_YARD',
    }),
    createGraphEdge({
      from: 'lv-wyze-harvester',
      to: 'lv-kenneth-event',
      relFwd: 'CAPTURED_EVENT',
      relRev: 'RECORDED_ON',
    }),
    createGraphEdge({
      from: 'lv-paul-prime',
      to: 'lv-spatial-palace',
      relFwd: 'ARCHITECTS_IDEA',
      relRev: 'MODELS_LIFE_OF',
    }),
    createGraphEdge({
      from: 'lv-harry',
      to: 'lv-nick-t3',
      relFwd: 'BENCHMARKS_T3',
      relRev: 'INSPIRES_SWARM',
    }),
    // 2nd-ring expandable edges
    createGraphEdge({
      from: 'lv-nick-t3',
      to: 'lv-t3-codes-thing',
      relFwd: 'ORCHESTRATES_WITH',
      relRev: 'BUILT_BY',
      active: false,
    }),
    createGraphEdge({
      from: 'lv-nick-t3',
      to: 'lv-parallax-repo',
      relFwd: 'OPEN_SOURCED',
      relRev: 'AUTHORED_BY',
      active: false,
    }),
    createGraphEdge({
      from: 'lv-paul-prime',
      to: 'lv-mirror-me-vol6',
      relFwd: 'CHRONICLES_INTO',
      relRev: 'STORES_TWIN_OF',
      active: false,
    }),
    createGraphEdge({
      from: 'lv-harry',
      to: 'lv-mirror-me-vol6',
      relFwd: 'CHUNKED_PIPELINE',
      relRev: 'MAINTAINED_BY',
      active: false,
    }),
  ];

  // Hydrate live Neo4j Graphiti nodes from /gev-intel/index.json as expandable 2nd-ring nodes on `lv-spatial-palace`
  const rawWebNodes = gevIntelData?.entity_web?.nodes;
  if (Array.isArray(rawWebNodes) && rawWebNodes.length > 0) {
    const sample = rawWebNodes.slice(0, 4);
    sample.forEach((item, idx) => {
      const angle = (idx / sample.length) * Math.PI * 2 + 0.5;
      const nodeId = `neo4j-live-${idx}`;
      const fullText = String(item.name || 'Graphiti Node');
      const cleanTitle = fullText
        .replace(/^#\d+\s*\([^)]*\):\s*/, '')
        .slice(0, 28);
      lvNodes.push(
        createRichNode({
          id: nodeId,
          label: cleanTitle,
          type: 'IDEA',
          color: '#c084fc',
          lat: lv.lat + Math.sin(angle) * 0.000085,
          lon: lv.lon + Math.cos(angle) * 0.000095,
          alt: lv.alt + 2.6,
          note: 'Neo4j Graphiti Episodic Entity (gev-neo4j-fusion-v1)',
          dossier: `Live Neo4j Graphiti entity ingested from PFL timeline: "${fullText}".`,
          sources: [
            {
              title: 'Raw Graphiti Fusion Feed (/gev-intel/index.json)',
              url: '/gev-intel/index.json',
              badge: 'Graphiti JSON ↗',
            },
            {
              title: '4D Spatial Memory Palace',
              url: '/memory-palace.html',
              badge: '4D Palace ↗',
            },
          ],
          active: idx < 2,
        }),
      );
      lvEdges.push(
        createGraphEdge({
          from: 'lv-spatial-palace',
          to: nodeId,
          relFwd: 'GRAPHITI_MEMORY',
          relRev: 'INDEXED_IN',
          active: idx < 2,
        }),
      );
    });
  }

  for (let step = 0; step < 48; step++) {
    stepNeo4jForceSimulation({
      nodes: lvNodes,
      edges: lvEdges,
      dt: 0.025,
      origin: lv,
      pinnedIds: new Set(['lv-paul-prime']),
      params: {
        minAlt: lv.minAlt,
        maxAlt: lv.maxAlt,
        restLengthCore: 6.5,
        restLengthLeaf: 7.5,
      },
    });
  }
  clusters.push({
    id: 'liverpool',
    origin: lv,
    nodes: lvNodes,
    edges: lvEdges,
    maxDistM: 2500,
  });

  // =========================================================================
  // 2. Bird Pond — Pepper Way Constellation (Connected to Live `neo4j_lookup.php`)
  // =========================================================================
  const bp = NEO4J_ANCHOR_ORIGINS.birdpond;
  const bpNodes = [
    createRichNode({
      id: 'bp-pepper-way',
      bpId: 'tract:6',
      label: 'Pepper Way (Tract 6+7A)',
      type: 'PLACE',
      color: PFL_ENTITY_TAXONOMY.PLACE.color,
      lat: bp.lat,
      lon: bp.lon,
      alt: bp.alt + 1.0,
      x2d: 215,
      y2d: 185,
      note: 'property (#11) · PID 595430 · 35.45 mi WSW of Liverpool',
      dossier:
        'Sovereign Bird Pond sanctuary along Pepper Way & Dance Bayou in Brazoria County (PID 595430, Account 0088-0041-001, Tract 6 + 7A). Click to sprout partition deeds & estate lineage from Neo4j.',
      sources: [
        {
          title: 'Bird Pond 3D Interactive Twin (v2.7)',
          url: 'https://elitespyworlds.com/birdpond/adventure.html',
          badge: 'Bird Pond 3D ↗',
        },
        {
          title: 'Brazoria County CAD Official Property Record',
          url: 'https://propaccess.trueautomation.com/clientdb/?cid=51',
          badge: 'Brazoria CAD ↗',
        },
        {
          title: 'Pepper Way Field Videos & Drone Recon',
          url: 'https://elitespyworlds.com/birdpond/pepper-way-videos.html',
          badge: 'Field Videos ↗',
        },
      ],
      active: true,
    }),
    createRichNode({
      id: 'bp-paul',
      bpId: 'person:paul-bracewell',
      label: 'Paul Prime',
      type: 'PERSON',
      color: PFL_ENTITY_TAXONOMY.PERSON.color,
      lat: bp.lat + 0.00005,
      lon: bp.lon + 0.00004,
      alt: bp.alt + 1.8,
      x2d: 285,
      y2d: 135,
      note: 'human_contact (#6) · Tract 6+7A Owner & Visionary',
      dossier:
        'Owner of Bird Pond Tract 6+7A (11.01 acres) developing off-grid micro-hydro, sovereign permaculture, and nested 3D spatial memory.',
      sources: [
        {
          title: 'Bird Pond 3D Property Explorer',
          url: 'https://elitespyworlds.com/birdpond/adventure.html',
          badge: 'Bird Pond 3D ↗',
        },
        {
          title: 'Paul Prime Digital Twin · NotebookLM Vol. 6',
          url: 'https://notebooklm.google.com/notebook/85f63355-8c81-4f35-89dd-6e475ae4e441',
          badge: 'NotebookLM ↗',
        },
      ],
      active: true,
    }),
    createRichNode({
      id: 'bp-lisa-gate',
      bpId: 'agent:lisa-muse',
      label: 'Lisa Muse — at Gate',
      type: 'PERSON',
      color: '#f472b6',
      lat: bp.lat - 0.00004,
      lon: bp.lon - 0.00005,
      alt: bp.alt + 0.6,
      x2d: 140,
      y2d: 145,
      note: 'agent (#8) · Nested 3D Photo-in-Photo Anchor',
      dossier:
        'Embodied 3D gate guardian at Pepper Way (`29.13870°N, -95.80486°W`), calibrated directly into the November 4, 2026 field walk video and nested photo portals.',
      sources: [
        {
          title: 'Bird Pond Gate 3D Scene (v2.7)',
          url: 'https://elitespyworlds.com/birdpond/adventure.html',
          badge: 'Open 3D Gate ↗',
        },
        {
          title: 'Pepper Way Walk Video (Nov 4, 2026)',
          url: 'https://elitespyworlds.com/birdpond/pepper-way-videos.html',
          badge: 'Walk Video ↗',
        },
      ],
      active: true,
    }),
    createRichNode({
      id: 'bp-cindy-jordy',
      bpId: 'person:cindy-jordy',
      label: 'Cindy & Bennie Jordy',
      type: 'PERSON',
      color: '#fb923c',
      lat: bp.lat - 0.000055,
      lon: bp.lon + 0.00005,
      alt: bp.alt + 0.3,
      x2d: 295,
      y2d: 245,
      note: 'human_contact (#6) · Neighbor Parcel & Lease Context',
      dossier:
        'Adjacent Pepper Way parcel holders connected via Brazoria County partition lineage and neighbor access easement context.',
      sources: [
        {
          title: 'Brazoria County CAD Parcel Lookup',
          url: 'https://propaccess.trueautomation.com/clientdb/?cid=51',
          badge: 'Brazoria CAD ↗',
        },
        {
          title: 'Live Neo4j Entity JSON (`person:cindy-jordy`)',
          url: 'https://elitespyworlds.com/birdpond/neo4j_lookup.php?bp_id=person:cindy-jordy',
          badge: 'Neo4j API ↗',
        },
      ],
      active: true,
    }),
    createRichNode({
      id: 'bp-dance-bayou',
      bpId: 'asset:dance-bayou-bridge',
      label: 'Dance Bayou Micro-Hydro',
      type: 'THING',
      color: PFL_ENTITY_TAXONOMY.THING.color,
      lat: bp.lat + 0.000055,
      lon: bp.lon - 0.000045,
      alt: bp.alt + 0.5,
      x2d: 135,
      y2d: 245,
      note: 'object (#16) · Proposed Bridge & 12-ft Head Weir',
      dossier:
        'Dance Bayou waterway crossing & micro-hydro weir engineering concept providing off-grid renewable power and bridge access.',
      sources: [
        {
          title: 'Pepper Way & Dance Bayou Field Footage',
          url: 'https://elitespyworlds.com/birdpond/pepper-way-videos.html',
          badge: 'Field Footage ↗',
        },
        {
          title: 'Bird Pond 3D Terrain & Waterway View',
          url: 'https://elitespyworlds.com/birdpond/adventure.html',
          badge: '3D Terrain ↗',
        },
      ],
      active: true,
    }),
    // Expandable 2nd-ring Bird Pond nodes (`active: false`)
    createRichNode({
      id: 'bp-morris-pepper',
      bpId: 'person:morris-pepper-estate',
      label: 'Morris Pepper Partition Estate',
      type: 'THING',
      color: '#eab308',
      lat: bp.lat + 0.00008,
      lon: bp.lon + 0.00001,
      alt: bp.alt + 1.5,
      note: 'document (#15) · Parent Partition Lineage (Tracts 1–8)',
      dossier:
        'Root Morris Pepper Estate partition establishing Tracts 1 through 8 along Pepper Way and Dance Bayou in Brazoria County deed records.',
      sources: [
        {
          title: 'Live Neo4j Lookup (`person:morris-pepper-estate`)',
          url: 'https://elitespyworlds.com/birdpond/neo4j_lookup.php?bp_id=person:morris-pepper-estate',
          badge: 'Neo4j DB ↗',
        },
        {
          title: 'Brazoria County CAD Official Records',
          url: 'https://propaccess.trueautomation.com/clientdb/?cid=51',
          badge: 'County CAD ↗',
        },
      ],
      active: false,
    }),
    createRichNode({
      id: 'bp-walk-video',
      bpId: 'video:2026-11-04-164029',
      label: 'Nov 4 Gate Walk 4D Video',
      type: 'EVENT',
      color: PFL_ENTITY_TAXONOMY.EVENT.color,
      lat: bp.lat - 0.00007,
      lon: bp.lon - 0.00007,
      alt: bp.alt + 1.2,
      eventTimeIso: '2026-11-04T16:40:29-06:00',
      note: 'milestone (#21) · Geo-Registered Field Walk (`20261104_164029`)',
      dossier:
        'Primary ground-truth video walk captured at Pepper Way gate on Nov 4, 2026 at 16:40 CST, registered directly into the 3D scene.',
      sources: [
        {
          title: 'Watch Pepper Way Field Videos',
          url: 'https://elitespyworlds.com/birdpond/pepper-way-videos.html',
          badge: 'Watch Video ↗',
        },
      ],
      active: false,
    }),
  ];
  const bpEdges = [
    createGraphEdge({
      from: 'bp-paul',
      to: 'bp-pepper-way',
      relFwd: 'OWNS_TRACT',
      relRev: 'OWNED_BY',
    }),
    createGraphEdge({
      from: 'bp-lisa-gate',
      to: 'bp-pepper-way',
      relFwd: 'GUARDS_GATE',
      relRev: 'ANCHORS_AVATAR',
    }),
    createGraphEdge({
      from: 'bp-cindy-jordy',
      to: 'bp-pepper-way',
      relFwd: 'ADJACENT_TO',
      relRev: 'BORDERS_PARCEL',
    }),
    createGraphEdge({
      from: 'bp-dance-bayou',
      to: 'bp-pepper-way',
      relFwd: 'POWERS_SITE',
      relRev: 'CONTAINS_WATERWAY',
    }),
    createGraphEdge({
      from: 'bp-pepper-way',
      to: 'bp-morris-pepper',
      relFwd: 'PARTITIONED_FROM',
      relRev: 'CREATED_TRACT',
      active: false,
    }),
    createGraphEdge({
      from: 'bp-lisa-gate',
      to: 'bp-walk-video',
      relFwd: 'CAPTURED_IN_4D',
      relRev: 'SHOWS_GATE_AT',
      active: false,
    }),
  ];
  for (let step = 0; step < 40; step++) {
    stepNeo4jForceSimulation({
      nodes: bpNodes,
      edges: bpEdges,
      dt: 0.025,
      origin: bp,
      pinnedIds: new Set(['bp-pepper-way']),
      params: {
        minAlt: bp.minAlt,
        maxAlt: bp.maxAlt,
        restLengthCore: 6.2,
        restLengthLeaf: 7.0,
      },
    });
  }
  clusters.push({
    id: 'birdpond',
    origin: bp,
    nodes: bpNodes,
    edges: bpEdges,
    maxDistM: 2500,
  });

  // =========================================================================
  // 3. Starbase Flight 15 Watch-Party Constellation (Macro-scale around Pad 2)
  // =========================================================================
  const sb = NEO4J_ANCHOR_ORIGINS.starbase;
  const sbNodes = [
    createRichNode({
      id: 'sb-flight15-event',
      label: 'Flight 15 Catch · 15:17 CST',
      type: 'EVENT',
      color: PFL_ENTITY_TAXONOMY.EVENT.color,
      lat: sb.lat,
      lon: sb.lon,
      alt: 225.0,
      x2d: 215,
      y2d: 185,
      streamId: 'nsf-live',
      eventTimeIso: '2026-11-14T15:17:00-06:00',
      note: 'milestone (#21) · 4D Time Target 2026-11-14T15:17:00-06:00',
      dossier:
        'SpaceX Starship Flight 15 (Starlink Group 31-2) orbital mission & historic Ship 42 overland deorbit across Mexico targeting Mechazilla chopstick tower catch at Starbase Orbital Pad 2 at 3:17 PM CST (21:17 UTC). Click to sprout live multi-cam & FAA NOTAM evidence nodes.',
      sources: [
        {
          title: 'NASASpaceflight Starbase Live Telemetry Stream',
          url: 'https://www.youtube.com/watch?v=dl4O6RqbvOs',
          badge: 'YouTube Live ↗',
          streamId: 'nsf-live',
        },
        {
          title: 'SpaceX Official Flight 15 Broadcast (X)',
          url: 'https://x.com/i/broadcasts/2brajgZlOKRMka',
          badge: 'SpaceX X ↗',
          streamId: 'spacex-x',
        },
        {
          title: 'SpaceX Starship Mission Hub',
          url: 'https://www.spacex.com/launches/',
          badge: 'SpaceX.com ↗',
        },
      ],
      active: true,
    }),
    createRichNode({
      id: 'sb-pad2-place',
      label: 'Starbase Orbital Pad 2',
      type: 'PLACE',
      color: PFL_ENTITY_TAXONOMY.PLACE.color,
      lat: sb.lat - 0.0028,
      lon: sb.lon + 0.0032,
      alt: 98.0,
      x2d: 130,
      y2d: 245,
      streamId: 'labpadre-hub',
      note: 'location (#10) · Boca Chica, TX (25.9968N, -97.1580W)',
      dossier:
        'SpaceX Starbase Orbital Launch Pad 2 & 146-meter Mechazilla Integration Tower at Boca Chica Beach, TX (25.99677°N, -97.15799°W), 274.8 miles SSW of PFL Liverpool.',
      sources: [
        {
          title: 'LabPadre 24/7 Starbase Pad 2 Multi-Cams',
          url: 'https://www.youtube.com/@LabPadre/streams',
          badge: 'LabPadre 24/7 ↗',
          streamId: 'labpadre-hub',
        },
        {
          title: 'Flight 15 Pad 2 Tracking Feed #2',
          url: 'https://www.youtube.com/watch?v=QlR1agMLyMk',
          badge: 'Pad 2 Cam ↗',
          streamId: 'starbase-feed-2',
        },
        {
          title: 'Cameron County Boca Chica Beach Advisories',
          url: 'https://www.cameroncountytx.gov/spacex/',
          badge: 'County Closure ↗',
        },
      ],
      active: true,
    }),
    createRichNode({
      id: 'sb-ship42-thing',
      label: 'Ship 42 + Mechazilla',
      type: 'THING',
      color: PFL_ENTITY_TAXONOMY.THING.color,
      lat: sb.lat + 0.0032,
      lon: sb.lon - 0.0034,
      alt: 295.0,
      x2d: 295,
      y2d: 120,
      streamId: 'spacex-x',
      note: 'object (#16) · Deorbit across Mexico -> Chopstick Catch',
      dossier:
        'Block 3 Starship Ship 42 featuring upgraded metallic/ceramic thermal protection tiles, catch pins, and Starlink V3 dispenser. Enters interface at 115 km (Mach 24.8) over Durango/Pacific, banks across Nuevo Leon, flips at 680 m, and lands into Pad 2 chopsticks at 112 m.',
      sources: [
        {
          title: 'SpaceX Starship Vehicle & Catch Architecture',
          url: 'https://www.spacex.com/vehicles/starship/',
          badge: 'Vehicle Spec ↗',
        },
        {
          title: 'SpaceX Onboard Starlink Plasma Broadcast',
          url: 'https://x.com/i/broadcasts/2brajgZlOKRMka',
          badge: 'Onboard Cam ↗',
          streamId: 'spacex-x',
        },
      ],
      active: true,
    }),
    createRichNode({
      id: 'sb-booster22-thing',
      label: 'Booster 22 (Gulf Splashdown)',
      type: 'THING',
      color: '#fb7185',
      lat: sb.lat + 0.0029,
      lon: sb.lon + 0.004,
      alt: 135.0,
      x2d: 310,
      y2d: 250,
      streamId: 'nsf-live',
      note: 'object (#16) · GNC Catch-Abort -> Offshore Gulf Splashdown',
      dossier:
        'Super Heavy Booster 22 powered liftoff & hot-staging before executing an automated GNC tower catch-abort safety divert to a controlled offshore Gulf of Mexico splashdown zone (25.942°N, -96.785°W).',
      sources: [
        {
          title: 'NASASpaceflight Ascent & Booster Replay',
          url: 'https://www.youtube.com/watch?v=dl4O6RqbvOs',
          badge: 'Ascent Replay ↗',
          streamId: 'nsf-live',
        },
        {
          title: 'USCG / FAA Gulf Keep-Out Hazard Notice',
          url: 'https://tfr.faa.gov/',
          badge: 'FAA TFR ↗',
        },
      ],
      active: true,
    }),
    createRichNode({
      id: 'sb-spacex-org',
      label: 'SpaceX + 26 Starlink V3',
      type: 'THING',
      color: '#94a3b8',
      lat: sb.lat - 0.0035,
      lon: sb.lon - 0.003,
      alt: 165.0,
      x2d: 120,
      y2d: 135,
      note: 'company (#13) & product_system (#14) · Starlink Group 31-2',
      dossier:
        'Commercial orbital payload deployment of 26 next-generation full-size Starlink V3 satellites (Group 31-2) prior to Ship 42 deorbit burn.',
      sources: [
        {
          title: 'SpaceX Launches · Starlink Group 31-2',
          url: 'https://www.spacex.com/launches/',
          badge: 'SpaceX ↗',
        },
        {
          title: 'CelesTrak Ephemeris & Starlink Catalog',
          url: 'https://celestrak.org/NORAD/elements/',
          badge: 'CelesTrak ↗',
        },
      ],
      active: true,
    }),
    createRichNode({
      id: 'sb-bilawal-idea',
      label: 'Bilawal 4D OSINT Reconstruction',
      type: 'IDEA',
      color: PFL_ENTITY_TAXONOMY.IDEA.color,
      lat: sb.lat + 0.0042,
      lon: sb.lon + 0.0004,
      alt: 335.0,
      x2d: 325,
      y2d: 185,
      note: 'framework (#20) · Learjet N722BD & Prime Air 767 Pattern',
      dossier:
        "4D OSINT spatial reconstruction methodology pioneered by Bilawal Sidhu in God's Eye View (Learjet 55 N722BD Philadelphia crash, Atlas/Prime Air 3591 Trinity Bay 767 crash, and Bhote Koshi flood scene) — fusing flight-path polylines, camera sightlines, and primary source cards on a live 3D globe.",
      sources: [
        {
          title: 'Bilawal Sidhu · 3D/4D OSINT Analysis Channel',
          url: 'https://www.youtube.com/@BilawalSidhu/videos',
          badge: 'Bilawal YouTube ↗',
        },
        {
          title: 'Open Built-In Bhote Koshi 4D Director Demo',
          url: '/?scene=bhote-koshi-2026',
          badge: 'Local 4D Scene ↗',
        },
        {
          title: "God's Eye View Source Architecture (GitHub)",
          url: 'https://github.com/bilawalsidhu/gods-eye-view',
          badge: 'GitHub ↗',
        },
      ],
      active: true,
    }),
    createRichNode({
      id: 'sb-swarm-party',
      label: 'Paul + Lisa Muse + Lisa + Harry + Friday',
      type: 'PERSON',
      color: PFL_ENTITY_TAXONOMY.PERSON.color,
      lat: sb.lat - 0.0005,
      lon: sb.lon - 0.0046,
      alt: 255.0,
      x2d: 205,
      y2d: 95,
      streamId: 'nsf-live',
      note: 'human_contact (#6) + agents (#8) · Live Swarm Watch Party',
      dossier:
        'Synchronized PFL human + multi-agent watch party observing Ship 42 re-entry and Pad 2 chopstick catch together in real time across Liverpool HQ and Starbase 4D theater.',
      sources: [
        {
          title: 'Open Multi-Cam Watch Dock (NASASpaceflight)',
          url: 'https://www.youtube.com/watch?v=dl4O6RqbvOs',
          badge: 'Watch Live ↗',
          streamId: 'nsf-live',
        },
        {
          title: 'Paul Prime Digital Twin · NotebookLM Vol. 6',
          url: 'https://notebooklm.google.com/notebook/85f63355-8c81-4f35-89dd-6e475ae4e441',
          badge: 'NotebookLM ↗',
        },
      ],
      active: true,
    }),
    // Expandable 2nd-ring Starbase evidence nodes (`active: false` -> triggers +N badges on pad balls!)
    createRichNode({
      id: 'sb-faa-notam',
      label: 'FAA TFR & Mexican Re-Entry NOTAMs',
      type: 'THING',
      color: '#facc15',
      lat: sb.lat - 0.0052,
      lon: sb.lon + 0.0052,
      alt: 195.0,
      note: 'document (#15) · Airspace & Maritime Keep-Out Polygons',
      dossier:
        'FAA Space Operations Temporary Flight Restrictions (ZHU Houston ARTCC) & USCG maritime hazard zones defining the overland plasma corridor from Durango/Nuevo Leon into Boca Chica Pad 2.',
      sources: [
        {
          title: 'FAA Temporary Flight Restrictions (TFR Map)',
          url: 'https://tfr.faa.gov/',
          badge: 'FAA TFR ↗',
        },
        {
          title: 'FAA Office of Commercial Space Transportation',
          url: 'https://www.faa.gov/space',
          badge: 'FAA Space ↗',
        },
      ],
      active: false,
    }),
    createRichNode({
      id: 'sb-nsf-stream-node',
      label: 'NASASpaceflight Starbase Live Rig',
      type: 'THING',
      color: '#38bdf8',
      lat: sb.lat + 0.0052,
      lon: sb.lon - 0.0015,
      alt: 245.0,
      streamId: 'nsf-live',
      note: 'product_system (#14) · Optical Tracking & Live Commentary',
      dossier:
        'Long-range optical telescope tracking rigs at Isla Blanca & Boca Chica capturing plasma flap actuation, belly-flop flip, and Raptor relight.',
      sources: [
        {
          title: 'Watch NASASpaceflight Live Stream',
          url: 'https://www.youtube.com/watch?v=dl4O6RqbvOs',
          badge: 'YouTube Live ↗',
          streamId: 'nsf-live',
        },
        {
          title: 'NASASpaceflight Starbase Channel',
          url: 'https://www.youtube.com/@NASASpaceflight/streams',
          badge: 'Channel ↗',
        },
      ],
      active: false,
    }),
    createRichNode({
      id: 'sb-labpadre-node',
      label: 'LabPadre Rover & Sapphire Cams',
      type: 'THING',
      color: '#4ade80',
      lat: sb.lat - 0.0048,
      lon: sb.lon + 0.0018,
      alt: 135.0,
      streamId: 'labpadre-hub',
      note: 'product_system (#14) · 24/7 Pad 2 Chopstick Close-Up Cams',
      dossier:
        'Continuous 4K camera array (Nerdle Cam, Rover Cam, Sapphire South Padre Island Tower) pointed directly at Pad 2 chopstick arms.',
      sources: [
        {
          title: 'LabPadre 24/7 Live Camera Streams',
          url: 'https://www.youtube.com/@LabPadre/streams',
          badge: 'LabPadre ↗',
          streamId: 'labpadre-hub',
        },
        {
          title: 'Flight 15 Secondary Tracking Feed #2',
          url: 'https://www.youtube.com/watch?v=QlR1agMLyMk',
          badge: 'Feed #2 ↗',
          streamId: 'starbase-feed-2',
        },
      ],
      active: false,
    }),
    createRichNode({
      id: 'sb-chopstick-arms',
      label: 'Mechazilla Catch Pins & Chopsticks',
      type: 'THING',
      color: '#fb923c',
      lat: sb.lat + 0.0018,
      lon: sb.lon - 0.0052,
      alt: 165.0,
      note: 'object (#16) · 112m Catch Carriage & Shock Absorbers',
      dossier:
        'Hydraulic chopstick catch arms mounted at 112m elevation on Pad 2 tower, closing onto Ship 42 forward-flap load-bearing pins during hover.',
      sources: [
        {
          title: 'SpaceX Starship Catch System Overview',
          url: 'https://www.spacex.com/vehicles/starship/',
          badge: 'SpaceX Spec ↗',
        },
      ],
      active: false,
    }),
    createRichNode({
      id: 'sb-crash-demos',
      label: 'Learjet N722BD & Prime Air 3591 Demos',
      type: 'EVENT',
      color: '#c084fc',
      lat: sb.lat + 0.0056,
      lon: sb.lon + 0.0028,
      alt: 345.0,
      note: 'incident (#22) · Reference 4D ADS-B + CCTV Crash Reconstructions',
      dossier:
        "Bilawal Sidhu's reference 4D crash investigations (Med Jets Learjet 55 N722BD in Northeast Philadelphia & Atlas/Amazon Prime Air Flight 3591 Boeing 767 in Trinity Bay, TX — just 28 miles from Liverpool!) combining ADS-B altitude vectors, weather radar, and synced dashcam/CCTV cones.",
      sources: [
        {
          title: 'NTSB Trinity Bay Prime Air 3591 Docket & Report',
          url: 'https://www.ntsb.gov/investigations/AccidentReports/Pages/AAR2002.aspx',
          badge: 'NTSB AAR-20/02 ↗',
        },
        {
          title: 'Bilawal Sidhu · 4D Crash Reconstructions',
          url: 'https://www.youtube.com/@BilawalSidhu/videos',
          badge: 'Video Demos ↗',
        },
        {
          title: 'Launch Local Bhote Koshi 4D Scene',
          url: '/?scene=bhote-koshi-2026',
          badge: 'Run 4D Demo ↗',
        },
      ],
      active: false,
    }),
  ];

  const sbEdges = [
    createGraphEdge({
      from: 'sb-flight15-event',
      to: 'sb-pad2-place',
      relFwd: 'CATCH_AT_PAD',
      relRev: 'HOSTS_CATCH_FOR',
    }),
    createGraphEdge({
      from: 'sb-ship42-thing',
      to: 'sb-flight15-event',
      relFwd: 'REENTERS_FOR',
      relRev: 'TRACKS_VEHICLE',
    }),
    createGraphEdge({
      from: 'sb-booster22-thing',
      to: 'sb-flight15-event',
      relFwd: 'BOOSTED_MISSION',
      relRev: 'LAUNCHED_BY',
    }),
    createGraphEdge({
      from: 'sb-spacex-org',
      to: 'sb-flight15-event',
      relFwd: 'OPERATES_LAUNCH',
      relRev: 'DEPLOYED_STARLINK',
    }),
    createGraphEdge({
      from: 'sb-bilawal-idea',
      to: 'sb-flight15-event',
      relFwd: 'MODELS_IN_4D',
      relRev: 'RECONSTRUCTED_BY',
    }),
    createGraphEdge({
      from: 'sb-swarm-party',
      to: 'sb-flight15-event',
      relFwd: 'WATCHING_LIVE',
      relRev: 'WATCHED_BY_SWARM',
    }),
    // 2nd-ring expandable Starbase edges (`active: false`)
    createGraphEdge({
      from: 'sb-flight15-event',
      to: 'sb-faa-notam',
      relFwd: 'CLEARED_BY_TFR',
      relRev: 'PROTECTS_CORRIDOR',
      active: false,
    }),
    createGraphEdge({
      from: 'sb-flight15-event',
      to: 'sb-nsf-stream-node',
      relFwd: 'STREAMED_ON',
      relRev: 'BROADCASTS_EVENT',
      active: false,
    }),
    createGraphEdge({
      from: 'sb-pad2-place',
      to: 'sb-labpadre-node',
      relFwd: 'MONITORED_BY_24_7',
      relRev: 'WATCHES_PAD_2',
      active: false,
    }),
    createGraphEdge({
      from: 'sb-ship42-thing',
      to: 'sb-chopstick-arms',
      relFwd: 'CAUGHT_BY_ARMS',
      relRev: 'CATCHES_SHIP_42',
      active: false,
    }),
    createGraphEdge({
      from: 'sb-pad2-place',
      to: 'sb-chopstick-arms',
      relFwd: 'MOUNTS_TOWER_ARMS',
      relRev: 'MOUNTED_ON_PAD_2',
      active: false,
    }),
    createGraphEdge({
      from: 'sb-bilawal-idea',
      to: 'sb-crash-demos',
      relFwd: 'PROVEN_IN_DEMOS',
      relRev: 'INSPIRED_FRAMEWORK',
      active: false,
    }),
  ];
  clusters.push({
    id: 'starbase',
    origin: sb,
    nodes: sbNodes,
    edges: sbEdges,
    maxDistM: 45000,
  });

  return clusters;
}

function loadSavedClusterState(cluster) {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${cluster.id}`);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    applySavedNeo4jGraphState(cluster.nodes, cluster.edges, parsed);
    for (const edge of cluster.edges) {
      const a = cluster.nodes.find((n) => n.id === edge.from);
      const b = cluster.nodes.find((n) => n.id === edge.to);
      if (a?.active && b?.active) edge.active = true;
    }
  } catch {
    // Ignore storage parse failures
  }
}

function saveClusterState(cluster) {
  if (typeof localStorage === 'undefined' || !cluster) return;
  try {
    const state = serializeNeo4jGraphState(cluster.nodes, cluster.edges);
    localStorage.setItem(
      `${STORAGE_PREFIX}${cluster.id}`,
      JSON.stringify(state),
    );
  } catch {
    // Ignore quota errors
  }
}

function clearSavedClusterState(cluster) {
  if (typeof localStorage === 'undefined' || !cluster) return;
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${cluster.id}`);
  } catch {
    // Ignore
  }
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Mounts the Interactive 3D Neo4j Graphiti Personal Knowledge Graph onto the Cesium globe:
 *  - Uses `neo4jForceGraph.js`, `inputOwnership.js`, and `renderGovernor.js`.
 *  - Glossy 3D volumetric sphere sprites + (+N) unexpanded neighbor badges + callout cards.
 *  - Click any ball/card to sprout 2nd-ring neighbors, highlight bidirectional edges,
 *    query live Neo4j (`neo4j_lookup.php`), and open the floating Dossier + Original Source Inspector.
 *  - Drag any 3D ball to move its connected component smoothly across the scene.
 *  - Synced 2D Graphiti Force Drawer (`#pfl-neo4j-drawer`).
 */
export async function loadNeo4jPersonalLayer({
  viewer,
  fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
  signal,
} = {}) {
  let gevIntel = null;
  if (fetchImpl) {
    try {
      const res = await fetchImpl('/gev-intel/index.json', { signal });
      if (res?.ok) gevIntel = await res.json();
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
    }
  }

  const clusters = buildPflNeo4jClusters(gevIntel);
  for (const cluster of clusters) {
    // Record canonical initial active flags for clean reset
    for (const n of cluster.nodes) {
      n._initialActive = Boolean(n.active);
    }
    for (const e of cluster.edges) {
      e._initialActive = Boolean(e.active);
    }
    loadSavedClusterState(cluster);
  }

  const nodeIndex = new Map();
  const entityToNodeId = new Map();
  const nodeVisuals = new Map();
  const edgeVisuals = [];
  const entities = [];
  const liveLookupCache = new Map();

  for (const cluster of clusters) {
    for (const node of cluster.nodes) {
      nodeIndex.set(node.id, { node, cluster });
    }
  }

  let visible = false;
  let destroyed = false;
  let selectedNodeId = null;
  let hoveredNodeId = null;
  let drawerClusterId = 'starbase';
  let drawerOpen = false;
  let eventHandler = null;
  let simTimer = null;
  let domRoot = null;
  let dragState = null;

  function resolveClusterAlt(cluster, rawAlt) {
    if (cluster.id === 'starbase') return rawAlt;
    if (viewer?.scene?.globe && viewer.scene.globe.show !== false) {
      const datumShift = cluster.id === 'birdpond' ? 16.0 : -STORED_GROUND_HEIGHT_M;
      return rawAlt + datumShift;
    }
    return rawAlt;
  }

  function refreshClusterVisuals(targetCluster = null) {
    const list = targetCluster ? [targetCluster] : clusters;
    for (const cluster of list) {
      for (const node of cluster.nodes) {
        const vis = nodeVisuals.get(node.id);
        if (!vis) continue;
        const showNode = visible && Boolean(node.active);
        const isFocus = selectedNodeId === node.id || hoveredNodeId === node.id;
        vis.sphereEnt.show = showNode;
        vis.cardEnt.show = showNode && isFocus;
        if (!showNode) continue;

        const isSel = selectedNodeId === node.id;
        const unexp = countUnexpandedNeighbors(
          cluster.nodes,
          cluster.edges,
          node.id,
        );
        const sphereCanvas = getNeo4jSphereTexture(
          node.color,
          isSel,
          node.expanded,
          unexp,
        );
        if (sphereCanvas && vis.sphereEnt.billboard) {
          vis.sphereEnt.billboard.image = sphereCanvas;
          const px = isSel ? 46 : node.type === 'EVENT' ? 40 : 35;
          vis.sphereEnt.billboard.width = px;
          vis.sphereEnt.billboard.height = px;
        }

        const subtitle = node.note
          ? node.note.split('·')[0].trim()
          : cluster.id;
        const badgeCanvas = makeNodeBadgeCanvas(
          node.type,
          node.label,
          subtitle,
          node.color,
          {
            isSelected: isSel,
            sourceCount: node.sources?.length || 0,
            unexpandedCount: unexp,
          },
        );
        if (badgeCanvas && vis.cardEnt.billboard) {
          vis.cardEnt.billboard.image = badgeCanvas;
          vis.cardEnt.billboard.width = isSel ? 222 : 204;
          vis.cardEnt.billboard.height = isSel ? 50 : 46;
        }
      }
    }

    for (const ev of edgeVisuals) {
      if (targetCluster && ev.cluster.id !== targetCluster.id) continue;
      const a = ev.nodeA;
      const b = ev.nodeB;
      const showEdge =
        visible &&
        Boolean(ev.edge.active) &&
        Boolean(a?.active) &&
        Boolean(b?.active);
      ev.lineEnt.show = showEdge;
      const isEdgeFocus =
        (selectedNodeId !== null && (ev.edge.from === selectedNodeId || ev.edge.to === selectedNodeId)) ||
        (hoveredNodeId !== null && (ev.edge.from === hoveredNodeId || ev.edge.to === hoveredNodeId));
      if (ev.relEnt) ev.relEnt.show = showEdge && isEdgeFocus;
      if (!showEdge) continue;

      const isHi =
        selectedNodeId !== null &&
        (ev.edge.from === selectedNodeId || ev.edge.to === selectedNodeId);
      if (ev.lineEnt.polyline) {
        ev.lineEnt.polyline.width = isHi ? 5.5 : 3.4;
      }
      if (ev.relEnt?.billboard) {
        const relCanvas = makeEdgeRelCanvas(ev.edge.relFwd, ev.edgeColor, isHi);
        if (relCanvas) ev.relEnt.billboard.image = relCanvas;
      }
    }

    governorRequestRender('pfl-neo4j-refresh');
  }

  function runRelaxationBurst(cluster, pinnedIds = new Set()) {
    if (!cluster || destroyed) return;
    if (simTimer) {
      clearInterval(simTimer);
      simTimer = null;
    }
    const isMacro = cluster.id === 'starbase';
    const restCore = isMacro ? 310 : 6.4;
    const restLeaf = isMacro ? 360 : 7.4;
    const repulsionK = isMacro ? 42000 : 26.0;
    const maxStepXY = isMacro ? 14.0 : 0.35;
    const maxStepZ = isMacro ? 4.5 : 0.18;

    let ticks = 0;
    holdContinuousRender('pfl-neo4j-sim');
    simTimer = setInterval(() => {
      if (destroyed || ticks >= 26) {
        clearInterval(simTimer);
        simTimer = null;
        releaseContinuousRender('pfl-neo4j-sim');
        saveClusterState(cluster);
        draw2dDrawer();
        governorRequestRender('pfl-neo4j-sim-done');
        return;
      }
      ticks++;
      stepNeo4jForceSimulation({
        nodes: cluster.nodes,
        edges: cluster.edges,
        dt: 0.024,
        origin: cluster.origin,
        pinnedIds,
        params: {
          repulsionK,
          restLengthCore: restCore,
          restLengthLeaf: restLeaf,
          maxStepXY,
          maxStepZ,
          minAlt: cluster.origin.minAlt,
          maxAlt: cluster.origin.maxAlt,
        },
      });
      draw2dDrawer();
      governorRequestRender('pfl-neo4j-sim-step');
    }, 32);
  }

  // Mount dynamic Cesium entities (100% `<canvas>` billboards, zero Cesium Label usage)
  if (viewer?.entities) {
    for (const cluster of clusters) {
      const nodeMap = new Map();
      for (const node of cluster.nodes) {
        nodeMap.set(node.id, node);

        const dynamicPos = new Cesium.CallbackProperty(
          () => Cesium.Cartesian3.fromDegrees(node.lon, node.lat, resolveClusterAlt(cluster, node.alt)),
          false,
        );

        const unexp = countUnexpandedNeighbors(
          cluster.nodes,
          cluster.edges,
          node.id,
        );
        const sphereCanvas = getNeo4jSphereTexture(
          node.color,
          false,
          node.expanded,
          unexp,
        );
        const subtitle = node.note
          ? node.note.split('·')[0].trim()
          : cluster.id;
        const badgeCanvas = makeNodeBadgeCanvas(
          node.type,
          node.label,
          subtitle,
          node.color,
          {
            isSelected: false,
            sourceCount: node.sources?.length || 0,
            unexpandedCount: unexp,
          },
        );

        const sphereId = `pfl-neo4j-sphere-${node.id}`;
        const sphereEnt = viewer.entities.add({
          id: sphereId,
          name: `[${node.type}] ${node.label}`,
          show: Boolean(node.active),
          position: dynamicPos,
          billboard: sphereCanvas
            ? {
                image: sphereCanvas,
                width: node.type === 'EVENT' ? 40 : 35,
                height: node.type === 'EVENT' ? 40 : 35,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
                  0,
                  cluster.maxDistM,
                ),
              }
            : undefined,
        });

        const cardId = `pfl-neo4j-node-${node.id}`;
        const cardEnt = viewer.entities.add({
          id: cardId,
          name: `[${node.type}] ${node.label}`,
          show: false,
          position: dynamicPos,
          billboard: badgeCanvas
            ? {
                image: badgeCanvas,
                width: 204,
                height: 46,
                pixelOffset: new Cesium.Cartesian2(0, -40),
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
                  0,
                  cluster.maxDistM * 0.72,
                ),
              }
            : undefined,
        });

        entityToNodeId.set(sphereId, node.id);
        entityToNodeId.set(cardId, node.id);
        nodeVisuals.set(node.id, { sphereEnt, cardEnt, cluster });
        entities.push(sphereEnt, cardEnt);
      }

      for (let i = 0; i < cluster.edges.length; i++) {
        const edge = cluster.edges[i];
        const a = nodeMap.get(edge.from);
        const b = nodeMap.get(edge.to);
        if (!a || !b) continue;

        const edgeColor =
          a.type === 'EVENT' || b.type === 'EVENT' ? '#f97316' : '#38bdf8';
        const showInitial = Boolean(edge.active && a.active && b.active);

        const linePositions = new Cesium.CallbackProperty(
          () => [
            Cesium.Cartesian3.fromDegrees(a.lon, a.lat, resolveClusterAlt(cluster, a.alt)),
            Cesium.Cartesian3.fromDegrees(b.lon, b.lat, resolveClusterAlt(cluster, b.alt)),
          ],
          false,
        );

        const lineEnt = viewer.entities.add({
          id: `pfl-neo4j-edge-${cluster.id}-${i}`,
          show: showInitial,
          polyline: {
            positions: linePositions,
            width: 3.4,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.28,
              color: Cesium.Color.fromCssColorString(edgeColor).withAlpha(0.85),
            }),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
              0,
              cluster.maxDistM,
            ),
          },
        });
        entities.push(lineEnt);

        let relEnt = null;
        const relCanvas = makeEdgeRelCanvas(edge.relFwd, edgeColor, false);
        if (relCanvas) {
          const midPos = new Cesium.CallbackProperty(
            () =>
              Cesium.Cartesian3.fromDegrees(
                (a.lon + b.lon) * 0.5,
                (a.lat + b.lat) * 0.5,
                (a.alt + b.alt) * 0.5,
              ),
            false,
          );
          const relId = `pfl-neo4j-rel-${cluster.id}-${i}`;
          relEnt = viewer.entities.add({
            id: relId,
            show: showInitial,
            position: midPos,
            billboard: {
              image: relCanvas,
              width: 126,
              height: 20,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
                0,
                cluster.maxDistM * 0.42,
              ),
            },
          });
          entityToNodeId.set(relId, edge.from);
          entities.push(relEnt);
        }

        edgeVisuals.push({
          cluster,
          edge,
          nodeA: a,
          nodeB: b,
          edgeColor,
          lineEnt,
          relEnt,
        });
      }
    }
  }

  function flyToNode(nodeId) {
    const entry = nodeIndex.get(nodeId);
    if (!entry || !viewer?.camera) return false;
    const { node, cluster } = entry;
    const off = cluster.origin.cameraOffsetDeg || 0.00025;
    const lift = cluster.origin.cameraAltLiftM || 14;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        node.lon + (cluster.id === 'starbase' ? off : 0),
        node.lat - off,
        node.alt + lift,
      ),
      orientation: {
        heading: Cesium.Math.toRadians(cluster.id === 'starbase' ? 320 : 0),
        pitch: Cesium.Math.toRadians(-22),
        roll: 0,
      },
      duration: 1.35,
    });
    return true;
  }

  function pullClusterToCamera(clusterId) {
    const cluster = clusters.find((c) => c.id === clusterId);
    if (!cluster || !viewer?.camera) return false;
    const carto = viewer.camera.positionCartographic;
    if (!carto) return false;
    const camLat = Cesium.Math.toDegrees(carto.latitude);
    const camLon = Cesium.Math.toDegrees(carto.longitude);
    const camAlt = Number.isFinite(carto.height)
      ? carto.height
      : cluster.origin.alt;

    const active = cluster.nodes.filter((n) => n.active);
    if (!active.length) return false;
    const meanLat = active.reduce((s, n) => s + n.lat, 0) / active.length;
    const meanLon = active.reduce((s, n) => s + n.lon, 0) / active.length;
    const forwardDistM = cluster.id === 'starbase' ? 420 : 9.0;
    const heading = viewer.camera.heading || 0;
    const targetLat =
      camLat + (Math.cos(heading) * forwardDistM) / METERS_PER_DEG_LAT;
    const targetLon =
      camLon + (Math.sin(heading) * forwardDistM) / metersPerDegLon(camLat);

    const dLat = targetLat - meanLat;
    const dLon = targetLon - meanLon;
    for (const n of active) {
      n.lat += dLat;
      n.lon += dLon;
      if (cluster.id !== 'starbase') {
        n.alt = Math.max(
          cluster.origin.minAlt,
          Math.min(cluster.origin.maxAlt, camAlt - 1.2),
        );
      }
    }
    saveClusterState(cluster);
    refreshClusterVisuals(cluster);
    draw2dDrawer();
    return true;
  }

  function resetClusterWeb(clusterId) {
    const cluster = clusters.find((c) => c.id === clusterId);
    if (!cluster) return false;
    clearSavedClusterState(cluster);
    for (const n of cluster.nodes) {
      n.lat = n.defaultLat;
      n.lon = n.defaultLon;
      n.alt = n.defaultAlt;
      n.active = Boolean(n._initialActive);
      n.expanded = false;
      n._vx = 0;
      n._vy = 0;
      n._vz = 0;
    }
    for (const e of cluster.edges) {
      e.active = Boolean(e._initialActive);
    }
    refreshClusterVisuals(cluster);
    if (selectedNodeId) renderHud();
    draw2dDrawer();
    return true;
  }

  async function fetchLiveNeo4jDetails(bpId) {
    if (!bpId || !fetchImpl) return null;
    if (liveLookupCache.has(bpId)) return liveLookupCache.get(bpId);
    try {
      const url = `${NEO4J_LOOKUP_URL}?bp_id=${encodeURIComponent(bpId)}`;
      const res = await fetchImpl(url, { signal });
      if (!res?.ok) return null;
      const json = await res.json();
      if (json && json.ok !== false) {
        liveLookupCache.set(bpId, json);
        return json;
      }
    } catch {
      // Cross-origin or offline fallback stays clean
    }
    return null;
  }

  // =========================================================================
  // Floating Interactive Neo4j Dossier + Original Source Inspector + 2D Drawer
  // =========================================================================
  let hudEl = null;
  let hudBodyEl = null;
  let hudToastEl = null;
  let drawerEl = null;
  let drawerCanvas = null;

  function draw2dDrawer() {
    if (!drawerOpen || !drawerCanvas) return;
    const ctx = drawerCanvas.getContext('2d');
    if (!ctx) return;
    const cluster =
      clusters.find((c) => c.id === drawerClusterId) || clusters[0];
    const w = drawerCanvas.width;
    const h = drawerCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // Subtle grid
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.32)';
    ctx.lineWidth = 1;
    for (let x = 30; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 30; y < h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const activeNodes = cluster.nodes.filter((n) => n.active);
    const byId = new Map(activeNodes.map((n) => [n.id, n]));

    // Edges
    for (const e of cluster.edges) {
      if (!e.active) continue;
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) continue;
      const isHi =
        selectedNodeId &&
        (e.from === selectedNodeId || e.to === selectedNodeId);
      ctx.strokeStyle = isHi ? '#fde047' : 'rgba(56, 189, 248, 0.52)';
      ctx.lineWidth = isHi ? 2.4 : 1.4;
      ctx.beginPath();
      ctx.moveTo(a.x2d, a.y2d);
      ctx.lineTo(b.x2d, b.y2d);
      ctx.stroke();

      const mx = (a.x2d + b.x2d) * 0.5;
      const my = (a.y2d + b.y2d) * 0.5;
      ctx.fillStyle = isHi ? '#fef08a' : '#94a3b8';
      ctx.font = '600 9.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(e.relFwd.slice(0, 16), mx, my - 4);
    }

    // Nodes
    for (const n of activeNodes) {
      const isSel = n.id === selectedNodeId;
      const unexp = countUnexpandedNeighbors(
        cluster.nodes,
        cluster.edges,
        n.id,
      );
      const r = isSel ? 13 : 10;

      ctx.fillStyle = n.color;
      ctx.beginPath();
      ctx.arc(n.x2d, n.y2d, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = isSel ? 3 : 1.8;
      ctx.strokeStyle = isSel ? '#fde047' : '#f8fafc';
      ctx.stroke();

      if (unexp > 0) {
        ctx.fillStyle = '#0ea5e9';
        ctx.font = '800 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`+${unexp}`, n.x2d + r + 2, n.y2d - 4);
      }

      ctx.fillStyle = isSel ? '#fde047' : '#e2e8f0';
      ctx.font = `${isSel ? '700' : '600'} 10.5px "Inter", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(n.label.slice(0, 22), n.x2d, n.y2d + r + 13);
    }
  }

  function renderHud(sproutedCount = 0) {
    if (!hudEl || !hudBodyEl) return;
    const entry = selectedNodeId ? nodeIndex.get(selectedNodeId) : null;
    if (!entry) {
      hudEl.classList.remove('open');
      return;
    }

    const { node, cluster } = entry;
    drawerClusterId = cluster.id;
    hudEl.classList.add('open');

    if (hudToastEl) {
      if (sproutedCount > 0) {
        hudToastEl.textContent = `Sprouted +${sproutedCount} linked Neo4j node${sproutedCount > 1 ? 's' : ''} in 3D`;
        hudToastEl.style.display = 'block';
      } else {
        hudToastEl.style.display = 'none';
      }
    }

    // Gather all incident edges (active + any remaining)
    const incident = [];
    for (const e of cluster.edges) {
      if (e.from === node.id) {
        const nb = cluster.nodes.find((x) => x.id === e.to);
        if (nb) {
          incident.push({
            neighbor: nb,
            relOut: e.relFwd,
            relIn: e.relRev,
            direction: 'out',
          });
        }
      } else if (e.to === node.id) {
        const nb = cluster.nodes.find((x) => x.id === e.from);
        if (nb) {
          incident.push({
            neighbor: nb,
            relOut: e.relRev,
            relIn: e.relFwd,
            direction: 'in',
          });
        }
      }
    }

    const liveDb = node.bpId ? liveLookupCache.get(node.bpId) : null;
    const sourcesHtml =
      node.sources && node.sources.length > 0
        ? node.sources
            .map(
              (s) => `
          <div class="pfl-n4j-src-row">
            <a class="pfl-n4j-src-link" href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">
              <span class="pfl-n4j-src-title">${escapeHtml(s.title)}</span>
              <span class="pfl-n4j-src-badge">${escapeHtml(s.badge)}</span>
            </a>
            ${
              s.streamId
                ? `<button type="button" class="pfl-n4j-dock-btn" data-n4j-stream="${escapeHtml(s.streamId)}" title="Play embedded stream in God's Eye View Watch Dock">▶ Dock</button>`
                : ''
            }
          </div>`,
            )
            .join('')
        : `<div style="font-size:11.5px;color:#94a3b8">No external links attached.</div>`;

    const relsHtml =
      incident.length > 0
        ? incident
            .map((item) => {
              const nb = item.neighbor;
              const unexp = countUnexpandedNeighbors(
                cluster.nodes,
                cluster.edges,
                nb.id,
              );
              return `
          <button type="button" class="pfl-n4j-rel-row" data-n4j-jump="${escapeHtml(nb.id)}">
            <span class="pfl-n4j-rel-verb">──[${escapeHtml(item.relOut)} ⟷]──▶</span>
            <span class="pfl-n4j-rel-target">
              <span class="pfl-n4j-dot" style="background:${escapeHtml(nb.color)}"></span>
              <span>${escapeHtml(nb.label)}</span>
              ${unexp > 0 ? `<span class="pfl-n4j-plus">+${unexp}</span>` : ''}
            </span>
          </button>`;
            })
            .join('')
        : `<div style="font-size:11.5px;color:#94a3b8">No connected edges.</div>`;

    let liveDbHtml = '';
    if (
      liveDb &&
      (liveDb.node ||
        (Array.isArray(liveDb.neighbors) && liveDb.neighbors.length > 0))
    ) {
      const dbProps = liveDb.node?.properties || liveDb.properties || {};
      const propPairs = Object.entries(dbProps)
        .filter(([k, v]) => v !== null && v !== '' && k !== 'embedding')
        .slice(0, 5)
        .map(
          ([k, v]) =>
            `<div style="font-size:10.5px;color:#cbd5e1"><span style="color:#38bdf8">${escapeHtml(k)}:</span> ${escapeHtml(String(v).slice(0, 72))}</div>`,
        )
        .join('');
      const dbNeighbors = (liveDb.neighbors || [])
        .slice(0, 5)
        .map(
          (nb) =>
            `<div style="font-size:10.5px;color:#94a3b8">• [${escapeHtml(nb.rel || 'LINK')}] ${escapeHtml(nb.name || nb.label || nb.bp_id || '')}</div>`,
        )
        .join('');
      liveDbHtml = `
        <div class="pfl-n4j-section">
          <div class="pfl-n4j-sec-hdr">LIVE NEO4J GRAPH DB (${escapeHtml(node.bpId)})</div>
          ${propPairs}
          ${dbNeighbors}
        </div>
      `;
    }

    hudBodyEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px">
        <span class="pfl-n4j-type-pill" style="color:${escapeHtml(node.color)};border-color:${escapeHtml(node.color)}">
          ${escapeHtml(node.type)} · ${escapeHtml(cluster.id.toUpperCase())}
        </span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:#94a3b8">
          ${node.lat.toFixed(4)}°N, ${node.lon.toFixed(4)}°W · ${Math.round(node.alt)}m
        </span>
      </div>
      <div style="font-size:16px;font-weight:800;color:#f8fafc;line-height:1.25;margin-bottom:4px">
        ${escapeHtml(node.label)}
      </div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#94a3b8;margin-bottom:8px">
        ${escapeHtml(node.note)}
      </div>
      ${
        node.eventTimeIso
          ? `<div style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#fed7aa;background:rgba(249,115,22,0.14);border:1px solid rgba(249,115,22,0.38);padding:4px 8px;border-radius:7px;margin-bottom:8px">4D Time Anchor: ${escapeHtml(node.eventTimeIso)}</div>`
          : ''
      }
      <div class="pfl-n4j-dossier">${escapeHtml(node.dossier)}</div>

      <div class="pfl-n4j-section">
        <div class="pfl-n4j-sec-hdr">ORIGINAL SOURCES &amp; PRIMARY FEEDS (${node.sources?.length || 0})</div>
        <div class="pfl-n4j-src-list">${sourcesHtml}</div>
      </div>

      <div class="pfl-n4j-section">
        <div class="pfl-n4j-sec-hdr">BIDIRECTIONAL NEO4J RELATIONSHIPS (${incident.length})</div>
        <div class="pfl-n4j-rel-list">${relsHtml}</div>
      </div>

      ${liveDbHtml}

      <div class="pfl-n4j-actions">
        <button type="button" class="pfl-n4j-btn primary" data-n4j-act="fly">Fly To Node</button>
        ${
          node.streamId
            ? `<button type="button" class="pfl-n4j-btn warn" data-n4j-stream="${escapeHtml(node.streamId)}">▶ Open Live Stream</button>`
            : ''
        }
        <button type="button" class="pfl-n4j-btn" data-n4j-act="drawer">2D Graphiti Web</button>
        <button type="button" class="pfl-n4j-btn" data-n4j-act="pull">Pull Web Here</button>
        <button type="button" class="pfl-n4j-btn" data-n4j-act="reset">Reset Web</button>
      </div>
    `;

    hudBodyEl.querySelectorAll('[data-n4j-jump]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-n4j-jump');
        if (targetId)
          selectNode(targetId, { expand: true, openHud: true, fly: false });
      });
    });

    hudBodyEl.querySelectorAll('[data-n4j-stream]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sid = btn.getAttribute('data-n4j-stream');
        if (
          typeof window !== 'undefined' &&
          window.__pflStarshipTheater?.openStream
        ) {
          window.__pflStarshipTheater.openStream(sid);
        }
      });
    });

    hudBodyEl.querySelectorAll('[data-n4j-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.getAttribute('data-n4j-act');
        if (act === 'fly') flyToNode(node.id);
        else if (act === 'pull') pullClusterToCamera(cluster.id);
        else if (act === 'reset') resetClusterWeb(cluster.id);
        else if (act === 'drawer') {
          drawerOpen = !drawerOpen;
          if (drawerEl) drawerEl.classList.toggle('open', drawerOpen);
          draw2dDrawer();
        }
      });
    });
  }

  function selectNode(
    nodeId,
    { expand = true, openHud = true, fly = false } = {},
  ) {
    const entry = nodeIndex.get(nodeId);
    if (!entry) return null;
    const { node, cluster } = entry;
    selectedNodeId = node.id;
    node.active = true;

    let newlySprouted = 0;
    if (expand) {
      const exp = expandClusterNode(cluster, node.id);
      newlySprouted = exp.newlySprouted;
      if (newlySprouted > 0) {
        runRelaxationBurst(cluster, new Set([node.id]));
      }
      saveClusterState(cluster);
    }

    refreshClusterVisuals(cluster);
    if (openHud) renderHud(newlySprouted);
    if (fly) flyToNode(node.id);
    draw2dDrawer();

    if (node.bpId && !liveLookupCache.has(node.bpId)) {
      fetchLiveNeo4jDetails(node.bpId).then((data) => {
        if (data && selectedNodeId === node.id && !destroyed) {
          renderHud(0);
        }
      });
    }

    return {
      node,
      clusterId: cluster.id,
      newlySprouted,
      sources: node.sources,
    };
  }

  if (typeof document !== 'undefined' && document.body) {
    const oldRoot = document.getElementById('pfl-neo4j-ui-root');
    if (oldRoot) oldRoot.remove();

    domRoot = document.createElement('div');
    domRoot.id = 'pfl-neo4j-ui-root';
    domRoot.innerHTML = `
      <style>
        #pfl-neo4j-hud {
          position: fixed;
          top: 76px;
          right: 16px;
          width: min(395px, calc(100vw - 28px));
          max-height: calc(100vh - 150px);
          background: rgba(8, 13, 25, 0.95);
          border: 1px solid rgba(56, 189, 248, 0.55);
          border-radius: 14px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.78), 0 0 22px rgba(56, 189, 248, 0.18);
          backdrop-filter: blur(14px);
          color: #f8fafc;
          font-family: "Inter", system-ui, -apple-system, sans-serif;
          z-index: 980;
          display: none;
          flex-direction: column;
          overflow: hidden;
          pointer-events: auto;
        }
        #pfl-neo4j-hud.open {
          display: flex;
        }
        .pfl-n4j-hdr {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 9px 12px;
          background: rgba(15, 23, 42, 0.95);
          border-bottom: 1px solid rgba(148, 163, 184, 0.2);
          cursor: move;
          user-select: none;
        }
        .pfl-n4j-toast {
          display: none;
          background: rgba(34, 197, 94, 0.18);
          color: #86efac;
          font-family: "JetBrains Mono", monospace;
          font-size: 11px;
          font-weight: 700;
          padding: 5px 12px;
          border-bottom: 1px solid rgba(34, 197, 94, 0.35);
        }
        .pfl-n4j-body {
          padding: 12px;
          overflow-y: auto;
        }
        .pfl-n4j-type-pill {
          font-family: "JetBrains Mono", monospace;
          font-size: 10.5px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid currentColor;
          background: rgba(15, 23, 42, 0.8);
        }
        .pfl-n4j-dossier {
          font-size: 12.5px;
          line-height: 1.48;
          color: #e2e8f0;
          background: rgba(15, 23, 42, 0.72);
          border-left: 3px solid #38bdf8;
          padding: 8px 10px;
          border-radius: 6px;
          margin-bottom: 10px;
        }
        .pfl-n4j-section {
          margin-top: 10px;
          padding-top: 8px;
          border-top: 1px solid rgba(148, 163, 184, 0.16);
        }
        .pfl-n4j-sec-hdr {
          font-family: "JetBrains Mono", monospace;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.05em;
          color: #94a3b8;
          margin-bottom: 6px;
        }
        .pfl-n4j-src-list, .pfl-n4j-rel-list {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .pfl-n4j-src-row {
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .pfl-n4j-src-link {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 6px 9px;
          background: rgba(30, 41, 59, 0.78);
          border: 1px solid rgba(56, 189, 248, 0.32);
          border-radius: 8px;
          color: #7dd3fc;
          text-decoration: none;
          font-size: 12px;
          font-weight: 600;
          transition: all 0.14s ease;
        }
        .pfl-n4j-src-link:hover {
          background: rgba(56, 189, 248, 0.2);
          border-color: #38bdf8;
          color: #ffffff;
        }
        .pfl-n4j-src-badge {
          font-family: "JetBrains Mono", monospace;
          font-size: 10px;
          color: #fde047;
          white-space: nowrap;
        }
        .pfl-n4j-dock-btn {
          cursor: pointer;
          padding: 6px 8px;
          border-radius: 8px;
          border: 1px solid #f97316;
          background: rgba(249, 115, 22, 0.22);
          color: #fed7aa;
          font-family: "JetBrains Mono", monospace;
          font-size: 10.5px;
          font-weight: 700;
          white-space: nowrap;
        }
        .pfl-n4j-dock-btn:hover {
          background: #f97316;
          color: #fff;
        }
        .pfl-n4j-rel-row {
          width: 100%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          padding: 5px 8px;
          background: rgba(15, 23, 42, 0.78);
          border: 1px solid rgba(148, 163, 184, 0.22);
          border-radius: 7px;
          color: #e2e8f0;
          font-size: 11.5px;
          text-align: left;
          transition: all 0.14s ease;
        }
        .pfl-n4j-rel-row:hover {
          background: rgba(56, 189, 248, 0.16);
          border-color: #38bdf8;
        }
        .pfl-n4j-rel-verb {
          font-family: "JetBrains Mono", monospace;
          font-size: 10px;
          color: #94a3b8;
          white-space: nowrap;
        }
        .pfl-n4j-rel-target {
          display: flex;
          align-items: center;
          gap: 5px;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .pfl-n4j-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .pfl-n4j-plus {
          font-family: "JetBrains Mono", monospace;
          font-size: 9.5px;
          color: #38bdf8;
          background: rgba(14, 165, 233, 0.18);
          padding: 1px 4px;
          border-radius: 4px;
        }
        .pfl-n4j-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-top: 11px;
          padding-top: 9px;
          border-top: 1px solid rgba(148, 163, 184, 0.18);
        }
        .pfl-n4j-btn {
          cursor: pointer;
          font-family: "JetBrains Mono", monospace;
          font-size: 10.5px;
          font-weight: 700;
          padding: 5px 9px;
          border-radius: 7px;
          border: 1px solid rgba(148, 163, 184, 0.34);
          background: rgba(30, 41, 59, 0.85);
          color: #e2e8f0;
        }
        .pfl-n4j-btn:hover {
          border-color: #38bdf8;
          color: #fff;
        }
        .pfl-n4j-btn.primary {
          background: rgba(14, 165, 233, 0.24);
          border-color: #38bdf8;
          color: #7dd3fc;
        }
        .pfl-n4j-btn.warn {
          background: rgba(249, 115, 22, 0.24);
          border-color: #f97316;
          color: #fed7aa;
        }
        #pfl-neo4j-drawer {
          position: fixed;
          left: 16px;
          bottom: 84px;
          width: min(430px, calc(100vw - 32px));
          background: rgba(8, 13, 25, 0.95);
          border: 1px solid rgba(168, 85, 247, 0.55);
          border-radius: 14px;
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.76);
          backdrop-filter: blur(12px);
          z-index: 975;
          display: none;
          flex-direction: column;
          overflow: hidden;
          pointer-events: auto;
        }
        #pfl-neo4j-drawer.open {
          display: flex;
        }
      </style>

      <div id="pfl-neo4j-hud" role="dialog" aria-label="Neo4j Node Dossier and Original Sources">
        <div class="pfl-n4j-hdr" data-n4j-drag-hdr>
          <span style="font-family:'JetBrains Mono',monospace;font-size:11.5px;font-weight:800;color:#38bdf8">
            ● NEO4J GRAPHITI DOSSIER &amp; SOURCES
          </span>
          <button type="button" class="pfl-n4j-btn" data-n4j-close style="padding:2px 7px">✕</button>
        </div>
        <div class="pfl-n4j-toast" data-n4j-toast></div>
        <div class="pfl-n4j-body" data-n4j-body></div>
      </div>

      <div id="pfl-neo4j-drawer" role="dialog" aria-label="2D Synced Neo4j Graphiti Canvas">
        <div class="pfl-n4j-hdr">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:800;color:#c084fc">
              🕸️ 2D GRAPHITI FORCE WEB
            </span>
            <select data-n4j-cluster-sel style="background:#0f172a;color:#e2e8f0;border:1px solid #475569;border-radius:5px;font-size:11px;padding:2px 5px">
              <option value="starbase">Starbase Pad 2</option>
              <option value="liverpool">Liverpool HQ</option>
              <option value="birdpond">Bird Pond</option>
            </select>
          </div>
          <button type="button" class="pfl-n4j-btn" data-n4j-drawer-close style="padding:2px 7px">✕</button>
        </div>
        <canvas width="430" height="310" data-n4j-canvas style="width:100%;height:auto;cursor:pointer;display:block"></canvas>
      </div>
    `;
    document.body.appendChild(domRoot);

    hudEl = domRoot.querySelector('#pfl-neo4j-hud');
    hudBodyEl = domRoot.querySelector('[data-n4j-body]');
    hudToastEl = domRoot.querySelector('[data-n4j-toast]');
    drawerEl = domRoot.querySelector('#pfl-neo4j-drawer');
    drawerCanvas = domRoot.querySelector('[data-n4j-canvas]');

    domRoot.querySelector('[data-n4j-close]')?.addEventListener('click', () => {
      selectedNodeId = null;
      hudEl.classList.remove('open');
      refreshClusterVisuals();
      draw2dDrawer();
    });

    domRoot
      .querySelector('[data-n4j-drawer-close]')
      ?.addEventListener('click', () => {
        drawerOpen = false;
        drawerEl.classList.remove('open');
      });

    const clusterSel = domRoot.querySelector('[data-n4j-cluster-sel]');
    clusterSel?.addEventListener('change', (ev) => {
      drawerClusterId = ev.currentTarget.value;
      draw2dDrawer();
    });

    // Click inside 2D Graphiti canvas selects & expands 3D node
    drawerCanvas?.addEventListener('click', (ev) => {
      const rect = drawerCanvas.getBoundingClientRect();
      const sx = ((ev.clientX - rect.left) / rect.width) * drawerCanvas.width;
      const sy = ((ev.clientY - rect.top) / rect.height) * drawerCanvas.height;
      const cluster =
        clusters.find((c) => c.id === drawerClusterId) || clusters[0];
      let best = null;
      let bestDist = 22;
      for (const n of cluster.nodes) {
        if (!n.active) continue;
        const d = Math.hypot(n.x2d - sx, n.y2d - sy);
        if (d < bestDist) {
          bestDist = d;
          best = n;
        }
      }
      if (best) {
        selectNode(best.id, { expand: true, openHud: true, fly: true });
      }
    });

    // Draggable HUD header
    const dragHdr = domRoot.querySelector('[data-n4j-drag-hdr]');
    let hudDrag = null;
    dragHdr?.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('button')) return;
      const rect = hudEl.getBoundingClientRect();
      hudDrag = {
        startX: ev.clientX,
        startY: ev.clientY,
        origLeft: rect.left,
        origTop: rect.top,
      };
      dragHdr.setPointerCapture?.(ev.pointerId);
    });
    dragHdr?.addEventListener('pointermove', (ev) => {
      if (!hudDrag) return;
      const left = Math.max(
        8,
        Math.min(
          window.innerWidth - 260,
          hudDrag.origLeft + (ev.clientX - hudDrag.startX),
        ),
      );
      const top = Math.max(
        8,
        Math.min(
          window.innerHeight - 120,
          hudDrag.origTop + (ev.clientY - hudDrag.startY),
        ),
      );
      hudEl.style.left = `${left}px`;
      hudEl.style.top = `${top}px`;
      hudEl.style.right = 'auto';
    });
    dragHdr?.addEventListener('pointerup', () => {
      hudDrag = null;
    });
  }

  // =========================================================================
  // Cesium ScreenSpaceEventHandler: Pick, Sprout Neighbors, Open Dossier & Drag
  // =========================================================================
  let hoverPointerDown = false;
  let lastHoverPickMs = 0;
  const hoverListenerController =
    typeof AbortController === 'function' ? new AbortController() : null;
  if (typeof viewer?.scene?.canvas?.addEventListener === 'function') {
    const canvasEl = viewer.scene.canvas;
    const onPtrDown = () => {
      hoverPointerDown = true;
    };
    const onPtrUp = () => {
      hoverPointerDown = false;
    };
    const sig = hoverListenerController?.signal;
    canvasEl.addEventListener('pointerdown', onPtrDown, {
      passive: true,
      capture: true,
      ...(sig ? { signal: sig } : {}),
    });
    if (typeof window !== 'undefined') {
      const winOpts = {
        passive: true,
        capture: true,
        ...(sig ? { signal: sig } : {}),
      };
      window.addEventListener('pointerup', onPtrUp, winOpts);
      window.addEventListener('pointercancel', onPtrUp, winOpts);
      window.addEventListener('blur', onPtrUp, {
        passive: true,
        ...(sig ? { signal: sig } : {}),
      });
    }
  }

  function matchNodeFromPicked(picked) {
    const entId =
      picked?.id?.id ?? (typeof picked?.id === 'string' ? picked.id : null);
    if (!entId) return null;
    if (entityToNodeId.has(entId)) return entityToNodeId.get(entId);
    if (EXTERNAL_ENTITY_NODE_MAP[entId]) return EXTERNAL_ENTITY_NODE_MAP[entId];
    return null;
  }

  function resolvePickedNodeId(windowPosition, { allowDrill = true } = {}) {
    if (!viewer?.scene || !windowPosition) return null;
    const topPick = viewer.scene.pick(windowPosition);
    const direct = matchNodeFromPicked(topPick);
    if (direct) return direct;
    if (!allowDrill || !viewer.scene.drillPick) return null;
    const drill = viewer.scene.drillPick(windowPosition, 8) || [];
    for (const picked of drill) {
      const hit = matchNodeFromPicked(picked);
      if (hit) return hit;
    }
    return null;
  }

  if (viewer?.scene?.canvas && Cesium.ScreenSpaceEventHandler) {
    eventHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    const lockCamForDrag = (locked) => {
      const sc = viewer?.scene?.screenSpaceCameraController;
      if (!sc) return;
      sc.enableRotate = !locked;
      sc.enableTranslate = !locked;
      sc.enableTilt = !locked;
      if (!locked) sc.enableInputs = true;
    };

    eventHandler.setInputAction((downEvent) => {
      if (!visible || !isPointerFree()) return;
      const nodeId = resolvePickedNodeId(downEvent.position);
      if (!nodeId) return;
      const entry = nodeIndex.get(nodeId);
      if (!entry) return;

      const compIds = getConnectedComponentIds(
        entry.cluster.nodes,
        entry.cluster.edges,
        nodeId,
      );
      const startCoords = new Map();
      for (const cid of compIds) {
        const cn = entry.cluster.nodes.find((x) => x.id === cid);
        if (cn) startCoords.set(cid, { lat: cn.lat, lon: cn.lon, alt: cn.alt });
      }

      lockCamForDrag(true);
      dragState = {
        nodeId,
        cluster: entry.cluster,
        startPos: Cesium.Cartesian2.clone(downEvent.position),
        lastPos: Cesium.Cartesian2.clone(downEvent.position),
        moved: false,
        lease: null,
        camLocked: true,
        startCoords,
      };
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    eventHandler.setInputAction((moveEvent) => {
      if (!visible) return;
      const endPos = moveEvent.endPosition;
      if (!dragState) {
        if (hoverPointerDown || !isPointerFree()) {
          if (viewer.scene.canvas.style && hoverPointerDown) {
            viewer.scene.canvas.style.cursor = '';
          }
          return;
        }
        const nowMs = performance.now();
        if (nowMs - lastHoverPickMs < 180) return;
        lastHoverPickMs = nowMs;
        const hoverId = resolvePickedNodeId(endPos, { allowDrill: false });
        if (hoverId !== hoveredNodeId) {
          hoveredNodeId = hoverId;
          refreshClusterVisuals();
        }
        if (viewer.scene.canvas.style) {
          viewer.scene.canvas.style.cursor = hoverId ? 'pointer' : '';
        }
        return;
      }

      const distPx = Cesium.Cartesian2.distance(dragState.startPos, endPos);
      if (!dragState.moved && distPx > 4) {
        const lease = claimPointer('pfl-neo4j-drag');
        if (!lease) {
          lockCamForDrag(false);
          dragState = null;
          return;
        }
        dragState.lease = lease;
        dragState.moved = true;
        holdContinuousRender('pfl-neo4j-drag');
        if (viewer.scene.screenSpaceCameraController) {
          viewer.scene.screenSpaceCameraController.enableInputs = false;
        }
      }

      if (dragState.moved && viewer.camera) {
        const { cluster, nodeId } = dragState;
        const anchorNode = cluster.nodes.find((x) => x.id === nodeId);
        if (anchorNode) {
          const camPos = viewer.camera.positionWC || viewer.camera.position;
          const nodeCart = Cesium.Cartesian3.fromDegrees(
            anchorNode.lon,
            anchorNode.lat,
            anchorNode.alt,
          );
          const rangeM = Cesium.Cartesian3.distance(camPos, nodeCart);
          const metersPerPx = Math.max(
            0.015,
            (rangeM * 2 * Math.tan(Cesium.Math.toRadians(30))) /
              Math.max(300, viewer.scene.canvas.clientHeight || 800),
          );

          const dxPx = endPos.x - dragState.startPos.x;
          const dyPx = endPos.y - dragState.startPos.y;
          const heading = viewer.camera.heading || 0;

          const eastM =
            dxPx * metersPerPx * Math.cos(heading) -
            dyPx * metersPerPx * Math.sin(heading);
          const northM =
            -dxPx * metersPerPx * Math.sin(heading) -
            dyPx * metersPerPx * Math.cos(heading);

          const dLat = northM / METERS_PER_DEG_LAT;
          const dLon = eastM / metersPerDegLon(anchorNode.lat);

          for (const [cid, orig] of dragState.startCoords.entries()) {
            const cn = cluster.nodes.find((x) => x.id === cid);
            if (cn) {
              cn.lat = orig.lat + dLat;
              cn.lon = orig.lon + dLon;
            }
          }
          governorRequestRender('pfl-neo4j-drag');
        }
      }
      dragState.lastPos = Cesium.Cartesian2.clone(endPos);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    const finishDragState = (triggerSelectOnClick = true) => {
      if (!dragState) return;
      const finished = dragState;
      dragState = null;

      lockCamForDrag(false);
      if (finished.moved) {
        try { releaseContinuousRender('pfl-neo4j-drag'); } catch {}
      }
      if (finished.lease) {
        releasePointer(finished.lease);
      }

      if (finished.moved) {
        saveClusterState(finished.cluster);
        draw2dDrawer();
        governorRequestRender('pfl-neo4j-drag-end');
      } else if (triggerSelectOnClick) {
        selectNode(finished.nodeId, { expand: true, openHud: true });
      }
    };

    eventHandler.setInputAction(() => finishDragState(true), Cesium.ScreenSpaceEventType.LEFT_UP);
    if (typeof window !== 'undefined') {
      const onSafetyUp = () => finishDragState(false);
      const safetySig = hoverListenerController?.signal;
      window.addEventListener('pointerup', onSafetyUp, { passive: true, ...(safetySig ? { signal: safetySig } : {}) });
      window.addEventListener('blur', onSafetyUp, { passive: true, ...(safetySig ? { signal: safetySig } : {}) });
    }

    // Fallback click handler for touch/synthetic clicks where LEFT_DOWN was not armed
    eventHandler.setInputAction((clickEvent) => {
      if (!visible || !isPointerFree() || dragState) return;
      const nodeId = resolvePickedNodeId(clickEvent.position);
      if (nodeId && selectedNodeId !== nodeId) {
        selectNode(nodeId, { expand: true, openHud: true });
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  const setVisible = (next) => {
    visible = Boolean(next);
    if (!visible && hudEl) hudEl.classList.remove('open');
    refreshClusterVisuals();
    return visible;
  };

  const toggleVisible = () => setVisible(!visible);

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    if (simTimer) {
      clearInterval(simTimer);
      simTimer = null;
    }
    releaseContinuousRender('pfl-neo4j-sim');
    if (dragState?.lease) {
      releasePointer(dragState.lease);
      dragState = null;
    }
    if (viewer?.scene?.screenSpaceCameraController) {
      viewer.scene.screenSpaceCameraController.enableInputs = true;
    }
    if (eventHandler) {
      eventHandler.destroy();
      eventHandler = null;
    }
    if (hoverListenerController) {
      hoverListenerController.abort();
    }
    if (domRoot) {
      domRoot.remove();
      domRoot = null;
    }
    if (viewer?.entities) {
      for (const ent of entities) viewer.entities.remove(ent);
    }
    entities.length = 0;
    if (typeof window !== 'undefined' && window.__pflNeo4jLayer === api) {
      delete window.__pflNeo4jLayer;
    }
    governorRequestRender('pfl-neo4j-destroy');
  };

  const api = {
    taxonomy: PFL_ENTITY_TAXONOMY,
    clusters,
    entities,
    selectNode,
    flyToNode,
    pullClusterToCamera,
    resetClusterWeb,
    getSelectedNodeId: () => selectedNodeId,
    isVisible: () => visible,
    setVisible,
    toggleVisible,
    destroy,
  };

  if (typeof window !== 'undefined') {
    window.__pflNeo4jLayer = api;
  }
  governorRequestRender('pfl-neo4j-load');
  return api;
}
