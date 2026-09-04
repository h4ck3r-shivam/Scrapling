"""User management endpoints (admin only)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from ..database import Database, get_db
from ..deps import require_admin
from ..security import hash_password
from ..services.audit import record_audit
from ..services.response_models import Ok, UserOut

router = APIRouter(tags=["users"])


class UserCreate(BaseModel):
    email: EmailStr
    # P0: enforce 12-char minimum (was any non-empty string).
    password: str = Field(..., min_length=12, max_length=256)
    role: str = "member"


class UserUpdate(BaseModel):
    role: str | None = None
    is_active: bool | None = None
    # Password resets also enforce the 12-char minimum when provided.
    password: str | None = Field(None, min_length=12, max_length=256)


@router.get("/users", response_model=list[UserOut])
async def list_users(_: dict = Depends(require_admin), db: Database = Depends(get_db)):
    rows = await db.fetch_all(
        "SELECT id, email, role, is_active, created_by, created_at FROM users ORDER BY id"
    )
    return [UserOut(**{**r, "is_active": bool(r["is_active"])}) for r in rows]


@router.post("/users", status_code=201, response_model=UserOut)
async def create_user(
    body: UserCreate,
    admin: dict = Depends(require_admin),
    db: Database = Depends(get_db),
):
    if body.role not in ("admin", "member"):
        raise HTTPException(422, "role must be admin or member")
    if await db.fetch_one("SELECT 1 FROM users WHERE email=?", (body.email,)):
        raise HTTPException(409, "Email already exists")
    uid = await db.execute(
        "INSERT INTO users (email, password_hash, role, created_by) VALUES (?,?,?,?)",
        (body.email, hash_password(body.password), body.role, admin["email"]),
    )
    await record_audit(db, actor=admin["email"], action="user.create", target=body.email)
    row = await db.fetch_one("SELECT created_at FROM users WHERE id=?", (uid,))
    return UserOut(
        id=uid,
        email=body.email,
        role=body.role,
        is_active=True,
        created_by=admin["email"],
        created_at=row["created_at"] if row else "",
    )


@router.patch("/users/{user_id}", response_model=Ok)
async def update_user(
    user_id: int,
    body: UserUpdate,
    admin: dict = Depends(require_admin),
    db: Database = Depends(get_db),
):
    target = await db.fetch_one("SELECT * FROM users WHERE id=?", (user_id,))
    if not target:
        raise HTTPException(404, "User not found")
    sets, params = [], []
    if body.role is not None:
        if body.role not in ("admin", "member"):
            raise HTTPException(422, "Invalid role")
        sets.append("role=?"); params.append(body.role)
    if body.is_active is not None:
        sets.append("is_active=?"); params.append(int(body.is_active))
    if body.password:
        sets.append("password_hash=?"); params.append(hash_password(body.password))
    if sets:
        params.append(user_id)
        await db.execute(f"UPDATE users SET {', '.join(sets)} WHERE id=?", tuple(params))
    await record_audit(db, actor=admin["email"], action="user.update", target=target["email"])
    return Ok()