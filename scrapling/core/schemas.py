"""Schema auto-detection for Scrapling.

Detects and normalises structured data embedded in HTML pages:

* **JSON-LD** – ``<script type="application/ld+json">`` blocks (``orjson`` if available)
* **Microdata** – ``itemscope`` / ``itemtype`` / ``itemprop`` (WHATWG spec)
* **Open Graph** – ``<meta property="og:...">``
* **Twitter Cards** – ``<meta name="twitter:...">``
* **Dublin Core / generic** – ``<meta name="...">`` + ``<link rel="canonical">`` etc.

The primary entry-point is :func:`detect_schemas` which returns a dict aggregating
all sources; convenience wrappers :func:`extract_json_ld`, :func:`extract_microdata`,
:func:`extract_opengraph` etc. are exposed on :class:`scrapling.parser.Selector` as
``selector.json_ld()``, ``selector.microdata()``, ``selector.opengraph()``,
``selector.schemas()`` and so on.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List

from scrapling.core._types import Optional


def _parse_json(text: str) -> Any | None:
    text = text.strip()
    if not text:
        return None
    try:
        from orjson import loads  # type: ignore

        return loads(text)
    except Exception:
        pass
    try:
        return json.loads(text)
    except Exception:
        return None


def extract_json_ld(selector: Any) -> List[Dict[str, Any]]:
    """Extract JSON-LD objects from ``<script type="application/ld+json">``."""
    results: List[Dict[str, Any]] = []
    try:
        scripts = selector.css('script[type="application/ld+json"]')
    except Exception:
        return results
    for elem in scripts:
        raw = ""
        try:
            raw = elem.get_all_text(separator=" ", strip=False)  # type: ignore
            if not raw or not raw.strip():
                raw = elem.text or ""  # type: ignore
        except Exception:
            try:
                raw = elem.text or ""  # type: ignore
            except Exception:
                raw = ""
        data = _parse_json(str(raw)) if raw else None
        if data is None:
            continue
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    results.append(item)
        elif isinstance(data, dict):
            results.append(data)
    return results


def extract_microdata(selector: Any) -> List[Dict[str, Any]]:
    """Extract HTML Microdata (itemscope/itemtype/itemprop)."""
    items: List[Dict[str, Any]] = []
    if selector is None:
        return items
    try:
        root = getattr(selector, "_root", None)
        if root is None:
            return items
        top_level = root.xpath(".//*[@itemscope and not(ancestor::*[@itemscope])]")
    except Exception:
        return items
    for item_elem in top_level:
        parsed = _parse_microdata_item(item_elem)
        if parsed:
            items.append(parsed)
    return items


def _parse_microdata_item(item_elem: Any) -> Dict[str, Any]:
    item: Dict[str, Any] = {}
    try:
        itemtype = item_elem.get("itemtype") or item_elem.attrib.get("itemtype")  # type: ignore
    except Exception:
        itemtype = None
    if itemtype:
        item["@type"] = itemtype.strip()
    elif hasattr(item_elem, "attrib") and "itemtype" in item_elem.attrib:
        item["@type"] = item_elem.attrib["itemtype"]
    try:
        tag = getattr(item_elem, "tag", "")
        if tag:
            item["@tag"] = str(tag)
    except Exception:
        pass
    properties: Dict[str, Any] = {}
    try:
        descendants = item_elem.xpath(".//*[@itemprop]")
    except Exception:
        descendants = []
    for prop_elem in descendants:
        try:
            ancestors = prop_elem.xpath("ancestor::*[@itemscope][1]")
            nearest = ancestors[0] if ancestors else None
        except Exception:
            nearest = None
        if nearest is not None and nearest is not item_elem:
            continue
        try:
            prop_names = (prop_elem.get("itemprop") or "").strip().split()
        except Exception:
            prop_names = []
        if not prop_names:
            continue
        if prop_elem.get("itemscope") is not None or "itemscope" in getattr(prop_elem, "attrib", {}):
            value = _parse_microdata_item(prop_elem)
        else:
            value = _microdata_property_value(prop_elem)
        for name in prop_names:
            if not name:
                continue
            if name in properties:
                existing = properties[name]
                if isinstance(existing, list):
                    existing.append(value)
                else:
                    properties[name] = [existing, value]
            else:
                properties[name] = value
    if properties:
        item["properties"] = properties
    if not properties and "@type" not in item:
        return {}
    return item


def _microdata_property_value(elem: Any) -> Any:
    tag = ""
    try:
        tag = str(getattr(elem, "tag", "")).lower()
    except Exception:
        tag = ""
    attrib = {}
    try:
        attrib = dict(elem.attrib)  # type: ignore
    except Exception:
        attrib = {}
    if tag == "meta":
        return attrib.get("content", "")
    if tag in ("audio", "embed", "iframe", "img", "source", "track", "video"):
        return attrib.get("src", "")
    if tag in ("a", "area", "link"):
        return attrib.get("href", "")
    if tag == "object":
        return attrib.get("data", "")
    if tag in ("data",):
        return attrib.get("value", "") or (elem.text or getattr(elem, "text", "") or "").strip()
    if tag == "meter":
        return attrib.get("value", "")
    if tag == "time":
        val = attrib.get("datetime", "")
        if val:
            return val
    try:
        text = "".join(elem.itertext()) if hasattr(elem, "itertext") else (elem.text or "")
        return text.strip()
    except Exception:
        try:
            return (elem.text or "").strip()
        except Exception:
            return ""


def extract_opengraph(selector: Any) -> Dict[str, str]:
    og: Dict[str, str] = {}
    if selector is None:
        return og
    try:
        metas = selector.css('meta[property^="og:"]')
    except Exception:
        return og
    for elem in metas:
        prop = elem.attrib.get("property", "").strip() or elem.attrib.get("name", "").strip()
        content = elem.attrib.get("content", "").strip()
        if prop and content:
            og[prop] = content
    # Fallback scan for case where attribute case differs (e.g., OG:title)
    if not og:
        try:
            for elem in selector.css("meta"):
                prop = elem.attrib.get("property", "").strip()  # type: ignore
                if prop.lower().startswith("og:"):
                    content = elem.attrib.get("content", "").strip()  # type: ignore
                    if content:
                        og[prop] = content
        except Exception:
            pass
    return og


def extract_twitter(selector: Any) -> Dict[str, str]:
    tw: Dict[str, str] = {}
    if selector is None:
        return tw
    try:
        metas = selector.css('meta[name^="twitter:"], meta[property^="twitter:"]')
    except Exception:
        return tw
    for elem in metas:
        name = elem.attrib.get("name", "").strip() or elem.attrib.get("property", "").strip()
        content = elem.attrib.get("content", "").strip()
        if name and content:
            tw[name] = content
    if not tw:
        try:
            for elem in selector.css("meta"):
                name = (elem.attrib.get("name", "").strip() or elem.attrib.get("property", "").strip()).lower()  # type: ignore
                if name.startswith("twitter:"):
                    raw_name = elem.attrib.get("name", "").strip() or elem.attrib.get("property", "").strip()  # type: ignore
                    content = elem.attrib.get("content", "").strip()  # type: ignore
                    if content:
                        tw[raw_name] = content
        except Exception:
            pass
    return tw


def extract_meta(selector: Any) -> Dict[str, str]:
    meta: Dict[str, str] = {}
    if selector is None:
        return meta
    try:
        metas = selector.css("meta[name]")
    except Exception:
        return meta
    for elem in metas:
        name = elem.attrib.get("name", "").strip().lower()
        if name.startswith("og:") or name.startswith("twitter:"):
            continue
        content = elem.attrib.get("content", "").strip()
        if name and content:
            meta[name] = content
    return meta


def extract_canonical(selector: Any) -> Optional[str]:
    try:
        link = selector.css('link[rel="canonical"][href]')
        if link:
            return link[0].attrib.get("href", "").strip() or None
    except Exception:
        pass
    # Fallback case-insensitive
    try:
        for elem in selector.css("link[rel][href]"):
            if elem.attrib.get("rel", "").lower().strip() == "canonical":
                href = elem.attrib.get("href", "").strip()  # type: ignore
                if href:
                    return href
    except Exception:
        pass
    return None


def detect_schemas(selector: Any) -> Dict[str, Any]:
    json_ld = extract_json_ld(selector)
    microdata = extract_microdata(selector)
    opengraph = extract_opengraph(selector)
    twitter = extract_twitter(selector)
    meta = extract_meta(selector)
    canonical = extract_canonical(selector)
    has_schema = bool(json_ld or microdata or opengraph or twitter)
    return {
        "json_ld": json_ld,
        "microdata": microdata,
        "opengraph": opengraph,
        "twitter": twitter,
        "meta": meta,
        "canonical": canonical,
        "has_schema": has_schema,
    }


def to_dict(schema_result: Dict[str, Any]) -> Dict[str, Any]:
    import copy

    return copy.deepcopy(schema_result)


get_json_ld = extract_json_ld
get_microdata = extract_microdata
get_opengraph = extract_opengraph
get_twitter = extract_twitter
get_meta = extract_meta
get_schemas = detect_schemas
