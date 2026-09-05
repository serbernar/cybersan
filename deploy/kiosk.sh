#!/usr/bin/env bash
# Launch the HUD fullscreen with no browser UI at all.
# Runs inside the user's Wayland (labwc) session, started from ~/.config/labwc/autostart.
set -euo pipefail

URL="${CYBERSAN_URL:-http://localhost:8322}"

# Wait for the daemon rather than showing Chromium's error page on a cold boot.
for _ in $(seq 1 60); do
  if curl -sf "${URL}/health" >/dev/null; then break; fi
  sleep 0.5
done

# Hide the pointer; there is no mouse in the car.
command -v unclutter >/dev/null && unclutter -idle 0 &

exec chromium \
  --kiosk \
  --app="${URL}" \
  --ozone-platform=wayland \
  --start-fullscreen \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=Translate,TranslateUI \
  --hide-scrollbars \
  --overscroll-history-navigation=0 \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  --user-data-dir=/opt/cybersan/var/chromium
