# Deploying Scrapling Control Center on Coolify v4.3.12

A step-by-step guide to running SCC behind Coolify on an Ubuntu VM, with an optional Cloudflare Tunnel if you'd rather not expose port 443 publicly.

> Assumes Coolify **v4.3.12** (also works on later v4.x with minor UI shifts) and a fresh Ubuntu 22.04+ VM.

---

## Prerequisites

Before you start, make sure you have:

- **An Ubuntu VM** (22.04 LTS or 24.04 LTS) — bare metal, a cloud VPS, or a homelab box. Minimum 2 vCPU / 2 GB RAM / 20 GB disk for small teams; 4 GB RAM recommended if you'll run Playwright / Patchright heavy crawls.
- **Coolify installed** on that VM. Quick install (one-liner): `curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash`. After install, open `http://<vm-ip>:8000` and finish the wizard.
- **SSH access** to the VM as a sudo user (for the Cloudflare Tunnel option).
- **A GitHub repository** containing the SCC source. Either fork <https://github.com/D4Vinci/Scrapling> or push this repo as-is.
- **(Optional, for tunnel option)** A Cloudflare account with a domain added, and a Cloudflare Tunnel token (`cloudflared service install <token>` style — generated from *Cloudflare Zero Trust → Tunnels → Create a tunnel*).

---

## Environment variables to set in Coolify

SCC reads its config from environment variables (see `webapp/api/.env.example` for the full annotated list). Set these in **Coolify → Project → Environment → Environment Variables** before the first deploy:

| Variable | Required? | Example value | Notes |
| --- | --- | --- | --- |
| `SCC_ADMIN_EMAIL` | Yes | `admin@example.com` | First-run admin login. |
| `SCC_ADMIN_PASSWORD` | **Yes for prod** | _a strong 24+ char password_ | Used to bootstrap the first admin. **Set this** so you don't rely on the one-time random password. |
| `SCC_SECRET_KEY` | Recommended | _a long random string_ | JWT signing key. Leave empty to auto-generate one persisted to `/app/webapp/data/.jwt_secret` (works for single-instance; set explicitly for multi-instance). |
| `SCC_CORS_ORIGINS` | Yes | `https://scrapling.yourdomain.com` | Comma-separated. **Must match the FQDN you use to open the app** — no trailing slash. |
| `SCC_MCP_ENABLED` | Optional | `true` | Lets the MCP server (port 8017) start. Required if teammates will plug Scrapling into Cursor / Claude. |
| `SCC_MAX_CONCURRENT_JOBS` | Optional | `3` | Caps how many jobs run at once. |
| `SCC_OUTBOUND_DOMAIN_ALLOWLIST` | Optional | _empty_ | Comma-separated host allow-list for `/fetch`. Empty = no restriction. |
| `CLOUDFLARE_TUNNEL_TOKEN` | Only if using tunnel | _your tunnel token_ | Only needed when you're using the `cloudflared` sidecar (see step 5). |

> The volume `scc-data` (mounted at `/app/webapp/data`) holds the persistent files: `app.db`, `exports/`, `crawls/`, `.jwt_secret`, `.first_run_password`, `elements_storage.db`, `dev_cache/`. Coolify creates the volume automatically when you add the compose service.

---

## How to add the docker-compose service in Coolify

### 1. Create the project

1. Log into Coolify, click **+ New Project** in the sidebar.
2. Pick **Local Docker** as the environment (Coolify v4 groups everything per environment).
3. Name it (e.g. `scrapling`) and create.

### 2. Add the GitHub source

1. Inside the project, go to **Resources → + New** (top right).
2. Choose **GitHub App** (recommended) or **Public/Private Repo**, then authorize Coolify to see your repo.
3. Pick the `Scrapling` repo and the branch (`main` for production).

### 3. Add the Docker Compose resource

1. Back in **Resources → + New** → choose **Docker Compose Empty**.
2. Set **Name** to `scrapling-api`.
3. Set **Build Pack** to `docker-compose`.
4. Set **Base Directory** to `/` (repo root — `docker-compose.yml` lives at the top).
6. Paste the contents of the repo's [`docker-compose.yml`](../../docker-compose.yml) into the **Docker Compose** field. It declares only the `api` service: no `ports:` (Traefik routes FQDN → `api:8000` via `expose:`), no `env_file:` (env comes from the Coolify UI panel below), `deploy.resources.limits` of `2 CPU / 3 GB RAM`, `json-file` log rotation (`10m × 3`), and a `/api/health` healthcheck with a `60s` start period.
7. Set the FQDN: in the service card → **Service → FQDN** → enter `https://scrapling.yourdomain.com` (or your chosen subdomain). Coolify will request a Let's Encrypt cert automatically.
8. Click **Deploy**. First build takes a few minutes (Node frontend compile + Python deps + Playwright Chromium download).

> **No `networks:` block needed** — Coolify creates a shared project network automatically and Traefik attaches to it. The compose file in this repo intentionally leaves networking to Coolify. Likewise there is intentionally **no `ports:` and no `env_file:`** — publishing host ports would bypass Traefik/TLS, and secrets must be injected via Coolify's **Environment Variables** panel (see table above), never via a committed `.env` file.

---

## 4. Verify the deployment

Once Coolify shows the service as **Healthy**:

```bash
# API health
curl https://scrapling.yourdomain.com/api/health
# → {"status":"ok"}

# OpenAPI spec (for sanity, large JSON)
curl https://scrapling.yourdomain.com/openapi.json | head

# Visit in the browser
open https://scrapling.yourdomain.com
```

You should see the login page. First-run admin password:

- If you set `SCC_ADMIN_PASSWORD` in env, use it as-is.
- If you left it empty, check the server logs (`Coolify → Service → Logs`) for the `First-run admin password:` line. The password is also written once to `/app/webapp/data/.first_run_password` (mode `0600`) and surfaced in the login screen via `GET /api/auth/first-run-hint`.

Log in and visit **Home**. You should see status cards for jobs, runs, MCP, and disk.

---

## 5. (Optional) Cloudflare Tunnel instead of Coolify FQDN

Use this if you'd rather tunnel through Cloudflare than expose port 443 publicly. Useful when the VM is behind a firewall or you want Cloudflare WAF / Access in front of SCC.

### 5.1 Create the tunnel

On the VM (or any machine with `cloudflared`):

```bash
cloudflared tunnel create scrapling
cloudflared tunnel route dns scrapling scrapling.yourdomain.com
```

The first command prints a **token** (or you can grab it from *Cloudflare Zero Trust → Tunnels → scrapling → Configure → Install token*). Copy it.

### 5.2 Wire up the ingress

In Cloudflare, edit your tunnel's **Configuration → Ingress** and add:

| Hostname | Service URL |
| --- | --- |
| `scrapling.yourdomain.com` | `http://api:8000` (Coolify project network) or `http://<vm-ip>:8000` |

If using the Coolify project network, name the service as Coolify sees it (typically `<project-name>-api-1`); run `docker ps` in the VM to confirm. Either way, the `cloudflared` sidecar will route `https://scrapling.yourdomain.com` → the container port `8000`.

### 5.3 Enable the sidecar in Coolify

The tunnel sidecar lives in its own overlay file, [`docker-compose.tunnel.yml`](../../docker-compose.tunnel.yml) (pinned `cloudflare/cloudflared` image, log rotation, `tunnel` profile). The base `docker-compose.yml` stays Traefik-only. Two ways to enable:

**Option A — paste the overlay into Coolify (recommended for clarity)**

1. Edit the Coolify service → **Docker Compose** field. Append the contents of `docker-compose.tunnel.yml` below the base file (Compose merges the `cloudflared` service alongside `api`).
2. Remove `profiles: ["tunnel"]` from the pasted `cloudflared` block so it always starts with the service.
3. In **Environment Variables**, set `CLOUDFLARE_TUNNEL_TOKEN=<paste token>`.
4. Click **Redeploy**.

**Option B — toggle via profile (self-hosted `docker compose`)**

1. Add `COMPOSE_PROFILES=tunnel` to **Environment Variables** (or export it on the VM).
2. Deploy with both files:
   `docker compose -f docker-compose.yml -f docker-compose.tunnel.yml --profile tunnel up -d --build`.

After redeploy, `docker ps` on the VM should show both `…-api-1` and `…-cloudflared-1` as **healthy**. Visiting `https://scrapling.yourdomain.com` should reach SCC via the tunnel.

### 5.4 Cloudflare WAF rules (recommended)

SCC's bootstrap endpoint and login endpoint are the two internet-facing secrets — put Cloudflare WAF in front of both. (Dashboard → your domain → **Security → WAF**.)

**Rule 1 — Block `GET /api/auth/first-run-hint` post-bootstrap.**
`GET /api/auth/first-run-hint` returns the one-time generated admin password while the `.first_run_password` marker file exists (`webapp/api/app/routers/auth.py:94`). The app already returns `{"hint": false}` once the marker is gone, but post-bootstrap the endpoint has no legitimate callers — block it at the edge:

1. Finish first login: log in, change the admin password, then dismiss the marker via `POST /api/auth/dismiss-first-run` (authenticated) or `docker exec -it <api-container> rm /app/webapp/data/.first_run_password`.
2. **Security → WAF → Custom rules → Create rule.** Name: `block-first-run-hint-post-bootstrap`.
   - Expression: `(http.request.uri.path eq "/api/auth/first-run-hint")`
   - Action: **Block**. Leave it **Enabled** permanently.
3. Verify: `curl -i https://scrapling.yourdomain.com/api/auth/first-run-hint` → `403` from Cloudflare.

> Timing: create the rule **Disabled** before first bootstrap (so the login screen can show the one-time hint), then **Enable** it right after step 1.

**Rule 2 — Challenge `POST /api/auth/login` after repeated failures.**
`POST /api/auth/login` returns `401 Invalid credentials` on bad passwords (`webapp/api/app/routers/auth.py:75`) and every attempt is written to SCC's `audit_log`. Cloudflare WAF custom rules match on *requests*, not on the upstream `401` response, so approximate "after N 401s" with a **Rate Limiting rule** on the login endpoint plus Managed Challenge, and correlate with SCC-side logs:

1. **Security → WAF → Rate limiting rules → Create rule.** Name: `challenge-login-bruteforce`.
   - Expression: `(http.request.uri.path eq "/api/auth/login" and http.request.method eq "POST")`
   - Characteristics: **IP** (add `AS Num` if you see distributed spraying).
   - Period **1 minute**, threshold **5 requests** → action **Managed Challenge**, duration **10 minutes**.
2. Optional stricter sequel — Name: `block-login-spray`, same expression, period **5 minutes**, threshold **20 requests** → action **Block** for **1 hour**.
3. Correlate: `docker exec -it <api-container> sh -c 'grep -c "401" /proc/1/fd/1'` is not queryable — instead watch SCC **Audit** page / `audit_log` rows with `action='login'` and the container logs for `401`s from a single IP, then tighten the threshold or add a manual IP block rule.

> Use **Managed Challenge**, not Block, for Rule 2's first tier — offices behind NAT share one egress IP and a hard block would lock out legitimate admins. Keep `SCC_CORS_ORIGINS` exactly matching the FQDN so challenged-then-cleared browsers don't trip CORS errors.

---

## 6. Backup

SCC keeps **everything that matters** in the `scc-data` named Docker volume mounted at `/app/webapp/data`:

```
/app/webapp/data/
├── app.db                      # SQLite: users, jobs, runs, results, audit_log, …
├── exports/                    # generated CSV / JSON / XML / md-zip
├── crawls/                     # per-run scrapl output (HTML, cache)
├── elements_storage.db         # adaptive selector memory
├── dev_cache/                  # dev-mode fetcher cache (safe to delete)
├── .jwt_secret                 # JWT signing key (mode 0600)
├── .secret_key                 # optional override of SCC_SECRET_KEY (mode 0600)
└── .first_run_password         # one-time password, mode 0600 (delete after first login)
```

### Inspect the volume

```bash
docker volume ls | grep scc-data
docker volume inspect <project>_scc-data      # full path under /var/lib/docker/volumes/…
```

### Snapshot / restore

The simplest reliable backup is a `tar` of the volume mount:

```bash
# On the VM
docker run --rm \
  -v <project>_scc-data:/data:ro \
  -v $(pwd):/backup \
  alpine tar czf /backup/scc-data-$(date +%F).tgz -C /data .

# Restore (DANGER — overwrites live data; stop the service first)
docker compose stop api
docker run --rm \
  -v <project>_scc-data:/data \
  -v $(pwd):/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/scc-data-YYYY-MM-DD.tgz -C /data"
docker compose start api
```

Or use Coolify's **Scheduled Backup** add-on (one of the community backup destinations works well with Docker volumes). Either way, schedule it nightly — `app.db` plus `exports/` is enough to recover everything.

---

## 7. Upgrade

Coolify redeploys **in place** by default — it pulls the latest image, recreates the container, and re-mounts the existing `scc-data` volume. Your data and the auto-generated `SCC_SECRET_KEY` (persisted at `/app/webapp/data/.jwt_secret`) survive redeploys.

To upgrade:

1. Bump / pull the new code (`git push` to your repo, or change the tracked branch in Coolify).
2. In Coolify → **Service → Deploy** → click **Redeploy**. (Or rely on Coolify's webhook from your GitHub branch.)
3. Watch the build log. The new image will:
   - Re-`npm ci` and rebuild the Vite frontend.
   - `uv sync --all-extras` for the new Python deps.
   - (Idempotent) re-run `playwright install --with-deps chromium`.
4. Once the healthcheck passes (`curl https://scrapling.yourdomain.com/api/health` returns `{"status":"ok"}`), your upgrade is live.

> **Secret persistence**: as long as you don't delete the `scc-data` volume, the JWT signing key in `.jwt_secret` persists. **All existing JWTs remain valid across upgrades**. If you *do* want to invalidate every session (e.g. after a suspected leak), `docker exec … rm /app/webapp/data/.jwt_secret` and restart — a new key is generated and everyone has to log in again.

For breaking schema changes (rare), see **Migrations** in the operator notes; SQL migrations in `webapp/api/migrations/` are auto-applied at startup.

---

## 8. Image build & supply-chain notes

The deploy image (`webapp/Dockerfile.api`) is hardened for Coolify:

- **Pinned bases** — `node:20.18-slim` (frontend build), `python:3.12.7-slim-bookworm` (runtime), `ghcr.io/astral-sh/uv:0.6.14` (never `:latest`), `cloudflare/cloudflared:2024.10.0` in the tunnel overlay.
- **Reproducible Python deps** — `uv sync --frozen` fails fast if `uv.lock` is missing/stale. After changing dependencies run `uv lock` and commit the updated `uv.lock` before redeploying.
- **Non-root** — `appuser` (uid `1000`), `HOME=/home/appuser`, browsers in `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`; `.jwt_secret` / `.first_run_password` / `.secret_key` and `data/{crawls,exports,dev_cache}` are excluded via `.dockerignore` and never baked into the image.
- **Runtime tuning** — `tini` as PID 1; `uvicorn --workers 2 --limit-concurrency 100 --timeout-graceful-shutdown 30` sized for the compose `2 CPU / 3 GB` limits; `HEALTHCHECK` with a `30s` start period (compose gives it `60s`).
- **CI gate** — every PR builds the API image (no push) and runs **Trivy**, failing on `HIGH,CRITICAL` findings (see `.github/workflows/docker-build.yml`, `pr-build-scan` job; SARIF uploaded to the Security tab).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| **White page** at `https://scrapling.yourdomain.com/` | Frontend `dist/` wasn't built into the image, or Traefik routes are wrong. | Check build logs for the `webbuild` stage — should end with `vite build` → `dist/`. Verify in the **Service → FQDN** panel that the path `/` routes to `api:8000`. |
| **CORS error** in the JS console ("blocked by CORS policy") | `SCC_CORS_ORIGINS` doesn't match the URL you opened. | Set `SCC_CORS_ORIGINS=https://scrapling.yourdomain.com` (no trailing slash). Restart the service. |
| **`curl https://scrapling.yourdomain.com/api/health` returns 404 / connection refused** | FQDN not set, or Traefik can't reach the container. | In Coolify, confirm **Service → FQDN** is set and shows a valid Let's Encrypt cert. Verify `docker ps` shows the container as **healthy**. |
| **502 Bad Gateway** from Traefik | Container is starting up, or crashed. | Check `Coolify → Service → Logs`. If the container keeps restarting, check disk (`df -h /`) — Chromium install needs ~500 MB free. |
| **Login fails with "Unauthorized"** even with the right password | JWT secret was rotated (e.g. volume was deleted). | Check `/app/webapp/data/.jwt_secret` exists in the volume. If you genuinely rotated, ask all users to log in again. |
| **MCP start does nothing** | `SCC_MCP_ENABLED` is `false` (or not set). | Set `SCC_MCP_ENABLED=true` in env and redeploy. |
| **First-run password lost** | You didn't set `SCC_ADMIN_PASSWORD` and missed the one-time hint. | Either: reset the admin by deleting the volume (data loss!), or SSH into the VM and `docker exec -it <api-container> cat /app/webapp/data/.first_run_password` if it's still there. Set `SCC_ADMIN_PASSWORD` going forward. |
| **Cloudflare Tunnel says "connection refused"** | `cloudflared` can't reach `api:8000`, or the FQDN in Cloudflare doesn't match. | In the VM: `docker exec -it <cloudflared> cloudflared tunnel info scrapling`. If it can't resolve `api`, name the service correctly in the tunnel ingress (check `docker network ls`). |
| **Browser-based engines fail with "no chromium"** | Playwright browser wasn't installed (older image). | SSH into the VM: `docker exec -it <api> bash -lc 'uv run playwright install --with-deps chromium'`. Or redeploy — newer images install it at build time. |
| **Out of disk** | Crawl results and exports piling up. | `docker exec -it <api> bash -lc 'rm -rf /app/webapp/data/crawls/* /app/webapp/data/exports/*'` (keep `app.db`). Or delete old runs from the UI. |
| **"Page Action" snippets won't run** | Engine is `static` (no browser). | Switch the Fetch / Job to `dynamic` or `stealth` — `page_action` only runs inside a real browser. |

Still stuck? See `webapp/docs/USER_GUIDE.md` (Troubleshooting section) or open an issue on GitHub with the relevant `docker logs` snippet.