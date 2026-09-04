"""Parse playground endpoints — generic extraction + DOM tree."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..config import settings
from ..deps import require_user
from ..services import engines
from ..services.audit import record_audit
from ..services.response_models import ParseOut, ParseStepOut
from ..database import Database, get_db

router = APIRouter(tags=["parse"])


class ParseStepIn(BaseModel):
    method: str
    selector: str | None = None
    attr: str | None = None
    first_only: bool = False
    partial: bool = False
    case_sensitive: bool = True
    similarity_threshold: float = 0.2
    identifier: str | None = None
    percentage: int = 40
    auto_save: bool = False
    adaptive: bool = False


class ParseIn(BaseModel):
    html: str | None = None
    url: str | None = None
    steps: list[ParseStepIn]
    adaptive: bool = False


def _run_step_sync(el, step: dict):
    import asyncio as _aio
    return _aio.new_event_loop().run_until_complete(engines.run_extraction_step(el, step))


def _coerce(value):
    """Best-effort coercion of a Scrapling Selector / list / dict into a JSON-serialisable value."""
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {k: _coerce(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_coerce(v) for v in value]
    # Selectors / Selectors / TextHandler all have __str__
    try:
        return str(value)
    except Exception:
        return None


@router.post("/parse")
async def parse(body: ParseIn, user: dict = Depends(require_user), db: Database = Depends(get_db)):
    if not body.html:
        raise HTTPException(422, "html required (use /fetch then paste html_content)")

    def work():
        from scrapling.parser import Selector
        sc: dict = {"adaptive": body.adaptive}
        if body.adaptive:
            sc["storage_args"] = {
                "storage_file": str(settings.adaptive_db_path),
                "url": body.url or "",
            }
        page = Selector(content=body.html, **sc)
        results = []
        el = page
        for s in body.steps:
            step = {k: v for k, v in s.model_dump().items() if v not in (None,) and v is not False}
            step["case_sensitive"] = s.case_sensitive
            val = _run_step_sync(el, step)
            results.append({"method": s.method, "selector": s.selector, "value": _coerce(val)})
        tree = engines.selector_tree(page)
        for node in tree:
            for k in ("attrib", "text"):
                v = node.get(k)
                if v is None:
                    continue
                if isinstance(v, (str, int, float, bool)):
                    continue
                try:
                    node[k] = str(v)
                except Exception:
                    node[k] = ""
        return {"results": results, "tree": tree}

    out = await asyncio.to_thread(work)
    await record_audit(
        db,
        actor=user["email"],
        action="parse",
        target=body.url or "",
        detail={"steps": len(body.steps), "adaptive": body.adaptive},
    )
    return out


class SelectorTreeIn(BaseModel):
    html: str


@router.post("/parse/tree")
async def parse_tree(body: SelectorTreeIn, _: dict = Depends(require_user)):
    """Return the DOM tree. We don't declare a strict response_model because the
    tree may contain Scrapling's TextHandler / AttributesHandler."""
    def work():
        from scrapling.parser import Selector
        page = Selector(content=body.html)
        tree = engines.selector_tree(page)
        def _clean(node):
            for k in ("attrib", "text"):
                v = node.get(k)
                if v is None:
                    continue
                if isinstance(v, (str, int, float, bool)):
                    continue
                try:
                    node[k] = str(v)
                except Exception:
                    node[k] = ""
            for child in node.get("children") or []:
                _clean(child)
        for n in tree:
            _clean(n)
        return tree

    return await asyncio.to_thread(work)