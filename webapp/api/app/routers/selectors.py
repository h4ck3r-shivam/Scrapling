"""Saved-selector CRUD."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..database import Database, get_db
from ..deps import require_user
from ..services.response_models import Ok, SelectorOut

router = APIRouter(tags=["selectors"])


class SaveSelectorIn(BaseModel):
    name: str
    target_url: str
    identifier: str | None = None
    selector_spec: dict
    auto_save: bool = False


@router.post("/selectors", status_code=201)
async def save_selector(
    body: SaveSelectorIn,
    user: dict = Depends(require_user),
    db: Database = Depends(get_db),
):
    sid = await db.execute(
        "INSERT INTO saved_selectors (name, target_url, identifier, selector_spec, auto_save) VALUES (?,?,?,?,?)",
        (body.name, body.target_url, body.identifier, json.dumps(body.selector_spec), int(body.auto_save)),
    )
    return {"id": sid}


@router.get("/selectors", response_model=list[SelectorOut])
async def list_selectors(db: Database = Depends(get_db), _: dict = Depends(require_user)):
    rows = await db.fetch_all("SELECT * FROM saved_selectors ORDER BY id DESC")
    return [
        SelectorOut(
            id=r["id"],
            name=r["name"],
            target_url=r["target_url"],
            identifier=r["identifier"],
            selector_spec=json.loads(r["selector_spec"]) if r["selector_spec"] else {},
            auto_save=bool(r["auto_save"]),
            created_at=r["created_at"],
        )
        for r in rows
    ]


@router.delete("/selectors/{sid}", response_model=Ok)
async def delete_selector(
    sid: int,
    user: dict = Depends(require_user),
    db: Database = Depends(get_db),
):
    row = await db.fetch_one("SELECT id FROM saved_selectors WHERE id=?", (sid,))
    if not row:
        raise HTTPException(404, "Selector not found")
    await db.execute("DELETE FROM saved_selectors WHERE id=?", (sid,))
    from ..services.audit import record_audit
    await record_audit(db, actor=user["email"], action="selector.delete", target=str(sid))
    return Ok()