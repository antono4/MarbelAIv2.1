(function () {
  'use strict';
  const welcomeEl = document.getElementById('welcome');
  const messagesEl = document.getElementById('messages');
  const activeBadge = document.getElementById('activeBadge');
  const form = document.getElementById('form');
  const input = document.getElementById('input');
  const model = document.getElementById('model');
  const sendBtn = document.getElementById('send');
  const mediaImageBtn = document.getElementById('mediaImage');
  const mediaVideoBtn = document.getElementById('mediaVideo');
  const mediaChips = Array.prototype.slice.call(document.querySelectorAll('.media-chip'));
  const newThreadBtn = document.getElementById('newThread');
  const threadList = document.getElementById('threadList');
  const statusDot = document.getElementById('statusDot');
  const statusLabel = document.getElementById('statusLabel');
  const statusIcon = document.getElementById('statusIcon');
  const sideToggle = document.getElementById('sideToggle');
  const themeToggle = document.getElementById('themeToggle');
  const panelHide = document.getElementById('panelHide');
  const layoutEl = document.querySelector('.layout');

  // ---- Scrim sidebar (mobile) -------------------------------------------
  // Panel sidebar di ponsel muncul di atas konten; scrim menutupnya saat
  // diketuk. Visibilitas scrim selalu disinkronkan dengan kelas `collapsed`
  // agar tidak perlu diperbarui manual di setiap tempat yang mengubahnya.
  const scrim = document.createElement('button');
  scrim.type = 'button';
  scrim.className = 'scrim';
  scrim.tabIndex = -1;
  scrim.setAttribute('aria-hidden', 'true');
  scrim.setAttribute('aria-label', 'Tutup sidebar');
  document.querySelector('.main').appendChild(scrim);

  function isNarrow() {
    return window.innerWidth <= 768;
  }

  function sidebarOpen() {
    return !layoutEl.classList.contains('collapsed');
  }

  function syncSidebar() {
    scrim.classList.toggle('show', isNarrow() && sidebarOpen());
    if (sideToggle) {
      const open = sidebarOpen();
      sideToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      sideToggle.title = open ? 'Sembunyikan sidebar' : 'Tampilkan sidebar';
      sideToggle.setAttribute('aria-label', sideToggle.title);
    }
    if (panelHide) panelHide.setAttribute('aria-expanded', sidebarOpen() ? 'true' : 'false');
  }

  scrim.addEventListener('click', function () {
    layoutEl.classList.add('collapsed');
  });

  new MutationObserver(syncSidebar).observe(layoutEl, {
    attributes: true,
    attributeFilter: ['class'],
  });
  window.addEventListener('resize', syncSidebar);

  if (isNarrow()) {
    // Di ponsel sidebar mulai tertutup agar percakapan langsung terlihat.
    layoutEl.classList.add('collapsed');
  }

  let busy = false;
  let threadId = 0;
  let threadCount = 0;
  let history = []; // {id, items:[{role,content,media?}]}
  let mediaMode = ''; // '' (chat) | 'image' | 'video'

  function setStatus(state, label) {
    statusDot.className = 'dot' + (state ? ' ' + state : '');
    if (label) statusLabel.textContent = label;
    if (statusIcon) statusIcon.classList.remove('show');
  }

  function setStatusIcon(state) {
    statusDot.className = 'dot' + (state ? ' ' + state : '');
    statusLabel.textContent = '';
    if (statusIcon) {
      statusIcon.classList.remove('on', 'err');
      if (state) statusIcon.classList.add(state);
      statusIcon.classList.add('show');
    }
  }

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Optimasi decorateText agar tidak berat saat streaming
  function decorateText(text) {
    const blockRe = /```([\s\S]*?)```/g;
    const parts = [];
    let last = 0, m;
    while ((m = blockRe.exec(text)) !== null) {
      const before = text.slice(last, m.index);
      const blockHtml = '<div class="code-block"><pre>' + esc(m[1]) + '</pre></div>';
      parts.push(before, { html: blockHtml });
      last = m.index + m[0].length;
    }
    parts.push(text.slice(last));
    return parts.map(function (p) {
      if (typeof p === 'object') return p.html;
      return esc(p).replace(/`([^`]+)`/g, '<code>$1</code>');
    }).join('');
  }

  function addUserMessage(content) {
    const el = document.createElement('div');
    el.className = 'msg user';
    if (content) {
      const body = document.createElement('div');
      body.className = 'ubody';
      body.textContent = content;
      el.appendChild(body);
    }
    messagesEl.appendChild(el);
    scrollDown();
    return el;
  }

  // Pesan AI yang siap untuk streaming.
  // `item` adalah objek riwayat yang dirender; tombol "Ulangi" memakai posisinya
  // di array, bukan salinan teks saat render, agar tetap benar setelah jawaban
  // diperbarui.
  function createAssistantMessage(item) {
    const wrap = document.createElement('div');
    wrap.className = 'msg assistant';
    const tag = document.createElement('div');
    tag.className = 'role-tag';
    // `.model-tag` sengaja dibiarkan kosong untuk chat: nama model upstream
    // tidak diumbar ke pengguna. Hanya label media (Flux/Video) yang diisi.
    tag.innerHTML = '<span class="agent-dot">&#10022;</span><span>Marbel AI</span><span class="model-tag"></span>';
    const body = document.createElement('div');
    body.className = 'body';
    const inner = document.createElement('div');
    inner.className = 'inner';
    // Baris aksi (copy / regenerate), diisi setelah jawaban final.
    const actions = document.createElement('div');
    actions.className = 'm-actions';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'm-act copy';
    copyBtn.textContent = 'Salin';
    const regenBtn = document.createElement('button');
    regenBtn.type = 'button';
    regenBtn.className = 'm-act regen';
    regenBtn.textContent = 'Ulangi';
    actions.appendChild(copyBtn);
    actions.appendChild(regenBtn);

    copyBtn.addEventListener('click', function () {
      copyToClipboard(inner.textContent || '', copyBtn);
    });
    regenBtn.addEventListener('click', function () {
      if (!item) return;
      const th = history.find(function (h) { return h.id === threadId; });
      regenerate(th ? th.items.indexOf(item) : -1, inner, tag, actions);
    });

    body.appendChild(inner);
    body.appendChild(actions);
    wrap.appendChild(tag);
    wrap.appendChild(body);

    messagesEl.appendChild(wrap);
    scrollDown();
    return { wrap: wrap, inner: inner, body: body, actions: actions, tag: tag };
  }

  function copyToClipboard(text, btn) {
    const done = function () {
      const old = btn.textContent;
      btn.textContent = 'Tersalin';
      btn.classList.add('ok');
      setTimeout(function () { btn.textContent = old; btn.classList.remove('ok'); }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else {
      fallbackCopy(text);
      done();
    }
  }

  // Setel mode media (gambar/video) dan tampilkan status pada tombol.
  function setMediaMode(mode) {
    mediaMode = mode;
    if (mediaImageBtn) {
      mediaImageBtn.classList.toggle('active', mode === 'image');
      mediaImageBtn.setAttribute('aria-pressed', mode === 'image' ? 'true' : 'false');
    }
    if (mediaVideoBtn) {
      mediaVideoBtn.classList.toggle('active', mode === 'video');
      mediaVideoBtn.setAttribute('aria-pressed', mode === 'video' ? 'true' : 'false');
    }
    mediaChips.forEach(function (chip) {
      const on = chip.getAttribute('data-media') === mode;
      chip.classList.toggle('active', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const ph = mode === 'image'
      ? 'Tulis deskripsi gambar (mis. kucing memakai topi astronot)…'
      : mode === 'video'
        ? 'Tulis deskripsi video (mis. robot menari di pantai) — hasil berupa ilustrasi beranimasi…'
        : 'Tanya apa saja ke Marbel AI…';
    input.placeholder = ph;
    input.focus();
  }

  // Bangun kartu media di dalam pesan assistant.
  // Kedua mode berakhir pada gambar dari pollinations: mode gambar menampilkannya
  // statis, mode video menampilkannya dengan animasi Ken Burns karena tidak ada
  // provider gratis yang menyajikan video dari URL GET. Elemen <img> memakai
  // no-cors (tanpa header Origin) sehingga dapat memuat dari provider; kegagalan
  // dideteksi via event onload/onerror.
  function createMediaCard(kind, prompt, url, onStateChange) {
    const isImg = kind === 'image';
    const label = isImg ? 'Membuat gambar…' : 'Membuat ilustrasi video…';
    const card = document.createElement('div');
    card.className = 'media-card';
    card.innerHTML =
      '<div class="media-head"><span class="media-ico">' + (isImg ? '🎨' : '🎬') + '</span><span class="media-label">' + label + '</span></div>' +
      '<div class="media-body">' +
      '<div class="media-skel"><span class="media-spin"></span><span class="media-loading">' + label + '</span></div>' +
      (isImg
        ? '<a class="media-thumb" href="' + url + '" target="_blank" rel="noopener" style="display:none"><img class="media-img" src="' + url + '" alt="' + esc(prompt) + '" /></a>'
        : '<div class="media-burns-wrap" style="display:none"><img class="media-burns" src="' + url + '" alt="' + esc(prompt) + '" /></div>') +
      '</div>' +
      '<div class="media-caption">' + esc(prompt) + '</div>' +
      '<div class="media-actions">' +
      '<a class="m-act link" href="' + url + '" target="_blank" rel="noopener" style="display:none">Buka gambar</a>' +
      '</div>';

    const skel = card.querySelector('.media-skel');
    const thumb = card.querySelector('.media-thumb');
    const burnsWrap = card.querySelector('.media-burns-wrap');
    const link = card.querySelector('.link');
    const img = card.querySelector(isImg ? '.media-img' : '.media-burns');
    let done = false;

    const showResult = function (ok) {
      if (done) return;
      done = true;
      const lbl = card.querySelector('.media-label');
      if (ok) {
        if (skel) skel.style.display = 'none';
        if (thumb) thumb.style.display = '';
        if (burnsWrap) burnsWrap.style.display = '';
        if (link) link.style.display = '';
        if (lbl) lbl.textContent = isImg ? 'Gambar siap' : 'Ilustrasi video siap';
        if (onStateChange) onStateChange(true);
      } else {
        if (link) link.style.display = '';
        if (skel) {
          skel.innerHTML = '<span class="media-err">Gagal memuat gambar. Provider mungkin sedang sibuk — coba lagi.</span>';
        }
        if (lbl) lbl.textContent = isImg ? 'Gambar gagal' : 'Ilustrasi gagal';
        if (onStateChange) onStateChange(false);
      }
    };

    img.addEventListener('load', function () { showResult(true); });
    img.addEventListener('error', function () { showResult(false); });

    return card;
  }

  // Muat ulang isi media ke elemen pesan (dipakai saat pindah thread).
  function renderMediaInto(msgEl, media) {
    if (!media || !msgEl) return;
    msgEl.inner.innerHTML = '';
    msgEl.inner.appendChild(createMediaCard(media.kind, media.prompt, media.url, null));
    if (msgEl.tag) {
      msgEl.tag.querySelector('.model-tag').textContent = media.kind === 'image' ? ' · Flux' : ' · Ilustrasi';
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  // Ulangi: tulis ulang pesan assistant terakhir pada thread aktif.
  async function regenerate(itemIdx, inner, tag, actions) {
    if (busy) return;
    const current = history.find(function (h) { return h.id === threadId; });
    if (!current) return;

    // Fallback: tanpa index, pakai jawaban assistant terakhir.
    if (itemIdx == null || itemIdx < 0 || !current.items[itemIdx]) {
      itemIdx = -1;
      for (let i = current.items.length - 1; i >= 0; i--) {
        if (current.items[i].role === 'assistant') { itemIdx = i; break; }
      }
    }
    if (itemIdx < 0) return;

    // Hanya jawaban terakhir yang boleh diulang. Kalau sudah ada pesan user
    // sesudahnya, jawaban ini bukan lagi ujung percakapan — mengulangnya akan
    // menimpa konteks yang sudah berjalan.
    const hasUserAfter = current.items.some(function (i, i2) {
      return i2 > itemIdx && i.role === 'user';
    });
    if (hasUserAfter) {
      setStatus('err', 'hanya jawaban terakhir yang bisa diulang');
      return;
    }
    const hasUserBefore = current.items.some(function (i, i2) {
      return i2 < itemIdx && i.role === 'user';
    });
    if (!hasUserBefore) return;

    busy = true;
    sendBtn.disabled = true;
    activeBadge.classList.add('show');
    setStatus('on', 'mengulangi jawaban…');
    inner.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
    actions.style.display = 'none';

    try {
      // Jawaban lama dibuang dari konteks, kalau tidak model hanya menyalinnya.
      const msgs = buildThreadHistory(itemIdx);
      const built = await chatAnswer(msgs, model.value);
      const finalText = built.content;
      inner.innerHTML = decorateText(finalText);
      current.items[itemIdx] = { role: 'assistant', content: finalText, model: built.modelId };
      setStatus('on', 'terhubung');
    } catch (err) {
      inner.innerHTML = decorateText('Terjadi kesalahan saat mengulangi jawaban.\nDetail: ' + err.message);
      tag.querySelector('.model-tag').textContent = '';
      setStatus('err', 'gagal');
    } finally {
      actions.style.display = '';
      busy = false;
      sendBtn.disabled = false;
      activeBadge.classList.remove('show');
      updateThreadList();
      scrollDown();
    }
  }

  function typingIndicator() {
    const wrap = document.createElement('div');
    wrap.className = 'msg assistant';
    const tag = document.createElement('div');
    tag.className = 'role-tag';
    tag.innerHTML = '<span class="agent-dot">&#10022;</span><span>Marbel AI</span>';
    const body = document.createElement('div');
    body.className = 'body';
    body.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
    wrap.appendChild(tag);
    wrap.appendChild(body);
    messagesEl.appendChild(wrap);
    scrollDown();
    return wrap;
  }

  let scrollTimeout;
  function scrollDown() {
    // Throttle scroll untuk mencegah lag saat streaming
    if (scrollTimeout) return;
    scrollTimeout = setTimeout(function() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
      scrollTimeout = null;
    }, 50);
  }

  function showChat() {
    welcomeEl.style.display = 'none';
  }

// Konfigurasi Model — sumber: https://github.com/zebbern/no-cost-ai
// Model gratis yang aktif lewat backend proxy (server.js):
//  - uncloseai (hermes.ai.unturf.com & qwen.ai.unturf.com) — Qwen 3.8 27B gratis, tanpa API key.
//  - pollinations (text.pollinations.ai) — GPT-OSS 20B (tier anonim).
//  - Free.ai (api.free.ai) — model open-weight gratis tanpa API key.
// Model dipanggil via /api/chat (proxy CORS).
const FREE_MODELS = [
  'qwen3.8-27b',
  'gpt-oss-20b',
  'qwen3-8b',
];

// Konfigurasi model → upstream (dipakai pada mode langsung GitHub Pages).
// Provider yang menyediakan CORS lintas origin sehingga frontend statis bisa
// memanggil API-nya langsung dari browser tanpa backend proxy:
//  - uncloseai (hermes.ai.unturf.com, qwen.ai.unturf.com) — CORS '*' aktif.
//  - pollinations (text.pollinations.ai) — CORS '*', model alias `openai`.
//  - Free.ai (api.free.ai) — CORS origin dicerminkan, hanya model self-hosted.
// Model UI dipetakan ke nama model yang dikenal tiap upstream (mirip UPSTREAM_MODEL_MAP server).
const DIRECT_UPSTREAMS = [
  'https://hermes.ai.unturf.com',
  'https://qwen.ai.unturf.com',
  'https://text.pollinations.ai',
  'https://api.free.ai',
];
const DIRECT_PAYLOAD = {
  'https://hermes.ai.unturf.com': { chat_template_kwargs: { enable_thinking: false } },
  'https://qwen.ai.unturf.com': { chat_template_kwargs: { enable_thinking: false } },
  'https://text.pollinations.ai': {},
  'https://api.free.ai': {},
};
// uncloseai kini hanya melayani satu model: turboderp/Qwen3.8-27B-exl3.
// pollinations mengenali alias `openai` (GPT-OSS 20B); free.ai hanya qwen7b/qwen3-8b.
const UNCLOSEAI_MODEL = 'turboderp/Qwen3.8-27B-exl3';
const DIRECT_MODEL_MAP = {
  'https://hermes.ai.unturf.com': {
    'qwen3.8-27b': UNCLOSEAI_MODEL,
    'gpt-oss-20b': UNCLOSEAI_MODEL,
    'qwen3-8b': UNCLOSEAI_MODEL,
  },
  'https://qwen.ai.unturf.com': {
    'qwen3.8-27b': UNCLOSEAI_MODEL,
    'gpt-oss-20b': UNCLOSEAI_MODEL,
    'qwen3-8b': UNCLOSEAI_MODEL,
  },
  'https://text.pollinations.ai': {
    'qwen3.8-27b': 'openai',
    'gpt-oss-20b': 'openai',
    'qwen3-8b': 'openai',
  },
  'https://api.free.ai': {
    'qwen3.8-27b': 'qwen7b',
    'gpt-oss-20b': 'qwen7b',
    'qwen3-8b': 'qwen3-8b',
  },
};
function directChatUrl(base) {
  const b = base.replace(/\/$/, '');
  // pollinations menaruh endpoint OpenAI-compatible di `/openai`, bukan `/v1`.
  if (b === 'https://text.pollinations.ai') return b + '/openai';
  return b + '/v1/chat/completions';
}
function directChat(messages, model) {
  const baseError = [];
  // Failover berurutan: coba tiap upstream sampai ada yang berhasil.
  const tryFrom = function (idx) {
    const base = DIRECT_UPSTREAMS[idx];
    if (!base) {
      const joined = '(' + baseError.join(' · ') + ')' || 'Semua upstream gagal.';
      return Promise.reject(new Error('Langsung: ' + joined));
    }
    const url = directChatUrl(base);
    const upModel = (DIRECT_MODEL_MAP[base] && DIRECT_MODEL_MAP[base][model]) || model;
    const payload = Object.assign({}, DIRECT_PAYLOAD[base] || {}, {
      model: upModel,
      messages: messages,
      stream: false,
    });
    const headers = { 'content-type': 'application/json' };
    const hardT = withTimeout(fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
    }), AI_TIMEOUT_MS);
    return hardT.then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          throw new Error('HTTP ' + res.status + (t ? ': ' + t.slice(0, 100) : ''));
        });
      }
      return res.json();
    }).then(function (data) {
      if (data && data.error) {
        throw new Error(data.error.message || data.error || 'Upstream error');
      }
      let text = '';
      if (data && data.choices && data.choices[0]) {
        const c = data.choices[0].message || {};
        text = c.content || c.reasoning_content || '';
      }
      if (typeof data === 'string') text = data;
      if (!text) throw new Error('Model tanpa isi');
      return { text: text, realModel: (data && data.model) || model };
    }).catch(function (err) {
      baseError.push(base + ' → ' + err.message);
      return tryFrom(idx + 1);
    });
  };
  return tryFrom(0);
}

// Backend proxy.
//  - Bila halaman disajikan oleh server.js (host kerja/Render/Railway/Docker),
//    pakai origin yang sama (relative: '' → /api/chat).
//  - Bila halaman statis di GitHub Pages atau dibungkus sebagai aplikasi
//    Android (Capacitor), panggil provider langsung dari browser (CORS) —
//    tanpa perlu backend terpisah → tetap berjalan 24/7.
//    Tetap bisa dioverride dengan ?frontend=URL agar memakai proxy sendiri.
const isGitHubPages = window.location.hostname.indexOf('github.io') !== -1;
// Capacitor menyajikan aset dari https://localhost di dalam WebView native;
// origin itu tidak punya /api/chat, jadi aplikasi Android selalu mode langsung.
const isNativeApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const DEFAULT_BACKEND = '';
const FALLBACK_BACKEND = '';
// Cadangan untuk aplikasi Android: proxy publik milik proyek ini. Dipakai hanya
// bila provider langsung menolak (mis. rate-limit per-IP), sehingga APK tetap
// berfungsi tanpa bergantung pada satu jalur saja.
const NATIVE_FALLBACK_BACKEND = 'https://marbel-ai.onrender.com';
const FRONTEND_OVERRIDE = new URLSearchParams(window.location.search).get('frontend');
let backendInUse = FRONTEND_OVERRIDE || DEFAULT_BACKEND;
const api = function (path) { return backendInUse + path; };

// Media generation (gambar & video).
//  - Gambar: image.pollinations.ai (Flux/Sana, gratis tanpa API key, CORS aktif).
//    URL yang dihasilkan dipakai langsung sebagai src <img>.
//  - Video : TIDAK ada provider gratis yang menyajikan video dari URL GET, jadi
//    kartu video memakai jalur "ilustrasi animasi": gambar dari pollinations
//    dengan efek Ken Burns (lihat createMediaCard).
const IMAGE_ENDPOINT = 'https://image.pollinations.ai/prompt/';
const IMAGE_WIDTH = 768;
const IMAGE_HEIGHT = 768;
const IMAGE_MODEL = 'flux';

function buildImageUrl(prompt) {
  const q = encodeURIComponent(prompt);
  const seed = Math.floor(Math.random() * 100000);
  return IMAGE_ENDPOINT + q + '?width=' + IMAGE_WIDTH + '&height=' + IMAGE_HEIGHT +
    '&model=' + encodeURIComponent(IMAGE_MODEL) + '&nologo=true&seed=' + seed;
}

const AI_TIMEOUT_MS = 60000;
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise(function (resolveTimeout) {
      setTimeout(function () {
        const msg = 'Waktu tunggu habis (' + Math.round(ms / 1000) + ' detik). Silakan coba lagi.';
        resolveTimeout(new Error(msg));
      }, ms);
    }),
  ]);
}

// Pilih backend yang sehat: coba yang aktif, gagal → cadangan.
// Pada mode langsung (tanpa backend), tidak melakukan apa-apa.
async function ensureBackend() {
  return;
}

// Ambil jawaban lengkap dari backend proxy (OpenAI-compatible /api/chat).
// Kalau model tak dikenal upstream, server mengisi default; klien tetap
// mengirim model agar info di tag jawaban akurat.
async function backendChat(messages, model, baseOverride) {
  await ensureBackend();
  const res = await withTimeout(fetch((baseOverride || backendInUse) + '/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: model, messages: messages, stream: false }),
  }), AI_TIMEOUT_MS);

  if (!res.ok) {
    const text = await res.text().catch(function () { return ''; });
    throw new Error('HTTP ' + res.status + (text ? ': ' + text.slice(0, 120) : ''));
  }
  const data = await res.json().catch(function () { throw new Error('Respons bukan JSON'); });
  if (data.error) throw new Error(data.error.message || data.error || 'Upstream error');
  let text = '';
  if (data.choices && data.choices[0]) {
    const c = data.choices[0].message || {};
    text = c.content || c.reasoning_content || '';
  }
  if (typeof data === 'string') text = data;
  if (!text) throw new Error('Model tanpa isi');
  return { text: text, realModel: data.model || model };
}

// Kembalikan {text, realModel}. Pada GitHub Pages / aplikasi Android (tanpa
// override frontend) provider dipanggil langsung (CORS); pada aplikasi Android
// proxy cadangan ditambahkan sebagai jaring pengaman bila provider menolak.
async function modelChat(messages, model) {
  const errs = [];
  const attempts = [];
  const useDirect = (isGitHubPages || isNativeApp) && !FRONTEND_OVERRIDE;
  if (useDirect) {
    attempts.push({ label: 'Langsung', run: function () { return directChat(messages, model); } });
    if (isNativeApp) {
      attempts.push({
        label: 'Cadangan',
        run: function () { return backendChat(messages, model, NATIVE_FALLBACK_BACKEND); },
      });
    }
  } else {
    attempts.push({ label: 'Backend', run: function () { return backendChat(messages, model); } });
  }
  for (const attempt of attempts) {
    try {
      return await attempt.run();
    } catch (err) {
      errs.push(attempt.label + ': ' + err.message);
    }
  }
  throw new Error(errs.join(' · ') || 'Semua jalur gagal.');
}


  // Ulangi operasi sampai berhasil memberikan respons (kesalahan server/jaringan).
  // Jeda antar percobaan bertingkat: 1s, 2s, 3s… maksimum 5 detik.
  async function retryUntilResponse(fn, label) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (attempt >= 3) throw err;
        const delay = Math.min(attempt, 5) * 1000;
        setStatusIcon('err');
        if (label) console.warn('[retry] ' + label + ' percobaan ke-' + attempt + ':', err.message);
        await new Promise(function (r) { setTimeout(r, delay); });
        setStatusIcon('on');
      }
    }
  }


  // ==================== Modul chat (streaming & ensemble) ====================
  // Semua fungsi memakai `stream:false` (JSON biasa) untuk keandalan dengan
  // model gratis (yang kadang tidak stabil untuk SSE), lalu efek mengetik
  // disimulasikan di sisi klien agar tetap terasa responsif.

  // Kirim ke 1 model, tunggu jawaban lengkap, lalu beri efek mengetik.
  // Kesalahan server/jaringan diulang otomatis sampai dapat respons.
  async function streamChat(modelId, messages, onChunk) {
  setStatus('on', 'mencoba model: ' + modelId + '…');
  const out = await retryUntilResponse(function () {
    return modelChat(messages, modelId);
  }, 'chat ' + modelId);
  const fullText = out.text;
  const words = fullText.split(' ');
  for (let i = 1; i <= words.length; i++) {
    const partial = words.slice(0, i).join(' ');
    if (onChunk) onChunk(partial, modelId);
    await new Promise(function (r) { setTimeout(r, 16); });
  }
  return out;
}
  // Ambil jawaban lengkap dari 1 model (tanpa efek mengetik). Dipakai ensemble paralel.
  // Kesalahan diulang otomatis sampai model ini memberikan respons.
function runOneModel(modelId, messages) {
  setStatus('on', 'menghubungi ' + modelId + '…');
  return retryUntilResponse(function () {
    return modelChat(messages, modelId);
  }, 'ensemble ' + modelId);
}
  // Resolve dengan nilai pertama yang sukses di antara banyak Promise.
  // Semua model dijalankan paralel; yang paling cepat selesai & berhasil yang menang.
  function firstFulfilled(promises) {
    return new Promise(function (resolve, reject) {
      let pending = promises.length;
      if (pending === 0) { reject(new Error('Tidak ada model untuk dicoba.')); return; }
      let done = false;
      let lastErr = null;
      function onFulfill(value) {
        if (done) return;
        done = true;
        resolve(value);
      }
      function onReject(err) {
        lastErr = err;
        pending--;
        if (pending === 0 && !done) reject(lastErr || new Error('Semua model gagal.'));
      }
      promises.forEach(function (p) { p.then(onFulfill, onReject); });
    });
  }

  // Urutan model yang dicoba: model pilihan dulu (bila dipilih), sisanya gratis.
  function resolveModelOrder(selected) {
    const order = [];
    if (selected && selected !== 'semua') order.push(selected);
    FREE_MODELS.forEach(function (m) {
      if (order.indexOf(m) === -1) order.push(m);
    });
    return order;
  }

  // Pusat logika chat.
  //  - Mode "semua": jalankan semua model paralel, ambil jawaban lengkap pertama.
  //  - Mode single : coba model berurutan, failover ke cadangan saat 4xx/5xx/upstream.
  // Kembali dengan efek mengetik lalu resolve {content, modelId}.
  function typeOut(text, onChunk) {
    const words = text.split(' ');
    return (function step(i) {
      if (i > words.length) return;
      if (onChunk) onChunk(words.slice(0, i).join(' '));
      if (i < words.length) return new Promise(function (r) { setTimeout(function () { r(step(i + 1)); }, 1.4); });
    }(1));
  }

  function isNetworkError(err) {
    return err instanceof TypeError;
  }

  async function chatAnswer(messages, selected, onChunk) {
    const order = resolveModelOrder(selected);
    let first = null;
    if (selected === 'semua') {
      // Mode auto: jalankan SEMUA model paralel, jawaban lengkap tercepat yang menang.


      const jobs = order.map(function (m) {
        return runOneModel(m, messages).then(function (out) { return { modelId: out.realModel || m, content: out.text }; });
      });
      first = await firstFulfilled(jobs);
    } else {
      // Mode single: coba model pilihan dulu,, lalu failover berurutan ke cadangan
      // saat error 4xx/5xx/rate-limit/upstream. Error non-HTTP (NetworkError)
      // langsung gagal tanpa coba cadangan.



      for (let i = 0; i < order.length; i++) {
        const m = order[i];
        try {
          const out = await runOneModel(m, messages);
          first = { modelId: out.realModel || m, content: out.text };
          break;
        } catch (err) {
          if (isNetworkError(err)) throw err;
          if (i === order.length - 1) throw err;
        }
      }
    }
    await typeOut(first.content, function (p) { if (onChunk) onChunk(p, first.modelId); });
    return { content: first.content, modelId: first.modelId };
  }

  function buildThreadHistory(skipIndex) {
    const systemMsg = {
      role: 'system',
      content: 'Kamu adalah Marbel AI. Saat ditanya siapa kamu, jawab sebagai Marbel AI. Jawab dengan bahasa Indonesia. Jangan gunakan tabel Markdown, jangan gunakan karakter "|", "---", atau "*". Balas ringkas, jelas, dan tanpa hiasan berlebihan.'
    };
    const th = history.find(function (h) { return h.id === threadId; });
    if (!th) return [systemMsg];
    // Pesan media (gambar/video) tidak dikirim sebagai teks ke model chat.
    // skipIndex dipakai oleh "Ulangi": jawaban lama dibuang dari konteks supaya
    // model benar-benar menjawab ulang, bukan menyalin jawaban sebelumnya.
    const msgs = th.items.filter(function (i, idx) {
      return !i.media && idx !== skipIndex;
    }).map(function (i) {
      return { role: i.role, content: i.content };
    });
    msgs.unshift(systemMsg);
    return msgs;
  }

  function updateThreadList() {
    threadList.innerHTML = '';
    history.forEach(function (h) {
      const li = document.createElement('li');
      li.className = 'thread-item' + (h.id === threadId && !busy ? ' active' : '');
      const first = h.items.find(function (i) { return i.role === 'user'; });
      const name = (first ? first.content : 'Thread ' + h.id);
      li.innerHTML = '<span class="tid">#' + h.id + '</span><span class="tname">' + esc(name.slice(0, 40)) + '</span>';
      li.addEventListener('click', function () {
        if (window.innerWidth <= 768) layoutEl.classList.add('collapsed');
        loadThread(h.id);
      });
      threadList.appendChild(li);
    });
  }

  function newThread() {
    threadId = ++threadCount;
    history.push({ id: threadId, items: [] });
    messagesEl.innerHTML = '';
    welcomeEl.style.display = '';
    activeBadge.classList.remove('show');
    input.value = '';
    setMediaMode('');
    resize();
    updateThreadList();
  }

  function loadThread(id) {
    const th = history.find(function (h) { return h.id === id; });
    if (!th || busy) return;
    threadId = id;
    messagesEl.innerHTML = '';
    welcomeEl.style.display = 'none';
    activeBadge.classList.remove('show');
    th.items.forEach(function (i) {
      if (i.role === 'user') addUserMessage(i.content);
      else if (i.media) {
        const msgEl = createAssistantMessage(i);
        renderMediaInto(msgEl, i.media);
        // Media tidak bisa diulang/di-copy sebagai teks.
        if (msgEl.actions) msgEl.actions.style.display = 'none';
      }
      else {
        const msgEl = createAssistantMessage(i);
        msgEl.inner.innerHTML = decorateText(i.content);
      }
    });
    updateThreadList();
    scrollDown();
  }

  function resize() {
    input.style.height = 'auto';
    input.style.height = Math.min(220, Math.max(48, input.scrollHeight)) + 'px';
  }

  // Hasilkan URL gambar dari teks via image.pollinations.ai (Flux, gratis).
  function generateImage(prompt) {
    return buildImageUrl(prompt);
  }

  async function onSend(rawText) {
    const text = (rawText != null ? rawText : input.value).trim();
    const mode = mediaMode;
    // Saat mode media aktif, text = prompt media; mode tidak memicu chat.
    if (!text || busy) return;

    if (history.length === 0) newThread();

    busy = true;
    sendBtn.disabled = true;
    showChat();
    activeBadge.classList.add('show');
    input.value = '';
    resize();
    setStatus('on', mode === 'image' ? 'membuat gambar…' : mode === 'video' ? 'membuat video…' : 'memproses…');

    const current = history.find(function (h) { return h.id === threadId; });
    if (!current) return;
    current.items.push({ role: 'user', content: text });
    addUserMessage(text);

    // Mode gambar/video: alur tanpa chat model. Keduanya memakai gambar
    // pollinations; mode video menampilkannya sebagai ilustrasi beranimasi.
    if (mode === 'image' || mode === 'video') {
      const url = generateImage(text);
      const cur = history.find(function (h) { return h.id === threadId; });
      if (!cur) return;
      const content = (mode === 'image' ? '[Gambar] ' : '[Ilustrasi video] ') + text;
      const item = { role: 'assistant', content: content, media: { kind: mode, prompt: text, url: url } };
      cur.items.push(item);
      const msgEl = createAssistantMessage(item);
      msgEl.inner.innerHTML = '';
      const card = createMediaCard(mode, text, url, function (ok) {
        setStatus(ok ? 'on' : 'err', ok ? 'terhubung' : 'gagal memuat media');
      });
      msgEl.inner.appendChild(card);
      msgEl.tag.querySelector('.model-tag').textContent = mode === 'image' ? ' · Flux' : ' · Ilustrasi';
      if (msgEl.actions) msgEl.actions.style.display = 'none';
      scrollDown();
      busy = false;
      sendBtn.disabled = false;
      activeBadge.classList.remove('show');
      setMediaMode('');
      updateThreadList();
      return;
    }

    const typing = typingIndicator();
    const selected = model.value;

    try {
      typing.remove();
      // Item riwayat dibuat lebih dulu supaya tombol "Ulangi" punya rujukan
      // index yang stabil sejak awal streaming.
      const item = { role: 'assistant', content: '' };
      const itemIdx = current.items.length;
      current.items.push(item);
      const msgEls = createAssistantMessage(item);

      const renderChunk = function (partial) {
        msgEls.inner.innerHTML = decorateText(partial);
        scrollDown();
      };

      // itemIdx dibuang dari konteks: isinya masih kosong saat request dibuat.
      const built = await chatAnswer(buildThreadHistory(itemIdx), selected, renderChunk);
      msgEls.inner.innerHTML = decorateText(built.content);
      item.content = built.content;
      item.model = built.modelId;
      if (msgEls.actions) msgEls.actions.style.display = '';
      setStatus('on', 'terhubung');
    } catch (err) {
      typing.remove();
      const friendly = 'Terjadi kesalahan saat menghubungi server.\nDetail: ' + err.message + '\n\nMohon tunggu beberapa saat lalu coba lagi.';
      const item = { role: 'assistant', content: friendly };
      current.items.push(item);

      const errEl = createAssistantMessage(item);
      errEl.wrap.classList.add('err');
      errEl.inner.innerHTML = decorateText(friendly);
      errEl.actions.style.display = 'none';

      setStatus('err', 'gagal');
    } finally {
      busy = false;
      sendBtn.disabled = false;
      activeBadge.classList.remove('show');
      updateThreadList();
    }
  }
      

  form.addEventListener('submit', function (e) { e.preventDefault(); onSend(); });
  input.addEventListener('input', resize);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
  });
  newThreadBtn.addEventListener('click', function () {
    if (window.innerWidth <= 768) layoutEl.classList.add('collapsed');
    newThread();
  });
  sideToggle.addEventListener('click', function () {
    layoutEl.classList.toggle('collapsed');
  });

  const setTheme = function (theme) {
    if (theme == null) {
      delete document.documentElement.dataset.theme;
      localStorage.removeItem('marbel-theme');
    } else {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem('marbel-theme', theme);
    }
    if (themeToggle) themeToggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  };

  const savedTheme = localStorage.getItem('marbel-theme');
  if (savedTheme == null) {
    if (window.matchMedia('(prefers-color-scheme:dark)').matches) {
      document.documentElement.dataset.theme = 'dark';
    }
  } else {
    setTheme(savedTheme);
  }

  let themeDark = document.documentElement.dataset.theme === 'dark';
  themeToggle.setAttribute('aria-pressed', themeDark ? 'true' : 'false');
  themeToggle.addEventListener('click', function () {
    themeDark = !themeDark;
    setTheme(themeDark ? 'dark' : 'light');
  });

  panelHide.addEventListener('click', function () {
    layoutEl.classList.toggle('collapsed');
    panelHide.title = layoutEl.classList.contains('collapsed')
      ? 'Tampilkan panel'
      : 'Sembunyikan panel';
  });
  if (mediaImageBtn) {
    mediaImageBtn.addEventListener('click', function () { setMediaMode(mediaMode === 'image' ? '' : 'image'); });
  }
  if (mediaVideoBtn) {
    mediaVideoBtn.addEventListener('click', function () { setMediaMode(mediaMode === 'video' ? '' : 'video'); });
  }

  // Chip "Buat Gambar/Video" di layar sambutan: aktifkan mode media yang sama
  // seperti tombol di composer.
  mediaChips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      const m = chip.getAttribute('data-media');
      setMediaMode(mediaMode === m ? '' : m);
      input.focus();
    });
  });

  function populateModelSelect(allIds, usableIds) {
    const seen = {};
    const merged = [];
    usableIds.concat(allIds).forEach(function (id) {
      if (!seen[id]) { seen[id] = 1; merged.push(id); }
    });
    model.innerHTML = '';
    const semua = document.createElement('option');
    semua.value = 'semua';
    semua.textContent = 'Auto Model (Tercepat)';
    model.appendChild(semua);
    merged.forEach(function (id) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id;
      model.appendChild(opt);
    });
    model.value = 'semua';
  }

function loadModels() {
  populateModelSelect(FREE_MODELS, FREE_MODELS);
  setStatus('on', 'terhubung');
}

  newThread();
  syncSidebar();
  ensureBackend().then(function () {
    loadModels();
  }).catch(function () {
    loadModels();
  });
})();
