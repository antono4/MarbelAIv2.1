FROM node:20-alpine
WORKDIR /app

# Tidak ada dependency npm publik; cukup salin kode.
COPY package.json* ./
COPY server.js index.html app.js styles.css README.md ./

ENV PORT=10000
ENV NODE_ENV=production
ENV UPSTREAM=https://hermes.ai.unturf.com,https://qwen.ai.unturf.com,https://text.openrouter.ai/api/v1,https://opencode.ai/zen,https://api.free.ai
ENV DEFAULT_MODEL=qwen3.6-27b
ENV MODELS_LIST=qwen3.6-27b,gpt-oss-20b,nemotron-3.5-lightning-free,big-pickle,ling-3.0-flash-fin-free,nemotron-3-ultra-free,mimo-v2.5-free,qwen7b,qwen3-8b

# UPSTREAM & API_KEY bisa dioverride saat runtime
EXPOSE 10000
CMD ["node", "server.js"]