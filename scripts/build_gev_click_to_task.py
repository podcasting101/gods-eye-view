#!/usr/bin/env python3
"""Track 5 (Card #22045): Bidirectional Graphiti / Neo4j Click-to-Task Action Loop (gev-click-to-task-v1).

Binds 3D spatial entities and camera frustums in God's Eye View (417 Palm Drive ENU frame)
to verified `entity_web.nodes` / `entity_web.edges` entries in `/gev-intel/index.json`
and live read-only Postgres `public.tasks` rows (`psql -U paul -d postgres`), with:
1. Strict URL parsing (`urllib.parse.urlsplit`) for `LOCAL_LOOPBACK_ONLY` endpoints
   (rejecting hostname suffix/prefix confusion, non-127.0.0.1 IPs, and userinfo).
2. Fail-closed Graphiti entity resolution against `entity_web.nodes` (`id` or `uuid`).
3. Fail-closed live Postgres `public.tasks` query (`allow_fixture_fallback=False` by default;
   opt-in test fixtures explicitly labeled `OPT_IN_TEST_FIXTURE`).
4. Round-trip shadow click receipt generation and verification (`execute_shadow_click_roundtrip`
   & `verify_shadow_click_receipt`), consumed at runtime by `public/memory-palace.js` and
   `public/memory-palace.html`.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit


SCHEMA_VERSION = "gev-click-to-task-v1"
CARD_REF = 22045
MODE = "SHADOW_READ_ONLY"
PRIVACY_LOCAL_ONLY = "LOCAL_LOOPBACK_ONLY"
PRIVACY_PROPERTY_YARD = "ZONE1_PROPERTY_YARD"
ALLOWED_LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}
REQUIRED_TASK_IDS = (22054, 22045, 22035, 21128, 1157)


def validate_loopback_target_url(target_url: str) -> str:
    if not isinstance(target_url, str) or not target_url.strip():
        raise PermissionError("Two-Zone Privacy Firewall blocked empty target_url")
    if target_url != target_url.strip() or any(ch.isspace() for ch in target_url):
        raise PermissionError("Two-Zone Privacy Firewall blocked whitespace in target_url")

    parsed = urlsplit(target_url)
    if parsed.scheme not in ("http", "https", "local"):
        raise PermissionError(
            f"Two-Zone Privacy Firewall blocked scheme {parsed.scheme!r} on LOCAL_LOOPBACK_ONLY node"
        )
    if parsed.username is not None or parsed.password is not None:
        raise PermissionError(
            "Two-Zone Privacy Firewall blocked userinfo credentials in target_url"
        )
    hostname = (parsed.hostname or "").lower()
    if hostname not in ALLOWED_LOOPBACK_HOSTS:
        raise PermissionError(
            f"Two-Zone Privacy Firewall blocked non-loopback hostname {hostname!r} in {target_url!r}"
        )
    return target_url


def query_open_tasks_readonly(
    db_user: str = "paul",
    db_name: str = "postgres",
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    id_list = ", ".join(str(i) for i in REQUIRED_TASK_IDS)
    sql = (
        "SELECT id, COALESCE(title, 'Task #' || id::text) AS title, "
        "COALESCE(status, 'pending') AS status, "
        "COALESCE(assigned_to, 'unassigned') AS assigned_to "
        f"FROM public.tasks WHERE id IN ({id_list}) ORDER BY id DESC;"
    )
    res = subprocess.run(
        ["psql", "-U", db_user, "-d", db_name, "-t", "-A", "-F", "|", "-c", sql],
        capture_output=True,
        text=True,
        timeout=4,
        check=False,
    )
    if res.returncode != 0:
        err_msg = (res.stderr or res.stdout or "psql failed").strip()
        raise RuntimeError(
            f"Live public.tasks query failed (rc={res.returncode}): {err_msg}"
        )

    rows: list[dict[str, Any]] = []
    for line in res.stdout.strip().splitlines():
        parts = line.split("|")
        if len(parts) >= 4 and parts[0].strip().isdigit():
            rows.append(
                {
                    "task_id": int(parts[0].strip()),
                    "title": parts[1].strip(),
                    "status": parts[2].strip(),
                    "assigned_to": parts[3].strip(),
                }
            )
    if not rows:
        raise RuntimeError("Live public.tasks query returned zero rows for required task IDs")

    found_ids = {r["task_id"] for r in rows}
    missing = sorted(set(REQUIRED_TASK_IDS).difference(found_ids))
    if missing:
        raise RuntimeError(
            f"Live public.tasks query missing required task IDs: {missing}"
        )

    provenance = {
        "source": "LIVE_POSTGRES_PUBLIC_TASKS",
        "live_db_verified": True,
        "db_name": db_name,
        "db_user": db_user,
        "queried_task_ids": list(REQUIRED_TASK_IDS),
        "returned_row_count": len(rows),
    }
    return rows, provenance


def load_and_index_graphiti_bundle(
    index_path: Path,
) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    if not index_path.exists():
        raise FileNotFoundError(f"Graphiti bundle not found: {index_path}")
    data = json.loads(index_path.read_text(encoding="utf-8"))
    entity_web = data.get("entity_web")
    if not isinstance(entity_web, dict):
        raise ValueError("Graphiti bundle missing entity_web object")
    nodes = entity_web.get("nodes")
    edges = entity_web.get("edges")
    if not isinstance(nodes, list) or not isinstance(edges, list) or len(nodes) == 0:
        raise ValueError("Graphiti bundle entity_web.nodes/edges missing or empty")

    counts = data.get("counts", {})
    lookup: dict[str, dict[str, Any]] = {}
    for node in nodes:
        nid = node.get("id")
        nuuid = node.get("uuid")
        if nid:
            lookup[str(nid)] = node
        if nuuid:
            lookup[str(nuuid)] = node

    summary = {
        "source_path": str(index_path),
        "schema": data.get("schema", "gev-graphiti-bundle-v1"),
        "entity_web_node_count": len(nodes),
        "entity_web_edge_count": len(edges),
        "total_graph_nodes": int(counts.get("total_nodes", len(nodes))),
        "total_graph_relationships": int(counts.get("relationships", len(edges))),
        "spatial_bound_entities": int(counts.get("spatial_bound_entities", 0)),
    }
    return summary, lookup


def resolve_graphiti_entities(
    entity_refs: list[str],
    lookup: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    if not entity_refs:
        raise ValueError("spatial node must reference at least one Graphiti entity")
    resolved: list[dict[str, Any]] = []
    for ref in entity_refs:
        if ref not in lookup:
            raise ValueError(
                f"Unresolved Graphiti entity binding {ref!r}: not found in entity_web.nodes"
            )
        raw = lookup[ref]
        resolved.append(
            {
                "id": raw["id"],
                "uuid": raw["uuid"],
                "name": raw.get("name", ""),
                "group_id": raw.get("group_id", ""),
                "spatial_ref": raw.get("spatial_ref"),
            }
        )
    return resolved


def build_spatial_command_nodes(
    tasks: list[dict[str, Any]],
    graphiti_lookup: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    tasks_by_id = {int(t["task_id"]): t for t in tasks}
    for req_id in (22045, 22054, 22035, 21128, 1157):
        if req_id not in tasks_by_id:
            raise ValueError(f"Required task_id {req_id} missing from tasks dataset")

    raw_nodes = [
        {
            "node_id": "node-gev-fusion-22045",
            "label": "4D Memory Palace & Neo4j Command Core (Card #22045)",
            "enu_xyz_m": [0.0, 2.5, 0.0],
            "privacy_zone": PRIVACY_PROPERTY_YARD,
            "frustum_ids": ["yard-overview", "back-yard-cam1"],
            "graphiti_entity_ids": [
                "lm-ent-15b7ff906c38dbc0ae47914baddca3b8",  # Holodeck (3D Gaussian Splat Yard & Holodeck Portal)
                "f7465fc3-8cb4-490b-adb4-238c0cc36b5b",      # PFL Neo4j
                "ddc76d6f-8b3d-43a9-ae54-6684084c05cb",      # Graphiti stack
            ],
            "linked_tasks": [tasks_by_id[22045], tasks_by_id[22035]],
            "supported_actions": [
                "inspect_graphiti_neighbors",
                "stage_shadow_task_update",
                "jump_to_frustum",
            ],
        },
        {
            "node_id": "node-west-wall-ecoflow",
            "label": "West Wall Utility — EcoFlow DELTA Pro Ultra & Miners Bank",
            "enu_xyz_m": [-15.0, 3.8, -2.5],
            "privacy_zone": PRIVACY_PROPERTY_YARD,
            "frustum_ids": ["yard-overview"],
            "graphiti_entity_ids": [
                "lm-ent-6b6f3fa801d29d4b2b742c23e09548d0",  # EcoFlow
                "lm-ent-ecacbf8e7633d550c49ec8fff9d6df1c",  # Antminer L7
                "lm-ent-51485d24d324fd7e2df14431f97fefc2",  # blue25
            ],
            "linked_tasks": [tasks_by_id[22045], tasks_by_id[1157]],
            "supported_actions": ["check_cutover_state", "stage_shadow_task_update"],
        },
        {
            "node_id": "node-waterfront-solar-fire",
            "label": "Waterfront Solar Array & East Pond Dock (back-yard-cam2)",
            "enu_xyz_m": [14.2, -1.8, -28.5],
            "privacy_zone": PRIVACY_PROPERTY_YARD,
            "frustum_ids": ["back-yard-cam2", "HL_PAN4"],
            "graphiti_entity_ids": [
                "lm-ent-2943a247106bb282e158a7c4991e01bb",  # VEVOR (East Pond & Inflatable Dock)
                "lm-ent-6ecfcfcdf67b519dddc6be576c81465f",  # Wyze (Calibrated Ground Quad)
            ],
            "linked_tasks": [tasks_by_id[22045]],
            "supported_actions": [
                "scrub_4d_incident_window",
                "stage_shadow_task_update",
            ],
        },
        {
            "node_id": "node-fleet-monaco-rv",
            "label": "Fleet Envelope — Monaco Beaver RV & 417 Palm Drive Station",
            "enu_xyz_m": [-8.4, 1.2, 12.0],
            "privacy_zone": PRIVACY_PROPERTY_YARD,
            "frustum_ids": ["yard-overview", "back-yard-cam1"],
            "graphiti_entity_ids": [
                "lm-ent-71da248c6049134707691aa231922056",  # Beaver (Monaco Beaver RV + Solar Arch)
                "lm-ent-5d8ee4b76b8eb84ca1b6c81022b0f19f",  # PaulPrime Home
            ],
            "linked_tasks": [tasks_by_id[22045]],
            "supported_actions": ["inspect_fleet_checklist", "stage_shadow_task_update"],
        },
        {
            "node_id": "node-swarm-command-atrium",
            "label": "Swarm Command & Troi Continuity Desk",
            "enu_xyz_m": [-4.2, 2.8, -3.1],
            "privacy_zone": PRIVACY_PROPERTY_YARD,
            "frustum_ids": ["yard-overview"],
            "graphiti_entity_ids": [
                "5a128851-8aef-4394-9a41-5cc0819a43af",  # PFL Atrium
                "2878006a-a3a8-4273-a4cd-f69c7f57914c",  # Lisa Holmes
                "7bd69bb0-864f-4635-809e-6dcf196a470e",  # Lisa Muse
                "eb063f87-7456-45e7-a4eb-d87789ec7c42",  # Codex (Luna)
                "965be257-3904-4d20-a0af-4e58ec6f487c",  # Antigravity
            ],
            "linked_tasks": [
                tasks_by_id[22054],
                tasks_by_id[22035],
                tasks_by_id[21128],
            ],
            "supported_actions": [
                "inspect_troi_shadow_read",
                "stage_shadow_task_update",
            ],
        },
        {
            "node_id": "node-local-bed-station",
            "label": "Master Bed Station (127.0.0.1:8093 DWPose + Shadow TREAT)",
            "enu_xyz_m": [-6.0, 1.5, -4.0],
            "privacy_zone": PRIVACY_LOCAL_ONLY,
            "loopback_endpoint": "http://127.0.0.1:8093/status.json",
            "frustum_ids": ["master-bed-cam-20261015"],
            "graphiti_entity_ids": [
                "lm-ent-b45058f5a6d1f9c1b5eace28a0595657",  # Camo
                "8fd3cd48-98de-4c64-824b-c1d853a59bc7",      # Paul Prime
            ],
            "linked_tasks": [tasks_by_id[22045]],
            "supported_actions": [
                "inspect_local_dwpose_telemetry",
                "stage_shadow_treat_eval",
            ],
        },
    ]

    for node in raw_nodes:
        node["resolved_graphiti_entities"] = resolve_graphiti_entities(
            node["graphiti_entity_ids"], graphiti_lookup
        )
    return raw_nodes


def build_task_action_payload(
    node: dict[str, Any],
    action_type: str,
    summary: str,
    actor: str = "@antigravity",
    target_url: str = "http://127.0.0.1:4173/memory-palace.html",
) -> dict[str, Any]:
    if not summary or not summary.strip():
        raise ValueError("action summary must be non-empty")
    if action_type not in node.get("supported_actions", []):
        raise ValueError(
            f"unsupported action_type {action_type} for node {node.get('node_id')}"
        )

    if node.get("privacy_zone") == PRIVACY_LOCAL_ONLY:
        validate_loopback_target_url(target_url)

    resolved_entities = node.get("resolved_graphiti_entities")
    if not isinstance(resolved_entities, list) or len(resolved_entities) == 0:
        raise ValueError(
            f"node {node.get('node_id')} has no resolved_graphiti_entities"
        )
    resolved_uuids = [ent["uuid"] for ent in resolved_entities]
    linked_task_ids = [int(t["task_id"]) for t in node.get("linked_tasks", [])]

    canonical = json.dumps(
        {
            "node_id": node["node_id"],
            "action_type": action_type,
            "summary": summary.strip(),
            "actor": actor,
            "target_url": target_url,
            "linked_task_ids": linked_task_ids,
            "resolved_graphiti_uuids": resolved_uuids,
        },
        sort_keys=True,
    )
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return {
        "schema_version": SCHEMA_VERSION,
        "execution_mode": "SHADOW_NO_DB_WRITE",
        "node_id": node["node_id"],
        "privacy_zone": node["privacy_zone"],
        "action_type": action_type,
        "actor": actor,
        "summary": summary.strip(),
        "target_url": target_url,
        "linked_task_ids": linked_task_ids,
        "resolved_graphiti_uuids": resolved_uuids,
        "payload_sha256": digest,
    }


def execute_shadow_click_roundtrip(
    manifest: dict[str, Any],
    node_id: str,
    action_type: str,
    summary: str,
    actor: str = "@antigravity",
    target_url: str = "http://127.0.0.1:4173/memory-palace.html",
    receipt_output_path: Path | None = None,
) -> dict[str, Any]:
    matching = [
        n for n in manifest.get("spatial_nodes", []) if n.get("node_id") == node_id
    ]
    if not matching:
        raise KeyError(f"Unknown spatial node_id: {node_id}")
    node = matching[0]
    payload = build_task_action_payload(
        node, action_type, summary, actor=actor, target_url=target_url
    )
    receipt = {
        "receipt_schema": "gev-click-to-task-shadow-receipt-v1",
        "card_ref": CARD_REF,
        "task_source": manifest.get("task_source", {}),
        "action_payload": payload,
        "linked_task_snapshot": node.get("linked_tasks", []),
    }
    if receipt_output_path is not None:
        receipt_output_path.parent.mkdir(parents=True, exist_ok=True)
        receipt_output_path.write_text(
            json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
    return receipt


def verify_shadow_click_receipt(receipt_path: Path) -> dict[str, Any]:
    data = json.loads(receipt_path.read_text(encoding="utf-8"))
    if data.get("receipt_schema") != "gev-click-to-task-shadow-receipt-v1":
        raise ValueError("Invalid receipt_schema")
    payload = data.get("action_payload", {})
    if payload.get("execution_mode") != "SHADOW_NO_DB_WRITE":
        raise ValueError("Receipt execution_mode must be SHADOW_NO_DB_WRITE")
    canonical = json.dumps(
        {
            "node_id": payload["node_id"],
            "action_type": payload["action_type"],
            "summary": payload["summary"],
            "actor": payload["actor"],
            "target_url": payload["target_url"],
            "linked_task_ids": payload["linked_task_ids"],
            "resolved_graphiti_uuids": payload["resolved_graphiti_uuids"],
        },
        sort_keys=True,
    )
    expected_sha = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    if payload.get("payload_sha256") != expected_sha:
        raise ValueError("Receipt payload_sha256 mismatch")
    return data


def build_manifest(
    index_path: Path = Path("/home/paul/gods-eye-view/public/gev-intel/index.json"),
    tasks_override: list[dict[str, Any]] | None = None,
    allow_fixture_fallback: bool = False,
) -> dict[str, Any]:
    if tasks_override is not None:
        if not allow_fixture_fallback:
            raise RuntimeError(
                "tasks_override requires allow_fixture_fallback=True; refusing silent fixture substitution"
            )
        tasks = tasks_override
        task_source = {
            "source": "OPT_IN_TEST_FIXTURE",
            "live_db_verified": False,
            "returned_row_count": len(tasks),
        }
    else:
        tasks, task_source = query_open_tasks_readonly()

    graph_summary, graph_lookup = load_and_index_graphiti_bundle(index_path)
    nodes = build_spatial_command_nodes(tasks, graph_lookup)
    sample_actions = [
        build_task_action_payload(
            nodes[0],
            "stage_shadow_task_update",
            "Verify Card #22045 Neo4j Click-to-Task drawer binding in 4D Memory Palace",
        ),
        build_task_action_payload(
            nodes[5],
            "inspect_local_dwpose_telemetry",
            "Verify 127.0.0.1:8093 DWPose full-precision capture stream on local loopback",
            target_url="http://127.0.0.1:8093/status.json",
        ),
    ]
    return {
        "schema_version": SCHEMA_VERSION,
        "card_ref": CARD_REF,
        "mode": MODE,
        "generated_at": datetime.now(tz=timezone.utc).isoformat().replace("+00:00", "Z"),
        "task_source": task_source,
        "graphiti_index": graph_summary,
        "runtime_consumers": [
            "/public/memory-palace.html#click-to-task-drawer",
            "/public/memory-palace.js#initClickToTaskAndSplatEnvelope",
        ],
        "node_count": len(nodes),
        "spatial_nodes": nodes,
        "sample_shadow_actions": sample_actions,
    }


def main() -> int:
    manifest = build_manifest()
    out_paths = [
        Path("/home/paul/gods-eye-view/public/gev-intel/click-to-task.json"),
        Path("/home/paul/gods-eye-view/dist/gev-intel/click-to-task.json"),
        Path("/home/paul/antigravity_workspace/gev_tracks/click-to-task.json"),
        Path("/home/paul/workspace/gev_tracks/click-to-task.json"),
    ]
    payload_text = json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    digest = hashlib.sha256(payload_text.encode("utf-8")).hexdigest()
    for path in out_paths:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(payload_text, encoding="utf-8")

    receipt_paths = [
        Path("/home/paul/gods-eye-view/public/gev-intel/click-to-task-shadow-receipt.json"),
        Path("/home/paul/gods-eye-view/dist/gev-intel/click-to-task-shadow-receipt.json"),
        Path("/home/paul/antigravity_workspace/gev_tracks/click-to-task-shadow-receipt.json"),
        Path("/home/paul/workspace/gev_tracks/click-to-task-shadow-receipt.json"),
    ]
    for rpath in receipt_paths:
        execute_shadow_click_roundtrip(
            manifest,
            node_id="node-gev-fusion-22045",
            action_type="stage_shadow_task_update",
            summary="Round-trip shadow click receipt for Card #22045",
            receipt_output_path=rpath,
        )
        verify_shadow_click_receipt(rpath)

    print(
        f"Wrote click-to-task.json (nodes={manifest['node_count']}, "
        f"graph_nodes={manifest['graphiti_index']['entity_web_node_count']}, "
        f"graph_edges={manifest['graphiti_index']['entity_web_edge_count']}, "
        f"live_db={manifest['task_source']['live_db_verified']}, "
        f"sha256={digest})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
