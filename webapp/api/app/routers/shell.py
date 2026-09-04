"""Restricted shell endpoints (admin only).

We deliberately do NOT expose ``CustomShell`` directly. Only safe operations are
allowed here, and each one is explicitly listed.
"""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..database import Database, get_db
from ..deps import require_admin
from ..services.audit import record_audit
from ..services.response_models import ShellExecOut, ShellHelpOut

router = APIRouter(tags=["shell"])

CAPABILITIES = [
    "validate_regex — check that a regex pattern compiles",
    "format_json — pretty-print / minify JSON",
    "extract_emails — pull email addresses from text",
    "extract_urls — pull URLs from text",
]


class ShellExecIn(BaseModel):
    op: str
    input: str | None = None
    pattern: str | None = None
    data: str | None = None


@router.get("/shell/help", response_model=ShellHelpOut)
async def shell_help(_: dict = Depends(require_admin)):
    return ShellHelpOut(capabilities=CAPABILITIES)


@router.post("/shell/exec", response_model=ShellExecOut)
async def shell_exec(
    body: ShellExecIn,
    admin: dict = Depends(require_admin),
    db: Database = Depends(get_db),
):
    op = body.op
    if op == "validate_regex":
        if not body.pattern:
            raise HTTPException(422, "pattern required")
        try:
            re.compile(body.pattern)
            out = ShellExecOut(valid=True, error=None)
        except re.error as e:
            out = ShellExecOut(valid=False, error=str(e))
        await record_audit(db, actor=admin["email"], action="shell.exec", target="validate_regex")
        return out
    if op == "format_json":
        import json
        text = body.input or ""
        try:
            obj = json.loads(text)
            pretty = json.dumps(obj, indent=2, ensure_ascii=False)
            out = ShellExecOut(valid=True, error=None)
            out.__dict__["formatted"] = pretty  # type: ignore[attr-defined]
            await record_audit(db, actor=admin["email"], action="shell.exec", target="format_json")
            return out
        except Exception as e:
            raise HTTPException(422, f"Invalid JSON: {e}")
    if op == "extract_emails":
        if not body.data:
            raise HTTPException(422, "data required")
        from scrapling.core.utils import clean_spaces
        emails = sorted(set(re.findall(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", body.data)))
        out = ShellExecOut(valid=True, error=None)
        out.__dict__["result"] = clean_spaces(" ".join(emails))  # type: ignore[attr-defined]
        await record_audit(db, actor=admin["email"], action="shell.exec", target="extract_emails")
        return out
    if op == "extract_urls":
        if not body.data:
            raise HTTPException(422, "data required")
        urls = sorted(set(re.findall(r"https?://[^\s'\"<>]+", body.data)))
        out = ShellExecOut(valid=True, error=None)
        out.__dict__["result"] = "\n".join(urls)  # type: ignore[attr-defined]
        await record_audit(db, actor=admin["email"], action="shell.exec", target="extract_urls")
        return out
    raise HTTPException(422, f"Unknown op {op!r}. Allowed: validate_regex, format_json, extract_emails, extract_urls")