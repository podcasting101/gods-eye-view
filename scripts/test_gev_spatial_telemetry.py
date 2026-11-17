#!/usr/bin/env python3
"""Unit tests for God's Eye View Track 3 Spatial Telemetry Overlay."""

import unittest
from build_gev_spatial_telemetry import (
    build_spatial_telemetry_payload,
    validate_no_forbidden_streams,
)


class TestGevSpatialTelemetry(unittest.TestCase):
    def test_privacy_firewall_rejects_interior_streams(self) -> None:
        with self.assertRaises(ValueError):
            validate_no_forbidden_streams(["yard-overview", "bed"])
        with self.assertRaises(ValueError):
            validate_no_forbidden_streams(["camo"])
        with self.assertRaises(ValueError):
            validate_no_forbidden_streams(["living-room-cam"])
        validate_no_forbidden_streams(["yard-overview", "back-yard-cam1", "back-yard-cam2", "pan4-cam"])

    def test_payload_schema_and_enu_anchors(self) -> None:
        payload = build_spatial_telemetry_payload(
            gpu_info={
                "gpu_name": "RTX Test",
                "power_draw_w": 32.5,
                "power_limit_w": 350.0,
                "temp_c": 46.0,
                "utilization_pct": 0.0,
                "vram_used_mb": 1200.0,
                "vram_total_mb": 24576.0,
                "source": "unit-test",
            },
            quota_info={
                "authority": "RetrieveUserQuotaSummary",
                "gemini_weekly_rem_pct": 56.67,
                "gemini_weekly_used_pct": 43.33,
                "gemini_weekly_reset": "2026-10-31T10:25:45-05:00",
                "gemini_5h_rem_pct": 81.01,
                "claude_weekly_rem_pct": 100.0,
            },
            task_counts={"in_progress": 4, "pending": 7, "completed": 42, "escalated": 1},
        )
        self.assertEqual(payload["schema"], "gev-spatial-telemetry-v1")
        self.assertEqual(payload["anchor_count"], 4)
        self.assertEqual(len(payload["anchors"]), 4)
        for anchor in payload["anchors"]:
            xyz = anchor["enu_xyz"]
            self.assertEqual(len(xyz), 3)
            self.assertTrue(-40.0 <= xyz[0] <= 40.0)
            self.assertTrue(0.0 <= xyz[1] <= 20.0)
            self.assertTrue(-40.0 <= xyz[2] <= 40.0)
            self.assertTrue(len(anchor["task_receipt_links"]) >= 1)
            for link in anchor["task_receipt_links"]:
                self.assertIn("card_id", link)
                self.assertIn("evidence_sha256", link)
                self.assertIn("buzz_event_id", link)

    def test_quota_and_gpu_binding(self) -> None:
        payload = build_spatial_telemetry_payload(
            gpu_info={
                "gpu_name": "RTX Test",
                "power_draw_w": 40.0,
                "power_limit_w": 350.0,
                "temp_c": 50.0,
                "utilization_pct": 2.0,
                "vram_used_mb": 1500.0,
                "vram_total_mb": 24576.0,
                "source": "unit-test",
            },
            quota_info={
                "authority": "RetrieveUserQuotaSummary",
                "gemini_weekly_rem_pct": 56.67,
                "gemini_weekly_used_pct": 43.33,
                "gemini_weekly_reset": "2026-10-31T10:25:45-05:00",
                "gemini_5h_rem_pct": 81.01,
                "claude_weekly_rem_pct": 100.0,
            },
            task_counts={"in_progress": 2, "pending": 3, "completed": 10, "escalated": 0},
        )
        by_id = {a["anchor_id"]: a for a in payload["anchors"]}
        cmd = by_id["telemetry-command-station-swarm"]
        self.assertAlmostEqual(cmd["metrics"]["gemini_weekly_rem_pct"], 56.67, places=2)
        self.assertIn("56.7% Wk", cmd["status_badge"])
        west = by_id["telemetry-west-wall-power-miners"]
        self.assertEqual(west["metrics"]["render_governor_mode"], "ON_DEMAND_0PCT_IDLE")


if __name__ == "__main__":
    unittest.main()
