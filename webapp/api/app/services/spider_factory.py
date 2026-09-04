"""Builds runtime Spider subclasses from declarative JobSpecs via type().

No scrapling source is modified — we subclass templates and inject parse().
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from .spec import (
    BrowserEngineConfig, CrawlRuleSpec, CustomTemplateConfig, ExtractionStep,
    FeedTemplateConfig, FieldMapping, GoogleMapsTemplateConfig,
    JobSpec, MarkdownSiteTemplateConfig, ShopifyTemplateConfig,
    SitemapTemplateConfig, StaticEngineConfig,
)


def _make_configure_sessions(spec: JobSpec, session_info: dict | None = None):
    """Build a Spider.configure_sessions(self, manager) bound from JobSpec.

    Uses pre-resolved ``session_info`` from ``session_kwargs_for`` when given
    (carries the live proxy rotator); otherwise builds sessions synchronously
    from session_static/session_browser (proxy groups need the async path via
    job_runner, so the sync fallback logs and continues without a rotator).
    """
    def configure_sessions(self, manager):
        from scrapling.fetchers import AsyncDynamicSession, AsyncStealthySession, FetcherSession

        if session_info is not None:
            cls = session_info.get("session_cls") or FetcherSession
            kwargs = dict(session_info.get("kwargs") or {})
            rotator = session_info.get("rotator")
            if rotator is not None:
                kwargs["proxy_rotator"] = rotator
            manager.add("default", cls(**kwargs))
            return
        kind = spec.engine
        if kind == "static":
            cfg = spec.session_static or StaticEngineConfig()
            if cfg.proxy_group_id is not None:
                try:
                    self.logger.warning(
                        "proxy_group_id=%s needs async resolution via job_runner; "
                        "running without rotator", cfg.proxy_group_id)
                except Exception:
                    pass
            manager.add("default", FetcherSession(**cfg.session_kwargs()))
        elif kind == "dynamic":
            cfg = spec.session_browser or BrowserEngineConfig()
            if cfg.proxy_group_id is not None:
                try:
                    self.logger.warning(
                        "proxy_group_id=%s needs async resolution via job_runner; "
                        "running without rotator", cfg.proxy_group_id)
                except Exception:
                    pass
            manager.add("default", AsyncDynamicSession(**cfg.session_kwargs("dynamic")))
        else:  # stealth
            cfg = spec.session_browser or BrowserEngineConfig()
            if cfg.proxy_group_id is not None:
                try:
                    self.logger.warning(
                        "proxy_group_id=%s needs async resolution via job_runner; "
                        "running without rotator", cfg.proxy_group_id)
                except Exception:
                    pass
            manager.add("default", AsyncStealthySession(**cfg.session_kwargs("stealth")))
    return configure_sessions


def _with_max_pages(parse_fn, max_pages: int):
    """Wrap a custom/crawl parse() with a per-spider page cap."""
    if not max_pages:
        return parse_fn

    async def parse(self, response):
        seen = getattr(self, "_scc_pages_seen", 0)
        if seen >= max_pages:
            return
        self._scc_pages_seen = seen + 1
        async for out in parse_fn(self, response):
            yield out
            # For crawl combined parses the follow-Requests are yielded by the
            # inner fn; stop early once the cap is hit.
            if getattr(self, "_scc_pages_seen", 0) >= max_pages:
                # Still drain items from this page, but inner follow loop
                # checks the same counter before yielding more Requests.
                continue
    return parse


def _make_step_runner(step: dict):
    step_obj = ExtractionStep(**step)

    async def run(response):
        el = response
        el = await _apply(el, step_obj)
        return el

    return run


async def _apply(el: Any, step: ExtractionStep) -> Any:
    from .engines import run_extraction_step
    return await run_extraction_step(el, step.model_dump())


def _build_parse(fields: list[FieldMapping], follow_links: bool = False):
    async def parse(self, response):
        item: dict[str, Any] = {}
        for field in fields:
            try:
                element = response
                for step_model in field.steps:
                    element = await _apply(element, step_model)
                value = element
                if isinstance(value, list) and len(value) == 1:
                    value = value[0]
                item[field.name] = value
            except Exception as e:
                self.logger.warning("Field '%s' extraction failed: %s: %s",
                                    field.name, type(e).__name__, e)
                item[field.name] = None
        yield item
    return parse


def _build_crawl_parse(fields: list[FieldMapping], max_pages: int = 0):
    async def parse(self, response):
        if max_pages and getattr(self, "_scc_pages_seen", 0) >= max_pages:
            return
        self._scc_pages_seen = getattr(self, "_scc_pages_seen", 0) + 1
        item: dict[str, Any] = {}
        for field in fields:
            try:
                element = response
                for step_model in field.steps:
                    element = await _apply(element, step_model)
                value = element
                if isinstance(value, list) and len(value) == 1:
                    value = value[0]
                item[field.name] = value
            except Exception as e:
                self.logger.warning("Field '%s' extraction failed: %s", field.name, e)
                item[field.name] = None
        yield item
        # Follow links via rules() so CrawlRule priority is honoured. The cap
        # is re-checked so max_pages stops queueing new Requests.
        if max_pages and getattr(self, "_scc_pages_seen", 0) >= max_pages:
            return
        try:
            rules = self.rules() if callable(getattr(self, "rules", None)) else []
        except Exception:
            rules = []
        for rule in rules:
            try:
                urls = rule.link_extractor.extract(response)
            except Exception:
                continue
            for url in urls:
                try:
                    req = response.follow(url, callback=rule.callback)
                    if rule.priority is not None:
                        req.priority = rule.priority
                    if rule.process_request is not None:
                        req = rule.process_request(req, response)
                    yield req
                except Exception as e:
                    try:
                        self.logger.warning("Follow failed for %r: %s", url, e)
                    except Exception:
                        pass
    return parse


def build_spider_class(spec: JobSpec, job_name: str, _session_info: dict | None = None) -> type:
    """Instantiate the right template subclass with class attrs from settings.

    Engine wiring: every generated class gets ``configure_sessions`` built from
    ``spec.engine`` + ``session_static``/``session_browser`` (via
    :func:`_make_configure_sessions`), so dynamic/stealth jobs no longer fall
    back to the default static session. ``_session_info`` is the pre-resolved
    :func:`session_kwargs_for` dict supplied by job_runner (carries the live
    proxy rotator); when None a synchronous fallback without rotator is used.
    """
    from scrapling.spiders import (
        CrawlSpider, CSVFeedSpider, ShopifySpider, SitemapSpider,
        Spider, SiteToMarkdownSpider, XMLFeedSpider,
    )
    from .guards import slugify_job_name, validate_path, validate_url

    # P0: slugify job.name so directory/class construction cannot traverse
    # (e.g. name="../../etc" would otherwise escape exports/crawls dirs).
    safe_job_name = slugify_job_name(job_name)
    # P0 SSRF: every start_url is DNS-resolved + private-range denied here,
    # fail closed before any crawl launches.
    for u in (spec.settings.start_urls or []):
        validate_url(u)

    s = spec.settings
    common: dict[str, Any] = {
        "name": safe_job_name,
        "start_urls": list(s.start_urls),
        "allowed_domains": set(s.allowed_domains),
        "robots_txt_obey": s.robots_txt_obey,
        "development_mode": s.development_mode,
        "development_cache_dir": s.development_cache_dir,
        "concurrent_requests": s.concurrent_requests,
        "concurrent_requests_per_domain": s.concurrent_requests_per_domain,
        "download_delay": s.download_delay,
        "max_blocked_retries": s.max_blocked_retries,
        "autothrottle_enabled": s.autothrottle_enabled,
        "autothrottle_start_delay": s.autothrottle_start_delay,
        "autothrottle_max_delay": s.autothrottle_max_delay,
        "autothrottle_target_concurrency": s.autothrottle_target_concurrency,
        "autothrottle_block_backoff": s.autothrottle_block_backoff,
        "fp_include_kwargs": s.fp_include_kwargs,
        "fp_keep_fragments": s.fp_keep_fragments,
        "fp_include_headers": s.fp_include_headers,
    }
    import logging as _logging
    common["logging_level"] = getattr(_logging, s.logging_level)
    if s.log_file:
        # P0 path traversal: log_file must stay inside data_dir.
        common["log_file"] = str(validate_path(s.log_file))
    if s.crawldir:
        # Validate early (job_runner re-validates per-run); rejects absolute
        # escapes outside data_dir.
        validate_path(s.crawldir)
    if s.development_cache_dir:
        validate_path(s.development_cache_dir)

    tpl = spec.template
    configure_sessions_fn = _make_configure_sessions(spec, _session_info)

    if tpl == "shopify":
        cfg = ShopifyTemplateConfig(**spec.template_config)
        if cfg.target_website:
            validate_url(cfg.target_website)
        for u in (cfg.start_urls or []):
            validate_url(u)
        attrs = {
            **common,
            "configure_sessions": configure_sessions_fn,
            "target_website": cfg.target_website,
            "start_urls": list(cfg.start_urls) or common["start_urls"],
            "allowed_domains": set(cfg.allowed_domains) or common["allowed_domains"],
        }
        if cfg.collections_url:
            validate_url(cfg.collections_url)
            attrs["collections_url"] = cfg.collections_url
        if cfg.products_url:
            validate_url(cfg.products_url)
            attrs["products_url"] = cfg.products_url
        if cfg.product_url:
            validate_url(cfg.product_url)
            attrs["product_url"] = cfg.product_url
        cls = type(f"{safe_job_name}_Shopify", (ShopifySpider,), attrs)
        if cfg.include_fields:
            _wrap_shopify_filter(cls, cfg.include_fields)
        return cls

    if tpl == "sitemap":
        cfg = SitemapTemplateConfig(**spec.template_config)
        for u in (cfg.sitemap_urls or []):
            validate_url(u)
        attrs = {
            **common,
            "configure_sessions": configure_sessions_fn,
            "sitemap_urls": list(cfg.sitemap_urls),
            "sitemap_alternate_links": cfg.sitemap_alternate_links,
        }
        if cfg.sitemap_follow:
            attrs["sitemap_follow"] = cfg.sitemap_follow.build()
        if cfg.fields:
            attrs["parse"] = _build_parse(cfg.fields)
        return type(f"{safe_job_name}_Sitemap", (SitemapSpider,), attrs)

    if tpl in ("xml_feed", "csv_feed"):
        cfg = FeedTemplateConfig(**spec.template_config)
        attrs: dict[str, Any] = {**common, "configure_sessions": configure_sessions_fn}
        base = XMLFeedSpider if tpl == "xml_feed" else CSVFeedSpider
        if tpl == "xml_feed":
            attrs["itertag"] = cfg.itertag
            if cfg.namespaces:
                attrs["namespaces"] = tuple(tuple(ns) for ns in cfg.namespaces)
        else:
            attrs["delimiter"] = cfg.delimiter
            attrs["quotechar"] = cfg.quotechar
            if cfg.headers:
                attrs["headers"] = list(cfg.headers)
        cls = type(f"{safe_job_name}_Feed", (base,), attrs)
        if cfg.fields:
            if tpl == "xml_feed":
                cls.parse_node = _build_feed_node(cfg.fields)
            else:
                cls.parse_row = _build_feed_row(cfg.fields)
        return cls

    if tpl == "site_to_markdown":
        cfg = MarkdownSiteTemplateConfig(**spec.template_config)
        attrs = {
            **common,
            "configure_sessions": configure_sessions_fn,
            "allowed_domains": set(cfg.allowed_domains),
            "css_selector": cfg.css_selector,
            "main_content_only": cfg.main_content_only,
            "max_pages": cfg.max_pages,
            "output_dir": str(_markdown_out_dir(safe_job_name)),
        }
        return type(f"{safe_job_name}_Markdown", (SiteToMarkdownSpider,), attrs)

    if tpl == "googlemaps":
        cfg = GoogleMapsTemplateConfig(**spec.template_config)
        try:
            from scrapling.spiders import GoogleMapsSpider as _MapsBase  # type: ignore[attr-defined]
        except ImportError:
            try:
                from scrapling.spiders.templates import (  # type: ignore[import-not-found]
                    GoogleMapsSpider as _MapsBase,
                )
            except ImportError:
                _MapsBase = Spider
        attrs = {
            **common,
            "configure_sessions": configure_sessions_fn,
            "target_query": cfg.target_query,
            "location": cfg.location,
            "max_scrolls": cfg.max_scrolls,
            "max_results": cfg.max_results,
            "fields": list(cfg.fields),
            "enrich_website": cfg.enrich_website,
        }
        return type(f"{safe_job_name}_GoogleMaps", (_MapsBase,), attrs)

    # custom / crawl
    cfg = CustomTemplateConfig(**spec.template_config) if spec.template_config else CustomTemplateConfig(fields=[])
    raw_tpl = spec.template_config if isinstance(spec.template_config, dict) else {}
    # Priority may arrive as a top-level template_config key (legacy) or via
    # the typed CustomTemplateConfig.priority field — prefer the typed one.
    effective_priority = cfg.priority
    if effective_priority is None and isinstance(raw_tpl.get("priority"), int):
        effective_priority = raw_tpl["priority"]
    base = CrawlSpider if (tpl == "crawl" and (cfg.follow_links or cfg.link_extractor is not None)) else Spider
    attrs = {**common, "configure_sessions": configure_sessions_fn}
    if cfg.max_pages:
        attrs["max_pages"] = cfg.max_pages
    # parse MUST be in the class namespace so __abstractmethods__ gets recomputed
    if tpl == "crawl" and base is CrawlSpider:
        if cfg.fields:
            attrs["parse"] = _build_crawl_parse(cfg.fields, max_pages=cfg.max_pages)
        else:
            attrs["parse"] = _with_max_pages(_passthrough_parse(), cfg.max_pages)
    else:
        attrs["parse"] = _with_max_pages(
            _build_parse(cfg.fields) if cfg.fields else _passthrough_parse(),
            cfg.max_pages,
        )
    cls = type(f"{safe_job_name}_Crawl", (base,), attrs)

    if tpl == "crawl":
        import scrapling.spiders as _sp
        from .spec import LinkExtractorSpec as _LES
        raw_rules = raw_tpl.get("rules") if isinstance(raw_tpl, dict) else None
        if isinstance(raw_rules, list) and raw_rules:
            parsed: list[tuple[Any, int | None]] = []
            for r in raw_rules:
                cr = CrawlRuleSpec(**r) if isinstance(r, dict) else r
                parsed.append((cr.link_extractor.build(), cr.priority))

            def rules_fn(self, _parsed=parsed):
                return [_sp.CrawlRule(le, priority=prio) for le, prio in _parsed]
            cls.rules = rules_fn
        else:
            le_spec = cfg.link_extractor
            if le_spec is None and cfg.follow_links:
                # follow_links without an explicit extractor follows with an
                # allow-all default extractor.
                le_spec = _LES()
            if le_spec is not None:
                le_built = le_spec.build()

                def rules_fn(self, _le=le_built, _prio=effective_priority):
                    return [_sp.CrawlRule(_le, priority=_prio)]
                cls.rules = rules_fn

    return cls


def _passthrough_parse():
    async def parse(self, response):
        yield {"url": response.url, "status": response.status,
               "title": (response.css("title::text").get() or "").strip()}
    return parse


def _markdown_out_dir(job_name: str):
    from ..config import settings
    from .guards import slugify_job_name, validate_path

    # P0: slugify + confine under exports_dir so job names cannot traverse.
    safe = slugify_job_name(job_name)
    # validate_path rejects absolute escapes; resolve-then-mkdir stays inside data_dir.
    rel = Path("exports") / "markdown" / safe
    resolved = validate_path(rel)
    resolved.mkdir(parents=True, exist_ok=True)
    # Double-check it is still under exports_dir (fail closed on symlink races).
    try:
        resolved.relative_to(settings.exports_dir.resolve())
    except ValueError:
        from fastapi import HTTPException

        raise HTTPException(403, "Markdown output escapes exports dir")
    return resolved


def _wrap_shopify_filter(cls: type, include_fields: list[str]):
    orig_parse_node_keys = include_fields

    async def parse(self, response):
        async for item in super(cls, self).parse(response):
            filtered = {k: v for k, v in item.items() if k in orig_parse_node_keys}
            yield filtered or item
    cls.parse = parse


def _build_feed_node(fields: list[FieldMapping]):
    async def parse_node(self, response, node):
        from scrapling.parser import Selector
        node_sel = Selector(str(node.html_content) if hasattr(node, "html_content") else str(node))
        for field in fields:
            try:
                element = node_sel
                for step_model in field.steps:
                    element = await _apply(element, step_model)
                value = element
                if isinstance(value, list) and len(value) == 1:
                    value = value[0]
                yield {field.name: value}
            except Exception as e:
                self.logger.warning("Field '%s' extraction failed: %s", field.name, e)
                yield {field.name: None}
    return parse_node


def _build_feed_row(fields: list[FieldMapping]):
    """Build CSVFeedSpider.parse_row honouring FieldMapping list.

    Previously ignored ``fields`` entirely (yielded the raw row). Now: no
    fields → raw row (back-compat); with fields → project each row to the
    requested field names, applying ExtractionSteps to the cell value when
    present (cell wrapped in a Selector so css/xpath/re steps work).
    """
    field_names = [f.name for f in fields] if fields else None

    async def parse_row(self, response, row: dict):
        if not field_names:
            yield dict(row)
            return
        out: dict[str, Any] = {}
        for field in fields:
            try:
                if not field.steps:
                    out[field.name] = row.get(field.name)
                    continue
                from scrapling.parser import Selector as _Selector
                cell = row.get(field.name, "")
                sel = _Selector(content=f"<div>{cell}</div>")
                element: Any = sel
                for step_model in field.steps:
                    element = await _apply(element, step_model)
                value = element
                if isinstance(value, list) and len(value) == 1:
                    value = value[0]
                out[field.name] = value
            except Exception as e:
                try:
                    self.logger.warning("Field '%s' extraction failed: %s", field.name, e)
                except Exception:
                    pass
                out[field.name] = row.get(field.name)
        yield out
    return parse_row


def validate_job_spec(spec_json: str) -> JobSpec:
    return JobSpec(**json.loads(spec_json))


async def session_kwargs_for(spec: JobSpec) -> dict:
    """Build session ctor info for the engine chosen.

    Async because proxy groups resolve via the DB. Returns
    ``{"session_cls", "kwargs", "rotator", "kind"}`` — ``rotator`` is the live
    ProxyRotator (or None). job_runner awaits this and passes it to
    :func:`build_spider_class` so dynamic/stealth sessions are actually used.
    """
    from scrapling.fetchers import AsyncDynamicSession, AsyncStealthySession, FetcherSession
    from .engines import resolve_proxy_group

    kind = spec.engine
    if kind == "static":
        cfg = spec.session_static or StaticEngineConfig()
        rotator = await resolve_proxy_group(cfg.proxy_group_id)
        return {"session_cls": FetcherSession, "kwargs": cfg.session_kwargs(), "rotator": rotator, "kind": kind}
    cfg_b = spec.session_browser or BrowserEngineConfig()
    rotator = await resolve_proxy_group(cfg_b.proxy_group_id)
    if kind == "stealth":
        return {"session_cls": AsyncStealthySession, "kwargs": cfg_b.session_kwargs("stealth"),
                "rotator": rotator, "kind": kind}
    return {"session_cls": AsyncDynamicSession, "kwargs": cfg_b.session_kwargs("dynamic"),
            "rotator": rotator, "kind": kind}
