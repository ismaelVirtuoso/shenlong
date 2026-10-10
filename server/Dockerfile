FROM node:24-slim

# ffmpeg: efeito "voz de dragão" sobre o TTS (sem ele a voz sai crua)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
# inclui devDependencies: o servidor roda TypeScript direto pelo tsx
RUN npm ci && npm cache clean --force
COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
EXPOSE 8787
CMD ["node_modules/.bin/tsx", "src/index.ts"]
