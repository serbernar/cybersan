"""Raspberry Pi health: the one source that works with no car attached."""

from __future__ import annotations

import asyncio
import socket
import time
from pathlib import Path
from .base import Publish, Source

THERMAL = Path("/sys/class/thermal/thermal_zone0/temp")


def _cpu_temp_c() -> float | None:
    try:
        return round(int(THERMAL.read_text().strip()) / 1000, 1)
    except (OSError, ValueError):
        return None


def _load_pct() -> float | None:
    try:
        load1, _, _ = (float(v) for v in Path("/proc/loadavg").read_text().split()[:3])
    except (OSError, ValueError):
        return None
    # Normalised against the Pi 4's four cores.
    return round(min(100.0, load1 / 4 * 100), 1)


class SystemSource(Source):
    id = "system"
    paths = ("system.cpuTempC", "system.cpuLoadPct")

    async def run(self, publish: Publish) -> None:
        started = time.monotonic()
        publish({"system.hostname": socket.gethostname()}, self.id)
        while True:
            publish(
                {
                    "system.cpuTempC": _cpu_temp_c(),
                    "system.cpuLoadPct": _load_pct(),
                    "system.uptimeS": int(time.monotonic() - started),
                },
                self.id,
            )
            await asyncio.sleep(2.0)
