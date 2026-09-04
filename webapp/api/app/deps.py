from __future__ import annotations

import json

from fastapi import Depends, HTTPException, Request, WebSocket, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .database import Database, get_db
from .security import decode_token, hash_api_key

bearer = HTTPBearer(auto_error=False)


async def _load_user(db: Database, email: str) -> dict | None:
    return await db.fetch_one("SELECT * FROM users WHERE email = ? AND is_active = 1", (email,))


async def require_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Database = Depends(get_db),
) -> dict:
    # Only Bearer header; query token removed to avoid JWT leak via logs/referrers.
    # Expiration (exp) is validated by jwt.decode in decode_token (PyJWT).
    token = creds.credentials if creds else None
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = await _load_user(db, payload["sub"])
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User disabled or removed")
    return user


async def require_admin(user: dict = Depends(require_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user


async def require_api_key(
    request: Request,
    db: Database = Depends(get_db),
) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") and not auth.startswith("ApiKey "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing API key")
    raw = auth.split(" ", 1)[1].strip()
    row = await db.fetch_one("SELECT * FROM api_keys WHERE revoked = 0 AND hash = ?", (hash_api_key(raw),))
    if not row:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid API key")
    if row["expires_at"]:
        from datetime import datetime
        if datetime.fromisoformat(row["expires_at"]) < datetime.utcnow():
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "API key expired")
    user = await db.fetch_one(
        "SELECT * FROM users WHERE id = ? AND is_active = 1", (row["user_id"],))
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Key owner disabled")
    scopes = set(row["scopes"].split(","))
    await db.execute("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?", (row["id"],))
    return {**user, "scopes": scopes, "key_id": row["id"]}


def require_scope(scope: str):
    """Strict scope check — API keys only. JWT users do NOT use this dependency."""
    async def checker(user: dict = Depends(require_api_key)) -> dict:
        if "admin" not in user["scopes"] and scope not in user["scopes"]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"API key missing '{scope}' scope")
        return user
    return checker


def require_scope_or_admin(scope: str):
    """Accepts JWT users (any role) OR API keys with the given scope (admins always pass).

    Use this on endpoints that should be reachable from the SPA by JWT users and
    also by external API consumers using scoped API keys.
    """
    bearer_only = HTTPBearer(auto_error=False)

    async def checker(
        request: Request,
        creds: HTTPAuthorizationCredentials | None = Depends(bearer_only),
        db: Database = Depends(get_db),
    ) -> dict:
        token = creds.credentials if creds else None
        if not token:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
        # JWT path (legacy scc_ keys still accepted)
        if not (token.startswith("cb_") or token.startswith("scc_")):
            payload = decode_token(token)
            if not payload:
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
            user = await _load_user(db, payload["sub"])
            if not user:
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User disabled or removed")
            return user
        # API key path
        row = await db.fetch_one(
            "SELECT * FROM api_keys WHERE revoked = 0 AND hash = ?",
            (hash_api_key(token),),
        )
        if not row:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid API key")
        if row["expires_at"]:
            from datetime import datetime
            try:
                if datetime.fromisoformat(row["expires_at"]) < datetime.utcnow():
                    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "API key expired")
            except Exception:
                pass
        user = await db.fetch_one(
            "SELECT * FROM users WHERE id = ? AND is_active = 1", (row["user_id"],)
        )
        if not user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Key owner disabled")
        scopes = set(row["scopes"].split(","))
        if "admin" not in scopes and scope not in scopes:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, f"API key missing '{scope}' scope"
            )
        await db.execute(
            "UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?",
            (row["id"],),
        )
        return {**user, "scopes": scopes, "key_id": row["id"]}

    return checker


async def ws_authenticate(ws: WebSocket, db: Database) -> dict | None:
    token = ws.query_params.get("token") or ws.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if not token:
        return None
    if token.startswith("cb_") or token.startswith("scc_"):
        row = await db.fetch_one("SELECT * FROM api_keys WHERE revoked = 0 AND hash = ?", (hash_api_key(token),))
        if not row:
            return None
        if row["expires_at"]:
            from datetime import datetime
            try:
                if datetime.fromisoformat(row["expires_at"]) < datetime.utcnow():
                    return None
            except Exception:
                return None
        return await db.fetch_one("SELECT * FROM users WHERE id = ? AND is_active = 1", (row["user_id"],))
    payload = decode_token(token)
    if not payload:
        return None
    return await _load_user(db, payload["sub"])
