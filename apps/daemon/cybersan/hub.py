"""Fan-in from sources, fan-out to HUD clients.

Sources push dot-path writes; the hub folds them into the store and broadcasts
only the diff, at a fixed rate. Decoupling the two means a chatty sensor cannot
saturate the WebSocket and a slow client cannot stall a sensor.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, Awaitable, Callable

from .state import StateStore
from .sources.base import Source

log = logging.getLogger(__name__)

Sender = Callable[[str], Awaitable[None]]

#: HUD refresh rate. 10 Hz is smooth for a needle and cheap for the Pi.
BROADCAST_HZ = 10


def _clamp(value: Any) -> int:
    try:
        return max(0, min(100, int(value)))
    except (TypeError, ValueError):
        return 0


class Hub:
    def __init__(self, store: StateStore) -> None:
        self.store = store
        self._sources: list[Source] = []
        self._clients: set[Sender] = set()
        self._pending: dict[str, Any] = {}
        self._broadcaster: asyncio.Task[None] | None = None

    def add_source(self, source: Source) -> None:
        self._sources.append(source)

    async def start(self) -> None:
        for source in self._sources:
            await source.start(self._publish, self._make_status(source.id))
        self._broadcaster = asyncio.create_task(self._broadcast_loop(), name="hub:broadcast")

    async def stop(self) -> None:
        for source in self._sources:
            await source.stop()
        if self._broadcaster:
            self._broadcaster.cancel()
            try:
                await self._broadcaster
            except asyncio.CancelledError:
                pass

    def attach(self, send: Sender) -> None:
        self._clients.add(send)

    def detach(self, send: Sender) -> None:
        self._clients.discard(send)

    def snapshot_message(self) -> str:
        return json.dumps({"t": "snapshot", "state": self.store.snapshot})

    async def handle_command(self, name: str, args: dict[str, Any] | None) -> None:
        """Commands are named intents, never raw writes into the state tree."""
        args = args or {}

        # Real hardware wins: if a source owns this command, it goes there and
        # the resulting state comes back on the next poll like any other signal.
        for source in self._sources:
            if await source.handle_command(name, args):
                if name == "media.volume":
                    self._publish({"media.volume": _clamp(args.get("value"))}, "media")
                return

        # Nothing is connected, so keep the HUD's own controls responsive.
        if name == "media.volume":
            self._publish({"media.volume": _clamp(args.get("value"))}, "media")
        elif name in {"media.play", "media.pause"}:
            self._publish({"media.playback": "playing" if name.endswith("play") else "paused"}, "media")
        else:
            # Unknown commands are logged rather than guessed at: the HUD and
            # the daemon ship together, so this means a version mismatch.
            log.warning("unhandled command %s", name)

    def _publish(self, values: dict[str, Any], source_id: str) -> None:
        changed = self.store.update(values, source=source_id)
        if changed:
            self._pending.update(changed)

    def _make_status(self, source_id: str) -> Callable[[str, str | None], None]:
        def status(state: str, detail: str | None) -> None:
            changed = self.store.set_source(source_id, state, detail)
            if state != "online":
                source = next((s for s in self._sources if s.id == source_id), None)
                if source:
                    self.store.mark_stale(source.paths)
            self._pending.update(changed)

        return status

    async def _broadcast_loop(self) -> None:
        interval = 1 / BROADCAST_HZ
        while True:
            await asyncio.sleep(interval)
            if not self._clients:
                # Nobody is watching; drop the backlog instead of growing it.
                self._pending.clear()
                continue
            self._pending.update(self.store.pop_meta_patch())
            if not self._pending:
                continue
            payload = json.dumps({"t": "patch", "ts": int(time.time() * 1000), "set": self._pending})
            self._pending = {}
            dead: list[Sender] = []
            for send in list(self._clients):
                try:
                    await send(payload)
                except Exception:  # noqa: BLE001 - a dropped client is routine
                    dead.append(send)
            for send in dead:
                self._clients.discard(send)
