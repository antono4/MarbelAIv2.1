FROM node:20-alpine
WORKDIR /app

# Tidak ada dependency npm publik; cukup salin kode.
COPY package.json* ./
COPY server.js index.html app.js styles.css README.md ./

ENV PORT=10000
ENV NODE_ENV=production
ENV UPSTREAM=https://hermes.ai.unturf.com,https://qwen.ai.unturf.com,https://text.pollinations.ai,https://api.free.ai
ENV DEFAULT_MODEL=qwen3.8-27b
ENV MODELS_LIST=qwen3.8-27b,gpt-oss-20b,qwen3-8b

# UPSTREAM & API_KEY bisa dioverride saat runtime
EXPOSE 10000
CMD ["node", "server.js"]