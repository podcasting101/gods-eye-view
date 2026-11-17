#!/usr/bin/env python3
"""
God's Eye View — Track 1: Live RTSP/HLS + Historical 4D Time-Scrubber Fusion
Generates /home/paul/gods-eye-view/public/gev-intel/rtsp-scrubber-fusion.json
and mirrors to /home/paul/antigravity_workspace/gev_rtsp_scrubber_fusion.json.

Honors:
1. Exterior-Only Privacy Firewall (bed, camo, living-room-cam strictly rejected).
2. 4D Scrubber Cross-Fade Math: t=100 -> LIVE_EDGE (HLS/WebRTC + latest snapshot fallback);
   t<100 -> HISTORICAL_SCRUB across calibrated keyframes & incident recordings.
3. On-Demand 0% Idle GPU Render Governor compatibility (dirty-frame-only texture updates).
"""

import datetime
import hashlib
import json
from pathlib import Path
from typing import Any, Dict, List

FORBIDDEN_INTERIOR_CAMERAS = {
    "bed",
    "camo",
    "living-room-cam",
    "master-bed-cam-20261015",
    "D03F27DFB2CF",
    "2CAA8E1040BB",
}

ALLOWED_EXTERIOR_STREAMS: Dict[str, Dict[str, Any]] = {
    "yard-overview": {
        "camera_id": "yard-overview",
        "label": "Wyze Cam V4 — Front Yard & Driveway",
        "frustum_id": "yard-overview-20261012",
        "enu_xyz": [-4.2, 5.2, 11.5],
        "look_at_xyz": [2.5, 1.2, -6.0],
        "fov_deg": 62.0,
        "live_hls_url": "/gev-intel/live/yard-overview/index.m3u8",
        "live_snapshot_fallback": "/yard-frames/yard-overview-2026-10-12.png",
        "keyframes": [
            {
                "t_pct": 0,
                "timestamp_iso": "2026-10-12T14:22:00-05:00",
                "mode": "historical_snapshot",
                "url": "/yard-frames/yard-overview-2026-10-12.png",
                "label": "Oct 12 Survey Baseline — Driveway & Fleet Pad",
            },
            {
                "t_pct": 65,
                "timestamp_iso": "2026-10-24T11:37:00-05:00",
                "mode": "historical_snapshot",
                "url": "/yard-frames/front-yard-stitched-2026-10-12.png",
                "label": "Oct 24 TPS Ground-Pinned Composite",
            },
            {
                "t_pct": 100,
                "timestamp_iso": "LIVE_EDGE",
                "mode": "live_rtsp_hls_or_fallback",
                "url": "/yard-frames/yard-overview-2026-10-12.png",
                "label": "LIVE EDGE — Wyze V4 Front Yard Stream",
            },
        ],
    },
    "back-yard-cam1": {
        "camera_id": "back-yard-cam1",
        "label": "Wyze Cam V3 — East Road & Culvert",
        "frustum_id": "back-yard-cam1-plan",
        "enu_xyz": [13.5, 4.8, 6.0],
        "look_at_xyz": [-3.0, 0.8, 12.0],
        "fov_deg": 60.0,
        "live_hls_url": "/gev-intel/live/back-yard-cam1/index.m3u8",
        "live_snapshot_fallback": "/yard-frames/back-yard-cam1-2026-10-12.jpg",
        "keyframes": [
            {
                "t_pct": 0,
                "timestamp_iso": "2026-10-12T14:20:00-05:00",
                "mode": "historical_snapshot",
                "url": "/yard-frames/back-yard-cam1-2026-10-12.jpg",
                "label": "Oct 12 Survey Baseline — Palm Drive Culvert",
            },
            {
                "t_pct": 100,
                "timestamp_iso": "LIVE_EDGE",
                "mode": "live_rtsp_hls_or_fallback",
                "url": "/yard-frames/back-yard-cam1-2026-10-12.jpg",
                "label": "LIVE EDGE — Back Yard Cam 1 Stream",
            },
        ],
    },
    "back-yard-cam2": {
        "camera_id": "back-yard-cam2",
        "label": "Wyze Cam V3 — Waterfront / North Pond & Solar Array",
        "frustum_id": "back-yard-cam2-water",
        "enu_xyz": [2.8, 4.5, -14.5],
        "look_at_xyz": [4.0, 1.0, -32.0],
        "fov_deg": 62.0,
        "live_hls_url": "/gev-intel/live/back-yard-cam2/index.m3u8",
        "live_snapshot_fallback": "/yard-frames/back-yard-cam2-stitched-2026-10-26.png",
        "keyframes": [
            {
                "t_pct": 0,
                "timestamp_iso": "2026-10-12T14:25:00-05:00",
                "mode": "historical_snapshot",
                "url": "/yard-frames/back-yard-cam2-2026-10-12.jpg",
                "label": "Oct 12 Pre-Fire Waterfront Baseline",
            },
            {
                "t_pct": 75,
                "timestamp_iso": "2026-10-25T12:14:08-05:00",
                "mode": "incident_keyframe",
                "url": "/yard-frames/20261025_121408_back-yard-cam2_0.jpg",
                "anomaly_pin_id": "anom-20261025-121408-back-yard-cam2-ignition",
                "label": "Oct 25 12:14:08 CDT — Solar Array Ignition Frame",
            },
            {
                "t_pct": 85,
                "timestamp_iso": "2026-10-25T12:17:59-05:00",
                "mode": "incident_keyframe",
                "url": "/yard-frames/20261025_121759_back-yard-cam2_0.jpg",
                "anomaly_pin_id": "anom-20261025-121759-back-yard-cam2-postfire",
                "label": "Oct 25 12:17:59 CDT — Post-Fire Panel Displacement",
            },
            {
                "t_pct": 95,
                "timestamp_iso": "2026-10-26T09:21:00-05:00",
                "mode": "stitched_composite",
                "url": "/yard-frames/back-yard-cam2-stitched-2026-10-26.png",
                "label": "Oct 26 3900x1913 Tree-Aligned Before+After Splat",
            },
            {
                "t_pct": 100,
                "timestamp_iso": "LIVE_EDGE",
                "mode": "live_rtsp_hls_or_fallback",
                "url": "/yard-frames/back-yard-cam2-stitched-2026-10-26.png",
                "label": "LIVE EDGE — Waterfront Cam 2 Stream",
            },
        ],
    },
    "pan4-cam": {
        "camera_id": "pan4-cam",
        "label": "Wyze Cam Pan V4 — Boathouse Dock Cam (HL_PAN4)",
        "frustum_id": "dock-cam-fire-121338",
        "enu_xyz": [-8.5, 2.2, -25.0],
        "look_at_xyz": [1.5, 2.6, -15.5],
        "fov_deg": 62.0,
        "live_hls_url": "/gev-intel/live/pan4-cam/index.m3u8",
        "live_snapshot_fallback": "/yard-frames/20261025_121338_pan4-cam_0.jpg",
        "incident_video_url": "/yard-frames/yard-fire-legs-cut-2026-10-25.mp4",
        "keyframes": [
            {
                "t_pct": 72,
                "timestamp_iso": "2026-10-25T12:13:38-05:00",
                "mode": "incident_keyframe",
                "url": "/yard-frames/20261025_121338_pan4-cam_0.jpg",
                "label": "Oct 25 12:13:38 CDT — Dock Cam Smoke Plume",
            },
            {
                "t_pct": 88,
                "timestamp_iso": "2026-10-25T12:18:00-05:00",
                "mode": "incident_video_cut",
                "url": "/yard-frames/yard-fire-legs-cut-2026-10-25.mp4",
                "label": "Oct 25 Legs-Only Patrol & Fire Video Cut (31.5s)",
            },
            {
                "t_pct": 100,
                "timestamp_iso": "LIVE_EDGE",
                "mode": "live_rtsp_hls_or_fallback",
                "url": "/yard-frames/20261025_121338_pan4-cam_0.jpg",
                "label": "LIVE EDGE — Boathouse Dock Pan V4 Stream",
            },
        ],
    },
}

DEFAULT_OUTPUT = Path("/home/paul/gods-eye-view/public/gev-intel/rtsp-scrubber-fusion.json")
MIRROR_OUTPUT = Path("/home/paul/antigravity_workspace/gev_rtsp_scrubber_fusion.json")


def validate_exterior_stream_id(camera_id: str) -> None:
    if camera_id in FORBIDDEN_INTERIOR_CAMERAS:
        raise ValueError(f"Privacy firewall violation: interior stream '{camera_id}' is strictly forbidden")
    if camera_id not in ALLOWED_EXTERIOR_STREAMS:
        raise ValueError(f"Unregistered camera stream '{camera_id}'")


def compute_scrubber_blend(camera_id: str, t_pct: float) -> Dict[str, Any]:
    """
    Given a registered exterior camera_id and timeline scrubber position t_pct in [0, 100],
    returns the active keyframe, next keyframe, blend weight alpha in [0.0, 1.0],
    and whether the frustum is at LIVE_EDGE (t_pct >= 98.0).
    """
    validate_exterior_stream_id(camera_id)
    clamped_t = max(0.0, min(100.0, float(t_pct)))
    stream = ALLOWED_EXTERIOR_STREAMS[camera_id]
    kfs = sorted(stream["keyframes"], key=lambda k: k["t_pct"])

    is_live_edge = clamped_t >= 98.0
    prev_kf = kfs[0]
    next_kf = kfs[-1]
    for i in range(len(kfs)):
        if kfs[i]["t_pct"] <= clamped_t:
            prev_kf = kfs[i]
            next_kf = kfs[min(i + 1, len(kfs) - 1)]

    span = max(1.0, float(next_kf["t_pct"] - prev_kf["t_pct"]))
    alpha = 1.0 if prev_kf is next_kf else max(0.0, min(1.0, (clamped_t - prev_kf["t_pct"]) / span))

    return {
        "camera_id": camera_id,
        "t_pct": round(clamped_t, 2),
        "state": "LIVE_EDGE" if is_live_edge else "HISTORICAL_SCRUB",
        "primary_frame_url": next_kf["url"] if alpha >= 0.5 else prev_kf["url"],
        "prev_keyframe": prev_kf,
        "next_keyframe": next_kf,
        "crossfade_alpha": round(alpha, 4),
        "governor_policy": "DIRTY_FRAME_ONLY_0PCT_IDLE",
    }


def build_rtsp_scrubber_manifest() -> Dict[str, Any]:
    streams: List[Dict[str, Any]] = []
    for cid in ["yard-overview", "back-yard-cam1", "back-yard-cam2", "pan4-cam"]:
        validate_exterior_stream_id(cid)
        streams.append(ALLOWED_EXTERIOR_STREAMS[cid])

    return {
        "schema": "gev-rtsp-scrubber-fusion-v1",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        "track": "Track 1 — Live RTSP/HLS + Historical 4D Time-Scrubber Fusion",
        "privacy_guard": "EXTERIOR_ONLY (bed, camo, living-room-cam strictly excluded)",
        "render_governor": {
            "idle_gpu_target_pct": 0,
            "live_frame_cadence_Rule": "Render only on dirty video frame or user camera slerp/scrub",
        },
        "scrubber_contract": {
            "range_min": 0,
            "range_max": 100,
            "live_edge_threshold": 98,
            "default_t_pct": 100,
        },
        "stream_count": len(streams),
        "streams": streams,
    }


def main() -> int:
    payload = build_rtsp_scrubber_manifest()
    serialized = json.dumps(payload, indent=2) + "\n"
    DEFAULT_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    DEFAULT_OUTPUT.write_text(serialized, encoding="utf-8")
    MIRROR_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    MIRROR_OUTPUT.write_text(serialized, encoding="utf-8")
    digest = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    print(f"Wrote {DEFAULT_OUTPUT} (streams={payload['stream_count']}, sha256={digest})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
