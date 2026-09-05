"""Bluetooth media: what the phone is playing, and control over it.

BlueZ exposes the phone's player over D-Bus as org.bluez.MediaPlayer1 (AVRCP),
so the head unit gets title/artist/album/position for free and can send
play/pause/next/prev back. The audio itself never passes through this daemon —
PipeWire routes A2DP straight to the sound card.

dbus-python is a system package on the car and absent on a development laptop,
so the import is deferred: on a laptop this source simply reports offline.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import subprocess
import time
from typing import Any

from .base import Publish, Source

log = logging.getLogger(__name__)

#: wpctl talks to the user session's PipeWire, which needs this in the env of a
#: system service.
PIPEWIRE_ENV = {**os.environ, "XDG_RUNTIME_DIR": os.environ.get("XDG_RUNTIME_DIR", "/run/user/1000")}
DEFAULT_SINK = "@DEFAULT_AUDIO_SINK@"

BLUEZ = "org.bluez"
ADAPTER_PATH = "/org/bluez/hci0"
ADAPTER_IFACE = "org.bluez.Adapter1"
PLAYER_IFACE = "org.bluez.MediaPlayer1"
DEVICE_IFACE = "org.bluez.Device1"
PROPS_IFACE = "org.freedesktop.DBus.Properties"

#: AVRCP status values mapped onto the protocol's `media.playback`.
PLAYBACK = {
    "playing": "playing",
    "paused": "paused",
    "stopped": "stopped",
    "forward-seek": "playing",
    "reverse-seek": "playing",
    "error": "stopped",
}


class BluetoothMediaSource(Source):
    id = "media"
    paths = ("media.title", "media.artist", "media.playback")

    def __init__(self, interval: float = 1.0) -> None:
        super().__init__()
        self.interval = interval
        self._bus: Any = None
        self._player_path: str | None = None
        #: monotonic deadline of the pairing window, None when it is closed
        self._pairing_until: float | None = None
        #: addresses already connected when the window opened, so that a *new*
        #: connection can be told apart from the phone that was already there
        self._known_on_open: set[str] = set()
        #: kept so a command can push its result out at once instead of waiting
        #: for the next poll — a volume knob that answers a second later is felt
        #: as a broken knob
        self._publish: Publish | None = None
        #: latest requested volume, and whether a worker is already applying one
        self._volume_target: int | None = None
        self._volume_busy = False

    async def run(self, publish: Publish) -> None:
        # Imported here so the module loads on machines without D-Bus at all.
        import dbus  # type: ignore[import-not-found]

        self._bus = dbus.SystemBus()
        self._publish = publish
        log.info("bluetooth media source connected to the system bus")

        while True:
            snapshot = await asyncio.to_thread(self._read)
            snapshot.update(await asyncio.to_thread(self._read_bluetooth))
            publish(snapshot, self.id)
            await asyncio.sleep(self.interval)

    # ---------------------------------------------------------------- read --

    def _read_output(self) -> dict[str, Any]:
        """The head unit's own output level, straight from PipeWire.

        Deliberately not AVRCP absolute volume: that only works while audio is
        actually streaming, and returns ENOENT the moment the transport goes
        idle — which is exactly when a driver reaches for the knob.
        """
        try:
            result = subprocess.run(
                ["wpctl", "get-volume", DEFAULT_SINK],
                capture_output=True,
                text=True,
                timeout=2,
                env=PIPEWIRE_ENV,
            )
        except (OSError, subprocess.SubprocessError):
            return {}
        match = re.search(r"Volume:\s*([0-9.]+)", result.stdout)
        if not match:
            return {}
        return {
            "media.volume": round(float(match.group(1)) * 100),
            "media.muted": "[MUTED]" in result.stdout,
        }

    def _set_volume(self, percent: int) -> None:
        percent = max(0, min(100, percent))
        self._wpctl("set-volume", DEFAULT_SINK, f"{percent}%")

    def _toggle_mute(self) -> None:
        self._wpctl("set-mute", DEFAULT_SINK, "toggle")

    async def _apply_volume(self, value: int) -> None:
        """Apply the newest requested level, discarding anything overtaken.

        A dragged slider produces values faster than a process can be spawned
        for each one. Applying them all makes the output trail the finger by
        seconds; only the value the finger is on now is worth setting, so the
        intermediate ones are dropped rather than queued.
        """
        self._volume_target = value
        if self._volume_busy:
            return

        self._volume_busy = True
        try:
            while self._volume_target is not None:
                target = self._volume_target
                self._volume_target = None
                await asyncio.to_thread(self._set_volume, target)
                # wpctl raised nothing, so the level is exactly what we asked
                # for: echo it instead of spawning a second process to read it.
                if self._publish is not None:
                    self._publish({"media.volume": target}, self.id)
        finally:
            self._volume_busy = False

    async def _echo_output(self) -> None:
        """Publish the new output level right after changing it."""
        if self._publish is None:
            return
        state = await asyncio.to_thread(self._read_output)
        if state:
            self._publish(state, self.id)

    def _wpctl(self, *args: str) -> None:
        subprocess.run(
            ["wpctl", *args],
            capture_output=True,
            timeout=2,
            env=PIPEWIRE_ENV,
            check=True,
        )

    def _read(self) -> dict[str, Any]:
        player = self._find_player()
        base: dict[str, Any] = self._read_output()

        if player is None:
            return base | {
                "media.playback": "stopped",
                "media.title": None,
                "media.artist": None,
                "media.album": None,
                "media.source": "none",
                "media.positionS": 0,
                "media.durationS": 0,
            }

        props = self._properties(player, PLAYER_IFACE)
        track = props.get("Track", {})
        status = str(props.get("Status", "stopped")).lower()

        return base | {
            "media.playback": PLAYBACK.get(status, "stopped"),
            "media.source": "bluetooth",
            "media.title": _text(track.get("Title")),
            "media.artist": _text(track.get("Artist")),
            "media.album": _text(track.get("Album")),
            # BlueZ reports milliseconds; the HUD counts in whole seconds and
            # interpolates between polls so the progress bar stays smooth.
            "media.positionS": int(props.get("Position", 0)) // 1000,
            "media.durationS": int(track.get("Duration", 0)) // 1000,
        }

    def _read_bluetooth(self) -> dict[str, Any]:
        """Adapter state and the list of known phones, for the settings screen."""
        import dbus  # type: ignore[import-not-found]

        devices: list[dict[str, Any]] = []
        connected_now: set[str] = set()
        try:
            manager = dbus.Interface(
                self._bus.get_object(BLUEZ, "/"), "org.freedesktop.DBus.ObjectManager"
            )
            objects = manager.GetManagedObjects()
        except Exception:  # noqa: BLE001 - bluetoothd restarting
            return {}

        for path, interfaces in objects.items():
            device = interfaces.get(DEVICE_IFACE)
            if device is None:
                continue
            is_connected = bool(device.get("Connected", False))
            address = str(device.get("Address", ""))
            if is_connected:
                connected_now.add(address)

            # A paired phone that is not trusted has to be let in by hand on
            # every reconnection. Trust it once, here, so getting into the car
            # and having music is a single step.
            if device.get("Paired", False) and not device.get("Trusted", False):
                self._trust(str(path))
            devices.append(
                {
                    "address": address,
                    "name": str(device.get("Alias") or device.get("Name") or path.rsplit("/", 1)[-1]),
                    "connected": is_connected,
                    "paired": bool(device.get("Paired", False)),
                }
            )

        # Connected first, then alphabetically: the phone in the car is the one
        # the driver is looking for.
        devices.sort(key=lambda d: (not d["connected"], d["name"].lower()))

        adapter = objects.get(ADAPTER_PATH, {}).get(ADAPTER_IFACE, {})
        discoverable = bool(adapter.get("Discoverable", False))

        # Pairing succeeded — a phone that was not connected when the window
        # opened now is. Stop advertising at once, but stay *pairable* until the
        # window's own deadline: iOS finishes bonding after the link is already
        # up, and clearing Pairable at that moment makes the first attempt fail
        # and only the retry succeed.
        if discoverable and (connected_now - self._known_on_open):
            log.info("new device connected, hiding the adapter")
            self._hide()
            discoverable = False

        remaining = 0
        if self._pairing_until is not None:
            # The deadline is authoritative for the countdown. BlueZ can still
            # report the old Discoverable value on the poll right after the
            # window opens, and trusting it there would zero the timer at once.
            remaining = max(0, round(self._pairing_until - time.monotonic()))
            if remaining == 0:
                # Window over: only now is it safe to stop being pairable.
                self._set_pairing(False, 0)

        return {
            "bluetooth.adapter": {
                "alias": str(adapter.get("Alias", "")) or None,
                "discoverable": discoverable,
                "discoverableFor": remaining,
                "pairable": bool(adapter.get("Pairable", False)),
            },
            "bluetooth.devices": devices,
        }

    def _find_player(self) -> str | None:
        """Locate the connected phone's AVRCP player, remembering the path."""
        import dbus  # type: ignore[import-not-found]

        if self._player_path and self._path_exists(self._player_path):
            return self._player_path

        manager = dbus.Interface(
            self._bus.get_object(BLUEZ, "/"), "org.freedesktop.DBus.ObjectManager"
        )
        for path, interfaces in manager.GetManagedObjects().items():
            if PLAYER_IFACE in interfaces:
                self._player_path = str(path)
                log.info("using AVRCP player at %s", self._player_path)
                return self._player_path

        self._player_path = None
        return None

    def _path_exists(self, path: str) -> bool:
        try:
            self._properties(path, PLAYER_IFACE)
            return True
        except Exception:  # noqa: BLE001 - the phone simply drove away
            return False

    def _properties(self, path: str, interface: str) -> dict[str, Any]:
        import dbus  # type: ignore[import-not-found]

        props = dbus.Interface(self._bus.get_object(BLUEZ, path), PROPS_IFACE)
        return dict(props.GetAll(interface))

    # ------------------------------------------------------------- control --

    async def handle_command(self, name: str, args: dict[str, Any]) -> bool:
        if name == "media.volume":
            await self._apply_volume(max(0, min(100, int(args.get("value", 0)))))
            return True
        if name == "media.mute":
            await asyncio.to_thread(self._toggle_mute)
            await self._echo_output()
            return True
        if name in {"media.play", "media.pause", "media.next", "media.prev"}:
            await asyncio.to_thread(self.command, name)
            return True
        if name == "bt.pair":
            seconds = int(args.get("seconds", 120))
            await asyncio.to_thread(self._set_pairing, True, seconds)
            return True
        if name == "bt.pairStop":
            await asyncio.to_thread(self._set_pairing, False, 0)
            return True
        if name == "bt.disconnect":
            await asyncio.to_thread(self._disconnect, str(args.get("address", "")))
            return True
        if name == "bt.forget":
            await asyncio.to_thread(self._forget, str(args.get("address", "")))
            return True
        if name == "bt.rename":
            await asyncio.to_thread(self._rename, str(args.get("name", "")))
            return True
        return False

    # --------------------------------------------------------------- admin --

    def _adapter_props(self) -> Any:
        import dbus  # type: ignore[import-not-found]

        return dbus.Interface(self._bus.get_object(BLUEZ, ADAPTER_PATH), PROPS_IFACE)

    def _set_pairing(self, enabled: bool, seconds: int) -> None:
        """Open or close the pairing window.

        Outside the window the adapter is neither discoverable nor pairable, so
        a head unit sitting in a car park is invisible and cannot be paired with
        by anyone walking past.
        """
        import dbus  # type: ignore[import-not-found]

        props = self._adapter_props()
        if enabled:
            self._known_on_open = self._connected_addresses()
            props.Set(ADAPTER_IFACE, "DiscoverableTimeout", dbus.UInt32(seconds))
            props.Set(ADAPTER_IFACE, "Pairable", dbus.Boolean(True))
            props.Set(ADAPTER_IFACE, "PairableTimeout", dbus.UInt32(seconds))
            props.Set(ADAPTER_IFACE, "Discoverable", dbus.Boolean(True))
            self._pairing_until = time.monotonic() + seconds
            log.info("pairing window open for %ss", seconds)
        else:
            props.Set(ADAPTER_IFACE, "Discoverable", dbus.Boolean(False))
            props.Set(ADAPTER_IFACE, "Pairable", dbus.Boolean(False))
            self._pairing_until = None
            log.info("pairing window closed")

    def _trust(self, path: str) -> None:
        import dbus  # type: ignore[import-not-found]

        try:
            props = dbus.Interface(self._bus.get_object(BLUEZ, path), PROPS_IFACE)
            props.Set(DEVICE_IFACE, "Trusted", dbus.Boolean(True))
            log.info("trusted %s for automatic reconnection", path)
        except Exception as error:  # noqa: BLE001 - the phone may have just left
            log.warning("cannot trust %s: %s", path, error)

    def _hide(self) -> None:
        """Stop advertising without ending the pairing window."""
        import dbus  # type: ignore[import-not-found]

        self._adapter_props().Set(ADAPTER_IFACE, "Discoverable", dbus.Boolean(False))

    def _connected_addresses(self) -> set[str]:
        import dbus  # type: ignore[import-not-found]

        try:
            manager = dbus.Interface(
                self._bus.get_object(BLUEZ, "/"), "org.freedesktop.DBus.ObjectManager"
            )
            objects = manager.GetManagedObjects()
        except Exception:  # noqa: BLE001 - bluetoothd restarting
            return set()
        return {
            str(interfaces[DEVICE_IFACE].get("Address", ""))
            for interfaces in objects.values()
            if DEVICE_IFACE in interfaces and interfaces[DEVICE_IFACE].get("Connected", False)
        }

    def _device_path(self, address: str) -> str | None:
        if not address:
            return None
        return f"{ADAPTER_PATH}/dev_" + address.upper().replace(":", "_")

    def _disconnect(self, address: str) -> None:
        """Drop the audio link but keep the pairing, so it reconnects later."""
        import dbus  # type: ignore[import-not-found]

        path = self._device_path(address)
        if path is None:
            return
        device = dbus.Interface(self._bus.get_object(BLUEZ, path), DEVICE_IFACE)
        device.Disconnect()
        log.info("disconnected %s", address)

    def _forget(self, address: str) -> None:
        """Remove the pairing entirely; the phone must be paired again."""
        import dbus  # type: ignore[import-not-found]

        path = self._device_path(address)
        if path is None:
            return
        adapter = dbus.Interface(self._bus.get_object(BLUEZ, ADAPTER_PATH), ADAPTER_IFACE)
        adapter.RemoveDevice(dbus.ObjectPath(path))
        log.info("removed pairing for %s", address)

    def _rename(self, name: str) -> None:
        import dbus  # type: ignore[import-not-found]

        name = name.strip()[:32]
        if not name:
            return
        self._adapter_props().Set(ADAPTER_IFACE, "Alias", dbus.String(name))
        log.info("adapter renamed to %s", name)

    def command(self, name: str) -> None:
        """Send a transport command to the phone."""
        import dbus  # type: ignore[import-not-found]

        method = {
            "media.play": "Play",
            "media.pause": "Pause",
            "media.next": "Next",
            "media.prev": "Previous",
        }.get(name)
        if method is None or self._bus is None:
            return
        player = self._find_player()
        if player is None:
            log.warning("no phone connected; dropping %s", name)
            return
        iface = dbus.Interface(self._bus.get_object(BLUEZ, player), PLAYER_IFACE)
        getattr(iface, method)()



def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
