#!/usr/bin/env bash
# Turn the Pi into a Bluetooth car stereo: a discoverable A2DP sink that a phone
# can pair with and stream to. Idempotent.
#
# Run on the Pi:  sudo deploy/bluetooth-setup.sh
set -euo pipefail

BT_NAME="${CYBERSAN_BT_NAME:-NissanT30Companion}"
# Class of Device: Audio service + Rendering service, Audio/Video major,
# "Car audio" minor. Phones use this to show a car icon and to pick A2DP.
BT_CLASS="0x240420"
USER_NAME="${SUDO_USER:-solo}"

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo deploy/bluetooth-setup.sh" >&2
  exit 1
fi

echo "==> Packages"
apt-get install -y bluez-tools pulseaudio-utils libspa-0.2-bluetooth

echo "==> Adapter name: ${BT_NAME}"
hostnamectl set-hostname --pretty "$BT_NAME"

echo "==> /etc/bluetooth/main.conf"
python3 - "$BT_NAME" "$BT_CLASS" <<'PY'
import re
import sys

name, cls = sys.argv[1], sys.argv[2]
path = "/etc/bluetooth/main.conf"
settings = {
    "Name": name,
    "Class": cls,
    # Visible only during a pairing window opened from the settings screen: a
    # parked car should not be pairable by whoever walks past it. These are the
    # window lengths, not the default state.
    "DiscoverableTimeout": "120",
    "PairableTimeout": "120",
    "AlwaysPairable": "false",
    "FastConnectable": "true",
}

with open(path, encoding="utf-8") as handle:
    lines = handle.read().splitlines()

for key, value in settings.items():
    pattern = re.compile(rf"^\s*#?\s*{key}\s*=.*$")
    for index, line in enumerate(lines):
        if pattern.match(line):
            lines[index] = f"{key} = {value}"
            break
    else:
        general = next((i for i, l in enumerate(lines) if l.strip() == "[General]"), 0)
        lines.insert(general + 1, f"{key} = {value}")

with open(path, "w", encoding="utf-8") as handle:
    handle.write("\n".join(lines) + "\n")
print("updated", path)
PY

echo "==> Pairing agent"
cat > /etc/systemd/system/cybersan-bt-agent.service <<UNIT
[Unit]
Description=cybersan Bluetooth pairing agent
After=bluetooth.service
Requires=bluetooth.service

[Service]
Type=simple
# NoInputNoOutput: the head unit has no keypad, so pairing is Just Works —
# the same handshake every factory car stereo uses.
ExecStart=/usr/bin/bt-agent --capability=NoInputNoOutput
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
UNIT

echo "==> Keep the adapter up, visible and pairable across reboots"
cat > /etc/systemd/system/cybersan-bt-ready.service <<UNIT
[Unit]
Description=cybersan Bluetooth adapter state
After=bluetooth.service cybersan-bt-agent.service
Requires=bluetooth.service

[Service]
Type=oneshot
RemainAfterExit=yes
# Raspberry Pi OS ships the radio soft-blocked; the desktop's Bluetooth toggle
# persists that state, so unblock before touching the adapter.
ExecStartPre=/usr/sbin/rfkill unblock bluetooth
# BlueZ reports Busy for a moment after the unblock, so retry rather than
# leaving the radio off until someone notices.
ExecStart=/bin/sh -c 'for i in 1 2 3 4 5 6; do /usr/bin/bluetoothctl power on && break; sleep 1; done'
# Powered but invisible. The HUD opens the pairing window on request.
ExecStart=/usr/bin/bluetoothctl discoverable off
ExecStart=/usr/bin/bluetoothctl pairable off

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now cybersan-bt-agent.service
systemctl enable --now cybersan-bt-ready.service

echo "==> Profiles: audio only"
# SIM Access is a phone-side profile with no place on a speaker. It is a
# bluetoothd plugin, so it goes off with a daemon flag — main.conf has no
# switch for it.
install -d /etc/systemd/system/bluetooth.service.d
cat > /etc/systemd/system/bluetooth.service.d/10-cybersan-noplugin.conf <<'UNIT'
[Service]
ExecStart=
ExecStart=/usr/libexec/bluetooth/bluetoothd --noplugin=sap
UNIT
systemctl daemon-reload

# The head unit is a speaker, not a phone. Restricting WirePlumber to the A2DP
# sink role stops BlueZ advertising Hands-Free, which is what makes iOS ask to
# sync contacts and call history on every pairing.
USER_HOME=$(getent passwd "$USER_NAME" | cut -d: -f6)
install -d -o "$USER_NAME" -g "$USER_NAME" "$USER_HOME/.config/wireplumber/wireplumber.conf.d"
cat > "$USER_HOME/.config/wireplumber/wireplumber.conf.d/51-cybersan-bluez.conf" <<'WP'
monitor.bluez.properties = {
  # Audio sink only: no hands-free, no headset gateway, no phonebook.
  bluez5.roles = [ a2dp_sink ]
  # Keep absolute volume so the phone's own slider still reaches the stream.
  bluez5.enable-hw-volume = true
}
WP
chown "$USER_NAME:$USER_NAME" "$USER_HOME/.config/wireplumber/wireplumber.conf.d/51-cybersan-bluez.conf"

# obexd is what serves phonebook access; without it there is nothing to grant.
sudo -u "$USER_NAME" XDG_RUNTIME_DIR=/run/user/$(id -u "$USER_NAME") \
  systemctl --user mask obex.service 2>/dev/null || true
sudo -u "$USER_NAME" XDG_RUNTIME_DIR=/run/user/$(id -u "$USER_NAME") \
  systemctl --user restart wireplumber 2>/dev/null || true

# Restart last, so bluetoothd comes up with every plugin decision already made.
systemctl restart bluetooth
systemctl restart cybersan-bt-ready.service || true

echo "==> Audio routing"
# WirePlumber links the incoming stream to the default sink on its own; lingering
# keeps that user session alive when nobody is logged in.
loginctl enable-linger "$USER_NAME" || true

echo
bluetoothctl show | sed -n '1,12p'
echo
echo "Ready. Open the pairing window from Опції → Bluetooth, then pair with: ${BT_NAME}"
