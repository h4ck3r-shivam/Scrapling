"""Fetch console endpoints — single fetch and batch fetch."""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..config import settings
from ..database import Database, get_db
from ..deps import require_scope_or_admin, require_user
from ..services import engines
from ..services.audit import record_audit
from ..services.guards import (
    require_admin_action,
    strip_page_action_for_non_admin,
    validate_url,
)
from ..services.response_models import BatchFetchResult, FetchResult
from ..services.spec import BrowserEngineConfig, FetchRequestSpec, StaticEngineConfig

router = APIRouter(tags=["fetch"])


class FetchBody(FetchRequestSpec):
    static_config: StaticEngineConfig | None = None
    dynamic_config: BrowserEngineConfig | None = None


class BatchFetchIn(BaseModel):
    """A batch of fetches; each entry shares the engine + base config."""
    urls: list[str]
    engine: str = "static"
    static_config: StaticEngineConfig | None = None
    dynamic_config: BrowserEngineConfig | None = None
    concurrency: int = 5
    domain_allowlist: list[str] | None = None
    # Common per-call overrides
    timeout: int | None = None
    impersonate: str | None = None
    headless: bool = True
    useragent: str | None = None
    headers: dict[str, str] | None = None
    cookies: list[dict] | None = None


def _enforce_allowlist(url: str, allowlist: list[str] | None) -> None:
    if not allowlist:
        return
    from urllib.parse import urlparse
    host = urlparse(url).netloc.lower()
    if not any(host == d.lower() or host.endswith("." + d.lower()) for d in allowlist):
        raise HTTPException(403, f"Host {host!r} not in outbound_domain_allowlist")


@router.post("/fetch", response_model=FetchResult)
async def fetch(
    body: FetchBody,
    user: dict = Depends(require_user),
    db: Database = Depends(get_db),
):
    spec = FetchRequestSpec(
        **{k: v for k, v in body.model_dump().items() if k not in ("static_config", "dynamic_config")}
    )
    # P0 SSRF guard: scheme http/https only, DNS-resolve + deny private ranges
    # (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1), 30s timeout cap,
    # 5MB response cap (enforced at serialization). Fail closed.
    validate_url(
        spec.url,
        allowlist=settings.outbound_domain_allowlist or None,
        timeout=spec.timeout,
        timeout_is_ms=(spec.engine != "static"),
    )
    _enforce_allowlist(spec.url, settings.outbound_domain_allowlist)
    # P0 admin-only gate via shared helper. NOTE the parens: ((A) or (B))
    # and (role != admin) — `and` binds tighter than `or`, so unparenthesized
    # `A or B and C` == `A or (B and C)` (the precedence bug this fixes).
    dyn_cfg = body.dynamic_config
    has_cfg_action = bool(
        (dyn_cfg and (dyn_cfg.page_action or dyn_cfg.page_setup))
    )
    require_admin_action(
        user,
        page_action=spec.page_action,
        page_setup=spec.page_setup,
        has_action=has_cfg_action,
    )
    # Defense-in-depth: strip page_action for non-admin BEFORE browser_fetch
    # so a missed gate cannot reach exec (engines.browser_fetch strips again).
    strip_page_action_for_non_admin(spec, user)
    if dyn_cfg is not None:
        strip_page_action_for_non_admin(dyn_cfg, user)
    try:
        if spec.engine == "static":
            out = await engines.static_fetch(spec, body.static_config)
        else:
            cfg = body.dynamic_config or BrowserEngineConfig()
            if spec.engine == "stealth":
                out = await engines.browser_fetch(spec, "stealth", cfg, user=user)
            else:
                out = await engines.browser_fetch(spec, "dynamic", cfg, user=user)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Fetch failed: {type(e).__name__}: {e}")
    await record_audit(
        db,
        actor=user["email"],
        action="fetch",
        target=spec.url,
        detail={"engine": spec.engine, "status": out.get("status")},
    )
    return FetchResult(**out)


@router.post("/fetch/batch", response_model=BatchFetchResult)
async def fetch_batch(body: BatchFetchIn, user: dict = Depends(require_scope_or_admin("fetch"))):
    # Batch has no per-call page_action surface, but dynamic_config may carry
    # one — gate it identically (admin-only).
    if body.dynamic_config is not None:
        require_admin_action(
            user,
            page_action=body.dynamic_config.page_action,
            page_setup=body.dynamic_config.page_setup,
        )
        strip_page_action_for_non_admin(body.dynamic_config, user)
    if not body.urls:
        raise HTTPException(422, "urls must not be empty")
    if len(body.urls) > 50:
        raise HTTPException(422, "urls count exceeds 50")
    concurrency = max(1, min(body.concurrency, 20))
    sem = asyncio.Semaphore(concurrency)

    # FetchRequestSpec is extra=forbid: only supported per-call fields may go
    # into the spec. Top-level impersonate/headless/useragent/headers/cookies/
    # domain_allowlist are mapped onto session configs / spec aliases here.
    try:
        eff_static = body.static_config.model_copy(deep=True) if body.static_config else StaticEngineConfig()
        if body.engine == "static" and body.impersonate is not None:
            eff_static = eff_static.model_copy(update={"impersonate": body.impersonate})
        eff_dynamic = body.dynamic_config.model_copy(deep=True) if body.dynamic_config else BrowserEngineConfig()
        if body.engine in ("dynamic", "stealth"):
            dyn_updates: dict = {}
            if "headless" in body.model_fields_set:
                dyn_updates["headless"] = body.headless
            if body.useragent is not None:
                dyn_updates["useragent"] = body.useragent
            if dyn_updates:
                eff_dynamic = eff_dynamic.model_copy(update=dyn_updates)
    except Exception as e:
        raise HTTPException(422, f"Invalid batch session config: {e}")

    def _coerce_cookies(raw: list[dict] | None):
        if not raw:
            return None
        out = []
        for c in raw:
            if not isinstance(c, dict):
                continue
            if "key" in c and "value" in c:
                out.append({"key": c["key"], "value": c["value"]})
            elif "name" in c and "value" in c:
                out.append({"key": c["name"], "value": c["value"]})
        return out or None

    async def one(url: str) -> dict:
        async with sem:
            try:
                spec = FetchRequestSpec(
                    url=url,
                    engine=body.engine,  # type: ignore[arg-type]
                    timeout=body.timeout,
                    extra_headers=body.headers,
                    cookies=_coerce_cookies(body.cookies),  # type: ignore[arg-type]
                )
            except Exception as e:
                return {"url": url, "error": f"spec: {e}"}
            try:
                validate_url(
                    url,
                    allowlist=settings.outbound_domain_allowlist or None,
                    timeout=body.timeout,
                    timeout_is_ms=(body.engine != "static"),
                )
            except HTTPException as e:
                return {"url": url, "error": f"{e.status_code}: {e.detail}"}
            try:
                _enforce_allowlist(url, settings.outbound_domain_allowlist)
                if body.domain_allowlist:
                    _enforce_allowlist(url, body.domain_allowlist)
            except HTTPException as e:
                return {"url": url, "error": f"{e.status_code}: {e.detail}"}
            try:
                if body.engine == "static":
                    out = await engines.static_fetch(spec, eff_static)
                else:
                    if body.engine == "stealth":
                        out = await engines.browser_fetch(spec, "stealth", eff_dynamic, user=user)
                    else:
                        out = await engines.browser_fetch(spec, "dynamic", eff_dynamic, user=user)
                out["url"] = url
                return out
            except Exception as e:
                return {"url": url, "error": f"{type(e).__name__}: {e}"}

    results = await asyncio.gather(*(one(u) for u in body.urls))
    return BatchFetchResult(results=list(results))
