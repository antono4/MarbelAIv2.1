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

- **Tanpa backend & API key** - model dijalankan langsung di browser lewat [Puter](https://puter.com), sama seperti MiniDevin. Cukup login sekali dengan akun Puter untuk menyimpan riwayat.

- **Siap deploy** - frontend statis bisa di-hosting di mana saja (GitHub Pages, Render, Railway, Docker, dll. 

## Model AI (sumber: MiniDevin via Puter.



Daftar model yang dipakai di `app.js` (`FREE_MODELS`), sama dengan daftar model MiniDevin:





| Model | Keterangan |
|---|---|
| `gpt-5-nano` | Model ringan cepat dari OpenAI |
| `gpt-4o-mini` | Model mini hemat biaya |
| `claude-sonnet-4` | Model andal dari Anthropic |
| `gemini-2.5-flash` | Model cepat dari Google |
| `deepseek-chat` | Model chat dari DeepSeek |
| `grok-4` | Model dari xAI |

Mode **Auto Model** mencoba semua model di atas secara paralel dan memakai jawaban tercepat yang berhasil.



## Menjalankan Secara Lokal



Prasyarat Node.js versi 18 atau lebih baru.



```bash
git clone https://github.com/antono4/MarbelAIv2.1.git
cd MarbelAIv2.1
PORT=12000 node server.js
```

Server hanya bertugas menyajikan file statis (`index.html`, `app.js`, `styles.css`); chat berjalan langsung di browser lewat Puter — tanpa endpoint proxy. Buka `http://localhost:12000` di browser, lalu login sekali ke Puter (popup otomatis muncul untuk mengizinkan model berjalan. Riwayat percakapan disimpan di browser lewat penyimpanan sesi Puter..



## Konfigurasi (Environment Variables)




| Variabel | Default | Deskripsi |
|---|---|---|
| `PORT` | `12000` | Port HTTP server |



## API



| Endpoint | Metode | Deskripsi |
|---|---|---|
| `/` | `GET` | UI statis (`index.html`) |
| `/api/models` | `GET` | Daftar model dari `FREE_MODELS` (statis di `app.js`) |
| `/api/chat` | `POST` | Proksi ke upstream OpenAI-compatible (opsional, dipakai bila `UPSTREAM` diset) |



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
