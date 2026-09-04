"""Pagination auto-detection for Scrapling."""

from __future__ import annotations

import re
from urllib.parse import urljoin

from scrapling.core._types import Any, List, Optional

_NEXT_PATTERNS = [
    r"^\s*next\s*$",
    r"^\s*next\s*page\s*$",
    r"^\s*next\s*›*\s*$",
    r"^\s*more\s*$",
    r"^\s*load\s+more\s*$",
    r"^\s*older\s*(posts|articles)?\s*$",
    r"^\s*»\s*$",
    r"^\s*›\s*$",
    r"^\s*→\s*$",
    r"^\s*>>\s*$",
    r"next",
    r"»",
    r"›",
]

_NEXT_RE = [re.compile(p, re.I) for p in _NEXT_PATTERNS]
_NUMERIC_RE = re.compile(r"^\s*\d+\s*$")

_PAGINATION_CSS = ", ".join(
    [
        'a[rel="next"]',
        'link[rel="next"]',
        'a.next',
        'a.pagination-next',
        'a.pager-next',
        'nav.pagination a',
        'div.pagination a',
        'ul.pagination a',
        'ol.pagination a',
        'nav.pager a',
        'div.pager a',
        'ul.pager a',
        'nav.navigation a',
        'div.navigation a',
    ]
)


def _is_next_link(element: Any) -> bool:
    for attr in ("aria-label", "title", "class", "id", "rel"):
        val = element.attrib.get(attr, "")
        if val and any(rx.search(val) for rx in _NEXT_RE):
            return True
    text = ""
    try:
        text = element.get_all_text(strip=True) or element.text or ""
    except Exception:
        text = element.attrib.get("title", "") or ""
    text = text.strip()
    if not text:
        return False
    if any(rx.search(text) for rx in _NEXT_RE):
        return True
    return False


def _is_numeric_link(element: Any) -> bool:
    text = ""
    try:
        text = element.get_all_text(strip=True) or element.text or ""
    except Exception:
        text = ""
    return bool(_NUMERIC_RE.match(text.strip())) if text else False


def find_pagination(selector: Any, *, strict: bool = False) -> Any:
    from scrapling.parser import Selectors  # local import to avoid circular deps

    if selector is None:
        return Selectors()
    try:
        direct = selector.css(_PAGINATION_CSS)
    except Exception:
        direct = Selectors()
    seen = set()
    result = []

    def _add(elem: Any) -> None:
        href = elem.attrib.get("href")
        if not href:
            return
        key = href.strip()
        if key in seen:
            return
        seen.add(key)
        result.append(elem)

    for elem in direct:
        if elem.attrib.get("href") or elem.tag == "link":
            if strict:
                if elem.attrib.get("rel", "").lower() == "next" or _is_next_link(elem):
                    _add(elem)
            else:
                _add(elem)
    if strict:
        return Selectors(result)  # type: ignore[arg-type]
    try:
        all_links = selector.css("a[href]")
    except Exception:
        all_links = Selectors()
    for elem in all_links:
        if _is_next_link(elem):
            _add(elem)
    container_candidates: List[Any] = []
    try:
        for cand in selector.css("nav, div, ul, ol, section"):
            cls = cand.attrib.get("class", "").lower()  # type: ignore
            aria = cand.attrib.get("aria-label", "").lower()  # type: ignore
            if "pagination" in cls or "pager" in cls or "pagination" in aria or "pager" in aria:
                container_candidates.append(cand)
        for cand in selector.css(
            "nav.pagination, div.pagination, ul.pagination, ol.pagination, nav.pager, div.pager, ul.pager, nav.navigation, div.navigation"
        ):
            if cand not in container_candidates:
                container_candidates.append(cand)
    except Exception:
        container_candidates = []
    for container in container_candidates:
        try:
            links = container.css("a[href]")
        except Exception:
            continue
        for elem in links:
            _add(elem)
    try:
        xpath_expr = (
            "//*[contains(translate(@class,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'pagination') "
            "or contains(translate(@class,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'pager') "
            "or contains(translate(@aria-label,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'pagination')]"
        )
        root = getattr(selector, "_root", None)
        if root is not None:
            extra_containers = root.xpath(xpath_expr)
            from scrapling.parser import Selector as _Sel  # type: ignore

            for raw in extra_containers:
                try:
                    elem = _Sel(root=raw, url=getattr(selector, "url", ""))  # type: ignore
                    if elem not in container_candidates:
                        for link in elem.css("a[href]"):
                            _add(link)
                except Exception:
                    continue
    except Exception:
        pass
    if not result:
        try:
            fallback = []
            for a in selector.css("a[rel], link[rel]"):
                if "next" in a.attrib.get("rel", "").lower():
                    fallback.append(a)
            for elem in fallback:
                _add(elem)
        except Exception:
            pass
    return Selectors(result)  # type: ignore[arg-type]


def pagination_urls(
    selector: Any,
    *,
    strict: bool = False,
    absolute: bool = True,
    canonicalize: bool = True,
) -> List[str]:
    elements = find_pagination(selector, strict=strict)
    urls: List[str] = []
    seen = set()
    base = getattr(selector, "url", "") or ""
    try:
        from w3lib.url import canonicalize_url  # type: ignore
    except Exception:
        canonicalize_url = None  # type: ignore
    for elem in elements:
        href = elem.attrib.get("href")
        if not href:
            continue
        href = href.strip()
        if not href or href.startswith("#") or href.lower().startswith("javascript:"):
            continue
        url = urljoin(base, href) if absolute and base else href
        if canonicalize and canonicalize_url is not None:
            try:
                url = canonicalize_url(url)
            except Exception:
                pass
        if url not in seen:
            seen.add(url)
            urls.append(url)
    return urls


def next_page_url(selector: Any, *, strict: bool = False, absolute: bool = True) -> Optional[str]:
    try:
        candidates = []
        for elem in selector.css("a[rel][href], link[rel][href]"):
            if "next" in elem.attrib.get("rel", "").lower().split():
                candidates.append(elem)
        if candidates:
            href = candidates[0].attrib.get("href", "").strip()
            if href:
                return urljoin(getattr(selector, "url", ""), href) if absolute else href
    except Exception:
        pass
    elements = find_pagination(selector, strict=strict)
    for elem in elements:
        if _is_next_link(elem):
            href = elem.attrib.get("href", "").strip()
            if href:
                return urljoin(getattr(selector, "url", ""), href) if absolute else href
    urls = pagination_urls(selector, strict=strict, absolute=absolute)
    return urls[0] if urls else None


auto_pagination = find_pagination
detect_pagination = find_pagination
get_pagination_urls = pagination_urls
