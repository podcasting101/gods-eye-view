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
cam1_warped = cam1_orig.transform((pano_w, pano_h), Image.Transform.AFFINE, M_inv[:2, :].flatten().tolist(), resample=Image.Resampling.BICUBIC)
pano.alpha_composite(cam1_warped, (0, 0))

v4_arr = np.array(v4_orig)
v4_arr[:4, :, 3] = 0; v4_arr[-4:, :, 3] = 0; v4_arr[:, -4:, 3] = 0
alpha = v4_arr[:, :, 3].astype(np.float32)
# Softly trim the top 14% of empty sky above the clouds/horizon so the top edge hugs the clouds above Arrow 1 cleanly:
sky_trim = np.clip((np.arange(H) - 0.12 * H) / (0.05 * H), 0.0, 1.0)
ramp_x = np.clip(np.arange(W) / 95.0, 0.0, 1.0)
ramp_y = np.clip((H - 1 - np.arange(H)) / 85.0, 0.0, 1.0)
weight_2d = (sky_trim[:, None] * ramp_x[None, :]).astype(np.float32)
left_mask = np.clip((0.35 * W - np.arange(W)) / (0.08 * W), 0.0, 1.0)
weight_2d *= (1.0 - left_mask[None, :] * (1.0 - ramp_y[:, None]))
v4_arr[:, :, 3] = (alpha * weight_2d).astype(np.uint8)
pano.alpha_composite(Image.fromarray(v4_arr, "RGBA"), (-min_x, -min_y))

def v4_uv(u, v):
    return (u * W - min_x) / pano_w, (v * H - min_y) / pano_h

def c1_uv(u, v):
    pt = np.array([u * W, v * H, 1.0]) @ M_aff
    return (pt[0] - min_x) / pano_w, (pt[1] - min_y) / pano_h

# 2. Let's look directly at `media_1792811358196_85476bb2.jpg` (1024 x 565) where Paul drew the two cyan arrows:
# In `85476bb2.jpg`:
# - Arrow 1 tip points to the House Across the Street/Pond on the satellite map: pixel (505, 118), which is at (lat=29.24710, lon=-95.23163)
# - Concrete driveway of that house on the satellite map: pixel (595, 195), which is at (lat=29.24726, lon=-95.23164)
# - Palm Drive West road (below VEH-1443): pixel (830, 235), which is at (lat=29.24741, lon=-95.23176)
# - Palm Drive East road (above White RV): pixel (255, 415), which is at (lat=29.24735, lon=-95.23134)
# - White RV in East driveway: pixel (325, 465), which is at (lat=29.24745, lon=-95.23131)
# - Neighbor's Oak Tree on West lawn: pixel (895, 365), which is at (lat=29.24750, lon=-95.23175)
# - Little Yellow Pump House on West lawn: pixel (835, 435), which is at (lat=29.24754, lon=-95.23165)
# - Yellow House SW Front Wall Edge: pixel (575, 495), which is at (lat=29.24754, lon=-95.23143)
#
# Notice that if we keep the top sky line (`Sky TL`, `Sky TM`, `Sky TR`) straight and collinear along the far edge
# behind the House Across the Street (`29.24702, -95.23148` to `29.24718, -95.23185`), the top edge of the photo stays
# 100% STRAIGHT (like the original photo in `85476bb2.jpg`!), while stretching the upper half of the photo right up
# along Paul's cyan arrow so Arrow 2 (the Blue House in the photo) lands DEAD CENTER on Arrow 1!

pins_geo = [
    # Straight, collinear top sky edge HIGH ABOVE Arrow 1 (so the sky sits above the Blue House, and the Blue House at v=0.38 sits DEAD CENTER on Arrow 1!):
    ("Sky TL",                   *v4_uv(0.02, 0.12), 29.24685, -95.23148),
    ("Sky TM1",                  *v4_uv(0.35, 0.12), 29.24690, -95.23163),
    ("Sky TM2",                  *v4_uv(0.68, 0.12), 29.24702, -95.23178),
    ("Sky TR",                   *v4_uv(0.98, 0.12), 29.24718, -95.23194),

    # Across the street / pond (Arrow 2 -> Arrow 1 at 29.24707, -95.23163!):
    ("White house far SSW",      *v4_uv(0.18, 0.42), 29.24706, -95.23151),
    ("Blue house across pond",   *v4_uv(0.38, 0.38), 29.24707, -95.23163),
    ("Blue house roof peak",     *v4_uv(0.38, 0.31), 29.24701, -95.23163),
    ("Driveway across street",   *v4_uv(0.56, 0.45), 29.24724, -95.23165),
    ("Trees across street W",    *v4_uv(0.78, 0.30), 29.24725, -95.23182),

    # Palm Drive road (straight, continuous diagonal from East RV to West exit at VEH-1443):
    ("Palm Dr road East (RV)",   *c1_uv(0.20, 0.12), 29.24735, -95.23134),
    ("Palm Dr road at Sago",     *c1_uv(0.50, 0.13), 29.24736, -95.23141),
    ("Palm Dr road at Arch",     *v4_uv(0.12, 0.77), 29.24737, -95.23148),
    ("Palm Dr road mid-yard",    *v4_uv(0.45, 0.58), 29.24739, -95.23159),
    ("Palm Dr road at Pole",     *v4_uv(0.68, 0.45), 29.24741, -95.23169),
    ("Palm Dr road West exit",   *v4_uv(0.95, 0.28), 29.24743, -95.23184),

    # Three Yard Landmarks (using their GROUND bases) + Yellow House SW Front Wall Edge:
    ("Neighbor's oak tree base", *v4_uv(0.92, 0.48), 29.24752, -95.23182),
    ("Little yellow pump house", *v4_uv(0.875, 0.65), 29.24755, -95.23171),
    ("Bottom-right V4 lawn",     *v4_uv(0.98, 0.96), 29.24760, -95.23168),
    ("Utility pole base",        *v4_uv(0.785, 0.60), 29.24749, -95.23165),
    ("White dome ground base",   *v4_uv(0.58, 0.80), 29.24750, -95.23155),
    ("Yellow house W wall edge", *v4_uv(0.52, 0.98), 29.24754, -95.23148),
    ("Solar arch ground base",   *v4_uv(0.22, 0.94), 29.24749, -95.23146),
    ("Yellow house S wall edge", *v4_uv(0.12, 0.98), 29.24752, -95.23142),

    # East Driveway Vehicles (Cam1): pinned directly over the White RV & East driveway!
    ("Sago palm front yard",     *c1_uv(0.46, 0.24), 29.24742, -95.23142),
    ("White RV in driveway",     *c1_uv(0.12, 0.25), 29.24745, -95.23131),
    ("Red Van in driveway",      *c1_uv(0.26, 0.24), 29.24745, -95.23135),
    ("White Tesla in driveway",  *c1_uv(0.28, 0.45), 29.24750, -95.23136),
    ("Cam1 bottom-left (RV S)",  *c1_uv(0.05, 0.75), 29.24752, -95.23130),
    ("Cam1 bottom-right (lawn)", *c1_uv(0.45, 0.85), 29.24754, -95.23139),
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

def fit_forward_tps(src_uv, dst_coords, reg=0.018):
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

W_en, A_en = fit_forward_tps(uv_pts, en_pts, reg=0.006)

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

# Render verification on `85476bb2.jpg` (Paul's two-arrow screenshot):
shot_arrows = Image.open("/mnt/c/Users/paul/.gemini/antigravity/brain/f6e4fae7-0156-49f2-965c-ddeca6784f2d/.user_uploaded/media_1792811358196_85476bb2.jpg").convert("RGBA")
AW, AH = shot_arrows.size

cal_pts = [
    (29.24711, -95.23163, 515, 128), # Arrow 1: House across the pond tan roof center!
    (29.24726, -95.23164, 595, 195), # Concrete pad / driveway by house across pond
    (29.24741, -95.23176, 845, 240), # VEH-1443 on Palm Drive West
    (29.24735, -95.23128, 125, 485), # Palm Drive East near bottom-left target reticle
    (29.24745, -95.23131, 325, 465), # White RV on satellite map
    (29.24758, -95.23139, 605, 535), # Yellow House roof on satellite map (bottom center)
]

def solve_homography(src, dst):
    A = []
    for (x, y), (u, v) in zip(src, dst):
        A.append([-x, -y, -1, 0, 0, 0, u * x, u * y, u])
        A.append([0, 0, 0, -x, -y, -1, v * x, v * y, v])
    _, _, Vt = np.linalg.svd(np.array(A, dtype=np.float64))
    H_mat = Vt[-1].reshape(3, 3)
    return H_mat / H_mat[2, 2]

src_en_cal = np.array([geo_to_en(lat, lon) for lat, lon, _, _ in cal_pts], dtype=np.float64)
dst_px_cal = np.array([[x, y] for _, _, x, y in cal_pts], dtype=np.float64)
H_en_to_854 = solve_homography(src_en_cal, dst_px_cal)

quad_corners_en = np.array([
    r_min * right_vec + u_min * up_vec,
    r_max * right_vec + u_min * up_vec,
    r_max * right_vec + u_max * up_vec,
    r_min * right_vec + u_max * up_vec,
], dtype=np.float64)

quad_corners_h = np.hstack([quad_corners_en, np.ones((4, 1))]) @ H_en_to_854.T
quad_corners_px = quad_corners_h[:, :2] / quad_corners_h[:, 2:3]

tex_corners = np.array([
    [0, TEX_H],
    [TEX_W, TEX_H],
    [TEX_W, 0],
    [0, 0],
], dtype=np.float64)

H_854_to_tex = solve_homography(quad_corners_px, tex_corners)
warped_on_854 = Image.fromarray(ground_tex, "RGBA").transform(
    (AW, AH),
    Image.Transform.PERSPECTIVE,
    H_854_to_tex.flatten()[:8].tolist(),
    resample=Image.Resampling.BICUBIC,
)

comp_854 = shot_arrows.copy()
comp_854.alpha_composite(warped_on_854, (0, 0))
draw = ImageDraw.Draw(comp_854)

for name, u, v, lat, lon in pins_geo:
    en = np.array([*geo_to_en(lat, lon), 1.0])
    p_h = en @ H_en_to_854.T
    px, py = p_h[0] / p_h[2], p_h[1] / p_h[2]
    if 0 <= px < AW and 0 <= py < AH:
        draw.ellipse([px - 4, py - 4, px + 4, py + 4], fill=(0, 255, 180, 255), outline=(0, 0, 0, 255), width=2)

comp_854.save("/mnt/c/Windows/Temp/ground_pinned_on_85476bb2.png")
print("Updated /mnt/c/Windows/Temp/ground_pinned_on_85476bb2.png")
