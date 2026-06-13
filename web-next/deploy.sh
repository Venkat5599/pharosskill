#!/usr/bin/env bash
# Run this ON the VPS, from inside the web-next/ directory.
# It builds the Docker image and (re)starts the container on port 80.
#
# Secrets are read from ./prod.env (you create it on the server — see DEPLOY.md).
# prod.env is NEVER committed.
set -euo pipefail

APP=cashier
PORT="${PORT:-80}"
ENV_FILE="${ENV_FILE:-prod.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Create it first (see DEPLOY.md):"
  echo "  TOKENROUTER_API_KEY=sk-..."
  echo "  TOKENROUTER_BASE_URL=https://api.aicredits.in/v1"
  echo "  TOKENROUTER_MODEL=deepseek/deepseek-v4-flash"
  echo "  PHAROS_EXPLORER=https://atlantic.pharosscan.xyz/tx/"
  exit 1
fi

echo "==> building image"
docker build -t "$APP:latest" .

echo "==> restarting container on :$PORT"
docker rm -f "$APP" 2>/dev/null || true
docker run -d \
  --name "$APP" \
  --restart unless-stopped \
  -p "${PORT}:3000" \
  --env-file "$ENV_FILE" \
  "$APP:latest"

echo "==> up. check:"
echo "    docker logs -f $APP"
echo "    curl -s localhost:$PORT/ -o /dev/null -w '%{http_code}\\n'"
