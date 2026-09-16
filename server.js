const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 12000;
// Upstream OpenAI-compatible — model gratis dari daftar no-cost-ai
// (https://github.com/zebbern/no-cost-ai), tanpa API key:
//  1. uncloseai  (hermes.ai.unturf.com + qwen.ai.unturf.com) — Qwen 3.6 27B, bebas biaya.
//  2. pollinations (text.pollinations.ai) — GPT-OSS 20B, tier anonim.
// Cadangan tetap: OpenCode Zen (opencode.ai/zen, butuh X-Session-ID) dan
// freeapi (api.free.ai, model open-weight gratis).
const UPSTREAM = process.env.UPSTREAM || 'https://hermes.ai.unturf.com,https://qwen.ai.unturf.com,https://text.pollinations.ai,https://opencode.ai/zen,https://api.free.ai';
// Pemetaan model per upstream: saat failover tiba di upstream berikutnya,
// model yang tak dikenal di sana dipetakan ke model yang tersedia.
// Gunanya: model UI (mis. qwen3.6-27b) tidak ada di provider lain — peta ke
// model yang tersedia di sana agar failover tetap menghasilkan jawaban.
const UPSTREAM_MODEL_MAP = {
  'https://hermes.ai.unturf.com': {
    'qwen3.6-27b': 'Lorbus/Qwen3.6-27B-int4-AutoRound',
    'gpt-oss-20b': 'Lorbus/Qwen3.6-27B-int4-AutoRound',
    'nemotron-3.5-lightning-free': 'Lorbus/Qwen3.6-27B-int4-AutoRound',
    'big-pickle': 'Lorbus/Qwen3.6-27B-int4-AutoRound',
    'ling-3.0-flash-fin-free': 'Lorbus/Qwen3.6-27B-int4-AutoRound',
    'nemotron-3-ultra-free': 'Lorbus/Qwen3.6-27B-int4-AutoRound',
    'mimo-v2.5-free': 'Lorbus/Qwen3.6-27B-int4-AutoRound',
    'qwen7b': 'Lorbus/Qwen3.6-27B-int4-AutoRound',
    'qwen3-8b': 'Lorbus/Qwen3.6-27B-int4-AutoRound',
  },
  'https://qwen.ai.unturf.com': {
    'qwen3.6-27b': 'Lorbus/Qwen3.6-27B-int4-AutoRound',
    'gpt-oss-20b': 'Lorbus/Qwen3.6-27B-int4-AutoRound',
    'nemotron-3.5-lightning-free': 'Lorbus/Qwen3.6-27B-int4-AutoRound',
    'big-pickle': 'Lorbus/Qwen3.6-27B-int4-AutoRound',
    'ling-3.0-flash-fin-free': 'Lorbus/Qwen3.6-27B-int4-AutoRound',
    'nemotron-3-ultra-free': 'Lorbus/Qwen3.6-27B-int4-AutoRound',
    'mimo-v2.5-free': 'Lorbus/Qwen3.6-27B-int4-AutoRound',
    'qwen7b': 'Lorbus/Qwen3.6-27B-int4-AutoRound',
    'qwen3-8b': 'Lorbus/Qwen3.6-27B-int4-AutoRound',
  },
  'https://text.pollinations.ai': {
    'qwen3.6-27b': 'openai',
    'gpt-oss-20b': 'openai',
    'nemotron-3.5-lightning-free': 'openai',
    'big-pickle': 'openai',
    'ling-3.0-flash-fin-free': 'openai',
    'nemotron-3-ultra-free': 'openai',
    'mimo-v2.5-free': 'openai',
    'qwen7b': 'openai',
    'qwen3-8b': 'openai',
  },
  'https://api.free.ai': {
    'qwen3.6-27b': 'qwen7b',
    'gpt-oss-20b': 'qwen7b',
    'nemotron-3.5-lightning-free': 'qwen7b',
    'big-pickle': 'qwen7b',
    'ling-3.0-flash-fin-free': 'qwen7b',
    'nemotron-3-ultra-free': 'qwen7b',
    'mimo-v2.5-free': 'qwen7b',
    'qwen7b': 'qwen7b',
    'qwen3-8b': 'qwen3-8b',
  },
  'https://opencode.ai/zen': {
    'qwen3.6-27b': 'nemotron-3.5-lightning-free',
    'gpt-oss-20b': 'nemotron-3.5-lightning-free',
    'qwen7b': 'nemotron-3.5-lightning-free',
    'qwen3-8b': 'nemotron-3.5-lightning-free',
  },
};
// Payload tambahan per upstream (dipakai agar model memberi jawaban bersih):
// uncloseai memakai vLLM/Qwen yang andai berpikir, menaruh proses berpikir di
// dalam `content`. Setel `enable_thinking:false` supaya jawaban tidak dicampur
// proses berpikir.
const UPSTREAM_PAYLOAD = {
  'https://hermes.ai.unturf.com': { chat_template_kwargs: { enable_thinking: false } },
  'https://qwen.ai.unturf.com': { chat_template_kwargs: { enable_thinking: false } },
};
// Path prefix upstream. Zen menaruh API di `/zen/v1/...`, sehingga saat
// UPSTREAM hanya host (`https://opencode.ai`), set UPSTREAM_PREFIX='/zen'.
const UPSTREAM_PREFIX = process.env.UPSTREAM_PREFIX || '';
function chatUrl(base) {
  const b = base.replace(/\/$/, '');
  // Jika base sudah mengandung '/zen' dan prefix kosong, tambahkan '/v1'.
  if (!UPSTREAM_PREFIX && /\/zen$/.test(b)) return b + '/v1/chat/completions';
  return b + UPSTREAM_PREFIX + '/v1/chat/completions';
}
function modelsUrl(base) {
  const b = base.replace(/\/$/, '');
  if (!UPSTREAM_PREFIX && /\/zen$/.test(b)) return b + '/v1/models';
  return b + UPSTREAM_PREFIX + '/v1/models';
}
// Daftar upstream cadangan, dipisah koma. Server mencoba berurutan: jika
// UPSTREAM utama gagal (connect/timeout), lanjut ke berikutnya. Ini menambah
// ketahanan saat satu provider gratis sedang sibuk/down.
const UPSTREAMS = UPSTREAM.split(',').map(function (u) { return u.trim(); }).filter(Boolean);
function pickTransport(url) { return url.startsWith('https://') ? https : http; }
const API_KEY = process.env.API_KEY || '';
const USE_SSE = String(process.env.USE_SSE || '1');
// Mode proxy: default selalu `stream:false` (JSON biasa) demi keandalan dengan
// model gratis Zen. Bisa diubah via env bila upstream pendukung SSE stabil.
const FORCE_NO_STREAM = String(process.env.FORCE_NO_STREAM || '1');
// Session ID untuk free tier Zen (OpenCode): tanpa header ini, model gratis
// ditolak dengan "MissingSessionID". Dipakai bergiliran dari satu pool agar
// kuota harian tiap sesi tidak cepat habis; override via env bila perlu.
const SESSION_POOL_SIZE = Number(process.env.SESSION_POOL_SIZE || 16);
function makeSessionId(seed) {
  return 'marbelai-' + seed + '-' + Math.random().toString(36).slice(2, 10);
}
const SESSION_POOL = Array.from({ length: SESSION_POOL_SIZE }, function (_, i) {
  return makeSessionId(i);
});
let sessionCursor = 0;
function pickSessionId() {
  const id = SESSION_POOL[sessionCursor % SESSION_POOL.length];
  sessionCursor++;
  return id;
}
// Allow cross-origin calls (e.g. the GitHub Pages statically-served UI) to reach
// this backend's /api/chat. Restrict with a specific origin for production if desired.
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';
// Cache daftar model untuk mengurangi beban/rate-limit upstream.
const MODELS_TTL = Number(process.env.MODELS_TTL || 300); // detik
let modelsCache = null;
let modelsCacheAt = 0;

// Daftar model gratis (dari no-cost-ai) yang diizinkan lewat proxy.
// qwen3.6-27b & gpt-oss-20b dari uncloseai/pollinations (no-cost-ai);
// model Zen/Free.ai tetap dipakai sebagai cadangan saat failover.
const DEFAULT_MODELS = (
  process.env.MODELS_LIST || 'qwen3.6-27b,gpt-oss-20b,nemotron-3.5-lightning-free,big-pickle,ling-3.0-flash-fin-free,nemotron-3-ultra-free,mimo-v2.5-free,qwen7b,qwen3-8b'
).split(',').map(function (s) { return s.trim(); }).filter(Boolean);

const ROOT = __dirname;

const CORS_HEADERS = {
  'access-control-allow-origin': ALLOW_ORIGIN,
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Authorization, X-Session-ID',
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
  '.apk': 'application/vnd.android.package-archive',
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
        payload.model = process.env.DEFAULT_MODEL || 'qwen3.6-27b';
      }
      const isStream = USE_SSE === '1';
      const clientAuth = req.headers.authorization || '';
      const authHeader = clientAuth || (API_KEY ? 'Bearer ' + API_KEY : '');
      const headers = {
        'content-type': 'application/json',
        'accept': isStream ? 'text/event-stream' : (req.headers.accept || 'application/json'),
        'x-session-id': req.headers['x-session-id'] || pickSessionId(),
        'origin': 'https://opencode.ai/zen',
        'referer': 'https://opencode.ai/zen',
      };
      if (authHeader) headers.authorization = authHeader;

      // Jika klien tidak meminta streaming, paksa JSON biasa (default). Bila klien
      // mengirim `stream:true` eksplisit, biarkan sesuai permintaan.

      if (payload.stream === undefined && isStream) {
        payload.stream = FORCE_NO_STREAM !== '1';
      }

      // Coba tiap upstream berurutan: yang pertama berhasil dipakai.

      // Nemotron-Nemotron & model ringan lain suka lambat di Zen (kadang >30s).
      // Panjang timeout membuat respons lambat tetap bisa lolos tanpa gagal di
      // mode auto; di sisi klien, failover paralel tetap memilih yang tercepat.

      const tryUpstream = function (idx) {
        const base = UPSTREAMS[idx];
        if (!base) {
          if (!res.headersSent) {
            res.writeHead(502, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Semua upstream gagal' } }));
          } else { res.end(); }
          return resolve();
        }

        // Petakan model untuk upstream ini (agar failover antar provider
        // menghasilkan model yang valid). Body request tidak dimutasi global —
        // hanya untuk salinan yang dikirim ke upstream ini.
        let sendModel = payload.model;
        if (UPSTREAM_MODEL_MAP[base]) {
          const mapped = UPSTREAM_MODEL_MAP[base][payload.model];
          if (mapped) sendModel = mapped;
        }

        let upstreamReq = null;


        // Zen/Free.ai gratis kadang lambat (>30s) atau kena rate-limit (429).
        // Timeout agak panjang agar jawaban lambat tetap bisa lolos, tetapi
        // tetap di bawah AI_TIMEOUT_MS klien (60s) sehingga failover berjalan.
        const upstreamTimeoutMs = Math.min(45000, (30000 * (idx + 1)));
        const upstreamTimeout = setTimeout(() => {
          if (upstreamReq) upstreamReq.destroy(new Error('upstream timeout'));
        }, upstreamTimeoutMs);

        const failover = function () {
          if (idx + 1 < UPSTREAMS.length) {
            tryUpstream(idx + 1);
          } else if (!res.headersSent) {
            res.writeHead(502, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Semua upstream gagal' } }));
            resolve();
          } else { resolved204OrEnd(res); resolve(); }
        };

        upstreamReq = pickTransport(base).request(
          chatUrl(base),
          { method: 'POST', headers, timeout: upstreamTimeoutMs },
          (upRes) => {
            clearTimeout(upstreamTimeout);
            // Kegagalan dari upstream (429/4xx/5xx): coba cadangan bila ada.
            if (upRes.statusCode >= 400) {
              upRes.resume();
              if (idx + 1 < UPSTREAMS.length) {
                tryUpstream(idx + 1);
              } else {
                applyCors(res);
                const chunks = [];
                upRes.on('data', (c) => chunks.push(c));
                upRes.on('end', () => {
                  res.writeHead(upRes.statusCode || 502, { 'content-type': 'application/json' });
                  res.end(Buffer.concat(chunks).toString('utf8'));
                  resolve();
                });
              }
              return;
            }
            const target = res;
            for (const [k, v] of Object.entries(upRes.headers)) {
              const lk = k.toLowerCase();
              // Jangan salin header CORS dari upstream — milik klien harus
              // memakai aturan CORS server ini (ALLOW_ORIGIN), bukan upstream.
              if (lk === 'transfer-encoding' || lk === 'connection' || lk.indexOf('access-control-') === 0) continue;
              try { target.setHeader(k, v); } catch (_) {}
            }
            applyCors(res);
            target.writeHead(upRes.statusCode || 502);
            upRes.pipe(target);
            upRes.on('end', () => resolve());
            upRes.on('error', () => resolve());
          }
        );
        upstreamReq.on('error', (e) => {
          clearTimeout(upstreamTimeout);
          failover();
        });
        upstreamReq.on('timeout', () => upstreamReq.destroy(new Error('upstream timeout')));
        // Salinan payload khusus upstream: model yang dipetakan + parameter
        // tambahan (mis. enable_thinking:false untuk uncloseai).
        const upExtra = UPSTREAM_PAYLOAD[base] || {};
        const outPayload = Object.assign({}, payload, upExtra, { model: sendModel });
        upstreamReq.write(JSON.stringify(outPayload));
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

  if (process.env.DEBUG_LOG === '1') {
    console.log(`[req] ${req.method} ${urlPath}`);
  }

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

// Sajikan /api/models — daftar statis model gratis yang diizinkan.
// Model selalu diambil dari DEFAULT_MODELS (bukan dari upstream), sehingga UI
// menampilkan daftar yang konsisten dan tidak bergantung pada /v1/models upstream.
function serveModels(res) {
  const now = Date.now();
  if (modelsCache && now - modelsCacheAt < MODELS_TTL * 1000) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(modelsCache);
    return;
  }
  const list = DEFAULT_MODELS.map(function (id) { return { id: id, object: 'model' }; });
  modelsCache = JSON.stringify({ object: 'list', data: list });
  modelsCacheAt = Date.now();
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(modelsCache);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Marbel AI UI listening on http://0.0.0.0:${PORT} (proxy -> ${UPSTREAMS.join(', ')})`);
});
