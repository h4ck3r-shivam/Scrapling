"""Async job execution: runs spiders via stream(), pumps stats/items/logs to WS hubs."""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..config import settings
from ..database import db
from .spider_factory import build_spider_class, session_kwargs_for
from .spec import JobSpec

BATCH_SIZE = 200


class LogBridge(logging.Handler):
    """Forwards spider log records into a callback (WS fan-out)."""

    def __init__(self, cb):
        super().__init__(level=logging.DEBUG)
        self.cb = cb
        self.setFormatter(logging.Formatter("%(levelname)s %(message)s"))

    def emit(self, record: logging.LogRecord):
        try:
            self.cb({
                "ts": datetime.now(timezone.utc).isoformat(),
                "level": record.levelname,
                "message": self.format(record),
            })
        except Exception:
            pass


class JobRunner:
    def __init__(self):
        self.tasks: dict[int, asyncio.Task] = {}
        self.spiders: dict[int, Any] = {}
        # run_id -> job_id mapping for correct run->job correlation (no DB query needed)
        self._run_to_job: dict[int, int] = {}
        self.hub = None  # bound to ws.WSHub at startup
        # eager semaphore — correctly limits max_concurrent_jobs from settings
        # (previous lazy `if self.semaphore is None` at line 60 was dead code after first run)
        self.semaphore: asyncio.Semaphore = asyncio.Semaphore(settings.max_concurrent_jobs)

    def bind_hub(self, hub):
        self.hub = hub

    def _emit(self, run_id: int, payload: dict):
        if self.hub is not None:
            self.hub.publish_nowait(run_id, payload)

    async def start_run(self, job_row: dict) -> int:
        # per-run crawldir avoids collision: job_{id}/run_{run_id} is unique per run
        # even under concurrent runs of the same job or parallel jobs.
        run_id = await db.execute(
            "INSERT INTO job_runs (job_id, status) VALUES (?, 'running')",
            (job_row["id"],))
        spec = JobSpec(**json.loads(job_row["spec_json"]))
        # P0: crawldir is user-controlled (JobSpec.settings.crawldir) — confine
        # it with validate_path (resolve().is_relative_to(data_dir), reject
        # absolute escapes) and keep strictly per-run isolation.
        from .guards import validate_path as _validate_path

        # strictly per-run: never re-uses a job-level directory; each run_id gets its own leaf.
        # If spec requests a custom crawldir base, still make it per-run by appending run_{id}.
        if spec.settings.crawldir:
            # Custom bases must be relative and stay inside data_dir; absolute
            # paths (e.g. /etc) are rejected fail-closed.
            base_resolved = _validate_path(spec.settings.crawldir)
            if base_resolved.name == f"run_{run_id}":
                crawldir_p = base_resolved
            else:
                # Re-validate the appended leaf to close `base/../../` races.
                try:
                    cand = (base_resolved / f"run_{run_id}").resolve()
                    base_data = settings.data_dir.resolve()
                    try:
                        inside = cand.is_relative_to(base_data)  # type: ignore[attr-defined]
                    except AttributeError:
                        try:
                            cand.relative_to(base_data)
                            inside = True
                        except ValueError:
                            inside = False
                    if not inside:
                        raise ValueError("crawldir escapes data dir")
                    crawldir_p = cand
                except Exception as e:
                    raise ValueError(f"Invalid crawldir: {e}")
            crawldir = str(crawldir_p)
        else:
            # Default is derived from numeric ids only — inherently safe — but
            # still created under the managed crawldirs_dir.
            crawldir = str(settings.crawldirs_dir / f"job_{int(job_row['id'])}" / f"run_{run_id}")
        # ensure directory exists early so checkpoint detection is reliable
        try:
            Path(crawldir).mkdir(parents=True, exist_ok=True)
        except Exception:
            pass
        await db.execute("UPDATE job_runs SET crawldir=?, started_at=datetime('now') WHERE id=?", (crawldir, run_id))
        # track run->job mapping for running_ids / callers that need job correlation
        self._run_to_job[run_id] = int(job_row["id"])
        task = asyncio.create_task(self._run(run_id, job_row, spec))
        self.tasks[run_id] = task

        def _done(_t, rid=run_id):
            self.tasks.pop(rid, None)
            self._run_to_job.pop(rid, None)

        task.add_done_callback(_done)
        return run_id

    async def _run(self, run_id: int, job_row: dict, spec: JobSpec):
        async with self.semaphore:
            await self._run_inner(run_id, job_row, spec)

    async def _run_inner(self, run_id: int, job_row: dict, spec: JobSpec):
        items_count = 0
        batch: list[tuple[int, int, str]] = []

        def on_log(entry: dict):
            self._emit(run_id, {"type": "log", **entry})

        spider: Any = None
        handler = None
        try:
            try:
                sess_info = await session_kwargs_for(spec)
            except Exception as e:
                logging.getLogger(__name__).warning("session_kwargs_for failed, using sync fallback: %s", e)
                sess_info = None
            cls = build_spider_class(spec, job_row["name"], _session_info=sess_info)
            # Authoritative per-run crawldir is the one stored in DB by start_run (already per-run isolated).
            # P0: re-validate — the DB value could predate the guard or have
            # been tampered with; fail closed if it escapes data_dir.
            from .guards import validate_path as _validate_path2

            row = await db.fetch_one("SELECT crawldir FROM job_runs WHERE id=?", (run_id,))
            stored = (row or {}).get("crawldir") if row else None
            if stored:
                s = str(stored)
                try:
                    # Stored crawldirs are absolute (resolved at start_run).
                    # Confine by resolving and requiring containment in data_dir.
                    cand = Path(s).resolve()
                    base_data = settings.data_dir.resolve()
                    try:
                        inside = cand.is_relative_to(base_data)  # type: ignore[attr-defined]
                    except AttributeError:
                        try:
                            cand.relative_to(base_data)
                            inside = True
                        except ValueError:
                            inside = False
                    if not inside:
                        raise ValueError(f"crawldir escapes data dir: {s!r}")
                    crawldir = cand
                except ValueError:
                    raise
                except Exception as e:
                    raise ValueError(f"Invalid stored crawldir: {e}")
            else:
                # fallback deterministically per-run (should rarely happen)
                if spec.settings.crawldir:
                    base = _validate_path2(spec.settings.crawldir)
                    crawldir = base if base.name == f"run_{run_id}" else base / f"run_{run_id}"
                else:
                    crawldir = Path(settings.crawldirs_dir / f"job_{int(job_row['id'])}" / f"run_{run_id}")
            try:
                crawldir.mkdir(parents=True, exist_ok=True)
            except Exception:
                pass
            spider = cls(crawldir=str(crawldir), interval=spec.settings.checkpoint_interval)
            self.spiders[run_id] = spider

            resuming = (crawldir / "checkpoint.pkl").exists()
            handler = LogBridge(on_log)
            spider.logger.addHandler(handler)
            self._emit(run_id, {"type": "status", "status": "running", "resuming": resuming})

            last_stats_push = 0.0
            loop = asyncio.get_running_loop()
            async for item in spider.stream():
                items_count += 1
                batch.append((run_id, items_count, json.dumps(item, default=str)))
                if len(batch) >= BATCH_SIZE:
                    await self._insert_batch(batch)
                    batch.clear()
                self._emit(run_id, {"type": "item", "item": item})
                now = loop.time()
                if now - last_stats_push > 1.5:
                    self._emit(run_id, {"type": "stats", "stats": self._stats_dict(spider)})
                    last_stats_push = now

            final_stats = self._stats_dict(spider)
            paused = (crawldir / "checkpoint.pkl").exists() and getattr(spider, "_paused", False)
            status = "paused" if paused else "done"
            await self._insert_batch(batch) if batch else None
            batch.clear()
            await db.execute(
                "UPDATE job_runs SET status=?, ended_at=datetime('now'), stats_json=?, items_count=? WHERE id=?",
                (status, json.dumps(final_stats), items_count, run_id))
            self._emit(run_id, {"type": "status", "status": status, "items_count": items_count,
                                "stats": final_stats})
        except asyncio.CancelledError:
            await self._insert_batch(batch) if batch else None
            await db.execute(
                "UPDATE job_runs SET status='cancelled', ended_at=datetime('now'), stats_json=?, items_count=? WHERE id=?",
                (json.dumps(self._stats_dict(spider)), items_count, run_id))
            self._emit(run_id, {"type": "status", "status": "cancelled"})
            raise
        except BaseException as e:  # noqa: BLE001 — surface everything to the run row
            await self._insert_batch(batch) if batch else None
            await db.execute(
                "UPDATE job_runs SET status='failed', ended_at=datetime('now'), error=?, items_count=? WHERE id=?",
                (f"{type(e).__name__}: {e}", items_count, run_id))
            self._emit(run_id, {"type": "status", "status": "failed", "error": f"{type(e).__name__}: {e}"})
        finally:
            if spider is not None and handler is not None:
                try:
                    spider.logger.removeHandler(handler)
                except Exception:
                    pass
            self.spiders.pop(run_id, None)

    @staticmethod
    def _stats_dict(spider: Any) -> dict | None:
        try:
            return spider.stats.to_dict()
        except Exception:
            return None

    async def _insert_batch(self, batch: list[tuple[int, int, str]]):
        if not batch:
            return
        conn = await db.connect()
        await conn.execute("PRAGMA busy_timeout=5000")
        await conn.executemany("INSERT INTO results (run_id, idx, item_json) VALUES (?,?,?)", batch)
        await conn.commit()

    def pause_run(self, run_id: int) -> bool:
        """Requests a graceful pause; the engine checkpoints then finishes."""
        spider = self.spiders.get(run_id)
        if not spider:
            return False
        try:
            spider.pause()
            return True
        except RuntimeError:
            return False

    async def cancel_run(self, run_id: int) -> bool:
        task = self.tasks.get(run_id)
        if not task:
            return False
        task.cancel()
        return True

    def running_ids(self) -> list[int]:
        """Return run_ids of actively running tasks (filters done)."""
        return [rid for rid, t in self.tasks.items() if not t.done()]

    def running_job_ids(self) -> set[int]:
        """Return job_ids that have a running run (via run->job map)."""
        return {self._run_to_job[rid] for rid in self.running_ids() if rid in self._run_to_job}

    def run_to_job(self, run_id: int) -> int | None:
        """Map a run_id to its job_id (as tracked at start_run)."""
        return self._run_to_job.get(run_id)

    async def resume_job(self, job_row: dict) -> int:
        """Re-running a job whose crawldir holds checkpoint.pkl resumes it."""
        return await self.start_run(job_row)


runner = JobRunner()
