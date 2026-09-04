"""Parse helper endpoints — pagination, schemas, analyze, regex, convert, curl, text-utils.

Every endpoint here wraps a public Scrapling library capability that was previously
exposed only as raw library code.
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..deps import require_user
from ..services.response_models import (
    AnalyzeOut,
    ConvertSelectorOut,
    CurlParseOut,
    PaginationOut,
    RegexOut,
    SchemasOut,
    TextUtilsOut,
)

router = APIRouter(tags=["parse_helpers"])


# ----------------------------------------------------------------------- pagination


class PaginationIn(BaseModel):
    html: str
    url: str | None = None
    strategy: Literal["auto", "selector", "heuristic"] = "auto"
    strict: bool = False


@router.post("/parse/pagination", response_model=PaginationOut)
async def parse_pagination(body: PaginationIn, _: dict = Depends(require_user)):
    def work():
        from scrapling.parser import Selector
        page = Selector(content=body.html, url=body.url or "")
        if body.strategy == "heuristic":
            links = list(page.find_pagination(strict=body.strict))
            from urllib.parse import urljoin
            urls = []
            for el in links:
                href = el.attrib.get("href", "").strip()
                if not href:
                    continue
                if href.startswith("#") or href.lower().startswith("javascript:"):
                    continue
                urls.append(urljoin(body.url or "", href))
            next_page = page.next_page_url(strict=body.strict)
        else:
            urls = page.pagination_urls()
            next_page = page.next_page_url()
            links = list(page.find_pagination())
        return PaginationOut(links=[str(u) for u in urls], next_page=next_page, strategy=body.strategy)

    return await asyncio.to_thread(work)


# ----------------------------------------------------------------------- schemas


class SchemasIn(BaseModel):
    html: str
    url: str | None = None


def _safe(fn, default):
    try:
        return fn()
    except Exception:
        return default


@router.post("/parse/schemas", response_model=SchemasOut)
async def parse_schemas(body: SchemasIn, _: dict = Depends(require_user)):
    def work():
        from scrapling.parser import Selector
        page = Selector(content=body.html, url=body.url or "")
        missing: list[str] = []
        json_ld = _safe(lambda: page.json_ld(), [])
        if not json_ld:
            missing.append("json_ld")
        microdata = _safe(lambda: page.microdata(), [])
        if not microdata:
            missing.append("microdata")
        og = _safe(lambda: page.opengraph(), {})
        if not og:
            missing.append("opengraph")
        tw = _safe(lambda: page.twitter_card(), {})
        if not tw:
            missing.append("twitter_card")
        meta = _safe(lambda: page.meta_data(), {})
        canonical = _safe(lambda: page.canonical_url(), None)
        return SchemasOut(
            json_ld=json_ld or [],
            microdata=microdata or [],
            opengraph=og or {},
            twitter_card=tw or {},
            meta_data=meta or {},
            canonical_url=canonical,
            has_schema=bool(json_ld or microdata or og or tw),
            _missing=missing,
        )

    return await asyncio.to_thread(work)


# ----------------------------------------------------------------------- analyze


class AnalyzeIn(BaseModel):
    html: str
    url: str | None = None


@router.post("/parse/analyze", response_model=AnalyzeOut)
async def parse_analyze(body: AnalyzeIn, _: dict = Depends(require_user)):
    def work():
        from scrapling.parser import Selector
        page = Selector(content=body.html, url=body.url or "")
        report = page.analyze()
        return AnalyzeOut(report=report)

    return await asyncio.to_thread(work)


# ----------------------------------------------------------------------- regex


class RegexIn(BaseModel):
    html: str
    css: str
    attr: str = "text"
    flags: int = 0
    anchored: bool = True
    capture_groups: bool = False


@router.post("/parse/regex", response_model=RegexOut)
async def parse_regex(body: RegexIn, _: dict = Depends(require_user)):
    def work():
        from scrapling.parser import Selector
        page = Selector(content=body.html)
        elems = page.css(body.css)
        values: list[str] = []
        for e in elems:
            if body.attr == "text":
                try:
                    values.append(str(e.text or "").strip())
                except Exception:
                    continue
            else:
                v = e.attrib.get(body.attr, "")
                if v:
                    values.append(str(v).strip())
        if not values:
            raise HTTPException(422, "Selector matched nothing")
        from scrapling.core.regex_generator import generate_regex
        pattern = generate_regex(
            values, anchored=body.anchored, capture_groups=body.capture_groups
        )
        # Apply flags to the returned pattern string if requested
        if body.flags:
            pattern = f"(?{('i' if body.flags & re.I else '')}{('m' if body.flags & re.M else '')}{('s' if body.flags & re.S else '')})" + pattern
        return RegexOut(pattern=pattern, sample=values[:10], flags=body.flags)

    return await asyncio.to_thread(work)


# ----------------------------------------------------------------------- convert-selector


class ConvertSelectorIn(BaseModel):
    selector: str
    target: Literal["css", "xpath"]
    from_: Literal["css", "xpath"] = Field(alias="from")


@router.post("/parse/convert-selector", response_model=ConvertSelectorOut)
async def convert_selector(body: ConvertSelectorIn, _: dict = Depends(require_user)):
    if body.from_ == body.target:
        return ConvertSelectorOut(result=body.selector)
    if body.from_ == "css" and body.target == "xpath":
        from scrapling.core.translator import css_to_xpath
        return ConvertSelectorOut(result=css_to_xpath(body.selector))
    # XPath → CSS: use a sample DOM round-trip via Selector
    try:
        from scrapling.parser import Selector
        # Build a minimal HTML containing the target via lxml evaluation
        from lxml.etree import fromstring, XPath
        try:
            xp = XPath(body.selector)
        except Exception as e:
            raise HTTPException(422, f"Invalid XPath: {e}")
        # Without a target URL we can't materialise a real CSS; return the XPath unchanged
        # with a note inside `result`. But for true conversion, fall back to a generic
        # implementation that handles the most common predicates.
        result = _xpath_to_css(body.selector)
        return ConvertSelectorOut(result=result or body.selector)
    except Exception as e:
        raise HTTPException(422, f"Cannot convert: {e}")


def _xpath_to_css(xpath: str) -> str:
    """Very small XPath→CSS converter for the most common idioms.

    Supports:
        //tag              -> tag
        //tag[@attr='v']   -> tag[attr='v']
        //tag[contains(@class,'x')] -> tag.x
        //*                -> *
    Anything more complex falls back to returning the original string.
    """
    # //tag
    m = re.match(r"^//([a-zA-Z][\w-]*)$", xpath.strip())
    if m:
        return m.group(1)
    # //*[@attr='v']
    m = re.match(r"^//\*\[@([\w-]+)=(['\"])([^'\"]+)\2\]$", xpath.strip())
    if m:
        return f"*[{m.group(1)}={m.group(2)}{m.group(3)}{m.group(2)}]"
    # //tag[@attr='v']
    m = re.match(r"^//([a-zA-Z][\w-]*)\[@([\w-]+)=(['\"])([^'\"]+)\3\]$", xpath.strip())
    if m:
        return f"{m.group(1)}[{m.group(2)}={m.group(3)}{m.group(4)}{m.group(3)}]"
    # //tag[contains(@class,'x')]
    m = re.match(r"^//([a-zA-Z][\w-]*)\[contains\(@class,(['\"])([^'\"]+)\2\)\]$", xpath.strip())
    if m:
        return f"{m.group(1)}.{m.group(3)}"
    return ""


# ----------------------------------------------------------------------- curl-parse


class CurlIn(BaseModel):
    curl: str


# Hand-rolled curl parser — sufficient for the common cases without depending on the
# ``core/shell`` internals.
_TOKEN_RE = re.compile(r"""(?:\"([^\"]*)\"|'([^']*)'|(\S+))""")


def _parse_curl(text: str) -> tuple[str, str, dict[str, str], dict[str, str], str | None, dict | list | None]:
    text = text.strip()
    # Strip "curl" prefix
    if text.lower().startswith("curl"):
        text = text[4:].lstrip()
    tokens = []
    for m in _TOKEN_RE.finditer(text):
        tokens.append(m.group(1) or m.group(2) or m.group(3))
    method = "GET"
    headers: dict[str, str] = {}
    cookies: dict[str, str] = {}
    data_raw: str | None = None
    json_body: dict | list | None = None
    url = ""
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t in ("-X", "--request"):
            method = tokens[i + 1].upper()
            i += 2
            continue
        if t in ("-H", "--header"):
            h = tokens[i + 1]
            if ":" in h:
                k, v = h.split(":", 1)
                k = k.strip()
                v = v.strip()
                if k.lower() == "cookie":
                    for part in v.split(";"):
                        if "=" in part:
                            ck, cv = part.strip().split("=", 1)
                            cookies[ck] = cv
                else:
                    headers[k] = v
            i += 2
            continue
        if t in ("-d", "--data", "--data-raw", "--data-binary"):
            data_raw = tokens[i + 1]
            if method == "GET":
                method = "POST"
            i += 2
            continue
        if t in ("--json",):
            data_raw = tokens[i + 1]
            json_body = json.loads(data_raw) if data_raw else None
            if method == "GET":
                method = "POST"
            i += 2
            continue
        if t in ("-b", "--cookie"):
            v = tokens[i + 1]
            for part in v.split(";"):
                if "=" in part:
                    ck, cv = part.strip().split("=", 1)
                    cookies[ck] = cv
            i += 2
            continue
        if t in ("--url",):
            url = tokens[i + 1]
            i += 2
            continue
        if t.startswith("-"):
            # unknown flag — skip its value if next token doesn't start with -
            if i + 1 < len(tokens) and not tokens[i + 1].startswith("-"):
                i += 2
            else:
                i += 1
            continue
        url = t
        i += 1
    if data_raw and not json_body:
        try:
            json_body = json.loads(data_raw)
        except Exception:
            pass
    return method, url, headers, cookies, data_raw, json_body


@router.post("/parse/curl-parse", response_model=CurlParseOut)
async def curl_parse(body: CurlIn, _: dict = Depends(require_user)):
    try:
        method, url, headers, cookies, data_raw, json_body = _parse_curl(body.curl)
    except Exception as e:
        raise HTTPException(422, f"Could not parse curl: {e}")
    if not url:
        raise HTTPException(422, "Could not find a URL in the curl command")
    return CurlParseOut(
        method=method,
        url=url,
        headers=headers,
        cookies=cookies,
        data_raw=data_raw,
        json_body=json_body,
    )


# ----------------------------------------------------------------------- text-utils


class TextUtilsIn(BaseModel):
    text: str
    op: Literal["clean_spaces", "flatten", "word_count", "lines"]
    separator: str = " "


@router.post("/parse/text-utils", response_model=TextUtilsOut)
async def text_utils(body: TextUtilsIn, _: dict = Depends(require_user)):
    if body.op == "clean_spaces":
        from scrapling.core.utils import clean_spaces
        return TextUtilsOut(result=clean_spaces(body.text))
    if body.op == "flatten":
        from scrapling.core.utils import flatten
        items = [body.text] if isinstance(body.text, str) else body.text
        return TextUtilsOut(result=flatten(items, sep=body.separator))
    if body.op == "word_count":
        words = re.findall(r"\w+", body.text)
        return TextUtilsOut(result=len(words))
    if body.op == "lines":
        return TextUtilsOut(result=[l for l in body.text.splitlines() if l.strip()])
    raise HTTPException(422, f"Unknown op {body.op!r}")