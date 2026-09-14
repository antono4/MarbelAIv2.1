# Marbel AI — Catatan Repo

## Cara menjalankan

```bash
PORT=12000 node server.js
```

Server menyajikan file statis (`index.html`, `app.js`, `styles.css`) sekaligus jadi **proxy CORS** ke provider model gratis. Tidak ada dependency npm (hanya modul inti Node).

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

Model dipanggil via `modelChat()` → `backendChat()` yang `fetch` ke `/api/chat` (proxy server.js). Jika backend tidak tersedia (hosting statis murni), fallback ke `puter.ai.chat()` bila SDK Puter tersedia.

## Pola chat (ensemble + fallback)

Logika terpusat di `chatAnswer(messages, selected)`:

- Moda "semua" (Auto Model): jalankan **semua model paralel** (`firstFulfilled`), jawaban lengkap yang paling cepat berhasil yang dipakai. Tag model (`· <nama>`) dipasang di bawah label Marbel AI.
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
- Untuk GitHub Pages (statis): UI menunjuk backend via `DEFAULT_BACKEND`/`FALLBACK_BACKEND` (host kerja all-hands) atau `?frontend=URL`. Lalu semua model lewat proxy; Puter jadi fallback terakhir.
- Zen kena rate-limit (429) saat banyak request dari satu IP dalam waktu singkat; pool `X-Session-ID` + retry di server mengurangi hal ini.
