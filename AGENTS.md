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

## Model AI (sumber: no-cost-ai + uncloseai + pollinations + Free.ai)

`FREE_MODELS` di `app.js` — model gratis tanpa API key:

- `qwen3.8-27b` (uncloseai, default)
- `gpt-oss-20b` (pollinations)
- `qwen3-8b` (Free.ai)

Provider OpenCode Zen sudah dibuang: free tier-nya kini menolak pemakaian di luar klien OpenCode ("can only be used from within OpenCode").

Pemanggilan model:
- **GitHub Pages**: `modelChat()` → `directChat()` memanggil upstream CORS langsung dari browser (failover: `hermes.ai.unturf.com` → `qwen.ai.unturf.com` → `text.pollinations.ai` → `api.free.ai`).
- **Same-origin / `?frontend=`**: `modelChat()` → `backendChat()` yang `fetch` ke `/api/chat` (proxy server.js).

## Pola chat (ensemble + fallback)

Logika terpusat di `chatAnswer(messages, selected)`:

- Moda "semua" (Auto Model): jalankan **semua model paralel** (`firstFulfilled`), jawaban lengkap yang paling cepat berhasil yang dipakai.
- Nama model upstream **tidak ditampilkan** di UI (`.model-tag` dibiarkan kosong untuk chat). Hanya label media (`· Flux`, `· Pollinations Video`) yang diisi.
- Moda single model: coba model pilihan dulu, **failover berurutan** ke `FREE_MODELS` via `retryUntilResponse`.
- Error apa pun (termasuk respons kosong) dianggap gagal agar failover/ulang otomatis tetap berjalan.
- Ada tombol **Salin** (copy) dan **Ulangi** (regenerate) di tiap pesan assistant.

## server.js (statis + proxy)

- `server.js` = proxy OpenAI-compatible dengan **failover berurutan** antar upstream (`UPSTREAM`, dipisah koma). Default: `https://hermes.ai.unturf.com,https://qwen.ai.unturf.com,https://text.pollinations.ai,https://api.free.ai` (no-cost-ai untuk uncloseai/pollinations, cadangan Free.ai).
- uncloseai (vLLM/Qwen) → server mengirim `chat_template_kwargs.enable_thinking=false` agar jawaban bersih.
- URL upstream dirakit via `chatUrl`/`modelsUrl`: pollinations (`text.pollinations.ai`) → `/openai`; base lain → `/v1/chat/completions`.
- HTTP error upstream (429/4xx/5xx) → coba upstream berikutnya.
- Endpoint:
  - `GET /` → index.html
  - `GET /api/models` → daftar statis `MODELS_LIST`
  - `POST /api/chat` → proxy ke upstream OpenAI-compatible

## Aplikasi Android (APK / Capacitor)

- APK = pembungkus WebView Capacitor; aset web dari root (`index.html`, `app.js`, `styles.css`) disalin ke `www/` (`webDir`).
- Build: `ANDROID_HOME=... ./build-apk.sh [release|debug]` (atau `npm run apk`). Butuh JDK 17+, Android SDK platform 35 + build-tools 35.
- `capacitor.config.json` tidak lagi memakai `server.url` ke backend — aset disajikan lokal dari `https://localhost`, jadi APK mandiri.
- Karena origin native tak punya `/api/chat`, `isNativeApp` (dicek dari `window.Capacitor.isNativePlatform()`) memaksa mode **direct CORS**. Bila provider menolak (rate-limit per-IP), `modelChat()` beralih ke cadangan `NATIVE_FALLBACK_BACKEND` (`https://marbel-ai.onrender.com`).
- Ikon launcher dihasilkan `build-icon.py` (Pillow) dari logo favicon; adaptive icon pakai background `#6C5CE7`.
- `android/marbel-release.keystore` + `android/keystore.properties` **jangan di-commit** (sudah masuk `.gitignore`).
- Catatan pengujian: provider uncloseai mudah kena 429 bila request datang dari IP datacenter/lokal; di perangkat nyata normal. Uji perilaku UI dengan menyuntik shim `window.Capacitor={isNativePlatform:()=>true}` sebelum `<script src="app.js">`.

## Catatan penting

- File sumber memakai gaya penulisan tidak biasa (koma-titik tanpa spasi konsisten). `node -c` valid meskipun tampak aneh; jangan "merapikan" tanpa tes.
- Untuk GitHub Pages (statis): UI memanggil provider CORS langsung (`DIRECT_UPSTREAMS` di `app.js`), tanpa backend. Bisa memakai backend via `?frontend=URL`.
- Provider gratis mudah kena rate-limit (429) saat banyak request dari satu IP dalam waktu singkat; failover antar upstream di `directChat()`/`server.js` mengurangi hal ini.
