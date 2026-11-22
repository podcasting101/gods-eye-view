#!/usr/bin/env python3
"""
Semantic Segmentation + Landmark-Aligned Ground Projection for Back Yard Cam1.

Fits a primary projective ground homography plus gentle TPS residual over surveyed
Palm Drive & front-yard landmarks, hard-clips strictly at Palm Drive's far (South) curb
(alpha=0 over 3v3 stadium), masks out the tall 3D White Monaco RV wall/roof pixels so
there is zero duplicate ghost RV wing on the road beside the real 3D Monaco RV model,
and generates both the RGBA texture and a Hero Tripod visual composite.
"""

import json
import math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy.interpolate import RBFInterpolator
from scipy.ndimage import gaussian_filter

SRC_IMG = Path("/home/paul/gods-eye-view/public/yard-frames/back-yard-cam1-2026-10-12.jpg")
OUT_PNG = Path("/home/paul/gods-eye-view/public/yard-frames/back-yard-cam1-warped-2026-11-22.png")
PROJ_JSON = Path("/mnt/c/Users/paul/.gemini/antigravity/brain/047f6b23-c1a3-4734-aaa5-c7ccd2a76473/scratch/hero_tripod_proj.json")
REF_IMG = Path("/mnt/c/Users/paul/.gemini/antigravity/brain/047f6b23-c1a3-4734-aaa5-c7ccd2a76473/scratch/hero_tripod_ref_clean.png")
PREVIEW_OUT = Path("/mnt/c/Users/paul/.gemini/antigravity/brain/047f6b23-c1a3-4734-aaa5-c7ccd2a76473/scratch/warped_preview_on_tripod.png")

XA_EAST = 17.8
XA_WEST = -15.5
YA_SOUTH = -3.0
YA_NORTH = 19.5

OUT_W, OUT_H = 1536, 976

LAT0, LON0 = 29.247355, -95.231385
YAW = math.radians(-15.0)
M_LAT = 111320.0
M_LON = 111320.0 * math.cos(math.radians(LAT0))


def road_to_geo(xA: float, yA: float):
    cy, sy = math.cos(YAW), math.sin(YAW)
    dE = xA * cy - yA * sy
    dN = xA * sy + yA * cy
    return LAT0 + dN / M_LAT, LON0 + dE / M_LON


def road_to_out_px(xA: float, yA: float):
    u = (XA_EAST - xA) / (XA_EAST - XA_WEST) * (OUT_W - 1)
    v = (yA - YA_SOUTH) / (YA_NORTH - YA_SOUTH) * (OUT_H - 1)
    return u, v


# Ground-contact pairs only (every point sits near ground level z~0 so vehicles stay straight/rigid!)
PAIRS_SRC_TO_ROAD = [
    ((635.0, 114.0), (14.0, -3.0)),
    ((840.0, 118.0), (10.0, -3.0)),
    ((1080.0, 123.0), (5.8, -3.0)),
    ((1320.0, 129.0), (1.8, -3.0)),
    ((1560.0, 140.0), (-2.2, -3.0)),
    ((1800.0, 154.0), (-6.2, -3.0)),
    ((2040.0, 171.0), (-10.2, -3.0)),
    ((2280.0, 192.0), (-14.2, -3.0)),
    ((660.0, 144.0), (14.0, 0.0)),
    ((840.0, 151.0), (10.0, 0.0)),
    ((1080.0, 158.0), (5.8, 0.0)),
    ((1320.0, 167.0), (1.8, 0.0)),
    ((1560.0, 179.0), (-2.2, 0.0)),
    ((1800.0, 195.0), (-6.2, 0.0)),
    ((2040.0, 216.0), (-10.2, 0.0)),
    ((720.0, 178.0), (13.0, 3.2)),
    ((960.0, 202.0), (7.8, 3.2)),
    ((1200.0, 215.0), (3.8, 3.2)),
    ((1440.0, 232.0), (-0.4, 3.2)),
    ((1680.0, 250.0), (-4.4, 3.2)),
    ((1920.0, 274.0), (-8.4, 3.2)),
    ((2160.0, 304.0), (-12.4, 3.2)),
    ((650.0, 215.0), (15.28, 5.8)),
    ((320.0, 505.0), (16.15, 11.4)),
    ((40.0, 795.0), (17.05, 17.0)),
    ((1210.0, 320.0), (3.8, 5.4)),
    ((1320.0, 630.0), (2.2, 10.6)),
    ((1200.0, 990.0), (4.2, 16.6)),
    ((1960.0, 480.0), (-8.5, 6.8)),
    ((2140.0, 740.0), (-11.5, 11.2)),
    ((2200.0, 1080.0), (-12.0, 16.8)),
    ((1440.0, 810.0), (0.0, 13.4)),
    ((720.0, 1280.0), (9.5, 18.8)),
]

SOUTH_CURB_POLY_X = np.array([0.0, 360.0, 635.0, 840.0, 1080.0, 1320.0, 1560.0, 1800.0, 2040.0, 2280.0, 2560.0])
SOUTH_CURB_POLY_Y = np.array([150.0, 118.0, 114.0, 118.0, 123.0, 129.0, 140.0, 154.0, 171.0, 192.0, 220.0])

# Tall 2D Monaco RV body/roof polygon in source pixels (2560x1440) to fade out so real 3D Monaco RV replaces it cleanly
RV_BODY_POLY_SRC = [
    (0, 0),
    (660, 0),
    (660, 185),
    (455, 345),
    (360, 470),
    (120, 680),
    (0, 810),
]


def point_in_poly_mask(h: int, w: int, sx: np.ndarray, sy: np.ndarray, poly):
    inside = np.zeros((h, w), dtype=bool)
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        cond = (y1 > sy) != (y2 > sy)
        x_int = (x2 - x1) * (sy - y1) / (y2 - y1 + 1e-12) + x1
        inside ^= cond & (sx < x_int)
    return inside


def fit_homography(src_xy: np.ndarray, dst_xy: np.ndarray) -> np.ndarray:
    A = []
    for (dx, dy), (sx, sy) in zip(dst_xy, src_xy):
        A.append([dx, dy, 1, 0, 0, 0, -sx * dx, -sx * dy, -sx])
        A.append([0, 0, 0, dx, dy, 1, -sy * dx, -sy * dy, -sy])
    _, _, vt = np.linalg.svd(np.array(A, dtype=np.float64))
    return vt[-1].reshape(3, 3)


def apply_homography(H: np.ndarray, xy: np.ndarray) -> np.ndarray:
    x = xy[:, 0]
    y = xy[:, 1]
    den = H[2, 0] * x + H[2, 1] * y + H[2, 2]
    ux = (H[0, 0] * x + H[0, 1] * y + H[0, 2]) / den
    vy = (H[1, 0] * x + H[1, 1] * y + H[1, 2]) / den
    return np.column_stack([ux, vy])


def bilinear_sample(img_arr: np.ndarray, sx: np.ndarray, sy: np.ndarray):
    H, W, C = img_arr.shape
    x0 = np.floor(sx).astype(np.int32)
    y0 = np.floor(sy).astype(np.int32)
    dx = sx - x0
    dy = sy - y0
    valid = (sx >= 0) & (sx <= W - 1.001) & (sy >= 0) & (sy <= H - 1.001)
    x0c = np.clip(x0, 0, W - 2)
    y0c = np.clip(y0, 0, H - 2)
    x1c = x0c + 1
    y1c = y0c + 1
    wa = (1 - dx) * (1 - dy)
    wb = dx * (1 - dy)
    wc = (1 - dx) * dy
    wd = dx * dy
    out = np.zeros((sx.shape[0], sx.shape[1], C), dtype=np.float32)
    for ch in range(C):
        out[:, :, ch] = (
            wa * img_arr[y0c, x0c, ch]
            + wb * img_arr[y0c, x1c, ch]
            + wc * img_arr[y1c, x0c, ch]
            + wd * img_arr[y1c, x1c, ch]
        )
    return out, valid


def main():
    im_src = Image.open(SRC_IMG).convert("RGB")
    src_arr = np.asarray(im_src, dtype=np.float32)
    H_s, W_s, _ = src_arr.shape
    assert (W_s, H_s) == (2560, 1440), f"Unexpected source size {(W_s, H_s)}"

    dst_pts = np.array([road_to_out_px(xa, ya) for (_, (xa, ya)) in PAIRS_SRC_TO_ROAD], dtype=np.float64)
    src_pts = np.array([src_xy for (src_xy, _) in PAIRS_SRC_TO_ROAD], dtype=np.float64)

    # Primary projective ground homography + smooth TPS lens-distortion residual
    H_proj = fit_homography(src_pts, dst_pts)
    base_src = apply_homography(H_proj, dst_pts)
    res = src_pts - base_src
    rbf_dx = RBFInterpolator(dst_pts, res[:, 0], kernel="thin_plate_spline", smoothing=12000.0)
    rbf_dy = RBFInterpolator(dst_pts, res[:, 1], kernel="thin_plate_spline", smoothing=12000.0)

    gx, gy = np.meshgrid(np.arange(OUT_W, dtype=np.float64), np.arange(OUT_H, dtype=np.float64))
    grid_pts = np.column_stack([gx.ravel(), gy.ravel()])
    base_grid = apply_homography(H_proj, grid_pts)
    sx = (base_grid[:, 0] + rbf_dx(grid_pts)).reshape(OUT_H, OUT_W)
    sy = (base_grid[:, 1] + rbf_dy(grid_pts)).reshape(OUT_H, OUT_W)

    rgb, valid = bilinear_sample(src_arr, sx, sy)

    curb_y_at_sx = np.interp(np.clip(sx, 0, W_s - 1), SOUTH_CURB_POLY_X, SOUTH_CURB_POLY_Y)
    src_curb_margin = sy - curb_y_at_sx
    alpha = np.where(valid, 1.0, 0.0)
    alpha *= np.clip(src_curb_margin / 8.0, 0.0, 1.0)
    alpha *= np.clip(gy / 6.0, 0.0, 1.0)

    # Fade out the tall 2D Monaco RV body/roof in source space so real 3D Monaco RV stands cleanly alone
    in_rv_src = point_in_poly_mask(OUT_H, OUT_W, sx, sy, RV_BODY_POLY_SRC)
    alpha = np.where(in_rv_src, alpha * 0.0, alpha)

    # Also keep road surface behind RV open/clean along East edge if RV overlapped pavement
    xA_grid = XA_EAST - (gx / (OUT_W - 1)) * (XA_EAST - XA_WEST)
    yA_grid = YA_SOUTH + (gy / (OUT_H - 1)) * (YA_NORTH - YA_SOUTH)
    rv_west_xA = 15.28 + (yA_grid - 5.77) * ((17.19 - 15.28) / (17.82 - 5.77))
    in_rv_3d = (yA_grid >= 5.2) & (yA_grid <= 18.2) & (xA_grid >= rv_west_xA + 0.25)
    alpha = np.where(in_rv_3d, 0.0, alpha)

    edge_left = np.clip(gx / 28.0, 0.0, 1.0)
    edge_right = np.clip((OUT_W - 1 - gx) / 36.0, 0.0, 1.0)
    edge_bot = np.clip((OUT_H - 1 - gy) / 36.0, 0.0, 1.0)
    alpha *= edge_left * edge_right * edge_bot

    wyze_mask = ((sx < 260) & (sy > 1320)) | ((sx > 1980) & (sy > 1340))
    alpha *= np.where(wyze_mask, 0.12, 1.0)

    alpha = gaussian_filter(alpha, sigma=1.8)
    alpha = np.where(gy <= 2.0, 0.0, alpha)
    alpha = np.where(src_curb_margin <= 0.5, 0.0, alpha)

    rgba = np.zeros((OUT_H, OUT_W, 4), dtype=np.uint8)
    rgba[:, :, :3] = np.clip(np.round(rgb), 0, 255).astype(np.uint8)
    rgba[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    Image.fromarray(rgba, mode="RGBA").save(OUT_PNG, optimize=True)

    ctr_xA = 0.5 * (XA_EAST + XA_WEST)
    ctr_yA = 0.5 * (YA_NORTH + YA_SOUTH)
    ctr_lat, ctr_lon = road_to_geo(ctr_xA, ctr_yA)
    w_m = XA_EAST - XA_WEST
    h_m = YA_NORTH - YA_SOUTH
    dist_m = 15.0
    fov_h = 2.0 * math.degrees(math.atan((w_m / 2.0) / dist_m))
    fov_v = 2.0 * math.degrees(math.atan((h_m / 2.0) / dist_m))

    cfg = {
        "camLat": round(ctr_lat, 7),
        "camLon": round(ctr_lon, 7),
        "camHeightM": 0.24,
        "headingDeg": 195.0,
        "pitchDeg": -5,
        "distanceM": dist_m,
        "fovHDeg": round(fov_h, 3),
        "fovVDeg": round(fov_v, 3),
        "widthScale": 1.0,
        "sizeScale": 1.0,
        "rollDeg": 0,
        "tiltDeg": 0,
        "flat": True,
        "texRot": 0,
        "opacity": 0.94,
    }
    print("OUT_PNG:", OUT_PNG, f"({OUT_PNG.stat().st_size // 1024} KB)")
    print("SURVEY_CONFIG:", json.dumps(cfg, indent=2))

    if PROJ_JSON.exists() and REF_IMG.exists():
        proj = json.loads(PROJ_JSON.read_text(encoding="utf-8"))
        world_2d = []
        scr_2d = []
        for lbl in ("north_curb", "center_yellow", "south_curb"):
            for it in proj.get("roadPts", {}).get(lbl, []):
                if it.get("px"):
                    world_2d.append([it["xA"], it["yA"]])
                    scr_2d.append(it["px"])
        W2 = np.array(world_2d, dtype=np.float64)
        S2 = np.array(scr_2d, dtype=np.float64)
        A = []
        for (wx, wy), (ux, vy) in zip(W2, S2):
            A.append([wx, wy, 1, 0, 0, 0, -ux * wx, -ux * wy, -ux])
            A.append([0, 0, 0, wx, wy, 1, -vy * wx, -vy * wy, -vy])
        _, _, vt = np.linalg.svd(np.array(A))
        Hmat = vt[-1].reshape(3, 3)

        ref_im = Image.open(REF_IMG).convert("RGBA")
        rw, rh = ref_im.size
        Hinv = np.linalg.inv(Hmat)
        px_x, px_y = np.meshgrid(np.arange(rw, dtype=np.float64), np.arange(rh, dtype=np.float64))
        den = Hinv[2, 0] * px_x + Hinv[2, 1] * px_y + Hinv[2, 2]
        wx = (Hinv[0, 0] * px_x + Hinv[0, 1] * px_y + Hinv[0, 2]) / den
        wy = (Hinv[1, 0] * px_x + Hinv[1, 1] * px_y + Hinv[1, 2]) / den

        ou = (XA_EAST - wx) / (XA_EAST - XA_WEST) * (OUT_W - 1)
        ov = (wy - YA_SOUTH) / (YA_NORTH - YA_SOUTH) * (OUT_H - 1)
        layer_f, lvalid = bilinear_sample(rgba.astype(np.float32), ou, ov)
        layer_f[~lvalid] = 0.0
        layer_u8 = np.clip(np.round(layer_f), 0, 255).astype(np.uint8)
        overlay = Image.fromarray(layer_u8, mode="RGBA")
        comp = Image.alpha_composite(ref_im, overlay).convert("RGB")
        dr = ImageDraw.Draw(comp)
        pts = [tuple(it["px"]) for it in proj["roadPts"]["south_curb"] if it.get("px")]
        if len(pts) >= 2:
            dr.line(pts, fill=(0, 255, 128), width=2)
        comp.save(PREVIEW_OUT)
        print("PREVIEW_OUT:", PREVIEW_OUT)


if __name__ == "__main__":
    main()
