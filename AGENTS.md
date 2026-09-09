# Marbel AI — Catatan Repo

## Cara menjalankan

```bash
PORT=12000 node server.js
```

Server kini hanya menyajikan file statis (`index.html`, `app.js`, `styles.css`). Chat berjalan langsung di browser lewat SDK Puter — tanpa backend proxy dan tanpa dependency npm.



## Model AI (sumber: MiniDevin via Puter



`FREE_MODELS` di `app.js` = daftar model yang sama dengan MiniDevin:

- `gpt-5-nano`
- `gpt-4o-mini`
- `claude-sonnet-4`
- `gemini-2.5-flash`
- `deepseek-chat`
- `grok-4`



Model dipanggil via `puter.ai.chat(messages, { model, stream: true })` — sama persis dengan pola MiniDevin. Login akun Puter diperlukan sekali di browser (popup otomatis muncul saat kirim pesan pertama; riwayat tersimpan via sesi Puter.



## Pola chat (ensemble + fallback



Logika terpusat di `chatAnswer(messages, selected`:

- Moda "semua" (Auto Model): jalankan **semua model paralel** (`firstFulfilled`), jawaban lengkap yang paling cepat berhasil yang dipakai. Tag model (`· <nama>`) dipasang di bawah label Marbel AI.
- Moda single model: coba model pilihan dulu,, **failover berurutan** ke `FREE_MODELS` via `retryUntilResponse`..
- Error apa pun (termasuk respons kosong) dianggap gagal agar failover/ulang otomatis tetap berjalan..
- Ada tombol **Salin** (copy) dan **Ulangi** (regenerate) di tiap pesan assistant..



## server.js (statis opsional + proxy



- `server.js` tetap bisa dipakai sebagai proxy OpenAI-compatible bila `UPSTREAM` diset (mis. `https://opencode.ai/zen`), tapi frontend kini **tidak lagi memakai proxy itu** — semua request lewat Puter.
- Endpoint statis:
  - `GET /` → index.html
  - `GET /api/models` → daftar statis dari `FREE_MODELS`
  - `POST /api/chat` → proxy ke `/v1/chat/completions` (hanya bila ada `UPSTREAM`)



## Catatan penting



- File sumber memakai gaya penulisan tidak biasa (koma-titik tanpa spasi konsisten.. `node -c` valid meskipun tampak aneh; jangan "merapikan" tanpa tes..
- `app.js` tidak lagi memakai `DEFAULT_BACKEND`/`FALLBACK_BACKEND`/`fetch('/api/chat')` — kode lama untuk backend runtime all-hands.dev sudah dihapus..
