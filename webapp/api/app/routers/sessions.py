"""Session endpoints — open/close live + history from DB."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException

from ..database import Database, get_db
from ..deps import require_user
from ..services.audit import record_audit
from ..services.guards import require_admin_action, strip_page_action_for_non_admin
from ..services.response_models import Ok, SessionDetailOut, SessionHistoryRow, SessionLiveOut
from ..services.session_manager import manager
from ..services.spec import SessionOpenSpec

router = APIRouter(tags=["sessions"])


@router.post("/sessions/open", response_model=SessionLiveOut)
async def open_session(
    body: SessionOpenSpec,
    user: dict = Depends(require_user),
    db: Database = Depends(get_db),
):
    """Opens a persistent browser/static session and keeps it live in-process."""
    # P0: shared admin-only gate. The old inline expression had an operator-
    # precedence bug: `A or B and C` parses as `A or (B and C)`, so a stealth
    # page_action bypassed the role check while an admin was wrongly blocked.
    # Fixed form: ((A) or (B)) and (role != admin) — encapsulated in the helper.
    has_stealth_action = bool(
        body.stealth_config
        and (body.stealth_config.page_action or body.stealth_config.page_setup)
    )
    has_dynamic_action = bool(
        body.dynamic_config
        and (body.dynamic_config.page_action or body.dynamic_config.page_setup)
    )
    require_admin_action(
        user, has_action=(has_stealth_action or has_dynamic_action)
    )
    # Defense-in-depth: strip page_action from session configs for non-admin
    # BEFORE manager.open() launches a browser (manager strips again).
    if body.stealth_config is not None:
        strip_page_action_for_non_admin(body.stealth_config, user)
    if body.dynamic_config is not None:
        strip_page_action_for_non_admin(body.dynamic_config, user)
    try:
        stats = await manager.open(body, user=user)
    except Exception as e:
        raise HTTPException(422, f"Session failed to open: {type(e).__name__}: {e}")
    spec_json = body.model_dump_json()
    await db.execute(
        "INSERT INTO sessions (name, kind, spec_json, state, pool_stats_json) VALUES (?,?,?,?,?) "
        "ON CONFLICT(name) DO UPDATE SET kind=excluded.kind, spec_json=excluded.spec_json, "
        "state='open', pool_stats_json=excluded.pool_stats_json",
        (body.name, body.kind, spec_json, "open", json.dumps(stats) if stats else None),
    )
    await record_audit(db, actor=user["email"], action="session.open", target=body.name)
    return SessionLiveOut(name=body.name, kind=body.kind, pool_stats=stats)


@router.post("/sessions/{name}/close", response_model=Ok)
async def close_session(
    name: str,
    user: dict = Depends(require_user),
    db: Database = Depends(get_db),
):
    ok = await manager.close(name)
    await db.execute(
        "UPDATE sessions SET state='closed', pool_stats_json=NULL WHERE name=?", (name,)
    )
    await record_audit(db, actor=user["email"], action="session.close", target=name)
    if not ok:
        # Still return ok; the session is closed in the DB even if it was never live.
        return Ok()
    return Ok()


@router.get("/sessions", response_model=list[SessionLiveOut])
async def list_sessions_live(_: dict = Depends(require_user)):
    return [SessionLiveOut(**s) for s in manager.list()]


@router.get("/sessions/history", response_model=list[SessionHistoryRow])
async def list_sessions_history(
    limit: int = 100,
    db: Database = Depends(get_db),
    _: dict = Depends(require_user),
):
    rows = await db.fetch_all(
        "SELECT id, name, kind, state, created_at, spec_json, pool_stats_json "
        "FROM sessions ORDER BY id DESC LIMIT ?",
        (min(limit, 500),),
    )
    return [SessionHistoryRow(**r) for r in rows]


@router.get("/sessions/{name}", response_model=SessionDetailOut)
async def get_session(
    name: str,
    db: Database = Depends(get_db),
    _: dict = Depends(require_user),
):
    row = await db.fetch_one(
        "SELECT id, name, kind, state, created_at, spec_json, pool_stats_json FROM sessions WHERE name=?",
        (name,),
    )
    if not row:
        raise HTTPException(404, "Session not found")
    return SessionDetailOut(**row)
