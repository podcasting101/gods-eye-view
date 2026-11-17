#!/usr/bin/env python3
"""Unit tests for Track 2: 3D Gaussian Splatting (.splat / .ksplat) Envelope Registration."""

import copy
import unittest

import build_gev_splat_envelope as splat


class TestGevSplatEnvelope(unittest.TestCase):
    def test_01_enu_origin_and_ground_datum_calibration(self):
        manifest = splat.build_manifest()
        cal = manifest["enu_calibration"]
        self.assertEqual(cal["origin_lat"], 29.24745)
        self.assertEqual(cal["origin_lon"], -95.23148)
        self.assertEqual(cal["stored_ground_height_m"], -26.19)
        self.assertEqual(cal["survey_landmark_count"], 28)
        self.assertEqual(manifest["volume_count"], 3)

    def test_02_render_governor_zero_idle_gpu_contract(self):
        manifest = splat.build_manifest()
        gov = manifest["render_governor_contract"]
        self.assertTrue(gov["request_render_mode"])
        self.assertEqual(gov["idle_gpu_target_pct"], 0)
        self.assertLessEqual(
            gov["registered_splat_budget"], gov["total_splat_budget_cap"]
        )

    def test_03_two_zone_privacy_firewall_on_splat_volumes(self):
        bad_volumes = [
            {
                "splat_id": "splat-forbidden-bed",
                "privacy_zone": "ZONE1_PROPERTY_YARD",
                "source_cameras": ["bed", "camo"],
                "enu_rotation_quat_xyzw": [0.0, 0.0, 0.0, 1.0],
            }
        ]
        with self.assertRaisesRegex(PermissionError, "Two-Zone Privacy Firewall blocked"):
            splat.validate_splat_volumes(bad_volumes)

    def test_04_deterministic_manifest_reproducibility(self):
        m1 = splat.build_manifest()
        m2 = splat.build_manifest()
        m1_norm = copy.deepcopy(m1)
        m2_norm = copy.deepcopy(m2)
        m1_norm.pop("generated_at", None)
        m2_norm.pop("generated_at", None)
        self.assertEqual(m1_norm, m2_norm)


if __name__ == "__main__":
    unittest.main()
