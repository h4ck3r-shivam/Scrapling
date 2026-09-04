"""Tests for the roadmap completion features.

Covers:
* Pagination auto-detection
* Schema auto-detection (JSON-LD, Microdata, Open Graph, Twitter, canonical)
* Page analyzer
* Regex generation from element groups
"""

import re

import pytest

from scrapling.parser import Selector
from scrapling.core.pagination import find_pagination, pagination_urls, next_page_url
from scrapling.core.schemas import detect_schemas, extract_json_ld, extract_microdata, extract_opengraph
from scrapling.core.analyzer import analyze
from scrapling.core.regex_generator import generate_regex, generate_regex_from_elements


class TestPagination:
    def test_rel_next_is_detected(self):
        html = '<html><body><a href="/page/2" rel="next">Next</a></body></html>'
        page = Selector(html, url="https://example.com/page/1")
        assert len(page.find_pagination()) == 1
        assert page.pagination_urls() == ["https://example.com/page/2"]
        assert page.next_page_url() == "https://example.com/page/2"

    def test_pagination_container_numeric(self):
        html = '<nav class="pagination"><a href="/p/1">1</a><a href="/p/2">2</a><a href="/p/3">3</a></nav>'
        page = Selector(html, url="https://example.com/")
        urls = page.pagination_urls()
        assert "https://example.com/p/1" in urls
        assert "https://example.com/p/2" in urls

    def test_case_insensitive_class(self):
        html = '<div class="Pagination"><a href="/p/1">1</a><a href="/p/2">2</a></div>'
        page = Selector(html, url="https://example.com/")
        assert len(page.find_pagination()) == 2

    def test_text_next_heuristic(self):
        html = '<a href="/next-page">Next Page</a><a href="/other">Other</a>'
        page = Selector(html, url="https://example.com/")
        assert any(e.attrib["href"] == "/next-page" for e in page.find_pagination())
        assert "/next-page" not in [e.attrib["href"] for e in page.find_pagination() if e.attrib["href"] == "/other"]

    def test_strict_only_next(self):
        html = '<nav class="pagination"><a href="/p/1">1</a><a href="/p/2">2</a></nav><a href="/next" rel="next">Next</a>'
        page = Selector(html, url="https://example.com/")
        strict = page.find_pagination(strict=True)
        assert len(strict) == 1
        assert strict[0].attrib["href"] == "/next"
        assert len(page.find_pagination(strict=False)) >= 2

    def test_no_pagination(self):
        page = Selector("<html><body><p>hello</p></body></html>", url="https://example.com/")
        assert page.find_pagination() == []
        assert page.pagination_urls() == []
        assert page.next_page_url() is None

    def test_absolute_false(self):
        html = '<a href="/page/2" rel="next">Next</a>'
        page = Selector(html, url="https://example.com/a")
        assert page.pagination_urls(absolute=False) == ["/page/2"]

    def test_standalone_functions(self):
        html = '<a href="/next" rel="next">Next</a>'
        page = Selector(html, url="https://example.com/")
        assert find_pagination(page)
        assert pagination_urls(page) == ["https://example.com/next"]
        assert next_page_url(page) == "https://example.com/next"


class TestSchemas:
    def test_json_ld_single(self):
        html = '<script type="application/ld+json">{"@type":"Product","name":"A"}</script>'
        page = Selector(html)
        assert page.json_ld()[0]["@type"] == "Product"
        assert extract_json_ld(page)[0]["name"] == "A"

    def test_json_ld_array_and_invalid(self):
        html = '<script type="application/ld+json">not json</script><script type="application/ld+json">[{"@type":"A"},{"@type":"B"}]</script>'
        page = Selector(html)
        assert len(page.json_ld()) == 2

    def test_microdata_simple(self):
        html = '<div itemscope itemtype="https://schema.org/Product"><span itemprop="name">Prod</span><span itemprop="price">10</span></div>'
        page = Selector(html)
        md = page.microdata()
        assert md[0]["@type"] == "https://schema.org/Product"
        assert md[0]["properties"]["name"] == "Prod"

    def test_microdata_nested(self):
        html = '<div itemscope itemtype="https://schema.org/Product"><span itemprop="name">P</span><div itemprop="offers" itemscope itemtype="https://schema.org/Offer"><span itemprop="price">10</span></div></div>'
        page = Selector(html)
        assert page.microdata()[0]["properties"]["offers"]["properties"]["price"] == "10"

    def test_opengraph_and_twitter(self):
        html = '<meta property="og:title" content="OG"><meta name="twitter:card" content="summary"><link rel="canonical" href="https://example.com/can">'
        page = Selector(html)
        assert page.opengraph()["og:title"] == "OG"
        assert extract_opengraph(page)["og:title"] == "OG"
        assert page.twitter_card()["twitter:card"] == "summary"
        assert page.canonical_url() == "https://example.com/can"

    def test_detect_schemas_aggregate(self):
        html = '<meta property="og:title" content="OG"><script type="application/ld+json">{"@type":"A"}</script>'
        page = Selector(html)
        data = page.schemas()
        assert data["has_schema"] is True
        assert data["opengraph"]["og:title"] == "OG"
        assert data["json_ld"][0]["@type"] == "A"
        # standalone
        assert detect_schemas(page)["has_schema"] is True
        assert extract_microdata(page) == [] or isinstance(extract_microdata(page), list)


class TestAnalyzer:
    def test_basic_fields(self):
        html = '<html><head><title>My Page</title><meta name="description" content="A desc"><meta name="keywords" content="k1,k2"><meta property="og:title" content="OG"><meta name="generator" content="WordPress 6.0"><meta charset="utf-8"><link rel="canonical" href="https://example.com/can"></head><body><h1>H1</h1><h2>H2</h2><a href="https://example.com/a">a</a><a href="https://facebook.com/b">fb</a><img src="x"><img src="y" alt="ok"><form><input type="search" name="q"></form></body></html>'
        page = Selector(html, url="https://example.com/")
        rep = page.analyze()
        assert rep["title"] == "My Page"
        assert rep["description"] == "A desc"
        assert rep["canonical"] == "https://example.com/can"
        assert rep["opengraph"]["og:title"] == "OG"
        assert "WordPress" in rep["tech_hints"]
        assert rep["headings"]["h1"]["count"] == 1
        assert rep["stats"]["links"] == 2
        assert rep["stats"]["images_without_alt"] == 1
        assert rep["has_forms"] is True
        assert rep["has_search"] is True

    def test_aliases(self):
        page = Selector("<html><head><title>T</title></head><body></body></html>")
        assert page.analyze()["title"] == "T"
        assert page.analyzer()["title"] == "T"
        assert page.analyse()["title"] == "T"
        assert page.page_analyzer()["title"] == "T"
        assert analyze(page)["title"] == "T"

    def test_empty_page(self):
        page = Selector("<html><head></head><body></body></html>", url="https://example.com/")
        rep = page.analyze()
        assert rep["title"] == ""
        assert rep["word_count"] == 0
        assert rep["stats"]["links"] == 0

    def test_word_count_and_reading_time(self):
        page = Selector("<p>" + "word " * 400 + "</p>")
        rep = page.analyze()
        assert rep["word_count"] == 400
        assert rep["reading_time_minutes"] == 2.0


class TestRegexGeneration:
    def test_simple_numeric(self):
        pat = generate_regex(["/product/123", "/product/456", "/product/789"])
        assert re.match(pat, "/product/999")
        assert re.match(pat, "/product/123")
        assert not re.match(pat, "/other/123")

    def test_via_selector(self):
        html = '<a href="/p/1">1</a><a href="/p/2">2</a><a href="/p/3">3</a>'
        page = Selector(html)
        pat = page.generate_regex(attribute="href")
        assert re.match(pat, "/p/9")
        assert re.match(pat, "/p/1")
        # alias
        assert page.generate_pattern(attribute="href") == pat

    def test_capture_groups(self):
        pat = generate_regex(["/a/1", "/a/2"], capture_groups=True)
        assert "(" in pat and "\\d" in pat

    def test_generate_from_elements_helper(self):
        html = '<img src="/img/1.jpg"><img src="/img/2.jpg"><img src="/img/10.jpg">'
        page = Selector(html)
        pat = generate_regex_from_elements(page, attribute="src", tag="img")
        assert re.match(pat, "/img/99.jpg")

    def test_single_value(self):
        assert generate_regex(["only"]) == "^only$"

    def test_empty_raises(self):
        with pytest.raises(ValueError):
            generate_regex([])

    def test_no_elements_raises(self):
        page = Selector("<div></div>")
        with pytest.raises(ValueError):
            page.generate_regex(attribute="href")

    def test_anchored_false(self):
        pat = generate_regex(["https://a.com/p1", "https://a.com/p2"], anchored=False)
        assert not pat.startswith("^")
        assert re.search(pat, "xx https://a.com/p1 yy")

    def test_standalone_aliases(self):
        from scrapling.core.regex_generator import generate_pattern, create_regex

        assert generate_pattern(["a", "b"]) == generate_regex(["a", "b"])
        assert create_regex(["a"]) == generate_regex(["a"])
