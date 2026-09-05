#!/usr/bin/env bash
# One-time setup on the Raspberry Pi. Idempotent: safe to re-run after changes.
set -euo pipefail

APP_ROOT=/opt/cybersan
USER_NAME="${SUDO_USER:-$USER}"

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo deploy/install.sh" >&2
  exit 1
fi

echo "==> Packages"
apt-get update
# Distro packages only: no Node, no npm, no Electron on the car.
apt-get install -y python3-aiohttp chromium unclutter curl rsync

echo "==> Directories"
install -d -o "$USER_NAME" -g "$USER_NAME" "$APP_ROOT" "$APP_ROOT/hud" "$APP_ROOT/daemon" "$APP_ROOT/var"

echo "==> systemd unit"
install -m 0644 "$(dirname "$0")/cybersan-daemon.service" /etc/systemd/system/cybersan-daemon.service
sed -i "s/^User=.*/User=${USER_NAME}/" /etc/systemd/system/cybersan-daemon.service
systemctl daemon-reload
systemctl enable cybersan-daemon.service

echo "==> Kiosk autostart"
install -m 0755 "$(dirname "$0")/kiosk.sh" "$APP_ROOT/kiosk.sh"
USER_HOME=$(getent passwd "$USER_NAME" | cut -d: -f6)
install -d -o "$USER_NAME" -g "$USER_NAME" "$USER_HOME/.config/labwc"
AUTOSTART="$USER_HOME/.config/labwc/autostart"
touch "$AUTOSTART"
chown "$USER_NAME:$USER_NAME" "$AUTOSTART"
if ! grep -q cybersan "$AUTOSTART"; then
  echo "$APP_ROOT/kiosk.sh >/tmp/cybersan-kiosk.log 2>&1 &" >> "$AUTOSTART"
fi

echo
echo "Done. Now push a build from the development machine:"
echo "  deploy/deploy.sh"
