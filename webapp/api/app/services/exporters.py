"""Result exporters using scrapling's ItemList methods + markdown bundle."""
from __future__ import annotations

import json
import zipfile
from pathlib import Path

from ..config import settings
from ..database import db


def _item_list(items: list[dict]):
    from scrapling.spiders.result import ItemList
    return ItemList(items)


def _confined_run_dir(run_id: int) -> Path:
    """P0: run export dir is derived from an int only, confined under exports_dir."""
    from .guards import validate_path as _validate_path

    # run_id is int-typed by callers; reject anything else fail-closed.
    try:
        rid = int(run_id)
    except (TypeError, ValueError):
        raise ValueError(f"Invalid run_id: {run_id!r}")
    if rid < 0:
        raise ValueError(f"Invalid run_id: {run_id!r}")
    # Relative-to-data_dir form keeps validate_path's invariant
    # (reject absolute, resolve().is_relative_to(data_dir)).
    try:
        data_resolved = settings.data_dir.resolve()
        exports_resolved = settings.exports_dir.resolve()
        rel = exports_resolved.relative_to(data_resolved)
    except Exception:
        rel = Path("exports")
    out_dir = _validate_path(Path(rel) / f"run_{rid}")
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir


async def export_run(run_id: int, fmt: str, fields: list[str] | None = None,
                     delimiter: str = ",", indent: bool = True,
                     root_tag: str = "items", item_tag: str = "item") -> dict:
    rows = await db.fetch_all("SELECT item_json FROM results WHERE run_id=? ORDER BY idx", (run_id,))
    items = [json.loads(r["item_json"]) for r in rows]
    out_dir = _confined_run_dir(run_id)
    # P0: fmt allowlist — prevents path injection via crafted format strings
    # (e.g. fmt="../../etc/passwd").
    if fmt not in ("json", "jsonl", "csv", "xml"):
        raise ValueError(f"Unsupported format: {fmt}")
    path = out_dir / f"run_{int(run_id)}.{fmt}"
    il = _item_list(items)
    if fmt == "json":
        il.to_json(path, indent=indent)
    elif fmt == "jsonl":
        il.to_jsonl(path)
    elif fmt == "csv":
        il.to_csv(path, fields=fields, delimiter=delimiter)
    elif fmt == "xml":
        il.to_xml(path, root_tag=root_tag, item_tag=item_tag, indent=indent)
    else:
        raise ValueError(f"Unsupported format: {fmt}")
    await db.execute(
        "INSERT INTO result_files (run_id, format, path) VALUES (?,?,?)",
        (run_id, fmt, str(path)))
    return {"format": fmt, "path": str(path), "items": len(items),
            "download_url": f"/api/exports/download/{run_id}/{fmt}"}


async def export_markdown_bundle(run_id: int) -> dict:
    """Zip all .md files written by a SiteToMarkdownSpider run."""
    from .guards import slugify_job_name, validate_path as _validate_path2

    run = await db.fetch_one("SELECT * FROM job_runs WHERE id=?", (run_id,))
    if not run:
        raise FileNotFoundError(f"Run {run_id} not found")
    job = await db.fetch_one("SELECT * FROM jobs WHERE id=?", (run["job_id"],))
    if not job:
        raise FileNotFoundError(f"Job for run {run_id} not found")
    # P0: job["name"] is user-controlled — slugify so ../../ escapes cannot
    # reach outside exports/markdown.
    safe_name = slugify_job_name(job["name"])
    try:
        data_resolved = settings.data_dir.resolve()
        exports_resolved = settings.exports_dir.resolve()
        rel_base = exports_resolved.relative_to(data_resolved)
    except Exception:
        rel_base = Path("exports")
    md_dir = _validate_path2(Path(rel_base) / "markdown" / safe_name)
    if not md_dir.exists():
        raise FileNotFoundError("No markdown output for this run")
    # Confine the zip walk: only regular .md files inside md_dir.
    out_dir = _confined_run_dir(run_id)
    zip_path = out_dir / f"run_{int(run_id)}_markdown.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(md_dir.rglob("*.md")):
            try:
                resolved = f.resolve()
                resolved.relative_to(md_dir.resolve())
            except ValueError:
                continue  # symlink escape — skip fail-closed
            if not resolved.is_file():
                continue
            zf.write(resolved, resolved.relative_to(md_dir.resolve()))
    await db.execute(
        "INSERT INTO result_files (run_id, format, path) VALUES (?,?,?)",
        (run_id, "markdown_zip", str(zip_path)))
    return {"format": "markdown_zip", "path": str(zip_path),
            "download_url": f"/api/exports/download/{run_id}/markdown_zip"}
