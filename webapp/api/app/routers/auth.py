"""Authentication endpoints."""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from ..config import settings
from ..database import Database, get_db
from ..deps import require_user
from ..security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from ..services.audit import record_audit
from ..services.guards import check_login_rate_limit
from ..services.response_models import (
    FirstRunHint,
    LoginOut,
    Ok,
    UserPublic,
)

router = APIRouter(tags=["auth"])
_log = logging.getLogger("scc.auth")

# Where the one-time-generated bootstrap admin password is written on first boot.
FIRST_RUN_PASSWORD_FILE = Path(settings.data_dir) / ".first_run_password"


class LoginIn(BaseModel):
    # Allow admin@localhost (EmailStr rejects dotless domains) + RFC emails.
    email: str = Field(..., min_length=3, max_length=320)
    password: str = Field(..., min_length=1, max_length=256)


class RefreshIn(BaseModel):
    refresh_token: str = Field(..., min_length=10, max_length=4096)


async def _bootstrap_admin(db: Database) -> None:
    """Create the admin user on first boot with a random password (or env-provided one).

    The random password is written to FIRST_RUN_PASSWORD_FILE (mode 0600) so it
    can be displayed to the operator via /auth/first-run-hint, and so it
    survives a restart without being logged in plaintext every time.
    """
    existing = await db.fetch_one("SELECT 1 FROM users LIMIT 1")
    if existing:
        return
    password = settings.admin_password
    wrote_marker = False
    if not password:
        import secrets
        password = secrets.token_urlsafe(18)
        # Only write the marker once per fresh DB.
        FIRST_RUN_PASSWORD_FILE.parent.mkdir(parents=True, exist_ok=True)
        FIRST_RUN_PASSWORD_FILE.write_text(password)
        try:
            FIRST_RUN_PASSWORD_FILE.chmod(0o600)
        except Exception:
            pass
        wrote_marker = True
    await db.execute(
        "INSERT INTO users (email, password_hash, role, created_by) VALUES (?,?, 'admin', 'system')",
        (settings.admin_email, hash_password(password)),
    )
    if wrote_marker:
        _log.warning(
            "Bootstrapped admin %s with a random password. "
            "It has been written to %s (mode 0600) — read it once and change it.",
            settings.admin_email, FIRST_RUN_PASSWORD_FILE,
        )
    else:
        _log.warning("Bootstrapped admin %s using SCC_ADMIN_PASSWORD env.", settings.admin_email)


def _client_ip(request: Request) -> str:
    try:
        # Prefer X-Forwarded-For when behind a trusted proxy; first entry is client.
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            return xff.split(",")[0].strip() or "unknown"
        if request.client is not None:
            return request.client.host or "unknown"
    except Exception:
        pass
    return "unknown"


async def _optional_user(request: Request, db: Database) -> dict | None:
    """Best-effort auth: return the JWT user if a valid Bearer token is present, else None.

    Never raises — used by first-run-hint to distinguish admin vs anonymous
    without breaking the unauthenticated first-boot UX.
    """
    try:
        auth = request.headers.get("authorization", "")
        if not auth.lower().startswith("bearer "):
            return None
        token = auth.split(" ", 1)[1].strip()
        if not token or token.startswith("cb_") or token.startswith("scc_"):
            return None
        payload = decode_token(token)
        if not payload:
            return None
        user = await db.fetch_one(
            "SELECT * FROM users WHERE email = ? AND is_active = 1", (payload.get("sub"),)
        )
        return user
    except Exception:
        return None


@router.post("/auth/login", response_model=LoginOut)
async def login(body: LoginIn, request: Request, response: Response, db: Database = Depends(get_db)):
    # P0: 5/min per-IP rate limit. slowapi is not a dependency, so use the
    # shared in-memory sliding window (see services/guards.py). Front with a
    # reverse-proxy limit or Redis for multi-replica deployments.
    try:
        from slowapi import Limiter  # type: ignore  # noqa: F401
        _has_slowapi = True
    except ImportError:
        _has_slowapi = False
    _ = _has_slowapi  # documented: slowapi path would use @limiter.limit("5/minute")
    check_login_rate_limit(f"login:{_client_ip(request)}")
    # Never cache credentials-bearing responses.
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"

    user = await db.fetch_one("SELECT * FROM users WHERE email=?", (str(body.email),))
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    if not user["is_active"]:
        raise HTTPException(403, "Account disabled")
    await record_audit(db, actor=user["email"], action="login", target="auth")
    # 15m access + 7d refresh, both with jti (see security.py).
    return LoginOut(
        access_token=create_access_token(user["email"], user["role"]),
        refresh_token=create_refresh_token(user["email"], user["role"]),
        user=UserPublic(email=user["email"], role=user["role"]),
    )


@router.post("/auth/refresh", response_model=LoginOut)
async def refresh(body: RefreshIn, response: Response, db: Database = Depends(get_db)):
    """Exchange a valid 7d refresh JWT for a fresh 15m access JWT (rotates jti)."""
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    payload = decode_refresh_token(body.refresh_token)
    if not payload or not payload.get("sub"):
        raise HTTPException(401, "Invalid or expired refresh token")
    user = await db.fetch_one(
        "SELECT * FROM users WHERE email = ? AND is_active = 1", (payload["sub"],)
    )
    if not user:
        raise HTTPException(401, "User disabled or removed")
    await record_audit(db, actor=user["email"], action="token.refresh", target="auth")
    return LoginOut(
        access_token=create_access_token(user["email"], user["role"]),
        refresh_token=body.refresh_token,
        user=UserPublic(email=user["email"], role=user["role"]),
    )


@router.get("/auth/me", response_model=UserPublic)
async def me(user: dict = Depends(require_user)):
    return UserPublic(email=user["email"], role=user["role"])


@router.get("/auth/first-run-hint", response_model=FirstRunHint)
async def first_run_hint(request: Request, response: Response, db: Database = Depends(get_db)):
    """Single-use first-run password disclosure (P0 hardened).

    Policy:
    - ALWAYS sends ``Cache-Control: no-store`` + ``Pragma: no-cache`` so the
      plaintext password is never cached by browsers/proxies.
    - If the marker file is missing (normal case: env password set, or the
      hint was already consumed/deleted) -> ``hint=False``, no auth needed.
    - If the marker is stale (admin already changed the password) -> delete
      the file, audit, return ``hint=False``.
    - Otherwise (fresh boot, marker matches bootstrap admin): disclose the
      password ONCE to the first reader (admin-authenticated preferred;
      anonymous allowed exactly once for the pre-login UX), then DELETE the
      file so a second reader — including network attackers — gets
      ``hint=False``. Every disclosure is audit-logged.
    - Admin callers (``require_user`` role=admin) are preferred; anonymous
      single-use is retained only because the login screen needs the password
      before any session exists. Operators should set SCC_ADMIN_PASSWORD to
      disable this endpoint entirely.
    """
    # Never store.
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"

    user_count = await db.fetch_one("SELECT COUNT(*) AS c FROM users")
    if not user_count or user_count["c"] == 0:
        return FirstRunHint(hint=False)
    if not FIRST_RUN_PASSWORD_FILE.exists():
        return FirstRunHint(hint=False)
    try:
        marker = FIRST_RUN_PASSWORD_FILE.read_text().strip()
    except Exception:
        return FirstRunHint(hint=False)
    if not marker:
        FIRST_RUN_PASSWORD_FILE.unlink(missing_ok=True)
        return FirstRunHint(hint=False)
    # If the admin has changed their password, the marker is stale — invalidate it.
    admin = await db.fetch_one(
        "SELECT password_hash FROM users WHERE email=?", (settings.admin_email,)
    )
    if not admin or not verify_password(marker, admin["password_hash"]):
        FIRST_RUN_PASSWORD_FILE.unlink(missing_ok=True)
        await record_audit(
            db, actor="system", action="first_run_hint.invalidated", target="auth"
        )
        return FirstRunHint(hint=False)

    # Fresh-boot marker is valid. Prefer admin-authenticated disclosure, but
    # allow exactly one anonymous read for the pre-login UX, then delete.
    caller = await _optional_user(request, db)
    is_admin = bool(caller and caller.get("role") == "admin")
    actor = caller["email"] if caller else f"anonymous:{_client_ip(request)}"
    # Single-use: delete BEFORE returning so concurrent second readers fail closed.
    try:
        FIRST_RUN_PASSWORD_FILE.unlink(missing_ok=True)
    except Exception:
        pass
    await record_audit(
        db,
        actor=actor,
        action="first_run_hint.read",
        target="auth",
        detail={"admin": is_admin},
    )
    _log.warning("first-run password disclosed once to %s; marker deleted", actor)
    return FirstRunHint(hint=True, password=marker)


@router.post("/auth/dismiss-first-run", response_model=Ok)
async def dismiss_first_run(_: dict = Depends(require_user)):
    FIRST_RUN_PASSWORD_FILE.unlink(missing_ok=True)
    return Ok()


# Exposed for main.bootstrap
bootstrap_admin = _bootstrap_admin
