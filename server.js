const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 12000;
const UPSTREAM = process.env.UPSTREAM || 'http://localhost:20128';
// Daftar upstream cadangan, dipisah koma. Server mencoba berurutan: jika
// UPSTREAM utama gagal (connect/timeout), lanjut ke berikutnya. Ini menambah
// ketahanan saat satu provider gratis sedang sibuk/down.
const UPSTREAMS = UPSTREAM.split(',').map(function (u) { return u.trim(); }).filter(Boolean);
function pickTransport(url) { return url.startsWith('https://') ? https : http; }
const API_KEY = process.env.API_KEY || '';
const USE_SSE = String(process.env.USE_SSE || '1');
// Allow cross-origin calls (e.g. the GitHub Pages statically-served UI) to reach
// this backend's /api/chat. Restrict with a specific origin for production if desired.
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';
// Cache daftar model untuk mengurangi beban/rate-limit upstream.
const MODELS_TTL = Number(process.env.MODELS_TTL || 300); // detik
let modelsCache = null;
let modelsCacheAt = 0;

const ROOT = __dirname;

const CORS_HEADERS = {
  'access-control-allow-origin': ALLOW_ORIGIN,
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization',
};

// Header keamanan dasar yang dipasang di semua respons (statis & API).
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

function applyCors(res) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    res.setHeader(k, v);
  }
}

function applySecurity(res) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(k, v);
  }
}
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

function serveStatic(res, urlPath) {
  let file = path.join(ROOT, path.normalize(urlPath));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, 'index.html');
  }
  if (!fs.existsSync(file)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  const ext = path.extname(file);
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

function proxyOpenAI(req, res) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      let payload;
      try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch (e) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Invalid JSON body' } })); return resolve(); }

      // Model wajib bagi upstream: isi default bila klien tidak mengirim/kosong.
      if (!payload.model || typeof payload.model !== 'string' || !payload.model.trim()) {
        payload.model = process.env.DEFAULT_MODEL || 'mimo-v2.5-free';
      }
      const isStream = USE_SSE === '1';
      const clientAuth = req.headers.authorization || '';
      const authHeader = clientAuth || (API_KEY ? 'Bearer ' + API_KEY : '');
      const headers = {
        'content-type': 'application/json',
        'accept': isStream ? 'text/event-stream' : (req.headers.accept || 'application/json'),
      };
      if (authHeader) headers.authorization = authHeader;

      // Coba tiap upstream berurutan: yang pertama berhasil dipakai.
      const tryUpstream = function (idx) {
        const base = UPSTREAMS[idx];
        if (!base) {
          if (!res.headersSent) {
            res.writeHead(502, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Semua upstream gagal' } }));
          } else { res.end(); }
          return resolve();
        }
        let upstreamReq = null;
        const upstreamTimeout = setTimeout(() => {
          if (upstreamReq) upstreamReq.destroy(new Error('upstream timeout'));
        }, 30000);
        upstreamReq = pickTransport(base).request(
          base + '/v1/chat/completions',
          { method: 'POST', headers },
          (upRes) => {
            clearTimeout(upstreamTimeout);
            const target = res;
            for (const [k, v] of Object.entries(upRes.headers)) {
              if (['transfer-encoding', 'connection'].includes(k.toLowerCase())) continue;
              try { target.setHeader(k, v); } catch (_) {}
            }
            target.writeHead(upRes.statusCode || 502);
            upRes.pipe(target);
            upRes.on('end', () => resolve());
            upRes.on('error', () => resolve());
          }
        );
        upstreamReq.on('error', (e) => {
          clearTimeout(upstreamTimeout);
          if (idx + 1 < UPSTREAMS.length) { tryUpstream(idx + 1); }
          else if (!res.headersSent) {
            res.writeHead(502, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Upstream error: ' + e.message } }));
            resolve();
          } else { resolved204OrEnd(res); }
        });
        upstreamReq.on('timeout', () => upstreamReq.destroy(new Error('upstream timeout')));
        upstreamReq.write(JSON.stringify(payload));
        upstreamReq.end();
      };
      tryUpstream(0);
    });
    req.on('error', reject);
  });
}

function resolved204OrEnd(res) { try { res.end(); } catch (_) {} }

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, 'http://localhost');
  const urlPath = reqUrl.pathname;

  if (req.method === 'OPTIONS') {
    // CORS preflight
    applyCors(res);
    applySecurity(res);
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (req.method === 'POST' && urlPath === '/api/chat') {
      applyCors(res);
      applySecurity(res);
      await proxyOpenAI(req, res);
    } else if (req.method === 'GET' && urlPath === '/api/models') {
      applyCors(res);
      applySecurity(res);
      await serveModels(res);
    } else if (req.method === 'GET') {
      applySecurity(res);
      serveStatic(res, urlPath === '/' ? '/index.html' : urlPath);
    } else {
      applySecurity(res);
      res.writeHead(405); res.end('Method not allowed');
    }
  } catch (e) {
    if (!res.headersSent) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: e.message } }));
    }
  }
});

// Sajikan /api/models dengan cache singkat + fallback antar upstream.
function serveModels(res) {
  return new Promise((resolve) => {
    const now = Date.now();
    if (modelsCache && now - modelsCacheAt < MODELS_TTL * 1000) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(modelsCache);
      return resolve();
    }

    const tryUpstream = function (idx) {
      const base = UPSTREAMS[idx];
      if (!base) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: [] }));
        return resolve();
      }
      let modelsReq = null;
      const modelsTimer = setTimeout(() => {
        if (modelsReq) modelsReq.destroy(new Error('upstream timeout'));
        if (!res.headersSent) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ data: [] }));
        }
        resolve();
      }, 15000);
      modelsReq = pickTransport(base).get(
        base + '/v1/models',
        { headers: { accept: 'application/json' } },
        (upRes) => {
          clearTimeout(modelsTimer);
          const chunks = [];
          upRes.on('data', (c) => chunks.push(c));
          upRes.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            // Simpan cache hanya bila respons sukses & valid.
            try {
              const parsed = JSON.parse(body);
              if (upRes.statusCode === 200 && parsed && parsed.data) {
                modelsCache = body;
                modelsCacheAt = Date.now();
              }
            } catch (_) {}
            res.writeHead(upRes.statusCode || 200, { 'content-type': 'application/json' });
            res.end(upRes.statusCode === 200 ? body : JSON.stringify({ data: [] }));
            resolve();
          });
          upRes.on('error', () => { clearTimeout(modelsTimer); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ data: [] })); resolve(); });
        }
      );
      modelsReq.on('error', () => {
        clearTimeout(modelsTimer);
        if (idx + 1 < UPSTREAMS.length) { tryUpstream(idx + 1); }
        else { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ data: [] })); resolve(); }
      });
      modelsReq.on('timeout', () => modelsReq.destroy(new Error('upstream timeout')));
    };
    tryUpstream(0);
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Marbel AI UI listening on http://0.0.0.0:${PORT} (proxy -> ${UPSTREAMS.join(', ')})`);
});
