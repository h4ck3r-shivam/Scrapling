"""Proxy + proxy-group endpoints."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..database import Database, get_db
from ..deps import require_admin, require_user
from ..security import encrypt_secret
from ..services.audit import record_audit
from ..services.response_models import Ok, ProxyGroupOut, ProxyOut

router = APIRouter(tags=["proxies"])


class ProxyIn(BaseModel):
    label: str
    url_or_server: str
    username: str | None = None
    password: str | None = None


class GroupIn(BaseModel):
    name: str
    strategy: str = "cyclic_rotation"
    member_ids: list[int]


@router.get("/proxies", response_model=list[ProxyOut])
async def list_proxies(db: Database = Depends(get_db), _: dict = Depends(require_user)):
    rows = await db.fetch_all(
        "SELECT id, label, url_or_server, username_enc IS NOT NULL AS has_auth, created_at FROM proxies ORDER BY id"
    )
    return [
        ProxyOut(
            id=r["id"],
            label=r["label"],
            url_or_server=r["url_or_server"],
            has_auth=bool(r["has_auth"]),
            created_at=r["created_at"],
        )
        for r in rows
    ]


@router.post("/proxies", status_code=201)
async def add_proxy(
    body: ProxyIn,
    admin: dict = Depends(require_admin),
    db: Database = Depends(get_db),
):
    pid = await db.execute(
        "INSERT INTO proxies (label, url_or_server, username_enc, password_enc) VALUES (?,?,?,?)",
        (body.label, body.url_or_server, encrypt_secret(body.username), encrypt_secret(body.password)),
    )
    await record_audit(db, actor=admin["email"], action="proxy.create", target=body.label)
    return {"id": pid}


@router.delete("/proxies/{pid}", response_model=Ok)
async def del_proxy(
    pid: int,
    admin: dict = Depends(require_admin),
    db: Database = Depends(get_db),
):
    await db.execute("DELETE FROM proxies WHERE id=?", (pid,))
    await record_audit(db, actor=admin["email"], action="proxy.delete", target=str(pid))
    return Ok()


@router.get("/proxy-groups", response_model=list[ProxyGroupOut])
async def list_groups(db: Database = Depends(get_db), _: dict = Depends(require_user)):
    rows = await db.fetch_all("SELECT * FROM proxy_groups ORDER BY id")
    return [
        ProxyGroupOut(
            id=r["id"],
            name=r["name"],
            strategy=r["strategy"],
            member_ids=json.loads(r["member_ids"]) if r["member_ids"] else [],
        )
        for r in rows
    ]


@router.post("/proxy-groups", status_code=201)
async def add_group(
    body: GroupIn,
    admin: dict = Depends(require_admin),
    db: Database = Depends(get_db),
):
    gid = await db.execute(
        "INSERT INTO proxy_groups (name, strategy, member_ids) VALUES (?,?,?)",
        (body.name, body.strategy, json.dumps(body.member_ids)),
    )
    await record_audit(db, actor=admin["email"], action="proxy_group.create", target=body.name)
    return {"id": gid}


@router.delete("/proxy-groups/{gid}", response_model=Ok)
async def del_group(
    gid: int,
    admin: dict = Depends(require_admin),
    db: Database = Depends(get_db),
):
    await db.execute("DELETE FROM proxy_groups WHERE id=?", (gid,))
    await record_audit(db, actor=admin["email"], action="proxy_group.delete", target=str(gid))
    return Ok()