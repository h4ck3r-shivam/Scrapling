#!/usr/bin/env python3
"""
gen_endpoints_doc.py — Generate a Markdown endpoint reference from a running
Scrapling Control Center server's OpenAPI spec.

Connects to the SCC instance at $SCC_URL (default: http://localhost:8000),
fetches /openapi.json, groups endpoints by OpenAPI tag, and writes a Markdown
table per tag to webapp/docs/api/ENDPOINTS.md.

Usage:
    python webapp/scripts/gen_endpoints_doc.py
    SCC_URL=https://scrapling.example.com python webapp/scripts/gen_endpoints_doc.py
    python webapp/scripts/gen_endpoints_doc.py --output /tmp/endpoints.md
    python webapp/scripts/gen_endpoints_doc.py --help

Requires Python 3.10+ and the `urllib` standard library only (no extra deps).
"""

from __future__ import annotations

import argparse
import json as json_lib
import sys
import urllib.error
import urllib.request
from collections import OrderedDict
from pathlib import Path
from typing import Any

# Where this file lives: .../webapp/scripts/gen_endpoints_doc.py
SCRIPT_DIR = Path(__file__).resolve().parent
WEBAPP_DIR = SCRIPT_DIR.parent
DEFAULT_OUTPUT = WEBAPP_DIR / "docs" / "api" / "ENDPOINTS.md"
DEFAULT_URL = "http://localhost:8000"

# Tag display order — the categories the SCC UI exposes.
# Anything missing falls into "Other" and is rendered at the end.
TAG_ORDER: list[str] = [
    "auth",
    "users",
    "api-keys",
    "fetch",
    "parse",
    "parse-helpers",
    "selectors",
    "proxies",
    "sessions",
    "jobs",
    "runs",
    "exports",
    "system",
    "shell",
    "audit",
    "websocket",
    "health",
]


def fetch_openapi(base_url: str, timeout: float = 30.0) -> dict[str, Any]:
    """Fetch /openapi.json from a running SCC server."""
    url = base_url.rstrip("/") + "/openapi.json"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = resp.read().decode("utf-8")
    except urllib.error.URLError as exc:
        raise SystemExit(
            f"Could not fetch {url}: {exc}\n"
            f"Is the SCC server running and reachable at SCC_URL={base_url}?"
        ) from exc
    try:
        return json_lib.loads(payload)
    except json_lib.JSONDecodeError as exc:
        raise SystemExit(f"Server returned invalid JSON from {url}: {exc}") from exc


def _params_for(method_obj: dict[str, Any]) -> list[dict[str, Any]]:
    """Flatten path + query parameters for an operation."""
    params: list[dict[str, Any]] = []
    for p in method_obj.get("parameters", []):
        if p.get("in") in ("path", "query"):
            params.append(p)
    return params


def _summarize_response(method_obj: dict[str, Any]) -> str:
    """Return a short human-readable summary of the success response."""
    responses = method_obj.get("responses") or {}
    for code in ("200", "201", "202", "204"):
        r = responses.get(code)
        if not r:
            continue
        desc = (r.get("description") or "").strip()
        if desc:
            return f"{code} — {desc}"
        return code
    if responses:
        first_code, first_resp = next(iter(responses.items()))
        desc = (first_resp.get("description") or "").strip()
        return f"{first_code}{' — ' + desc if desc else ''}"
    return ""


def _format_params(params: list[dict[str, Any]]) -> str:
    """Render params as a compact list, e.g. `path: run_id, query: q, format`."""
    if not params:
        return "—"
    parts: list[str] = []
    for p in params:
        required = " (required)" if p.get("required") else ""
        parts.append(f"{p.get('in', '?')}: `{p.get('name')}`{required}")
    return "<br>".join(parts)


def _summary_or_doc(method_obj: dict[str, Any]) -> str:
    """Operation summary, falling back to first non-empty line of its description."""
    summary = (method_obj.get("summary") or "").strip()
    if summary:
        return summary
    desc = (method_obj.get("description") or "").strip()
    if desc:
        # Take the first paragraph / line.
        first = desc.splitlines()[0].strip()
        return first or "—"
    return "—"


def _escape_pipe(text: str) -> str:
    """Escape `|` for Markdown table cells."""
    return text.replace("|", "\\|").replace("\n", " ").strip()


def render_markdown(
    spec: dict[str, Any],
    base_url: str,
    group: str = "Scrapling Control Center",
) -> str:
    """Build the full Markdown document."""
    title = spec.get("info", {}).get("title", "Scrapling Control Center")
    version = spec.get("info", {}).get("version", "")
    description = (spec.get("info", {}).get("description") or "").strip()

    paths: dict[str, Any] = spec.get("paths") or {}
    # Group operations: tag -> list of (method, path, op)
    grouped: "OrderedDict[str, list[tuple[str, str, dict[str, Any]]]]" = OrderedDict()
    for path, methods in paths.items():
        if not isinstance(methods, dict):
            continue
        for http_method, op in methods.items():
            if http_method.lower() not in {"get", "post", "put", "patch", "delete", "head", "options"}:
                continue
            if not isinstance(op, dict):
                continue
            tags = op.get("tags") or ["other"]
            for tag in tags:
                grouped.setdefault(tag, []).append((http_method.upper(), path, op))

    # Sort groups by TAG_ORDER, then anything not in the list at the end (alphabetical).
    def sort_key(tag: str) -> tuple[int, str]:
        try:
            return (TAG_ORDER.index(tag), "")
        except ValueError:
            return (len(TAG_ORDER), tag)

    sorted_tags = sorted(grouped.keys(), key=sort_key)

    lines: list[str] = []
    lines.append(f"# {title} — API endpoints")
    lines.append("")
    lines.append(f"_Auto-generated from `{base_url.rstrip('/')}/openapi.json`_")
    if version:
        lines.append("")
        lines.append(f"**OpenAPI version:** `{version}`")
    if description:
        lines.append("")
        # Only include a brief one-liner; longer docs live elsewhere.
        first_line = description.splitlines()[0].strip()
        if first_line:
            lines.append(first_line)
    lines.append("")
    lines.append(f"**Total endpoints:** {sum(len(v) for v in grouped.values())}")
    lines.append("")
    lines.append("## Contents")
    lines.append("")
    for tag in sorted_tags:
        anchor = tag.lower().replace(" ", "-")
        label = tag.replace("-", " ").title()
        lines.append(f"- [{label}](#{anchor}) ({len(grouped[tag])} endpoints)")
    lines.append("")

    for tag in sorted_tags:
        ops = grouped[tag]
        label = tag.replace("-", " ").title()
        lines.append(f"## {label}")
        lines.append("")
        lines.append("| Method | Path | Summary | Parameters | Success response |")
        lines.append("| --- | --- | --- | --- | --- |")
        # Stable order: by path, then method.
        ops_sorted = sorted(ops, key=lambda t: (t[1], t[0]))
        for method, path, op in ops_sorted:
            params = _format_params(_params_for(op))
            summary = _escape_pipe(_summary_or_doc(op))
            success = _escape_pipe(_summarize_response(op))
            lines.append(
                f"| `{method}` | `{path}` | {summary or '—'} | {params} | {success or '—'} |"
            )
        lines.append("")
        lines.append("<details><summary>Raw operation IDs</summary>")
        lines.append("")
        for method, path, op in ops_sorted:
            op_id = op.get("operationId") or "—"
            lines.append(f"- `{method} {path}` → `{op_id}`")
        lines.append("")
        lines.append("</details>")
        lines.append("")

    # Footer
    lines.append("---")
    lines.append("")
    lines.append(f"_Generated by `webapp/scripts/gen_endpoints_doc.py`. "
                 f"Do not edit by hand — re-run the script after API changes._")
    lines.append("")
    return "\n".join(lines)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="gen_endpoints_doc.py",
        description=(
            "Generate a Markdown endpoint reference from a running SCC server's "
            "OpenAPI spec. Defaults to SCC_URL=http://localhost:8000 and writes to "
            "webapp/docs/api/ENDPOINTS.md."
        ),
    )
    parser.add_argument(
        "--url",
        default=None,
        help=(
            "Base URL of the SCC server. "
            "Overrides the SCC_URL env var. Default: %(default)s or $SCC_URL or http://localhost:8000"
        ),
    )
    parser.add_argument(
        "--output",
        "-o",
        type=str,
        default=None,
        help=(
            "Output Markdown path. "
            f"Default: {DEFAULT_OUTPUT}"
        ),
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        help="HTTP timeout in seconds (default: 30)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the rendered Markdown to stdout instead of writing to disk.",
    )
    parser.add_argument(
        "--print-url",
        action="store_true",
        help="Print the URL we'd fetch from and exit.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    # Resolve base URL with priority: CLI --url > env SCC_URL > default.
    base_url = args.url or _env_url() or DEFAULT_URL

    if args.print_url:
        print(base_url.rstrip("/") + "/openapi.json")
        return 0

    spec = fetch_openapi(base_url, timeout=args.timeout)
    md = render_markdown(spec, base_url=base_url)

    if args.dry_run:
        sys.stdout.write(md)
        if not md.endswith("\n"):
            sys.stdout.write("\n")
        return 0

    output_path = Path(args.output) if args.output else DEFAULT_OUTPUT
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(md, encoding="utf-8")
    print(f"Wrote {len(md.splitlines())} lines to {output_path}")
    return 0


def _env_url() -> str | None:
    import os

    return os.environ.get("SCC_URL") or None


if __name__ == "__main__":
    raise SystemExit(main())