# API (Express + SQLite). Usado pelo docker-compose.yml; produção roda na VM sem Docker (docs/DEPLOY.md).
FROM node:24-slim

WORKDIR /app
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    PORT=3001 \
    DB_PATH=/data/monitor.db \
    LOG_DIR=/data/logs

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY src ./src
COPY scripts ./scripts
COPY municipios ./municipios

VOLUME /data
EXPOSE 3001
CMD ["node", "scripts/api.js"]
