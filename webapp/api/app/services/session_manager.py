"""Persistent live sessions manager (browser/static) with pool stats."""
from __future__ import annotations

import json
from typing import Any

from ..database import db
from ..security import decrypt_secret
from .engines import resolve_proxy_group
from .spec import BrowserEngineConfig, SessionOpenSpec, StaticEngineConfig


class SessionManager:
    def __init__(self):
        self._live: dict[str, Any] = {}
        self._meta: dict[str, dict] = {}

    async def open(self, spec: SessionOpenSpec, user: dict | None = None) -> dict | None:
        if spec.name in self._live:
            raise ValueError(f"Session '{spec.name}' already open")
        # P0 defense-in-depth: strip page_action/page_setup for non-admin
        # BEFORE launching a browser, even though routers already 403.
        if user is not None and user.get("role") != "admin":
            import logging as _logging

            _logging.getLogger("scc.sessions").warning(
                "stripping page_action for non-admin session open"
            )
            for cfg_attr in ("dynamic_config", "stealth_config"):
                cfg_obj = getattr(spec, cfg_attr, None)
                if cfg_obj is not None:
                    for f in ("page_action", "page_setup"):
                        try:
                            if getattr(cfg_obj, f, None):
                                setattr(cfg_obj, f, None)
                        except Exception:
                            pass
        session = None
        stats = None
        if spec.kind == "static":
            cfg = spec.static_config or StaticEngineConfig()
            rotator = await resolve_proxy_group(cfg.proxy_group_id)
            session = _StaticSessionHandle(cfg, rotator)
            stats = {"type": "static"}
        else:
            cfg = spec.dynamic_config if spec.kind == "dynamic" else (
                spec.stealth_config or BrowserEngineConfig())
            if spec.kind != "dynamic" and not spec.stealth_config:
                cfg = spec.dynamic_config or BrowserEngineConfig()
            rotator = await resolve_proxy_group(cfg.proxy_group_id)
            kwargs = cfg.session_kwargs(spec.kind)
            if rotator is not None:
                kwargs["proxy_rotator"] = rotator
            from scrapling.fetchers import AsyncDynamicSession, AsyncStealthySession
            cls = AsyncStealthySession if spec.kind == "stealth" else AsyncDynamicSession
            s = cls(**kwargs)
            await s.__aenter__()
            session = s
            try:
                stats = s.get_pool_stats()
            except Exception:
                stats = None
        self._live[spec.name] = session
        self._meta[spec.name] = {"kind": spec.kind, "pool_stats": stats}
        await db.execute(
            "INSERT INTO sessions (name, kind, state) VALUES (?, ?, 'live') "
            "ON CONFLICT(name) DO UPDATE SET kind=excluded.kind, state='live'",
            (spec.name, spec.kind))
        return stats

    async def close(self, name: str) -> bool:
        session = self._live.pop(name, None)
        if session is None:
            return False
        try:
            await session.close()
        except Exception:
            aclose = getattr(session, "__aexit__", None)
            if aclose:
                try:
                    await aclose(None, None, None)
                except Exception:
                    pass
        self._meta.pop(name, None)
        await db.execute("UPDATE sessions SET state='closed' WHERE name=?", (name,))
        return True

    def get(self, name: str):
        return self._live.get(name)

    def list(self) -> list[dict]:
        out = []
        for name, meta in self._meta.items():
            s = self._live[name]
            ps = None
            if hasattr(s, "get_pool_stats"):
                try:
                    ps = s.get_pool_stats()
                except Exception:
                    pass
            out.append({"name": name, **meta, "pool_stats": ps})
        return out


class _StaticSessionHandle:
    """Wraps FetcherSession so SessionManager can open/close uniformly."""

    def __init__(self, cfg: StaticEngineConfig, rotator):
        from scrapling.fetchers import FetcherSession
        self._factory = FetcherSession(**cfg.session_kwargs())
        self._rotator = rotator

    async def fetch(self, url: str, **overrides):
        async with self._factory as client:
            return await client.get(url, proxy_rotator=self._rotator, **overrides)

    async def close(self):
        pass  # FetcherSession context-per-request; nothing persistent to close


manager = SessionManager()
