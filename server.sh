#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Uni-TCMS server control  —  start | stop | restart | status | logs
#
#   ./server.sh start      Postgres (clears stale lock) + app + nginx
#   ./server.sh stop       stop nginx + app  (Postgres left running)
#   ./server.sh restart    force-restart everything; clears a stale Postgres
#                          lock (e.g. after a power cut)
#   ./server.sh status     one-shot health check (no sudo needed)
#   ./server.sh logs       tail backend logs (Ctrl+C to exit)
#
# NOTE: nginx listens on port 80, which needs root on macOS, so start/stop/
# restart run the nginx step with sudo (you'll be prompted for your password).
# ─────────────────────────────────────────────────────────────
set -u

# --- config ---------------------------------------------------
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$HOME/.npm-global/bin:/opt/homebrew/bin:$PATH"   # pm2 + brew tools

PG_SERVICE="postgresql@17"
PG_DATA="/opt/homebrew/var/postgresql@17"
PG_PIDFILE="$PG_DATA/postmaster.pid"
DB_NAME="universitytask"
BACKEND_PORT=4001
FRONTEND_PORT=8093
DOMAIN="task.eimple.com"
PUBLIC_IP="103.76.103.169"

# --- pretty output --------------------------------------------
ok()   { printf "  \033[32m✔\033[0m %s\n" "$1"; }
warn() { printf "  \033[33m•\033[0m %s\n" "$1"; }
err()  { printf "  \033[31m✗\033[0m %s\n" "$1"; }
hd()   { printf "\n\033[1m▸ %s\033[0m\n" "$1"; }

# --- postgres helpers -----------------------------------------
pg_up() { pg_isready -h localhost -q >/dev/null 2>&1; }

# Remove postmaster.pid ONLY if it's stale (no live postgres owns it). Safe to
# call any time — it never touches a healthy running database.
clear_stale_lock() {
  [ -f "$PG_PIDFILE" ] || return 0
  local pid
  pid="$(head -1 "$PG_PIDFILE" 2>/dev/null)"
  if [ -n "$pid" ] && ps -p "$pid" -o comm= 2>/dev/null | grep -q postgres; then
    warn "postmaster.pid points at live postgres (pid $pid) — leaving it"
    return 0
  fi
  rm -f "$PG_PIDFILE" && ok "removed stale lock file (was pid ${pid:-?})"
}

ensure_postgres() {
  if pg_up; then ok "postgres already running"; return 0; fi
  warn "postgres not responding — clearing lock and starting"
  brew services stop "$PG_SERVICE" >/dev/null 2>&1
  sleep 2   # let a still-exiting postmaster release the pidfile/port first
  clear_stale_lock
  brew services start "$PG_SERVICE" >/dev/null 2>&1
  for _ in $(seq 1 20); do pg_up && { ok "postgres started"; return 0; }; sleep 1; done
  err "postgres failed to start — see: tail -30 /opt/homebrew/var/log/$PG_SERVICE.log"
  return 1
}

pg_force_cycle() {
  brew services stop "$PG_SERVICE" >/dev/null 2>&1
  sleep 2
  clear_stale_lock
  brew services start "$PG_SERVICE" >/dev/null 2>&1
  for _ in $(seq 1 20); do pg_up && break; sleep 1; done
  pg_up && ok "postgres up" || err "postgres still down — see /opt/homebrew/var/log/$PG_SERVICE.log"
}

# --- app (pm2) helpers ----------------------------------------
app_start()   { pm2 start "$ROOT/ecosystem.config.js" >/dev/null 2>&1 \
                || pm2 restart "$ROOT/ecosystem.config.js" >/dev/null 2>&1; pm2 save >/dev/null 2>&1; }
app_restart() { pm2 restart "$ROOT/ecosystem.config.js" >/dev/null 2>&1 \
                || pm2 start "$ROOT/ecosystem.config.js" >/dev/null 2>&1; pm2 save >/dev/null 2>&1; }
app_stop()    { pm2 stop "$ROOT/ecosystem.config.js" >/dev/null 2>&1; pm2 save >/dev/null 2>&1; }

# --- nginx helpers (need sudo: port 80) -----------------------
nginx_installed() { command -v nginx >/dev/null 2>&1; }
# nginx runs as root, so a non-root pgrep/lsof can't see it — probe port 80
# instead. Any HTTP response (even 502) means nginx is up; connection refused
# means it's down.
nginx_running()   { curl -s -o /dev/null --max-time 3 http://localhost:80/ >/dev/null 2>&1; }

# nginx is run directly as root (sudo nginx), NOT via `brew services` — on Apple
# Silicon `sudo brew services` fails to bootstrap the LaunchDaemon (launchctl
# error 5). Boot persistence is handled by a separate LaunchDaemon (see
# deploy/com.uni-tcms.nginx.plist and README in the script header).
nginx_start() {
  nginx_installed || { warn "nginx not installed — skipping"; return 0; }
  if ! sudo nginx -t >/dev/null 2>&1; then err "nginx config test FAILED (run: sudo nginx -t) — not starting"; return 1; fi
  if nginx_running; then
    sudo nginx -s reload && ok "nginx reloaded"
  else
    warn "starting nginx (sudo — enter your password)"
    sudo nginx && ok "nginx started" || err "nginx failed to start"
  fi
}

nginx_stop() {
  nginx_installed || return 0
  nginx_running || { ok "nginx already stopped"; return 0; }
  warn "stopping nginx (sudo — enter your password)"
  sudo nginx -s stop && ok "nginx stopped" || err "nginx failed to stop"
}

nginx_restart() {
  nginx_installed || { warn "nginx not installed — skipping"; return 0; }
  if ! sudo nginx -t >/dev/null 2>&1; then err "nginx config test FAILED (run: sudo nginx -t) — not restarting"; return 1; fi
  warn "restarting nginx (sudo — enter your password)"
  if nginx_running; then
    sudo nginx -s reload && ok "nginx reloaded" || err "nginx reload failed"
  else
    sudo nginx && ok "nginx started" || err "nginx failed to start"
  fi
}

http_ok() { [ "$(curl -s --max-time 5 -o /dev/null -w '%{http_code}' "$1" 2>/dev/null)" = "200" ]; }

# --- commands -------------------------------------------------
cmd_start() {
  hd "Starting Uni-TCMS"
  ensure_postgres || exit 1
  app_start
  sleep 2
  nginx_start
  cmd_status
}

cmd_stop() {
  hd "Stopping Uni-TCMS"
  nginx_stop
  app_stop
  ok "app stopped (Postgres left running as a system service)"
  warn "to also stop the database:  brew services stop $PG_SERVICE"
}

cmd_restart() {
  hd "Restarting Uni-TCMS (force; clears stale DB lock)"
  pg_force_cycle
  app_restart
  sleep 2
  nginx_restart
  cmd_status
}

cmd_status() {
  hd "Status"
  pg_up && ok "postgres — accepting connections" || err "postgres — DOWN"
  if pg_up; then
    local n; n="$(psql -h localhost -U "$USER" -d "$DB_NAME" -tAc 'select count(*) from "User"' 2>/dev/null | tr -d '[:space:]')"
    [ -n "$n" ] && ok "database $DB_NAME — reachable ($n users)" || err "database $DB_NAME — cannot query"
  fi
  for app in uni-backend uni-frontend; do
    local apid; apid="$(pm2 pid "$app" 2>/dev/null | tr -d '[:space:]')"
    # pm2 reports pid 0 for a stopped app — treat only a real (non-zero) pid as online.
    if [ -n "$apid" ] && [ "$apid" != "0" ]; then ok "$app — online (pid $apid)"; else err "$app — not running"; fi
  done
  http_ok "http://localhost:$BACKEND_PORT/api/health" && ok "backend  :$BACKEND_PORT — HTTP 200" || err "backend  :$BACKEND_PORT — no response"
  http_ok "http://localhost:$FRONTEND_PORT/"          && ok "frontend :$FRONTEND_PORT — HTTP 200" || err "frontend :$FRONTEND_PORT — no response"
  if nginx_installed; then
    if nginx_running; then
      http_ok "http://localhost/api/health" && ok "nginx :80 — up, proxying API ✔" || warn "nginx :80 — running but /api not answering (check upstreams)"
    else
      err "nginx :80 — not running   (start: sudo nginx   or   ./server.sh start)"
    fi
  fi
  printf "\n  Public URL: http://%s   (also http://%s once DNS + router:80 are set)\n\n" "$PUBLIC_IP" "$DOMAIN"
}

cmd_logs() { pm2 logs uni-backend; }

# --- dispatch -------------------------------------------------
case "${1:-}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_restart ;;
  status)  cmd_status ;;
  logs)    cmd_logs ;;
  *) echo "Usage: ./server.sh {start|stop|restart|status|logs}"; exit 1 ;;
esac
