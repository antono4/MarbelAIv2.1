<div align="center">

# Marbel AI

Chat dengan beragam model AI gratis tanpa akun dan tanpa biaya. Mengobrol dengan 4 model AI gratis sekaligus yang saling melengkapi untuk jawaban yang lebih akurat dan cepat.

**Link:**
- [Demo](https://antono4.github.io/MarbelAI/)
- [Backend di Render](https://marbel-ai.onrender.com)

</div>

---

## Fitur

- **Ensemble multi-model** - mode Auto Model menjalankan semua model gratis secara paralel dan memakai jawaban yang paling cepat berhasil; mode single-model punya failover otomatis ke model cadangan.
- **Tombol Salin & Ulangi** - salin jawaban atau minta AI menulis ulang jawaban yang sama.
- **Antarmuka chat modern** - tersedia berbagai tema, sidebar riwayat percakapan, dan dukungan blok kode..
- **Cepat dan responsif** - efek mengetik agar terasa ringan, plus cache daftar model agar muat cepat..
- **Backend tangguh** - dukungan beberapa upstream cadangan, header keamanan, timeout, dan tanpa dependency npm..
- **Siap deploy** - konfigurasi untuk Render Blueprint, Railway, Docker, dan GitHub Pages untuk frontend..

## Model Gratis (Upstream Zen dari opencode.ai)

| Model | Status |
|---|---|
| `ling-3.0-flash-fin-free` | Cepat dan stabil (prioritas utama) |
| `nemotron-3-ultra-free` | Cepat dan stabil |
| `mimo-v2.5-free` | Populer, kadang rate-limit |
| `laguna-s-2.1-free` | Bisa sukses tapi lambat |
| `hy3-free` | Tidak didukung upstream |
| `nemotron-3.5-lightning-free` | Sangat lambat |
| `deepseek-v4-flash-free` dan `muse-spark-1.2-contributor-free` | Error dari provider |

## Menjalankan Secara Lokal

Prasyarat Node.js versi 18 atau lebih baru.

```bash
git clone https://github.com/antono4/MarbelAI.git
cd MarbelAI
PORT=12000 UPSTREAM=https://opencode.ai/zen node server.js
```

Buka `http://localhost:12000` di browser. Tanpa variabel `UPSTREAM`, server memakai default `http://localhost:20128` untuk pengembangan lokal dengan proxy lain..

## Konfigurasi (Environment Variables)

| Variabel | Default | Deskripsi |
|---|---|---|
| `PORT` | `12000` | Port HTTP server |
| `UPSTREAM` | `http://localhost:20128` | Base URL endpoint OpenAI-compatible, bisa daftar dipisah koma (contoh Zen `https://opencode.ai/zen/v1`) |
| `API_KEY` | kosong | API key upstream untuk otentikasi `/v1` (boleh kosong bila tidak butuh) |
| `ALLOW_ORIGIN` | `*` | Origin yang diizinkan untuk CORS |
| `USE_SSE` | `1` | Mode streaming (`1` = stream, `0` = JSON biasa) |
| `MODELS_TTL` | `300` | TTL (detik) cache daftar model di `/api/models` |

Lihat salinan penuh di `.env.example`.

## API

| Endpoint | Metode | Deskripsi |
|---|---|---|
| `/` | `GET` | UI statis (`index.html`) |
| `/api/models` | `GET` | Daftar model yang tersedia dari upstream (timeout 15 detik) |
| `/api/chat` | `POST` | Proksi ke `/v1/chat/completions` upstream (timeout 30 detik) |

Contoh permintaan chat:

```bash
curl -X POST http://localhost:12000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"model": "ling-3.0-flash-fin-free", "messages": [{"role": "user", "content": "Halo, siapa kamu?"}]}'
```

## Docker

```bash
docker build -t marbel-ai .
docker run -p 10000:10000 \
  -e PORT=10000 \
  -e UPSTREAM=https://opencode.ai/zen \
  marbel-ai
```

Buka `http://localhost:10000`.

## Deployment

Proyek ini mendukung beberapa platform:

- **Render** - gunakan `render.yaml` sebagai Render Blueprint (gratis..
- **Railway** - gunakan `railway.json` sebagai konfigurasi build atau deploy..
- **GitHub Pages** - frontend statis berfungsi di GitHub Pages dan backend memakai default `https://marbel-ai.onrender.com` yang bisa di-override dengan parameter query `?backend=URL`..
- **Docker** - lihat bagian Docker di atas..

## Struktur Proyek

```
MarbelAI/
- server.js       Backend static file server dan proxy OpenAI-compatible
- app.js          Frontend logika chat, streaming, dan ensemble multi-model
- index.html      Halaman utama UI
- styles.css       Tema dan gaya
- Dockerfile       Image Docker
- render.yaml      Blueprint Render
- railway.json     Konfigurasi Railway
- .env.example     Contoh variabel lingkungan
```

## Lisensi

Didistribusikan di bawah [Lisensi MIT](LICENSE. Copyright 2026 [Antono4](https://github.com/antono4..

---

Dibuat dengan - AI gratis untuk semua.