# Elite Spy Worlds: God's Eye View + Neo4j Force-Graph Fusion Brief
**Card**: Trello `yOhampgQ` / PFL Postgres Task Board  
**Author**: `@antigravity` (coordinating with `@lisa-muse`, `@lisa`, `@codex`, `@friday`, `@mckay`, `@zelenka`)  
**Date**: 2026-10-24  
**Target Host**: `https://elitespyworlds.com/` (Guardrail: `osgrid.elitespyworlds.com` stays permanently excluded per Paul's Oct-10 ruling)

---

## 1. Architectural Pattern: "One Dataset Underneath, Multi-Modal Views Over It"

Following the exact architecture we reverse-engineered from Bilawal Sidhu's **Flight 7598** (`flight-7598-crash.bilawalsidhu.chatgpt.site`) and our existing **Stargate Graph v2** (`esw_stargate_dashboard.py` on `elitespyworlds.com/stargate-graph/`):
- **Zero Live API Exposure / Zero Credentials on the Public Web**:
  - The public page on `elitespyworlds.com` never hits live Google 3D Tiles APIs, Cesium ion keys, or raw Neo4j Bolt ports from visitor browsers.
  - Instead, a **unified static JSON + asset bundle** is baked from:
    1. **PFL Intelligence Graph (`graphiti-reference-neo4j-1`, `127.0.0.1:7687`)**: `371 nodes / 728 edges` (`146 Entity`, `185 Episodic`, `25 Topic`, `10 Memory`, `454 MENTIONS`, `129 NEXT`, `92 RELATES_TO`).
    2. **Stargate Twin Graph (`neo4j-twin`, `127.0.0.1:17687`)**: `41,515 nodes / 40,935 edges` (selectable via dataset switcher pill).
    3. **God's Eye View Spatial Scene (`/home/paul/gods-eye-view` @ commit `e29f05ae`)**:
       - Ground-pinned multi-camera yard textures (`/yard-frames/front-yard-stitched-2026-10-12.png`, `back-yard-cam2-water-2026-10-12.jpg`, `CALIBRATED_HOUSE_SURVEY` in `src/pfl/yardFrames.js`).
       - 3D Gaussian Splat (`/splat/gaussians-yard/`).
       - Pre-rendered / portable `gev-scene-bundle` (`src/director/sharing/bundle.js`).

---

## 2. Page Layout & Four Switching Modes

The page (`https://elitespyworlds.com/gods-eye-view/` or `/intelligence-graph/`) wraps a **Split / Mode-Switchable Canvas** with a persistent **Timeline & Entity Inspector**:

1. **Mode 1 — Split Fusion View (Default Desktop Layout)**:
   - **Left Pane (55% width, resizable splitter via `@mckay`)**: **God's Eye View 3D Viewport** (417 Palm Drive station / Yard Splat / Camera Frustums / Global Layers).
   - **Right Pane (45% width)**: **`vis-network` Force-Directed Graph** (`forceAtlas2Based`, self-hosted `vis-network.min.js`) obeying **The Centering Law** (`travelTo(id)` pins the clicked bubble at the center of the canvas while connected neighbors dynamically re-orbit around it, and hovering any node/edge reveals its `RELATES_TO` fact inline).
   - **Bottom Rail**: **Chronological Episode & Snapshot Scrubber** driven by the `185 Episodic` nodes (`NEXT` chain: `transcript-2026-10-12` → `2026-10-24`) + camera snapshot timestamps (`2026-10-12`, `2026-10-15`, `2026-10-24`).
2. **Mode 2 — 3D Scene Fullscreen + Floating Mini-Graph HUD**:
   - Fullscreen God's Eye View with a translucent corner force-graph radar showing the 1-hop neighborhood of the currently active 3D object/camera.
3. **Mode 3 — Force Graph Fullscreen + PiP 3D Camera Frustum**:
   - Fullscreen Neo4j force-directed graph (`esw_stargate_dashboard.py` v2 layout) where selecting any physical entity opens its 3D camera frustum / stitched ground view in the right-hand Investigation Deck.
4. **Mode 4 — Replay / Case-File Mode (Flight-7598 Pattern)**:
   - Guided narrative walkthrough stepping through key `Episodic` milestones with synchronized 3D camera flights and graph sub-tree highlights.

---

## 3. Unified Data Shape (`gev-neo4j-fusion-v1.json`)

Lisa Muse's export (`graphiti-reference-neo4j-1` → static JSON in `/wp-content/uploads/gev-intel/index.json`) adds a `spatial_bindings` map that links Neo4j `Entity` names/UUIDs directly to God's Eye View 3D anchors and camera slots:

```json
{
  "schema": "gev-neo4j-fusion-v1",
  "generated_at": "2026-10-24T18:20:00Z",
  "counts": {
    "total_nodes": 371,
    "relationships": 728,
    "entities": 146,
    "episodes": 185,
    "topics": 25,
    "memories": 10
  },
  "entity_web": {
    "nodes": [
      {
        "id": "ent:Beaver",
        "name": "Beaver",
        "labels": ["Entity", "Vehicle", "PowerZone"],
        "group_id": "lisa-muse-extraction",
        "summary": "Monaco Beaver RV under the solar arch; EcoFlow space and VEVOR battery zone.",
        "spatial_ref": {
          "station": "palm-drive-417",
          "slot_id": "yard-overview-20261012",
          "lat": 29.247245,
          "lon": -95.231595,
          "alt": 1.2,
          "heading": 198,
          "pitch": -28,
          "range_m": 22.0,
          "uv_pin": [0.35, 0.72]
        }
      }
    ],
    "edges": [
      {
        "id": "rel:001",
        "from": "ent:Beaver",
        "to": "ent:VEVOR",
        "type": "RELATES_TO",
        "fact": "Discussed Oct 12-15 around the VEVOR 5 kWh battery and inflatable dock purchases."
      }
    ]
  },
  "episodes": [
    {
      "id": "ep:transcript-2026-10-20",
      "name": "transcript-2026-10-20",
      "valid_at": "2026-10-20T00:00:00Z",
      "mentions": ["ent:Paul_Prime", "ent:Lisa_Muse", "ent:Wyze", "ent:Holodeck"],
      "next_id": "ep:transcript-2026-10-21"
    }
  ]
}
```

### Live Spatial Anchor Bindings (Already Present in Both `graphiti-reference-neo4j-1` & `gods-eye-view`)
| Neo4j Entity (`name` in `371/728` Graph) | `group_id` | Bound 3D Target in `gods-eye-view` (`src/pfl/yardFrames.js` & `station.js`) |
| :--- | :--- | :--- |
| **`Beaver`** | `lisa-muse-extraction` | Monaco Beaver RV + Solar Arch (`yard-overview-20261012`, `uv=[0.35, 0.72]`, SW driveway) |
| **`Wyze`** | `lisa-muse-extraction` | Calibrated Wyze V4 + Cam1 Stitched Ground Quad (`front-yard-stitched-2026-10-12.png`, `camLat: 29.247315, camLon: -95.231524`) |
| **`VEVOR`** | `lisa-muse-extraction` | Pond / Inflatable Dock (`back-yard-cam2-water`, East pond camera frustum) |
| **`EcoFlow` / `Antminer L7` / `blue25`** | `lisa-muse-extraction` | Yellow House / Cave Miner Power Zone (`29.24734, -95.23153`, house center & Smart Home Panel 2) |
| **`Holodeck` / `PaulPrime Home`** | `lisa-muse-extraction` | 3D Gaussian Splat Interior/Yard Portal (`/splat/gaussians-yard/tileset.json`) |
| **`Paul Prime` / `Lisa Muse` / `Lisa Holmes`** | `lisa-muse-self` | Station Root (`417 Palm Drive, Liverpool, TX 77577`, full station overview orbit) |
| **`PFL Atrium` / `Friday` / `Codex` / `Antigravity` / `mckay` / `zelenka`** | `matrix-atrium` | Active Swarm Command HUD & Telemetry Layer |

---

## 4. Bidirectional Event Bus (`Select in One -> See in Both`)

Both panels communicate over a lightweight, zero-dependency event bridge (`window.dispatchEvent(new CustomEvent(...))` when same-page, mirrored via `window.postMessage` when `gods-eye-view` is mounted in an iframe):

1. **Graph → 3D Scene (`gev:focus-entity`)**:
   - Visitor clicks a bubble in `vis-network` (e.g., `Beaver` or `Wyze`).
   - `travelTo(id)` pins the bubble at canvas center, re-solves `forceAtlas2Based` physics so its 1-hop neighbors orbit it, and emits:
     ```js
     window.postMessage({
       type: 'gev:focus-entity',
       entityId: node.id,
       name: node.name,
       spatialRef: node.spatial_ref
     }, '*');
     ```
   - `gods-eye-view` receives `gev:focus-entity`, flies the camera smoothly to `spatialRef` (`lat, lon, heading, pitch, range_m`), highlights the matching `yardFrames` camera frustum (`selectYardSlot(spatialRef.slot_id)`), and pulses the 3D landmark marker.
2. **3D Scene → Graph (`sg:focus-node`)**:
   - Visitor clicks a 3D camera frustum, ground landmark (Monaco Beaver, Yellow Pump House, Culvert, Pond Dock), or timeline marker inside `gods-eye-view`.
   - `gods-eye-view` emits:
     ```js
     window.parent.postMessage({
       type: 'sg:focus-node',
       entityName: 'Beaver',
       slotId: 'yard-overview-20261012'
     }, '*');
     ```
   - The graph panel calls `window.__sg.travelTo(matchedNodeId)`, centering that bubble and opening its extracted `RELATES_TO` facts and `Episodic` transcript mentions in the right-hand Investigation Deck.
3. **Timeline Scrubber → Both (`gev:scrub-episode`)**:
   - Dragging the bottom timeline across `Episodic` nodes (`transcript-2026-10-12` .. `2026-10-24`) filters the force graph to light up entities mentioned (`[:MENTIONS]`) in that episode while switching `gods-eye-view` to the matching historical camera snapshot date.

---

## 5. Swarm Execution Lanes (Herding the Cats)

| Agent Seat | Card / ID | Concrete Deliverable |
| :--- | :--- | :--- |
| **`@lisa-muse`** | Trello `wQrTm0S7` | Export `graphiti-reference-neo4j-1` (`371 nodes / 728 edges`) into `/wp-content/uploads/gev-intel/index.json` using the `gev-neo4j-fusion-v1` schema above, and assemble the WordPress host page on `elitespyworlds.com`. |
| **`@codex`** | Trello `3rjQfMYO` / `#22035` | Build & deploy the static `gods-eye-view` production bundle (`npm run build` from synced commit `e29f05ae`) to `/var/www/wordpress/wp-content/uploads/gods-eye-view/` on `107.173.135.137` (`elitespyworlds.com`), exposing the `postMessage` listener (`gev:focus-entity` / `sg:focus-node`). |
| **`@antigravity`** | Trello `yOhampgQ` | Delivered this Fusion Design Brief (`docs/ELITE_SPY_WORLDS_GEV_NEO4J_FUSION_BRIEF.md`), verified `e29f05ae` repo sync + calibrated `yardFrames.js` landmarks, and wired the bidirectional `gev:focus-entity` ↔ `sg:focus-node` bridge spec. |
| **`@lisa` (Holmes)** | `#22033` + 14:00 Beat | Verify `371/728` counts against `127.0.0.1:7687` (`neo4j-local-graphiti`), enforce the `osgrid` exclusion guardrail, and fold the deployed `elitespyworlds.com` GEV topology into `#22033`. |
| **`@mckay` & `@zelenka`** | UI & Splat Support | `@mckay`: responsive split-pane drag divider between GEV 3D canvas and `vis-network` graph. `@zelenka`: verify `.spz` / 3D Tiles Gaussian splat asset loading on static HTTP without WebGL black-screen fallback bugs. |
