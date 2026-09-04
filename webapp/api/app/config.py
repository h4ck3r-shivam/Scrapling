from __future__ import annotations

import secrets
from pathlib import Path

from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

WEBAPP_DIR = Path(__file__).resolve().parent.parent.parent
REPO_ROOT = WEBAPP_DIR.parent


def _load_or_create_secret() -> str:
    """Persisted so JWTs survive restarts."""
    key_file = WEBAPP_DIR / "data" / ".jwt_secret"
    key_file.parent.mkdir(parents=True, exist_ok=True)
    if key_file.exists():
        return key_file.read_text().strip()
    key = secrets.token_hex(32)
    key_file.write_text(key)
    try:
        import os
        os.chmod(key_file, 0o600)
    except Exception:
        pass
    return key


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SCC_", env_file=str(WEBAPP_DIR / ".env"), extra="ignore")

    app_name: str = "Chaan-Been"
    secret_key: str = _load_or_create_secret()
    db_path: Path = WEBAPP_DIR / "data" / "app.db"
    data_dir: Path = WEBAPP_DIR / "data"
    exports_dir: Path = WEBAPP_DIR / "data" / "exports"
    crawldirs_dir: Path = WEBAPP_DIR / "data" / "crawls"
    devcache_dir: Path = WEBAPP_DIR / "data" / "dev_cache"
    adaptive_db_path: Path = WEBAPP_DIR / "data" / "elements_storage.db"

    admin_email: str = "admin@localhost"
    admin_password: str = ""
    # JWT lifetimes: 15m access + 7d refresh (P0 hardening). Previously 1440m
    # (24h) single-token — far too long for stolen-token blast radius.
    # Override via SCC_ACCESS_TOKEN_TTL_MINUTES / SCC_REFRESH_TOKEN_TTL_DAYS.
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 7
    # Deployment environment: SCC_ENV=production requires SCC_API_KEY_PEPPER
    # (enforced in security.require_pepper_in_prod()). dev/test allow empty
    # pepper for back-compat sha256(raw).
    env: str = "dev"

    cors_origins: Annotated[list[str], NoDecode] = Field(default=["http://localhost:5173", "http://127.0.0.1:5173"])  # SCC_CORS_ORIGINS env (comma-separated or JSON)

    max_concurrent_jobs: int = 3
    default_fetch_timeout: int = 60
    outbound_domain_allowlist: list[str] = []

    api_key_pepper: str = ""  # SCC_API_KEY_PEPPER — if set, API-key hash is sha256(pepper + raw); empty keeps back-compat sha256(raw)
    redis_url: str | None = None  # SCC_REDIS_URL — if set, WS hub publishes to Redis for multi-replica fan-out

    mcp_enabled: bool = False
    mcp_port: int = 8017
    python_bin: str = ""

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors(cls, v):
        # SCC_CORS_ORIGINS=https://a.com,https://b.com  (comma-separated)
        if isinstance(v, str):
            # handle JSON array string or comma-separated
            s = v.strip()
            if s.startswith("["):
                import json
                try:
                    return json.loads(s)
                except Exception:
                    pass
            return [p.strip() for p in s.split(",") if p.strip()]
        return v

    @property
    def effective_python(self) -> str:
        return self.python_bin or "uv run python"


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
settings.exports_dir.mkdir(parents=True, exist_ok=True)
settings.crawldirs_dir.mkdir(parents=True, exist_ok=True)
settings.devcache_dir.mkdir(parents=True, exist_ok=True)
settings.db_path.parent.mkdir(parents=True, exist_ok=True)
