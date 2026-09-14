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

- **Tanpa biaya & tanpa API key** - semua model gratis (lihat tabel di bawah), disajikan lewat backend proxy `server.js` (OpenCode Zen + Free.ai). Tidak perlu kartu kredit atau akun berbayar.

- **Siap deploy** - frontend bisa di-host di mana saja; pasang `server.js` di Render, Railway, Docker, atau host kerja (work-1/work-2) sebagai proxy CORS. 

## Model AI (dari [awesome-free-models](https://github.com/12britz/awesome-free-models))

Daftar model gratis yang dipakai di `app.js` (`FREE_MODELS`), disajikan lewat backend proxy `server.js`:

| Model | Provider | Keterangan |
|---|---|---|
| `nemotron-3.5-lightning-free` | OpenCode Zen | NVIDIA Nemotron ringan, cepat (default) |
| `big-pickle` | OpenCode Zen | Stealth model, kemampuan bergilir |
| `ling-3.0-flash-fin-free` | OpenCode Zen | Model cepat untuk chat |
| `nemotron-3-ultra-free` | OpenCode Zen | Nemotron 3 Ultra, kadang lambat |
| `mimo-v2.5-free` | OpenCode Zen | Xiaomi MiMo (rate-limit kadang 429) |
| `qwen7b` | Free.ai | Qwen 3, model open-weight gratis |
| `qwen3-8b` | Free.ai | Qwen 3 8B, model open-weight gratis |

Mode **Auto Model** mencoba semua model di atas secara paralel dan memakai jawaban tercepat yang berhasil. Semua model gratis — tanpa API key, tanpa kartu kredit.

> Catatan: model OpenCode Zen butuh header `X-Session-ID` (otomatis dirotasi pool oleh `server.js`). Saat Zen rate-limit (429) atau lambat, server otomatis failover ke Free.ai.



## Menjalankan Secara Lokal



Prasyarat Node.js versi 18 atau lebih baru.



```bash
git clone https://github.com/antono4/MarbelAIv2.1.git
cd MarbelAIv2.1
PORT=12000 node server.js
```

Server menyajikan file statis (`index.html`, `app.js`, `styles.css`) sekaligus menjadi **proxy CORS** ke provider model gratis (OpenCode Zen + Free.ai) di `/api/chat`. Buka `http://localhost:12000` di browser lalu kirim pesan — tidak perlu login atau API key.

> Untuk GitHub Pages (statis murni), tambahkan `?frontend=<URL backend>` atau atur `DEFAULT_BACKEND` di `app.js` agar UI menunjuk ke instance `server.js` yang sedang berjalan (mis. Render). Tanpa backend, SDK Puter dipakai sebagai cadangan bila `puter.ai` tersedia.



## Konfigurasi (Environment Variables)




| Variabel | Default | Deskripsi |
|---|---|---|
| `PORT` | `12000` | Port HTTP server |
| `UPSTREAM` | `https://opencode.ai/zen,https://api.free.ai` | Daftar upstream OpenAI-compatible gratis, dipisah koma (failover berurutan) |
| `UPSTREAM_PREFIX` | `''` | Prefix path upstream (untuk Zen cukup set base, otomatis `/v1`) |
| `DEFAULT_MODEL` | `nemotron-3.5-lightning-free` | Model default bila klien tidak mengirim |
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

- **GitHub Pages** - frontend statis berfungsi penuh di GitHub Pages. Model langsung via Puter, tanpa backend khusus. Riwayat tersimpan per browser lewat akun Puter (lihat [Demo](https://antono4.github.io/MarbelAIv2.1/)).
- **Render / Railway / Docker** - sajikan sebagai server statis (atau dengan proxy `UPSTREAM` bila perlu)..



## Struktur Proyek



```
MarbelAIv2.1/
- server.js       Server statis + proxy OpenAI-compatible (opsional)
- app.js          Frontend logika chat, ensemble multi-model, dan integrasi Puter
- index.html      Halaman utama UI
- styles.css      Gaya arsitektur UI
- Dockerfile      Image Docker
- render.yaml     Blueprint Render
- railway.json    Konfigurasi Railway
```



## Lisensi



Didistribusikan di bawah [Lisensi MIT](LICENSE.. Copyright 2026 [Antono4](https://github.com/antono4..



---

Dibuat dengan - AI gratis untuk semua.
