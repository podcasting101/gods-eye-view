import fs from 'node:fs';
import path from 'node:path';

/**
 * Local Sovereign Data & Splat Vault Provider (/api/pfl/local-vault).
 *
 * Multi-tenant open-source design: every fork operator keeps their own private
 * splats (.spz/.ply/.splat), 3D models (.glb), Wyze/RTSP camera frames, and
 * Memory Palace snapshots on THEIR OWN disk (never pushed to public GitHub).
 * Configure directories via PFL_SPLAT_DIR and PFL_CAMERAS_JSON in .env.
 */
export function pflLocalVaultProxy() {
  const install = (server) => {
    server.middlewares.use('/api/pfl/local-vault', async (req, res) => {
      const url = new URL(req.url || '/', 'http://localhost');
      const splatDir =
        process.env.PFL_SPLAT_DIR || '/mnt/c/Users/paul/splat-server/splats';
      const yardDir = path.resolve(process.cwd(), 'public', 'yard-frames');
      const camManifestPath =
        process.env.PFL_CAMERAS_JSON ||
        path.resolve(process.cwd(), 'public', 'gev-intel', 'rtsp-scrubber-fusion.json');

      // Serve raw local splat/GLB files safely by basename when requested via /api/pfl/local-vault/file/<name>
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
