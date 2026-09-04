"""Jobs + runs + schedule + resume + exports."""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..database import Database, get_db
from ..deps import require_admin, require_user
from ..services import exporters
from ..services.audit import record_audit
from ..services.response_models import (
    ExportOut,
    Id,
    JobOut,
    JobRunOut,
    Ok,
    ResultsOut,
    ScheduleOut,
)
from ..services.spider_factory import validate_job_spec

router = APIRouter(tags=["jobs"])


class JobIn(BaseModel):
    name: str
    kind: str = "crawl"
    engine: str = "static"
    template: str
    spec: dict


class ScheduleIn(BaseModel):
    cron: str | None = None  # None clears


class ExportIn(BaseModel):
    format: str = "json"
    fields: list[str] | None = None
    delimiter: str = ","
    indent: bool = True
    root_tag: str = "items"
    item_tag: str = "item"


async def _runner_running(db: Database) -> set[int]:
    """Job ids with an actively running task.

    Primary source is the in-memory run->job map (``running_job_ids``) — no
    DB round-trip and no stale rows after restarts. Verified against
    ``job_runs.status='running'`` so a finished task whose DB row already
    flipped to done/paused is not reported running.
    """
    from ..services.job_runner import runner
    try:
        mem_jobs = set(runner.running_job_ids())
    except Exception:
        mem_jobs = set()
    rids = runner.running_ids()
    if not rids:
        return set()
    placeholders = ",".join("?" for _ in rids)
    rows = await db.fetch_all(
        f"SELECT DISTINCT job_id FROM job_runs WHERE id IN ({placeholders}) AND status='running'",
        tuple(rids),
    )
    db_jobs = {r["job_id"] for r in rows}
    # Intersection: task alive in-memory AND row still marked running.
    if mem_jobs:
        return mem_jobs & db_jobs if db_jobs else set()
    return db_jobs


@router.get("/jobs", response_model=list[JobOut])
async def list_jobs(db: Database = Depends(get_db), _: dict = Depends(require_user)):
    jobs = await db.fetch_all("SELECT * FROM jobs ORDER BY updated_at DESC")
    running = await _runner_running(db)
    out = []
    for j in jobs:
        out.append(
            JobOut(
                id=j["id"],
                name=j["name"],
                kind=j["kind"],
                engine=j["engine"],
                template=j["template"],
                spec_json=j["spec_json"],
                spec_json_obj=json.loads(j["spec_json"]) if j["spec_json"] else {},
                schedule_cron=j["schedule_cron"],
                created_by=j["created_by"],
                created_at=j["created_at"],
                updated_at=j["updated_at"],
                running=j["id"] in running,
            )
        )
    return out


@router.get("/jobs/{job_id}", response_model=JobOut)
async def get_job(
    job_id: int,
    db: Database = Depends(get_db),
    _: dict = Depends(require_user),
):
    j = await db.fetch_one("SELECT * FROM jobs WHERE id=?", (job_id,))
    if not j:
        raise HTTPException(404, "Job not found")
    running = await _runner_running(db)
    return JobOut(
        id=j["id"],
        name=j["name"],
        kind=j["kind"],
        engine=j["engine"],
        template=j["template"],
        spec_json=j["spec_json"],
        spec_json_obj=json.loads(j["spec_json"]) if j["spec_json"] else {},
        schedule_cron=j["schedule_cron"],
        created_by=j["created_by"],
        created_at=j["created_at"],
        updated_at=j["updated_at"],
        running=j["id"] in running,
    )


@router.post("/jobs", status_code=201, response_model=Id)
async def create_job(
    body: JobIn,
    user: dict = Depends(require_user),
    db: Database = Depends(get_db),
):
    try:
        spec = validate_job_spec(json.dumps(body.spec))
    except Exception as e:
        raise HTTPException(422, f"Invalid job spec: {e}")
    # P0: fail fast on SSRF / traversal at creation time (spider_factory and
    # job_runner re-validate at build/run time defense-in-depth).
    try:
        from ..services.guards import slugify_job_name, validate_path, validate_url

        slugify_job_name(body.name)
        for u in (spec.settings.start_urls or []):
            validate_url(u)
        if spec.settings.crawldir:
            validate_path(spec.settings.crawldir)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(422, str(e))
    jid = await db.execute(
        "INSERT INTO jobs (name, kind, engine, template, spec_json, created_by) VALUES (?,?,?,?,?,?)",
        (body.name, body.kind, body.engine, body.template, json.dumps(body.spec), user["email"]),
    )
    await record_audit(db, actor=user["email"], action="job.create", target=body.name)
    return Id(id=jid)


@router.put("/jobs/{job_id}", response_model=Ok)
async def update_job(
    job_id: int,
    body: JobIn,
    user: dict = Depends(require_user),
    db: Database = Depends(get_db),
):
    try:
        spec = validate_job_spec(json.dumps(body.spec))
    except Exception as e:
        raise HTTPException(422, f"Invalid job spec: {e}")
    try:
        from ..services.guards import slugify_job_name, validate_path, validate_url

        slugify_job_name(body.name)
        for u in (spec.settings.start_urls or []):
            validate_url(u)
        if spec.settings.crawldir:
            validate_path(spec.settings.crawldir)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(422, str(e))
    await db.execute(
        "UPDATE jobs SET name=?, engine=?, template=?, spec_json=?, updated_at=datetime('now') WHERE id=?",
        (body.name, body.engine, body.template, json.dumps(body.spec), job_id),
    )
    await record_audit(db, actor=user["email"], action="job.update", target=str(job_id))
    return Ok()


@router.delete("/jobs/{job_id}", response_model=Ok)
async def delete_job(
    job_id: int,
    user: dict = Depends(require_user),
    db: Database = Depends(get_db),
):
    await db.execute("DELETE FROM jobs WHERE id=?", (job_id,))
    await record_audit(db, actor=user["email"], action="job.delete", target=str(job_id))
    return Ok()


@router.post("/jobs/{job_id}/start")
async def start_job(
    job_id: int,
    user: dict = Depends(require_user),
    db: Database = Depends(get_db),
):
    job = await db.fetch_one("SELECT * FROM jobs WHERE id=?", (job_id,))
    if not job:
        raise HTTPException(404, "Job not found")
    from ..services.job_runner import runner
    run_id = await runner.start_run(job)
    await record_audit(
        db, actor=user["email"], action="job.start", target=f"{job['name']}#{run_id}"
    )
    return {"run_id": run_id}


@router.post("/jobs/{job_id}/pause", response_model=Ok)
async def pause_job(
    job_id: int,
    user: dict = Depends(require_user),
    db: Database = Depends(get_db),
):
    from ..services.job_runner import runner
    run = await db.fetch_one(
        "SELECT id FROM job_runs WHERE job_id=? AND status='running' ORDER BY id DESC", (job_id,)
    )
    if not run or not runner.pause_run(run["id"]):
        raise HTTPException(409, "No pausable running task for this job")
    await record_audit(db, actor=user["email"], action="job.pause", target=str(job_id))
    return Ok()


@router.post("/jobs/{job_id}/cancel", response_model=Ok)
async def cancel_job(
    job_id: int,
    user: dict = Depends(require_user),
    db: Database = Depends(get_db),
):
    from ..services.job_runner import runner
    run = await db.fetch_one(
        "SELECT id FROM job_runs WHERE job_id=? AND status='running' ORDER BY id DESC", (job_id,)
    )
    if not run or not await runner.cancel_run(run["id"]):
        raise HTTPException(409, "No running task for this job")
    await record_audit(db, actor=user["email"], action="job.cancel", target=str(job_id))
    return Ok()


@router.post("/jobs/{job_id}/resume")
async def resume_job(
    job_id: int,
    user: dict = Depends(require_user),
    db: Database = Depends(get_db),
):
    job = await db.fetch_one("SELECT * FROM jobs WHERE id=?", (job_id,))
    if not job:
        raise HTTPException(404, "Job not found")
    from ..services.job_runner import runner
    run_id = await runner.resume_job(job)
    if not run_id:
        raise HTTPException(409, "No checkpoint available to resume")
    await record_audit(
        db, actor=user["email"], action="job.resume", target=f"{job['name']}#{run_id}"
    )
    return {"run_id": run_id}


@router.post("/jobs/{job_id}/schedule", response_model=ScheduleOut)
async def set_schedule(
    job_id: int,
    body: ScheduleIn,
    user: dict = Depends(require_user),
    db: Database = Depends(get_db),
):
    job = await db.fetch_one("SELECT id FROM jobs WHERE id=?", (job_id,))
    if not job:
        raise HTTPException(404, "Job not found")
    if body.cron:
        try:
            from croniter import croniter
            croniter(body.cron)
        except Exception as e:
            raise HTTPException(422, f"Invalid cron: {e}")
    await db.execute(
        "UPDATE jobs SET schedule_cron=?, updated_at=datetime('now') WHERE id=?",
        (body.cron, job_id),
    )
    next_run = None
    if body.cron:
        from datetime import datetime
        from croniter import croniter
        next_run = croniter(body.cron, datetime.utcnow()).get_next(datetime).isoformat()
        # Register/unregister with scheduler
        from ..services.scheduler import scheduler
        scheduler.upsert(job_id, body.cron)
    else:
        from ..services.scheduler import scheduler
        scheduler.upsert(job_id, None)
    await record_audit(
        db,
        actor=user["email"],
        action="job.schedule",
        target=f"job:{job_id}",
        detail={"cron": body.cron},
    )
    return ScheduleOut(job_id=job_id, schedule_cron=body.cron, next_run_at=next_run)


@router.get("/jobs/{job_id}/schedule", response_model=ScheduleOut)
async def get_schedule(
    job_id: int,
    db: Database = Depends(get_db),
    _: dict = Depends(require_user),
):
    row = await db.fetch_one("SELECT schedule_cron FROM jobs WHERE id=?", (job_id,))
    if not row:
        raise HTTPException(404, "Job not found")
    next_run = None
    if row["schedule_cron"]:
        try:
            from datetime import datetime
            from croniter import croniter
            next_run = croniter(row["schedule_cron"], datetime.utcnow()).get_next(datetime).isoformat()
        except Exception:
            pass
    return ScheduleOut(job_id=job_id, schedule_cron=row["schedule_cron"], next_run_at=next_run)


# ----------------------------------------------------------------------- runs


@router.get("/runs", response_model=list[JobRunOut])
async def list_runs(
    job_id: int | None = None,
    limit: int = 100,
    db: Database = Depends(get_db),
    _: dict = Depends(require_user),
):
    if job_id:
        rows = await db.fetch_all(
            """SELECT r.*, j.name AS job_name FROM job_runs r JOIN jobs j ON j.id=r.job_id
               WHERE r.job_id=? ORDER BY r.id DESC LIMIT ?""",
            (job_id, min(limit, 1000)),
        )
    else:
        rows = await db.fetch_all(
            """SELECT r.*, j.name AS job_name FROM job_runs r JOIN jobs j ON j.id=r.job_id
               ORDER BY r.id DESC LIMIT ?""",
            (min(limit, 1000),),
        )
    return [JobRunOut(**{**r, "resumable": bool(r["resumable"])}) for r in rows]


@router.get("/runs/{run_id}", response_model=JobRunOut)
async def get_run(
    run_id: int,
    db: Database = Depends(get_db),
    _: dict = Depends(require_user),
):
    run = await db.fetch_one(
        "SELECT r.*, j.name AS job_name FROM job_runs r JOIN jobs j ON j.id=r.job_id WHERE r.id=?",
        (run_id,),
    )
    if not run:
        raise HTTPException(404, "Run not found")
    files = await db.fetch_all(
        "SELECT format, path, created_at FROM result_files WHERE run_id=?", (run_id,)
    )
    return JobRunOut(**{**run, "resumable": bool(run["resumable"]), "files": files})


@router.get("/runs/{run_id}/results", response_model=ResultsOut)
async def run_results(
    run_id: int,
    offset: int = 0,
    limit: int = 200,
    q: str | None = None,
    db: Database = Depends(get_db),
    _: dict = Depends(require_user),
):
    where, params = "run_id=?", [run_id]
    if q:
        where += " AND item_json LIKE ?"
        params.append(f"%{q}%")
    total = (await db.fetch_one(f"SELECT COUNT(*) c FROM results WHERE {where}", tuple(params)))[
        "c"
    ]
    rows = await db.fetch_all(
        f"SELECT idx, item_json FROM results WHERE {where} ORDER BY idx LIMIT ? OFFSET ?",
        (*params, min(limit, 1000), offset),
    )
    return ResultsOut(
        total=total,
        items=[{"idx": r["idx"], "item": json.loads(r["item_json"])} for r in rows],
    )


@router.delete("/runs/{run_id}", response_model=Ok)
async def delete_run(
    run_id: int,
    admin: dict = Depends(require_admin),
    db: Database = Depends(get_db),
):
    await db.execute("DELETE FROM results WHERE run_id=?", (run_id,))
    await db.execute("DELETE FROM result_files WHERE run_id=?", (run_id,))
    await db.execute("DELETE FROM job_runs WHERE id=?", (run_id,))
    await record_audit(db, actor=admin["email"], action="run.delete", target=str(run_id))
    return Ok()


# ----------------------------------------------------------------------- exports


@router.post("/exports/run/{run_id}", response_model=ExportOut)
async def export_run_ep(
    run_id: int,
    body: ExportIn,
    user: dict = Depends(require_user),
    db: Database = Depends(get_db),
):
    try:
        if body.format == "markdown_zip":
            return await exporters.export_markdown_bundle(run_id)
        out = await exporters.export_run(
            run_id, body.format, body.fields,
            body.delimiter, body.indent, body.root_tag, body.item_tag,
        )
        await record_audit(db, actor=user["email"], action="export.run", target=str(run_id))
        return ExportOut(**out)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(422, f"{type(e).__name__}: {e}")


@router.get("/exports/download/{run_id}/{fmt}")
async def download_export(
    run_id: int,
    fmt: str,
    db: Database = Depends(get_db),
    _: dict = Depends(require_user),
):
    # P0: fmt allowlist + confine resolved file under exports_dir (DB path
    # could predate guards or be tampered with — fail closed).
    if fmt not in ("json", "jsonl", "csv", "xml", "markdown_zip"):
        raise HTTPException(422, f"Unsupported format: {fmt}")
    row = await db.fetch_one(
        "SELECT path FROM result_files WHERE run_id=? AND format=? ORDER BY id DESC", (run_id, fmt)
    )
    if not row:
        raise HTTPException(404, "Export not found — generate it first")
    from pathlib import Path as _Path

    from ..config import settings as _settings

    try:
        cand = _Path(str(row["path"])).resolve()
        base = _settings.exports_dir.resolve()
        try:
            inside = cand.is_relative_to(base)  # type: ignore[attr-defined]
        except AttributeError:
            try:
                cand.relative_to(base)
                inside = True
            except ValueError:
                inside = False
        if not inside or not cand.is_file():
            raise ValueError("escapes exports dir")
    except Exception:
        raise HTTPException(404, "Export not found")
    return FileResponse(str(cand), filename=cand.name)