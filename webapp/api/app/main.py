from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import WEBAPP_DIR, settings
from .database import db
from .routers.audit import router as audit_router
from .routers.api_keys import router as api_keys_router
from .routers.auth import router as auth_router, bootstrap_admin
from .routers.fetch import router as fetch_router
from .routers.jobs import router as jobs_router
from .routers.magic import router as magic_router
from .routers.parse import router as parse_router
from .routers.parse_helpers import router as parse_helpers_router
from .routers.proxies import router as proxies_router
from .routers.selectors import router as selectors_router
from .routers.sessions import router as sessions_router
from .routers.shell import router as shell_router
from .routers.system import router as system_router
from .routers.users import router as users_router
from .routers.ws import router as ws_router
from .ws import hub

_log = logging.getLogger("scc")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    # P0: fail fast in production when SCC_API_KEY_PEPPER is missing.
    try:
        from .security import require_pepper_in_prod

        require_pepper_in_prod()
    except RuntimeError:
        raise
    except Exception as e:
        _log.warning("pepper check skipped: %s", e)
    await db.connect()
    await bootstrap_admin(db)
    from .services.job_runner import runner
    runner.bind_hub(hub)
    app.state.runner = runner
    from .services.scheduler import scheduler
    # Pre-load scheduled jobs from DB
    scheduled = await db.fetch_all("SELECT id, schedule_cron FROM jobs WHERE schedule_cron IS NOT NULL")
    for row in scheduled:
        scheduler.upsert(row["id"], row["schedule_cron"])
    await scheduler.start()
    try:
        yield
    finally:
        # Shutdown
        await scheduler.stop()
        from .services.session_manager import manager
        for name in list(manager._live.keys()):
            try:
                await manager.close(name)
            except Exception:
                pass
        await db.close()


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, version="0.4.16", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Wire all routers under /api
    for r in (
        auth_router,
        users_router,
        api_keys_router,
        fetch_router,
        parse_router,
        parse_helpers_router,
        selectors_router,
        proxies_router,
        sessions_router,
        jobs_router,
        magic_router,
        system_router,
        shell_router,
        audit_router,
        ws_router,
    ):
        app.include_router(r, prefix="/api")

    @app.get("/api/health")
    async def health():
        return {"status": "ok"}

    # SPA static files
    spa_dist = WEBAPP_DIR / "web" / "dist"
    if spa_dist.exists():
        app.mount("/assets", StaticFiles(directory=str(spa_dist / "assets")), name="assets")
        for static_file in ["vite.svg", "favicon.ico"]:
            fp = spa_dist / static_file
            if fp.exists():
                app.mount(f"/{static_file}", StaticFiles(directory=str(spa_dist), html=False), name=static_file)

        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            if full_path.startswith("api/") or full_path in ("docs", "openapi.json", "redoc") \
                    or full_path.startswith("docs/") or full_path.startswith("assets/"):
                from fastapi import HTTPException
                raise HTTPException(status_code=404, detail="Not Found")
            # P0 path traversal: resolve the requested file and require it to
            # stay inside spa_dist (blocks `..`, absolute paths, symlink escapes).
            try:
                spa_resolved = spa_dist.resolve()
                requested = (spa_resolved / full_path).resolve() if full_path else spa_resolved
            except Exception:
                from fastapi import HTTPException
                raise HTTPException(status_code=404, detail="Not Found")
            try:
                try:
                    inside = requested.is_relative_to(spa_resolved)  # type: ignore[attr-defined]
                except AttributeError:
                    try:
                        requested.relative_to(spa_resolved)
                        inside = True
                    except ValueError:
                        inside = False
            except Exception:
                inside = False
            if not inside:
                from fastapi import HTTPException
                raise HTTPException(status_code=404, detail="Not Found")
            if full_path and requested.is_file():
                from fastapi.responses import FileResponse
                return FileResponse(str(requested))
            from fastapi.responses import FileResponse
            index = spa_dist / "index.html"
            if index.exists():
                return FileResponse(str(index))
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Not Found")

    return app


app = create_app()