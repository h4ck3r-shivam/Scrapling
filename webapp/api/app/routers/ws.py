"""WebSocket router — separate file so ws deps don't pollute HTTP routers."""
from __future__ import annotations

from fastapi import APIRouter, WebSocket

from ..ws import run_ws_endpoint, system_ws_endpoint

router = APIRouter(tags=["ws"])


@router.websocket("/ws/jobs/{run_id}")
async def ws_jobs(ws: WebSocket, run_id: int):
    await run_ws_endpoint(ws, run_id)


@router.websocket("/ws/system")
async def ws_system(ws: WebSocket):
    await system_ws_endpoint(ws)