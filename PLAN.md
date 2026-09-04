# Scrapling – Solid Plan (Monthly Upstream + Monorepo Frontend + Coolify v4.3.12)

**Date:** 2026-08-27  
**Coolify Verified:** `v4.3.12` latest stable (2026-08-26, fixes `auth rate limit behind Cloudflare` + `unreachable counter`), `v4.4-rc.1` RC available – do NOT use RC for prod. Keep Coolify auto-update ON (4.3.x patch).  
**Repo:** `Scrapling` `0.4.16` (this fork), upstream `D4Vinci/Scrapling` monthly sync.  
**Decisions Locked:** monthly fork, frontend `webapp/web` inside this repo (monorepo), priorities `3 Spiders urgent > 1 Parser+2 Fetchers high > 4 AI medium`, deploy `Ubuntu VM + Coolify + GitHub private repo + Docker Compose Service + Cloudflare Tunnel`, stability `strict + pinned` (chosen wisely).

---

## 1. Why Monorepo Frontend is Best Here

* Atomic `api + web` builds: one `git pull` (Coolify) gets both, `Dockerfile` can `COPY web/dist` (need to remove `.dockerignore:110` `web/`), no version skew private-repo vs separate frontend repo.
* Single PR for upstream sync: `scrapling/core` change + `webapp/web` parity fix together.
* Coolify `Services → Docker Compose` expects one repo with `docker-compose.yml` at root – monorepo satisfies exactly. Separate frontend repo would need 2 Coolify resources + cross-CORS.

---

## 2. Architecture – What Scrapling Is & How Frontend Will Use It Fully

**Core** `scrapling/parser.py:77` `Selector` hub – `core/pagination.py:76` `find_pagination`, `core/schemas.py:276` `detect_schemas`, `core/analyzer.py:70` `analyze`, `core/regex_generator.py:64` `generate_regex`, `core/storage.py:73` SQLite adaptive, `core/custom_types.py:29` `TextHandler`.  
**Engines** `fetchers/requests.py:13` `Fetcher` (`curl_cffi` `static.py:50`), `fetchers/chrome.py:11` `DynamicFetcher` (playwright, `PagePool _page.py:46`), `fetchers/stealth_chrome.py:23` `StealthyFetcher` (patchright, CF solver `_stealth.py:108`), `toolbelt/convertor.py:83` `ResponseFactory`, `toolbelt/ad_domains.py:8` 3500 `block_ads`. Data-URL fixed `_controllers.py:163` `_stealth.py:256` → synthetic `Response 200`.  
**Spiders** `spiders/spider.py:65` `Spider` (`concurrent 4`, `AutoThrottle _throttle.py:31`, `Scheduler`, `SessionManager session.py:12`, `LinkExtractor links.py:170`, templates `CrawlSpider/Sitemap/Shopify/XML/CSV/SiteToMarkdown`).  
**Webapp** `webapp/api/app/main.py:31` `FastAPI` `/api` + `StaticFiles web/dist` if exists (currently missing → `404` on `/`), `config.py:12` `.jwt_secret` 0o600, `database.py:7` `users/api_keys/jobs/job_runs/results/proxies/...` no migrations, `security.py:15` `Argon2id + HS256 24h`, `deps.py:23` query JWT leak (to fix), `job_runner.py:53` `crawldir job_{id}` collision, `ws.py:15` `WSHub` in-memory split-brain.

**Frontend Will Expose (priority order):**

* **Urgent 3 – Spiders/Jobs:** `GET/POST /api/jobs` `spec.py:371` `JobSpec` (engine `static/dynamic/stealthy`, template `custom/crawl/sitemap/shopify/xml/csv/site_to_markdown`, `SpiderSettingsSpec` concurrency/throttle/robots/devcache, `LinkExtractorSpec`), `POST /jobs/{id}/start/pause/cancel`, `WS /ws/jobs/{run_id}` live items, Results `results?run_id&idx` pagination, Exports `to_json/csv/xml` `services/exporters.py:1`, Sessions `POST /sessions/open/close` `session_manager.py:18`, Proxies/Groups `proxies` encrypted `Fernet`, `saved_selectors` library.
* **High 1,2 – Parser/Fetchers:** `POST /api/fetch` (`FetchRequestSpec` + `StaticEngineConfig`/`BrowserEngineConfig` from `spec.py:97/136`), `POST /api/parse` (`ParseIn html+steps[]` `css/xpath/find_all/find_by_text/re/…` `adaptive` + `storage_args` pinned `webapp/data/elements_storage.db`), `POST /api/parse/tree` `max_nodes 800`, `GET /api/selectors`.
* **Medium 4 – AI:** `POST /api/system/mcp/start` `8017`, `SiteToMarkdownSpider` RAG, `response.markdown(css_selector, main_content_only)` preview, `docs/parsing/helpers.md:1` new helpers.

**Stack:** `webapp/web` `Vite 6 + React 18 + TS 5 + Tailwind 3 + TanStack Query 5 + Zustand + React Router 6 + shadcn/ui + Monaco (page_action code, warn exec sandbox engines.py:122)`. Build → `web/dist` copied into `api` image, served via `main.py:67` `StaticFiles(html=True)` fallback to `index.html`.

---

## 3. Monthly Upstream Sync – How Frequent Pulls Don’t Break Frontend

**Why monthly + strict:** You said monthly – balances upstream `0.4.x` churn vs frontend stability. `Strict + pinned` = `scrapling==0.4.16` locked via `uv.lock` (root + `webapp/.venv`), contract gate blocks breaking drift.

**Workflow** `.github/workflows/upstream-sync.yml` `cron: 0 0 1 * *` (1st 00:00 UTC):
```yaml
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4 with: fetch-depth 0
      - run: git remote add upstream https://github.com/D4Vinci/Scrapling.git || true; git fetch upstream main
      - run: git checkout -b upstream-sync-$(date +%Y-%m) && git merge --no-ff upstream/main --no-edit || (echo "conflict" && git status)
      - run: yq bump pyproject.toml version patch && uv lock --all-extras && cp uv.lock webapp/.venv/uv.lock
      - run: webapp/.venv/bin/python -m pytest webapp/tests/test_spec_parity.py -q  # blocks if spec.py drift (STEALTH_ONLY_FIELDS:25, FETCH_ONLY_FIELDS:26, ParserConfig:43, SpiderSettingsSpec:240, LinkExtractorSpec:270, ExtractionStep:298)
      - run: webapp/.venv/bin/python -m pytest tests/parser tests/spiders -q && npx pyright scrapling
      - if fail → gh pr create --draft --title "chore: upstream sync $(date) – parity drift" --body "Check spec.py, engines.py, spider_factory.py"
      - if pass → gh pr create --title "chore: upstream sync $(date)" --auto-merge after approval
```
Manual: `gh workflow run upstream-sync.yml` or `git fetch upstream && git merge`.

**Parity Fixes on Drift:** When `BrowserTypeLiteral` adds target, update `spec.py:23` `IMPERSONATE_TARGETS` + `webapp/tests/test_spec_parity.py:164` `len>30` + `spec.py:97/136` fields. Add migration row `database.py:7` `schema_meta` if `jobs.spec_json` shape changes.

---

## 4. Docker + Coolify v4.3.12 + Cloudflare Tunnel (Your Stack)

**Coolify v4.3.12 Note:** `Services → Docker Compose` is current (old `Applications → Docker Compose` deprecated). Use **Service** (not Application) for multi-container. Docs `coolify.io/docs/services/configuration/docker-compose` – paste `docker-compose.yml` in Service editor, no `networks:` needed (Coolify creates shared), set `FQDN` per service for domain.

**Repo Changes Needed (pre-deploy):**
* Remove `.dockerignore:110` `web/`
* Create `webapp/Dockerfile.api` (api) + `webapp/web/Dockerfile` (node build → nginx) OR single-stage `Dockerfile` at root that builds `web/dist` then copies to `api`:
```dockerfile
FROM node:20 AS webbuild
WORKDIR /app/webapp/web
COPY webapp/web/package.json ./
RUN npm ci && npm run build # -> dist

FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --all-extras --frozen
COPY . .
COPY --from=webbuild /app/webapp/web/dist ./webapp/web/dist
RUN uv run playwright install --with-deps chromium && uv run playwright install chromium
HEALTHCHECK CMD curl -f http://localhost:8000/api/health || exit 1
USER 1000:1000
VOLUME /app/webapp/data
EXPOSE 8000
CMD ["uv","run","uvicorn","app.main:app","--host","0.0.0.0","--port","8000","--app-dir","webapp/api","--proxy-headers"]
```
* Fix `webapp/api/run.py:12` `host="0.0.0.0"` (was `127.0.0.1` breaks Coolify probe) and `config.py:54` `effective_python = "uv run python"` not `webapp/.venv` hardcode, `config.py:44` `cors_origins` via `SCC_CORS_ORIGINS=https://scrapling.yourdomain.com,https://api.yourdomain.com`.

**`docker-compose.yml` (root, for Coolify Service):**
```yaml
services:
  api:
    build: {context: ., dockerfile: webapp/Dockerfile.api}
    ports: ["8000:8000"]
    env_file: .env
    environment: [SCC_CORS_ORIGINS=https://scrapling.yourdomain.com, SCC_SECRET_KEY_FILE=/run/secrets/jwt, SCC_ADMIN_PASSWORD=${SCC_ADMIN_PASSWORD}]
    volumes: [scc-data:/app/webapp/data]
    healthcheck: {test: ["CMD","curl","-f","http://localhost:8000/api/health"], interval: 30s}
    restart: unless-stopped
  # web is served by api StaticFiles from web/dist – no separate nginx needed
volumes: {scc-data: {driver: local}}
```
Coolify Service: `Project → Environment → + Add Resource → Docker Compose (Empty)` → paste above, `FQDN: https://scrapling.yourdomain.com` → Traefik routes to `api:8000`. Persistent `scc-data` keeps `app.db`, `exports/`, `crawls/`, `.jwt_secret`, `.secret_key` across redeploys (fixes `config.py:14` regen).

**Cloudflare Tunnel Option (Ubuntu VM):**
* On VM `cloudflared tunnel create scrapling && cloudflared tunnel route dns scrapling scrapling.yourdomain.com`
* `cloudflared tunnel run` with `ingress: - hostname: scrapling.yourdomain.com service: http://localhost:8000` (if not using Coolify domain, use tunnel instead of Coolify FQDN). For Coolify, add `cloudflared` as sidecar service in same compose:
```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on: [api]
```

**Env for Coolify:** `SCC_ADMIN_PASSWORD` (change from `admin123`), `SCC_SECRET_KEY` (persisted file, not env), `SCC_CORS_ORIGINS`, `SCC_DB_PATH`, `CLOUDFLARE_TUNNEL_TOKEN` if using tunnel.

---

## 5. Testing Gates (So Monthly Pulls Never Break Frontend)

* **Contract:** `webapp/tests/test_spec_parity.py -q` (covers `StaticEngineConfig/BrowserEngineConfig/ParserConfig/SpiderSettingsSpec/LinkExtractorSpec/ExtractionStep`). Add `test_api_contract.py` Pact for `POST /api/fetch` shape.
* **Unit:** `pytest tests/parser tests/spiders -q` (631) + `pytest tests/parser/test_roadmap_features.py` + `tests/integrations/test_scrapy_plugin.py` (now 11)
* **Browser e2e:** `pytest webapp/tests -q` + manual `DynamicFetcher/StealthyFetcher` `23/23` (after `data:` fix)
* **Load:** `k6` `POST /api/fetch` concurrency `3` (matches `max_concurrent_jobs`), `disk_usage` `rglob` limit `10k`.

---

## 6. What Was Fixed for v0.4.16 (So Frontend Starts Clean)

* `pagination` `i` flag → `lower()` (`core/pagination.py:48`), `schemas` `core/schemas.py:237`, `analyzer` `core/analyzer.py:18`
* `ScraplingDownloaderMiddleware` `__slots__` → `WeakKeyDictionary` (`integrations/scrapy.py:22`)
* Browser `data:` synthetic `Response 200` (`_controllers.py:163`, `_stealth.py:256`)
* Regex alternation for `^/p.+?$` (`regex_generator.py:83`)
* Docs `parsing/helpers.md:1` + `scrapy.md:54` + `zensical.toml:21`
* `scrapy` plugin `Spiders` ready for `LinkExtractor` usage in frontend

---

## 7. Next Build Order (Approve → Build)

1. `webapp/web` scaffold `Vite` `Jobs` page (urgent 3) → `Fetch`/`Parse` (high 1,2) → `AI` (medium 4)
2. Patch `run.py/Dockerfile/.dockerignore/spec parity` + add `upstream-sync.yml`
3. Cut `v0.4.16` `docker-compose.yml` + Coolify deploy test on `scrapling.yourdomain.com`

**Saved:** This file `PLAN.md` at repo root – re-read before each monthly fork. Confirm to start `webapp/web` scaffold?
