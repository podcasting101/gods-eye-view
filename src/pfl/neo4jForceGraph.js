/**
 * 3D Neo4j Force-Directed Knowledge Graph Engine for God's Eye View / PFL.
 *
 * Implements:
 *  - 3D Coulomb-Hooke force simulation with eye-level buoyancy pull and mass weighting.
 *  - Bidirectional relationship traversal and connected-component cluster extraction.
 *  - Deterministic radial neighbor sprouting in 3D geospatial & 2D canvas coordinate spaces.
 *  - Standalone graph state serialization and hydration.
 */

export const METERS_PER_DEG_LAT = 111320.0;

export const DEFAULT_NEO4J_ORIGIN = Object.freeze({
  lat: 29.1394,
  lon: -95.8041,
  alt: 3.4,
});

export const FORCE_SIM_DEFAULTS = Object.freeze({
  repulsionK: 26.0,
  springK: 2.4,
  restLengthCore: 5.2,
  restLengthLeaf: 6.0,
  damping: 0.80,
  dtMax: 0.04,
  dtMin: 0.004,
  maxStepXY: 0.35,
  maxStepZ: 0.18,
  minAlt: 1.5,
  maxAlt: 25.0,
});

export function metersPerDegLon(lat) {
  const rad = (Number(lat) || 0.0) * (Math.PI / 180.0);
  return METERS_PER_DEG_LAT * Math.cos(rad);
}

/**
 * Creates a clean graph node object.
 */
export function createGraphNode({
  id,
  bpId = null,
  label = '',
  type = 'Node',
  color = '#38bdf8',
  lat = DEFAULT_NEO4J_ORIGIN.lat,
  lon = DEFAULT_NEO4J_ORIGIN.lon,
  alt = DEFAULT_NEO4J_ORIGIN.alt,
  note = '',
  active = false,
  expanded = false,
  x2d = 215,
  y2d = 195,
} = {}) {
  return {
    id: String(id),
    bpId: bpId ? String(bpId) : null,
    label: String(label || id),
    type: String(type),
    color: String(color),
    lat: Number(lat),
    lon: Number(lon),
    alt: Number(alt),
    defaultLat: Number(lat),
    defaultLon: Number(lon),
    defaultAlt: Number(alt),
    note: String(note),
    active: Boolean(active),
    expanded: Boolean(expanded),
    x2d: Number(x2d),
    y2d: Number(y2d),
    _vx: 0.0,
    _vy: 0.0,
    _vz: 0.0,
  };
}

/**
 * Creates a clean graph edge object.
 */
export function createGraphEdge({
  from,
  to,
  relFwd = 'CONNECTED_TO',
  relRev = 'CONNECTED_FROM',
  active = true,
  color = 'rgba(56, 189, 248, 0.45)',
} = {}) {
  return {
    from: String(from),
    to: String(to),
    relFwd: String(relFwd),
    relRev: String(relRev),
    active: Boolean(active),
    color: String(color),
  };
}

/**
 * Returns a Set of all active node IDs connected to startId via bidirectional traversal.
 */
export function getConnectedComponentIds(nodes = [], edges = [], startId) {
  const connected = new Set();
  const startStr = String(startId || '');
  if (!startStr) return connected;

  const nodeMap = new Map();
  nodes.forEach((n) => {
    if (n && n.active) nodeMap.set(n.id, n);
  });
  if (!nodeMap.has(startStr)) {
    connected.add(startStr);
    return connected;
  }

  // Build adjacency map for active edges
  const adj = new Map();
  edges.forEach((e) => {
    if (!e || !e.active) return;
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from).push(e.to);
    adj.get(e.to).push(e.from);
  });

  const queue = [startStr];
  connected.add(startStr);

  while (queue.length > 0) {
    const curr = queue.shift();
    const neighbors = adj.get(curr) || [];
    for (const nb of neighbors) {
      if (!connected.has(nb) && nodeMap.has(nb)) {
        connected.add(nb);
        queue.push(nb);
      }
    }
  }

  return connected;
}

/**
 * Computes node degree map for active nodes and edges.
 */
export function getNodeDegreeMap(nodes = [], edges = []) {
  const deg = {};
  nodes.forEach((n) => {
    if (n && n.active) deg[n.id] = 0;
  });
  edges.forEach((e) => {
    if (!e || !e.active) return;
    if (deg[e.from] !== undefined) deg[e.from]++;
    if (deg[e.to] !== undefined) deg[e.to]++;
  });
  return deg;
}

/**
 * Computes radial spawn coordinate around parentNode for newly sprouted neighbors.
 */
export function spawnNeighborPosition(
  parentNode,
  index,
  totalNew,
  { radiusM = 5.4, origin = DEFAULT_NEO4J_ORIGIN } = {},
) {
  const safeTotal = Math.max(1, Number(totalNew) || 1);
  const baseAngle = ((index / safeTotal) * Math.PI * 2) + 0.35;
  const pLat = Number(parentNode.lat) || origin.lat;
  const pLon = Number(parentNode.lon) || origin.lon;
  const pAlt = Number(parentNode.alt) || origin.alt;

  const mPerDegLon = metersPerDegLon(pLat);
  const dLat = (Math.sin(baseAngle) * radiusM) / METERS_PER_DEG_LAT;
  const dLon = (Math.cos(baseAngle) * radiusM) / mPerDegLon;

  return {
    lat: pLat + dLat,
    lon: pLon + dLon,
    alt: Math.max(2.3, Math.min(5.6, pAlt + ((index % 3) - 1) * 0.55)),
    x2d: Math.max(40, Math.min(390, (Number(parentNode.x2d) || 215) + Math.cos(baseAngle) * 78)),
    y2d: Math.max(40, Math.min(340, (Number(parentNode.y2d) || 195) + Math.sin(baseAngle) * 78)),
  };
}

/**
 * Executes one step of the 3D force-directed layout simulation.
 */
export function stepNeo4jForceSimulation({
  nodes = [],
  edges = [],
  dt = 0.016,
  origin = DEFAULT_NEO4J_ORIGIN,
  pinnedIds = new Set(),
  params = {},
} = {}) {
  const cfg = { ...FORCE_SIM_DEFAULTS, ...params };
  const safeDt = Math.min(cfg.dtMax, Math.max(cfg.dtMin, Number(dt) || 0.016));
  const activeNodes = nodes.filter((n) => n && n.active);
  if (activeNodes.length < 2) return;

  const cosLat = Math.cos((origin.lat * Math.PI) / 180.0);
  const mPerLon = METERS_PER_DEG_LAT * cosLat;
  const degMap = getNodeDegreeMap(activeNodes, edges);

  const fx = {};
  const fy = {};
  const fz = {};
  activeNodes.forEach((n) => {
    fx[n.id] = 0.0;
    fy[n.id] = 0.0;
    fz[n.id] = 0.0;
  });

  // 1. All-pairs 3D Coulomb repulsion
  for (let i = 0; i < activeNodes.length; i++) {
    const a = activeNodes[i];
    for (let j = i + 1; j < activeNodes.length; j++) {
      const b = activeNodes[j];
      const dx = (b.lon - a.lon) * mPerLon;
      const dy = (b.lat - a.lat) * METERS_PER_DEG_LAT;
      const dz = (b.alt - a.alt);
      const d2 = dx * dx + dy * dy + dz * dz + 0.35;
      const d = Math.sqrt(d2);
      const rep = cfg.repulsionK / d2;
      const ux = dx / d;
      const uy = dy / d;
      const uz = (dz / d) * 0.35;

      fx[a.id] -= ux * rep;
      fy[a.id] -= uy * rep;
      fz[a.id] -= uz * rep;

      fx[b.id] += ux * rep;
      fy[b.id] += uy * rep;
      fz[b.id] += uz * rep;
    }
  }

  // 2. Hooke spring attraction along active edges
  const activeNodeMap = new Map();
  activeNodes.forEach((n) => activeNodeMap.set(n.id, n));

  edges.forEach((e) => {
    if (!e || !e.active) return;
    const a = activeNodeMap.get(e.from);
    const b = activeNodeMap.get(e.to);
    if (!a || !b) return;

    const dx = (b.lon - a.lon) * mPerLon;
    const dy = (b.lat - a.lat) * METERS_PER_DEG_LAT;
    const dz = (b.alt - a.alt);
    const d = Math.max(0.25, Math.sqrt(dx * dx + dy * dy + dz * dz));
    const restLen = (degMap[a.id] <= 1 || degMap[b.id] <= 1)
      ? cfg.restLengthLeaf
      : cfg.restLengthCore;

    const f = (d - restLen) * cfg.springK;
    const ux = dx / d;
    const uy = dy / d;
    const uz = (dz / d) * 0.40;

    fx[a.id] += ux * f;
    fy[a.id] += uy * f;
    fz[a.id] += uz * f;

    fx[b.id] -= ux * f;
    fy[b.id] -= uy * f;
    fz[b.id] -= uz * f;
  });

  // 3. Velocity integration & damping
  activeNodes.forEach((n) => {
    if (pinnedIds && pinnedIds.has(n.id)) {
      n._vx = 0.0;
      n._vy = 0.0;
      n._vz = 0.0;
      return;
    }

    const mass = 1.0 + Math.min(4.0, (degMap[n.id] || 1) * 0.55);
    const altPull = ((origin.alt || 3.4) - (n.alt || origin.alt)) * 0.65;

    n._vx = ((n._vx || 0.0) + (fx[n.id] / mass) * safeDt * 4.5) * cfg.damping;
    n._vy = ((n._vy || 0.0) + (fy[n.id] / mass) * safeDt * 4.5) * cfg.damping;
    n._vz = ((n._vz || 0.0) + ((fz[n.id] + altPull) / mass) * safeDt * 3.0) * cfg.damping;

    const stepX = Math.max(-cfg.maxStepXY, Math.min(cfg.maxStepXY, n._vx * safeDt * 4.5));
    const stepY = Math.max(-cfg.maxStepXY, Math.min(cfg.maxStepXY, n._vy * safeDt * 4.5));
    const stepZ = Math.max(-cfg.maxStepZ, Math.min(cfg.maxStepZ, n._vz * safeDt * 3.0));

    n.lon += stepX / mPerLon;
    n.lat += stepY / METERS_PER_DEG_LAT;
    n.alt = Math.max(cfg.minAlt, Math.min(cfg.maxAlt, (n.alt || origin.alt) + stepZ));
  });
}

/**
 * Expands bidirectional neighbors of a node from the catalog.
 */
export function expandNodeNeighbors(nodes = [], edges = [], nodeId) {
  const target = nodes.find((n) => n.id === nodeId);
  if (!target) return { newlySprouted: 0, node: null };
  target.active = true;

  const toActivate = [];
  edges.forEach((e) => {
    const otherId = e.from === target.id ? e.to : (e.to === target.id ? e.from : null);
    if (!otherId) return;
    const nb = nodes.find((x) => x.id === otherId);
    if (nb && !nb.active) toActivate.push(nb);
  });

  toActivate.forEach((nb, idx) => {
    const pos = spawnNeighborPosition(target, idx, toActivate.length);
    nb.lat = pos.lat;
    nb.lon = pos.lon;
    nb.alt = pos.alt;
    nb.x2d = pos.x2d;
    nb.y2d = pos.y2d;
    nb.active = true;
  });

  target.expanded = true;
  return { newlySprouted: toActivate.length, node: target };
}

/**
 * Serializes graph state for persistence to server / ui_panels.__neo4j_web.
 */
export function serializeNeo4jGraphState(nodes = [], edges = []) {
  const serializedNodes = {};
  nodes.forEach((n) => {
    if (!n) return;
    serializedNodes[n.id] = {
      bpId: n.bpId,
      label: n.label,
      type: n.type,
      color: n.color,
      lat: Math.round(n.lat * 1e7) / 1e7,
      lon: Math.round(n.lon * 1e7) / 1e7,
      alt: Math.round(n.alt * 100) / 100,
      active: n.active,
      expanded: n.expanded,
      note: n.note,
    };
  });

  const serializedEdges = edges
    .filter((e) => e && e.active)
    .map((e) => ({
      from: e.from,
      to: e.to,
      relFwd: e.relFwd,
      relRev: e.relRev,
      active: e.active,
    }));

  return {
    version: '1.0.0',
    nodes: serializedNodes,
    edges: serializedEdges,
  };
}

/**
 * Applies saved graph state into runtime nodes and edges.
 */
export function applySavedNeo4jGraphState(nodes = [], edges = [], savedState = {}) {
  if (!savedState || !savedState.nodes) return;
  const savedNodes = savedState.nodes;

  Object.keys(savedNodes).forEach((id) => {
    const sn = savedNodes[id];
    let node = nodes.find((n) => n.id === id);
    if (node) {
      if (typeof sn.lat === 'number') node.lat = sn.lat;
      if (typeof sn.lon === 'number') node.lon = sn.lon;
      if (typeof sn.alt === 'number') node.alt = sn.alt;
      if (sn.active !== undefined) node.active = Boolean(sn.active);
      if (sn.expanded !== undefined) node.expanded = Boolean(sn.expanded);
    } else {
      nodes.push(
        createGraphNode({
          id,
          bpId: sn.bpId,
          label: sn.label,
          type: sn.type,
          color: sn.color,
          lat: sn.lat,
          lon: sn.lon,
          alt: sn.alt,
          active: Boolean(sn.active),
          expanded: Boolean(sn.expanded),
          note: sn.note,
        }),
      );
    }
  });
}
