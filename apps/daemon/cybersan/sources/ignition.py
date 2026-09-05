"""Ignition state, read from whatever the power guard last published.

The guard runs as its own root service so that a crash in the HUD daemon can
never leave the car unable to switch itself off. The two talk through one small
file in /run, which keeps the coupling to a single well-known path.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from .base import Publish, Source, SourceUnavailable

STATE_FILE = Path("/run/cybersan/ignition")


class IgnitionSource(Source):
    id = "gpio"
    paths = ("electrical.ignition",)

    def __init__(self, path: Path = STATE_FILE, interval: float = 1.0) -> None:
        super().__init__()
        self.path = path
        self.interval = interval

    async def run(self, publish: Publish) -> None:
        misses = 0
        while True:
            state = await asyncio.to_thread(self._read)
            if state is None:
                misses += 1
                if misses >= 5:
                    # Report the truth rather than showing a healthy source that
                    # is publishing nothing. The supervisor retries on its own.
                    raise SourceUnavailable("служба живлення не запущена")
            else:
                misses = 0
                publish(state, self.id)
            await asyncio.sleep(self.interval)

    def _read(self) -> dict[str, object] | None:
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            # The guard is not running on this machine; say nothing rather than
            # claiming the ignition is off.
            return None
        return {"electrical.ignition": "on" if payload.get("ignition") == "on" else "off"}
