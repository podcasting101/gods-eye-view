import math
import numpy as np
from PIL import Image, ImageDraw

# 1. Load Paul's screenshot `8b787dab.jpg` (1024 x 737):
shot = Image.open("/mnt/c/Users/paul/.gemini/antigravity/brain/f6e4fae7-0156-49f2-965c-ddeca6784f2d/.user_uploaded/media_1792858935960_8b787dab.jpg").convert("RGBA")
SW, SH = shot.size

# 2. Build the Clean Stitched Panorama in camera perspective space first (clean V4 + aligned Cam1):
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
sky_trim = np.clip((np.arange(H) - 0.08 * H) / (0.05 * H), 0.0, 1.0)
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

# 3. Measure the exact 4 cyan corners of Paul's frame in `8b787dab.jpg`:
#    TL = (430, 226) -> tex (0, 0)
#    TR = (765, 219) -> tex (TEX_W, 0)
#    BR = (833, 500) -> tex (TEX_W, TEX_H)
#    BL = (331, 521) -> tex (0, TEX_H)
TEX_W, TEX_H = 2048, 1536

def solve_homography(src, dst):
    A = []
    for (x, y), (u, v) in zip(src, dst):
        A.append([-x, -y, -1, 0, 0, 0, u * x, u * y, u])
        A.append([0, 0, 0, -x, -y, -1, v * x, v * y, v])
    _, _, Vt = np.linalg.svd(np.array(A, dtype=np.float64))
    H_mat = Vt[-1].reshape(3, 3)
    return H_mat / H_mat[2, 2]

cyan_screen = np.array([
    [430.0, 226.0], # TL
    [765.0, 219.0], # TR
    [833.0, 500.0], # BR
    [331.0, 521.0], # BL
], dtype=np.float64)

tex_rect = np.array([
    [0.0,   0.0],   # TL
    [TEX_W, 0.0],   # TR
    [TEX_W, TEX_H], # BR
    [0.0,   TEX_H], # BL
], dtype=np.float64)

H_screen_to_tex = solve_homography(cyan_screen, tex_rect)
H_tex_to_screen = solve_homography(tex_rect, cyan_screen)

def screen_to_txy(x, y):
    p = np.array([x, y, 1.0]) @ H_screen_to_tex.T
    return p[0] / p[2], p[1] / p[2]

# 4. Now let's map each landmark in our stitched photo `(u_pano, v_pano)` to its EXACT satellite screen pixel `(x, y)`
#    visible inside Paul's cyan box in `8b787dab.jpg`!
#    Look at `grid_8b787dab.png`:
#    - Left side (Original driveway & RVs):
#      * Satellite White RV on left edge of original driveway: (382, 465)
#      * Satellite Red Van spot next to RV:                    (418, 462)
#      * Satellite White Tesla at edge of original driveway:   (442, 488)
#      * Sago palm north of driveway:                          (468, 438)
#      * Monaco Beaver (under solar arch, next to driveway):   (540, 462)
#      * White Dome trailer (in center of yard):               (635, 445)
#      * Bottom edge at Yellow House SW wall:                  (535, 505) and (650, 500)
#    - Right side (Paul's 3 key landmarks!):
#      * 1. Culvert in neighbor's yard (end of neighbor's driveway at Palm Dr): (718, 356)
#      *    Neighbor's house across the street (tan roof):                      (672, 278)
#      * 2. Telephone pole (base on south side of Palm Dr near culvert):        (745, 412)
#      *    Telephone pole upper shaft (standing straight!):                    (735, 255)
#      * 3. Little yellow pump house (in west yard):                            (778, 448)
#      *    Ground solar panel next to pump house:                              (795, 468)
#      *    Neighbor's oak tree on right:                                       (788, 382)
#    - Palm Drive road (straight line across the yard from left to right):
#      * Road far left (above White RV):    (360, 418)
#      * Road at Sago palm:                 (455, 404)
#      * Road at Solar arch:                (535, 390)
#      * Road mid-yard:                     (625, 374)
#      * Road at Culvert / Pole:            (722, 358)
#      * Road far right exit:               (788, 345)

pins_screen = [
    # Top sky edge along the top of the cyan box:
    ("Sky TL",                   *v4_uv(0.02, 0.08), 445, 232),
    ("Sky TM1",                  *v4_uv(0.38, 0.08), 585, 228),
    ("Sky TM2",                  *v4_uv(0.70, 0.08), 685, 224),
    ("Sky TR",                   *v4_uv(0.98, 0.08), 762, 222),

    # Across the street: Neighbor's house + Culvert in the neighbor's yard!
    ("White house far SSW",      *v4_uv(0.18, 0.40), 555, 295),
    ("Blue house across pond",   *v4_uv(0.38, 0.36), 655, 282),
    ("Culvert in neighbor yard", *v4_uv(0.60, 0.44), 718, 355),
    ("Trees across street W",    *v4_uv(0.80, 0.28), 748, 292),

    # Palm Drive road (straight line from left to right):
    ("Palm Dr road East (RV)",   *c1_uv(0.15, 0.12), 360, 418),
    ("Palm Dr road at Sago",     *c1_uv(0.50, 0.13), 452, 404),
    ("Palm Dr road at Arch",     *v4_uv(0.12, 0.754), 525, 392),
    ("Palm Dr road mid-yard",    *v4_uv(0.42, 0.590), 625, 374),
    ("Palm Dr road at Pole",     *v4_uv(0.70, 0.437), 725, 358),
    ("Palm Dr road West exit",   *v4_uv(0.95, 0.300), 788, 345),

    # Paul's 3 right-side & yard landmarks (Telephone pole, Little yellow pump house, Oak tree, Monaco Beaver):
    ("Neighbor's oak tree base", *v4_uv(0.92, 0.48), 790, 385),
    ("Telephone pole upper",     *v4_uv(0.75, 0.16), 735, 250),
    ("Telephone pole base",      *v4_uv(0.785, 0.60), 745, 412),
    ("Little yellow pump house", *v4_uv(0.875, 0.65), 778, 448),
    ("Bottom-right V4 lawn",     *v4_uv(0.96, 0.92), 815, 488),
    ("White dome ground base",   *v4_uv(0.56, 0.76), 642, 442),
    ("Yellow house W wall edge", *v4_uv(0.52, 0.98), 645, 502),
    ("Monaco Beaver solar arch", *v4_uv(0.22, 0.85), 535, 462),
    ("Yellow house S wall edge", *v4_uv(0.12, 0.98), 525, 508),

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

def fit_forward_tps(src_uv, dst_coords, reg=0.022):
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

W_txy, A_txy = fit_forward_tps(uv_pts, txy_pts, reg=0.018)

GW, GH = 44, 30
us = np.linspace(0.0, 1.0, GW + 1)
vs = np.linspace(0.0, 1.0, GH + 1)
ug, vg = np.meshgrid(us, vs)
grid_uv = np.stack([ug.ravel(), vg.ravel()], axis=-1)
grid_txy = eval_forward_tps(grid_uv, uv_pts, W_txy, A_txy).reshape((GH + 1, GW + 1, 2))

ground_tex = np.zeros((TEX_H, TEX_W, 4), dtype=np.uint8)
pano_arr = np.array(pano)

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

# 5. Project this new texture back onto `8b787dab.jpg` inside the EXACT cyan box and save a verification preview!
H_screen_to_tex_persp = solve_homography(cyan_screen, tex_rect)
warped_on_shot = Image.fromarray(ground_tex, "RGBA").transform(
    (SW, SH),
    Image.Transform.PERSPECTIVE,
    H_screen_to_tex_persp.flatten()[:8].tolist(),
    resample=Image.Resampling.BICUBIC,
)

comp = shot.copy()
comp.alpha_composite(warped_on_shot, (0, 0))
draw = ImageDraw.Draw(comp)
# Re-draw the cyan outline and highlight the key pins (Culvert, Telephone Pole, Little Yellow Pump House, RV/Van/Tesla, Monaco Beaver):
cyan_loop = [tuple(pt) for pt in cyan_screen] + [tuple(cyan_screen[0])]
draw.line(cyan_loop, fill=(0, 212, 255, 255), width=3)

for name, u, v, x, y in pins_screen:
    tx, ty = eval_forward_tps(np.array([[u, v]]), uv_pts, W_txy, A_txy)[0]
    p_s = np.array([tx, ty, 1.0]) @ H_tex_to_screen.T
    px, py = p_s[0] / p_s[2], p_s[1] / p_s[2]
    draw.ellipse([px - 4, py - 4, px + 4, py + 4], fill=(0, 255, 180, 255), outline=(0, 0, 0, 255), width=2)

comp.save("/mnt/c/Windows/Temp/verified_on_8b787dab.png")
print("Saved /mnt/c/Windows/Temp/verified_on_8b787dab.png!")
