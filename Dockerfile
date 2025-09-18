# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base

ENV NODE_ENV=production \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_CACHE_DIR=/usr/src/app/.cache/puppeteer \
    CHROME_PATH=/usr/bin/chromium \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /usr/src/app

# Install Chromium and required dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Copy only package manifests first for cached install
COPY package*.json ./

RUN npm ci --omit=dev || npm install --omit=dev

# Copy the rest of the source
COPY . .

# Ensure cache dir exists and is writable
RUN mkdir -p $PUPPETEER_CACHE_DIR && chown -R node:node /usr/src/app

USER node

# Render provides PORT; our server respects it
EXPOSE 10000

CMD ["node", "my-app/services/server/server.js"]
