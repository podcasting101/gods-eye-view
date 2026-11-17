#!/usr/bin/env python3
"""Unit tests for God's Eye View Track 1 Live RTSP + 4D Scrubber Fusion."""

import unittest
from build_gev_rtsp_scrubber_fusion import (
    build_rtsp_scrubber_manifest,
    compute_scrubber_blend,
    validate_exterior_stream_id,
)


class TestGevRtspScrubberFusion(unittest.TestCase):
    def test_privacy_firewall_blocks_interior_cameras(self) -> None:
        for forbidden in ["bed", "camo", "living-room-cam", "master-bed-cam-20261015", "D03F27DFB2CF", "2CAA8E1040BB"]:
            with self.assertRaises(ValueError):
                validate_exterior_stream_id(forbidden)
            with self.assertRaises(ValueError):
                compute_scrubber_blend(forbidden, 100.0)

    def test_live_edge_at_t100(self) -> None:
        blend = compute_scrubber_blend("back-yard-cam2", 100.0)
        self.assertEqual(blend["state"], "LIVE_EDGE")
        self.assertEqual(blend["governor_policy"], "DIRTY_FRAME_ONLY_0PCT_IDLE")
        self.assertEqual(blend["next_keyframe"]["timestamp_iso"], "LIVE_EDGE")

    def test_historical_scrub_resolves_fire_keyframes(self) -> None:
        blend_ign = compute_scrubber_blend("back-yard-cam2", 76.0)
        self.assertEqual(blend_ign["state"], "HISTORICAL_SCRUB")
        self.assertEqual(
            blend_ign["prev_keyframe"].get("anomaly_pin_id"),
            "anom-20261025-121408-back-yard-cam2-ignition",
        )
        blend_post = compute_scrubber_blend("back-yard-cam2", 86.0)
        self.assertEqual(
            blend_post["prev_keyframe"].get("anomaly_pin_id"),
            "anom-20261025-121759-back-yard-cam2-postfire",
        )

    def test_manifest_schema_and_stream_count(self) -> None:
        manifest = build_rtsp_scrubber_manifest()
        self.assertEqual(manifest["schema"], "gev-rtsp-scrubber-fusion-v1")
        self.assertEqual(manifest["stream_count"], 4)
        ids = [s["camera_id"] for s in manifest["streams"]]
        self.assertEqual(ids, ["yard-overview", "back-yard-cam1", "back-yard-cam2", "pan4-cam"])


if __name__ == "__main__":
    unittest.main()
