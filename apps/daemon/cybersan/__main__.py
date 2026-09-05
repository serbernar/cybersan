"""Entry point: wire the sources that this installation actually has."""

from __future__ import annotations

import argparse
import asyncio
import logging
from pathlib import Path

from .hub import Hub
from .server import run
from .sources import BluetoothMediaSource, IgnitionSource, SystemSource
from .state import StateStore

DEFAULT_STATIC = Path(__file__).resolve().parents[2] / "hud" / "dist"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="cybersan-daemon")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8322)
    parser.add_argument(
        "--static",
        type=Path,
        default=DEFAULT_STATIC,
        help="directory holding the built HUD (index.html + assets/)",
    )
    parser.add_argument(
        "--no-bluetooth",
        action="store_true",
        help="skip the AVRCP media source (no D-Bus on this machine)",
    )
    parser.add_argument("--verbose", action="store_true")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    )

    store = StateStore()
    hub = Hub(store)
    hub.add_source(SystemSource())

    if not args.no_bluetooth:
        hub.add_source(BluetoothMediaSource())

    # The ignition guard publishes to /run/cybersan/ignition whether or not the
    # rest of the car is wired, so this source is useful on its own.
    hub.add_source(IgnitionSource())

    # Nothing fakes the car. A source that is not wired says so, and the HUD
    # shows "no data" rather than a plausible-looking number.
    for source_id, detail in (
        ("obd", "адаптер ELM327 ще не підключено"),
        ("gps", "приймач відсутній"),
    ):
        store.set_source(source_id, "offline", detail)

    try:
        asyncio.run(run(hub, args.host, args.port, args.static))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
