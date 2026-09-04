"""Audit logging — single entry point used by every mutating endpoint.

Failures here never raise to the user; we log and move on. Audit is best-effort.
"""
from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from typing import Any

from ..database import Database

_log = logging.getLogger("scc.audit")


async def record_audit(
    db: Database,
    *,
    actor: str,
    action: str,
    target: str = "",
    detail: dict[str, Any] | None = None,
) -> None:
    """Insert one row into ``audit_log``. Never raises."""
    try:
        detail_json = json.dumps(detail) if detail else None
        await db.execute(
            "INSERT INTO audit_log (actor, action, target, detail_json) VALUES (?, ?, ?, ?)",
            (actor, action, target, detail_json),
        )
    except Exception as e:  # pragma: no cover - audited best-effort
        _log.warning("audit write failed for %s/%s: %s", actor, action, e)


@asynccontextmanager
async def audit_action(db: Database, *, actor: str, action: str, target: str = ""):
    """Async context manager that records a single audit entry on exit.

    Detail can be appended via ``ctx.detail.update({...})`` from inside the block.
    Usage::

        async with audit_action(db, actor=user["email"], action="job.start", target=str(job_id)) as ctx:
            run_id = await runner.start_run(job)
            ctx.detail["run_id"] = run_id
    """
    detail: dict[str, Any] = {}
    try:
        yield detail
    finally:
        await record_audit(db, actor=actor, action=action, target=target, detail=detail)