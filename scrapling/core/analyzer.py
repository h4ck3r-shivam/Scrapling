"""Page analyzer – learns about a page through its meta-elements."""

from __future__ import annotations

import re
from urllib.parse import urlparse

from scrapling.core._types import Any, Dict, List, Optional

_TECH_PATTERNS: Dict[str, List[str]] = {
    "WordPress": ["wp-content", "wp-includes", "wordpress", "wp-json"],
    "Shopify": ["cdn.shopify", "shopify", "myshopify.com"],
    "React": ["react", "__NEXT_DATA__", "next.js"],
    "Vue": ["vue", "__vue__"],
    "Angular": ["angular", "ng-"],
    "jQuery": ["jquery"],
    "Bootstrap": ["bootstrap"],
    "Cloudflare": ["cloudflare", "cf-ray", "__cfduid"],
    "Google Analytics": ["googletagmanager", "google-analytics", "gtag"],
    "Google Tag Manager": ["googletagmanager.com/gtm.js"],
    "Wordfence": ["wordfence"],
}

_SOCIAL_DOMAINS = [
    "facebook.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "linkedin.com",
    "youtube.com",
    "tiktok.com",
    "pinterest.com",
    "github.com",
]


def _meta_content(selector: Any, *, name: Optional[str] = None, property: Optional[str] = None) -> Optional[str]:
    try:
        if name:
            # cssselect does not support case-insensitive flag, so we query generic and filter Python-side
            for elem in selector.css("meta[name]"):
                n = elem.attrib.get("name", "").strip().lower()  # type: ignore
                if n == name.lower():
                    c = elem.attrib.get("content", "").strip()  # type: ignore
                    if c:
                        return c
            # fallback direct selector (most pages use lower-case anyway)
            elems = selector.css(f'meta[name="{name}"]')
            if elems:
                c = elems[0].attrib.get("content", "").strip()  # type: ignore
                if c:
                    return c
        if property:
            for elem in selector.css("meta[property]"):
                p = elem.attrib.get("property", "").strip().lower()  # type: ignore
                if p == property.lower():
                    c = elem.attrib.get("content", "").strip()  # type: ignore
                    if c:
                        return c
            elems = selector.css(f'meta[property="{property}"]')
            if elems:
                c = elems[0].attrib.get("content", "").strip()  # type: ignore
                if c:
                    return c
    except Exception:
        pass
    return None


def analyze(selector: Any) -> Dict[str, Any]:
    report: Dict[str, Any] = {}
    report["url"] = getattr(selector, "url", "") or ""
    title = None
    try:
        title_elems = selector.css("title::text")
        if title_elems:
            title = str(title_elems.get()).strip()  # type: ignore
        if not title:
            og_title = _meta_content(selector, property="og:title")
            title = og_title or None
    except Exception:
        title = None
    report["title"] = title or ""
    report["description"] = (
        _meta_content(selector, name="description") or _meta_content(selector, property="og:description") or None
    )
    report["keywords"] = _meta_content(selector, name="keywords")
    report["author"] = _meta_content(selector, name="author") or _meta_content(selector, property="article:author")
    lang = None
    try:
        html_elem = selector.css("html")
        if html_elem:
            lang = html_elem[0].attrib.get("lang", "").strip() or None  # type: ignore
        if not lang:
            lang = _meta_content(selector, name="language")
        if not lang:
            try:
                lang = selector.attrib.get("lang")  # type: ignore
            except Exception:
                lang = None
    except Exception:
        pass
    report["language"] = lang
    charset = None
    try:
        meta_charset = selector.css("meta[charset]")
        if meta_charset:
            charset = meta_charset[0].attrib.get("charset", "").strip()  # type: ignore
        if not charset:
            ct = _meta_content(selector, name="charset")
            charset = ct
        if not charset:
            for elem in selector.css("meta[http-equiv]"):
                http_equiv = elem.attrib.get("http-equiv", "").lower().strip()  # type: ignore
                if http_equiv == "content-type":
                    content = elem.attrib.get("content", "")  # type: ignore
                    m = re.search(r"charset=([^\s;]+)", content, re.I) if content else None
                    if m:
                        charset = m.group(1)
                        break
    except Exception:
        pass
    report["charset"] = charset
    report["viewport"] = _meta_content(selector, name="viewport")
    report["theme_color"] = _meta_content(selector, name="theme-color")
    report["robots"] = _meta_content(selector, name="robots")
    report["generator"] = _meta_content(selector, name="generator")
    report["referrer"] = _meta_content(selector, name="referrer")
    canonical = None
    try:
        link = selector.css('link[rel="canonical"][href]')
        if link:
            canonical = link[0].attrib.get("href", "").strip()  # type: ignore
        if not canonical:
            for elem in selector.css("link[rel][href]"):
                if elem.attrib.get("rel", "").lower().strip() == "canonical":  # type: ignore
                    canonical = elem.attrib.get("href", "").strip()  # type: ignore
                    break
    except Exception:
        pass
    report["canonical"] = canonical
    og: Dict[str, str] = {}
    tw: Dict[str, str] = {}
    jld: List[Dict[str, Any]] = []
    md: List[Dict[str, Any]] = []
    try:
        from scrapling.core.schemas import extract_opengraph, extract_twitter, extract_json_ld, extract_microdata  # type: ignore

        og = extract_opengraph(selector)
        tw = extract_twitter(selector)
        jld = extract_json_ld(selector)
        md = extract_microdata(selector)
    except Exception:
        try:
            from scrapling.core.schemas import extract_opengraph  # type: ignore

            og = extract_opengraph(selector)
        except Exception:
            pass
    report["opengraph"] = og
    report["twitter"] = tw
    report["json_ld"] = jld
    report["microdata"] = md
    headings: Dict[str, Any] = {}
    for level in range(1, 7):
        tag = f"h{level}"
        try:
            elems = selector.css(tag)
            headings[tag] = {
                "count": len(elems),
                "texts": [str(e.get_all_text(strip=True)).strip() for e in elems if str(e.get_all_text(strip=True)).strip()],  # type: ignore
            }
        except Exception:
            headings[tag] = {"count": 0, "texts": []}
    report["headings"] = headings
    stats: Dict[str, Any] = {}
    try:
        links = selector.css("a[href]")
        stats["links"] = len(links)
        base_host = urlparse(report["url"]).netloc.lower() if report["url"] else ""
        internal = 0
        external = 0
        nofollow = 0
        social = 0
        for elem in links:
            href = elem.attrib.get("href", "")  # type: ignore
            rel = elem.attrib.get("rel", "").lower()  # type: ignore
            if "nofollow" in rel:
                nofollow += 1
            if any(d in href for d in _SOCIAL_DOMAINS):
                social += 1
            try:
                parsed = urlparse(href)
                if parsed.netloc:
                    if base_host and parsed.netloc.lower() == base_host:
                        internal += 1
                    else:
                        external += 1
                else:
                    internal += 1
            except Exception:
                internal += 1
        stats["internal_links"] = internal
        stats["external_links"] = external
        stats["nofollow_links"] = nofollow
        stats["social_links_count"] = social
    except Exception:
        stats["links"] = 0
    try:
        imgs = selector.css("img")
        stats["images"] = len(imgs)
        stats["images_without_alt"] = sum(1 for e in imgs if not e.attrib.get("alt", "").strip())  # type: ignore
    except Exception:
        stats["images"] = 0
    try:
        forms = selector.css("form")
        stats["forms"] = len(forms)
        inputs = selector.css("input, textarea, select")
        stats["inputs"] = len(inputs)
    except Exception:
        stats["forms"] = 0
    try:
        scripts = selector.css("script")
        stats["scripts"] = len(scripts)
        # stylesheet links -> need case-insensitive rel check
        styles = 0
        try:
            for elem in selector.css("link[rel][href], style"):
                if elem.tag == "style":
                    styles += 1
                elif elem.attrib.get("rel", "").lower() == "stylesheet":  # type: ignore
                    styles += 1
            stats["stylesheets"] = styles
        except Exception:
            stats["stylesheets"] = len(selector.css("style"))  # type: ignore
    except Exception:
        pass
    try:
        iframes = selector.css("iframe")
        stats["iframes"] = len(iframes)
    except Exception:
        pass
    report["stats"] = stats
    try:
        all_text = selector.get_all_text(separator=" ", strip=True)  # type: ignore
        words = re.findall(r"\w+", str(all_text))
        report["word_count"] = len(words)
        report["reading_time_minutes"] = round(len(words) / 200, 1) if words else 0
    except Exception:
        report["word_count"] = 0
        report["reading_time_minutes"] = 0
    tech_hints: List[str] = []
    gen = (report["generator"] or "").lower()
    raw_html = ""
    try:
        raw_html = str(selector.html_content).lower()  # type: ignore
    except Exception:
        try:
            raw_html = str(selector.get()).lower()  # type: ignore
        except Exception:
            raw_html = ""
    for tech, markers in _TECH_PATTERNS.items():
        haystack = f"{gen} {raw_html} {report['url'].lower()}"
        if any(m.lower() in haystack for m in markers):
            tech_hints.append(tech)
    try:
        script_srcs = [e.attrib.get("src", "").lower() for e in selector.css("script[src]")]  # type: ignore
        for tech, markers in _TECH_PATTERNS.items():
            if tech in tech_hints:
                continue
            if any(any(m.lower() in src for m in markers) for src in script_srcs):
                tech_hints.append(tech)
    except Exception:
        pass
    report["tech_hints"] = tech_hints
    social_links: List[str] = []
    try:
        for elem in selector.css("a[href]"):  # type: ignore
            href = elem.attrib.get("href", "").strip()  # type: ignore
            if any(d in href.lower() for d in _SOCIAL_DOMAINS):
                social_links.append(href)
    except Exception:
        pass
    seen = set()
    deduped = []
    for u in social_links:
        if u not in seen:
            seen.add(u)
            deduped.append(u)
    report["social_links"] = deduped
    report["has_forms"] = stats.get("forms", 0) > 0
    try:
        has_search = False
        for elem in selector.css("input"):
            t = elem.attrib.get("type", "").lower()  # type: ignore
            name = elem.attrib.get("name", "").lower()  # type: ignore
            idv = elem.attrib.get("id", "").lower()  # type: ignore
            if t == "search" or "search" in name or "search" in idv:
                has_search = True
                break
        report["has_search"] = has_search
    except Exception:
        report["has_search"] = False
    report["has_schema"] = bool(jld or md or og or tw)
    meta_summary: Dict[str, str] = {}
    try:
        for elem in selector.css("meta"):  # type: ignore
            key = elem.attrib.get("name", "").strip() or elem.attrib.get("property", "").strip() or elem.attrib.get("http-equiv", "").strip()  # type: ignore
            val = elem.attrib.get("content", "").strip()  # type: ignore
            if key and val and key.lower() not in meta_summary:
                meta_summary[key.lower()] = val
    except Exception:
        pass
    report["meta"] = meta_summary
    return report


analyzer = analyze
page_analyzer = analyze
analyse = analyze
