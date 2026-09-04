# Scrapling Control Center — User Guide

A friendly walkthrough for teammates. No scraping jargon — just click-along steps.

> Tip: hover the small **(i)** icon next to almost any field in the app and you'll see a one-line explanation like the ones in this guide.

---

## What this app does

Scrapling Control Center (SCC) is a point-and-click tool that pulls data out of websites for your team. You give it a webpage (or a whole site), tell it what to grab (titles, prices, links, paragraphs), and it does the fetching in the background. You can then download the results as CSV / JSON, or hand them straight to an AI tool. Built-in support for fetching one page at a time, crawling a whole site, parsing HTML with CSS/XPath, exporting the data, and connecting to AI assistants via MCP.

---

## First-time setup (login, change password)

1. Open the app URL your admin gave you (e.g. `https://scrapling.yourdomain.com`). You'll land on the **login page**.
2. **First run only:** the server printed a one-time admin password. Your admin will share it (or paste it into your invite). It's only shown once.
3. Type the email (`admin@example.com` is the default) and paste the password, then click **Sign in**.
4. You'll land on the **Home** dashboard with status cards (jobs, runs, disk, MCP).
5. **Change your password right away:**
   - Click **Users** in the left nav.
   - Find your row, type a new password in the **Reset PW** field, click **Reset PW**.
   - Log out (top-right) and log back in with the new password to confirm.
6. If you created the first account yourself, you are the **admin**. Admins can add teammates: **Users → Create**, type email + password, pick role (admin or member), click **Create**.

---

## Quick start: fetch a single page

Use this when you want to "see what the crawler sees" before saving a full recipe. Great for debugging one tricky URL.

1. Click **Fetch** in the left sidebar.
2. In the **URL** box, paste the page you want to test, e.g. `https://example.com/product/123`. (Must start with `http://` or `https://`.)
3. Leave the **Engine** as `static` for the first try — it's the fastest.
4. (Optional) Tick **Markdown output** if you just want clean text back (good for AI pipelines).
5. Click **Run fetch** at the bottom.
6. Read the response below: **HTML content** is what your selectors will see, **Response headers** show what the site sent back, and **Markdown** (if you asked for it) shows a clean text version.
7. If the page seems empty, switch **Engine** from `static` → `dynamic` (runs JavaScript) or `stealth` (hides that it's a bot) and try again. Add a small `page_action` like `await page.wait_for_timeout(2000)` if the data loads after a delay.

If Fetch can see the data, a Job can too. If it can't, no Job will.

---

## Quick start: crawl a small site

Use this when you want to grab the same kind of info from many pages (every product page, every blog post, etc.).

1. Click **Jobs** in the left sidebar, then click **+ New job** (top right).
2. Type a **Job name** like "Daily product crawl". Only your team sees this.
3. Pick a **Template** to pre-fill smart defaults:
   - `crawl` — walk a site and extract per-page fields (most common).
   - `sitemap` — only crawl the URLs in a `sitemap.xml` (faster when available).
   - `site_to_markdown` — grab a whole docs site as clean Markdown for AI.
   - `custom` — full control from scratch.
4. Paste one **Start URL** per line, e.g. `https://example.com/products`. The crawler will start there and follow links.
5. (Recommended) Set **Max pages** to `10` for your first test. You can raise it later.
6. In **Field mapping**, define what to grab. Example for a product page:
   ```json
   [
     { "name": "title", "steps": [{ "method": "css", "selector": "h1" }] },
     { "name": "price", "steps": [{ "method": "css", "selector": ".price" }] },
     { "name": "url",   "steps": [{ "method": "css", "selector": "link", "attr": "href" }] }
   ]
   ```
7. Pick **Export formats**: `json` and `csv` is a good default.
8. Click **Save**, then on the Job detail page click **Start**.
9. The **Live WS** tab shows progress as the crawler works. When it finishes, the **Results** tab shows what was scraped.
10. Once happy, edit the job and raise **Max pages** to your real target.

---

## Understanding results (the 4 tabs)

After a Job finishes, open it and click into a Run. You'll see four tabs:

| Tab | What's there |
| --- | --- |
| **Results (virtualized)** | A scrollable table of every item the crawler extracted. Even thousands of rows render smoothly. Type in the **Search** box to filter. |
| **Live WS** | A live event log streamed over WebSocket while the run is in progress (items found, pages visited, errors). Watch progress in real time. |
| **Exports** | Downloadable files (CSV / JSON / XML / Markdown zip). Click **Generate**, then **Download**. |
| **Logs** | The full run history — errors, status changes, and the crawler's own log messages. The place to look when something goes wrong. |

Status meanings: **pending** = waiting to start, **running** = in progress, **done** = finished OK, **failed** = something broke (the **Error** column tells you why in plain words).

---

## Exporting data (CSV, JSON, XML)

Once a Run finishes, you can take the data out of the app:

1. Open the **Job** → click the **Run** you want.
2. Open the **Exports** tab.
3. Click **Generate** and pick a format:
   - **JSON** — one object per line, machine-friendly, perfect for AI / APIs.
   - **CSV** — spreadsheet-friendly, opens straight in Excel / Google Sheets.
   - **XML** — when your downstream tool needs XML.
   - **markdown_zip** — a zipped folder of one Markdown file per page (great for docs exports).
4. Wait for the green "ready" badge, then **Download** the file.
5. Repeat for any other formats you need. Each generation creates a new file.

CSV options (delimiter, fields) live in the export request body if you want to script them. JSON is always included by default.

---

## AI integrations (MCP server)

SCC ships a small **MCP** server (port `8017`) so AI editors like Cursor and Claude can call Scrapling tools directly. It's off by default; an admin turns it on.

### For admins — turn it on

1. Set `SCC_MCP_ENABLED=true` in the server's environment (and restart).
2. Open the **AI** page in the sidebar.
3. Click **Start MCP**. You'll get back a `config_hint` snippet.
4. Paste that snippet into your AI editor's MCP settings. Restart the editor if it doesn't pick up the new tool.

### For teammates — what you can do once it's on

- "Fetch this URL and summarize it" — the AI calls the scraper directly.
- "Crawl these 10 pages and extract prices" — the AI drives a Job through MCP.
- "Convert this docs site to Markdown" — the AI uses the site_to_markdown template.

The MCP server uses an auth token it auto-generates. Only paste the config into trusted editors — anyone with the snippet can use your SCC.

---

## Troubleshooting (common errors)

| What you see | What it usually means | Fix |
| --- | --- | --- |
| **"Unauthorized - redirecting to login"** | Your login token expired or got cleared. | Log in again. |
| **"403 Forbidden"** on Users / API Keys / Audit | You're logged in as a **member**, not an admin. | Ask an admin to do it, or to grant you the admin role. |
| **Crawl returns 0 results** | Wrong selector, or the page loads content with JavaScript. | Open **Fetch**, paste the URL, switch engine to **dynamic**, re-test. Copy a working selector from your browser's DevTools (right-click element → Copy selector). |
| **"verify you're human" / Cloudflare wall** | The site blocks bots. | Switch engine to **stealth** and tick **Solve Cloudflare**. Or slow down with **Download delay = 2**. |
| **Run keeps failing with timeout** | Page is slow, or the network is slow. | Raise **Timeout** (Fetch) or **max_blocked_retries** (Jobs). Try a smaller **Max pages** to confirm the site responds at all. |
| **"Disk almost full"** | Crawls / exports are using lots of space. | **System → Disk** shows usage. Delete old Runs from the Job detail page, or clear the `webapp/data/crawls/` and `webapp/data/exports/` folders. |
| **"DeprecationWarning" in the logs** | Cosmetic — usually harmless. | Ignore unless something is actually broken. |
| **White page after deploy** | Frontend `dist/` wasn't built into the image, or Traefik can't reach it. | Check the Docker build logs for the `webbuild` stage; confirm `/api/health` returns OK; verify the FQDN in Coolify points to `api:8000`. |
| **CORS error in browser console** | Frontend origin isn't allowed by the API. | Set `SCC_CORS_ORIGINS` to include the exact URL you're loading the app from (no trailing slash). |
| **Playwright test fails in CI** | Usually a missing browser or env var. | Re-read `webapp-e2e.yml`; make sure all `SCC_*` env vars match what the test expects. |

---

## Glossary

- **Page → URL fetch** — Grabbing one web page by its URL and showing you what the crawler sees. Same as the **Fetch console** in the sidebar.
- **Crawl → many pages** — Walking from a starting URL, clicking links, and visiting lots of pages automatically (respecting `robots.txt` if you ask it to).
- **Job → saved recipe** — A reusable crawl recipe: where to start, what to grab, how polite to be. Save it once, run it many times.
- **Run → one execution** — A single attempt at running a Job. Has its own status (pending / running / done / failed), logs, and result files.
- **Selector → CSS / XPath** — A short query that says "find this thing on the page". CSS examples: `h1`, `.product-title`, `#main > ul li a`. XPath example: `//div[@class='product']//h2`.
- **Attribute → `href`, `src`, …** — Stuff attached to an HTML tag, like the URL in `<a href="…">`. Use `attr: "href"` to grab it.
- **Engine → how we fetch** — *static* = fast HTTP (no JavaScript), *dynamic* = real Chromium browser, *stealth* = bot-resistant browser.
- **Export format** — How the data is delivered: JSON (objects), CSV (spreadsheet rows), XML (tags), or Markdown zip (one `.md` per page).
- **MCP** — Model Context Protocol: a tiny server that lets AI editors call Scrapling as a tool. Lives on port `8017` once started.
- **Audit log** — A permanent record of who did what (login, job.start, user.create, …). Admins only.
- **Proxy** — A relay server that hides your IP. **Proxy group** = several proxies the crawler rotates through automatically.
- **Session** — A "warm" crawler kept open between calls. Cheaper when you're hitting the same site over and over.
- **robots.txt** — A polite file at the top of most sites (`/robots.txt`) that says "you may crawl these parts, not those". Turn on **Respect robots.txt** to follow it.
- **Resume a run** — If a Run supports it, you can pause and continue later without re-visiting pages you've already scraped.
- **First-run hint** — A one-time yellow box on the login page that shows the auto-generated admin password. Dismiss after first login.

Still stuck? Hover the (i) icon next to any field, or check **Help** in the sidebar for context on every screen.