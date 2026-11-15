#!/usr/bin/env python3
"""
Builds `/home/paul/gods-eye-view/public/models/starship_s42.glb`:
A self-contained glTF 2.0 binary model of SpaceX Starship Flight 15 (Ship 42)
matching CesiumJS Entity model axis conventions:
  - Cesium maps raw glTF [x, y, z] -> [z, x, y] before HeadingPitchRoll:
      +Z_gltf -> +X_cesium (Nose, 50.0 m long from z=-25 m aft skirt to z=+25 m tip)
      +Y_gltf -> +Z_cesium (Dorsal stainless-steel leeward back; -Y is black TPS belly)
      +X_gltf -> +Y_cesium (Port/Starboard lateral span across flaps)
  - Embeds a "DON'T PANIC S42" decal texture on Port & Starboard payload bands.
"""

from __future__ import annotations

import io
import json
import math
import os
import struct
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT_PATH = Path('/home/paul/gods-eye-view/public/models/starship_s42.glb')

# Geometry constants (meters, centered at z = 0)
SHIP_LEN = 50.0
RADIUS = 4.5
Z_AFT = -25.0
Z_SHOULDER = 9.0
Z_TIP = 25.0


def norm3(v: tuple[float, float, float]) -> tuple[float, float, float]:
    l = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
    if l < 1e-9:
        return (0.0, 1.0, 0.0)
    return (v[0] / l, v[1] / l, v[2] / l)


def cross3(a: tuple[float, float, float], b: tuple[float, float, float]) -> tuple[float, float, float]:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def sub3(a: tuple[float, float, float], b: tuple[float, float, float]) -> tuple[float, float, float]:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def starship_radius_and_slope(z: float) -> tuple[float, float]:
    """Returns (radius_m, dr_dz) along z in [Z_AFT, Z_TIP]."""
    if z <= Z_SHOULDER:
        return (RADIUS, 0.0)
    # Tangent ogive fairing from Z_SHOULDER (r=4.5) to Z_TIP (r=0)
    u = max(0.0, min(1.0, (z - Z_SHOULDER) / (Z_TIP - Z_SHOULDER)))
    # Smooth power-parabolic ogive preserving C1 tangent at Z_SHOULDER
    theta = u * (math.pi * 0.5)
    r = RADIUS * math.cos(theta) ** 0.85
    dr = -RADIUS * 0.85 * (max(1e-4, math.cos(theta)) ** -0.15) * math.sin(theta) * (math.pi * 0.5) / (Z_TIP - Z_SHOULDER)
    if u >= 0.999:
        r = 0.0
    return (r, dr)


def make_s42_decal_png() -> bytes:
    """Generates a sharp embedded PNG texture for the 'DON'T PANIC S42' fairing panel."""
    w, h = 512, 256
    img = Image.new('RGBA', (w, h), (22, 24, 28, 255))
    draw = ImageDraw.Draw(img)

    # Subtle diagonal stainless-to-TPS seam & metallic border
    draw.polygon([(0, 0), (w, 0), (w, h), (int(w * 0.14), h)], fill=(118, 126, 138, 255))
    draw.rectangle([10, 10, w - 10, h - 10], outline=(215, 224, 234, 255), width=3)

    try:
        font_small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 34)
        font_big = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 124)
    except Exception:
        font_small = ImageFont.load_default()
        font_big = ImageFont.load_default()

    draw.text((88, 26), "DON'T PANIC", fill=(244, 248, 252, 255), font=font_small)
    draw.text((104, 72), "S42", fill=(255, 255, 255, 255), font=font_big)

    buf = io.BytesIO()
    img.save(buf, format='PNG', optimize=True)
    return buf.getvalue()


class PrimBuilder:
    def __init__(self) -> None:
        self.positions: list[tuple[float, float, float]] = []
        self.normals: list[tuple[float, float, float]] = []
        self.uvs: list[tuple[float, float]] = []
        self.indices: list[int] = []

    def add_quad(
        self,
        p0: tuple[float, float, float],
        p1: tuple[float, float, float],
        p2: tuple[float, float, float],
        p3: tuple[float, float, float],
        uv0=(0.0, 0.0),
        uv1=(1.0, 0.0),
        uv2=(1.0, 1.0),
        uv3=(0.0, 1.0),
        n_override=None,
    ) -> None:
        base = len(self.positions)
        if n_override is None:
            n = norm3(cross3(sub3(p1, p0), sub3(p2, p0)))
        else:
            n = norm3(n_override)
        self.positions.extend([p0, p1, p2, p3])
        self.normals.extend([n, n, n, n])
        self.uvs.extend([uv0, uv1, uv2, uv3])
        self.indices.extend([base, base + 1, base + 2, base, base + 2, base + 3])

    def add_smooth_quad(
        self,
        p0, n0, uv0,
        p1, n1, uv1,
        p2, n2, uv2,
        p3, n3, uv3,
    ) -> None:
        base = len(self.positions)
        self.positions.extend([p0, p1, p2, p3])
        self.normals.extend([norm3(n0), norm3(n1), norm3(n2), norm3(n3)])
        self.uvs.extend([uv0, uv1, uv2, uv3])
        self.indices.extend([base, base + 1, base + 2, base, base + 2, base + 3])

    def add_box_prism(self, corners_front: list, corners_back: list) -> None:
        """Adds closed 8-vertex flap/box from 4 front-ring and 4 back-ring CCW vertices."""
        f0, f1, f2, f3 = corners_front
        b0, b1, b2, b3 = corners_back
        # Outer faces
        self.add_quad(f0, f1, f2, f3)
        self.add_quad(b3, b2, b1, b0)
        self.add_quad(f0, b0, b1, f1)
        self.add_quad(f1, b1, b2, f2)
        self.add_quad(f2, b2, b3, f3)
        self.add_quad(f3, b3, b0, f0)


def build_starship_primitives():
    steel = PrimBuilder()
    tps = PrimBuilder()
    decal = PrimBuilder()
    plume = PrimBuilder()

    # 1. Fuselage + Nosecone divided cleanly between Leeward Stainless (+y) and Windward TPS (-y)
    n_z = 26
    n_theta = 32
    z_vals = [Z_AFT + (Z_TIP - Z_AFT) * (i / n_z) for i in range(n_z + 1)]

    def hull_pt_norm(z: float, theta: float) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
        r, dr_dz = starship_radius_and_slope(z)
        x = r * math.cos(theta)
        y = r * math.sin(theta)
        # Normal perpendicular to surface: (cos(t), sin(t), -dr_dz)
        nx = math.cos(theta)
        ny = math.sin(theta)
        nz = -dr_dz if r > 1e-5 else 1.0
        return ((x, y, z), norm3((nx, ny, nz)))

    for iz in range(n_z):
        z0, z1 = z_vals[iz], z_vals[iz + 1]
        for it in range(n_theta):
            t0 = (2.0 * math.pi * it) / n_theta
            t1 = (2.0 * math.pi * (it + 1)) / n_theta
            t_mid = 0.5 * (t0 + t1)

            p00, n00 = hull_pt_norm(z0, t0)
            p10, n10 = hull_pt_norm(z0, t1)
            p11, n11 = hull_pt_norm(z1, t1)
            p01, n01 = hull_pt_norm(z1, t0)

            # Windward side faces -Y (sin(t) < 0.10 wraps ~190 deg around bottom belly + nose tip)
            is_tps = (math.sin(t_mid) < 0.08) or (0.5 * (z0 + z1) > 22.0)
            target = tps if is_tps else steel
            u0, u1 = it / n_theta, (it + 1) / n_theta
            v0, v1 = iz / n_z, (iz + 1) / n_z
            target.add_smooth_quad(p00, n00, (u0, v0), p10, n10, (u1, v0), p11, n11, (u1, v1), p01, n01, (u0, v1))

    # Aft dome bulkhead cap at z = Z_AFT
    c_aft = (0.0, 0.0, Z_AFT)
    for it in range(n_theta):
        t0 = (2.0 * math.pi * it) / n_theta
        t1 = (2.0 * math.pi * (it + 1)) / n_theta
        p0 = (RADIUS * math.cos(t0), RADIUS * math.sin(t0), Z_AFT)
        p1 = (RADIUS * math.cos(t1), RADIUS * math.sin(t1), Z_AFT)
        tps.add_smooth_quad(c_aft, (0, 0, -1), (0.5, 0.5), p1, (0, 0, -1), (1, 0), p0, (0, 0, -1), (0, 1), c_aft, (0, 0, -1), (0.5, 0.5))

    # 2. Forward Flaps (Port +X and Starboard -X) & Aft Flaps (tps-dark on windward, steel on dorsal)
    # Forward flap span along z in [11.5, 20.0], protruding outward horizontally with slight dorsal dihedral
    for sign_x in (+1.0, -1.0):
        # Root at x = sign_x * 3.1, tip at x = sign_x * 6.9
        # Fore flap
        fr0 = (sign_x * 2.5, -0.22, 11.2)
        fr1 = (sign_x * 2.5, +0.25, 11.2)
        fr2 = (sign_x * 1.4, +0.22, 20.4)
        fr3 = (sign_x * 1.4, -0.22, 20.4)

        ft0 = (sign_x * 6.9, +0.42, 11.8)
        ft1 = (sign_x * 6.9, +0.62, 11.8)
        ft2 = (sign_x * 4.5, +0.52, 18.6)
        ft3 = (sign_x * 4.5, +0.34, 18.6)

        if sign_x > 0:
            tps.add_box_prism([fr0, fr1, fr2, fr3], [ft0, ft1, ft2, ft3])
        else:
            tps.add_box_prism([ft0, ft1, ft2, ft3], [fr0, fr1, fr2, fr3])

        # Aft flap (larger, z in [-24.6, -13.8])
        ar0 = (sign_x * 4.15, -0.28, -24.6)
        ar1 = (sign_x * 4.15, +0.32, -24.6)
        ar2 = (sign_x * 4.15, +0.28, -13.4)
        ar3 = (sign_x * 4.15, -0.26, -13.4)

        at0 = (sign_x * 9.1, +0.45, -24.2)
        at1 = (sign_x * 9.1, +0.72, -24.2)
        at2 = (sign_x * 6.5, +0.58, -15.0)
        at3 = (sign_x * 6.5, +0.34, -15.0)

        if sign_x > 0:
            tps.add_box_prism([ar0, ar1, ar2, ar3], [at0, at1, at2, at3])
        else:
            tps.add_box_prism([at0, at1, at2, at3], [ar0, ar1, ar2, ar3])

    # 3. 6 Raptor Engine Nozzles (3 central sea-level + 3 outer RVac) protruding aft from Z_AFT
    def add_nozzle(cx: float, cy: float, r_top: float, r_bot: float, z0: float, z1: float, target: PrimBuilder, inner_glow: bool = False):
        segs = 12
        for i in range(segs):
            a0 = 2.0 * math.pi * i / segs
            a1 = 2.0 * math.pi * (i + 1) / segs
            p0 = (cx + r_top * math.cos(a0), cy + r_top * math.sin(a0), z0)
            p1 = (cx + r_top * math.cos(a1), cy + r_top * math.sin(a1), z0)
            p2 = (cx + r_bot * math.cos(a1), cy + r_bot * math.sin(a1), z1)
            p3 = (cx + r_bot * math.cos(a0), cy + r_bot * math.sin(a0), z1)
            target.add_quad(p0, p3, p2, p1)
            if inner_glow:
                # Glowing throat disc
                c_in = (cx, cy, z1 + 0.15)
                plume.add_smooth_quad(c_in, (0, 0, -1), (0.5, 0.5), p3, (0, 0, -1), (0, 0), p2, (0, 0, -1), (1, 0), c_in, (0, 0, -1), (0.5, 0.5))

    for k in range(3):
        ang = k * (2.0 * math.pi / 3.0) + math.pi / 6.0
        add_nozzle(1.15 * math.cos(ang), 1.15 * math.sin(ang), 0.55, 0.72, Z_AFT + 0.2, Z_AFT - 1.5, tps, inner_glow=True)
        ang_v = ang + math.pi / 3.0
        add_nozzle(2.45 * math.cos(ang_v), 2.45 * math.sin(ang_v), 0.75, 1.05, Z_AFT + 0.2, Z_AFT - 1.9, tps, inner_glow=False)

    # 4. Crisp "DON'T PANIC S42" Decal Panels on both flanks just above TPS/Steel seam
    # Viewed broadside, horizontal u runs along fuselage Z (lengthwise), vertical v runs bottom->top
    for is_starboard in (True, False):
        r_d = RADIUS + 0.06
        th_low = math.pi - 0.04 if is_starboard else 0.04
        th_high = math.pi - 0.62 if is_starboard else 0.62
        z_a, z_b = -2.0, 5.2
        steps = 6
        for i in range(steps):
            t0 = i / steps
            t1 = (i + 1) / steps
            za = z_a + (z_b - z_a) * t0
            zb = z_a + (z_b - z_a) * t1
            p_bl = (r_d * math.cos(th_low), r_d * math.sin(th_low), za)
            p_br = (r_d * math.cos(th_low), r_d * math.sin(th_low), zb)
            p_tr = (r_d * math.cos(th_high), r_d * math.sin(th_high), zb)
            p_tl = (r_d * math.cos(th_high), r_d * math.sin(th_high), za)
            n_low = (math.cos(th_low), math.sin(th_low), 0.0)
            n_high = (math.cos(th_high), math.sin(th_high), 0.0)
            # On starboard (-X, facing camera): +Z goes left->right so u=t0..t1; on port (+X): +Z goes right->left
            u0 = t0 if is_starboard else (1.0 - t0)
            u1 = t1 if is_starboard else (1.0 - t1)
            if is_starboard:
                decal.add_smooth_quad(p_bl, n_low, (u0, 1.0), p_br, n_low, (u1, 1.0), p_tr, n_high, (u1, 0.0), p_tl, n_high, (u0, 0.0))
            else:
                decal.add_smooth_quad(p_br, n_low, (u1, 1.0), p_bl, n_low, (u0, 1.0), p_tl, n_high, (u0, 0.0), p_tr, n_high, (u1, 0.0))

    return [('steel', steel, 0), ('tps', tps, 1), ('decal', decal, 2), ('plume', plume, 3)]


def pack_glb(prims, png_bytes: bytes) -> bytes:
    bin_buf = bytearray()
    buffer_views = []
    accessors = []
    gltf_primitives = []

    def append_bytes(data: bytes, target: int | None = None) -> int:
        while len(bin_buf) % 4 != 0:
            bin_buf.append(0)
        offset = len(bin_buf)
        bin_buf.extend(data)
        bv = {'buffer': 0, 'byteOffset': offset, 'byteLength': len(data)}
        if target is not None:
            bv['target'] = target
        idx = len(buffer_views)
        buffer_views.append(bv)
        return idx

    # Image at bufferView 0
    img_bv = append_bytes(png_bytes, target=None)

    for _name, pb, mat_idx in prims:
        if not pb.indices:
            continue
        pos_bytes = b''.join(struct.pack('<3f', *p) for p in pb.positions)
        norm_bytes = b''.join(struct.pack('<3f', *n) for n in pb.normals)
        uv_bytes = b''.join(struct.pack('<2f', *uv) for uv in pb.uvs)
        idx_bytes = b''.join(struct.pack('<I', idx) for idx in pb.indices)

        bv_pos = append_bytes(pos_bytes, target=34962)
        bv_norm = append_bytes(norm_bytes, target=34962)
        bv_uv = append_bytes(uv_bytes, target=34962)
        bv_idx = append_bytes(idx_bytes, target=34963)

        xs = [p[0] for p in pb.positions]
        ys = [p[1] for p in pb.positions]
        zs = [p[2] for p in pb.positions]
        n_verts = len(pb.positions)

        acc_pos = len(accessors)
        accessors.append({
            'bufferView': bv_pos,
            'componentType': 5126,  # FLOAT
            'count': n_verts,
            'type': 'VEC3',
            'min': [min(xs), min(ys), min(zs)],
            'max': [max(xs), max(ys), max(zs)],
        })
        acc_norm = len(accessors)
        accessors.append({
            'bufferView': bv_norm,
            'componentType': 5126,
            'count': n_verts,
            'type': 'VEC3',
        })
        acc_uv = len(accessors)
        accessors.append({
            'bufferView': bv_uv,
            'componentType': 5126,
            'count': n_verts,
            'type': 'VEC2',
        })
        acc_idx = len(accessors)
        accessors.append({
            'bufferView': bv_idx,
            'componentType': 5125,  # UNSIGNED_INT
            'count': len(pb.indices),
            'type': 'SCALAR',
        })

        gltf_primitives.append({
            'attributes': {
                'POSITION': acc_pos,
                'NORMAL': acc_norm,
                'TEXCOORD_0': acc_uv,
            },
            'indices': acc_idx,
            'material': mat_idx,
            'mode': 4,
        })

    while len(bin_buf) % 4 != 0:
        bin_buf.append(0)

    gltf = {
        'asset': {
            'version': '2.0',
            'generator': 'PFL God\'s Eye View Starship S42 Builder',
        },
        'scene': 0,
        'scenes': [{'nodes': [0]}],
        'nodes': [{'mesh': 0, 'name': 'Starship_S42'}],
        'meshes': [{'name': 'Starship_S42_Mesh', 'primitives': gltf_primitives}],
        'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}],
        'images': [{'bufferView': img_bv, 'mimeType': 'image/png', 'name': 's42_decal'}],
        'textures': [{'sampler': 0, 'source': 0}],
        'materials': [
            {
                'name': 'StainlessSteelHull',
                'doubleSided': True,
                'pbrMetallicRoughness': {
                    'baseColorFactor': [0.82, 0.85, 0.89, 1.0],
                    'metallicFactor': 0.72,
                    'roughnessFactor': 0.34,
                },
            },
            {
                'name': 'BlackHeatShieldTPS',
                'doubleSided': True,
                'pbrMetallicRoughness': {
                    'baseColorFactor': [0.09, 0.10, 0.12, 1.0],
                    'metallicFactor': 0.12,
                    'roughnessFactor': 0.82,
                },
            },
            {
                'name': 'S42DontPanicDecal',
                'doubleSided': True,
                'pbrMetallicRoughness': {
                    'baseColorTexture': {'index': 0},
                    'metallicFactor': 0.35,
                    'roughnessFactor': 0.45,
                },
            },
            {
                'name': 'RaptorThroatGlow',
                'doubleSided': True,
                'emissiveFactor': [1.0, 0.48, 0.12],
                'pbrMetallicRoughness': {
                    'baseColorFactor': [1.0, 0.65, 0.25, 1.0],
                    'metallicFactor': 0.0,
                    'roughnessFactor': 0.9,
                },
            },
        ],
        'buffers': [{'byteLength': len(bin_buf)}],
        'bufferViews': buffer_views,
        'accessors': accessors,
    }

    json_bytes = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    while len(json_bytes) % 4 != 0:
        json_bytes += b' '

    total_len = 12 + 8 + len(json_bytes) + 8 + len(bin_buf)
    header = struct.pack('<III', 0x46546C67, 2, total_len)
    json_chunk = struct.pack('<II', len(json_bytes), 0x4E4F534A) + json_bytes
    bin_chunk = struct.pack('<II', len(bin_buf), 0x004E4942) + bytes(bin_buf)
    return header + json_chunk + bin_chunk


def main() -> None:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    png_bytes = make_s42_decal_png()
    prims = build_starship_primitives()
    glb = pack_glb(prims, png_bytes)
    OUT_PATH.write_bytes(glb)
    total_tris = sum(len(pb.indices) // 3 for _, pb, _ in prims)
    print(f'Wrote {OUT_PATH} ({len(glb)} bytes, {total_tris} triangles, png={len(png_bytes)} bytes)')


if __name__ == '__main__':
    main()
