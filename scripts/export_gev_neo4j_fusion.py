#!/usr/bin/env python3
"""
export_gev_neo4j_fusion.py — Export the PFL Intelligence Graph (graphiti-reference-neo4j-1,
371 nodes / 728 edges) into the static `gev-neo4j-fusion-v1` JSON bundle for
God's Eye View + Elite Spy Worlds (`public/gev-intel/index.json`).

Read-only against Neo4j. Never writes credentials to disk or stdout.
"""
import datetime
import json
import os
import subprocess
import sys

sys.path.insert(0, "/home/paul/zelenka-ingest")
from vps_cypher_run import get_conn  # noqa: E402

OUT_PATH = "/home/paul/gods-eye-view/public/gev-intel/index.json"

# Spatial bindings linking Neo4j Entity names to 417 Palm Drive 3D anchors & camera frustums
SPATIAL_BINDINGS = {
    "Beaver": {
        "station": "palm-drive-417",
        "slot_id": "yard-overview-20261012",
        "lat": 29.247245,
        "lon": -95.231595,
        "alt": 1.2,
        "heading": 198,
        "pitch": -28,
        "range_m": 22.0,
        "uv_pin": [0.35, 0.72],
        "landmark": "Monaco Beaver RV + Solar Arch (SW Driveway)"
    },
    "Wyze": {
        "station": "palm-drive-417",
        "slot_id": "yard-overview-20261012",
        "lat": 29.247315,
        "lon": -95.231524,
        "alt": 0.45,
        "heading": 198,
        "pitch": -32,
        "range_m": 25.0,
        "uv_pin": [0.50, 0.58],
        "landmark": "Calibrated Wyze V4 + Cam1 Stitched Ground Quad"
    },
    "VEVOR": {
        "station": "palm-drive-417",
        "slot_id": "back-yard-cam2-water",
        "lat": 29.247302,
        "lon": -95.231214,
        "alt": 1.5,
        "heading": 100,
        "pitch": -22,
        "range_m": 24.0,
        "landmark": "East Pond & Inflatable Dock (back-yard-cam2-water)"
    },
    "EcoFlow": {
        "station": "palm-drive-417",
        "slot_id": "yard-overview-20261012",
        "lat": 29.247340,
        "lon": -95.231530,
        "alt": 3.0,
        "heading": 18,
        "pitch": -35,
        "range_m": 20.0,
        "landmark": "Yellow House DELTA Pro Ultra & Smart Home Panel 2"
    },
    "Antminer L7": {
        "station": "palm-drive-417",
        "slot_id": "yard-overview-20261012",
        "lat": 29.247355,
        "lon": -95.231545,
        "alt": 2.5,
        "heading": 18,
        "pitch": -35,
        "range_m": 18.0,
        "landmark": "Cave & House Antminer L7 Scrypt Hash Zone"
    },
    "blue25": {
        "station": "palm-drive-417",
        "slot_id": "yard-overview-20261012",
        "lat": 29.247355,
        "lon": -95.231545,
        "alt": 2.5,
        "heading": 18,
        "pitch": -35,
        "range_m": 18.0,
        "landmark": "Cave Miner Circuit Smart Plug (blue25)"
    },
    "Holodeck": {
        "station": "palm-drive-417",
        "slot_id": "yard-overview-20261012",
        "lat": 29.247340,
        "lon": -95.231530,
        "alt": 4.0,
        "heading": 198,
        "pitch": -25,
        "range_m": 30.0,
        "splat_uri": "/splat/gaussians-yard/tileset.json",
        "landmark": "3D Gaussian Splat Yard & Holodeck Portal"
    },
    "PaulPrime Home": {
        "station": "palm-drive-417",
        "slot_id": "yard-overview-20261012",
        "lat": 29.247340,
        "lon": -95.231530,
        "alt": 4.0,
        "heading": 198,
        "pitch": -25,
        "range_m": 32.0,
        "landmark": "417 Palm Drive Station Overview"
    },
    "Lisa Muse": {
        "station": "palm-drive-417",
        "anchor_id": "lisa-muse-sovereign-anchor",
        "lat": 29.247520,
        "lon": -95.231440,
        "alt": 2.0,
        "heading": 180,
        "pitch": -15,
        "range_m": 14.0,
        "landmark": "Lisa Muse — Sovereign Anchor (417 Palm Drive)"
    },
    "Paul Prime": {
        "station": "palm-drive-417",
        "slot_id": "yard-overview-20261012",
        "lat": 29.247340,
        "lon": -95.231530,
        "alt": 5.0,
        "heading": 198,
        "pitch": -30,
        "range_m": 35.0,
        "landmark": "Paul Prime — 417 Palm Drive Command Center"
    },
    "Lisa Holmes": {
        "station": "palm-drive-417",
        "slot_id": "yard-overview-20261012",
        "lat": 29.247340,
        "lon": -95.231530,
        "alt": 3.5,
        "heading": 198,
        "pitch": -25,
        "range_m": 28.0,
        "landmark": "Lisa Holmes — Local OpenClaw Seat @ 417 Palm Drive"
    }
}


def run_cypher_json(pw, query):
    script = f"""
from neo4j import GraphDatabase
import json
driver = GraphDatabase.driver("bolt://127.0.0.1:7687", auth=("neo4j", {json.dumps(pw)}))
with driver.session() as s:
    res = [r.data() for r in s.run({json.dumps(query)})]
print(json.dumps(res, default=str))
driver.close()
"""
    r = subprocess.run(
        ["/home/paul/graphiti-reference/venv/bin/python", "-c", script],
        capture_output=True, text=True, timeout=15, check=True
    )
    return json.loads(r.stdout)


def main():
    c = get_conn("neo4j-local-graphiti")
    pw = c.get("password") or c.get("pass") or c.get("secret")

    total_nodes = run_cypher_json(pw, "MATCH (n) RETURN count(n) AS v")[0]["v"]
    total_rels = run_cypher_json(pw, "MATCH ()-[r]->() RETURN count(r) AS v")[0]["v"]
    labels = run_cypher_json(pw, "MATCH (n) UNWIND labels(n) AS l RETURN l AS label, count(*) AS count ORDER BY count DESC")

    entities = run_cypher_json(pw, """
        MATCH (n:Entity)
        RETURN elementId(n) AS id,
               coalesce(n.uuid, elementId(n)) AS uuid,
               coalesce(n.name, '(unnamed)') AS name,
               labels(n) AS labels,
               coalesce(n.group_id, '') AS group_id,
               coalesce(n.summary, '') AS summary
        ORDER BY name
    """)

    relates = run_cypher_json(pw, """
        MATCH (a:Entity)-[r]->(b:Entity)
        RETURN elementId(a) AS from,
               elementId(b) AS to,
               type(r) AS type,
               coalesce(r.fact, r.name, type(r)) AS fact,
               coalesce(toString(r.valid_at), toString(r.created_at), '') AS valid_at
    """)

    episodes = run_cypher_json(pw, """
        MATCH (e:Episodic)
        OPTIONAL MATCH (e)-[:MENTIONS]->(n:Entity)
        WITH e, collect(DISTINCT elementId(n)) AS mentioned_ids, collect(DISTINCT n.name) AS mentioned_names
        RETURN elementId(e) AS id,
               coalesce(e.name, elementId(e)) AS name,
               coalesce(e.group_id, '') AS group_id,
               coalesce(toString(e.valid_at), toString(e.created_at), '') AS valid_at,
               coalesce(substring(e.content, 0, 280), '') AS preview,
               mentioned_ids,
               mentioned_names
        ORDER BY name
    """)

    topics = run_cypher_json(pw, """
        MATCH (t:Topic)
        RETURN elementId(t) AS id,
               coalesce(t.name, '(topic)') AS name
        ORDER BY name
    """)

    web_nodes = []
    spatial_count = 0
    for ent in entities:
        sp = SPATIAL_BINDINGS.get(ent["name"])
        if sp:
            spatial_count += 1
        web_nodes.append({
            "id": ent["id"],
            "uuid": ent["uuid"],
            "name": ent["name"],
            "labels": ent["labels"],
            "group_id": ent["group_id"],
            "summary": ent["summary"],
            "spatial_ref": sp
        })

    out = {
        "schema": "gev-neo4j-fusion-v1",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "counts": {
            "total_nodes": total_nodes,
            "relationships": total_rels,
            "entities": len(web_nodes),
            "facts": len(relates),
            "episodes": len(episodes),
            "topics": len(topics),
            "spatial_bound_entities": spatial_count
        },
        "labels": labels,
        "entity_web": {
            "nodes": web_nodes,
            "edges": relates
        },
        "episodes": episodes,
        "topics": topics
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)

    print("EXPORT_OK:", OUT_PATH, json.dumps(out["counts"]))


if __name__ == "__main__":
    main()
