#!/usr/bin/env python3
"""Warp-Free Dual-Camera Front Yard Stitcher (`Cam1` + Lowered `Wyze Cam V4`).

Uses pure linear/projective homography (ZERO Thin-Plate Spline rubber-sheet bending!)
so straight lines (Palm Drive road, solar arches, neighbor's house, telephone pole, RVs)
stay 100% straight and optically undistorted!
"""
import io, urllib.request, pathlib
import numpy as np
from PIL import Image

W, H = 1600, 900
TEX_W, TEX_H = 2048, 1536

def fetch_frame(src):
    with urllib.request.urlopen(f"http://127.0.0.1:1984/api/frame.jpeg?src={src}", timeout=10) as r:
        return Image.open(io.BytesIO(r.read())).convert("RGBA").resize((W, H), Image.Resampling.LANCZOS)

v4_orig = fetch_frame("wyze-cam-v4")
cam1_orig = fetch_frame("back-yard-cam1")

# 1. Pure Rigid/Affine Stitch of Cam1 (left) + lowered Wyze V4 (right) in camera perspective space:
src_cam1 = np.array([
    [0.120 * W, 0.250 * H], # White Monaco RV in east driveway
    [0.260 * W, 0.240 * H], # Red Van
    [0.280 * W, 0.450 * H], # White Tesla
    [0.200 * W, 0.120 * H], # Road far left (above RV)
    [0.500 * W, 0.130 * H], # Road at sago palm
    [0.760 * W, 0.155 * H], # Road at solar arch
    [0.835 * W, 0.125 * H], # Curved solar arch peak
    [0.700 * W, 0.225 * H], # Flat solar wing top-left
    [0.680 * W, 0.580 * H], # Flat solar wing bottom-left
    [0.950 * W, 0.480 * H], # Curved solar arch bottom-right
], dtype=np.float64)

dst_v4 = np.array([
    [-0.175 * W, 0.855 * H],
    [-0.115 * W, 0.835 * H],
    [-0.095 * W, 0.955 * H],
    [-0.180 * W, 0.675 * H],
    [-0.060 * W, 0.630 * H],
    [ 0.065 * W, 0.570 * H],
    [ 0.145 * W, 0.495 * H],
    [ 0.075 * W, 0.630 * H],
    [ 0.045 * W, 0.785 * H],
    [ 0.265 * W, 0.755 * H],
], dtype=np.float64)

X_c1 = np.hstack([src_cam1, np.ones((len(src_cam1), 1))])
M_aff, _, _, _ = np.linalg.lstsq(X_c1, dst_v4, rcond=None)
M = np.vstack([M_aff.T, [0, 0, 1]])

min_x, min_y = -440, 0
pano_w, pano_h = 2040, 1120
pano = Image.new("RGBA", (pano_w, pano_h), (0, 0, 0, 0))
T_shift = np.array([[1, 0, min_x], [0, 1, min_y], [0, 0, 1]], dtype=np.float64)
M_inv = np.linalg.inv(M) @ T_shift

c1_arr = np.array(cam1_orig)
c1_alpha = c1_arr[:, :, 3].astype(np.float32)
c1_bot_fade = np.clip((0.82 * H - np.arange(H)) / (0.12 * H), 0.0, 1.0)
c1_right_fade = np.clip((0.92 * W - np.arange(W)) / (0.12 * W), 0.0, 1.0)
c1_arr[:, :, 3] = (c1_alpha * c1_bot_fade[:, None] * c1_right_fade[None, :]).astype(np.uint8)
cam1_warped = Image.fromarray(c1_arr, "RGBA").transform(
    (pano_w, pano_h), Image.Transform.AFFINE, M_inv[:2, :].flatten().tolist(), resample=Image.Resampling.BICUBIC
)
pano.alpha_composite(cam1_warped, (0, 0))

v4_arr = np.array(v4_orig)
v4_arr[:3, :, 3] = 0; v4_arr[-3:, :, 3] = 0; v4_arr[:, -3:, 3] = 0
alpha = v4_arr[:, :, 3].astype(np.float32)
ramp_x = np.clip(np.arange(W) / 115.0, 0.0, 1.0)
ramp_y = np.clip((H - 1 - np.arange(H)) / 65.0, 0.0, 1.0)
weight_2d = np.ones((H, W), dtype=np.float32) * ramp_x[None, :]
left_mask = np.clip((0.32 * W - np.arange(W)) / (0.10 * W), 0.0, 1.0)
weight_2d *= (1.0 - left_mask[None, :] * (1.0 - ramp_y[:, None]))
v4_arr[:, :, 3] = (alpha * weight_2d).astype(np.uint8)
pano.alpha_composite(Image.fromarray(v4_arr, "RGBA"), (-min_x, -min_y))

# 2. Pure 4-Corner Planar Homography (ZERO TPS rubber-sheeting — every straight line stays 100% straight!):
#    Aligns the stitched panorama's natural horizon/road angle (~22° camera roll) straight onto the ground quad!
def solve_persp_coeffs(dst_pts, src_pts):
    matrix = []
    for (dx, dy), (sx, sy) in zip(dst_pts, src_pts):
        matrix.append([dx, dy, 1, 0, 0, 0, -sx * dx, -sx * dy])
        matrix.append([0, 0, 0, dx, dy, 1, -sy * dx, -sy * dy])
    A = np.array(matrix, dtype=np.float64)
    B = np.array(src_pts, dtype=np.float64).reshape(8)
    return np.linalg.solve(A, B).tolist()

# Map clean rectangular ground quad [TL, TR, BR, BL] -> natural unwarped panorama corners rotated by camera horizon angle:
dst_quad = [(0, 0), (TEX_W, 0), (TEX_W, TEX_H), (0, TEX_H)]
src_quad = [
    (220, 260),           # TL (far East horizon above Monaco RV)
    (1860, -90),          # TR (far West horizon past neighbor's house & oak)
    (2110, 960),          # BR (West yard foreground / pump house)
    (40, 1120),           # BL (East driveway foreground / Tesla & RV)
]
coeffs = solve_persp_coeffs(dst_quad, src_quad)
ground_clean = pano.transform((TEX_W, TEX_H), Image.Transform.PERSPECTIVE, coeffs, resample=Image.Resampling.BICUBIC)

out_live = pathlib.Path("/home/paul/gods-eye-view/public/yard-frames/front-yard-stitched-live.png")
out_legacy = pathlib.Path("/home/paul/gods-eye-view/public/yard-frames/front-yard-stitched-2026-10-12.png")
pano_preview = pathlib.Path("/home/paul/gods-eye-view/public/yard-frames/front-yard-pano-preview.png")

ground_clean.save(out_live)
ground_clean.save(out_legacy)
pano.save(pano_preview)
print("CLEAN WARP-FREE STITCH SAVED:", out_live.stat().st_size, "bytes")
