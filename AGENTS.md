# Marbel AI — Catatan Repo

## Cara menjalankan

```bash
PORT=12000 node server.js
```

### Backend lokal (opsional, untuk mode `?frontend=` atau host lain)

`server.js` menyajikan file statis + proxy CORS ke provider model gratis. Tanpa server di proxy host, UI yang menunjuk ke host itu akan gagal.

Untuk menjalankan backend lokal dengan auto-restart:

```bash
./start-servers.sh           # jalankan port 12000 & 12001 + auto-restart (foreground)
./start-servers.sh ensure    # pastikan server hidup; start di background bila belum
./start-servers.sh watchdog  # sekali jalan: pastikan server hidup, lalu keluar
./start-servers.sh status    # cek status
./start-servers.sh stop      # hentikan semua (launcher + server)
```

- Log setiap server: `/tmp/marbel-logs/server-<port>.log`.
- Launcher otomatis me-restart server bila proses crash (PID berubah).
- Port khusus: `./start-servers.sh 7000 8000` (override PORT per instance).
- Launcher menulis launcher pidfile (`/tmp/marbel-launcher.pid`); instance kedua yang melihat launcher hidup akan **exit** (tidak menggantung, tidak menimpa pidfile).
- **Autostart**: `~/.marbelai-autostart.sh` (wire ke `~/.profile`) memanggil `ensure` saat login/runtime, dengan auto-detect path proyek (`$MARBEL_PROJECT_DIR` > `~/project` > `/workspace/project`).

> **GitHub Pages**: `app.js` **tidak lagi menunjuk host kerja** mana pun. Pada domain `*.github.io`, `modelChat()` memanggil provider yang mendukung CORS (uncloseai hermes/qwen + Free.ai) langsung dari browser — sehingga tanpa backend terpisah dan tetap jalan 24/7. Backend hanya dipakai bila halaman disajikan same-origin oleh `server.js` atau via `?frontend=URL`.

## Model AI (sumber: no-cost-ai + uncloseai + pollinations + Zen + Free.ai)

`FREE_MODELS` di `app.js` — model gratis tanpa API key:

- `qwen3.6-27b` (uncloseai, default)
- `gpt-oss-20b` (pollinations)
- `nemotron-3.5-lightning-free` (Zen)
- `big-pickle` (Zen)
- `ling-3.0-flash-fin-free` (Zen)
- `nemotron-3-ultra-free` (Zen)
- `mimo-v2.5-free` (Zen)
- `qwen7b` (Free.ai)
- `qwen3-8b` (Free.ai)

Pemanggilan model:
- **GitHub Pages**: `modelChat()` → `directChat()` memanggil upstream CORS langsung dari browser (failover: `hermes.ai.unturf.com` → `qwen.ai.unturf.com` → `api.free.ai`).
- **Same-origin / `?frontend=`**: `modelChat()` → `backendChat()` yang `fetch` ke `/api/chat` (proxy server.js).

## Pola chat (ensemble + fallback)

Logika terpusat di `chatAnswer(messages, selected)`:

- Moda "semua" (Auto Model): jalankan **semua model paralel** (`firstFulfilled`), jawaban lengkap yang paling cepat berhasil yang dipakai.
- Nama model upstream **tidak ditampilkan** di UI (`.model-tag` dibiarkan kosong untuk chat). Hanya label media (`· Flux`, `· Pollinations Video`) yang diisi.
- Moda single model: coba model pilihan dulu, **failover berurutan** ke `FREE_MODELS` via `retryUntilResponse`.
- Error apa pun (termasuk respons kosong) dianggap gagal agar failover/ulang otomatis tetap berjalan.
- Ada tombol **Salin** (copy) dan **Ulangi** (regenerate) di tiap pesan assistant.

## server.js (statis + proxy)

- `server.js` = proxy OpenAI-compatible dengan **failover berurutan** antar upstream (`UPSTREAM`, dipisah koma). Default: `https://hermes.ai.unturf.com,https://qwen.ai.unturf.com,https://text.pollinations.ai,https://opencode.ai/zen,https://api.free.ai` (no-cost-ai untuk uncloseai/pollinations, cadangan Zen/Free.ai).
- Zen butuh header `X-Session-ID` → server mengrotasi pool (`SESSION_POOL_SIZE`, default 16).
- uncloseai (vLLM/Qwen) → server mengirim `chat_template_kwargs.enable_thinking=false` agar jawaban bersih.
- URL upstream dirakit via `chatUrl`/`modelsUrl`: base `.../zen` → `/zen/v1/chat/completions`; base lain → `/v1/chat/completions`.
- HTTP error upstream (429/4xx/5xx) → coba upstream berikutnya.
- Endpoint:
  - `GET /` → index.html
  - `GET /api/models` → daftar statis `MODELS_LIST`
  - `POST /api/chat` → proxy ke upstream OpenAI-compatible

## Catatan penting

- File sumber memakai gaya penulisan tidak biasa (koma-titik tanpa spasi konsisten). `node -c` valid meskipun tampak aneh; jangan "merapikan" tanpa tes.
- Untuk GitHub Pages (statis): UI memanggil provider CORS langsung (`DIRECT_UPSTREAMS` di `app.js`), tanpa backend. Bisa memakai backend via `?frontend=URL`.
- Zen kena rate-limit (429) saat banyak request dari satu IP dalam waktu singkat; pool `X-Session-ID` + retry di server mengurangi hal ini.
