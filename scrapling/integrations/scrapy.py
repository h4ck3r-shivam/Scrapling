"""Scrapy integration.

Decorate Scrapy spider callbacks with `scrapling_response` to receive a Scrapling `Response`
object instead of the Scrapy response, so you get Scrapling's full parsing API inside existing
Scrapy projects without changing how the spider crawls.
"""

import weakref
from functools import partial, wraps
from inspect import isasyncgenfunction, iscoroutinefunction, isgeneratorfunction

from scrapling.core._types import Any, Callable, Dict, Optional, Tuple
from scrapling.engines.toolbelt.custom import Response, StatusText

try:
    from scrapy.http import Response as ScrapyResponse
except (ImportError, ModuleNotFoundError) as e:
    raise ModuleNotFoundError(
        "This integration requires Scrapy installed, please install it first with `pip install scrapy`"
    ) from e

# Scrapy ``Response`` uses ``__slots__`` and forbids arbitrary instance attributes.
# Expose ``response.scrapling`` / ``response._scrapling_response`` via a
# ``WeakKeyDictionary`` cache + class properties so ``response.scrapling`` works
# like ``response.selector`` (which is also a property on the base class).
_scrapling_cache: "weakref.WeakKeyDictionary[Any, Response]" = weakref.WeakKeyDictionary()


def _ensure_scrapling_properties() -> None:
    if getattr(ScrapyResponse, "_scrapling_patched", False):
        return

    def _get_scrapling(self: Any) -> Response:
        cached = _scrapling_cache.get(self)
        if cached is not None:
            return cached
        # Lazily create with default config if accessed before the middleware
        resp = convert_response(self)
        _scrapling_cache[self] = resp
        return resp

    def _set_scrapling(self: Any, value: Response) -> None:
        _scrapling_cache[self] = value

    try:
        ScrapyResponse.scrapling = property(_get_scrapling, _set_scrapling)  # type: ignore[attr-defined]
        ScrapyResponse._scrapling_response = property(_get_scrapling, _set_scrapling)  # type: ignore[attr-defined]
        ScrapyResponse._scrapling_patched = True  # type: ignore[attr-defined]
    except Exception:
        pass


_ensure_scrapling_properties()

__all__ = [
    "scrapling_response",
    "convert_response",
    "ScraplingSpiderMiddleware",
    "ScraplingDownloaderMiddleware",
    "ScraplingAddon",
]


def convert_response(response: ScrapyResponse, **selector_config: Any) -> Response:
    """Convert a Scrapy response to a Scrapling `Response` object.

    Can be used directly anywhere you have a Scrapy response at hand (middlewares, pipelines, ...).

    :param response: The Scrapy response to convert.
    :param selector_config: Configuration options passed to the `Response` constructor, like
        `huge_tree`, `keep_comments`, `keep_cdata`, `adaptive`, `storage`, `storage_args`, and `adaptive_domain`.
    :return: A Scrapling `Response` object ready for parsing.
    """
    request = response.request
    cookies: Dict[str, str] = {}
    # `to_unicode_dict` below joins duplicate headers with commas, which corrupts multiple
    # `Set-Cookie` headers, so cookies are parsed from the raw header lines instead.
    for line in response.headers.getlist(b"Set-Cookie"):
        pair = line.split(b";", 1)[0]
        if b"=" in pair:
            name, _, value = pair.decode("latin-1").partition("=")
            cookies[name.strip()] = value.strip()

    return Response(
        url=response.url,
        content=response.body,
        status=response.status,
        reason=StatusText.get(response.status),
        cookies=cookies,
        headers=dict(response.headers.to_unicode_dict()),
        request_headers=dict(request.headers.to_unicode_dict()) if request else {},
        encoding=getattr(response, "encoding", "utf-8"),  # Binary responses don't have an encoding
        method=request.method if request else "GET",
        meta=dict(response.meta) if request else {},  # `meta` raises AttributeError without a request
        **selector_config,
    )


def scrapling_response(func: Optional[Callable] = None, **selector_config: Any) -> Callable:
    """Decorator that converts the Scrapy response passed to a spider callback into a Scrapling `Response`.

    Works bare or parameterized, on any callback kind Scrapy supports (regular, generator,
    coroutine, and async generator functions)::

        class MySpider(scrapy.Spider):
            @scrapling_response
            def parse(self, response):  # `response` is a Scrapling Response
                product = response.find_by_text("Vans Old Skool", partial=True)
                for similar in product.find_similar():
                    yield {"name": similar.get_all_text(strip=True)}

            @scrapling_response(adaptive=True)
            def parse_product(self, response):
                ...

    :param func: The decorated callback. Left empty in the parameterized form.
    :param selector_config: Configuration options passed to the `Response` constructor, like
        `huge_tree`, `keep_comments`, `keep_cdata`, `adaptive`, `storage`, `storage_args`, and `adaptive_domain`.
    :return: The wrapped callback. The wrapper keeps the callback's kind, name, and docstring,
        so Scrapy's callback introspection keeps working.
    """
    if func is None:
        return partial(scrapling_response, **selector_config)

    def _convert_arguments(args: Tuple[Any, ...], kwargs: Dict[str, Any]) -> Tuple[Tuple[Any, ...], Dict[str, Any]]:
        converted = list(args)
        for index, argument in enumerate(converted):
            if isinstance(argument, ScrapyResponse):
                converted[index] = convert_response(argument, **selector_config)
                return tuple(converted), kwargs

        for key, value in kwargs.items():
            if isinstance(value, ScrapyResponse):
                kwargs[key] = convert_response(value, **selector_config)
                return tuple(converted), kwargs

        raise TypeError(f"No Scrapy response found in the arguments of '{getattr(func, '__name__', func)}'")

    # Each callback kind gets a wrapper of the same kind because Scrapy inspects the callback
    # function itself, not just what it returns.
    if isasyncgenfunction(func):

        @wraps(func)
        async def async_gen_wrapper(*args: Any, **kwargs: Any) -> Any:
            args, kwargs = _convert_arguments(args, kwargs)
            async for result in func(*args, **kwargs):
                yield result

        async_gen_wrapper._scrapling_wrapped = True  # type: ignore[attr-defined]
        return async_gen_wrapper

    elif iscoroutinefunction(func):

        @wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
            args, kwargs = _convert_arguments(args, kwargs)
            return await func(*args, **kwargs)

        async_wrapper._scrapling_wrapped = True  # type: ignore[attr-defined]
        return async_wrapper

    elif isgeneratorfunction(func):

        @wraps(func)
        def gen_wrapper(*args: Any, **kwargs: Any) -> Any:
            args, kwargs = _convert_arguments(args, kwargs)
            yield from func(*args, **kwargs)

        gen_wrapper._scrapling_wrapped = True  # type: ignore[attr-defined]
        return gen_wrapper

    @wraps(func)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        args, kwargs = _convert_arguments(args, kwargs)
        return func(*args, **kwargs)

    wrapper._scrapling_wrapped = True  # type: ignore[attr-defined]
    return wrapper


def _wrap_callback(callback: Any, selector_config: Dict[str, Any]) -> Any:
    """Wrap a Scrapy callback with scrapling_response if not already wrapped."""
    if callback is None or getattr(callback, "_scrapling_wrapped", False):
        return callback
    try:
        wrapped = scrapling_response(callback, **selector_config)
        wrapped._scrapling_wrapped = True  # type: ignore[attr-defined]
        return wrapped
    except Exception:
        return callback


class ScraplingSpiderMiddleware:
    """Spider middleware that automatically replaces Scrapy/parsel responses with Scrapling Responses.

    Enable it in ``settings.py``::

        SPIDER_MIDDLEWARES = {
            "scrapling.integrations.scrapy.ScraplingSpiderMiddleware": 543,
        }
        # Optional: forward Selector config to every converted response
        SCRAPLING_SELECTOR_CONFIG = {"adaptive": True, "keep_comments": False}

    Once enabled every spider callback receives a :class:`scrapling.engines.toolbelt.custom.Response`
    instead of a :class:`scrapy.http.Response` without touching the spider code. The middleware
    wraps the ``Request.callback`` ahead of the call (``process_spider_input``) and also wraps any
    ``Request`` objects yielded by the spider (``process_spider_output`` / ``process_start_requests``)
    so the next hop is converted as well.
    """

    @classmethod
    def from_crawler(cls, crawler: Any) -> "ScraplingSpiderMiddleware":
        return cls(crawler)

    def __init__(self, crawler: Any) -> None:
        settings = getattr(crawler, "settings", crawler)
        try:
            cfg = settings.getdict("SCRAPLING_SELECTOR_CONFIG")  # type: ignore[attr-defined]
        except Exception:
            cfg = settings.get("SCRAPLING_SELECTOR_CONFIG", {}) if isinstance(settings, dict) else {}
        self.selector_config: Dict[str, Any] = dict(cfg or {})

    def process_spider_input(self, response: Any, spider: Any) -> None:
        request = getattr(response, "request", None)
        if request is not None:
            cb = getattr(request, "callback", None)
            if cb:
                request.callback = _wrap_callback(cb, self.selector_config)
        return None

    def process_spider_output(self, response: Any, result: Any, spider: Any) -> Any:
        for item in result:
            # ``Request``-like objects have a ``callback`` attribute
            cb = getattr(item, "callback", None)
            if cb is not None:
                try:
                    item.callback = _wrap_callback(cb, self.selector_config)
                except Exception:
                    pass
            yield item

    def process_start_requests(self, start_requests: Any, spider: Any) -> Any:
        for request in start_requests:
            cb = getattr(request, "callback", None)
            if cb is not None:
                try:
                    request.callback = _wrap_callback(cb, self.selector_config)
                except Exception:
                    pass
            yield request


class ScraplingDownloaderMiddleware:
    """Downloader middleware that exposes a cached Scrapling response on every Scrapy response.

    Enable it in ``settings.py``::

        DOWNLOADER_MIDDLEWARES = {
            "scrapling.integrations.scrapy.ScraplingDownloaderMiddleware": 543,
        }

    After the download finishes, ``response.scrapling`` and ``response._scrapling_response``
    contain the converted :class:`scrapling.engines.toolbelt.custom.Response`. The original
    Scrapy response is returned unchanged so existing middlewares keep working, but spider
    callbacks can use ``response.scrapling.css(...)`` or ``response.scrapling.find_by_text(...)``
    without an extra conversion step. If :class:`ScraplingSpiderMiddleware` is also enabled,
    the callback will already receive the Scrapling response directly.
    """

    @classmethod
    def from_crawler(cls, crawler: Any) -> "ScraplingDownloaderMiddleware":
        settings = getattr(crawler, "settings", crawler)
        try:
            cfg = settings.getdict("SCRAPLING_SELECTOR_CONFIG")  # type: ignore[attr-defined]
        except Exception:
            cfg = settings.get("SCRAPLING_SELECTOR_CONFIG", {}) if isinstance(settings, dict) else {}
        return cls(dict(cfg or {}))

    def __init__(self, selector_config: Dict[str, Any] | None = None) -> None:
        self.selector_config: Dict[str, Any] = dict(selector_config or {})

    def process_response(self, request: Any, response: Any, spider: Any) -> Any:
        try:
            scrapling_resp = convert_response(response, **self.selector_config)
            try:
                response.scrapling = scrapling_resp  # type: ignore[attr-defined]
                response._scrapling_response = scrapling_resp  # type: ignore[attr-defined]
            except Exception:
                # Fallback for slot-restricted or patched environments
                try:
                    _scrapling_cache[response] = scrapling_resp
                except Exception:
                    pass
                try:
                    # Scrapy meta is always writable – expose there as well
                    response.meta["_scrapling_response"] = scrapling_resp  # type: ignore[attr-defined]
                    response.meta["scrapling"] = scrapling_resp  # type: ignore[attr-defined]
                except Exception:
                    pass
        except Exception:
            pass
        return response


class ScraplingAddon:
    """Scrapy Addon that auto-wraps all spider callbacks with :func:`scrapling_response`.

    Scrapy >=2.13 discovers addons via ``ADDONS``::

        ADDONS = {
            "scrapling.integrations.scrapy.ScraplingAddon": 500,
        }
        SCRAPLING_SELECTOR_CONFIG = {"keep_comments": False}

    For older Scrapy versions the same class works as a normal extension – add
    it to ``EXTENSIONS`` and it will hook ``spider_opened`` to wrap callbacks.
    The addon is the most ergonomic way to “replace parsel in the response
    argument when needed” without decorating each callback manually.
    """

    @classmethod
    def update_settings(cls, settings: Any) -> None:
        # Register spider middleware automatically when addon is enabled
        try:
            settings.setdefault("SPIDER_MIDDLEWARES", {})
            middlewares = settings.getdict("SPIDER_MIDDLEWARES")
            key = "scrapling.integrations.scrapy.ScraplingSpiderMiddleware"
            if key not in middlewares:
                middlewares[key] = 543
                settings.set("SPIDER_MIDDLEWARES", middlewares, priority="addon")
        except Exception:
            pass

    def __init__(self, crawler: Any) -> None:
        self.crawler = crawler
        try:
            cfg = crawler.settings.getdict("SCRAPLING_SELECTOR_CONFIG")  # type: ignore[attr-defined]
        except Exception:
            cfg = {}
        self.selector_config: Dict[str, Any] = dict(cfg or {})
        # Connect signal if available (Scrapy provides signals.spider_opened)
        try:
            from scrapy import signals  # type: ignore

            crawler.signals.connect(self.spider_opened, signal=signals.spider_opened)
        except Exception:
            pass

    def spider_opened(self, spider: Any) -> None:
        # Wrap already-bound spider methods (parse, parse_item, custom callbacks)
        for attr_name in dir(spider):
            try:
                attr = getattr(spider, attr_name)
            except Exception:
                continue
            if not callable(attr):
                continue
            # Heuristic: spider callbacks are methods that accept a response argument;
            # we wrap every callable that is not already wrapped and not private.
            if attr_name.startswith("_"):
                continue
            if getattr(attr, "_scrapling_wrapped", False):
                continue
            # Only wrap methods that look like callbacks (bound methods)
            # We wrap conservatively – scrapling_response will raise later if not a response callback,
            # but the middleware path handles the actual request callbacks. Here we wrap spider methods eagerly.
            try:
                wrapped = _wrap_callback(attr, self.selector_config)
                if wrapped is not attr:
                    try:
                        setattr(spider, attr_name, wrapped)
                    except Exception:
                        pass
            except Exception:
                continue

    @classmethod
    def from_crawler(cls, crawler: Any) -> "ScraplingAddon":  # For Scrapy addon/extension creation
        return cls(crawler)
