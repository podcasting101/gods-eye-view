#!/usr/bin/env python3
"""Live Dual-Camera Front Yard Stitcher + TPS Ground Register (`Cam1` + Lowered `Wyze Cam V4`).

Pulls fresh frames from local go2rtc (`back-yard-cam1` + `wyze-cam-v4`), stitches them in
camera perspective space using shared foreground landmarks (Monaco Beaver solar arch, Palm Dr),
and warps via Regularized Forward Thin-Plate Spline (TPS) onto the calibrated 2048x1536 ground
quad (`public/yard-frames/front-yard-stitched-live.png`), calibrated for Paul's lowered V4 pitch!
"""
import math, sys, time, urllib.request, pathlib
import numpy as np
from PIL import Image

W, H = 1600, 900
TEX_W, TEX_H = 2048, 1536

def fetch_frame(src):
    with urllib.request.urlopen(f"http://127.0.0.1:1984/api/frame.jpeg?src={src}", timeout=10) as r:
        data = r.read()
    import io
    return Image.open(io.BytesIO(data)).convert("RGBA").resize((W, H), Image.Resampling.LANCZOS)

v4_orig = fetch_frame("wyze-cam-v4")
cam1_orig = fetch_frame("back-yard-cam1")

# Shared features between Cam1 (East Driveway/Monaco/Tesla/Arch) and lowered Wyze Cam V4 (2026-11-17):
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

# Updated V4 coordinates after Paul lowered V4 pitch (~0.24*H upward shift in image):
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
c1_bot_fade = np.clip((0.76 * H - np.arange(H)) / (0.12 * H), 0.0, 1.0)
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

def v4_uv(u, v):
    return (u * W - min_x) / pano_w, (v * H - min_y) / pano_h

def c1_uv(u, v):
    pt = np.array([u * W, v * H, 1.0]) @ M_aff
    return (pt[0] - min_x) / pano_w, (pt[1] - min_y) / pano_h

def solve_homography(src, dst):
    A = []
    for (x, y), (u, v) in zip(src, dst):
        A.append([-x, -y, -1, 0, 0, 0, u * x, u * y, u])
        A.append([0, 0, 0, -x, -y, -1, v * x, v * y, v])
    _, _, Vt = np.linalg.svd(np.array(A, dtype=np.float64))
    H_mat = Vt[-1].reshape(3, 3)
    return H_mat / H_mat[2, 2]

cyan_screen = np.array([[430.0, 226.0], [765.0, 219.0], [833.0, 500.0], [331.0, 521.0]], dtype=np.float64)
tex_rect = np.array([[0.0, 0.0], [TEX_W, 0.0], [TEX_W, TEX_H], [0.0, TEX_H]], dtype=np.float64)
H_screen_to_tex = solve_homography(cyan_screen, tex_rect)

def screen_to_txy(x, y):
    p = np.array([x, y, 1.0]) @ H_screen_to_tex.T
    return p[0] / p[2], p[1] / p[2]

# Updated landmark pins for Paul's lowered V4 pitch (2026-11-17):
pins_screen = [
    ("Horizon TL",               *v4_uv(0.02, 0.02), 445, 232),
    ("Horizon TM1",              *v4_uv(0.35, 0.02), 585, 228),
    ("Horizon TM2",              *v4_uv(0.66, 0.02), 685, 224),
    ("Horizon TR",               *v4_uv(0.96, 0.02), 762, 222),

    # Across the street: Neighbor's house + Culvert + Oak!
    ("White house far SSW",      *v4_uv(0.08, 0.24), 555, 295),
    ("Blue house across street", *v4_uv(0.24, 0.16), 655, 282),
    ("Culvert neighbor drive",   *v4_uv(0.50, 0.17), 718, 355),

    # Palm Drive road (collinear from East RV to West exit):
    ("Palm Dr road East (RV)",   *c1_uv(0.15, 0.12), 360, 418),
    ("Palm Dr road at Sago",     *c1_uv(0.50, 0.13), 452, 404),
    ("Palm Dr road at Arch",     *v4_uv(0.08, 0.56), 525, 392),
    ("Palm Dr road mid-yard",    *v4_uv(0.36, 0.34), 625, 374),
    ("Palm Dr road at Pole",     *v4_uv(0.62, 0.15), 725, 358),
    ("Palm Dr road West",        *v4_uv(0.75, 0.05), 765, 350),

    # Right-side & center yard landmarks (Telephone pole, Little yellow pump house, Dome, Arch):
    ("Neighbor oak tree base",   *v4_uv(0.81, 0.09), 790, 385),
    ("Telephone pole base",      *v4_uv(0.67, 0.23), 745, 412),
    ("Little yellow pump house", *v4_uv(0.76, 0.26), 778, 448),
    ("Bottom-right V4 solar",    *v4_uv(0.92, 0.72), 815, 488),
    ("White dome trailer base",  *v4_uv(0.48, 0.45), 642, 442),
    ("Yellow crane / W wall",    *v4_uv(0.54, 0.88), 645, 502),
    ("Monaco Beaver solar arch", *v4_uv(0.18, 0.65), 535, 462),
    ("Yellow house S wall edge", *v4_uv(0.22, 0.96), 525, 508),

    # Left side: Original driveway (White RV, Red Van, White Tesla, Sago palm):
    ("Sago palm front yard",     *c1_uv(0.46, 0.24), 468, 438),
    ("White RV in driveway",     *c1_uv(0.12, 0.25), 382, 465),
    ("Red Van in driveway",      *c1_uv(0.26, 0.24), 418, 462),
    ("White Tesla in driveway",  *c1_uv(0.28, 0.45), 442, 488),
    ("Cam1 bottom-left (RV S)",  *c1_uv(0.05, 0.68), 355, 508),
    ("Cam1 bottom-right (lawn)", *c1_uv(0.45, 0.72), 480, 510),
]

uv_pts = np.array([[u, v] for _, u, v, _, _ in pins_screen], dtype=np.float64)
txy_pts = np.array([screen_to_txy(x, y) for _, _, _, x, y in pins_screen], dtype=np.float64)

N = len(uv_pts)
diff = uv_pts[:, None, :] - uv_pts[None, :, :]
r2 = np.sum(diff ** 2, axis=-1)
K = r2 * np.log(r2 + 1e-12) + np.eye(N) * 0.018
P = np.hstack([np.ones((N, 1)), uv_pts])
L = np.zeros((N + 3, N + 3), dtype=np.float64)
L[:N, :N] = K; L[:N, N:] = P; L[N:, :N] = P.T
Y = np.vstack([txy_pts, np.zeros((3, 2))])
params = np.linalg.solve(L, Y)
W_tps, A_tps = params[:N], params[N:]

GW, GH = 44, 30
us = np.linspace(0.0, 1.0, GW + 1)
vs = np.linspace(0.0, 1.0, GH + 1)
ug, vg = np.meshgrid(us, vs)
grid_uv = np.stack([ug.ravel(), vg.ravel()], axis=-1)
diff_g = grid_uv[:, None, :] - uv_pts[None, :, :]
r2_g = np.sum(diff_g ** 2, axis=-1)
grid_txy = ((r2_g * np.log(r2_g + 1e-12)) @ W_tps + np.hstack([np.ones((len(grid_uv), 1)), grid_uv]) @ A_tps).reshape((GH + 1, GW + 1, 2))

ground_tex = np.zeros((TEX_H, TEX_W, 4), dtype=np.uint8)
pano_arr = np.array(pano)

for i in range(GH):
    for j in range(GW):
        for tri in [
            (grid_txy[i, j], grid_txy[i + 1, j], grid_txy[i + 1, j + 1], [us[j], vs[i]], [us[j], vs[i + 1]], [us[j + 1], vs[i + 1]]),
            (grid_txy[i, j], grid_txy[i + 1, j + 1], grid_txy[i, j + 1], [us[j], vs[i]], [us[j + 1], vs[i + 1]], [us[j + 1], vs[i]]),
        ]:
            p0, p1, p2, uv0, uv1, uv2 = tri
            min_x_t = max(0, int(math.floor(min(p0[0], p1[0], p2[0]))))
            max_x_t = min(TEX_W - 1, int(math.ceil(max(p0[0], p1[0], p2[0]))))
            min_y_t = max(0, int(math.floor(min(p0[1], p1[1], p2[1]))))
            max_y_t = min(TEX_H - 1, int(math.ceil(max(p0[1], p1[1], p2[1]))))
            if min_x_t > max_x_t or min_y_t > max_y_t:
                continue
            xs, ys = np.meshgrid(np.arange(min_x_t, max_x_t + 1), np.arange(min_y_t, max_y_t + 1))
            denom = (p1[1] - p2[1]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[1] - p2[1])
            if abs(denom) < 1e-6:
                continue
            w0 = ((p1[1] - p2[1]) * (xs - p2[0]) + (p2[0] - p1[0]) * (ys - p2[1])) / denom
            w1 = ((p2[1] - p0[1]) * (xs - p2[0]) + (p0[0] - p2[0]) * (ys - p2[1])) / denom
            w2 = 1.0 - w0 - w1
            mask = (w0 >= -1e-4) & (w1 >= -1e-4) & (w2 >= -1e-4)
            if not np.any(mask):
                continue
            u = w0[mask] * uv0[0] + w1[mask] * uv1[0] + w2[mask] * uv2[0]
            v = w0[mask] * uv0[1] + w1[mask] * uv1[1] + w2[mask] * uv2[1]
            sx = np.clip((u * (pano_w - 1)).astype(np.int32), 0, pano_w - 1)
            sy = np.clip((v * (pano_h - 1)).astype(np.int32), 0, pano_h - 1)
            sampled = pano_arr[sy, sx]
            a_ok = sampled[:, 3] > 0
            ground_tex[ys[mask][a_ok], xs[mask][a_ok]] = sampled[a_ok]

out_live = pathlib.Path("/home/paul/gods-eye-view/public/yard-frames/front-yard-stitched-live.png")
out_legacy = pathlib.Path("/home/paul/gods-eye-view/public/yard-frames/front-yard-stitched-2026-10-12.png")
pano_preview = pathlib.Path("/home/paul/gods-eye-view/public/yard-frames/front-yard-pano-preview.png")

img_out = Image.fromarray(ground_tex, "RGBA")
img_out.save(out_live)
img_out.save(out_legacy)
pano.save(pano_preview)
print(f"STITCHED OK -> {out_live} ({out_live.stat().st_size} bytes)")
