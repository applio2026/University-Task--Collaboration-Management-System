#!/usr/bin/env bash
# Quick at-a-glance health check for the self-hosted Uni-TCMS stack.
# Usage:  ./hosting-status.sh
set -u

# pm2 is installed under the user npm prefix (no sudo global install).
export PATH="$HOME/.npm-global/bin:$PATH"

PUBLIC_IP="103.76.103.169"
LAN_IP="192.168.1.45"
BACKEND_PORT=4001
FRONTEND_PORT=8093
DB="universitytask"

green() { printf "  \033[32m✔\033[0m %s\n" "$1"; }
red()   { printf "  \033[31m✗\033[0m %s\n" "$1"; }

check_http() {
  local url="$1" label="$2"
  local code
  code=$(curl -s --max-time 5 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
  if [ "$code" = "200" ]; then green "$label — HTTP $code"; else red "$label — HTTP ${code:-no response}"; fi
}

echo "══════════════════════════════════════════════════════"
echo "  Uni-TCMS host status  ($(date '+%Y-%m-%d %H:%M:%S'))"
echo "══════════════════════════════════════════════════════"

echo "▸ pm2 processes"
if command -v pm2 >/dev/null 2>&1; then
  for app in uni-backend uni-frontend; do
    if pm2 pid "$app" >/dev/null 2>&1 && [ -n "$(pm2 pid "$app" 2>/dev/null)" ]; then
      green "$app — online (pid $(pm2 pid "$app"))"
    else
      red "$app — NOT running   (fix: pm2 start ecosystem.config.js)"
    fi
  done
else
  red "pm2 not found on PATH"
fi

echo "▸ Local endpoints"
check_http "http://localhost:${BACKEND_PORT}/api/health"  "backend  (localhost:${BACKEND_PORT})"
check_http "http://localhost:${FRONTEND_PORT}/"           "frontend (localhost:${FRONTEND_PORT})"

echo "▸ LAN endpoints (what the router forwards to)"
check_http "http://${LAN_IP}:${BACKEND_PORT}/api/health"  "backend  (${LAN_IP}:${BACKEND_PORT})"
check_http "http://${LAN_IP}:${FRONTEND_PORT}/"           "frontend (${LAN_IP}:${FRONTEND_PORT})"

echo "▸ Database"
if psql -h localhost -U "$USER" -d "$DB" -tAc "select count(*) from \"User\"" >/tmp/_dbcnt 2>/dev/null; then
  green "postgres/${DB} — reachable ($(tr -d '[:space:]' </tmp/_dbcnt) users)"
else
  red "postgres/${DB} — cannot query"
fi
rm -f /tmp/_dbcnt

echo "▸ Public URL (requires router port-forwarding 8093 & ${BACKEND_PORT})"
echo "    http://${PUBLIC_IP}:${FRONTEND_PORT}"
echo "    Test from OUTSIDE (phone on cellular) — hairpin NAT often blocks LAN tests."
echo "══════════════════════════════════════════════════════"
