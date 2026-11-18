import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

const CAMERA_GEO = {
  'wyze-cam-v4': {
    cctvId: 'pfl-wyze-cam-v4',
    label: 'Wyze Cam V4 (Front Yard & Driveway)',
    lat: 29.24753,
    lon: -95.23146,
    headingDeg: 223,
    pitchDeg: -22.5,
  },
  'back-yard-cam1': {
    cctvId: 'pfl-back-yard-cam1',
    label: 'Wyze Cam1 (East Driveway, Monaco RV & Culvert)',
    lat: 29.24756,
    lon: -95.23134,
    headingDeg: 175,
    pitchDeg: -35,
  },
  'back-yard-cam2': {
    cctvId: 'pfl-back-yard-cam2',
    label: 'Wyze Cam2 (Chocolate Bayou Dock & Waterfront)',
    lat: 29.24768,
    lon: -95.23146,
    headingDeg: 352,
    pitchDeg: -18,
  },
  'front-porch': {
    cctvId: 'pfl-wyze-cam-v4',
    label: 'Front Porch (417 Palm Dr)',
    lat: 29.24751,
    lon: -95.23149,
    headingDeg: 205,
    pitchDeg: -15,
  },
  hd: {
    cctvId: 'pfl-house-hd-cam',
    label: 'HD Cam (Standby / Monaco Rear Remount)',
    lat: 29.24756,
    lon: -95.23136,
    headingDeg: 92,
    pitchDeg: 14,
  },
};

const STANDBY_HD_SPEC = {
  id: 'pfl-house-hd-cam',
  name: 'PFL Wyze HD Cam — Standby / Monaco Rear View (LIVE)',
  city: 'Liverpool, TX',
  cityId: 'pfl-liverpool',
  provider: 'Project Free Life Sovereign Wyze Node (go2rtc)',
  lat: 29.24756,
  lon: -95.23136,
  headingDeg: 92,
  pitchDeg: -12,
  fovDeg: 100,
  rangeM: 18.0,
  mountHeightM: 3.4,
  frameRefreshMs: 2000,
  feedType: 'mp4',
  sourceKind: 'pfl-go2rtc-local',
  url: 'http://127.0.0.1:1984/api/stream.mp4?src=hd',
  snapshotUrl: 'http://127.0.0.1:1984/api/frame.jpeg?src=hd',
  license: 'Sovereign Operator Feed (Paul Prime)',
};

const DEFAULT_ACTIVE_SPECS = [
  {
    id: 'pfl-wyze-cam-v4',
    name: 'PFL Wyze Cam V4 — 417 Palm Dr Front Yard & Driveway (LIVE)',
    city: 'Liverpool, TX',
    cityId: 'pfl-liverpool',
    provider: 'Project Free Life Sovereign Wyze Node (go2rtc)',
    lat: 29.24753,
    lon: -95.23146,
    headingDeg: 223,
    pitchDeg: -22.5,
    fovDeg: 103,
    rangeM: 19.5,
    mountHeightM: 7.67,
    frameRefreshMs: 2000,
    feedType: 'mp4',
    sourceKind: 'pfl-go2rtc-local',
    url: 'http://127.0.0.1:1984/api/stream.mp4?src=wyze-cam-v4',
    snapshotUrl: 'http://127.0.0.1:1984/api/frame.jpeg?src=wyze-cam-v4',
    license: 'Sovereign Operator Feed (Paul Prime)',
  },
  {
    id: 'pfl-back-yard-cam1',
    name: 'PFL Wyze Cam1 — East Driveway, Monaco RV & Culvert (LIVE)',
    city: 'Liverpool, TX',
    cityId: 'pfl-liverpool',
    provider: 'Project Free Life Sovereign Wyze Node (go2rtc)',
    lat: 29.24756,
    lon: -95.23134,
    headingDeg: 175,
    pitchDeg: -35,
    fovDeg: 103,
    rangeM: 15.5,
    mountHeightM: 6.2,
    frameRefreshMs: 2000,
    feedType: 'mp4',
    sourceKind: 'pfl-go2rtc-local',
    url: 'http://127.0.0.1:1984/api/stream.mp4?src=back-yard-cam1',
    snapshotUrl: 'http://127.0.0.1:1984/api/frame.jpeg?src=back-yard-cam1',
    license: 'Sovereign Operator Feed (Paul Prime)',
  },
  {
    id: 'pfl-back-yard-cam2',
    name: 'PFL Wyze Cam2 — Chocolate Bayou Dock & Waterfront (LIVE)',
    city: 'Liverpool, TX',
    cityId: 'pfl-liverpool',
    provider: 'Project Free Life Sovereign Wyze Node (go2rtc)',
    lat: 29.24768,
    lon: -95.23146,
    headingDeg: 352,
    pitchDeg: -18,
    fovDeg: 103,
    rangeM: 22.0,
    mountHeightM: 5.0,
    frameRefreshMs: 2000,
    feedType: 'mp4',
    sourceKind: 'pfl-go2rtc-local',
    url: 'http://127.0.0.1:1984/api/stream.mp4?src=back-yard-cam2',
    snapshotUrl: 'http://127.0.0.1:1984/api/frame.jpeg?src=back-yard-cam2',
    license: 'Sovereign Operator Feed (Paul Prime)',
  },
];

const ALL_SPECS_BY_ID = new Map(
  [...DEFAULT_ACTIVE_SPECS, STANDBY_HD_SPEC].map((s) => [s.id, s]),
);

let lastSyncMs = 0;

function readRecentWyzeEvents(eventsRoot, limit = 30) {
  if (!fs.existsSync(eventsRoot)) return [];
  const days = fs
    .readdirSync(eventsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
    .map((d) => d.name)
    .sort()
    .reverse()
    .slice(0, 5);

  const out = [];
  for (const day of days) {
    const manifestPath = path.join(eventsRoot, day, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const evs = Array.isArray(m.events) ? m.events : [];
      for (let i = evs.length - 1; i >= 0; i--) {
        const ev = evs[i];
        const cam = String(ev.camera || '');
        if (cam === 'bed' || cam === 'living-room-cam') continue; // strict privacy firewall
        const geo = CAMERA_GEO[cam] || {
          cctvId: 'pfl-wyze-cam-v4',
          label: cam || 'Exterior Wyze',
          lat: 29.24753,
          lon: -95.23145,
          headingDeg: 200,
          pitchDeg: -20,
        };
        const files = Array.isArray(ev.files) ? ev.files : [];
        const imgFile = files.find((f) => /\.(jpg|jpeg|png)$/i.test(f.filename || ''));
        const vidFile = files.find((f) => /\.mp4$/i.test(f.filename || ''));
        const tags = (ev.tags || []).map((t) => String(t).replace('AiEventType.', ''));
        out.push({
          id: String(ev.event_id || `${day}-${i}`),
          day,
          camera: cam,
          cameraLabel: geo.label,
          cctvId: geo.cctvId,
          lat: geo.lat,
          lon: geo.lon,
          headingDeg: geo.headingDeg,
          pitchDeg: geo.pitchDeg,
          occurredAt: ev.occurred_at || day,
          tags: tags.length ? tags : ['MOTION'],
          thumbUrl: imgFile
            ? `/api/pfl/local-vault/wyze-media/${encodeURIComponent(day)}/${encodeURIComponent(path.basename(imgFile.filename))}`
            : null,
          videoUrl: vidFile
            ? `/api/pfl/local-vault/wyze-media/${encodeURIComponent(day)}/${encodeURIComponent(path.basename(vidFile.filename))}`
            : null,
        });
        if (out.length >= limit) break;
      }
    } catch {}
    if (out.length >= limit) break;
  }
  out.sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)));
  return out.slice(0, limit);
}

/**
 * Local Sovereign Data, Splat Vault & Live Wyze Event Provider (/api/pfl/local-vault).
 */
export function pflLocalVaultProxy() {
  const install = (server) => {
    server.middlewares.use('/api/pfl/local-vault', async (req, res) => {
      const url = new URL(req.url || '/', 'http://localhost');
      const splatDir =
        process.env.PFL_SPLAT_DIR || '/mnt/c/Users/paul/splat-server/splats';
      const yardDir = path.resolve(process.cwd(), 'public', 'yard-frames');
      const eventsRoot =
        process.env.PFL_WYZE_EVENTS_DIR || '/mnt/d/wyzeCam/person_events';
      const cctvConfigPath = path.resolve(
        process.cwd(),
        'config',
        'cctv_sources.austin.json',
      );
      const camManifestPath =
        process.env.PFL_CAMERAS_JSON ||
        path.resolve(process.cwd(), 'public', 'gev-intel', 'rtsp-scrubber-fusion.json');

      // 1) Serve Wyze event thumbnails & MP4 clips safely from /mnt/d/wyzeCam/person_events/<day>/<file>
      if (url.pathname.startsWith('/wyze-media/')) {
        const parts = url.pathname.slice('/wyze-media/'.length).split('/');
        if (parts.length !== 2) {
          res.writeHead(400);
          res.end('Bad path');
          return;
        }
        const day = path.basename(decodeURIComponent(parts[0]));
        const fname = path.basename(decodeURIComponent(parts[1]));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^[A-Za-z0-9._-]+$/.test(fname)) {
          res.writeHead(400);
          res.end('Invalid event media');
          return;
        }
        const full = path.join(eventsRoot, day, fname);
        if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(fname).toLowerCase();
        const mime = ext === '.mp4' ? 'video/mp4' : ext === '.png' ? 'image/png' : 'image/jpeg';
        const st = fs.statSync(full);
        const range = req.headers.range;
        if (range && ext === '.mp4') {
          const m = /bytes=(\d+)-(\d*)/.exec(range);
          const start = m ? parseInt(m[1], 10) : 0;
          const end = m && m[2] ? parseInt(m[2], 10) : st.size - 1;
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${st.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': end - start + 1,
            'Content-Type': mime,
          });
          fs.createReadStream(full, { start, end }).pipe(res);
          return;
        }
        res.writeHead(200, {
          'Content-Type': mime,
          'Content-Length': st.size,
          'Cache-Control': 'public, max-age=3600',
        });
        fs.createReadStream(full).pipe(res);
        return;
      }

      // 2) Live H.264/MP4 stream relay directly from local go2rtc (closes immediately on client disconnect!)
      if (url.pathname.startsWith('/wyze-live/')) {
        const src = path.basename(decodeURIComponent(url.pathname.slice('/wyze-live/'.length)));
        const allowed = new Set(['wyze-cam-v4', 'back-yard-cam1', 'back-yard-cam2', 'hd']);
        if (!allowed.has(src)) {
          res.writeHead(404);
          res.end('Camera not allowed');
          return;
        }
        const abort = new AbortController();
        req.on('close', () => abort.abort());
        try {
          const up = await fetch(`http://127.0.0.1:1984/api/stream.mp4?src=${encodeURIComponent(src)}`, {
            signal: abort.signal,
          });
          if (!up.ok || !up.body) {
            res.writeHead(502);
            res.end('Upstream unavailable');
            return;
          }
          res.writeHead(200, {
            'Content-Type': up.headers.get('content-type') || 'video/mp4',
            'Cache-Control': 'no-store',
          });
          const reader = up.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done || abort.signal.aborted) break;
            res.write(Buffer.from(value));
          }
          res.end();
        } catch {
          if (!res.headersSent) res.writeHead(502);
          res.end();
        }
        return;
      }

      // 3) GET/POST /wyze-events (list recent Person/Vehicle events + optional fresh Wyze cloud harvest)
      if (url.pathname === '/wyze-events') {
        if (req.method === 'POST') {
          const now = Date.now();
          if (now - lastSyncMs > 25000 && fs.existsSync('/home/paul/antigravity_workspace/harvest_wyze_person_events.py')) {
            lastSyncMs = now;
            await new Promise((resolve) => {
              execFile(
                '/home/paul/go2rtc/.venv/bin/python',
                ['/home/paul/antigravity_workspace/harvest_wyze_person_events.py'],
                { timeout: 18000 },
                () => resolve(),
              );
            });
          }
        }
        const events = readRecentWyzeEvents(eventsRoot, 35);
        let enabledIds = [];
        try {
          const cur = JSON.parse(fs.readFileSync(cctvConfigPath, 'utf8'));
          enabledIds = cur.map((c) => c.id);
        } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(
          JSON.stringify({
            ok: true,
            count: events.length,
            enabledCameraIds: enabledIds,
            allCameras: [...ALL_SPECS_BY_ID.values()].map((c) => ({
              id: c.id,
              name: c.name,
              src: new URL(c.snapshotUrl).searchParams.get('src'),
              enabled: enabledIds.includes(c.id),
            })),
            events,
          }),
        );
        return;
      }

      // 4) POST /wyze-cameras (toggle which exterior cameras are active in God's Eye View rotation!)
      if (url.pathname === '/wyze-cameras' && req.method === 'POST') {
        let body = '';
        for await (const chunk of req) body += chunk;
        try {
          const parsed = JSON.parse(body || '{}');
          const requested = Array.isArray(parsed.enabledIds) ? parsed.enabledIds : [];
          const nextSpecs = requested
            .map((id) => ALL_SPECS_BY_ID.get(id))
            .filter(Boolean);
          if (nextSpecs.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Keep at least 1 camera enabled' }));
            return;
          }
          fs.writeFileSync(cctvConfigPath, JSON.stringify(nextSpecs, null, 2) + '\n', 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, enabledIds: nextSpecs.map((s) => s.id) }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }));
        }
        return;
      }

      // 5) Serve raw local splat/GLB files safely by basename
      if (url.pathname.startsWith('/file/')) {
        const name = path.basename(decodeURIComponent(url.pathname.slice(6)));
        const candidate = path.join(splatDir, name);
        if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'File not found' }));
          return;
        }
        const ext = path.extname(name).toLowerCase();
        const mime =
          ext === '.glb'
            ? 'model/gltf-binary'
            : ext === '.json'
              ? 'application/json'
              : 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=300',
        });
        fs.createReadStream(candidate).pipe(res);
        return;
      }

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      try {
        const splats = [];
        if (fs.existsSync(splatDir)) {
          for (const entry of fs.readdirSync(splatDir, { withFileTypes: true })) {
            if (!entry.isFile()) continue;
            if (!/\.(spz|ply|splat|glb)$/i.test(entry.name)) continue;
            const st = fs.statSync(path.join(splatDir, entry.name));
            splats.push({
              name: entry.name,
              ext: path.extname(entry.name).toLowerCase().slice(1),
              sizeMB: Number((st.size / (1024 * 1024)).toFixed(2)),
              updatedAt: st.mtime.toISOString(),
              holodeckUrl:
                entry.name.endsWith('.spz') || entry.name.endsWith('.ply') || entry.name.endsWith('.splat')
                  ? `http://127.0.0.1:8766/?scene=${encodeURIComponent('splats/' + entry.name)}`
                  : `http://127.0.0.1:8766/`,
              localStreamUrl: `/api/pfl/local-vault/file/${encodeURIComponent(entry.name)}`,
            });
          }
          splats.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        }

        const yardFrames = [];
        if (fs.existsSync(yardDir)) {
          for (const entry of fs.readdirSync(yardDir, { withFileTypes: true })) {
            if (!entry.isFile()) continue;
            if (!/\.(jpg|jpeg|png|mp4|webm)$/i.test(entry.name)) continue;
            const st = fs.statSync(path.join(yardDir, entry.name));
            yardFrames.push({
              name: entry.name,
              sizeMB: Number((st.size / (1024 * 1024)).toFixed(2)),
              url: `/yard-frames/${encodeURIComponent(entry.name)}`,
            });
          }
        }

        let cameras = [];
        if (fs.existsSync(camManifestPath)) {
          try {
            const cm = JSON.parse(fs.readFileSync(camManifestPath, 'utf8'));
            cameras = cm.streams || cm.cameras || [];
          } catch {}
        }

        const recentEvents = readRecentWyzeEvents(eventsRoot, 20);

        res.writeHead(200);
        res.end(
          JSON.stringify({
            ok: true,
            splatDir,
            splatCount: splats.length,
            splats,
            yardFrameCount: yardFrames.length,
            yardFrames,
            cameraCount: cameras.length,
            cameras,
            eventCount: recentEvents.length,
            events: recentEvents,
            surfaces: {
              memoryPalace: '/memory-palace.html',
              poseLiveWire: 'http://127.0.0.1:8093/',
              holodeckSplatServer: 'http://127.0.0.1:8766/',
              kalshiPaperArena: '/kalshi-paper.html',
            },
          }),
        );
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
      }
    });
  };
  return {
    name: 'pfl-local-vault-proxy',
    configureServer: install,
    configurePreviewServer: install,
  };
}
