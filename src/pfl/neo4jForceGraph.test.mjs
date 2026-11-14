import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_NEO4J_ORIGIN,
  applySavedNeo4jGraphState,
  createGraphEdge,
  createGraphNode,
  expandNodeNeighbors,
  getConnectedComponentIds,
  getNodeDegreeMap,
  metersPerDegLon,
  serializeNeo4jGraphState,
  spawnNeighborPosition,
  stepNeo4jForceSimulation,
} from './neo4jForceGraph.js';

test('createGraphNode and createGraphEdge initialize valid defaults', () => {
  const node = createGraphNode({ id: 'bp_101', label: 'Bird Pond Core' });
  assert.equal(node.id, 'bp_101');
  assert.equal(node.label, 'Bird Pond Core');
  assert.equal(node.lat, DEFAULT_NEO4J_ORIGIN.lat);
  assert.equal(node.lon, DEFAULT_NEO4J_ORIGIN.lon);
  assert.equal(node.alt, DEFAULT_NEO4J_ORIGIN.alt);
  assert.equal(node.active, false);

  const edge = createGraphEdge({ from: 'bp_101', to: 'tract_7' });
  assert.equal(edge.from, 'bp_101');
  assert.equal(edge.to, 'tract_7');
  assert.equal(edge.active, true);
});

test('getConnectedComponentIds performs bidirectional graph search', () => {
  const nodes = [
    createGraphNode({ id: 'n1', active: true }),
    createGraphNode({ id: 'n2', active: true }),
    createGraphNode({ id: 'n3', active: true }),
    createGraphNode({ id: 'n4', active: true }), // isolated
    createGraphNode({ id: 'n5', active: false }), // inactive
  ];
  const edges = [
    createGraphEdge({ from: 'n1', to: 'n2', active: true }),
    createGraphEdge({ from: 'n2', to: 'n3', active: true }),
    createGraphEdge({ from: 'n3', to: 'n5', active: true }), // points to inactive
  ];

  const clusterN1 = getConnectedComponentIds(nodes, edges, 'n1');
  assert.deepEqual(Array.from(clusterN1).sort(), ['n1', 'n2', 'n3']);

  const clusterN4 = getConnectedComponentIds(nodes, edges, 'n4');
  assert.deepEqual(Array.from(clusterN4), ['n4']);
});

test('getNodeDegreeMap counts active connections', () => {
  const nodes = [
    createGraphNode({ id: 'hub', active: true }),
    createGraphNode({ id: 'leaf1', active: true }),
    createGraphNode({ id: 'leaf2', active: true }),
  ];
  const edges = [
    createGraphEdge({ from: 'hub', to: 'leaf1', active: true }),
    createGraphEdge({ from: 'hub', to: 'leaf2', active: true }),
  ];

  const degrees = getNodeDegreeMap(nodes, edges);
  assert.equal(degrees.hub, 2);
  assert.equal(degrees.leaf1, 1);
  assert.equal(degrees.leaf2, 1);
});

test('spawnNeighborPosition generates non-overlapping radial coordinates', () => {
  const parent = createGraphNode({ id: 'center', lat: 29.1394, lon: -95.8041, alt: 3.4 });
  const pos0 = spawnNeighborPosition(parent, 0, 4, { radiusM: 5.0 });
  const pos1 = spawnNeighborPosition(parent, 1, 4, { radiusM: 5.0 });

  assert.ok(pos0.lat !== pos1.lat);
  assert.ok(pos0.lon !== pos1.lon);
  assert.ok(pos0.x2d >= 40 && pos0.x2d <= 390);
  assert.ok(pos0.y2d >= 40 && pos0.y2d <= 340);
});

test('stepNeo4jForceSimulation applies repulsion and spring forces stably', () => {
  // Two active nodes placed almost on top of each other
  const nodeA = createGraphNode({ id: 'A', lat: 29.139400, lon: -95.804100, alt: 3.4, active: true });
  const nodeB = createGraphNode({ id: 'B', lat: 29.139401, lon: -95.804101, alt: 3.4, active: true });
  const nodes = [nodeA, nodeB];
  const edges = [createGraphEdge({ from: 'A', to: 'B', active: true })];

  const initialDistLat = Math.abs(nodeB.lat - nodeA.lat);

  // Run 10 simulation steps
  for (let i = 0; i < 10; i++) {
    stepNeo4jForceSimulation({ nodes, edges, dt: 0.016 });
  }

  const finalDistLat = Math.abs(nodeB.lat - nodeA.lat);
  // Repulsion should push them apart
  assert.ok(
    finalDistLat > initialDistLat,
    `Final distance ${finalDistLat} should exceed initial distance ${initialDistLat}`,
  );
  // Altitudes should remain within comfortable bounds [1.5 .. 25.0]
  assert.ok(nodeA.alt >= 1.5 && nodeA.alt <= 25.0);
  assert.ok(nodeB.alt >= 1.5 && nodeB.alt <= 25.0);
});

test('expandNodeNeighbors activates neighbors and marks parent expanded', () => {
  const parent = createGraphNode({ id: 'p', active: true });
  const child1 = createGraphNode({ id: 'c1', active: false });
  const child2 = createGraphNode({ id: 'c2', active: false });
  const nodes = [parent, child1, child2];
  const edges = [
    createGraphEdge({ from: 'p', to: 'c1', active: true }),
    createGraphEdge({ from: 'p', to: 'c2', active: true }),
  ];

  const res = expandNodeNeighbors(nodes, edges, 'p');
  assert.equal(res.newlySprouted, 2);
  assert.equal(parent.expanded, true);
  assert.equal(child1.active, true);
  assert.equal(child2.active, true);
});

test('serializeNeo4jGraphState and applySavedNeo4jGraphState preserve layout round-trip', () => {
  const nodes = [
    createGraphNode({ id: 'n1', lat: 29.14, lon: -95.80, alt: 4.2, active: true, expanded: true }),
  ];
  const edges = [createGraphEdge({ from: 'n1', to: 'n2', active: true })];

  const serialized = serializeNeo4jGraphState(nodes, edges);
  assert.equal(serialized.nodes.n1.alt, 4.2);
  assert.equal(serialized.nodes.n1.active, true);

  const restoredNodes = [createGraphNode({ id: 'n1', alt: 1.0 })];
  applySavedNeo4jGraphState(restoredNodes, [], serialized);
  assert.equal(restoredNodes[0].alt, 4.2);
});
