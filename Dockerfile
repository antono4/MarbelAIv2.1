FROM node:20-alpine
WORKDIR /app

# Tidak ada dependency npm publik; cukup salin kode.
COPY package.json* ./
COPY server.js index.html app.js styles.css README.md ./

ENV PORT=10000
ENV NODE_ENV=production

# UPSTREAM & API_KEY perlu diset saat runtime (lihat .env.example / deploy config)
EXPOSE 10000
CMD ["node", "server.js"]