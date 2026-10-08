#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
command -v pm2 >/dev/null 2>&1 || { echo "pm2 gerekli: npm install -g pm2" >&2; exit 1; }
pm2 startOrReload "$ROOT/scripts/ecosystem.config.cjs" --update-env
sleep 2
pm2 restart sinav-web-gateway --update-env
pm2 status
