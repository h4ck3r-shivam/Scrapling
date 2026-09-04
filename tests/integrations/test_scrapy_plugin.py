"""Tests for the Scrapy plugin (middlewares + addon) introduced in roadmap completion."""

import inspect

import pytest
import scrapy
from scrapy.http import HtmlResponse, Request

from scrapling.engines.toolbelt.custom import Response as ScraplingResponse
from scrapling.integrations.scrapy import (
    ScraplingAddon,
    ScraplingDownloaderMiddleware,
    ScraplingSpiderMiddleware,
    convert_response,
)

PAGE = b"""<html><head><title>Test</title></head><body><h1>Hello</h1><a href="/next">Next</a></body></html>"""


def make_response(**kwargs):
    if "request" not in kwargs:
        kwargs["request"] = Request("http://example.com/page", headers={"User-Agent": "pytest"}, meta={"depth": 1})
    defaults = {"url": "http://example.com/page", "body": PAGE, "headers": {"Content-Type": "text/html; charset=utf-8"}, "status": 200}
    defaults.update(kwargs)
    return HtmlResponse(**defaults)


class FakeSettings(dict):
    def getdict(self, key, default=None):
        val = self.get(key, default)
        return dict(val) if isinstance(val, dict) else (default or {})

    def set(self, key, value, priority=None):
        self[key] = value

    def setdefault(self, key, default=None):
        return super().setdefault(key, default)


class FakeCrawler:
    def __init__(self, settings_dict=None):
        self.settings = FakeSettings(settings_dict or {})
        self.signals = type("S", (), {"connect": lambda *a, **kw: None})()


class TestSpiderMiddleware:
    def test_process_spider_input_wraps_callback(self):
        crawler = FakeCrawler()
        mw = ScraplingSpiderMiddleware(crawler)

        def my_cb(response):
            return response.css("h1::text").get()

        req = Request("http://example.com/page", callback=my_cb)
        resp = make_response(request=req)

        assert not getattr(req.callback, "_scrapling_wrapped", False)
        mw.process_spider_input(resp, spider=None)
        assert getattr(req.callback, "_scrapling_wrapped", False)
        # Calling the wrapped callback should receive Scrapling Response
        result = req.callback(resp)
        assert result == "Hello"

    def test_process_spider_output_wraps_yielded_requests(self):
        crawler = FakeCrawler()
        mw = ScraplingSpiderMiddleware(crawler)

        def cb(response):
            return response.url

        def cb_next(response):
            return response.url

        resp = make_response()
        yielded = [Request("http://example.com/next", callback=cb_next)]
        # Simulate spider output containing a Request
        result = list(mw.process_spider_output(resp, yielded, spider=None))
        assert len(result) == 1
        assert getattr(result[0].callback, "_scrapling_wrapped", False)

    def test_process_start_requests_wraps(self):
        crawler = FakeCrawler()
        mw = ScraplingSpiderMiddleware(crawler)

        def cb(response):
            pass

        reqs = [Request("http://example.com/", callback=cb)]
        result = list(mw.process_start_requests(reqs, spider=None))
        assert getattr(result[0].callback, "_scrapling_wrapped", False)

    def test_selector_config_forwarded(self):
        crawler = FakeCrawler({"SCRAPLING_SELECTOR_CONFIG": {"keep_comments": True}})
        mw = ScraplingSpiderMiddleware(crawler)
        assert mw.selector_config == {"keep_comments": True}

    def test_double_wrap_is_idempotent(self):
        crawler = FakeCrawler()
        mw = ScraplingSpiderMiddleware(crawler)

        def cb(response):
            return 1

        req = Request("http://example.com/", callback=cb)
        resp = make_response(request=req)
        mw.process_spider_input(resp, None)
        first_wrapped = req.callback
        mw.process_spider_input(resp, None)
        assert req.callback is first_wrapped


class TestDownloaderMiddleware:
    def test_process_response_adds_scrapling_attribute(self):
        dm = ScraplingDownloaderMiddleware({})
        req = Request("http://example.com/")
        resp = make_response(request=req)
        out = dm.process_response(req, resp, spider=None)
        assert out is resp
        assert hasattr(resp, "scrapling")
        assert hasattr(resp, "_scrapling_response")
        assert isinstance(resp.scrapling, ScraplingResponse)
        assert resp.scrapling.css("h1::text").get() == "Hello"

    def test_from_crawler(self):
        crawler = FakeCrawler({"SCRAPLING_SELECTOR_CONFIG": {"adaptive": True}})
        dm = ScraplingDownloaderMiddleware.from_crawler(crawler)
        assert dm.selector_config == {"adaptive": True}


class TestAddon:
    def test_update_settings_registers_middleware(self):
        settings = FakeSettings({})
        ScraplingAddon.update_settings(settings)
        assert "scrapling.integrations.scrapy.ScraplingSpiderMiddleware" in settings["SPIDER_MIDDLEWARES"]

    def test_update_settings_does_not_overwrite(self):
        settings = FakeSettings({"SPIDER_MIDDLEWARES": {"scrapling.integrations.scrapy.ScraplingSpiderMiddleware": 100}})
        ScraplingAddon.update_settings(settings)
        assert settings["SPIDER_MIDDLEWARES"]["scrapling.integrations.scrapy.ScraplingSpiderMiddleware"] == 100

    def test_spider_opened_wraps_spider_methods(self):
        crawler = FakeCrawler()
        addon = ScraplingAddon(crawler)

        class MySpider(scrapy.Spider):
            name = "test"

            def parse(self, response):
                return response.css("h1::text").get()

            def parse_next(self, response):
                return 1

            def _private(self, response):
                return 1

        spider = MySpider()
        original_parse = spider.parse
        addon.spider_opened(spider)
        assert getattr(spider.parse, "_scrapling_wrapped", False)
        assert getattr(spider.parse_next, "_scrapling_wrapped", False)
        # private should not be wrapped
        assert not getattr(spider._private, "_scrapling_wrapped", False)
        # wrapped parse should still work
        resp = make_response()
        assert spider.parse(resp) == "Hello"

    def test_from_crawler(self):
        crawler = FakeCrawler()
        addon = ScraplingAddon.from_crawler(crawler)
        assert isinstance(addon, ScraplingAddon)
