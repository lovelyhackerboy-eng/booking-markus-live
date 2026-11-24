#!/usr/bin/env bash
# Build in a Linux container (same Node major as the host) and write two archives to $1 (default ./deploy/out):
#   v2-app.tar.gz  = standalone server (no node_modules) + .next/static + public + start.cjs + drizzle/ + dist/*.cjs + bridge/
#   v2-deps.tar.gz = the standalone node_modules (goes to ~/nodevenv/markus-v2-app/22/lib/node_modules on the host)
# Usage (Git Bash on Windows): MSYS_NO_PATHCONV=1 bash deploy/package.sh
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && (pwd -W 2>/dev/null || pwd))"
OUT="${1:-$SRC/deploy/out}"
mkdir -p "$OUT"
# Remove the previous archives first: if this build fails, there is nothing stale left to upload by mistake.
rm -f "$OUT/v2-app.tar.gz" "$OUT/v2-deps.tar.gz" "$OUT/BUILD_ID"
docker run --rm -v "$SRC:/src:ro" -v "$OUT:/dst" node:22-bookworm sh -c '
set -e; umask 022; mkdir /b; cd /src
tar --exclude=./node_modules --exclude=./.next --exclude=./dist --exclude=./deploy/out -cf - . | tar -C /b -xf -
cd /b; npm ci --no-audit --no-fund >/dev/null 2>&1
NEXT_TELEMETRY_DISABLED=1 npm run build 2>&1 | grep -E "Compiled|rror|scripts built" || true
test -f .next/standalone/server.js
mkdir /pkg; cp -a .next/standalone/. /pkg/; mkdir -p /pkg/.next/static; cp -a .next/static/. /pkg/.next/static/
[ -d public ] && { mkdir -p /pkg/public; cp -a public/. /pkg/public/; } || true
cp deploy/start.cjs /pkg/; cp -a drizzle /pkg/drizzle; cp -a bridge /pkg/bridge
mkdir -p /pkg/dist; cp dist/migrate.cjs dist/import-sheet.cjs /pkg/dist/
rm -rf /pkg/deploy /pkg/tests /pkg/seed /pkg/scripts /pkg/docker /pkg/docker-compose.dev.yml /pkg/*.md /pkg/lib /pkg/app
mv /pkg/node_modules /deps
rm -f /dst/v2-app.tar.gz /dst/v2-deps.tar.gz
tar -C /pkg -czf /dst/v2-app.tar.gz .; tar -C /deps -czf /dst/v2-deps.tar.gz .
cat .next/BUILD_ID > /dst/BUILD_ID; echo; echo "build $(cat .next/BUILD_ID)"; ls -la /dst'
