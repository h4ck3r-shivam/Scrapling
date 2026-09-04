"""System endpoints — info, disk, install-browsers, MCP control."""
from __future__ import annotations

import asyncio
import logging
import secrets
import sys
from pathlib import Path
from time import monotonic

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..config import settings
from ..deps import require_admin, require_user
from ..services.audit import record_audit
from ..services.response_models import DiskOut, McpListOut, McpStartOut, Ok, SystemInfoOut
from ..ws import hub
from ..database import Database, get_db

router = APIRouter(tags=["system"])
_log = logging.getLogger("scc.system")

_START_TIME = monotonic()


# Track multiple MCP processes by name
_mcp_procs: dict[str, dict] = {}


@router.get("/system/info", response_model=SystemInfoOut)
async def system_info(_: dict = Depends(require_user)):
    import scrapling
    info = {
        "scrapling_version": scrapling.__version__,
        "app": settings.app_name,
        "python_bin": settings.effective_python,
        "data_dir": str(settings.data_dir),
        "max_concurrent_jobs": settings.max_concurrent_jobs,
        "mcp_enabled": settings.mcp_enabled,
        "dependencies_installed": (Path(scrapling.__file__).parent / ".scrapling_dependencies_installed").exists(),
        "version": "0.4.16",
        "uptime_seconds": round(monotonic() - _START_TIME, 1),
    }
    try:
        from curl_cffi import __version__ as ccv
        info["curl_cffi"] = ccv
    except Exception:
        info["curl_cffi"] = None
    return SystemInfoOut(**info)


@router.post("/system/install-browsers", response_model=Ok)
async def install_browsers(admin: dict = Depends(require_admin), db: Database = Depends(get_db)):
    """Runs ``playwright install chromium`` (+deps on linux). Streams via system WS."""
    import scrapling

    async def run():
        try:
            proc = await asyncio.create_subprocess_exec(
                sys.executable, "-m", "patchright", "install", "chromium",
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
            )
            hub.publish_system({"type": "install_log", "line": "Starting browser install…"})
            assert proc.stdout is not None
            async for line in proc.stdout:
                hub.publish_system(
                    {"type": "install_log", "line": line.decode(errors="replace").rstrip()}
                )
            await proc.wait()
            if proc.returncode == 0:
                marker = Path(scrapling.__file__).parent / ".scrapling_dependencies_installed"
                marker.write_text("installed")
                hub.publish_system({"type": "install_done", "code": 0, "ok": True})
            else:
                hub.publish_system(
                    {"type": "install_done", "code": proc.returncode, "ok": False}
                )
        except Exception as e:
            hub.publish_system({"type": "install_done", "code": -1, "ok": False, "error": str(e)})

    asyncio.create_task(run())
    await record_audit(db, actor=admin["email"], action="system.install_browsers", target="chromium")
    return Ok()


@router.get("/system/disk", response_model=DiskOut)
async def disk_usage(_: dict = Depends(require_user)):
    """Cap directory traversal at depth 3 to keep the endpoint fast on huge crawl dirs."""
    def du(path: Path, max_depth: int = 3) -> int:
        if not path.exists():
            return 0
        total = 0
        try:
            for root, dirs, files in __import__("os").walk(path):
                depth = str(root).count(str(path).rstrip("/") + "/") - len(str(path).rstrip("/"))
                if depth > max_depth:
                    dirs[:] = []
                    continue
                for f in files:
                    try:
                        total += (Path(root) / f).stat().st_size
                    except OSError:
                        pass
        except OSError:
            return total
        return total

    return DiskOut(
        exports_bytes=du(settings.exports_dir),
        crawls_bytes=du(settings.crawldirs_dir),
        dev_cache_bytes=du(settings.devcache_dir),
        adaptive_db_bytes=settings.adaptive_db_path.stat().st_size if settings.adaptive_db_path.exists() else 0,
        db_bytes=settings.db_path.stat().st_size if settings.db_path.exists() else 0,
    )


class McpStartIn(BaseModel):
    name: str = "default"
    port: int | None = None


@router.post("/system/mcp/start", response_model=McpStartOut)
async def start_mcp(
    body: McpStartIn | None = None,
    admin: dict = Depends(require_admin),
    db: Database = Depends(get_db),
):
    if not settings.mcp_enabled:
        raise HTTPException(409, "MCP disabled (SCC_MCP_ENABLED=false)")
    name = body.name if body and body.name else "default"
    if name in _mcp_procs and _mcp_procs[name].get("proc", None) and _mcp_procs[name]["proc"].returncode is None:
        raise HTTPException(409, f"MCP '{name}' already running")
    token = secrets.token_urlsafe(24)
    port = (body.port if body else None) or settings.mcp_port
    proc = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "scrapling.cli", "mcp", "--http",
        "--host", "127.0.0.1", "--port", str(port),
        "--auth-token", token,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )
    _mcp_procs[name] = {"proc": proc, "port": port, "token": token}
    asyncio.create_task(_pump_mcp(name, proc))
    await record_audit(db, actor=admin["email"], action="mcp.start", target=name)
    return McpStartOut(
        name=name,
        url=f"http://127.0.0.1:{port}",
        token=token,
        config_hint={
            "command": "scrapling-mcp",
            "args": ["--http"],
            "env": {"SCRAPLING_MCP_AUTH_TOKEN": "<token>"},
        },
    )


async def _pump_mcp(name: str, proc):
    assert proc.stdout is not None
    async for line in proc.stdout:
        hub.publish_system(
            {"type": "mcp_log", "name": name, "line": line.decode(errors="replace").rstrip()}
        )


class McpStopIn(BaseModel):
    name: str = "default"


@router.post("/system/mcp/stop", response_model=Ok)
async def stop_mcp(
    body: McpStopIn | None = None,
    admin: dict = Depends(require_admin),
    db: Database = Depends(get_db),
):
    name = body.name if body and body.name else "default"
    entry = _mcp_procs.get(name)
    if not entry:
        return Ok()
    proc = entry.get("proc")
    if proc and proc.returncode is None:
        proc.terminate()
    _mcp_procs.pop(name, None)
    await record_audit(db, actor=admin["email"], action="mcp.stop", target=name)
    return Ok()


@router.get("/system/mcp", response_model=McpListOut)
async def list_mcp(_: dict = Depends(require_user)):
    out = []
    for name, e in _mcp_procs.items():
        proc = e.get("proc")
        out.append(
            {
                "name": name,
                "port": e.get("port"),
                "running": proc is not None and proc.returncode is None,
            }
        )
    return McpListOut(processes=out)