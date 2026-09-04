from __future__ import annotations

import base64
import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from cryptography.fernet import Fernet

from .config import settings

import os as _os

_log = logging.getLogger("scc.security")
ph = PasswordHasher()


def _api_key_pepper() -> str:
    """Return pepper for API-key hashing. Empty string keeps back-compat sha256(raw)."""
    # settings.api_key_pepper maps to SCC_API_KEY_PEPPER via env_prefix; fall back to raw env read
    try:
        v = getattr(settings, "api_key_pepper", "") or ""
        if v:
            return v
    except Exception:
        pass
    return _os.getenv("SCC_API_KEY_PEPPER", "") or ""


def require_pepper_in_prod() -> None:
    """Fail fast in production when SCC_API_KEY_PEPPER is missing.

    Called at startup (and on API-key creation). In dev/test an empty pepper
    keeps back-compat sha256(raw); in production it would make stolen DB
    hashes brute-forceable, so we refuse to boot without one.
    Prod is detected via SCC_ENV / ENV / APP_ENV / settings.env == production|prod
    (any source reporting prod triggers enforcement, so late env changes still fail closed).
    """
    candidates = [
        getattr(settings, "env", "") or "",
        _os.getenv("SCC_ENV", "") or "",
        _os.getenv("ENV", "") or "",
        _os.getenv("APP_ENV", "") or "",
    ]
    is_prod = any(str(c).lower() in ("production", "prod") for c in candidates)
    if is_prod and not _api_key_pepper():
        raise RuntimeError(
            "SCC_API_KEY_PEPPER is required in production (SCC_ENV=production). "
            "Set it to a long random string, e.g. `openssl rand -hex 32`. "
            "Rotation requires re-issuing existing API keys."
        )
    if not _api_key_pepper():
        _log.warning(
            "SCC_API_KEY_PEPPER is empty — API-key hashes are plain sha256(raw). "
            "Set a pepper for new deployments."
        )

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        # Unified secret: single source .jwt_secret (settings.secret_key) — avoids split-brain
        # between JWT and Fernet (legacy separate file removed). Derive Fernet key from
        # the same persisted secret. Rotation requires re-encrypting proxy credentials.
        # Pepper placeholder: consider SCC_PEPPER env var mixed into derivation for defense-in-depth
        # e.g. hashlib.sha256((pepper + settings.secret_key).encode()).digest().
        raw = settings.secret_key.encode()
        digest = hashlib.sha256(raw).digest()
        fernet_key = base64.urlsafe_b64encode(digest)
        _fernet = Fernet(fernet_key)
    return _fernet


def encrypt_secret(value: str | None) -> str | None:
    if value in (None, ""):
        return None
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt_secret(value: str | None) -> str | None:
    if value in (None, ""):
        return None
    return _get_fernet().decrypt(value.encode()).decode()


def hash_password(password: str) -> str:
    return ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def create_access_token(subject: str, role: str) -> str:
    """Short-lived (15m default) access JWT with unique jti for revocation tracking."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_ttl_minutes)
    payload = {
        "sub": subject,
        "role": role,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "jti": uuid.uuid4().hex,
        "type": "access",
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def create_refresh_token(subject: str, role: str) -> str:
    """Long-lived (7d default) refresh JWT with unique jti.

    Presented to POST /api/auth/refresh to mint a fresh access token.
    Store jti server-side if revocation is needed (currently stateless —
    rotation via password change / user disable is enforced at use time by
    re-loading the user row).
    """
    ttl_days = getattr(settings, "refresh_token_ttl_days", 7)
    expire = datetime.now(timezone.utc) + timedelta(days=ttl_days)
    payload = {
        "sub": subject,
        "role": role,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "jti": uuid.uuid4().hex,
        "type": "refresh",
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        return payload if payload.get("type") == "access" else None
    except jwt.InvalidTokenError:
        return None


def decode_refresh_token(token: str) -> dict | None:
    """Validate a refresh token (type == refresh, exp checked by PyJWT)."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        return payload if payload.get("type") == "refresh" else None
    except jwt.InvalidTokenError:
        return None


def generate_api_key() -> tuple[str, str, str]:
    """Returns (full_key_shown_once, prefix_stored, sha256_hash_stored)."""
    raw = "cb_" + secrets.token_urlsafe(32)
    prefix = raw[:12]
    pepper = _api_key_pepper()
    digest = hashlib.sha256((pepper + raw).encode()).hexdigest()
    return raw, prefix, digest


def hash_api_key(raw_key: str) -> str:
    pepper = _api_key_pepper()
    return hashlib.sha256((pepper + raw_key).encode()).hexdigest()


API_SCOPES = ("fetch", "parse", "jobs", "admin")
