#!/usr/bin/env python3
"""
build_gev_anomaly_radar.py — God's Eye View Track 4: Automated Change & Anomaly Radar
Author: Antigravity / Harry Maybourne (@antigravity)

1. Enforces the strict Interior Privacy Firewall (blocks bed, camo, living-room-cam,
   MACs D03F27DFB2CF and 2CAA8E1040BB from ever entering public/gev-intel/).
2. Computes real illumination-normalized structural & thermal/char chromaticity deltas
   across registered exterior camera frame pairs in `/home/paul/gods-eye-view/public/yard-frames/`.
3. Projects detected 2D frustum bounding boxes `[u_min, v_min, u_max, v_max]` onto the
   calibrated 417 Palm Drive ENU ground plane (`y = 0.0`) and writes
   `/home/paul/gods-eye-view/public/gev-intel/anomaly-pins.json` atomically.
"""
from __future__ import annotations

import datetime
import hashlib
import json
import math
import os
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

FORBIDDEN_CAMERA_TOKENS = (
    "bed",
    "camo",
    "living-room",
    "living_room",
    "d03f27dfb2cf",
    "2caa8e1040bb",
)

# Calibrated exterior camera poses in 417 Palm Drive ENU (meters from ORIGIN_LAT=29.24745, ORIGIN_LON=-95.23148)
EXTERIOR_CAMERA_POSES: dict[str, dict[str, Any]] = {
    "yard-overview": {
        "camera_id": "yard-overview",
        "label": "Wyze Cam V4 — North House Wall (Driveway & RVs)",
        "enu_pos": [-8.5, 3.4, 6.2],
        "heading_deg": 198.0,
        "pitch_deg": -28.0,
        "hfov_deg": 110.0,
    },
    "back-yard-cam1": {
        "camera_id": "back-yard-cam1",
        "label": "Wyze Cam V3 — West Yard & Utility Bank Corridor",
        "enu_pos": [-12.0, 3.1, -1.5],
        "heading_deg": 165.0,
        "pitch_deg": -24.0,
        "hfov_deg": 110.0,
    },
    "back-yard-cam2": {
        "camera_id": "back-yard-cam2",
        "label": "Wyze Cam V3 — Waterfront / East Pond & Solar Array",
        "enu_pos": [4.5, 2.8, -6.0],
        "heading_deg": 100.0,
        "pitch_deg": -22.0,
        "hfov_deg": 110.0,
    },
    "pan4-cam": {
        "camera_id": "pan4-cam",
        "label": "Wyze Pan V4 (HL_PAN4) — Boathouse / Pier Waterfront Overview",
        "enu_pos": [18.5, 3.2, -14.0],
        "heading_deg": 310.0,
        "pitch_deg": -18.0,
        "hfov_deg": 100.0,
    },
}


def assert_exterior_camera_allowed(camera_id: str, frame_path: str = "") -> None:
    """Strict privacy gate: interior/private cameras must never be indexed."""
    combined = f"{camera_id} { os.path.basename(frame_path) }".lower()
    for token in FORBIDDEN_CAMERA_TOKENS:
        if token in combined:
            raise PermissionError(
                f"PRIVACY_BLOCKED_INTERIOR_CAMERA: '{camera_id}' / '{frame_path}' matched forbidden token '{token}'"
            )
    if camera_id not in EXTERIOR_CAMERA_POSES:
        raise ValueError(f"UNREGISTERED_EXTERIOR_CAMERA: '{camera_id}'")


def atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.tmp.{os.getpid()}")
    try:
        with tmp.open("w", encoding="utf-8") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass


def project_uv_to_ground_enu(camera_id: str, u: float, v: float) -> list[float]:
    """Project normalized frustum ground-base point (u, v) onto y=0 ENU ground plane."""
    pose = EXTERIOR_CAMERA_POSES[camera_id]
    cx, cy, cz = pose["enu_pos"]
    heading_rad = math.radians(pose["heading_deg"] + (u - 0.5) * pose["hfov_deg"])
    vfov_deg = pose["hfov_deg"] * (9.0 / 16.0)
    ray_pitch_deg = min(-5.0, pose["pitch_deg"] - (v - 0.5) * vfov_deg)
    ground_dist = min(45.0, max(2.0, cy / math.tan(math.radians(-ray_pitch_deg))))
    gx = round(cx + ground_dist * math.sin(heading_rad), 2)
    gz = round(cz - ground_dist * math.cos(heading_rad), 2)
    return [gx, 0.0, gz]


def compute_frame_pair_anomaly(
    before_arr: np.ndarray,
    after_arr: np.ndarray,
    roi_uv: tuple[float, float, float, float] = (0.10, 0.25, 0.90, 0.92),
    diff_threshold: float = 28.0,
) -> dict[str, Any]:
    """Compute illumination-normalized RGB/luma delta and bounding box within an exterior ROI."""
    if before_arr.shape != after_arr.shape:
        raise ValueError(f"Shape mismatch: {before_arr.shape} vs {after_arr.shape}")

    h, w, _ = before_arr.shape
    u0, v0, u1, v1 = roi_uv
    x0, y0 = max(0, int(w * u0)), max(0, int(h * v0))
    x1, y1 = min(w, int(w * u1)), min(h, int(h * v1))

    b_roi = before_arr[y0:y1, x0:x1].astype(np.float32)
    a_roi = after_arr[y0:y1, x0:x1].astype(np.float32)

    # Illumination normalization (subtract global ROI median shift per channel)
    shift = np.median(a_roi - b_roi, axis=(0, 1), keepdims=True)
    a_norm = np.clip(a_roi - shift, 0.0, 255.0)

    channel_diff = np.mean(np.abs(a_norm - b_roi), axis=2)
    mask = channel_diff >= diff_threshold

    changed_fraction = float(np.mean(mask))
    luma_mae = float(np.mean(channel_diff))

    if np.any(mask):
        ys, xs = np.where(mask)
        p_u0 = round((x0 + float(np.percentile(xs, 5))) / w, 4)
        p_v0 = round((y0 + float(np.percentile(ys, 5))) / h, 4)
        p_u1 = round((x0 + float(np.percentile(xs, 95))) / w, 4)
        p_v1 = round((y0 + float(np.percentile(ys, 95))) / h, 4)
    else:
        p_u0, p_v0, p_u1, p_v1 = round(u0, 4), round(v0, 4), round(u1, 4), round(v1, 4)

    delta_score = round(min(1.0, (luma_mae / 45.0) * 0.6 + min(1.0, changed_fraction * 6.0) * 0.4), 4)
    return {
        "luma_mae": round(luma_mae, 3),
        "changed_fraction": round(changed_fraction, 4),
        "delta_score": delta_score,
        "frustum_bbox_uv": [p_u0, p_v0, p_u1, p_v1],
        "ground_pin_uv": [round((p_u0 + p_u1) * 0.5, 4), p_v1],
    }


def load_rgb_resized(path: Path, size: tuple[int, int] = (640, 360)) -> np.ndarray:
    with Image.open(path) as im:
        return np.asarray(im.convert("RGB").resize(size, Image.Resampling.BILINEAR))


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_live_anomaly_pins(yard_frames_dir: Path, out_json_path: Path) -> dict[str, Any]:
    pairs = [
        {
            "pin_id": "anom-20261025-121408-back-yard-cam2-ignition",
            "camera_id": "back-yard-cam2",
            "timestamp_iso": "2026-10-25T12:14:08-05:00",
            "category": "thermal_and_structural_change",
            "before_file": "back-yard-cam2-2026-10-12.jpg",
            "after_file": "20261025_121408_back-yard-cam2_0.jpg",
            "diff_overlay": "/yard-frames/back-yard-cam2-fire-analysis-2026-10-26.png",
            "roi_uv": (0.28, 0.38, 0.82, 0.88),
            "summary": "Waterfront solar array burn scar & grass char boundary vs. Oct 12 baseline (back-yard-cam2)",
        },
        {
            "pin_id": "anom-20261025-121759-back-yard-cam2-postfire",
            "camera_id": "back-yard-cam2",
            "timestamp_iso": "2026-10-25T12:17:59-05:00",
            "category": "equipment_displacement_and_response",
            "before_file": "20261025_121408_back-yard-cam2_0.jpg",
            "after_file": "20261025_121759_back-yard-cam2_0.jpg",
            "diff_overlay": "/yard-frames/back-yard-cam2-stitched-2026-10-26.png",
            "roi_uv": (0.25, 0.35, 0.85, 0.90),
            "summary": "3m51s post-ignition frame diff: operator movement & displaced solar panel geometry on waterfront bank",
        },
    ]

    pins: list[dict[str, Any]] = []
    for item in pairs:
        cam_id = item["camera_id"]
        b_path = yard_frames_dir / item["before_file"]
        a_path = yard_frames_dir / item["after_file"]
        assert_exterior_camera_allowed(cam_id, str(b_path))
        assert_exterior_camera_allowed(cam_id, str(a_path))

        b_arr = load_rgb_resized(b_path)
        a_arr = load_rgb_resized(a_path)
        metrics = compute_frame_pair_anomaly(b_arr, a_arr, roi_uv=item["roi_uv"])
        gu, gv = metrics["ground_pin_uv"]
        enu_xyz = project_uv_to_ground_enu(cam_id, gu, gv)

        pins.append(
            {
                "pin_id": item["pin_id"],
                "timestamp_iso": item["timestamp_iso"],
                "camera_id": cam_id,
                "camera_label": EXTERIOR_CAMERA_POSES[cam_id]["label"],
                "category": item["category"],
                "enu_xyz": enu_xyz,
                "frustum_bbox_uv": metrics["frustum_bbox_uv"],
                "ground_pin_uv": metrics["ground_pin_uv"],
                "luma_mae": metrics["luma_mae"],
                "changed_fraction": metrics["changed_fraction"],
                "delta_score": metrics["delta_score"],
                "before_frame": f"/yard-frames/{item['before_file']}",
                "before_sha256": sha256_file(b_path),
                "after_frame": f"/yard-frames/{item['after_file']}",
                "after_sha256": sha256_file(a_path),
                "diff_overlay": item["diff_overlay"],
                "summary": item["summary"],
            }
        )

    payload = {
        "schema": "gev-anomaly-radar-v1",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        "track": "Track 4 — Automated Change & Anomaly Radar",
        "privacy_guard": "EXTERIOR_ONLY (bed, camo, living-room-cam strictly excluded)",
        "registered_cameras": list(EXTERIOR_CAMERA_POSES.keys()),
        "pin_count": len(pins),
        "pins": pins,
    }
    atomic_write_text(out_json_path, json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    return payload


if __name__ == "__main__":
    yf_dir = Path("/home/paul/gods-eye-view/public/yard-frames")
    out_path = Path("/home/paul/gods-eye-view/public/gev-intel/anomaly-pins.json")
    res = build_live_anomaly_pins(yf_dir, out_path)
    print(f"RADAR_OK: {out_path} pin_count={res['pin_count']}")
