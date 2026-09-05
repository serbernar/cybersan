#!/usr/bin/env bash
# Ignition-controlled power for the head unit.
#
# Two halves:
#   1. gpio-poweroff overlay — the kernel holds the keep-alive pin for the whole
#      session and releases it at the end of halt, so the relay drops only once
#      the filesystems are safely down.
#   2. cybersan-power.service — watches the ignition sense pin and calls
#      poweroff after the key has been out for the configured delay.
#
# Run on the Pi:  sudo deploy/power-setup.sh [--enable]
set -euo pipefail

KEEPALIVE_PIN="${CYBERSAN_KEEPALIVE_PIN:-17}"
IGNITION_PIN="${CYBERSAN_IGNITION_PIN:-4}"
OFF_DELAY="${CYBERSAN_OFF_DELAY:-20}"
CONFIG=/boot/firmware/config.txt
ENABLE=no

for arg in "$@"; do
  [[ "$arg" == "--enable" ]] && ENABLE=yes
done

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo deploy/power-setup.sh" >&2
  exit 1
fi

echo "==> Keep-alive overlay on BCM${KEEPALIVE_PIN}"
# active_low=1 means: driven HIGH while running, pulled LOW at poweroff — which
# is exactly the polarity a relay holding its own supply needs.
OVERLAY="dtoverlay=gpio-poweroff,gpiopin=${KEEPALIVE_PIN},active_low=1"
if grep -q "^dtoverlay=gpio-poweroff" "$CONFIG"; then
  sed -i "s|^dtoverlay=gpio-poweroff.*|${OVERLAY}|" "$CONFIG"
  echo "    updated existing line"
else
  printf '\n# cybersan: hold the power relay until halt is complete\n%s\n' "$OVERLAY" >> "$CONFIG"
  echo "    appended to $CONFIG"
fi

echo "==> Guard configuration"
cat > /opt/cybersan/power.env <<ENV
CYBERSAN_POWER_ARGS=--pin ${IGNITION_PIN} --delay ${OFF_DELAY}
ENV

echo "==> systemd unit"
install -m 0644 "$(dirname "$0")/cybersan-power.service" /etc/systemd/system/cybersan-power.service
systemctl daemon-reload

if [[ "$ENABLE" == "yes" ]]; then
  systemctl enable --now cybersan-power.service
  echo "    enabled"
else
  cat <<'WARN'

    NOT enabled — on purpose.

    Until the optocoupler is wired to the ignition pin, that pin reads "key is
    out" from the moment the Pi boots. Enabling the guard now would shut the
    machine down a few seconds after every boot, including over SSH.

    Wire the sense circuit first, verify it with:

        sudo python3 -m cybersan.power --dry-run --delay 5 --verbose

    turning the key on and off while watching the log. When the log follows the
    key, enable it for real:

        sudo deploy/power-setup.sh --enable
WARN
fi

echo
echo "Reboot is required for the keep-alive overlay to take effect."
