(function () {
  'use strict';
  const welcomeEl = document.getElementById('welcome');
  const messagesEl = document.getElementById('messages');
  const activeBadge = document.getElementById('activeBadge');
  const form = document.getElementById('form');
  const input = document.getElementById('input');
  const model = document.getElementById('model');
  const sendBtn = document.getElementById('send');
  const newThreadBtn = document.getElementById('newThread');
  const threadList = document.getElementById('threadList');
  const suggestions = document.getElementById('suggestions');
  const statusDot = document.getElementById('statusDot');
  const statusLabel = document.getElementById('statusLabel');
  const statusIcon = document.getElementById('statusIcon');
  const sideToggle = document.getElementById('sideToggle');
  const themeToggle = document.getElementById('themeToggle');
  const panelHide = document.getElementById('panelHide');
  const layoutEl = document.querySelector('.layout');

  if (window.innerWidth <= 768) {
    layoutEl.classList.add('collapsed');
    sideToggle.title = 'Tampilkan sidebar';
  }

  let busy = false;
  let threadId = 0;
  let threadCount = 0;
  let history = []; // {id, items:[{role,content}]}

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

  // Pesan AI yang siap untuk streaming
  function createAssistantMessage(rawText) {
    const wrap = document.createElement('div');
    wrap.className = 'msg assistant';
    const tag = document.createElement('div');
    tag.className = 'role-tag';
    tag.innerHTML = '<span class="agent-dot">&#10022;</span><span>Marbel AI</span><span class="model-tag"></span>';
    const body = document.createElement('div');
    body.className = 'body';
    const inner = document.createElement('div');
    inner.className = 'inner';
    body.appendChild(inner);
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
    body.appendChild(inner);
    body.appendChild(actions);
    wrap.appendChild(tag);
    wrap.appendChild(body);

    copyBtn.addEventListener('click', function () {
      const text = rawText || inner.textContent || '';
      copyToClipboard(text, copyBtn);
    });
    regenBtn.addEventListener('click', function () {
      const target = (rawText != null) ? rawText : '';
      regenerate(target, inner, tag, actions);
    });

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
  async function regenerate(rawText, inner, tag, actions) {
    if (busy) return;
    const current = history.find(function (h) { return h.id === threadId; });
    if (!current) return;

    // Temukan index pesan assistant yang sedang diperbarui.
    const itemIdx = rawText != null
      ? current.items.findIndex(function (i) { return i.role === 'assistant' && i.content === rawText; })
      : -1;

    const lastUserMsg = (function () {
      for (let i = current.items.length - 1; i >= 0; i--) {
        if (current.items[i].role === 'user') return current.items[i].content;
      }
      return null;
    })();

    if (lastUserMsg == null) return;

    busy = true;
    sendBtn.disabled = true;
    activeBadge.classList.add('show');
    setStatus('on', 'mengulangi jawaban…');
    inner.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
    actions.style.display = 'none';

    try {
      const msgs = buildThreadHistory();
      const built = await chatAnswer(msgs, model.value);
      const finalText = built.content;
      inner.innerHTML = decorateText(finalText);
      tag.querySelector('.model-tag').textContent = ' · ' + built.modelId.replace('-free', '');
      if (itemIdx >= 0) current.items[itemIdx].content = finalText;
      else current.items.push({ role: 'assistant', content: finalText, model: built.modelId });
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

  // Konfigurasi Backend
  const DEFAULT_BACKEND = 'https://marbel-ai.onrender.com';
  const FALLBACK_BACKEND = 'https://marbel-ai.onrender.com';
  const override = new URLSearchParams(window.location.search).get('backend');
  let backendInUse = override || DEFAULT_BACKEND;
  const isGitHubPages = window.location.hostname.indexOf('github.io') !== -1;

  const FREE_MODELS = [
    'mimo-v2.5-free', 'ling-3.0-flash-fin-free', 'nemotron-3-ultra-free',
    'laguna-s-2.1-free', 'deepseek-v4-flash-free', 'muse-spark-1.2-contributor-free',
    'nemotron-3.5-lightning-free', 'big-pickle',
  ];

  function apiBase() {
    if (!isGitHubPages) return '';
    return backendInUse;
  }
  const api = function (path) { return apiBase() + path; };

  // Ulangi operasi sampai berhasil memberikan respons (kesalahan server/jaringan).
  // Jeda antar percobaan bertingkat: 1s, 2s, 3s… maksimum 5 detik.
  async function retryUntilResponse(fn, label) {
    let attempt = 0;
    for (;;) {
      try {
        return await fn();
      } catch (err) {
        attempt++;
        const delay = Math.min(attempt, 5) * 1000;
        setStatusIcon('err');
        if (label) console.warn('[retry] ' + label + ' percobaan ke-' + attempt + ':', err.message);
        await new Promise(function (r) { setTimeout(r, delay); });
        setStatusIcon('on');
      }
    }
  }

  async function ensureBackend() {
    if (backendInUse !== FALLBACK_BACKEND) {
      try {
        const res = await fetch(backendInUse + '/api/models', { method: 'GET', headers: { accept: 'application/json' } });
        if (res.ok) return;
      } catch (e) {}
      backendInUse = FALLBACK_BACKEND;
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

    const fullText = await retryUntilResponse(async function () {
      const res = await fetch(api('/api/chat'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: modelId, messages, stream: false })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error('HTTP ' + res.status + ': ' + errText.slice(0, 100));
      }

      let data;
      try { data = await res.json(); }
      catch (e) { throw new Error('Upstream mengembalikan respons yang bukan JSON.'); }

      if (data.error) {
        throw new Error((data.error.message || 'HTTP ' + res.status) + ' (upstream error)');
      }

      let text = '';
      if (data.choices && data.choices[0]) {
        const c = data.choices[0].message || {};
        text = c.content || c.reasoning_content || '';
      }

      if (!text) {
        throw new Error('Upstream mengembalikan respons kosong (model tanpa isi)');
      }
      return text;
    }, 'chat ' + modelId);

    const words = fullText.split(' ');
    for (let i = 1; i <= words.length; i++) {
      const partial = words.slice(0, i).join(' ');
      if (onChunk) onChunk(partial, modelId);
      await new Promise(function (r) { setTimeout(r, 16); });
    }
    return fullText;
  }

  // Ambil jawaban lengkap dari 1 model (tanpa efek mengetik). Dipakai ensemble paralel.
  // Kesalahan diulang otomatis sampai model ini memberikan respons.
  function runOneModel(modelId, messages) {
    setStatus('on', 'menghubungi ' + modelId + '…');
    return retryUntilResponse(function () {
      return fetch(api('/api/chat'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: modelId, messages, stream: false })
      }).then(async function (res) {
        if (!res.ok) {
          const t = await res.text();
          throw new Error('HTTP ' + res.status + ': ' + t.slice(0, 100));
        }
        return res.json();
      }).then(function (data) {
        if (data.error) throw new Error((data.error.message || 'respons error') + ' (upstream)');
        let content = '';
        if (data.choices && data.choices[0]) {
          const c = data.choices[0].message || {};
          content = c.content || c.reasoning_content || '';
        }
        if (!content) throw new Error('Upstream mengembalikan respons kosong');
        return content;
      });
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

  async function chatAnswer(messages, selected, onChunk) {
    // Selalu jalankan SEMUA model paralel; jawaban lengkap tercepat yang ditampilkan.
    // Pilihan di dropdown hanya menentukan model mana yang dicoba lebih dulu di daftar,
    // tapi semua tetap berlomba.
    const order = resolveModelOrder(selected);
    const jobs = order.map(function (m) {
      return runOneModel(m, messages).then(function (content) { return { modelId: m, content: content }; });
    });
    const first = await firstFulfilled(jobs);
    await typeOut(first.content, function (p) { if (onChunk) onChunk(p, first.modelId); });
    return { content: first.content, modelId: first.modelId };
  }

  function buildThreadHistory() {
    const msgs = history.flatMap(function (h) {
      return h.items.map(function (i) {
        return { role: i.role, content: i.content };
      });
    });
    msgs.unshift({
      role: 'system',
      content: 'Kamu adalah Marbel AI. Saat ditanya siapa kamu, jawab sebagai Marbel AI. Jawab dengan bahasa Indonesia. Jangan gunakan tabel Markdown, jangan gunakan karakter "|", "---", atau "*". Balas ringkas, jelas, dan tanpa hiasan berlebihan.'
    });
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
      else {
        const msgEl = createAssistantMessage(i.content);
        msgEl.inner.innerHTML = decorateText(i.content);
        if (i.model) msgEl.tag.querySelector('.model-tag').textContent = ' · ' + i.model.replace('-free', '');
      }
    });
    updateThreadList();
  }

  function resize() {
    input.style.height = 'auto';
    input.style.height = Math.min(220, Math.max(48, input.scrollHeight)) + 'px';
  }

  async function onSend(rawText) {
    const text = (rawText != null ? rawText : input.value).trim();
    if (!text || busy) return;

    if (history.length === 0) newThread();

    busy = true;
    sendBtn.disabled = true;
    showChat();
    activeBadge.classList.add('show');
    input.value = '';
    resize();
    setStatus('on', 'memproses…');

    const current = history.find(function (h) { return h.id === threadId; });
    if (!current) return;
    current.items.push({ role: 'user', content: text });
    addUserMessage(text);

    const typing = typingIndicator();
    const selected = model.value;

    try {
      typing.remove();
      const msgEls = createAssistantMessage();

      const renderChunk = function (partial, modelId) {
        msgEls.inner.innerHTML = decorateText(partial);
        if (modelId && msgEls.tag) {
          msgEls.tag.querySelector('.model-tag').textContent = ' · ' + modelId.replace('-free', '');
        }
        scrollDown();
      };

      const built = await chatAnswer(buildThreadHistory(), selected, renderChunk);
      msgEls.inner.innerHTML = decorateText(built.content);
      msgEls.tag.querySelector('.model-tag').textContent = ' · ' + built.modelId.replace('-free', '');
      if (msgEls.actions) msgEls.actions.style.display = '';
      current.items.push({ role: 'assistant', content: built.content, model: built.modelId });
      setStatus('on', 'terhubung');
    } catch (err) {
      typing.remove();
      const friendly = 'Terjadi kesalahan saat menghubungi server.\nDetail: ' + err.message + '\n\nMohon tunggu beberapa saat lalu coba lagi.';
      current.items.push({ role: 'assistant', content: friendly });

      const errEl = createAssistantMessage(friendly);
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
    sideToggle.title = layoutEl.classList.contains('collapsed')
      ? 'Tampilkan sidebar'
      : 'Sembunyikan sidebar';
  });

  const setTheme = function (theme) {
    if (theme == null) {
      delete document.documentElement.dataset.theme;
      localStorage.removeItem('marbel-theme');
    } else {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem('marbel-theme', theme);
    }
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
  suggestions.addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-prompt]');
    if (btn) onSend(btn.getAttribute('data-prompt'));
  });

  const modelListEl = document.getElementById('modelNames');
  const modelCountEl = document.getElementById('modelCount');

  function renderModelNames(ids, activeIds) {
    modelListEl.innerHTML = '';
    ids.forEach(function (id) {
      const active = activeIds.indexOf(id) !== -1;
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'mname' + (active ? ' active' : ' locked');
      pill.textContent = id;
      pill.title = active ? 'Siap dipakai gratis' : 'Provider belum terhubung';
      pill.dataset.active = active ? '1' : '0';
      pill.addEventListener('click', function () { setModel(id); });
      modelListEl.appendChild(pill);
    });
    modelCountEl.textContent = ids.length + ' model siap pakai';
  }

  function setModel(id) {
    model.value = id;
    model.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

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
    Promise.resolve(isGitHubPages ? ensureBackend() : null)
      .then(function () { return fetch(api('/api/models')); })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        let all = (data.data || []).map(function (m) { return m.id; });
        const candidates = FREE_MODELS;
        candidates.forEach(function (id) {
          if (all.indexOf(id) === -1) all.push(id);
        });
        const ready = candidates.filter(function (id) { return all.indexOf(id) !== -1; });
        renderModelNames(ready, ready);
        populateModelSelect(ready, ready);
        setStatus('on', 'terhubung');
      })
      .catch(function () {
        setStatus('err', 'tak tersedia');
        modelCountEl.textContent = 'gagal memuat';
      });
  }

  newThread();
  loadModels();
})();
