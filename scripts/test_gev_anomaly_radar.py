#!/usr/bin/env python3
"""Unit tests for build_gev_anomaly_radar.py (Track 4 Anomaly Radar)."""
import unittest
import numpy as np

import build_gev_anomaly_radar as radar


class GevAnomalyRadarTests(unittest.TestCase):
    def test_interior_privacy_firewall_blocks_private_cameras(self):
        for bad_cam in ("bed", "camo", "living-room-cam", "D03F27DFB2CF", "2CAA8E1040BB"):
            with self.assertRaisesRegex(PermissionError, "PRIVACY_BLOCKED_INTERIOR_CAMERA"):
                radar.assert_exterior_camera_allowed(bad_cam, "frame.jpg")
        with self.assertRaisesRegex(PermissionError, "PRIVACY_BLOCKED_INTERIOR_CAMERA"):
            radar.assert_exterior_camera_allowed("back-yard-cam2", "/yard-frames/bed-station-2026-10-12.png")

    def test_identical_frames_yield_zero_anomaly(self):
        img = np.full((180, 320, 3), 120, dtype=np.uint8)
        res = radar.compute_frame_pair_anomaly(img, img)
        self.assertEqual(res["luma_mae"], 0.0)
        self.assertEqual(res["changed_fraction"], 0.0)
        self.assertEqual(res["delta_score"], 0.0)

    def test_synthetic_patch_localizes_bbox_and_projects_enu(self):
        before = np.full((180, 320, 3), 100, dtype=np.uint8)
        after = before.copy()
        after[90:130, 140:200] = [240, 80, 20]  # bright thermal patch inside ROI
        res = radar.compute_frame_pair_anomaly(before, after)
        self.assertGreater(res["changed_fraction"], 0.03)
        self.assertGreater(res["delta_score"], 0.15)
        u0, v0, u1, v1 = res["frustum_bbox_uv"]
        self.assertTrue(0.40 <= u0 <= 0.48)
        self.assertTrue(0.58 <= u1 <= 0.65)
        enu = radar.project_uv_to_ground_enu("back-yard-cam2", *res["ground_pin_uv"])
        self.assertEqual(len(enu), 3)
        self.assertEqual(enu[1], 0.0)


if __name__ == "__main__":
    unittest.main()
