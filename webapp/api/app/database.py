from __future__ import annotations

import aiosqlite

from .config import settings

# Hardened schema versioned via webapp/api/migrations/*.sql (see db_migrations.py):
# - schema_meta table (id=1, version INTEGER) tracks CURRENT_VERSION (see db_migrations.CURRENT_VERSION)
# - 0001_init.sql: initial schema + UNIQUE(run_id, idx) on results + uq_results_run_idx + idx_audit_log_at on audit_log(at)
# - 0002_indexes.sql: secondary indexes
# - ON DELETE CASCADE for result_files -> job_runs (and results/job_runs -> strict FK)
# - PRAGMA busy_timeout=5000 (below + job_runner._insert_batch), journal_mode=WAL, foreign_keys=ON
# Schema is migrated idempotently on every connect() via db_migrations.upgrade(conn).


class Database:
    def __init__(self, path=settings.db_path):
        self.path = path
        self._conn: aiosqlite.Connection | None = None

    async def connect(self):
        if self._conn is None:
            conn = await aiosqlite.connect(self.path)
            conn.row_factory = aiosqlite.Row
            await conn.execute("PRAGMA journal_mode=WAL")
            await conn.execute("PRAGMA busy_timeout=5000")
            await conn.execute("PRAGMA foreign_keys=ON")
            self._conn = conn
            # Apply pending migrations on every connect. Use the conn directly to avoid
            # recursion (db.execute calls connect() which would loop).
            from .services.db_migrations import upgrade
            await upgrade(conn)
        return self._conn

    async def close(self):
        if self._conn is not None:
            await self._conn.close()
            self._conn = None

    async def execute(self, sql: str, params: tuple | dict = ()) -> int:
        conn = await self.connect()
        cur = await conn.execute(sql, params)
        await conn.commit()
        return cur.lastrowid

    async def fetch_all(self, sql: str, params: tuple | dict = ()) -> list[dict]:
        conn = await self.connect()
        cur = await conn.execute(sql, params)
        rows = await cur.fetchall()
        await cur.close()
        return [dict(r) for r in rows]

    async def fetch_one(self, sql: str, params: tuple | dict = ()) -> dict | None:
        rows = await self.fetch_all(sql, params)
        return rows[0] if rows else None


db = Database()


async def get_db() -> Database:
    await db.connect()
    return db


async def ensure_migrations(conn=None):
    """Explicit helper to run pending migrations (idempotent).

    Used by Database.connect() and can be called manually in scripts.
    Delegates to services.db_migrations.upgrade().
    """
    from .services.db_migrations import upgrade

    if conn is None:
        conn = await db.connect()
    return await upgrade(conn)