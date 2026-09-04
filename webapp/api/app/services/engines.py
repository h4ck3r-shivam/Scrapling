"""Thin typed wrappers over scrapling engines. No repo edits — pure library usage."""
from __future__ import annotations

import asyncio
import ast
import json as _json
import logging as _logging
import re
from typing import Any

import anyio

from ..config import settings
from .spec import (
    BrowserEngineConfig, EngineKind, FetchRequestSpec, ParserConfig,
    ProxySpecModel, StaticEngineConfig,
)

_log = _logging.getLogger("scc.engines")

# ------------------------------------------------------------------ proxies


def build_rotator(proxies: list[str | dict], strategy: str = "cyclic_rotation"):
    from scrapling.fetchers import ProxyRotator

    if strategy == "random":
        def random_strategy(proxies_list, current_index):
            import random
            idx = random.randrange(len(proxies_list))
            return proxies_list[idx], idx
        return ProxyRotator(proxies, strategy=random_strategy)
    return ProxyRotator(proxies)


async def resolve_proxy_group(group_id: int | None):
    """Returns a live ProxyRotator for the group, or (proxy_str, auth) fallback."""
    if group_id is None:
        return None
    from ..database import db
    group = await db.fetch_one("SELECT * FROM proxy_groups WHERE id = ?", (group_id,))
    if not group:
        raise ValueError(f"Proxy group {group_id} not found")
    import json
    from ..security import decrypt_secret
    member_ids = json.loads(group["member_ids"])
    rows = await db.fetch_all(
        f"SELECT * FROM proxies WHERE id IN ({','.join('?' * len(member_ids))})", tuple(member_ids))
    proxies = []
    for r in rows:
        user = decrypt_secret(r["username_enc"])
        pw = decrypt_secret(r["password_enc"])
        base = r["url_or_server"]
        if user and pw and "://" in base:
            scheme, _, rest = base.partition("://")
            proxies.append(f"{scheme}://{user}:{pw}@{rest}")
        elif user and pw:
            proxies.append({"server": base, "username": user, "password": pw})
        else:
            proxies.append(base)
    if not proxies:
        raise ValueError(f"Proxy group '{group['name']}' has no members")
    return build_rotator(proxies, group["strategy"])


# ------------------------------------------------------------------ static engine


def _kv_pairs(items) -> dict | None:
    if not items:
        return None
    return {i.key: i.value for i in items} if isinstance(items, list) and items and hasattr(items[0], "key") else items


async def static_fetch(spec: FetchRequestSpec, session_cfg: StaticEngineConfig | None = None) -> dict:
    """Run a static HTTP fetch through FetcherSession (async mode)."""
    from scrapling.fetchers import FetcherSession

    cfg = session_cfg or StaticEngineConfig()
    rotator = await resolve_proxy_group(cfg.proxy_group_id)

    kwargs: dict[str, Any] = {}
    call: dict[str, Any] = {"url": spec.url}
    if spec.params:
        call["params"] = spec.params
    if spec.cookies_kv:
        call["cookies"] = {i.key: i.value for i in spec.cookies_kv}
    if spec.auth:
        call["auth"] = (spec.auth.username, spec.auth.password)
    if spec.method in ("POST", "PUT", "DELETE"):
        if spec.json_body is not None:
            call["json"] = spec.json_body
        if spec.data_raw is not None:
            call["data"] = spec.data_raw
    if spec.timeout is not None:
        call["timeout"] = spec.timeout
    if spec.extra_headers:
        call["headers"] = spec.extra_headers

    sc = _selector_config(spec.selector_config)
    if sc:
        call["selector_config"] = sc

    async with FetcherSession(**cfg.session_kwargs(), proxy_rotator=rotator) as client:
        resp = await getattr(client, spec.method.lower())(**call)
    return await serialize_response(resp, spec)


def _selector_config(pc: ParserConfig | None) -> dict | None:
    if not pc:
        return _default_adaptive_sc()
    d = pc.model_dump(exclude_none=True)
    d.pop("adaptive_domain", None)
    if not d.get("adaptive"):
        # keep adaptive storage local to webapp even when user enables adaptive elsewhere
        pass
    return {k: v for k, v in d.items()} or None


def _default_adaptive_sc() -> dict | None:
    return None


# ------------------------------------------------------------------ browser engines

# Allowlisted JSON DSL for page_action / page_setup (P0: preferred over raw
# Python — no exec, no imports, bounded steps). Each step is a dict:
#   {"action": "click", "selector": "#btn"}
#   {"action": "fill", "selector": "#q", "text": "hello"}
#   {"action": "waitForSelector", "selector": ".results", "timeout": 5000}
#   {"action": "scroll", "x": 0, "y": 800}  (or {"action":"scroll","selector":"..."} )
#   {"action": "waitForTimeout", "timeout": 1000}  (alias "wait")
ALLOWED_PAGE_ACTIONS = frozenset({"click", "fill", "waitForSelector", "scroll", "waitForTimeout", "wait"})
_PAGE_ACTION_TIMEOUT_SECS = 5.0

# AST denylist for the legacy raw-Python path (admin-only). Any occurrence of
# these names/attributes or any import statement rejects the snippet. This is
# defense-in-depth on top of the admin-only API gate — NOT a sandbox.
_PAGE_ACTION_DENY_NAMES = frozenset({
    "__import__", "os", "subprocess", "sys", "socket", "open", "eval", "exec",
    "compile", "shutil", "pathlib", "pty", "popen", "system", "pdb",
    "breakpoint", "input", "help", "memoryview", "globals", "locals", "vars",
    "dir", "getattr", "setattr", "delattr",
})
_PAGE_ACTION_DENY_ATTRS = frozenset({
    "__class__", "__bases__", "__subclasses__", "__dict__", "__globals__",
    "__code__", "__closure__", "__mro__", "__subclasscheck__", "gi_frame",
    "f_globals", "f_code",
})


def _build_dsl_action(steps: list[dict]) -> Any:
    """Build an `async def action(page)` callable from allowlisted DSL steps."""
    # Validate eagerly so bad specs 422 before launching a browser.
    validated: list[dict] = []
    for i, s in enumerate(steps):
        if not isinstance(s, dict):
            raise ValueError(f"DSL step {i} must be an object")
        act = s.get("action")
        if act not in ALLOWED_PAGE_ACTIONS:
            raise ValueError(
                f"DSL step {i}: unknown action {act!r}. "
                f"Allowed: {sorted(ALLOWED_PAGE_ACTIONS)}"
            )
        if act in ("click", "fill", "waitForSelector") and not s.get("selector"):
            raise ValueError(f"DSL step {i} ({act}) requires 'selector'")
        if act == "fill" and "text" not in s:
            raise ValueError(f"DSL step {i} (fill) requires 'text'")
        validated.append(dict(s))

    async def action(page):  # type: ignore[no-untyped-def]
        for s in validated:
            act = s.get("action")
            try:
                if act == "click":
                    await page.click(s["selector"])
                elif act == "fill":
                    # Playwright: fill(selector, text); Patchright mirrors it.
                    try:
                        await page.fill(s["selector"], str(s.get("text", "")))
                    except AttributeError:
                        await page.type(s["selector"], str(s.get("text", "")))
                elif act == "waitForSelector":
                    timeout = s.get("timeout", 5000)
                    try:
                        await page.wait_for_selector(s["selector"], timeout=timeout)
                    except TypeError:
                        await page.wait_for_selector(s["selector"])
                elif act == "scroll":
                    if s.get("selector"):
                        try:
                            await page.eval_on_selector(
                                s["selector"], "el => el.scrollIntoView()"
                            )
                        except Exception:
                            await page.evaluate(
                                f"document.querySelector({s['selector']!r})?.scrollIntoView()"
                            )
                    else:
                        x = int(s.get("x", 0))
                        y = int(s.get("y", 500))
                        await page.evaluate(f"window.scrollBy({x}, {y})")
                elif act in ("waitForTimeout", "wait"):
                    ms = int(s.get("timeout", s.get("ms", 1000)))
                    try:
                        await page.wait_for_timeout(ms)
                    except AttributeError:
                        await asyncio.sleep(ms / 1000.0)
            except Exception as e:
                _log.warning("DSL step %r failed: %s: %s", act, type(e).__name__, e)
                raise

    return action


def _assert_safe_page_action_python(code: str) -> None:
    """AST denylist for raw-Python page_action (admin-only legacy path).

    Blocks: any import, __import__/os/subprocess/open/socket/eval/exec and
    dunder escape hatches (__class__/__subclasses__/__dict__/__globals__...).
    Raises ValueError on violation.
    """
    try:
        tree = ast.parse(code, filename="<page_action>")
    except SyntaxError as e:
        raise ValueError(f"page_action syntax error: {e}")
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            raise ValueError("page_action: import statements are blocked (use JSON DSL)")
        if isinstance(node, ast.Name) and node.id in _PAGE_ACTION_DENY_NAMES:
            raise ValueError(f"page_action: blocked name {node.id!r}")
        if isinstance(node, ast.Attribute) and node.attr in _PAGE_ACTION_DENY_ATTRS:
            raise ValueError(f"page_action: blocked attribute {node.attr!r}")
        # Also catch `__import__(...)`, `eval(...)`, `open(...)` call targets
        # written as attributes (e.g. `builtins.eval`).
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name) and func.id in _PAGE_ACTION_DENY_NAMES:
                raise ValueError(f"page_action: blocked call {func.id!r}")
            if isinstance(func, ast.Attribute) and (
                func.attr in _PAGE_ACTION_DENY_NAMES or func.attr in _PAGE_ACTION_DENY_ATTRS
            ):
                raise ValueError(f"page_action: blocked call .{func.attr!r}")


def _wrap_with_timeout(fn: Any, timeout: float = _PAGE_ACTION_TIMEOUT_SECS) -> Any:
    """Enforce a 5s wall-clock cap on page_action/page_setup callables."""
    async def guarded(page):  # type: ignore[no-untyped-def]
        return await asyncio.wait_for(fn(page), timeout=timeout)
    # Preserve a readable name for logs.
    try:
        guarded.__name__ = getattr(fn, "__name__", "page_action")
    except Exception:
        pass
    return guarded


def compile_page_action(code: str | None, *, is_admin: bool = True):
    """Compile page_action/page_setup.

    Preferred: allowlisted JSON DSL — a JSON array of
    click/fill/waitForSelector/scroll/waitForTimeout steps (no exec).
    Legacy: raw Python `async def action(page)` — admin-only, AST-denylisted
    (__import__/os/subprocess/open/socket/eval/exec + dunder escapes), wrapped
    in a 5s asyncio.wait_for timeout.

    NOTE on memory: page_action output is bounded by the 5MB response cap
    (MAX_RESPONSE_BYTES in services/guards.py + 2MB text truncation in
    serialize_response). Treat 256MB RSS as the hard abort budget for the
    browser worker — if a page_action tries to materialize more, the 5s
    timeout fires first and the fetch 502s instead of OOMing the worker.
    """
    if not code:
        return None
    if not is_admin:
        raise PermissionError("page_action / page_setup are admin-only")
    text = code.strip() if isinstance(code, str) else code
    # 1) JSON DSL path — no exec at all.
    if isinstance(text, str) and text[:1] in ("[", "{"):
        try:
            parsed = _json.loads(text)
        except Exception:
            parsed = None
        if parsed is not None:
            steps = parsed if isinstance(parsed, list) else parsed.get("steps", [parsed])
            if isinstance(steps, list) and all(isinstance(s, dict) for s in steps):
                fn = _build_dsl_action(steps)
                return _wrap_with_timeout(fn)
            # JSON but not DSL-shaped -> fall through to Python with denylist
            # (will likely fail validation, which is fail-closed).
    if isinstance(text, list):
        # Already-decoded DSL from a JSON body.
        fn = _build_dsl_action(text)
        return _wrap_with_timeout(fn)
    # 2) Legacy raw-Python path (admin-only).
    if not isinstance(text, str):
        raise ValueError("page_action must be a JSON DSL array or Python source string")
    _assert_safe_page_action_python(text)
    namespace: dict[str, Any] = {"re": re, "asyncio": asyncio}
    # No builtins override — denylist above already rejected escapes; exec
    # runs with the default builtins but without os/sys/socket access.
    exec(compile(text, "<page_action>", "exec"), namespace)
    fn = namespace.get("action") or namespace.get("page_action")
    if fn is None:
        raise ValueError("page_action code must define `action(page)` or `page_action(page)`")
    if not callable(fn):
        raise ValueError("page_action `action` must be callable")
    return _wrap_with_timeout(fn)


async def browser_fetch(spec: FetchRequestSpec, kind: EngineKind,
                        cfg: BrowserEngineConfig | None = None,
                        user: dict | None = None) -> dict:
    """Dynamic/Stealthy fetch via async sessions.

    ``user`` is optional defense-in-depth: when a non-admin user object is
    passed, page_action/page_setup from BOTH the per-call spec AND the session
    config are stripped BEFORE browser_fetch launches anything (routers already
    403, this is the second layer so a missed gate cannot RCE).
    """
    from scrapling.fetchers import AsyncDynamicSession, AsyncStealthySession

    cfg = cfg or BrowserEngineConfig()
    rotator = await resolve_proxy_group(cfg.proxy_group_id)
    kwargs = cfg.session_kwargs(kind)
    # Defense-in-depth strip for non-admin BEFORE use (P0).
    is_admin = True if user is None else (user.get("role") == "admin")
    if not is_admin:
        for k in ("page_action", "page_setup"):
            if kwargs.pop(k, None) is not None:
                _log.warning("stripped session_kwargs %s for non-admin caller", k)

    overrides: dict[str, Any] = {}
    for field in ("load_dom", "wait", "network_idle", "google_search", "timeout",
                  "disable_resources", "wait_selector", "wait_selector_state",
                  "extra_headers", "blocked_domains"):
        v = getattr(spec, field)
        if v is not None:
            overrides[field] = v
    if spec.page_action:
        if not is_admin:
            _log.warning("stripped spec.page_action for non-admin caller")
        else:
            overrides["page_action"] = compile_page_action(spec.page_action, is_admin=True)
    if spec.page_setup:
        if not is_admin:
            _log.warning("stripped spec.page_setup for non-admin caller")
        else:
            overrides["page_setup"] = compile_page_action(spec.page_setup, is_admin=True)
    if spec.proxy_override is not None:
        # Per-call browser proxy (PlaywrightFetchParams.proxy accepts str|dict).
        po = spec.proxy_override
        overrides["proxy"] = po.to_proxy_value() if isinstance(po, ProxySpecModel) else po
    sc = _selector_config(spec.selector_config)
    if sc:
        overrides["selector_config"] = sc

    solve = spec.solve_cloudflare if spec.solve_cloudflare is not None else (
        cfg.solve_cloudflare if kind == "stealth" else False)
    if kind == "stealth" and solve:
        overrides["solve_cloudflare"] = True
        if "timeout" in overrides and overrides["timeout"] < 60000:
            overrides["timeout"] = 60000
        elif "timeout" not in overrides and kwargs.get("timeout", 30000) < 60000:
            kwargs["timeout"] = 60000

    cls = AsyncStealthySession if kind == "stealth" else AsyncDynamicSession
    ctor_kwargs = dict(kwargs)
    if rotator is not None:
        ctor_kwargs["proxy_rotator"] = rotator
    async with cls(**ctor_kwargs) as sess:
        resp = await sess.fetch(url=spec.url, **overrides)
        pool_stats = sess.get_pool_stats() if hasattr(sess, "get_pool_stats") else None
    result = await serialize_response(resp, spec)
    result["pool_stats"] = pool_stats
    return result


# ------------------------------------------------------------------ serialization


async def serialize_response(resp: Any, spec: FetchRequestSpec) -> dict:
    """Selector objects are NOT serializable — extract primitives server-side.

    P0 5MB cap: html_content/text are truncated so a malicious 500MB page
    cannot OOM the worker or the JSON response. See MAX_RESPONSE_BYTES.
    """

    def _resp_summary(r: Any) -> dict:
        return {
            "status": r.status, "reason": str(r.reason), "url": r.url,
            "headers": dict(r.headers) if r.headers else {},
        }

    from .guards import MAX_RESPONSE_BYTES as _MAX_BYTES

    text = resp.text if hasattr(resp, "text") else ""
    raw_html = resp.html_content if hasattr(resp, "html_content") else ""
    # Cap each large blob at 5MB (bytes ≈ chars for ascii; conservative slice).
    truncated = False
    if isinstance(raw_html, str) and len(raw_html.encode("utf-8", "ignore")) > _MAX_BYTES:
        raw_html = raw_html.encode("utf-8", "ignore")[:_MAX_BYTES].decode("utf-8", "ignore")
        truncated = True
    text_s = str(text)
    if len(text_s.encode("utf-8", "ignore")) > _MAX_BYTES:
        text_s = text_s.encode("utf-8", "ignore")[:_MAX_BYTES].decode("utf-8", "ignore")
        truncated = True
    # Legacy 2M-char text window kept for back-compat payload sizes.
    text_s = text_s[:2_000_000]
    out: dict[str, Any] = {
        "status": resp.status,
        "reason": str(resp.reason),
        "url": resp.url,
        "encoding": resp.encoding,
        "request_headers": dict(resp.request_headers) if resp.request_headers else {},
        "response_headers": dict(resp.headers) if resp.headers else {},
        "cookies": [dict(c) for c in resp.cookies] if isinstance(resp.cookies, tuple) else dict(resp.cookies or {}),
        "meta": dict(resp.meta or {}),
        "history": [_resp_summary(h) for h in (resp.history or [])],
        "html_content": raw_html,
        "text": text_s,
        "captured_xhr": [],
    }
    if truncated:
        out["truncated"] = True
    try:
        body = resp.body
        out["body_size"] = len(body) if body else 0
    except Exception:
        out["body_size"] = 0
    for xhr in (resp.captured_xhr or []):
        entry = _resp_summary(xhr)
        try:
            ct = (xhr.headers or {}).get("content-type", "")
            if "json" in ct:
                entry["json"] = xhr.json()
            else:
                entry["text"] = str(xhr.text)[:100_000]
        except Exception as e:
            entry["error"] = str(e)
        out["captured_xhr"].append(entry)
    if spec.markdown_output:
        try:
            sel = resp.css("body") if not spec.selector_config else None
            md_kwargs: dict[str, Any] = {"main_content_only": spec.main_content_only}
            if hasattr(resp, "markdown"):
                out["markdown"] = resp.markdown(
                    css_selector=getattr(spec, "css_selector", None) or None,
                    main_content_only=spec.main_content_only)
        except Exception as e:
            out["markdown_error"] = str(e)
    return out


def selector_tree(resp: Any, max_nodes: int = 800) -> list[dict]:
    """Lightweight DOM-ish tree for the playground sidebar."""
    nodes: list[dict] = []

    def _prop_or_call(el: Any, name: str):
        v = getattr(el, name, None)
        return v() if callable(v) else v

    def walk(el: Any, depth: int):
        if len(nodes) >= max_nodes or depth > 8:
            return
        nodes.append({
            "tag": el.tag,
            "id": el.attrib.get("id"),
            "class": el.attrib.get("class"),
            "path": el.path,
            "css_selector": _prop_or_call(el, "generate_css_selector"),
            "xpath": _prop_or_call(el, "generate_xpath_selector"),
            "text_preview": str(el.text)[:120] if el.text else "",
            "depth": depth,
        })
        for child in list(el.children)[:40]:
            walk(child, depth + 1)

    root = resp.root if hasattr(resp, "root") and resp.root is not None else resp
    html = root
    try:
        html = root.xpath("//html")[0]
    except Exception:
        pass
    walk(html, 0)
    return nodes


# ------------------------------------------------------------------ extraction


async def run_extraction_step(element: Any, step: dict) -> Any:
    method = step["method"]
    adaptive_kwargs = {}
    for k in ("identifier", "percentage", "auto_save", "adaptive"):
        v = step.get(k)
        if k == "percentage":
            if v is not None and v != 40:
                adaptive_kwargs[k] = v
        elif v:
            adaptive_kwargs[k] = v

    if method == "css":
        res = element.css(step["selector"], **adaptive_kwargs)
        if step.get("attr"):
            return [e.attrib.get(step["attr"]) for e in res]
        if step.get("first_only"):
            item = res.first if len(res) else None
            return str(item.text) if item is not None else None
        return [str(e.text) for e in res]
    if method == "xpath":
        res = element.xpath(step["selector"], **adaptive_kwargs)
        return [str(e) for e in res.getall()] if hasattr(res, "getall") else [str(res)]
    if method == "find_all":
        kwargs: dict[str, Any] = {}
        if step.get("selector"):
            kwargs["class_"] = step["selector"]
        res = element.find_all(**kwargs)
        return [str(e.text) for e in res]
    if method == "find_by_text":
        res = element.find_by_text(step["selector"], partial=step.get("partial", False),
                                   case_sensitive=step.get("case_sensitive", False))
        return str(res.text) if res is not None else None
    if method == "find_by_regex":
        res = element.find_by_regex(step["selector"])
        return [str(e.text) for e in res] if hasattr(res, "__iter__") else str(res)
    if method == "find_similar":
        res = element.find_similar(similarity_threshold=step.get("similarity_threshold", 0.2))
        return [str(e.text) for e in res]
    if method == "re":
        res = element.re(step["selector"])
        return [str(r) for r in res]
    if method == "get_all_text":
        return element.get_all_text(separator=step.get("attr") or "\n")
    if method == "attrib_get":
        return element.attrib.get(step["attr"] or "")
    if method == "json":
        return element.json()
    raise ValueError(f"Unknown extraction method: {method}")


async def to_thread(fn, *args, **kwargs):
    return await anyio.to_thread.run_sync(lambda: fn(*args, **kwargs))


def pinned_storage_args(url: str = "") -> dict:
    """Keep adaptive SQLite inside webapp/data so nothing pollutes the package dir."""
    return {"storage_args": {"storage_file": str(settings.adaptive_db_path), "url": url}}
