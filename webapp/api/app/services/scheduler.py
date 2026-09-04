"""In-process job scheduler — fires due cron jobs and runs them.

Single instance, starts with the app, stops on shutdown.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from croniter import croniter

_log = logging.getLogger("scc.scheduler")

_TICK_SECONDS = 15


class JobScheduler:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._jobs: dict[int, dict] = {}  # job_id -> {cron, last_fired}

    async def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._tick_loop())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None

    def upsert(self, job_id: int, cron_expr: str | None) -> None:
        if not cron_expr:
            self._jobs.pop(job_id, None)
            return
        self._jobs[job_id] = {"cron": cron_expr, "last_fired": datetime.utcnow()}

    def list_jobs(self) -> list[dict]:
        return [{"job_id": jid, **meta} for jid, meta in self._jobs.items()]

    async def _tick_loop(self) -> None:
        while True:
            try:
                await asyncio.sleep(_TICK_SECONDS)
                await self._fire_due()
            except asyncio.CancelledError:
                return
            except Exception as e:  # pragma: no cover
                _log.warning("scheduler tick error: %s", e)

    async def _fire_due(self) -> None:
        if not self._jobs:
            return
        now = datetime.utcnow()
        from ..database import db
        from .job_runner import runner
        for jid, meta in list(self._jobs.items()):
            try:
                itr = croniter(meta["cron"], meta["last_fired"])
                next_due = itr.get_next(datetime)
            except Exception:
                continue
            if next_due > now:
                continue
            row = await db.fetch_one("SELECT * FROM jobs WHERE id=?", (jid,))
            if not row:
                self._jobs.pop(jid, None)
                continue
            try:
                await runner.start_run(row)
                meta["last_fired"] = now
                _log.info("scheduler fired job %s", jid)
            except Exception as e:
                _log.warning("scheduler failed to start job %s: %s", jid, e)


scheduler = JobScheduler()