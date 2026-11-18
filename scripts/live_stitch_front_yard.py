#!/usr/bin/env python3
"""Histogram-Matched, Glare-Dehazed, Warp-Free Front Yard Composite Stitcher.

Combines back-yard-cam1 (East RV/Van/Tesla/Bush) + wyze-cam-v4 (Front Solar Arch,
Palm Drive, Neighbor House) into ONE crisp, high-contrast planar-homography composite:
  1. Glare/haze black-point dehazing on wyze-cam-v4 (eliminating floodlight wash-out)
  2. Overlap-zone histogram & median color matching to Cam1's deep blacks & contrast
  3. 2-band Laplacian raised-cosine seam right of the sago bush (zero V-line, zero double Tesla)
  4. Pure 4-corner planar homography (100% straight road, arches, and rooflines)
"""
import io, urllib.request, pathlib
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance

W, H = 1600, 900
TEX_W, TEX_H = 2048, 1536

def fetch_frame(src, fallback_path=None):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:1984/api/frame.jpeg?src={src}", timeout=8) as r:
            return Image.open(io.BytesIO(r.read())).convert("RGBA").resize((W, H), Image.Resampling.LANCZOS)
    except Exception:
        if fallback_path and pathlib.Path(fallback_path).exists():
            return Image.open(fallback_path).convert("RGBA").resize((W, H), Image.Resampling.LANCZOS)
        raise

def dehaze_and_match_contrast(v4_img, ref_img):
    arr = np.array(v4_img, dtype=np.float32)
    ref = np.array(ref_img, dtype=np.float32)
    rgb = arr[:, :, :3]
    ref_rgb = ref[int(0.18*H):int(0.75*H), int(0.05*W):int(0.65*W), :3]

    small = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).resize((64, 36), Image.Resampling.BILINEAR)
    veil = np.array(small.filter(ImageFilter.GaussianBlur(radius=9)).resize((W, H), Image.Resampling.BILINEAR), dtype=np.float32)
    veil_excess = np.maximum(0.0, veil - 40.0)
    rgb = rgb - 0.38 * veil_excess

    for c in range(3):
        lo_v4, hi_v4 = np.percentile(rgb[int(0.25*H):, :, c], [5, 96])
        lo_ref, hi_ref = np.percentile(ref_rgb[:, :, c], [6, 97])
        lo_target = max(6.0, min(15.0, lo_ref * 0.85))
        hi_target = max(215.0, min(246.0, hi_ref * 1.04))
        scale = (hi_target - lo_target) / max(25.0, (hi_v4 - lo_v4))
        rgb[:, :, c] = (rgb[:, :, c] - lo_v4) * scale + lo_target

    norm = np.clip(rgb / 255.0, 0.0, 1.0)
    norm = np.power(norm, 1.09)
    s_curve = np.clip(0.5 + 1.14 * (norm - 0.5), 0.0, 1.0)
    out = Image.fromarray((s_curve * 255.0).astype(np.uint8), "RGB")
    out = ImageEnhance.Color(out).enhance(1.14)
    out = out.filter(ImageFilter.UnsharpMask(radius=1.4, percent=65, threshold=3))
    rgba = out.convert("RGBA")
    rgba.putalpha(v4_img.split()[3])
    return rgba

def crisp_enhance_cam1(c1_img):
    rgb = c1_img.convert("RGB")
    rgb = ImageEnhance.Contrast(rgb).enhance(1.12)
    rgb = ImageEnhance.Color(rgb).enhance(1.10)
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=1.2, percent=55, threshold=3))
    rgba = rgb.convert("RGBA")
    rgba.putalpha(c1_img.split()[3])
    return rgba

v4_raw = fetch_frame("wyze-cam-v4", "/home/paul/gods-eye-view/public/yard-frames/yard-overview-2026-10-12.png")
cam1_raw = fetch_frame("back-yard-cam1", "/home/paul/gods-eye-view/public/yard-frames/back-yard-cam1-2026-10-12.jpg")

cam1_orig = crisp_enhance_cam1(cam1_raw)
v4_orig = dehaze_and_match_contrast(v4_raw, cam1_orig)

src_cam1 = np.array([
    [0.120 * W, 0.250 * H],
    [0.260 * W, 0.240 * H],
    [0.280 * W, 0.450 * H],
    [0.200 * W, 0.120 * H],
    [0.500 * W, 0.130 * H],
    [0.760 * W, 0.155 * H],
    [0.835 * W, 0.125 * H],
    [0.700 * W, 0.225 * H],
    [0.680 * W, 0.580 * H],
    [0.950 * W, 0.480 * H],
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
T_shift = np.array([[1, 0, min_x], [0, 1, min_y], [0, 0, 1]], dtype=np.float64)
M_inv = np.linalg.inv(M) @ T_shift

cam1_warped = cam1_orig.transform(
    (pano_w, pano_h), Image.Transform.AFFINE, M_inv[:2, :].flatten().tolist(), resample=Image.Resampling.BICUBIC
)
v4_canvas = Image.new("RGBA", (pano_w, pano_h), (0, 0, 0, 0))
v4_canvas.paste(v4_orig, (-min_x, -min_y))

c1_np = np.array(cam1_warped, dtype=np.float32)
v4_np = np.array(v4_canvas, dtype=np.float32)
c1_valid = c1_np[:, :, 3] > 220
v4_valid = v4_np[:, :, 3] > 220
overlap = c1_valid & v4_valid

if np.any(overlap):
    for c in range(3):
        diff = np.median(c1_np[overlap, c] - v4_np[overlap, c])
        v4_np[:, :, c] = np.clip(v4_np[:, :, c] + 0.65 * diff, 0, 255)

xx, yy = np.meshgrid(np.arange(pano_w, dtype=np.float32), np.arange(pano_h, dtype=np.float32))
seam_x = 468.0 + 0.04 * (yy - 600.0)
w_v4_hi = 0.5 * (1.0 + np.sin(np.clip((xx - seam_x) / 26.0, -1.0, 1.0) * (np.pi / 2.0)))
w_v4_lo = 0.5 * (1.0 + np.sin(np.clip((xx - seam_x) / 105.0, -1.0, 1.0) * (np.pi / 2.0)))
w_v4_hi = np.where(c1_valid & ~v4_valid, 0.0, np.where(v4_valid & ~c1_valid, 1.0, w_v4_hi))
w_v4_lo = np.where(c1_valid & ~v4_valid, 0.0, np.where(v4_valid & ~c1_valid, 1.0, w_v4_lo))

c1_low = np.array(Image.fromarray(np.clip(c1_np[:,:,:3],0,255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(14)), dtype=np.float32)
v4_low = np.array(Image.fromarray(np.clip(v4_np[:,:,:3],0,255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(14)), dtype=np.float32)
c1_high = c1_np[:, :, :3] - c1_low
v4_high = v4_np[:, :, :3] - v4_low

comp_rgb = np.clip(
    c1_low * (1.0 - w_v4_lo[:, :, None]) + v4_low * w_v4_lo[:, :, None] +
    c1_high * (1.0 - w_v4_hi[:, :, None]) + v4_high * w_v4_hi[:, :, None],
    0, 255
).astype(np.uint8)
comp_alpha = np.where(c1_valid | v4_valid, 255, 0).astype(np.uint8)
pano = Image.fromarray(np.dstack([comp_rgb, comp_alpha]), "RGBA")

def solve_persp_coeffs(dst_pts, src_pts):
    matrix = []
    for (dx, dy), (sx, sy) in zip(dst_pts, src_pts):
        matrix.append([dx, dy, 1, 0, 0, 0, -sx * dx, -sx * dy])
        matrix.append([0, 0, 0, dx, dy, 1, -sy * dx, -sy * dy])
    A = np.array(matrix, dtype=np.float64)
    B = np.array(src_pts, dtype=np.float64).reshape(8)
    return np.linalg.solve(A, B).tolist()

dst_quad = [(0, 0), (TEX_W, 0), (TEX_W, TEX_H), (0, TEX_H)]
src_quad = [
    (235, 595),
    (1680, 295),
    (1960, 930),
    (55, 1085),
]
coeffs = solve_persp_coeffs(dst_quad, src_quad)
ground_clean = pano.transform((TEX_W, TEX_H), Image.Transform.PERSPECTIVE, coeffs, resample=Image.Resampling.BICUBIC)

gc_np = np.array(ground_clean)
ey = np.minimum(np.arange(TEX_H), TEX_H - 1 - np.arange(TEX_H)) / 28.0
ex = np.minimum(np.arange(TEX_W), TEX_W - 1 - np.arange(TEX_W)) / 28.0
border_fade = np.clip(np.minimum(ey[:, None], ex[None, :]), 0.0, 1.0)
gc_np[:, :, 3] = (gc_np[:, :, 3].astype(np.float32) * border_fade).astype(np.uint8)
ground_clean = Image.fromarray(gc_np, "RGBA")

out_live = pathlib.Path("/home/paul/gods-eye-view/public/yard-frames/front-yard-stitched-live.png")
out_legacy = pathlib.Path("/home/paul/gods-eye-view/public/yard-frames/front-yard-stitched-2026-10-12.png")
pano_preview = pathlib.Path("/home/paul/gods-eye-view/public/yard-frames/front-yard-pano-preview.png")

ground_clean.save(out_live)
ground_clean.save(out_legacy)
pano.save(pano_preview)
print("HISTOGRAM-MATCHED LAPLACIAN COMPOSITE SAVED:", out_live.stat().st_size, "bytes")