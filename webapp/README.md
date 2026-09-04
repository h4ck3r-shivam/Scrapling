# Scrapling Control Center (SCC)

A self-hosted web app on top of the [Scrapling](https://github.com/D4Vinci/Scrapling) scraping library. SCC gives your team a friendly UI to fetch pages, crawl sites, parse HTML, run scheduled jobs, export data, and expose tools to AI assistants via MCP — without writing code.

## What is SCC

Scrapling Control Center is a FastAPI backend + Vite/React single-page app that wraps Scrapling's scrapers behind a clickable dashboard. It handles:

- One-off page **Fetches** (debug a tricky URL)
- Multi-page **Crawls** saved as reusable Jobs
- **Parse playground** to test CSS / XPath / regex on HTML
- **Sessions** (warm HTTP / browser pools) and **Proxies** (with rotation)
- **Runs** with live WebSocket progress + downloadable exports (CSV / JSON / XML / Markdown)
- **Schedules** (cron) so a Job runs itself every hour / day
- **AI helpers**: clean Markdown of any page, plus an MCP server so Cursor / Claude can call Scrapling as a tool
- **Admin**: users, API keys, audit log, browser installation, MCP control

Under the hood it leans on `scrapling[all]` (curl_cffi + Playwright + Patchright) plus `mcp`, `markdownify`, and the rest of the Scrapling extras.

## Architecture

```
Scrapling repo (root)
├── webapp/                       ← this directory (the SCC app)
│   ├── api/                      ← FastAPI backend (Python)
│   │   ├── app/
│   │   │   ├── main.py           ← entrypoint, mounts routers + SPA
│   │   │   ├── routers/          ← auth, jobs, fetch, parse, system, …
│   │   │   ├── services/         ← job_runner, scheduler, session_manager
│   │   │   └── database.py       ← aiosqlite wrapper
│   │   ├── migrations/           ← SQL schema
│   │   ├── tests/                ← pytest
│   │   ├── run.py                ← `python webapp/api/run.py`
│   │   └── .env.example          ← copy to .env for dev
│   │
│   ├── web/                      ← Vite + React + TypeScript SPA
│   │   ├── src/
│   │   │   ├── pages/            ← Jobs, Fetch, Parse, AI, Admin, …
│   │   │   ├── components/       ← shared UI (Radix + Tailwind)
│   │   │   ├── lib/              ← api client, helpTexts, types
│   │   │   ├── router/           ← react-router routes
│   │   │   └── store/            ← zustand stores (auth, …)
│   │   ├── package.json          ← `npm ci && npm run dev`
│   │   └── vite.config.ts
│   │
│   ├── docs/                     ← USER_GUIDE.md, DEPLOY_COOLIFY.md, …
│   ├── scripts/                  ← gen_endpoints_doc.py, …
│   ├── data/                     ← runtime: app.db, exports/, crawls/
│   ├── Dockerfile.api            ← production image (frontend + backend)
│   └── pyproject.toml            ← backend deps (editable install of root scrapling)
│
├── scrapling/                    ← the library SCC wraps
├── docker-compose.yml            ← Coolify Service compose file
├── pyproject.toml                ← root: declares [webapp] extras
└── Dockerfile                    ← alternative root image build
```

Three runtime processes / pieces:

| Piece | Tech | Default port |
| --- | --- | --- |
| **Backend API** (`webapp/api/`) | FastAPI + uvicorn, aiosqlite | `8000` |
| **Web SPA** (`webapp/web/`) | Vite + React + Radix + Tailwind | `5173` (dev only) |
| **Storage** | SQLite file under `webapp/data/app.db` | — |

In dev the SPA calls `/api` directly on port `8000` (Vite proxy) or hits the backend on `localhost:8000` (configured in `.env`). In production the SPA is built to `webapp/web/dist/` and served by FastAPI's `StaticFiles`, so a single container handles both.

## Dev mode

You need Python 3.10+ and Node 20+.

### 1. Backend

```bash
# from repo root
uv sync --all-extras                       # installs scrapling[all] + webapp deps
cp webapp/api/.env.example webapp/api/.env  # edit as needed

# run the API on :8000
uv run uvicorn app.main:app \
    --app-dir webapp/api --host 0.0.0.0 --port 8000 --reload
```

The first launch creates `webapp/data/app.db`, an admin user (`admin@example.com`), and either reads `SCC_ADMIN_PASSWORD` from `.env` or generates a one-time password shown on the login screen.

### 2. Frontend

```bash
cd webapp/web
npm ci
npm run dev                                # opens http://127.0.0.1:5173
```

Vite proxies `/api/*` to `http://127.0.0.1:5173` → `http://localhost:8000` so cookies + WebSockets work without extra CORS setup. Edit `webapp/web/vite.config.ts` if you change the backend port.

### 3. Smoke test

Open <http://127.0.0.1:5173>, log in with the admin email + first-run password, and visit **Fetch** → paste `https://example.com` → **Run fetch**. You should see HTML / headers / Markdown come back.

## Production build

The simplest production setup is the docker-compose in the repo root:

```bash
git clone https://github.com/<you>/Scrapling.git
cd Scrapling
cp .env.example .env       # or set env vars in Coolify
docker compose up -d --build
```

The single `api` service builds `webapp/Dockerfile.api` (which compiles the Vite frontend in a `webbuild` stage then ships a slim Python 3.12 image with Playwright Chromium installed). FastAPI serves both `/api/*` and the SPA from one port.

Health check:

```bash
curl http://localhost:8000/api/health
# → {"status":"ok"}
```

Persistent data lives in the named volume `scc-data` mounted at `/app/webapp/data` — that's `app.db`, `exports/`, `crawls/`, `.jwt_secret`, `.first_run_password`, `elements_storage.db`, and `dev_cache/`.

For Coolify deployment (recommended — auto-TLS, FQDN, backups), follow **[webapp/docs/DEPLOY_COOLIFY.md](docs/DEPLOY_COOLIFY.md)**.

## Environment variables

All env vars live in `webapp/api/.env.example`. See that file for the full annotated list. The ones you'll most likely override:

| Var | Purpose | Default |
| --- | --- | --- |
| `SCC_ADMIN_EMAIL` | First-run admin login | `admin@example.com` |
| `SCC_ADMIN_PASSWORD` | First-run admin password (empty = auto-generate + show once) | _empty_ |
| `SCC_SECRET_KEY` | JWT signing key (empty = persist to `.jwt_secret`) | _empty_ |
| `SCC_DB_PATH` | SQLite file location | `webapp/data/app.db` |
| `SCC_CORS_ORIGINS` | Comma-separated allowed origins | `http://localhost:5173,http://127.0.0.1:5173` |
| `SCC_MAX_CONCURRENT_JOBS` | Crawler concurrency cap | `3` |
| `SCC_OUTBOUND_DOMAIN_ALLOWLIST` | Optional fetch host allow-list | _empty (allow all)_ |
| `SCC_MCP_ENABLED` | Whether the MCP server can start | `true` (in `.env.example`) |
| `SCC_MCP_PORT` | MCP server port | `8017` |
| `CLOUDFLARE_TUNNEL_TOKEN` | Optional cloudflared sidecar | _empty_ |

Multi-instance deploys: set `SCC_SECRET_KEY` to a stable value so all instances verify the same JWTs.

## Tests

### Backend (pytest)

```bash
uv sync --all-extras                              # one-time
uv run pytest webapp/api/tests -q                 # backend unit tests
```

### Frontend E2E (Playwright)

```bash
cd webapp/web
npm ci
npx playwright install --with-deps chromium
npx playwright test
```

Tests expect a running backend with the `SCC_*` env vars from `.github/workflows/webapp-e2e.yml`:

```bash
export SCC_DB_PATH=/tmp/scc-e2e.db
export SCC_ADMIN_PASSWORD=e2e-admin-pw
export SCC_ADMIN_EMAIL=admin@example.com
export SCC_CORS_ORIGINS=http://127.0.0.1:5173
export SCC_SECRET_KEY=ci-test-secret
```

A dedicated CI job runs both on every PR / push to `main` that touches `webapp/**` — see `.github/workflows/webapp-e2e.yml`.

## Deploy

- **Coolify v4 (recommended):** step-by-step guide in **[webapp/docs/DEPLOY_COOLIFY.md](docs/DEPLOY_COOLIFY.md)** — covers Coolify Service + Cloudflare Tunnel + volume backup + upgrade.
- **Bare Docker / any host:** `docker compose up -d --build` from the repo root (see *Production build* above).
- **Reverse proxy yourself:** point Nginx / Caddy / Traefik at `http://api:8000`. Make sure the proxy passes `X-Forwarded-Proto` and `Host` headers — uvicorn is launched with `--proxy-headers` for exactly this reason.

## Regenerate the API reference

To dump the current FastAPI OpenAPI spec as a Markdown table grouped by tag:

```bash
python webapp/scripts/gen_endpoints_doc.py
# → writes webapp/docs/api/ENDPOINTS.md
```

Override the server URL with `SCC_URL` (default `http://localhost:8000`).