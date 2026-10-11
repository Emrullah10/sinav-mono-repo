#!/usr/bin/env bash
# Sunucuda güncelle: kod çek → env → bağımlılık → build → migration → env JSON → pm2 (gateway en son).
# Bayraklar: SKIP_GIT=1 · SKIP_BUILD=1 · SKIP_LANDING=1 · SKIP_DB=1 · SINAV_ENV_FILE=../env/staging.env
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ENV_DIR="$(dirname "$ROOT")/env"
ENV_FILE="${SINAV_ENV_FILE:-$ENV_DIR/.env}"
MIGRATION_ENV_FILE="${SINAV_MIGRATION_ENV_FILE:-$ENV_DIR/migration.env}"
GENERATED="$ROOT/.env.generated.json"
GATEWAY="${GATEWAY:-sinav-web-gateway}"

# Sunucuda sistem node'u eski (v20); repo node >=24 ister. nvm ile kurulu 24'ü öne al.
NODE24_BIN="$(ls -d "$HOME"/.nvm/versions/node/v24*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$NODE24_BIN" ] && export PATH="$NODE24_BIN:$PATH"
export SINAV_NODE_BIN="$(command -v node)"
# npm >=11.7 lock'taki sass-embedded-all-unknown→sass girdisini eksik sayıp `npm ci`yi düşürüyor; yerelle aynı sürüm.
NPM_CI=(npx -y npm@11.6.2 ci --include=dev --no-audit --no-fund)

[ -f "$ENV_FILE" ] || { echo "HATA: env yok: $ENV_FILE (şablon .env.example, chmod 600)" >&2; exit 1; }

[ "${SKIP_GIT:-}" = "1" ] || git pull --ff-only

# Env build'den ÖNCE: web derlemesi VITE_* ve APP_BASE değerlerini okur.
set +u; set -a; . "$ENV_FILE"; set +a; set -u

if [ "${SKIP_BUILD:-}" != "1" ]; then
  "${NPM_CI[@]}"
  npm run tokens:build
  npm run build
  # Landing yazıları derleme anında API'den çeker: backend yokken (ilk kurulum) SKIP_LANDING=1.
  [ "${SKIP_LANDING:-}" = "1" ] || npm run build:landing
fi

if [ "${SKIP_DB:-}" != "1" ]; then
  # Superuser dizesini runner KENDİSİ okur (kabukta source edilmez; PM2 ortamına sızmaz).
  SINAV_MIGRATION_ENV_FILE="$MIGRATION_ENV_FILE" node scripts/apply-migrations.mjs --pending
fi

node scripts/env-to-json.mjs "$GENERATED" "$ENV_FILE" "$ROOT/.env.example"
ENV_FILE="$GENERATED" pm2 startOrReload "$ROOT/ecosystem.config.cjs" --update-env
sleep 2
ENV_FILE="$GENERATED" pm2 restart "$GATEWAY" --update-env
pm2 save
pm2 status
