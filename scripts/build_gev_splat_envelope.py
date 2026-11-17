#!/usr/bin/env python3
"""Track 2: 3D Gaussian Splatting (.splat / .ksplat) Envelope Registration (gev-splat-envelope-v1).

Registers volumetric 3D Gaussian Splatting assets inside the calibrated 417 Palm Drive
ENU coordinate frame (ORIGIN_LAT=29.24745, ORIGIN_LON=-95.23148, STORED_GROUND_HEIGHT_M=-26.19)
while enforcing the 0% Idle GPU Render Governor (`renderGovernor.js`) and the Two-Zone
Camera Privacy Firewall.
"""

from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA_VERSION = "gev-splat-envelope-v1"
ORIGIN_LAT = 29.24745
ORIGIN_LON = -95.23148
STORED_GROUND_HEIGHT_M = -26.19
SURVEY_LANDMARK_COUNT = 28
FORBIDDEN_ZONE2_IDS = {"bed", "D03F27DFB2CF", "camo", "living-room-cam", "2CAA8E1040BB"}


def normalize_quaternion(q: list[float]) -> list[float]:
    norm = math.sqrt(sum(c * c for c in q))
    if norm <= 0:
        raise ValueError("quaternion norm must be positive")
    return [round(c / norm, 6) for c in q]


def build_splat_volumes() -> list[dict[str, Any]]:
    return [
        {
            "splat_id": "splat-waterfront-boathouse-oct26",
            "label": "Waterfront & Boathouse Multi-View Splat (back-yard-cam2 + HL_PAN4)",
            "format": "splat",
            "asset_uri": "/gev-intel/splats/waterfront-boathouse-oct26.splat",
            "source_cameras": ["back-yard-cam2", "HL_PAN4"],
            "privacy_zone": "ZONE1_PROPERTY_YARD",
            "enu_position_m": [14.2, -1.8, -28.5],
            "enu_rotation_quat_xyzw": normalize_quaternion([0.0, 0.0, 0.0, 1.0]),
            "enu_scale": [1.0, 1.0, 1.0],
            "bounding_box_m": {"min": [-5.0, -3.5, -42.0], "max": [28.0, 8.0, -10.0]},
            "max_splat_count": 250000,
            "lod_near_m": 5.0,
            "lod_far_m": 85.0,
            "tps_ground_pin_count": 12,
        },
        {
            "splat_id": "splat-palm-drive-fleet-envelope",
            "label": "417 Palm Drive Yard & Monaco Beaver RV Volumetric Envelope",
            "format": "ksplat",
            "asset_uri": "/gev-intel/splats/palm-drive-yard-envelope.ksplat",
            "source_cameras": ["yard-overview", "back-yard-cam1"],
            "privacy_zone": "ZONE1_PROPERTY_YARD",
            "enu_position_m": [-8.4, 0.0, 12.0],
            "enu_rotation_quat_xyzw": normalize_quaternion([0.0, 0.0, 0.0, 1.0]),
            "enu_scale": [1.0, 1.0, 1.0],
            "bounding_box_m": {"min": [-25.0, -2.0, -15.0], "max": [20.0, 12.0, 35.0]},
            "max_splat_count": 400000,
            "lod_near_m": 4.0,
            "lod_far_m": 110.0,
            "tps_ground_pin_count": 16,
        },
        {
            "splat_id": "splat-west-wall-utility-bank",
            "label": "West Wall Utility / EcoFlow & Miners Volumetric Anchor",
            "format": "splat",
            "asset_uri": "/gev-intel/splats/west-wall-utility.splat",
            "source_cameras": ["yard-overview"],
            "privacy_zone": "ZONE1_PROPERTY_YARD",
            "enu_position_m": [-15.0, 3.8, -2.5],
            "enu_rotation_quat_xyzw": normalize_quaternion([0.0, 0.0, 0.0, 1.0]),
            "enu_scale": [1.0, 1.0, 1.0],
            "bounding_box_m": {"min": [-19.0, 0.0, -6.0], "max": [-11.0, 6.5, 2.0]},
            "max_splat_count": 120000,
            "lod_near_m": 2.0,
            "lod_far_m": 50.0,
            "tps_ground_pin_count": 8,
        },
    ]


def validate_splat_volumes(volumes: list[dict[str, Any]]) -> None:
    for vol in volumes:
        if vol.get("privacy_zone") != "ZONE1_PROPERTY_YARD":
            raise PermissionError(
                f"Splat volume {vol.get('splat_id')} violated Zone 1 property boundary"
            )
        cams = set(vol.get("source_cameras", []))
        overlap = cams.intersection(FORBIDDEN_ZONE2_IDS)
        if overlap:
            raise PermissionError(
                f"Two-Zone Privacy Firewall blocked Zone 2 camera(s) {sorted(overlap)} in splat volume"
            )
        q = vol.get("enu_rotation_quat_xyzw", [])
        if len(q) != 4 or abs(math.sqrt(sum(c * c for c in q)) - 1.0) > 1e-4:
            raise ValueError(f"Invalid unit quaternion on {vol.get('splat_id')}")


def build_manifest() -> dict[str, Any]:
    volumes = build_splat_volumes()
    validate_splat_volumes(volumes)
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(tz=timezone.utc).isoformat().replace("+00:00", "Z"),
        "enu_calibration": {
            "origin_lat": ORIGIN_LAT,
            "origin_lon": ORIGIN_LON,
            "stored_ground_height_m": STORED_GROUND_HEIGHT_M,
            "survey_landmark_count": SURVEY_LANDMARK_COUNT,
            "vertical_parallax_mitigation": "TPS_GROUND_BASE_PINNING_PLUS_3D_SPLAT_ENVELOPE",
        },
        "render_governor_contract": {
            "governor_module": "/src/renderGovernor.js",
            "request_render_mode": True,
            "maximum_render_time_change": "Infinity",
            "idle_gpu_target_pct": 0,
            "active_camera_move_fps_cap": 30,
            "splat_frustum_culling": True,
            "total_splat_budget_cap": 1000000,
            "registered_splat_budget": sum(v["max_splat_count"] for v in volumes),
        },
        "volume_count": len(volumes),
        "splat_volumes": volumes,
    }


def main() -> int:
    manifest = build_manifest()
    out_paths = [
        Path("/home/paul/gods-eye-view/public/gev-intel/splat-envelope.json"),
        Path("/home/paul/gods-eye-view/dist/gev-intel/splat-envelope.json"),
        Path("/home/paul/antigravity_workspace/gev_tracks/splat-envelope.json"),
    ]
    payload_text = json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    digest = hashlib.sha256(payload_text.encode("utf-8")).hexdigest()
    for path in out_paths:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(payload_text, encoding="utf-8")
    print(f"Wrote splat-envelope.json (volumes={manifest['volume_count']}, sha256={digest})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
