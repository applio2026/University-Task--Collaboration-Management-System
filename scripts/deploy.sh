#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Git-based deploy for the self-hosted Mac (native pm2 + nginx + Postgres).
#
# Flow:  snapshot current release (code+build+DB image)  →  pull target branch
#        →  npm ci  →  RUN TESTS  →  build  →  prisma db push  →  restart (pm2)
#        →  health-check  →  on ANY failure: automatic rollback to the snapshot.
#
# Keeps the last N release images under .deploy/releases for rollback/audit.
#
# Usage:
#   ./scripts/deploy.sh                # deploy origin/production
#   BRANCH=Test ./scripts/deploy.sh    # deploy another branch
#   ./scripts/deploy.sh rollback       # manually roll back to the latest snapshot
# ─────────────────────────────────────────────────────────────
set -uo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BRANCH="${BRANCH:-production}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
DB_NAME="${DB_NAME:-universitytask}"
RELEASES_DIR="$APP_DIR/.deploy/releases"
export PATH="$HOME/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

BACKEND_HEALTH="http://localhost:4001/api/health"
FRONTEND_HEALTH="http://localhost:8093/"

log() { printf "\n\033[1m▸ %s\033[0m\n" "$1"; }
ok()  { printf "  \033[32m✔\033[0m %s\n" "$1"; }
err() { printf "  \033[31m✗\033[0m %s\n" "$1"; }

health_ok() {
  local url="$1"
  for _ in $(seq 1 20); do
    [ "$(curl -s --max-time 4 -o /dev/null -w '%{http_code}' "$url" 2>/dev/null)" = "200" ] && return 0
    sleep 1
  done
  return 1
}

restart_app() {
  pm2 restart uni-backend uni-frontend >/dev/null 2>&1 || pm2 start "$APP_DIR/ecosystem.config.js" >/dev/null 2>&1
  pm2 save >/dev/null 2>&1 || true
}

# ── snapshot the current, working release as a restorable image ──────────────
snapshot() {
  local sha ts dir
  sha="$(git -C "$APP_DIR" rev-parse HEAD)"
  ts="$(date +%Y%m%d-%H%M%S)"
  dir="$RELEASES_DIR/$ts"
  mkdir -p "$dir"
  echo "$sha" > "$dir/COMMIT"
  [ -d "$APP_DIR/backend/dist" ]  && tar -C "$APP_DIR/backend"  -czf "$dir/backend-dist.tgz"  dist 2>/dev/null || true
  [ -d "$APP_DIR/frontend/dist" ] && tar -C "$APP_DIR/frontend" -czf "$dir/frontend-dist.tgz" dist 2>/dev/null || true
  # DB image (for manual restore; auto-rollback does NOT drop the DB, to avoid data loss)
  pg_dump -h localhost -U "$USER" "$DB_NAME" 2>/dev/null | gzip > "$dir/db.sql.gz" || true
  echo "$dir" > "$RELEASES_DIR/LATEST"
  ok "snapshot saved: $dir (commit ${sha:0:8})"
}

# ── restore code+build from the latest snapshot and restart ──────────────────
rollback() {
  local dir; dir="$(cat "$RELEASES_DIR/LATEST" 2>/dev/null || true)"
  if [ -z "$dir" ] || [ ! -d "$dir" ]; then err "no snapshot to roll back to"; return 1; fi
  err "ROLLING BACK to $(cat "$dir/COMMIT" 2>/dev/null | cut -c1-8) ($dir)"
  git -C "$APP_DIR" reset --hard "$(cat "$dir/COMMIT")" >/dev/null 2>&1
  [ -f "$dir/backend-dist.tgz" ]  && { rm -rf "$APP_DIR/backend/dist";  tar -C "$APP_DIR/backend"  -xzf "$dir/backend-dist.tgz"; }
  [ -f "$dir/frontend-dist.tgz" ] && { rm -rf "$APP_DIR/frontend/dist"; tar -C "$APP_DIR/frontend" -xzf "$dir/frontend-dist.tgz"; }
  ( cd "$APP_DIR/backend" && npm ci >/dev/null 2>&1 ) || true
  restart_app
  if health_ok "$BACKEND_HEALTH"; then ok "rollback healthy"; else err "rollback still unhealthy — manual intervention needed"; fi
  err "DB was NOT auto-restored (avoids data loss). Manual restore if needed:"
  echo "     gunzip -c '$dir/db.sql.gz' | psql -h localhost -U $USER $DB_NAME"
}

prune() {
  ls -1dt "$RELEASES_DIR"/*/ 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)) | while read -r old; do rm -rf "$old"; done
}

# ── manual rollback entrypoint ───────────────────────────────────────────────
if [ "${1:-}" = "rollback" ]; then rollback; exit $?; fi

# ── deploy ───────────────────────────────────────────────────────────────────
cd "$APP_DIR"
log "Deploy $BRANCH → self-hosted Mac"
mkdir -p "$RELEASES_DIR"

snapshot

log "Fetching origin/$BRANCH"
git fetch origin "$BRANCH" || { err "git fetch failed"; exit 1; }
NEW_SHA="$(git rev-parse "origin/$BRANCH")"
git reset --hard "origin/$BRANCH" || { err "git reset failed"; exit 1; }
ok "checked out ${NEW_SHA:0:8}"

log "Installing dependencies"
( cd backend && npm ci --include=dev ) || { err "backend npm ci failed"; rollback; exit 1; }
( cd frontend && npm ci --include=dev ) || { err "frontend npm ci failed"; rollback; exit 1; }

log "Running tests (deploy gate)"
( cd backend && npm test ) || { err "TESTS FAILED — aborting deploy"; rollback; exit 1; }
ok "tests passed"

log "Building"
( cd backend && npm run build ) || { err "backend build failed"; rollback; exit 1; }
( cd frontend && npm run build ) || { err "frontend build failed"; rollback; exit 1; }

log "Applying DB schema (prisma db push)"
( cd backend && npx prisma generate && npx prisma db push --skip-generate ) || { err "prisma db push failed"; rollback; exit 1; }

log "Restarting app"
restart_app

log "Health check"
if health_ok "$BACKEND_HEALTH" && health_ok "$FRONTEND_HEALTH"; then
  ok "backend + frontend healthy"
else
  err "health check FAILED after deploy"
  rollback
  exit 1
fi

prune
log "Deploy complete ✅  (${NEW_SHA:0:8})"
