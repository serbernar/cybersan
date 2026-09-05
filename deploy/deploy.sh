#!/usr/bin/env bash
# Build the HUD here, ship the artefacts to the Pi, restart the daemon.
#
# The Pi never compiles anything: it receives a static dist/ plus the Python
# package. That keeps ~4 minutes of npm off the car and out of the boot path.
set -euo pipefail

HOST="${CYBERSAN_HOST:-nissan-companion.local}"
USER_NAME="${CYBERSAN_USER:-solo}"
TARGET="${USER_NAME}@${HOST}"
APP_ROOT=/opt/cybersan
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Building HUD"
npm --prefix "$REPO_ROOT" run build

echo "==> Syncing to ${TARGET}"
rsync -az --delete "$REPO_ROOT/apps/hud/dist/" "$TARGET:$APP_ROOT/hud/"
rsync -az --delete \
  --exclude '__pycache__' \
  "$REPO_ROOT/apps/daemon/cybersan/" "$TARGET:$APP_ROOT/daemon/cybersan/"
# The Pi has no checkout, so the contract travels inside the Python package.
rsync -az "$REPO_ROOT/packages/protocol/default-state.json" \
  "$TARGET:$APP_ROOT/daemon/cybersan/default-state.json"

echo "==> Restarting daemon"
ssh "$TARGET" "sudo systemctl restart cybersan-daemon && sleep 1 && curl -sf localhost:8322/health"
echo
echo "Deployed. Reload the kiosk with:  ssh $TARGET 'pkill -HUP chromium || true'"
