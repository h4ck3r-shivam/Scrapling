"""WebSocket hubs: per-run event streams + global system stream.

Single-replica limit: the default in-memory hub only fans out to WebSockets
connected to the *same* process. For multi-replica deployments set
``SCC_REDIS_URL`` (e.g. ``redis://localhost:6379/0``) — the hub will then
publish to Redis channels ``scc:run:{id}`` and ``scc:system`` via
``redis.asyncio`` and each replica subscribes to fan-out locally, giving
cross-instance delivery. When ``SCC_REDIS_URL`` is unset the hub stays
in-memory (single-replica mode).

If ``SCC_REDIS_URL`` is set but ``redis`` is not installed, the hub logs
a warning and remains in-memory — install ``redis[hiredis]`` to enable.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from collections import defaultdict
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

from .config import settings
from .database import db
from .deps import ws_authenticate

_log = logging.getLogger("scc.ws")


def _redis_url() -> str | None:
    v = os.getenv("SCC_REDIS_URL", "") or getattr(settings, "redis_url", "") or ""
    v = v.strip()
    return v or None


class WSHub:
    def __init__(self):
        self._rooms: dict[int, set[WebSocket]] = defaultdict(set)
        self._system: set[WebSocket] = set()
        self._lock = asyncio.Lock()
        self._maxsize = 100  # max subscribers to fan-out; drop beyond to avoid backpressure
        self._redis = None
        self._redis_sub_task: asyncio.Task | None = None
        self._redis_lock = asyncio.Lock()

    async def join_run(self, run_id: int, ws: WebSocket):
        async with self._lock:
            self._rooms[run_id].add(ws)
        await self._ensure_redis_subscriber()

    async def leave_run(self, run_id: int, ws: WebSocket):
        async with self._lock:
            self._rooms[run_id].discard(ws)
            if not self._rooms[run_id]:
                self._rooms.pop(run_id, None)

    async def join_system(self, ws: WebSocket):
        async with self._lock:
            self._system.add(ws)
        await self._ensure_redis_subscriber()

    async def leave_system(self, ws: WebSocket):
        async with self._lock:
            self._system.discard(ws)

    # ------------------------------------------------------------------ publish
    def publish_nowait(self, run_id: int, payload: dict):
        data = json.dumps(payload, default=str)
        # local fan-out
        asyncio.create_task(self._publish_run(run_id, data))
        # cross-replica fan-out via Redis if configured
        url = _redis_url()
        if url:
            asyncio.create_task(self._publish_redis(f"scc:run:{run_id}", data))

    async def _publish_run(self, run_id: int, data: str):
        async with self._lock:
            targets = list(self._rooms.get(run_id, ()))
        # maxsize drop: trim fan-out if too many subscribers/backpressure
        if len(targets) > self._maxsize:
            targets = targets[:self._maxsize]
        for ws in targets:
            try:
                await asyncio.wait_for(ws.send_text(data), timeout=5)
            except Exception:
                pass  # drop on timeout/disconnect

    def publish_system(self, payload: dict):
        data = json.dumps(payload, default=str)
        asyncio.create_task(self._publish_system(data))
        url = _redis_url()
        if url:
            asyncio.create_task(self._publish_redis("scc:system", data))

    async def _publish_system(self, data: str):
        async with self._lock:
            targets = list(self._system)
        if len(targets) > self._maxsize:
            targets = targets[:self._maxsize]
        for ws in targets:
            try:
                await asyncio.wait_for(ws.send_text(data), timeout=5)
            except Exception:
                pass

    # ------------------------------------------------------------------ redis
    async def _get_redis(self):
        if self._redis is not None:
            return self._redis
        url = _redis_url()
        if not url:
            return None
        async with self._redis_lock:
            if self._redis is not None:
                return self._redis
            try:
                import redis.asyncio as aioredis  # type: ignore
            except Exception as e:
                _log.warning("SCC_REDIS_URL is set but redis package not installed (%s); using in-memory hub", e)
                return None
            try:
                client = aioredis.from_url(url, decode_responses=True)
                # probe
                await client.ping()
                self._redis = client
                _log.info("WS hub connected to Redis at %s", url.split("@")[-1])
                return self._redis
            except Exception as e:
                _log.warning("WS hub Redis connect failed (%s); staying in-memory", e)
                return None

    async def _publish_redis(self, channel: str, data: str):
        client = await self._get_redis()
        if not client:
            return
        try:
            await client.publish(channel, data)
        except Exception as e:
            _log.debug("WS Redis publish failed on %s: %s", channel, e)

    async def _ensure_redis_subscriber(self):
        url = _redis_url()
        if not url:
            return
        if self._redis_sub_task and not self._redis_sub_task.done():
            return
        client = await self._get_redis()
        if not client:
            return
        # start listener once
        async with self._redis_lock:
            if self._redis_sub_task and not self._redis_sub_task.done():
                return
            self._redis_sub_task = asyncio.create_task(self._redis_listener(client))

    async def _redis_listener(self, client):
        try:
            pubsub = client.pubsub()
            await pubsub.psubscribe("scc:run:*")
            await pubsub.subscribe("scc:system")
            _log.info("WS hub Redis subscriber listening (scc:run:* + scc:system)")
            async for msg in pubsub.listen():
                if msg is None or msg.get("type") not in ("message", "pmessage"):
                    continue
                channel = msg.get("channel") or msg.get("pattern") or ""
                # pmessage has pattern/channel distinction
                actual_channel = msg.get("channel", "")
                data = msg.get("data")
                if not isinstance(data, str):
                    continue
                if actual_channel == "scc:system" or channel == "scc:system":
                    await self._publish_system(data)
                elif actual_channel.startswith("scc:run:") or str(channel).startswith("scc:run:"):
                    # extract run_id
                    ch = actual_channel if actual_channel.startswith("scc:run:") else str(channel)
                    try:
                        run_id = int(ch.split(":")[-1])
                    except Exception:
                        continue
                    await self._publish_run(run_id, data)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            _log.warning("WS Redis listener stopped: %s", e)


async def _send(ws: WebSocket, data: str):
    try:
        await asyncio.wait_for(ws.send_text(data), timeout=5)
    except Exception:
        pass


hub = WSHub()


async def run_ws_endpoint(ws: WebSocket, run_id: int):
    # accept after auth to avoid wasting resources on unauthenticated sockets
    # ws_authenticate checks expires_at for scc_ API keys + jwt exp via decode_token
    user = await ws_authenticate(ws, db)
    if not user:
        await ws.close(code=4401)
        return
    await ws.accept()
    await hub.join_run(run_id, ws)
    try:
        while True:
            msg = await ws.receive_text()
            if msg == "ping":
                await ws.send_text('{"type":"pong"}')
    except WebSocketDisconnect:
        pass
    finally:
        await hub.leave_run(run_id, ws)


async def system_ws_endpoint(ws: WebSocket):
    # same auth path: ws_authenticate validates expires_at for scc_ keys
    user = await ws_authenticate(ws, db)
    if not user:
        await ws.close(code=4401)
        return
    await ws.accept()
    await hub.join_system(ws)
    try:
        while True:
            msg = await ws.receive_text()
            if msg == "ping":
                await ws.send_text('{"type":"pong"}')
    except WebSocketDisconnect:
        pass
    finally:
        await hub.leave_system(ws)
