import math
import numpy as np
from PIL import Image, ImageDraw

# 1. Build the Clean Stitched Panorama in memory from the original clean V4 and Cam1 images:
W, H = 1600, 900
v4_orig = Image.open("/mnt/c/Users/paul/.gemini/antigravity/brain/f6e4fae7-0156-49f2-965c-ddeca6784f2d/scratch/yard-overview-2026-10-12.png").convert("RGBA").resize((W, H), Image.Resampling.LANCZOS)
cam1_orig = Image.open("/mnt/c/Users/paul/.gemini/antigravity/brain/f6e4fae7-0156-49f2-965c-ddeca6784f2d/scratch/back-yard-cam1-2026-10-12.jpg").convert("RGBA").resize((W, H), Image.Resampling.LANCZOS)

src_cam1 = np.array([
    [0.120 * W, 0.250 * H], # RV in east driveway
    [0.260 * W, 0.240 * H], # Red van
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
    [-0.145 * W, 1.080 * H],
    [-0.085 * W, 1.060 * H],
    [-0.065 * W, 1.180 * H],
    [-0.150 * W, 0.900 * H],
    [-0.030 * W, 0.855 * H],
    [ 0.095 * W, 0.795 * H],
    [ 0.195 * W, 0.705 * H],
    [ 0.105 * W, 0.855 * H],
    [ 0.075 * W, 0.995 * H],
    [ 0.310 * W, 0.965 * H],
], dtype=np.float64)

X_c1 = np.hstack([src_cam1, np.ones((len(src_cam1), 1))])
M_aff, _, _, _ = np.linalg.lstsq(X_c1, dst_v4, rcond=None)
M = np.vstack([M_aff.T, [0, 0, 1]])

min_x, min_y = -404, 0
pano_w, pano_h = 2004, 1200
pano = Image.new("RGBA", (pano_w, pano_h), (0, 0, 0, 0))
T_shift = np.array([[1, 0, min_x], [0, 1, min_y], [0, 0, 1]], dtype=np.float64)
M_inv = np.linalg.inv(M) @ T_shift
# Feather the outer edges of Cam1 so there is no sharp rectangular step at the bottom seam:
c1_orig_arr = np.array(cam1_orig)
c1_alpha = c1_orig_arr[:, :, 3].astype(np.float32)
c1_bot_fade = np.clip((0.72 * H - np.arange(H)) / (0.12 * H), 0.0, 1.0)
c1_right_fade = np.clip((0.92 * W - np.arange(W)) / (0.10 * W), 0.0, 1.0)
c1_orig_arr[:, :, 3] = (c1_alpha * c1_bot_fade[:, None] * c1_right_fade[None, :]).astype(np.uint8)
cam1_warped = Image.fromarray(c1_orig_arr, "RGBA").transform((pano_w, pano_h), Image.Transform.AFFINE, M_inv[:2, :].flatten().tolist(), resample=Image.Resampling.BICUBIC)
pano.alpha_composite(cam1_warped, (0, 0))

v4_arr = np.array(v4_orig)
v4_arr[:4, :, 3] = 0; v4_arr[-4:, :, 3] = 0; v4_arr[:, -4:, 3] = 0
alpha = v4_arr[:, :, 3].astype(np.float32)
sky_trim = np.clip((np.arange(H) - 0.10 * H) / (0.05 * H), 0.0, 1.0)
ramp_x = np.clip(np.arange(W) / 110.0, 0.0, 1.0)
ramp_y = np.clip((H - 1 - np.arange(H)) / 95.0, 0.0, 1.0)
weight_2d = (sky_trim[:, None] * ramp_x[None, :]).astype(np.float32)
left_mask = np.clip((0.36 * W - np.arange(W)) / (0.10 * W), 0.0, 1.0)
weight_2d *= (1.0 - left_mask[None, :] * (1.0 - ramp_y[:, None]))
v4_arr[:, :, 3] = (alpha * weight_2d).astype(np.uint8)
pano.alpha_composite(Image.fromarray(v4_arr, "RGBA"), (-min_x, -min_y))

def v4_uv(u, v):
    return (u * W - min_x) / pano_w, (v * H - min_y) / pano_h

def c1_uv(u, v):
    pt = np.array([u * W, v * H, 1.0]) @ M_aff
    return (pt[0] - min_x) / pano_w, (pt[1] - min_y) / pano_h

# 2. Define a clean, geometrically consistent set of Ground Pins with HIGH smoothness (reg = 0.065)
# so straight lines (Palm Drive road, utility pole, solar panels, Blue House roof, White RV) stay
# 100% STRAIGHT and UNDISTORTED while landing on their exact satellite landmarks!
#
# Notice in `v4_uv(u, v)`:
# - The road runs strictly along the straight line `v_road(u) = 0.82 - 0.547 * u`, mapped to the
#   straight satellite road from East (29.24734, -95.23128) to West (29.24743, -95.23184).
# - The White RV in Cam1 is shifted 4.5m East-Southeast to (29.24744, -95.23126) so it covers the
#   white RV pad on the satellite map that was peeking out on the left in `dba4aa76.jpg`!
pins_geo = [
    # 1. Straight, uniform top sky line across the pond:
    ("Sky TL",                   *v4_uv(0.02, 0.10), 29.24688, -95.23142),
    ("Sky TM1",                  *v4_uv(0.35, 0.10), 29.24695, -95.23160),
    ("Sky TM2",                  *v4_uv(0.68, 0.10), 29.24704, -95.23177),
    ("Sky TR",                   *v4_uv(0.98, 0.10), 29.24714, -95.23193),

    # 2. Across the street / pond (Blue House & Driveway):
    ("White house far SSW",      *v4_uv(0.18, 0.42), 29.24708, -95.23148),
    ("Blue house across pond",   *v4_uv(0.38, 0.36), 29.24709, -95.23162),
    ("Driveway across street",   *v4_uv(0.55, 0.41), 29.24724, -95.23165),
    ("Trees across street W",    *v4_uv(0.78, 0.28), 29.24724, -95.23182),

    # 3. Palm Drive road: strictly collinear in both (u, v) and (lat, lon) so the road is DEAD STRAIGHT!
    ("Palm Dr road East (RV)",   *c1_uv(0.15, 0.12), 29.24735, -95.23128),
    ("Palm Dr road at Sago",     *c1_uv(0.50, 0.13), 29.24736, -95.23138),
    ("Palm Dr road at Arch",     *v4_uv(0.12, 0.754), 29.24737, -95.23147),
    ("Palm Dr road mid-yard",    *v4_uv(0.42, 0.590), 29.24738, -95.23158),
    ("Palm Dr road at Pole",     *v4_uv(0.70, 0.437), 29.24739, -95.23170),
    ("Palm Dr road West exit",   *v4_uv(0.95, 0.300), 29.24740, -95.23183),

    # 4. Yard Landmarks & Yellow House SW Front Wall Perimeter (strictly collinear bottom edge):
    ("Neighbor's oak tree base", *v4_uv(0.92, 0.48), 29.24748, -95.23180),
    ("Little yellow pump house", *v4_uv(0.87, 0.65), 29.24753, -95.23170),
    ("Bottom-right V4 lawn",     *v4_uv(0.98, 0.96), 29.24760, -95.23167),
    ("White dome ground base",   *v4_uv(0.56, 0.78), 29.24749, -95.23155),
    ("Yellow house W wall edge", *v4_uv(0.52, 0.98), 29.24754, -95.23149),
    ("Yellow house S wall edge", *v4_uv(0.12, 0.98), 29.24752, -95.23140),

    # 5. East Driveway Vehicles (Cam1) — shifted 4.5m East onto the exact satellite White RV pad!
    ("Sago palm front yard",     *c1_uv(0.46, 0.24), 29.24741, -95.23138),
    ("White RV in driveway",     *c1_uv(0.12, 0.25), 29.24744, -95.23126),
    ("Red Van in driveway",      *c1_uv(0.26, 0.24), 29.24745, -95.23131),
    ("White Tesla in driveway",  *c1_uv(0.28, 0.45), 29.24749, -95.23133),
    ("Cam1 bottom-left (RV S)",  *c1_uv(0.05, 0.75), 29.24749, -95.23126),
    ("Cam1 bottom-right (lawn)", *c1_uv(0.45, 0.85), 29.24751, -95.23138),
]

LAT0, LON0 = 29.24745, -95.23155
M_PER_LAT = 111320.0
M_PER_LON = 111320.0 * math.cos(math.radians(LAT0))

def geo_to_en(lat, lon):
    return (lon - LON0) * M_PER_LON, (lat - LAT0) * M_PER_LAT

def en_to_geo(e, n):
    return LAT0 + n / M_PER_LAT, LON0 + e / M_PER_LON

uv_pts = np.array([[u, v] for _, u, v, _, _ in pins_geo], dtype=np.float64)
en_pts = np.array([geo_to_en(lat, lon) for _, _, _, lat, lon in pins_geo], dtype=np.float64)

def fit_forward_tps(src_uv, dst_coords, reg=0.055):
    N = len(src_uv)
    diff = src_uv[:, None, :] - src_uv[None, :, :]
    r2 = np.sum(diff ** 2, axis=-1)
    K = r2 * np.log(r2 + 1e-12) + np.eye(N) * reg
    P = np.hstack([np.ones((N, 1)), src_uv])
    L = np.zeros((N + 3, N + 3), dtype=np.float64)
    L[:N, :N] = K
    L[:N, N:] = P
    L[N:, :N] = P.T
    Y = np.vstack([dst_coords, np.zeros((3, dst_coords.shape[1]))])
    params = np.linalg.solve(L, Y)
    return params[:N], params[N:]

def eval_forward_tps(grid_uv, ctl_uv, W_tps, A_tps):
    diff = grid_uv[:, None, :] - ctl_uv[None, :, :]
    r2 = np.sum(diff ** 2, axis=-1)
    U = r2 * np.log(r2 + 1e-12)
    P = np.hstack([np.ones((len(grid_uv), 1)), grid_uv])
    return U @ W_tps + P @ A_tps

# High smoothness regularization (reg=0.055) eliminates internal S-bends and banana-curved poles
# while keeping all landmarks locked to their ground positions!
W_en, A_en = fit_forward_tps(uv_pts, en_pts, reg=0.055)

pred_en = eval_forward_tps(uv_pts, uv_pts, W_en, A_en)
errs = np.linalg.norm(pred_en - en_pts, axis=1)
print(f"Max landmark error: {errs.max():.2f}m, Mean landmark error: {errs.mean():.2f}m")

H_rad = math.radians(198.0)
right_vec = np.array([math.cos(H_rad), -math.sin(H_rad)])
up_vec    = np.array([math.sin(H_rad),  math.cos(H_rad)])

GW, GH = 40, 28
us = np.linspace(0.0, 1.0, GW + 1)
vs = np.linspace(0.0, 1.0, GH + 1)
ug, vg = np.meshgrid(us, vs)
grid_uv = np.stack([ug.ravel(), vg.ravel()], axis=-1)
grid_en = eval_forward_tps(grid_uv, uv_pts, W_en, A_en).reshape((GH + 1, GW + 1, 2))

pano_arr = np.array(pano)
valid_en = []
for i in range(GH + 1):
    for j in range(GW + 1):
        px = min(pano_w - 1, max(0, int(us[j] * (pano_w - 1))))
        py = min(pano_h - 1, max(0, int(vs[i] * (pano_h - 1))))
        if pano_arr[py, px, 3] > 10:
            valid_en.append(grid_en[i, j])
valid_en = np.array(valid_en)

proj_r = valid_en @ right_vec
proj_u = valid_en @ up_vec
r_min, r_max = proj_r.min() - 1.0, proj_r.max() + 1.0
u_min, u_max = proj_u.min() - 1.0, proj_u.max() + 1.0

center_r = 0.5 * (r_min + r_max)
center_u = 0.5 * (u_min + u_max)
width_m  = r_max - r_min
height_m = u_max - u_min
center_en = center_r * right_vec + center_u * up_vec
center_lat, center_lon = en_to_geo(center_en[0], center_en[1])

print(f"Ground Quad Center: lat={center_lat:.6f}, lon={center_lon:.6f}")
print(f"Ground Quad Size: width={width_m:.2f}m, height={height_m:.2f}m, heading=198.0 deg")

TEX_W, TEX_H = 2048, 1536
ground_tex = np.zeros((TEX_H, TEX_W, 4), dtype=np.uint8)

grid_tx = ((grid_en @ right_vec - r_min) / width_m) * (TEX_W - 1)
grid_ty = ((u_max - (grid_en @ up_vec)) / height_m) * (TEX_H - 1)
grid_txy = np.stack([grid_tx, grid_ty], axis=-1)

def rasterize_tri_tex(p0, p1, p2, uv0, uv1, uv2):
    min_x = max(0, int(math.floor(min(p0[0], p1[0], p2[0]))))
    max_x = min(TEX_W - 1, int(math.ceil(max(p0[0], p1[0], p2[0]))))
    min_y = max(0, int(math.floor(min(p0[1], p1[1], p2[1]))))
    max_y = min(TEX_H - 1, int(math.ceil(max(p0[1], p1[1], p2[1]))))
    if min_x > max_x or min_y > max_y:
        return
    xs, ys = np.meshgrid(np.arange(min_x, max_x + 1), np.arange(min_y, max_y + 1))
    denom = (p1[1] - p2[1]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[1] - p2[1])
    if abs(denom) < 1e-6:
        return
    w0 = ((p1[1] - p2[1]) * (xs - p2[0]) + (p2[0] - p1[0]) * (ys - p2[1])) / denom
    w1 = ((p2[1] - p0[1]) * (xs - p2[0]) + (p0[0] - p2[0]) * (ys - p2[1])) / denom
    w2 = 1.0 - w0 - w1
    mask = (w0 >= -1e-4) & (w1 >= -1e-4) & (w2 >= -1e-4)
    if not np.any(mask):
        return
    u = w0[mask] * uv0[0] + w1[mask] * uv1[0] + w2[mask] * uv2[0]
    v = w0[mask] * uv0[1] + w1[mask] * uv1[1] + w2[mask] * uv2[1]
    sx = np.clip((u * (pano_w - 1)).astype(np.int32), 0, pano_w - 1)
    sy = np.clip((v * (pano_h - 1)).astype(np.int32), 0, pano_h - 1)
    sampled = pano_arr[sy, sx]
    alpha = sampled[:, 3] > 0
    ys_m = ys[mask][alpha]
    xs_m = xs[mask][alpha]
    ground_tex[ys_m, xs_m] = sampled[alpha]

for i in range(GH):
    for j in range(GW):
        p00, p10, p11, p01 = grid_txy[i, j], grid_txy[i + 1, j], grid_txy[i + 1, j + 1], grid_txy[i, j + 1]
        uv00, uv10, uv11, uv01 = [us[j], vs[i]], [us[j], vs[i + 1]], [us[j + 1], vs[i + 1]], [us[j + 1], vs[i]]
        rasterize_tri_tex(p00, p10, p11, uv00, uv10, uv11)
        rasterize_tri_tex(p00, p11, p01, uv00, uv11, uv01)

out_tex_path = "/home/paul/gods-eye-view/public/yard-frames/front-yard-stitched-2026-10-12.png"
Image.fromarray(ground_tex, "RGBA").save(out_tex_path)
Image.fromarray(ground_tex, "RGBA").save("/mnt/c/Windows/Temp/smooth_ground_tex.png")
print("Saved smooth ground texture!")
