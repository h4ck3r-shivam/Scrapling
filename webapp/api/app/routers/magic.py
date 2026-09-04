"""Magic Maps endpoint — one-shot Google Maps list builder (POST /magic/maps)."""
from __future__ import annotations

import json
from typing import Literal
from urllib.parse import quote_plus

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from ..database import Database, get_db
from ..deps import require_user
from ..services.audit import record_audit
from ..services.response_models import MagicMapsOut
from ..services.spider_factory import validate_job_spec

router = APIRouter(tags=["magic"])

DEFAULT_MAPS_FIELDS = ["name", "phone", "address", "website", "emails", "rating"]


class MagicMapsIn(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    query: str
    location: str | None = None
    max_results: int = Field(50, ge=1, le=500)
    max_scrolls: int = Field(20, ge=1)
    fields: list[str] = Field(default_factory=lambda: list(DEFAULT_MAPS_FIELDS))
    engine: Literal["stealth", "dynamic"] = "stealth"
    enrich_website: bool = True
    # Frontend (Maps.tsx) sends these; accepted for compatibility.
    enrich_websites: bool | None = None
    name: str | None = None


@router.post("/magic/maps", response_model=MagicMapsOut)
async def create_maps_job(
    body: MagicMapsIn,
    start: bool = False,
    user: dict = Depends(require_user),
    db: Database = Depends(get_db),
):
    query = (body.query or "").strip()
    if not query:
        raise HTTPException(422, "query must not be empty")
    if not 1 <= body.max_results <= 500:
        raise HTTPException(422, "max_results must be 1-500")
    location = (body.location or "").strip() or None
    enrich = body.enrich_websites if body.enrich_websites is not None else body.enrich_website

    search_text = query if not location else f"{query} {location}"
    maps_url = f"https://www.google.com/maps/search/{quote_plus(search_text)}"

    job_name = (body.name or "").strip() or f"Maps - {query} - {location or ''}".rstrip(" -").strip() or f"Maps - {query}"

    spec_dict = {
        "template": "googlemaps",
        "engine": body.engine,
        "settings": {
            "start_urls": [maps_url],
            "allowed_domains": ["google.com"],
            "concurrent_requests": 2,
            "download_delay": 1,
        },
        "template_config": {
            "target_query": query,
            "location": location,
            "max_scrolls": body.max_scrolls,
            "max_results": body.max_results,
            "fields": body.fields,
            "enrich_website": enrich,
        },
    }
    try:
        spec = validate_job_spec(json.dumps(spec_dict))
    except Exception as e:
        raise HTTPException(422, f"Invalid job spec: {e}")
    try:
        from ..services.guards import slugify_job_name, validate_url

        slugify_job_name(job_name)
        for u in (spec.settings.start_urls or []):
            validate_url(u)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(422, str(e))

    jid = await db.execute(
        "INSERT INTO jobs (name, kind, engine, template, spec_json, created_by) VALUES (?,?,?,?,?,?)",
        (job_name, "crawl", body.engine, "googlemaps", json.dumps(spec_dict), user["email"]),
    )
    await record_audit(db, actor=user["email"], action="job.create", target=job_name)

    run_id: int | None = None
    if start:
        job = await db.fetch_one("SELECT * FROM jobs WHERE id=?", (jid,))
        if not job:
            raise HTTPException(404, "Job not found")
        from ..services.job_runner import runner

        run_id = await runner.start_run(job)
        await record_audit(
            db, actor=user["email"], action="job.start", target=f"{job['name']}#{run_id}"
        )
    return MagicMapsOut(id=jid, job_id=jid, maps_url=maps_url, run_id=run_id)
