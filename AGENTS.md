# Marbel AI — Catatan Repo

## Cara menjalankan

```bash
PORT=12000 UPSTREAM=https://opencode.ai/zen node server.js
```

Server berfungsi ganda: serve file statis (`index.html`, `app.js`, `styles.css`) + proxy `/api/chat` dan `/api/models` ke upstream OpenAI-compatible. Tanpa dependency npm.

## Model gratis upstream Zen (valid per 2026-08)

- `ling-3.0-flash-fin-free` — cepat & stabil (~1s). Prioritas utama.
- `nemotron-3-ultra-free` — cepat & stabil (~1-2s).
- `mimo-v2.5-free` — populer, kadang rate-limit (>429).
- `laguna-s-2.1-free` — kadang sukses, tapi lambat/unavailable (4-9s.
- `deepseek-v4-flash-free`, `muse-spark-1.2-contributor-free` — sering kena rate-limit (>429,, tapi tetap dipakai sebagai cadangan.
- `nemotron-3.5-lightning-free` — sangat lambat (>9s,, kadang gagal.
- `big-pickle` — model anonim dari opencode 5 (tidak butuh API key,, kadang 429 — cadangan tambahan.


- `hy3-free` — **sudah tidak didukung** upstream (ModelError — jangan dipakai).

## Pola chat (ensemble + fallback)

Logika terpusat di `chatAnswer(messages, selected)`:

- Moda "semua" (Auto Model): jalankan **semua model gratis paralel** (`firstFulfilled`), jawaban lengkap yang paling cepat berhasil yang dipakai. Tag model (`· <nama>`) dipasang di bawah label Marbel AI.
- Moda single model: coba model pilihan dulu, **failover berurutan** ke `FREE_MODELS`.
- Failover aktif untuk error HTTP 4xx/5xx dan error `upstream`. Error non-HTTP (mis. `NetworkError`) langsung gagal tanpa coba cadangan.
- Respons kosong (`{"choices":[]}` / `error`) dianggap gagal agar failover tetap berjalan.
- Ada tombol **Salin** (copy) dan **Ulangi** (regenerate) di tiap pesan assistant.

## Backend (server.js)

- Multi-upstream: `UPSTREAM` bisa berupa daftar dipisah koma; server mencoba berurutan (yang hidup dipakai).
- `MODELS_TTL` mengontrol cache `/api/models` (default 300s).
- Header keamanan dasar dipasang di semua respons (nosniff, frame, referrer, COOP, permissions-policy).
- Timeout: 30s chat, 15s models.


## Catatan penting

- File sumber memakai gaya penulisan tidak biasa (koma-titik tanpa spasi konsisten). `node -c` valid meskipun tampak aneh; jangan "merapikan" tanpa tes.
- `server.js` kini punya timeout upstream (30s chat, 15s models) dan tidak kirim header `Authorization` kosong.

- Endpoint statis:
  - `GET /` → index.html
  - `GET /api/models` → daftar model upstream
  - `POST /api/chat` → proxy ke `/v1/chat/completions`