"""Pydantic specs mirroring EVERY scrapling parameter.

Parity is enforced by webapp/tests/test_spec_parity.py which compares this
module against the live scrapling TypedDicts — if upstream adds/renames an
option, tests fail and you know to update here first.
"""
from __future__ import annotations

from typing import Any, Literal, Union

from curl_cffi.requests import BrowserTypeLiteral
from pydantic import BaseModel, ConfigDict, Field, field_validator

# ---------------------------------------------------------------- literals
ImpersonateTarget = BrowserTypeLiteral
SelectorWaitState = Literal["attached", "detached", "hidden", "visible"]
WaitSelectorState = SelectorWaitState
FollowRedirects = Union[bool, Literal["safe", "all", "obeycode", "firstonly"]]
EngineKind = Literal["static", "dynamic", "stealth"]
ProxyStrategy = Literal["cyclic_rotation", "random"]
JobKind = Literal["fetch", "crawl"]

IMPERSONATE_TARGETS: list[str] = list(BrowserTypeLiteral.__args__)  # type: ignore[attr-defined]

STEALTH_ONLY_FIELDS = {"allow_webgl", "hide_canvas", "block_webrtc", "solve_cloudflare"}
FETCH_ONLY_FIELDS = {
    "wait_selector_state", "page_setup",
    # per-call overrides that exist on fetch params but not on session ctor:
    "proxy",  # session-level proxy handled at session level; fetch override allowed too
}


def _optional_model(model: type[BaseModel]) -> Any:
    return model | None


class KVItem(BaseModel):
    key: str
    value: str


# ---------------------------------------------------------------- parser (D)
class ParserConfig(BaseModel):
    """Mirrors scrapling.parser.Selector constructor = selector_config dict."""
    model_config = ConfigDict(extra="forbid")

    adaptive: bool = False
    huge_tree: bool = True
    keep_comments: bool = False
    keep_cdata: bool = False
    url: str = ""
    encoding: str = "utf-8"
    adaptive_domain: str = ""
    # storage_args pinned server-side (webapp/data/elements_storage.db)


class CookieParam(BaseModel):
    """Playwright SetCookieParam."""
    name: str
    value: str
    url: str | None = None
    domain: str | None = None
    path: str | None = None
    expires: float | None = None
    http_only: bool = Field(False, alias="httpOnly")
    secure: bool = False
    same_site: Literal["Strict", "Lax", "None"] | None = Field(None, alias="sameSite")
    partition_key: str | None = Field(None, alias="partitionKey")
    model_config = ConfigDict(populate_by_name=True)


class BasicAuth(BaseModel):
    username: str
    password: str


class ProxySpecModel(BaseModel):
    """str URL or structured {server, username, password}."""
    model_config = ConfigDict(extra="forbid")

    server: str | None = None
    username: str | None = None
    password: str | None = None

    def to_proxy_value(self) -> str | dict:
        if self.username or self.password:
            return {"server": self.server or "", "username": self.username, "password": self.password}
        return self.server or ""


class ProxyGroupRef(BaseModel):
    """Reference to a proxy group entity (resolved server-side to ProxyRotator)."""
    group_id: int


# ---------------------------------------------------------------- static (A)
class StaticEngineConfig(BaseModel):
    """Mirrors RequestsSession TypedDict (FetcherSession ctor + per-call params).

    timeout is SECONDS. proxy_rotator resolved from proxy_group_id.
    """
    model_config = ConfigDict(extra="forbid")

    impersonate: ImpersonateTarget | list[ImpersonateTarget] | None = "chrome"
    http3: bool = False
    stealthy_headers: bool = True
    timeout: float | None = 30
    headers: dict[str, str] | None = None
    retries: int = Field(3, ge=1)
    retry_delay: float = 1
    follow_redirects: FollowRedirects = "safe"
    max_redirects: int = 30
    verify: bool = True
    cert: str | None = None
    cert_key: str | None = None
    proxies: dict[str, str] | None = None
    proxy: str | None = None
    proxy_auth: BasicAuth | None = None
    proxy_group_id: int | None = None  # -> ProxyRotator via group
    selector_config: ParserConfig | None = None

    def session_kwargs(self) -> dict:
        d = self.model_dump(exclude_none=True, exclude={
            "proxy_group_id", "cert_key", "proxies", "selector_config"})
        if self.cert and self.cert_key:
            d["cert"] = (self.cert, self.cert_key)
        if self.selector_config:
            sc = self.selector_config.model_dump(exclude_none=True)
            if not self.selector_config.adaptive_domain:
                sc.pop("adaptive_domain", None)
            d["selector_config"] = {k: v for k, v in sc.items() if v not in (None, "")} or {}
        return d


# ---------------------------------------------------------------- browser (C)
class BrowserEngineConfig(BaseModel):
    """Mirrors PlaywrightSession TypedDict exactly. timeout in MS, wait in seconds."""
    model_config = ConfigDict(extra="forbid")

    max_pages: int = Field(1, ge=1, le=50)
    headless: bool = True
    disable_resources: bool = False
    network_idle: bool = False
    load_dom: bool = True
    wait_selector: str | None = None
    wait_selector_state: WaitSelectorState = "attached"
    cookies: list[CookieParam] | None = None
    google_search: bool = True
    wait: float = 0
    timezone_id: str | None = None
    page_action: str | None = None       # action-builder DSL or python code (admin)
    page_setup: str | None = None        # admin-only raw code
    proxy: ProxySpecModel | None = None
    proxy_group_id: int | None = None
    extra_headers: dict[str, str] | None = None
    timeout: float = 30000               # ms
    init_script: str | None = None       # absolute path validated server-side
    user_data_dir: str = ""
    selector_config: ParserConfig | None = None
    additional_args: dict[str, Any] | None = None
    locale: str | None = None
    real_chrome: bool = False
    cdp_url: str | None = None
    useragent: str | None = None
    extra_flags: list[str] | None = None
    blocked_domains: list[str] | None = None
    block_ads: bool = False
    retries: int = Field(3, ge=1, le=10)
    retry_delay: float = 1
    capture_xhr: str | None = None
    executable_path: str | None = None
    dns_over_https: bool = False

    # stealth-only (validated at runtime by engine kind)
    allow_webgl: bool = True
    hide_canvas: bool = False
    block_webrtc: bool = False
    solve_cloudflare: bool = False

    def session_kwargs(self, kind: EngineKind = "dynamic") -> dict:
        stealth_extras = STEALTH_ONLY_FIELDS if kind != "stealth" else set()
        d = self.model_dump(exclude_none=True, exclude={
            "proxy", "proxy_group_id", "selector_config", *stealth_extras,
        })
        if self.proxy:
            d["proxy"] = self.proxy.to_proxy_value()
        if self.selector_config:
            sc = self.selector_config.model_dump(exclude_none=True)
            sc.pop("adaptive_domain") if not self.selector_config.adaptive_domain else None
            d["selector_config"] = {k: v for k, v in sc.items() if v not in (None, "")} or {}
        return d


# ---------------------------------------------------------------- fetch request
class FetchRequestSpec(BaseModel):
    url: str
    method: Literal["GET", "POST", "PUT", "DELETE"] = "GET"
    engine: EngineKind = "static"

    # --- per-call overrides (PlaywrightFetchParams / StealthFetchParams subset)
    load_dom: bool | None = None
    wait: float | None = None
    network_idle: bool | None = None
    google_search: bool | None = None
    timeout: float | None = None          # ms for browsers; seconds for static
    disable_resources: bool | None = None
    wait_selector: str | None = None
    wait_selector_state: WaitSelectorState | None = None
    page_action: str | None = None
    page_setup: str | None = None
    selector_config: ParserConfig | None = None
    extra_headers: dict[str, str] | None = None
    blocked_domains: list[str] | None = None
    solve_cloudflare: bool | None = None
    proxy_override: str | ProxySpecModel | None = Field(None, alias="proxy")  # per-call browser proxy

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    @field_validator("proxy_override", mode="before")
    @classmethod
    def _coerce_proxy_str(cls, v):
        # Frontend sends a plain string (e.g. "http://user:pass@host:8080");
        # coerce to structured model so downstream .to_proxy_value() works.
        if v is None or isinstance(v, ProxySpecModel):
            return v
        if isinstance(v, str):
            s = v.strip()
            return None if not s else ProxySpecModel(server=s)
        if isinstance(v, dict):
            return v
        return v

    @field_validator("cookies_kv", mode="before")
    @classmethod
    def _coerce_cookies_name_value(cls, v):
        # Accept both [{key,value}] (KVItem) and [{name,value}] (Playwright-style).
        if not isinstance(v, list):
            return v
        out = []
        for c in v:
            if not isinstance(c, dict):
                out.append(c)
                continue
            if "key" in c or "name" in c:
                out.append({"key": c.get("key", c.get("name")), "value": c.get("value")})
            else:
                out.append(c)
        return out

    # --- static-only per-call (GetRequestParams / DataRequestParams)
    params: dict[str, str] | None = None
    cookies_kv: list[KVItem] | None = Field(None, alias="cookies")  # static GET cookies
    auth: BasicAuth | None = None
    data_raw: str | None = Field(None, alias="data")
    json_body: dict | list | None = Field(None, alias="json")

    # --- output options
    markdown_output: bool = False
    main_content_only: bool = True
    css_selector: str | None = None


class SessionOpenSpec(BaseModel):
    name: str
    kind: EngineKind
    static_config: StaticEngineConfig | None = None
    dynamic_config: BrowserEngineConfig | None = None
    stealth_config: BrowserEngineConfig | None = None


# ---------------------------------------------------------------- spiders (F)
class SpiderSettingsSpec(BaseModel):
    """Mirrors EVERY Spider class attribute (spiders/spider.py)."""
    model_config = ConfigDict(extra="forbid")

    start_urls: list[str] = []
    allowed_domains: list[str] = []
    robots_txt_obey: bool = False
    development_mode: bool = False
    development_cache_dir: str | None = None
    concurrent_requests: int = Field(4, ge=1)
    concurrent_requests_per_domain: int = Field(0, ge=0)
    download_delay: float = 0.0
    max_blocked_retries: int = Field(3, ge=0)
    autothrottle_enabled: bool = False
    autothrottle_start_delay: float = 5.0
    autothrottle_max_delay: float = 60.0
    autothrottle_target_concurrency: float | None = None
    autothrottle_block_backoff: bool = True
    fp_include_kwargs: bool = False
    fp_keep_fragments: bool = False
    fp_include_headers: bool = False
    logging_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "DEBUG"
    logging_format: str = "[%(asctime)s]:({spider_name}) %(levelname)s: %(message)s"
    logging_date_format: str = "%Y-%m-%d %H:%M:%S"
    log_file: str | None = None
    crawldir: str | None = None          # enables checkpointing
    checkpoint_interval: float = 300.0


# ---------------------------------------------------------------- templates (G)
class LinkExtractorSpec(BaseModel):
    allow: list[str] = []
    deny: list[str] = []
    allow_domains: list[str] = []
    deny_domains: list[str] = []
    restrict_css: list[str] = []
    restrict_xpath: list[str] = []
    tags: tuple[str, ...] = ("a", "area")
    attrs: tuple[str, ...] = ("href",)
    canonicalize: bool = True
    strip: bool = True
    keep_fragment: bool = False
    deny_extensions: list[str] | None = None

    def build(self):
        from scrapling.spiders import LinkExtractor
        kwargs = self.model_dump()
        if kwargs["deny_extensions"] is None:
            kwargs.pop("deny_extensions")
        return LinkExtractor(**kwargs)


class CrawlRuleSpec(BaseModel):
    link_extractor: LinkExtractorSpec = LinkExtractorSpec()
    priority: int | None = None
    # callback/process_request are provided by the generated spider class


class ExtractionStep(BaseModel):
    """One visual-extractor step (playground pipeline unit)."""
    method: Literal[
        "css", "xpath", "find_all", "find_by_text", "find_by_regex",
        "find_similar", "re", "get_all_text", "attrib_get", "json",
    ]
    selector: str | None = None
    attr: str | None = None              # for css/xpath ::text/::attr() handled by user; attrib_get uses this
    first_only: bool = False
    # adaptive knobs
    identifier: str | None = None
    percentage: int = Field(40, ge=1, le=100)
    auto_save: bool = False
    adaptive: bool = False
    # find_by_text / find_by_regex / re / get_all_text options
    partial: bool = False
    case_sensitive: bool = True
    similarity_threshold: float = Field(0.2, ge=0.0, le=1.0)


class FieldMapping(BaseModel):
    """A single output field for generated spiders."""
    name: str
    steps: list[ExtractionStep]


class CustomTemplateConfig(BaseModel):
    fields: list[FieldMapping]
    follow_links: bool = False
    link_extractor: LinkExtractorSpec | None = None
    priority: int | None = None
    max_pages: int = 0


class ShopifyTemplateConfig(BaseModel):
    target_website: str = ""
    start_urls: list[str] = []
    allowed_domains: list[str] = []
    collections_url: str | None = None
    products_url: str | None = None
    product_url: str | None = None
    include_fields: list[str] | None = None  # subset of variant keys; None = all


class SitemapTemplateConfig(BaseModel):
    sitemap_urls: list[str]
    sitemap_alternate_links: bool = False
    sitemap_follow: LinkExtractorSpec | None = None
    fields: list[FieldMapping] = []


class FeedTemplateConfig(BaseModel):
    itertag: str = "item"
    namespaces: list[tuple[str, str]] = []
    delimiter: str = ","
    quotechar: str = '"'
    headers: list[str] | None = None
    feed_kind: Literal["xml", "csv"] = "xml"
    fields: list[FieldMapping] = []


class MarkdownSiteTemplateConfig(BaseModel):
    allowed_domains: list[str]
    css_selector: str | None = None
    main_content_only: bool = True
    max_pages: int = Field(0, ge=0)


class GoogleMapsTemplateConfig(BaseModel):
    """Config for the `googlemaps` template (POST /api/magic/maps)."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    target_query: str = ""
    location: str | None = None
    max_scrolls: int = Field(20, ge=1)
    max_results: int = Field(50, ge=1, le=500)
    fields: list[str] = ["name", "phone", "address", "website", "emails", "rating"]
    enrich_website: bool = Field(default=True, alias="enrich_websites")


TemplateConfigUnion = Union[
    CustomTemplateConfig, ShopifyTemplateConfig, SitemapTemplateConfig,
    FeedTemplateConfig, MarkdownSiteTemplateConfig, GoogleMapsTemplateConfig,
]

# --- 7 template types parity map (single source of truth for tests) ---
# Each literal in JobSpec.template maps to a config class. `custom` and `crawl`
# share CustomTemplateConfig; `xml_feed`/`csv_feed` share FeedTemplateConfig
# (discriminated by FeedTemplateConfig.feed_kind). This map is checked by
# test_spec_parity.test_job_spec_covers_all_templates.
ALL_TEMPLATES: set[str] = {"custom", "crawl", "sitemap", "xml_feed", "csv_feed", "shopify", "site_to_markdown", "googlemaps"}
TEMPLATE_TO_CONFIG: dict[str, type[BaseModel]] = {
    "custom": CustomTemplateConfig,
    "crawl": CustomTemplateConfig,
    "sitemap": SitemapTemplateConfig,
    "xml_feed": FeedTemplateConfig,
    "csv_feed": FeedTemplateConfig,
    "shopify": ShopifyTemplateConfig,
    "site_to_markdown": MarkdownSiteTemplateConfig,
    "googlemaps": GoogleMapsTemplateConfig,
}


class JobSpec(BaseModel):
    """Full declarative job definition stored in jobs.spec_json."""
    model_config = ConfigDict(extra="forbid")

    template: Literal["custom", "crawl", "sitemap", "xml_feed", "csv_feed", "shopify", "site_to_markdown", "googlemaps"]
    settings: SpiderSettingsSpec
    engine: EngineKind = "static"
    session_static: StaticEngineConfig | None = None
    session_browser: BrowserEngineConfig | None = None
    stealth_options_used: bool = False
    template_config: dict = {}
    export_formats: list[Literal["json", "jsonl", "csv", "xml"]] = []