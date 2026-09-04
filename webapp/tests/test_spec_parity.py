"""PARITY TESTS: assert our spec layer covers every scrapling parameter.

If upstream adds/renames/removes an option, these fail — update
webapp/api/app/services/spec.py to match before pulling further.
Run: webapp/.venv/bin/python -m pytest webapp/tests/test_spec_parity.py -q
"""
from __future__ import annotations

import inspect
import sys
from pathlib import Path

import pytest

API_DIR = Path(__file__).resolve().parent.parent / "api"
sys.path.insert(0, str(API_DIR))

from app.services.spec import (  # noqa: E402
    BrowserEngineConfig, FetchRequestSpec, LinkExtractorSpec,
    ParserConfig, SpiderSettingsSpec, StaticEngineConfig,
)


def typeddict_keys(cls) -> set[str]:
    return {k for k in cls.__annotations__}


def model_keys(*models) -> set[str]:
    """Union of model fields by their input alias (or name)."""
    out: set[str] = set()
    for m in models:
        for name, field in m.model_fields.items():
            alias = field.alias or name
            out.add(alias)
            out.add(name)
    return out


# ---------------------------------------------------------------- static


def test_static_covers_RequestsSession():
    from scrapling.engines._browsers._types import RequestsSession
    ours = set(StaticEngineConfig.model_fields)
    theirs = typeddict_keys(RequestsSession)
    missing = theirs - ours - {"proxy_rotator"}  # proxy_rotator via proxy_group_id
    assert not missing, f"StaticEngineConfig missing: {missing}"


def test_static_covers_request_params():
    from scrapling.engines._browsers._types import DataRequestParams, GetRequestParams, RequestsSession
    ours = model_keys(FetchRequestSpec, StaticEngineConfig)
    # proxy_rotator is remapped: exposed as proxy_group_id on StaticEngineConfig,
    # resolved server-side into a live ProxyRotator (never accepted raw).
    for td in (GetRequestParams, DataRequestParams):
        missing = typeddict_keys(td) - ours - {"proxy_rotator"}
        assert not missing, f"FetchRequestSpec+StaticEngineConfig missing from {td.__name__}: {missing}"


# ---------------------------------------------------------------- browser


def test_browser_covers_PlaywrightSession():
    from scrapling.engines._browsers._types import PlaywrightSession
    ours = set(BrowserEngineConfig.model_fields)
    missing = typeddict_keys(PlaywrightSession) - ours - {"proxy_rotator", "selector_config"}
    # selector_config is nested ParserConfig; page_action/page_setup are str code
    assert not missing, f"BrowserEngineConfig missing: {missing}"


def test_browser_covers_fetch_overrides():
    from scrapling.engines._browsers._types import PlaywrightFetchParams
    ours = set(FetchRequestSpec.model_fields)
    missing = typeddict_keys(PlaywrightFetchParams) - ours - {"page_setup", "proxy"}
    assert not missing, f"FetchRequestSpec missing fetch params: {missing}"
    assert "page_setup" in ours  # exposed at top level
    assert "proxy_override" in ours  # per-call browser proxy (aliased 'proxy')


def test_stealth_extras_present():
    from scrapling.engines._browsers._types import StealthFetchParams, StealthSession
    ours = set(BrowserEngineConfig.model_fields) | set(FetchRequestSpec.model_fields)
    missing = (typeddict_keys(StealthSession) | typeddict_keys(StealthFetchParams)) - ours
    missing -= {"proxy_rotator"}
    assert not missing, f"Stealth fields missing: {missing}"


# ---------------------------------------------------------------- parser


def test_parser_covers_Selector_ctor():
    from scrapling.parser import Selector
    sig = inspect.signature(Selector.__init__)
    theirs = {p for p in sig.parameters
              if p not in ("self", "content", "root", "storage", "storage_args", "_storage")
              and not p.startswith("_")}
    ours = set(ParserConfig.model_fields)
    missing = theirs - ours
    assert not missing, f"ParserConfig missing Selector ctor params: {missing}"


# ---------------------------------------------------------------- spiders


def test_spider_settings_cover_all_class_attrs():
    from scrapling.spiders.spider import Spider
    import logging
    skip_prefixes = ("_",)
    known_non_options = {"name"}  # job name supplies it
    theirs = {
        k for k in Spider.__annotations__
        if not k.startswith(skip_prefixes) and k not in known_non_options
    }
    mapping = {
        "start_urls": "start_urls", "allowed_domains": "allowed_domains",
    }
    ours = set(SpiderSettingsSpec.model_fields)
    missing = {t for t in theirs if mapping.get(t, t) not in ours}
    assert not missing, f"SpiderSettingsSpec missing spider attrs: {missing}"


def test_link_extractor_parity():
    from scrapling.spiders.links import LinkExtractor
    sig = inspect.signature(LinkExtractor.__init__)
    theirs = {p for p in sig.parameters if p not in ("self",)}
    ours = set(LinkExtractorSpec.model_fields)
    missing = theirs - ours - {"process", "deny_extensions_default"}
    # deny_extensions exposed as list|None -> maps to param when set
    assert not missing, f"LinkExtractorSpec missing: {missing}"


# ---------------------------------------------------------------- templates exist (all 7 types)


def test_templates_importable():
    from scrapling.spiders import (
        CrawlSpider, CrawlRule, CSVFeedSpider, ShopifySpider,
        SiteToMarkdownSpider, SitemapSpider, XMLFeedSpider,  # noqa: F401
    )


def test_job_spec_covers_all_templates():
    """JobSpec must expose exactly the 8 known template types and map each to a config class."""
    from app.services.spec import ALL_TEMPLATES, TEMPLATE_TO_CONFIG, JobSpec
    from typing import get_args

    # JobSpec.template literal must equal ALL_TEMPLATES
    ann = JobSpec.model_fields["template"].annotation
    # Literal args are stored as __args__ on the alias
    try:
        literal_vals = set(get_args(ann))
    except Exception:
        literal_vals = set(ann.__args__)  # fallback
    assert literal_vals == ALL_TEMPLATES, f"JobSpec template literal {literal_vals} != ALL_TEMPLATES {ALL_TEMPLATES}"
    assert len(ALL_TEMPLATES) == 8, "expected 8 template types"
    # every template has an entry in the config map
    assert set(TEMPLATE_TO_CONFIG.keys()) == ALL_TEMPLATES
    # ensure union covers map values (deduplicated)
    from app.services.spec import TemplateConfigUnion
    union_args = set(get_args(TemplateConfigUnion))
    # feed/crawl share classes so union has 5 distinct types covering 7 literals — verify coverage via map values
    distinct_configs = set(TEMPLATE_TO_CONFIG.values())
    assert distinct_configs.issubset(union_args), f"TemplateConfigUnion missing: {distinct_configs - union_args}"
    # drift guard: spider_factory must handle every template literal
    from app.services.spec import JobSpec as _JS
    import json as _json
    from app.services.spider_factory import build_spider_class

    for tpl in ALL_TEMPLATES:
        # minimal valid specs per template (fields can be empty)
        base = dict(template=tpl, settings={}, engine="static", template_config={})
        if tpl == "sitemap":
            base["template_config"] = {"sitemap_urls": ["https://example.com/sitemap.xml"]}
        elif tpl == "site_to_markdown":
            base["template_config"] = {"allowed_domains": ["example.com"]}
        elif tpl == "shopify":
            base["template_config"] = {"target_website": "https://example.com"}
        elif tpl in ("xml_feed", "csv_feed"):
            base["template_config"] = {}
        # Custom / crawl use defaults
        spec = _JS(**base)  # type: ignore[arg-type]
        cls = build_spider_class(spec, f"test_{tpl}")
        assert cls is not None, f"build_spider_class failed for {tpl}"


def test_shopify_variant_keys_known():
    """The variant keys our UI advertises must match what ShopifySpider yields."""
    from scrapling.spiders.templates.shopify import ShopifySpider
    src_keys = {"name", "price", "category", "brand", "identifier", "sku", "stock",
                "image_url", "url", "description", "old_price", "barcode"}
    import inspect
    source = inspect.getsource(ShopifySpider)
    for key in src_keys:
        assert f'"{key}"' in source or f"'{key}'" in source, f"Shopify key '{key}' not found in template"


# ---------------------------------------------------------------- exporters


def test_itemlist_exporters_exist():
    from scrapling.spiders.result import ItemList
    for m in ("to_json", "to_jsonl", "to_csv", "to_xml"):
        assert hasattr(ItemList, m), f"ItemList.{m} gone"


def test_impersonate_targets_populated():
    from app.services.spec import IMPERSONATE_TARGETS
    assert len(IMPERSONATE_TARGETS) > 30 and "chrome" in IMPERSONATE_TARGETS
