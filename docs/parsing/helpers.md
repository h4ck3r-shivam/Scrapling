# Helpers – Pagination, Schemas, Analyzer & Regex

These four helpers close the original `ROADMAP.md`. They work on any `Selector` or `Response` (so on `Fetcher`/`DynamicFetcher` results as well) without extra dependencies.

!!! success "Prerequisites"
    You have read [Querying elements](selection.md) and [Main classes](main_classes.md).

## Pagination auto-detection

Many sites use `rel="next"`, `aria-label="Next"`, `class="pagination"`, or a `.pagination` container with numbered links. Scrapling scores links by `rel`, text (`next/»/›/→/more/load more/older`), and container heuristics.

```python
from scrapling.parser import Selector

html = '<nav class="pagination"><a href="/page/1">1</a><a href="/page/2">2</a></nav><a href="/next" rel="next">Next</a>'
page = Selector(html, url="https://example.com/")

page.find_pagination()            # Selectors[<a href="/page/2">, <a href="/page/1">]
page.pagination_urls()            # ['https://example.com/page/2', 'https://example.com/page/1']
page.next_page_url()              # 'https://example.com/next'  (rel="next" wins)
page.find_pagination(strict=True) # only rel="next" + explicit Next text
```

`pagination_urls(absolute=False, canonicalize=False)` returns raw `href`s. Helpers live in `scrapling.core.pagination` as well:

```python
from scrapling.core.pagination import find_pagination, pagination_urls, next_page_url

find_pagination(page)
pagination_urls(page, strict=True)
```

## Schema auto-detection

```python
html = '''
<meta property="og:title" content="OG">
<meta name="twitter:card" content="summary">
<link rel="canonical" href="https://example.com/can">
<script type="application/ld+json">{"@type":"Article","name":"Demo"}</script>
<div itemscope itemtype="https://schema.org/Product"><span itemprop="name">Widget</span></div>
'''
page = Selector(html)

page.schemas()      # {"json_ld": [...], "microdata": [...], "opengraph": {"og:title":"OG"}, "twitter": {...}, "meta": {...}, "canonical": "https://example.com/can", "has_schema": True}
page.json_ld()      # [{"@type":"Article","name":"Demo"}]
page.microdata()    # [{"@type":"https://schema.org/Product","properties":{"name":"Widget"}}]
page.opengraph()    # {"og:title":"OG"}
page.twitter_card() # {"twitter:card":"summary"}
page.canonical_url()# "https://example.com/can"
```

Standalone: `from scrapling.core.schemas import detect_schemas, extract_json_ld, extract_microdata`.

Invalid JSON-LD blocks are skipped, array-bodied scripts are flattened, and nested `itemscope` becomes nested dicts (`offers.price`).

## Page analyzer

`page.analyze()` (aliases `analyzer()`, `analyse()`, `page_analyzer()`) learns from meta elements:

```python
page = Selector(html, url="https://example.com/")
report = page.analyze()
# report = {
#   "url": "https://example.com/",
#   "title": "Demo",
#   "description": "...",
#   "language": "en", "charset": "utf-8", "viewport": "...", "canonical": "...",
#   "opengraph": {...}, "twitter": {...}, "json_ld": [...], "microdata": [...],
#   "headings": {"h1": {"count":1,"texts": [...]}, ...},
#   "stats": {"links":55,"internal_links":10,"external_links":5,"images":3,"forms":1,...},
#   "word_count": 420, "reading_time_minutes": 2.1,
#   "tech_hints": ["WordPress","Cloudflare"],  # via generator/wp-content/cdn.shopify
#   "social_links": ["https://facebook.com/..."],
#   "has_forms": True, "has_search": False, "has_schema": True,
#   "meta": {"description":"...","keywords":"..."}
# }
```

`from scrapling.core.analyzer import analyze`.

## Regex generation from element groups

Given e.g. all `href`s, build a regex that matches them:

```python
from scrapling.parser import Selector

html = '<a href="/product/123">1</a><a href="/product/456">2</a><a href="/product/789">3</a>'
page = Selector(html)

page.generate_regex(attribute="href")                           # '^/product/\\d{3}$'
page.generate_regex(css_selector="a[href*='/author/']")        # '^/author/.*?$'
page.generate_regex(attribute="src", tag="img")                # from <img src>

# Or standalone
from scrapling.core.regex_generator import generate_regex
generate_regex(["/p/1","/p/2","/p/10"])                          # '^/p/\\d+$'
generate_regex(["/page/1","/product/123"])                      # '^(?:/page/1|/product/123)$'  (alternation for mixed sets)
generate_regex(["/page/1","/product/123"], anchored=False)     # '(?:/page/1|/product/123)'
```

`capture_groups=True` wraps the varying part in `(...)`. If no element has the attribute, `ValueError` is raised. Heterogeneous sets like `["/page/1","/product/123"]` or `["abc","xyz"]` fall back to `^(?:a|b)$` instead of over-generic `^[A-Za-z]+$`.

Standalone helpers: `generate_regex`, `generate_regex_from_elements`, `generate_pattern`.

## Integration with fetchers & spiders

All helpers are on `Response`, so they work after any fetch, including browser fetchers and spiders:

```python
from scrapling.fetchers import Fetcher, DynamicFetcher
page = Fetcher.get("https://quotes.toscrape.com/")
page.pagination_urls()  # ['https://quotes.toscrape.com/page/2/']

page = DynamicFetcher.fetch("https://quotes.toscrape.com/js/", headless=True, network_idle=True)
page.analyze()["title"]

from scrapling.spiders import Spider, Response
class MySpider(Spider):
    name = "demo"
    start_urls = ["https://quotes.toscrape.com/"]
    async def parse(self, response: Response):
        yield {"next": response.next_page_url(), "schemas": response.schemas()}
```

Data-URLs (`data:text/html,<html>…`) now work in `DynamicFetcher`/`StealthyFetcher` as well.
