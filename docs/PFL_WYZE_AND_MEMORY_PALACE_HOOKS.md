# Project Free Life (PFL) — Wyze Camera, Local Splat Vault & Memory Palace Integration Guide

Every operator running the public **`podcasting101/gods-eye-view`** fork keeps **100% of their personal cameras, 3D Gaussian Splats, and Memory Palace data strictly on their own local server**—never mixed with anyone else's property or uploaded to GitHub.

---

## 1. How Multi-Operator Local Data Isolation Works
When Michael Mertz (or any community contributor) clones `https://github.com/podcasting101/gods-eye-view.git`, they get the **PFL UI Framework** (movable/sizable HUD windows, 3D Compass & Object Rotator, Kalshi Weather/Macro Paper Arena, and Local Vault scanner), while pointing `.env` to **their own property coordinates, Wyze RTSP bridge, and local splat folder**:

```ini
# Optional PFL Sovereign Operator Overrides in .env
PFL_HOME_LAT=29.1391
PFL_HOME_LON=-95.8048
PFL_SPLAT_DIR=/path/to/your/local/splats
PFL_CAMERAS_JSON=/path/to/your/cameras.json
```

Ignored automatically by `.gitignore` so private data never leaks on `git push`:
- `.env` / `.env.*`
- `.cache/` (local Kalshi paper-trading ledger)
- `.gev-cache/` (24h spatial HUD cache, terrain heights, Overpass parcel/road cache)
- `public/pose-live-wire` (local symlink to operator's LiveWire camera feed)

---

## 2. Connecting Your Own Wyze Cameras (3 Supported Hook Paths)

### Path A: Live RTSP / Wyze Bridge (`docker-wyze-bridge` or Wyze RTSP Firmware)
1. Run [`docker-wyze-bridge`](https://github.com/mrlt8/docker-wyze-bridge) (or MediaMTX) locally so each Wyze Cam V3 / V4 / Pan V3 exposes an `rtsp://127.0.0.1:8554/<cam-name>` and HLS/WebRTC/snapshot URL.
2. Register your camera coordinates (`lat`, `lon`, `camHeightM`, `headingDeg`, `pitchDeg`, `fovHDeg`) in `public/gev-intel/rtsp-scrubber-fusion.json` (or set `PFL_CAMERAS_JSON` in `.env`).
3. Both **Memory Palace (`/memory-palace.html`)** and the **Local Palace & Wyze Vault (`🏛️ Local Palace & Wyze Vault`)** inside God's Eye View automatically discover your streams and project them onto their exact 3D camera frustums.

### Path B: 3D Ground-Registered Yard Photos & Stitched Panoramas (`src/pfl/yardFrames.js`)
1. Drop snapshots or stitched panoramas from your Wyze cameras into `public/yard-frames/`.
2. Click **`🖼️ Arrange Yard Photos`** inside the **PFL Sovereign Command Dock** on `http://127.0.0.1:4173/`.
3. Drag any camera frame directly across your property in 3D, adjust **Spin / Tilt / Roll / Width / Elevation**, and your exact camera pose saves automatically in `localStorage` (`gev-yardframes-layout-v1`).

### Path C: Pose LiveWire + Real-Time 2-Camera / Avatar Tracking (`:8093`)
- If running `pose-serve.service` (`http://127.0.0.1:8093/`), click **`🎥 LiveWire (:8093) ↗`** in the PFL Sovereign Command Dock to open live DWPose skeletal tracking + multi-camera room registration.

---

## 3. Integrating Your Uploaded 3D Splats & Memory Palace Inside the Fork
- **Auto-Discovery Endpoint (`/api/pfl/local-vault`):** Implemented in `server/providers/pflLocalVault.js`. Scans `PFL_SPLAT_DIR` (defaulting to `/mnt/c/Users/paul/splat-server/splats` on Paul's server) for every `.spz`, `.ply`, `.splat`, and `.glb` scene you have already uploaded, plus all Wyze frames in `public/yard-frames/`.
- **In-Globe Access:** Click **`🏛️ Local Palace & Wyze Vault`** in the PFL Sovereign Command Dock on `http://127.0.0.1:4173/` to browse all uploaded splats, launch any scene directly in the 3D Splat Server (`:8766`), or click **`🏛️ Embed Palace Here`** to dock your interactive 3D Memory Palace right inside a movable, resizable HUD window on the globe!
