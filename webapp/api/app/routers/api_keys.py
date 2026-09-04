"""API-key management endpoints (admin only)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..database import Database, get_db
from ..deps import require_admin
from ..security import API_SCOPES, generate_api_key, require_pepper_in_prod
from ..services.audit import record_audit
from ..services.response_models import ApiKeyCreated, ApiKeyPublic, Ok

router = APIRouter(tags=["api_keys"])


class ApiKeyCreate(BaseModel):
    name: str
    scopes: list[str] = ["fetch", "parse", "jobs"]
    expires_at: str | None = None


async def _uid(user: dict, db: Database) -> int:
    row = await db.fetch_one("SELECT id FROM users WHERE email=?", (user["email"],))
    return row["id"]


@router.get("/api-keys", response_model=list[ApiKeyPublic])
async def list_keys(admin: dict = Depends(require_admin), db: Database = Depends(get_db)):
    rows = await db.fetch_all(
        """SELECT k.id, k.name, k.prefix, k.scopes, k.last_used_at, k.expires_at,
                  k.revoked, k.created_at, u.email AS owner
           FROM api_keys k JOIN users u ON u.id = k.user_id ORDER BY k.id DESC"""
    )
    return [
        ApiKeyPublic(
            id=r["id"],
            name=r["name"],
            prefix=r["prefix"],
            scopes=r["scopes"].split(",") if r["scopes"] else [],
            last_used_at=r["last_used_at"],
            expires_at=r["expires_at"],
            revoked=bool(r["revoked"]),
            created_at=r["created_at"],
            owner=r["owner"],
        )
        for r in rows
    ]


@router.post("/api-keys", status_code=201, response_model=ApiKeyCreated)
async def create_key(
    body: ApiKeyCreate,
    admin: dict = Depends(require_admin),
    db: Database = Depends(get_db),
):
    # P0: refuse to mint pepperless keys in production.
    require_pepper_in_prod()
    bad = [s for s in body.scopes if s not in API_SCOPES]
    if bad:
        raise HTTPException(422, f"Unknown scopes: {bad}. Valid: {list(API_SCOPES)}")
    raw, prefix, digest = generate_api_key()
    key_id = await db.execute(
        "INSERT INTO api_keys (user_id, name, prefix, hash, scopes, expires_at) VALUES (?,?,?,?,?,?)",
        (await _uid(admin, db), body.name, prefix, digest, ",".join(body.scopes), body.expires_at),
    )
    await record_audit(db, actor=admin["email"], action="api_key.create", target=body.name)
    row = await db.fetch_one("SELECT created_at FROM api_keys WHERE id=?", (key_id,))
    # full key shown exactly once
    return ApiKeyCreated(
        id=key_id,
        name=body.name,
        prefix=prefix,
        scopes=body.scopes,
        last_used_at=None,
        expires_at=body.expires_at,
        revoked=False,
        created_at=row["created_at"] if row else "",
        owner=admin["email"],
        key=raw,
    )


@router.delete("/api-keys/{key_id}", response_model=Ok)
async def revoke_key(
    key_id: int,
    admin: dict = Depends(require_admin),
    db: Database = Depends(get_db),
):
    await db.execute("UPDATE api_keys SET revoked=1 WHERE id=?", (key_id,))
    await record_audit(db, actor=admin["email"], action="api_key.revoke", target=str(key_id))
    return Ok()