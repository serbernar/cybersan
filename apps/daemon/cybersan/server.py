"""HTTP + WebSocket front end.

The daemon serves the built HUD itself, so kiosk Chromium talks to one origin
and there is no second web server, no CORS, and no Node on the car.
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

from aiohttp import WSMsgType, web

from .hub import Hub

log = logging.getLogger(__name__)


async def websocket_handler(request: web.Request) -> web.WebSocketResponse:
    hub: Hub = request.app["hub"]
    ws = web.WebSocketResponse(heartbeat=20)
    await ws.prepare(request)

    async def send(payload: str) -> None:
        await ws.send_str(payload)

    await send(hub.snapshot_message())
    hub.attach(send)
    log.info("hud connected from %s", request.remote)

    try:
        async for message in ws:
            if message.type is not WSMsgType.TEXT:
                continue
            try:
                data = json.loads(message.data)
            except json.JSONDecodeError:
                continue
            if data.get("t") != "cmd":
                continue
            try:
                await hub.handle_command(data.get("name", ""), data.get("args"))
                ack = {"t": "ack", "id": data.get("id"), "ok": True}
            except Exception as error:  # noqa: BLE001 - report, never drop the socket
                ack = {"t": "ack", "id": data.get("id"), "ok": False, "error": str(error)}
            await ws.send_str(json.dumps(ack))
    finally:
        hub.detach(send)
        log.info("hud disconnected")

    return ws


async def health_handler(request: web.Request) -> web.Response:
    hub: Hub = request.app["hub"]
    return web.json_response(
        {
            "ok": True,
            "schema": hub.store.snapshot["schema"],
            "sources": hub.store.snapshot["sources"],
        }
    )


def build_app(hub: Hub, static_dir: Path | None) -> web.Application:
    app = web.Application()
    app["hub"] = hub
    app.router.add_get("/ws", websocket_handler)
    app.router.add_get("/health", health_handler)

    if static_dir and static_dir.is_dir():
        async def index(_: web.Request) -> web.FileResponse:
            return web.FileResponse(static_dir / "index.html")

        app.router.add_get("/", index)
        # The whole build, not just assets/: the HUD also ships fonts and the
        # car model from public/, and a 404 there is a silently worse dashboard
        # rather than an error anyone would notice.
        app.router.add_static("/", static_dir, show_index=False)
        log.info("serving HUD from %s", static_dir)
    else:
        async def missing(_: web.Request) -> web.Response:
            return web.Response(
                text="HUD build not found. Run `npm run build` and deploy apps/hud/dist.",
                status=503,
            )

        app.router.add_get("/", missing)

    async def on_startup(_: web.Application) -> None:
        await hub.start()

    async def on_cleanup(_: web.Application) -> None:
        await hub.stop()

    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    return app


async def run(hub: Hub, host: str, port: int, static_dir: Path | None) -> None:
    runner = web.AppRunner(build_app(hub, static_dir))
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    log.info("cybersan daemon listening on http://%s:%d", host, port)
    try:
        await asyncio.Event().wait()
    finally:
        await runner.cleanup()
