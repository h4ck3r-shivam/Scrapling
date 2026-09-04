-- Alembic migration stub 0001_init (versioned schema)
-- Managed by webapp/api/app/services/db_migrations.py (CURRENT_VERSION).
-- Idempotent: safe to re-apply via executescript(). Version row is single-row (id=1).
CREATE TABLE IF NOT EXISTS schema_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL
);
INSERT OR IGNORE INTO schema_meta (id, version) VALUES (1, 1);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    prefix TEXT NOT NULL UNIQUE,
    hash TEXT NOT NULL,
    scopes TEXT NOT NULL DEFAULT 'fetch,parse,jobs',
    last_used_at TEXT,
    expires_at TEXT,
    revoked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'crawl',
    engine TEXT NOT NULL DEFAULT 'static',
    template TEXT NOT NULL DEFAULT 'custom',
    spec_json TEXT NOT NULL DEFAULT '{}',
    schedule_cron TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS job_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at TEXT,
    ended_at TEXT,
    stats_json TEXT,
    error TEXT,
    crawldir TEXT,
    resumable INTEGER NOT NULL DEFAULT 0,
    items_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES job_runs(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    item_json TEXT NOT NULL,
    UNIQUE(run_id, idx)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_results_run_idx ON results(run_id, idx);
CREATE INDEX IF NOT EXISTS idx_results_run ON results(run_id, idx);

CREATE TABLE IF NOT EXISTS result_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES job_runs(id) ON DELETE CASCADE,
    format TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS proxies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL UNIQUE,
    url_or_server TEXT NOT NULL,
    username_enc TEXT,
    password_enc TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS proxy_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    strategy TEXT NOT NULL DEFAULT 'cyclic_rotation',
    member_ids TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    spec_json TEXT NOT NULL DEFAULT '{}',
    state TEXT NOT NULL DEFAULT 'closed',
    pool_stats_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS saved_selectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    target_url TEXT NOT NULL,
    identifier TEXT,
    selector_spec TEXT NOT NULL DEFAULT '{}',
    auto_save INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL DEFAULT '',
    detail_json TEXT,
    at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_log_at ON audit_log(at);