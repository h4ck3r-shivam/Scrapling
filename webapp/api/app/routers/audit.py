"""Audit log read endpoint."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from ..database import Database, get_db
from ..deps import require_admin
from ..services.response_models import AuditRowOut

router = APIRouter(tags=["audit"])


@router.get("/audit", response_model=list[AuditRowOut])
async def audit_log(
    limit: int = 200,
    db: Database = Depends(get_db),
    _: dict = Depends(require_admin),
):
    rows = await db.fetch_all(
        "SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (min(limit, 1000),)
    )
    return [AuditRowOut(**r) for r in rows]