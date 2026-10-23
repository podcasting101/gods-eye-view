import numpy as np
from PIL import Image

v4_orig = Image.open("/mnt/c/Users/paul/.gemini/antigravity/brain/f6e4fae7-0156-49f2-965c-ddeca6784f2d/scratch/yard-overview-2026-10-12.png").convert("RGBA")
W, H = 1600, 900
v4 = v4_orig.resize((W, H), Image.Resampling.LANCZOS)

# In 9a23cc94.png (930 x 750), the V4 quad has corners:
# TL(184, 30), TR(786, 98), BR(753, 409), BL(171, 311)
# Notice that on the right edge of V4 (TR to BR: x from 786 to 753, y from 98 to 409):
# - The satellite road exits the right edge at y = 212 -> v_dst = (212 - 98) / (409 - 98) = 114 / 311 = 0.367!
# - The neighbor's oak tree on the satellite map is right below the road on the right at y = 265..295 -> v_dst = (275 - 98) / 311 = 0.569!
# - On the left edge of V4 (TL to BL: x from 184 to 171, y from 30 to 311):
#   The satellite road enters the left edge at y = 278 -> v_dst = (278 - 30) / (311 - 30) = 248 / 281 = 0.882!

ctrl_pairs = [
    # Top boundary pins
    ((0.00, 0.00), (0.00, 0.00)),
    ((0.35, 0.00), (0.35, 0.00)),
    ((0.70, 0.00), (0.70, 0.00)),
    ((1.00, 0.00), (1.00, 0.00)),
    # Left boundary pins
    ((0.00, 0.40), (0.00, 0.40)),
    ((0.00, 0.82), (0.00, 0.86)),
    ((0.00, 1.00), (0.00, 1.00)),
    # Bottom boundary pins
    ((0.30, 1.00), (0.30, 1.00)),
    ((0.60, 1.00), (0.60, 1.00)),
    ((1.00, 1.00), (1.00, 1.00)),
    # House across the pond / street (already aligned in 9a23cc94.png!)
    ((0.20, 0.42), (0.20, 0.42)),
    ((0.35, 0.40), (0.35, 0.40)),
    ((0.47, 0.43), (0.47, 0.43)),
    # Palm Drive road: enters left at v=0.86, exits right at v=0.37 (matching satellite road on both ends!)
    ((0.05, 0.80), (0.05, 0.85)),
    ((0.38, 0.64), (0.38, 0.65)),
    ((0.68, 0.46), (0.68, 0.49)),
    ((0.84, 0.35), (0.85, 0.41)),
    ((0.96, 0.28), (0.97, 0.37)),
    # Neighbor's oak tree on right: pulled down below the road (v=0.55) to sit on the satellite tree!
    ((0.91, 0.22), (0.92, 0.38)),
    ((0.91, 0.40), (0.91, 0.55)),
    ((1.00, 0.40), (1.00, 0.55)),
    # Utility pole, Little yellow pump house, White dome, Beaver solar arch
    ((0.785, 0.60), (0.77, 0.66)),
    ((0.875, 0.63), (0.86, 0.72)),
    ((0.96, 0.70), (0.96, 0.78)),
    ((0.56, 0.68), (0.55, 0.71)),
    ((0.20, 0.80), (0.21, 0.82)),
]

src_uv = np.array([[u * W, v * H] for (u, v), _ in ctrl_pairs], dtype=np.float64)
dst_uv = np.array([[u * W, v * H] for _, (u, v) in ctrl_pairs], dtype=np.float64)

def fit_tps(dst_xy, src_xy, reg=12.0):
    N = len(dst_xy)
    diff = dst_xy[:, None, :] - dst_xy[None, :, :]
    r2 = np.sum(diff ** 2, axis=-1)
    K = r2 * np.log(r2 + 1e-12) + np.eye(N) * reg
    P = np.hstack([np.ones((N, 1)), dst_xy])
    L = np.zeros((N + 3, N + 3), dtype=np.float64)
    L[:N, :N] = K
    L[:N, N:] = P
    L[N:, :N] = P.T
    Y = np.vstack([src_xy, np.zeros((3, 2))])
    params = np.linalg.solve(L, Y)
    return params[:N], params[N:]

def eval_tps(grid_xy, ctl_xy, W_tps, A_tps):
    diff = grid_xy[:, None, :] - ctl_xy[None, :, :]
    r2 = np.sum(diff ** 2, axis=-1)
    U = r2 * np.log(r2 + 1e-12)
    P = np.hstack([np.ones((len(grid_xy), 1)), grid_xy])
    return U @ W_tps + P @ A_tps

def bilinear_sample(img_arr, sx, sy):
    H_s, W_s, C = img_arr.shape
    sx_c = np.clip(sx, 0, W_s - 1.001)
    sy_c = np.clip(sy, 0, H_s - 1.001)
    x0 = np.floor(sx_c).astype(np.int32)
    y0 = np.floor(sy_c).astype(np.int32)
    x1 = x0 + 1
    y1 = y0 + 1
    wx = (sx_c - x0)[:, None]
    wy = (sy_c - y0)[:, None]
    c00 = img_arr[y0, x0].astype(np.float32)
    c10 = img_arr[y0, x1].astype(np.float32)
    c01 = img_arr[y1, x0].astype(np.float32)
    c11 = img_arr[y1, x1].astype(np.float32)
    out = (1 - wx) * (1 - wy) * c00 + wx * (1 - wy) * c10 + (1 - wx) * wy * c01 + wx * wy * c11
    return np.clip(out, 0, 255).astype(np.uint8)

W_tps, A_tps = fit_tps(dst_uv, src_uv, reg=12.0)

gw, gh = 400, 225
gx, gy = np.meshgrid(np.linspace(0, W - 1, gw), np.linspace(0, H - 1, gh))
grid_pts = np.stack([gx.ravel(), gy.ravel()], axis=-1)
mapped_low = eval_tps(grid_pts, dst_uv, W_tps, A_tps).reshape((gh, gw, 2))

sx_full = np.array(Image.fromarray(mapped_low[:, :, 0].astype(np.float32)).resize((W, H), Image.Resampling.BILINEAR))
sy_full = np.array(Image.fromarray(mapped_low[:, :, 1].astype(np.float32)).resize((W, H), Image.Resampling.BILINEAR))

v4_warped_arr = bilinear_sample(np.array(v4), sx_full.ravel(), sy_full.ravel()).reshape((H, W, 4))
v4_warped = Image.fromarray(v4_warped_arr, "RGBA")

# Now stitch Cam1 onto the left of `v4_warped` so that:
# - Cam1's RV (u=0.12, v=0.25) lands directly on the white RV in 9a23cc94.png (which in V4 UV space is u = -0.15, v = 1.15)!
# - Cam1's Red Van (u=0.26, v=0.24) and White Tesla (u=0.28, v=0.45) land on the driveway at u = -0.09, v = 1.13 and u = -0.07, v = 1.25!
# - Cam1's road (u=0.15..0.76, v=0.12..0.155) runs along u = -0.18..+0.08, v = 0.94..0.84 (right on top of the left satellite road!)
# - Cam1's Beaver solar arch (u=0.835, v=0.125 and u=0.70, v=0.225) stitches into V4's solar arch at u = 0.19, v = 0.73 and u = 0.10, v = 0.88!
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

dst_v4_rect = np.array([
    [-0.145 * W, 1.120 * H], # Directly on top of white RV on satellite map!
    [-0.085 * W, 1.100 * H], # Red van next to RV
    [-0.065 * W, 1.220 * H], # White Tesla in driveway
    [-0.150 * W, 0.940 * H], # Satellite road on left
    [-0.030 * W, 0.895 * H], # Satellite road at sago palm
    [ 0.095 * W, 0.835 * H], # Road at solar arch
    [ 0.195 * W, 0.725 * H], # Curved solar arch peak
    [ 0.105 * W, 0.880 * H], # Flat solar wing top-left
    [ 0.075 * W, 1.040 * H], # Flat solar wing bottom-left
    [ 0.310 * W, 0.990 * H], # Curved solar arch bottom-right
], dtype=np.float64)

X_c1 = np.hstack([src_cam1, np.ones((len(src_cam1), 1))])
M_aff, _, _, _ = np.linalg.lstsq(X_c1, dst_v4_rect, rcond=None)
M = np.vstack([M_aff.T, [0, 0, 1]])

c1_corners = np.array([[0, 0, 1], [W, 0, 1], [W, H, 1], [0, H, 1]], dtype=np.float64) @ M_aff
v4_corners = np.array([[0, 0], [W, 0], [W, H], [0, H]], dtype=np.float64)
all_corners = np.vstack([c1_corners, v4_corners])
min_x, min_y = np.floor(all_corners.min(axis=0)).astype(int)
max_x, max_y = np.ceil(all_corners.max(axis=0)).astype(int)
pano_w = max_x - min_x
pano_h = max_y - min_y

pano = Image.new("RGBA", (pano_w, pano_h), (0, 0, 0, 0))
T_shift = np.array([[1, 0, min_x], [0, 1, min_y], [0, 0, 1]], dtype=np.float64)
M_inv = np.linalg.inv(M) @ T_shift
cam1_warped = cam1_orig.transform((pano_w, pano_h), Image.Transform.AFFINE, M_inv[:2, :].flatten().tolist(), resample=Image.Resampling.BICUBIC)
pano.alpha_composite(cam1_warped, (0, 0))

v4_arr = v4_warped_arr.copy()
v4_arr[:4, :, 3] = 0
v4_arr[-4:, :, 3] = 0
v4_arr[:, -4:, 3] = 0
alpha = v4_arr[:, :, 3].astype(np.float32)
ramp_x = np.clip(np.arange(W) / 95.0, 0.0, 1.0)
ramp_y = np.clip((H - 1 - np.arange(H)) / 85.0, 0.0, 1.0)
weight_2d = np.ones((H, W), dtype=np.float32) * ramp_x[None, :]
left_mask = np.clip((0.35 * W - np.arange(W)) / (0.08 * W), 0.0, 1.0)
bottom_feather = 1.0 - left_mask[None, :] * (1.0 - ramp_y[:, None])
weight_2d *= bottom_feather
v4_arr[:, :, 3] = (alpha * weight_2d).astype(np.uint8)
pano.alpha_composite(Image.fromarray(v4_arr, "RGBA"), (-min_x, -min_y))

v4_warped.save("/home/paul/gods-eye-view/public/yard-frames/yard-overview-2026-10-12.png")
pano.save("/home/paul/gods-eye-view/public/yard-frames/front-yard-stitched-2026-10-12.png")
pano.resize((1400, int(1400 * pano_h / pano_w)), Image.Resampling.LANCZOS).save("/mnt/c/Windows/Temp/stitched_rectified_preview.png")

shot = Image.open("/mnt/c/Users/paul/.gemini/antigravity/brain/f6e4fae7-0156-49f2-965c-ddeca6784f2d/.user_uploaded/media_1792780895151_9a23cc94.png").convert("RGBA")
v4_in_pano = np.array([
    [-min_x, -min_y, 1.0],
    [-min_x + W, -min_y, 1.0],
    [-min_x + W, -min_y + H, 1.0],
    [-min_x, -min_y + H, 1.0],
], dtype=np.float64)
quad_in_shot = np.array([
    [184.0, 30.0],
    [786.0, 98.0],
    [753.0, 409.0],
    [171.0, 311.0],
], dtype=np.float64)

M_p2s_aff, _, _, _ = np.linalg.lstsq(v4_in_pano, quad_in_shot, rcond=None)
M_p2s = np.vstack([M_p2s_aff.T, [0, 0, 1]])
M_s2p = np.linalg.inv(M_p2s)

pano_on_shot = pano.transform(shot.size, Image.Transform.AFFINE, M_s2p[:2, :].flatten().tolist(), resample=Image.Resampling.BICUBIC)
comp = shot.copy()
comp.alpha_composite(pano_on_shot, (0, 0))
comp.save("/mnt/c/Windows/Temp/shot_with_rectified_stitch.png")
print("Saved updated shot_with_rectified_stitch.png! pano:", pano_w, "x", pano_h, "min_x:", min_x, "min_y:", min_y)
