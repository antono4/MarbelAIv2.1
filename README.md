<div align="center">

# Marbel AI

Chat dengan beragam model AI sekaligus yang saling melengkapi untuk jawaban yang lebih akurat dan cepat.

**Link:**
- [Demo](https://antono4.github.io/MarbelAIv2.1/)

</div>

---

## Fitur

- **Ensemble multi-model** - mode Auto Model menjalankan semua model secara paralel dan memakai jawaban yang paling cepat berhasil; mode single-model punya failover otomatis ke model cadangan.
.
- **Tombol Salin & Ulangi** - salin jawaban atau minta AI menulis ulang jawaban yang sama.
- **Antarmuka chat modern** - sidebar riwayat percakapan, dark mode siang/malam, dan dukungan blok kode.
.
.
- **Cepat dan responsif** - efek mengetik agar terasa ringan.

- **Tanpa biaya & tanpa API key** - semua model gratis (lihat tabel di bawah), disajikan lewat backend proxy `server.js`. Tidak perlu kartu kredit atau akun berbayar.

- **Siap deploy** - frontend bisa di-host di mana saja; pasang `server.js` di Render, Railway, Docker, atau host kerja (work-1/work-2) sebagai proxy CORS. 

## Model AI (dari [no-cost-ai](https://github.com/zebbern/no-cost-ai))

Daftar model gratis yang dipakai di `app.js` (`FREE_MODELS`), disajikan lewat backend proxy `server.js`:

| Model | Provider | Keterangan |
|---|---|---|
| `qwen3.6-27b` | uncloseai (no-cost-ai) | Qwen 3.6 27B, gratis tanpa API key (default) |
| `gpt-oss-20b` | pollinations (no-cost-ai) | GPT-OSS 20B open-weights, tier anonim |
| `nemotron-3.5-lightning-free` | OpenCode Zen | NVIDIA Nemotron ringan, cepat (cadangan) |
| `big-pickle` | OpenCode Zen | Stealth model, kemampuan bergilir |
| `ling-3.0-flash-fin-free` | OpenCode Zen | Model cepat untuk chat |
| `nemotron-3-ultra-free` | OpenCode Zen | Nemotron 3 Ultra, kadang lambat |
| `mimo-v2.5-free` | OpenCode Zen | Xiaomi MiMo (rate-limit kadang 429) |
| `qwen7b` | Free.ai | Qwen 3, model open-weight gratis |
| `qwen3-8b` | Free.ai | Qwen 3 8B, model open-weight gratis |

Mode **Auto Model** mencoba semua model di atas secara paralel dan memakai jawaban tercepat yang berhasil. Semua model gratis — tanpa API key, tanpa kartu kredit.

> Catatan: provider uncloseai (hermes/qwen) memakai vLLM/Qwen; server mengirim `chat_template_kwargs.enable_thinking=false` agar jawaban bersih tanpa proses berpikir. Saat uncloseai/pollinations rate-limit atau lambat, server otomatis failover ke Zen lalu Free.ai.



## Menjalankan Secara Lokal



Prasyarat Node.js versi 18 atau lebih baru.



```bash
git clone https://github.com/antono4/MarbelAIv2.1.git
cd MarbelAIv2.1
PORT=12000 node server.js
```

Server menyajikan file statis (`index.html`, `app.js`, `styles.css`) sekaligus menjadi **proxy CORS** ke provider model gratis (dari daftar no-cost-ai) di `/api/chat`. Buka `http://localhost:12000` di browser lalu kirim pesan — tidak perlu login atau API key.

> **GitHub Pages** memakai **mode langsung**: `app.js` memanggil provider yang mendukung CORS (uncloseai & Free.ai) langsung dari browser, sehingga **tanpa backend terpisah** dan tetap berjalan 24/7. Opsional, bisa memakai backend sendiri lewat `?frontend=<URL backend>` (mis. instance Render/Railway).



## Konfigurasi (Environment Variables)




| Variabel | Default | Deskripsi |
|---|---|---|
| `PORT` | `12000` | Port HTTP server |
| `UPSTREAM` | `https://hermes.ai.unturf.com,https://qwen.ai.unturf.com,https://text.openrouter.ai,https://opencode.ai/zen,https://api.free.ai` | Daftar upstream OpenAI-compatible gratis, dipisah koma (failover berurutan) |
| `UPSTREAM_PREFIX` | `''` | Prefix path upstream (untuk Zen cukup set base, otomatis `/v1`) |
| `DEFAULT_MODEL` | `qwen3.6-27b` | Model default bila klien tidak mengirim |
| `MODELS_LIST` | daftar model gratis | Daftar model yang dilayani `/api/models` |
| `SESSION_POOL_SIZE` | `16` | Ukuran pool `X-Session-ID` untuk Zen |
| `API_KEY` | `''` | Opsional, dipakai bila upstream butuh Bearer |
| `ALLOW_ORIGIN` | `*` | Origin yang diizinkan CORS |



## API



| Endpoint | Metode | Deskripsi |
|---|---|---|
| `/` | `GET` | UI statis (`index.html`) |
| `/api/models` | `GET` | Daftar model gratis aktif (`MODELS_LIST`) |
| `/api/chat` | `POST` | Proksi ke upstream OpenAI-compatible dengan failover |



## Docker



```bash
docker build -t marbel-ai .
docker run -p 10000:10000   -e PORT=10000   marbel-ai
```

Buka `http://localhost:10000`.



## Deployment



Proyek ini mendukung beberapa platform:

- **GitHub Pages** - frontend statis langsung memanggil provider CORS (uncloseai, Free.ai) dari browser — tanpa backend terpisah, berjalan terus (lihat [Demo](https://antono4.github.io/MarbelAIv2.1/)). Untuk pakai backend proxy sendiri (mis. server.js di Render/Railway), buka dengan `?frontend=<URL>` atau ubah `DEFAULT_BACKEND` di `app.js`.
- **Render / Railway / Docker** - sajikan sebagai server statis + proxy `UPSTREAM` (bisa jadi backend untuk mode `?frontend=`).
- **Android (APK)** - lihat [Aplikasi Android (APK)](#aplikasi-android-apk) di atas. APK release `MarbelAI.apk` bisa diunduh juga dari `/MarbelAI.apk` saat backend berjalan.



## Aplikasi Android (APK)

APK adalah pembungkus WebView (Capacitor) dari UI yang sama. Aset web
(`index.html`, `app.js`, `styles.css`) dipaketkan di dalam APK, jadi aplikasi
berjalan mandiri tanpa backend terpisah — memanggil provider gratis langsung
dari WebView (CORS). Bila provider menolak (mis. rate-limit per-IP), aplikasi
otomatis beralih ke proxy cadangan `https://marbel-ai.onrender.com`.

- `MarbelAI.apk` — build **release**, sudah ditandatangani (siap dibagikan/di-install).
- `MarbelAI-debug.apk` — build debug untuk pengujian (dihasilkan `./build-apk.sh`, tidak di-commit).

Instal di perangkat Android (aktifkan "Instal dari sumber tidak dikenal"):

```bash
adb install -r MarbelAI.apk
```

### Membangun sendiri

Prasyarat: JDK 17+, Node.js 18+, dan Android SDK (platform 35 + build-tools 35).

```bash
export ANDROID_HOME=/path/ke/Android/Sdk
./build-apk.sh            # APK debug
./build-apk.sh release    # APK release
```

Hasil build ada di `android/app/build/outputs/apk/`. Skrip ini juga menyalin
aset web ke `www/` dan menghasilkan ikon launcher dari logo aplikasi
(`build-icon.py`).

Build release ditandatangani memakai `android/marbel-release.keystore` melalui
`android/keystore.properties`. Keduanya tidak di-commit (lihat `.gitignore`).
Untuk rilis nyata, buat keystore Anda sendiri dan simpan kredensialnya dengan aman:

```bash
keytool -genkeypair -v -keystore android/marbel-release.keystore \
  -alias marbel -keyalg RSA -keysize 2048 -validity 10000
```

Detail aplikasi: `applicationId` `ai.marbel.app`, `minSdk` 23, `targetSdk` 35,
versi `1.1.0`, izin `INTERNET`.



## Struktur Proyek



```
MarbelAIv2.1/
- server.js            Server statis + proxy OpenAI-compatible (opsional)
- app.js               Frontend logika chat, ensemble multi-model, dan proxy backend
- index.html           Halaman utama UI
- styles.css           Gaya arsitektur UI
- capacitor.config.json Konfigurasi Capacitor (pembungkus Android)
- build-apk.sh         Skrip build APK
- build-icon.py        Generator ikon launcher Android
- android/             Proyek Android (Capacitor)
- MarbelAI.apk         APK release siap instal
- Dockerfile           Image Docker
- render.yaml          Blueprint Render
- railway.json         Konfigurasi Railway
```



## Lisensi



Didistribusikan di bawah [Lisensi MIT](LICENSE.. Copyright 2026 [Antono4](https://github.com/antono4..



---

Dibuat dengan - AI gratis untuk semua.
