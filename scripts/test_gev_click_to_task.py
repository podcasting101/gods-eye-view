#!/usr/bin/env python3
"""8-test regression & verification suite for Track 5 (Card #22045): Bidirectional Graphiti / Neo4j Click-to-Task Action Loop."""

import copy
import inspect
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import build_gev_click_to_task as c2t


FIXED_TASKS = [
    {
        "task_id": 22054,
        "title": "SIGN-OFF: DIAGNOSE: deep-sleep dreaming promotion ranks zero candidates on all seats",
        "status": "pending",
        "assigned_to": "@lisa-muse",
    },
    {
        "task_id": 22045,
        "title": "GEV + Neo4j Fusion Design Brief for elitespyworlds.com (Trello yOhampgQ)",
        "status": "completed",
        "assigned_to": "@antigravity",
    },
    {
        "task_id": 22035,
        "title": "PFL conductor loop: coordinate one verified God’s Eye card per heartbeat",
        "status": "pending",
        "assigned_to": "@codex",
    },
    {
        "task_id": 21128,
        "title": "DIAGNOSE: deep-sleep dreaming promotion ranks zero candidates on all seats",
        "status": "pending_review",
        "assigned_to": "@friday",
    },
    {
        "task_id": 1157,
        "title": "Prime Order: [20260509_052639 segment 200] Quit asking me for the fucking password and doing a shell.",
        "status": "completed",
        "assigned_to": "@lisa",
    },
]


class TestGevClickToTask(unittest.TestCase):
    def test_01_spatial_nodes_schema_and_enu_bounds(self):
        manifest = c2t.build_manifest(
            tasks_override=FIXED_TASKS, allow_fixture_fallback=True
        )
        self.assertEqual(manifest["schema_version"], "gev-click-to-task-v1")
        self.assertEqual(manifest["card_ref"], 22045)
        self.assertEqual(manifest["node_count"], 6)
        self.assertEqual(manifest["task_source"]["source"], "OPT_IN_TEST_FIXTURE")
        self.assertFalse(manifest["task_source"]["live_db_verified"])
        for node in manifest["spatial_nodes"]:
            xyz = node["enu_xyz_m"]
            self.assertEqual(len(xyz), 3)
            for coord in xyz:
                self.assertTrue(-100.0 <= float(coord) <= 100.0)
            self.assertTrue(len(node["resolved_graphiti_entities"]) >= 1)
            self.assertTrue(len(node["linked_tasks"]) >= 1)

    def test_02_read_only_shadow_mode_enforcement(self):
        source = inspect.getsource(c2t)
        for forbidden in ("INSERT INTO", "UPDATE public.", "DELETE FROM", "DROP TABLE"):
            self.assertNotIn(forbidden, source)
        manifest = c2t.build_manifest(
            tasks_override=FIXED_TASKS, allow_fixture_fallback=True
        )
        self.assertEqual(manifest["mode"], "SHADOW_READ_ONLY")

    def test_03_privacy_firewall_blocks_hostname_suffix_prefix_and_ip_confusion(self):
        manifest = c2t.build_manifest(
            tasks_override=FIXED_TASKS, allow_fixture_fallback=True
        )
        bed_node = [
            n
            for n in manifest["spatial_nodes"]
            if n["node_id"] == "node-local-bed-station"
        ][0]
        self.assertEqual(bed_node["privacy_zone"], c2t.PRIVACY_LOCAL_ONLY)

        adversarial_urls = [
            "https://example.com/leak",
            "http://127.0.0.1.evil.example/leak",
            "http://localhost.evil.example/leak",
            "http://127.0.0.10/leak",
            "http://127.0.0.1@evil.example/leak",
            "http://localhost@evil.example/leak",
            "ftp://127.0.0.1/status.json",
            "http://0.0.0.0:8093/status.json",
        ]
        for bad_url in adversarial_urls:
            with self.subTest(bad_url=bad_url):
                with self.assertRaisesRegex(
                    PermissionError, "Two-Zone Privacy Firewall blocked"
                ):
                    c2t.build_task_action_payload(
                        bed_node,
                        "inspect_local_dwpose_telemetry",
                        "Adversarial URL test",
                        target_url=bad_url,
                    )

        for valid_url in (
            "http://127.0.0.1:8093/status.json",
            "http://localhost:8093/status.json",
            "http://[::1]:8093/status.json",
        ):
            valid_payload = c2t.build_task_action_payload(
                bed_node,
                "inspect_local_dwpose_telemetry",
                "Local loopback check",
                target_url=valid_url,
            )
            self.assertEqual(valid_payload["execution_mode"], "SHADOW_NO_DB_WRITE")

    def test_04_graphiti_entity_web_resolution_and_unresolved_rejection(self):
        summary, lookup = c2t.load_and_index_graphiti_bundle(
            Path("/home/paul/gods-eye-view/public/gev-intel/index.json")
        )
        self.assertEqual(summary["entity_web_node_count"], 149)
        self.assertEqual(summary["entity_web_edge_count"], 97)
        self.assertEqual(summary["total_graph_nodes"], 374)
        self.assertEqual(summary["total_graph_relationships"], 2590)

        with self.assertRaisesRegex(ValueError, "Unresolved Graphiti entity binding"):
            c2t.resolve_graphiti_entities(["entity:nonexistent-alias"], lookup)

    def test_05_live_postgres_task_query_and_fail_closed_provenance(self):
        # 1. Refuses silent fixture fallback when allow_fixture_fallback=False
        with self.assertRaisesRegex(
            RuntimeError, "refusing silent fixture substitution"
        ):
            c2t.build_manifest(tasks_override=FIXED_TASKS, allow_fixture_fallback=False)

        # 2. Fails closed when psql returns non-zero
        with mock.patch("subprocess.run") as run_mock:
            run_mock.return_value = mock.Mock(
                returncode=2, stdout="", stderr="FATAL: auth failed"
            )
            with self.assertRaisesRegex(RuntimeError, "Live public.tasks query failed"):
                c2t.query_open_tasks_readonly(db_user="nonexistent_user")

        # 3. Live query against configured local Postgres succeeds and matches real statuses
        live_manifest = c2t.build_manifest()
        self.assertTrue(live_manifest["task_source"]["live_db_verified"])
        self.assertEqual(
            live_manifest["task_source"]["source"], "LIVE_POSTGRES_PUBLIC_TASKS"
        )
        node_22045 = [
            n
            for n in live_manifest["spatial_nodes"]
            if n["node_id"] == "node-gev-fusion-22045"
        ][0]
        tasks_map = {t["task_id"]: t["status"] for t in node_22045["linked_tasks"]}
        self.assertEqual(tasks_map[22045], "completed")
        self.assertEqual(tasks_map[22035], "pending")

    def test_06_shadow_click_receipt_roundtrip_and_tamper_detection(self):
        manifest = c2t.build_manifest(
            tasks_override=FIXED_TASKS, allow_fixture_fallback=True
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            rpath = Path(tmpdir) / "shadow-receipt.json"
            receipt = c2t.execute_shadow_click_roundtrip(
                manifest,
                node_id="node-gev-fusion-22045",
                action_type="stage_shadow_task_update",
                summary="Round-trip test for Card #22045",
                receipt_output_path=rpath,
            )
            verified = c2t.verify_shadow_click_receipt(rpath)
            self.assertEqual(
                verified["action_payload"]["payload_sha256"],
                receipt["action_payload"]["payload_sha256"],
            )
            self.assertIn(22045, verified["action_payload"]["linked_task_ids"])

            # Tamper with summary and verify tamper detection fails closed
            tampered = copy.deepcopy(verified)
            tampered["action_payload"]["summary"] = "tampered summary"
            rpath.write_text(c2t.json.dumps(tampered), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "payload_sha256 mismatch"):
                c2t.verify_shadow_click_receipt(rpath)

    def test_07_runtime_ui_consumer_wired_in_memory_palace(self):
        html = Path("/home/paul/gods-eye-view/public/memory-palace.html").read_text(
            encoding="utf-8"
        )
        js = Path("/home/paul/gods-eye-view/public/memory-palace.js").read_text(
            encoding="utf-8"
        )
        self.assertIn('id="click-to-task-drawer"', html)
        self.assertIn('id="click-to-task-node-list"', html)
        self.assertIn('id="click-to-task-receipt-box"', html)
        self.assertIn("/gev-intel/click-to-task.json", js)
        self.assertIn("stageShadowClickToTaskReceipt", js)
        self.assertIn("isAllowedLoopbackUrl", js)

    def test_08_deterministic_action_payload_generation(self):
        m1 = c2t.build_manifest(
            tasks_override=FIXED_TASKS, allow_fixture_fallback=True
        )
        m2 = c2t.build_manifest(
            tasks_override=FIXED_TASKS, allow_fixture_fallback=True
        )
        m1_norm = copy.deepcopy(m1)
        m2_norm = copy.deepcopy(m2)
        m1_norm.pop("generated_at", None)
        m2_norm.pop("generated_at", None)
        self.assertEqual(m1_norm, m2_norm)


if __name__ == "__main__":
    unittest.main()
