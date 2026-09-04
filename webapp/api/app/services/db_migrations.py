"""Simple version-based migration runner.

Runs idempotently on every boot. Reads ordered files from
``webapp/api/migrations/`` and applies any with a higher version than the
one stored in ``schema_meta``.

Each migration file must be idempotent (``CREATE ... IF NOT EXISTS`` etc.).
"""
from __future__ import annotations

import logging
from pathlib import Path

import aiosqlite

_log = logging.getLogger("scc.migrations")

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent.parent / "migrations"

CURRENT_VERSION = 2

# (version, filename) ordered ascending
MIGRATIONS: list[tuple[int, str]] = [
    (1, "0001_init.sql"),
    (2, "0002_indexes.sql"),
]


async def _get_version(conn: aiosqlite.Connection) -> int:
    """Return the current schema version. 0 if the table doesn't exist yet."""
    # Make sure the meta table exists first
    await conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_meta ("
        "  id INTEGER PRIMARY KEY CHECK (id = 1),"
        "  version INTEGER NOT NULL"
        ")"
    )
    await conn.commit()
    cur = await conn.execute("SELECT version FROM schema_meta WHERE id = 1")
    row = await cur.fetchone()
    await cur.close()
    if row:
        return int(row[0])
    # Fresh DB — version 0 so all migrations apply
    return 0


async def upgrade(conn: aiosqlite.Connection) -> int:
    """Apply any pending migrations using the given open connection.

    Returns the new schema version. Idempotent.
    """
    current = await _get_version(conn)
    for version, fname in MIGRATIONS:
        if version <= current:
            continue
        path = MIGRATIONS_DIR / fname
        if not path.exists():
            _log.error("migration file missing: %s", path)
            return current
        sql = path.read_text()
        try:
            await conn.executescript(sql)
            await conn.execute(
                "UPDATE schema_meta SET version = ? WHERE id = 1", (version,)
            )
            await conn.commit()
            _log.info("applied migration %d (%s)", version, fname)
            current = version
        except Exception as e:
            _log.exception("migration %d failed: %s", version, e)
            return current
    return CURRENT_VERSION