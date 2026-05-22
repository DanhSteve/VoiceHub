#!/bin/sh
set -e
cd /app

WORKER="node_modules/mediasoup/worker/out/Release/mediasoup-worker"
PREBUILT="/opt/voice-prebuilt/node_modules"

seed_prebuilt() {
  if [ ! -d "$PREBUILT/mediasoup" ]; then
    return 1
  fi
  echo "[voice] Copy node_modules tu image (mediasoup da build san)..."
  mkdir -p node_modules
  cp -a "$PREBUILT"/. node_modules/
  return 0
}

if [ ! -f node_modules/mediasoup/package.json ]; then
  seed_prebuilt || npm ci || npm install
fi

if [ ! -f "$WORKER" ]; then
  if seed_prebuilt && [ -f "$WORKER" ]; then
    :
  else
    echo "[voice] rebuilding mediasoup-worker..."
    npm rebuild mediasoup --foreground-scripts
  fi
fi

if [ ! -f "$WORKER" ]; then
  echo "[voice] FATAL: thieu $WORKER"
  echo "[voice] Chay: docker compose build voice-service --no-cache"
  echo "[voice]      docker compose up -d voice-service --force-recreate"
  exit 1
fi

exec node src/server.js
