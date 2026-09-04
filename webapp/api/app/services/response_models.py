"""Pydantic response models for every API endpoint.

Centralised so OpenAPI documents the exact shapes, and so the frontend
``src/lib/types.ts`` mirrors one canonical source.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr


class ApiResponse(BaseModel):
    """Generic envelope — extend per-endpoint for typed responses."""
    model_config = ConfigDict(extra="ignore")


class UserPublic(ApiResponse):
    email: str
    role: Literal["admin", "member"]


class UserOut(UserPublic):
    id: int
    is_active: bool
    created_by: str | None = None
    created_at: str


class LoginOut(ApiResponse):
    access_token: str
    user: UserPublic
    # 7d refresh JWT (type=refresh, jti). Present on /auth/login and
    # /auth/refresh; None for legacy tokens minted before refresh support.
    refresh_token: str | None = None


class FirstRunHint(ApiResponse):
    hint: bool
    password: str | None = None


class ApiKeyPublic(ApiResponse):
    id: int
    name: str
    prefix: str
    scopes: list[str]
    last_used_at: str | None = None
    expires_at: str | None = None
    revoked: bool
    created_at: str
    owner: str


class ApiKeyCreated(ApiKeyPublic):
    key: str  # shown exactly once


class FetchResult(ApiResponse):
    status: int
    reason: str
    url: str
    encoding: str
    body_size: int
    request_headers: dict[str, str] = {}
    response_headers: dict[str, str] = {}
    cookies: list[dict] | dict = {}
    meta: dict[str, Any] = {}
    history: list[dict] = []
    html_content: str = ""
    text: str = ""
    markdown: str | None = None
    markdown_error: str | None = None
    pool_stats: dict[str, Any] | None = None
    captured_xhr: list[dict] = []


class BatchFetchResult(ApiResponse):
    results: list[dict]


class ParseStepOut(ApiResponse):
    method: str
    selector: str | None = None
    value: Any = None


class ParseOut(ApiResponse):
    results: list[ParseStepOut]
    tree: list[dict]


class PaginationOut(ApiResponse):
    links: list[str]
    next_page: str | None = None
    strategy: str = "auto"


class SchemasOut(ApiResponse):
    json_ld: list[dict] = []
    microdata: list[dict] = []
    opengraph: dict[str, str] = {}
    twitter_card: dict[str, str] = {}
    meta_data: dict[str, str] = {}
    canonical_url: str | None = None
    has_schema: bool = False
    _missing: list[str] = []


class AnalyzeOut(ApiResponse):
    report: dict[str, Any]


class RegexOut(ApiResponse):
    pattern: str
    sample: list[str]
    flags: int


class ConvertSelectorOut(ApiResponse):
    result: str


class CurlParseOut(ApiResponse):
    method: str
    url: str
    headers: dict[str, str] = {}
    cookies: dict[str, str] = {}
    data_raw: str | None = None
    json_body: Any | None = None


class TextUtilsOut(ApiResponse):
    result: Any


class ShellHelpOut(ApiResponse):
    capabilities: list[str]


class ShellExecOut(ApiResponse):
    valid: bool
    error: str | None = None


class SelectorOut(ApiResponse):
    id: int
    name: str
    target_url: str
    identifier: str | None = None
    selector_spec: dict
    auto_save: bool
    created_at: str


class ProxyOut(ApiResponse):
    id: int
    label: str
    url_or_server: str
    has_auth: bool
    created_at: str


class ProxyGroupOut(ApiResponse):
    id: int
    name: str
    strategy: str
    member_ids: list[int]


class SessionLiveOut(ApiResponse):
    name: str
    kind: str
    pool_stats: dict[str, Any] | None = None


class SessionHistoryRow(ApiResponse):
    id: int
    name: str
    kind: str
    state: str
    created_at: str
    spec_json: str | None = None
    pool_stats_json: str | None = None


class SessionDetailOut(SessionHistoryRow):
    spec_json: str
    pool_stats_json: str | None = None


class JobOut(ApiResponse):
    id: int
    name: str
    kind: str
    engine: str
    template: str
    spec_json: str
    spec_json_obj: dict[str, Any]
    schedule_cron: str | None = None
    created_by: str | None = None
    created_at: str
    updated_at: str
    running: bool = False


class JobRunOut(ApiResponse):
    id: int
    job_id: int
    job_name: str | None = None
    status: str
    started_at: str | None = None
    ended_at: str | None = None
    stats_json: str | None = None
    error: str | None = None
    crawldir: str | None = None
    resumable: bool = False
    items_count: int = 0
    files: list[dict] = []


class ResultsOut(ApiResponse):
    total: int
    items: list[dict]


class ExportOut(ApiResponse):
    format: str
    path: str
    items: int
    download_url: str


class ScheduleOut(ApiResponse):
    job_id: int
    schedule_cron: str | None = None
    next_run_at: str | None = None


class SystemInfoOut(ApiResponse):
    scrapling_version: str
    app: str
    python_bin: str
    data_dir: str
    max_concurrent_jobs: int
    mcp_enabled: bool
    dependencies_installed: bool
    curl_cffi: str | None = None
    version: str
    uptime_seconds: float


class DiskOut(ApiResponse):
    exports_bytes: int
    crawls_bytes: int
    dev_cache_bytes: int
    adaptive_db_bytes: int
    db_bytes: int


class McpStartOut(ApiResponse):
    name: str
    url: str
    token: str
    config_hint: dict[str, Any]


class McpListOut(ApiResponse):
    processes: list[dict[str, Any]]


class AuditRowOut(ApiResponse):
    id: int
    actor: str
    action: str
    target: str
    detail_json: str | None = None
    at: str


class Ok(ApiResponse):
    ok: bool = True


class Id(ApiResponse):
    id: int


class MagicMapsOut(ApiResponse):
    id: int
    job_id: int
    maps_url: str
    run_id: int | None = None