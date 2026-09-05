"""Source plugin contract.

Every producer of vehicle data — OBD, GPIO, GPS, the OS, Bluetooth — is a
`Source`. The hub owns their lifecycle and never learns what is behind them, so
adding the ELM327 later touches exactly one new file plus one registration.
"""

from __future__ import annotations

import abc
import asyncio
import logging
from typing import Any, Callable

log = logging.getLogger(__name__)


class SourceUnavailable(Exception):
    """The hardware or service behind this source simply is not here yet.

    Distinct from a crash: it is expected on a half-built car, so it is reported
    on the diagnostics screen without filling the journal with tracebacks.
    """

Publish = Callable[[dict[str, Any], str], None]


class Source(abc.ABC):
    #: Matches SourceId in packages/protocol.
    id: str = "unknown"

    #: Signals this source claims. Used to mark them stale when it dies.
    paths: tuple[str, ...] = ()

    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None

    async def start(self, publish: Publish, status: Callable[[str, str | None], None]) -> None:
        self._task = asyncio.create_task(self._supervise(publish, status), name=f"source:{self.id}")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None

    async def _supervise(self, publish: Publish, status: Callable[[str, str | None], None]) -> None:
        """Restart the source on failure with backoff, and say so on screen.

        A crashed sensor must degrade one tile, not take the dashboard down —
        the daemon stays up and the HUD shows the source as offline.
        """
        backoff = 1.0
        while True:
            confirmed = False

            def publish_and_confirm(values: dict[str, Any], source_id: str) -> None:
                # A source counts as online when it produces a value, not when
                # its task starts — otherwise the diagnostics screen shows a
                # healthy source that is silently publishing nothing.
                nonlocal confirmed
                if not confirmed:
                    confirmed = True
                    status("online", None)
                publish(values, source_id)

            try:
                status("degraded", "запуск")
                await self.run(publish_and_confirm)
                status("offline", "джерело завершилось")
            except asyncio.CancelledError:
                raise
            except SourceUnavailable as error:
                log.info("source %s unavailable: %s", self.id, error)
                status("offline", str(error)[:120])
            except Exception as error:  # noqa: BLE001 - a source may fail any way
                log.exception("source %s failed", self.id)
                status("offline", str(error)[:120])
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30.0)

    async def handle_command(self, name: str, args: dict[str, Any]) -> bool:
        """Act on a HUD command. Return True when this source owned it.

        The hub asks each source in turn, so a command reaches whatever hardware
        actually implements it without the hub knowing which that is.
        """
        return False

    @abc.abstractmethod
    async def run(self, publish: Publish) -> None:
        """Produce values until cancelled. Returning counts as a failure."""
