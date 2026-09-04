"""End-to-end API smoke tests using FastAPI's TestClient.

Covers every new endpoint added in Phases 1–3 plus the existing ones,
asserting the contract (status, response_model shape, auth requirements).
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest


# ----------------------------------------------------------------------- isolate DB before app import
_tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False, dir="/tmp")
_tmp_db.close()
os.environ["SCC_DB_PATH"] = _tmp_db.name
os.environ["SCC_ADMIN_PASSWORD"] = "test-admin-pw"
os.environ["SCC_ADMIN_EMAIL"] = "admin@example.com"

# Ensure webapp/api is on sys.path so `import app.*` works
_API_DIR = Path(__file__).resolve().parent.parent
if str(_API_DIR) not in sys.path:
    sys.path.insert(0, str(_API_DIR))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app as _app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(_app) as c:
        yield c


@pytest.fixture(scope="module")
def auth_headers(client):
    r = client.post("/api/auth/login", json={"email": "admin@example.com", "password": "test-admin-pw"})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_login_invalid_creds(client):
    r = client.post("/api/auth/login", json={"email": "admin@example.com", "password": "wrong"})
    assert r.status_code == 401


def test_me_requires_auth(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_me_returns_user(client, auth_headers):
    r = client.get("/api/auth/me", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["role"] == "admin"


def test_first_run_hint(client):
    r = client.get("/api/auth/first-run-hint")
    assert r.status_code == 200
    body = r.json()
    assert "hint" in body
    assert body["hint"] is False


def test_system_info(client, auth_headers):
    r = client.get("/api/system/info", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert "scrapling_version" in body
    assert body["app"] == "Scrapling Control Center"
    assert "uptime_seconds" in body


def test_system_disk(client, auth_headers):
    r = client.get("/api/system/disk", headers=auth_headers)
    assert r.status_code == 200
    for key in ("exports_bytes", "crawls_bytes", "dev_cache_bytes", "adaptive_db_bytes", "db_bytes"):
        assert key in r.json()


def test_parse_pagination(client, auth_headers):
    r = client.post(
        "/api/parse/pagination",
        headers=auth_headers,
        json={"html": '<a href="/p/2" rel="next">Next</a>', "url": "https://x.com/p/1"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "links" in body and "next_page" in body
    assert body["next_page"] == "https://x.com/p/2"


def test_parse_schemas(client, auth_headers):
    r = client.post(
        "/api/parse/schemas",
        headers=auth_headers,
        json={"html": '<html><head><meta property="og:title" content="Hello"></head></html>'},
    )
    assert r.status_code == 200
    body = r.json()
    assert "opengraph" in body
    assert body["opengraph"].get("og:title") == "Hello"


def test_parse_analyze(client, auth_headers):
    r = client.post(
        "/api/parse/analyze",
        headers=auth_headers,
        json={"html": "<html><head><title>T</title></head><body><h1>A</h1></body></html>"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "report" in body
    assert body["report"]["title"] == "T"


def test_parse_regex(client, auth_headers):
    r = client.post(
        "/api/parse/regex",
        headers=auth_headers,
        json={
            "html": '<a href="/p/1">x</a><a href="/p/2">x</a><a href="/p/3">x</a>',
            "css": "a",
            "attr": "href",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "pattern" in body
    assert r"\d" in body["pattern"]
    # All sample values must match the generated pattern
    import re as _re
    rx = _re.compile(body["pattern"])
    for s in body["sample"]:
        assert rx.match(s), f"{s!r} did not match {body['pattern']!r}"


def test_parse_regex_no_match(client, auth_headers):
    r = client.post(
        "/api/parse/regex",
        headers=auth_headers,
        json={"html": "<html></html>", "css": "div.no-such"},
    )
    assert r.status_code == 422


def test_convert_selector_css_to_xpath(client, auth_headers):
    r = client.post(
        "/api/parse/convert-selector",
        headers=auth_headers,
        json={"selector": "a.foo", "target": "xpath", "from": "css"},
    )
    assert r.status_code == 200
    result = r.json()["result"]
    assert "a" in result
    assert "foo" in result
    assert ("::" in result or "//" in result or "[")  # XPath-ish syntax


def test_convert_selector_same_in_and_out(client, auth_headers):
    r = client.post(
        "/api/parse/convert-selector",
        headers=auth_headers,
        json={"selector": "a", "target": "css", "from": "css"},
    )
    assert r.json()["result"] == "a"


def test_curl_parse(client, auth_headers):
    r = client.post(
        "/api/parse/curl-parse",
        headers=auth_headers,
        json={"curl": "curl -X POST -H 'X-Test: 1' -H 'Content-Type: application/json' -d '{\"a\":1}' https://api.example.com/v1/x"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["method"] == "POST"
    assert body["url"] == "https://api.example.com/v1/x"
    assert body["headers"]["X-Test"] == "1"


def test_text_utils_clean_spaces(client, auth_headers):
    r = client.post(
        "/api/parse/text-utils",
        headers=auth_headers,
        json={"text": "  hello   world  ", "op": "clean_spaces"},
    )
    assert r.status_code == 200
    result = r.json()["result"].strip()
    assert result == "hello world"


def test_text_utils_word_count(client, auth_headers):
    r = client.post(
        "/api/parse/text-utils",
        headers=auth_headers,
        json={"text": "one two three four", "op": "word_count"},
    )
    assert r.json()["result"] == 4


def test_parse_playground(client, auth_headers):
    r = client.post(
        "/api/parse",
        headers=auth_headers,
        json={
            "html": '<html><body><h1 class="title">Hello</h1></body></html>',
            "steps": [{"method": "css", "selector": "h1.title", "attr": "text"}],
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert "results" in body and "tree" in body


def test_selectors_crud(client, auth_headers):
    r = client.post(
        "/api/selectors",
        headers=auth_headers,
        json={
            "name": "Test selector",
            "target_url": "https://example.com",
            "selector_spec": {"method": "css", "selector": "h1"},
        },
    )
    assert r.status_code == 201
    sid = r.json()["id"]

    r = client.get("/api/selectors", headers=auth_headers)
    assert r.status_code == 200
    assert any(s["id"] == sid for s in r.json())

    r = client.delete(f"/api/selectors/{sid}", headers=auth_headers)
    assert r.status_code == 200


def test_proxies_crud(client, auth_headers):
    r = client.post(
        "/api/proxies",
        headers=auth_headers,
        json={"label": "test-proxy-1", "url_or_server": "http://1.2.3.4:8080"},
    )
    assert r.status_code == 201
    pid = r.json()["id"]

    r = client.get("/api/proxies", headers=auth_headers)
    assert any(p["id"] == pid for p in r.json())

    r = client.delete(f"/api/proxies/{pid}", headers=auth_headers)
    assert r.status_code == 200


_VALID_JOB_SPEC = {
    "template": "custom",
    "engine": "static",
    "settings": {},
    "template_config": {},
}


def test_jobs_crud(client, auth_headers):
    r = client.post(
        "/api/jobs",
        headers=auth_headers,
        json={
            "name": "Test job",
            "template": "custom",
            "engine": "static",
            "spec": _VALID_JOB_SPEC,
        },
    )
    assert r.status_code == 201, r.text
    jid = r.json()["id"]

    r = client.get("/api/jobs", headers=auth_headers)
    assert any(j["id"] == jid for j in r.json())

    r = client.get(f"/api/runs?job_id={jid}", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)

    r = client.delete(f"/api/jobs/{jid}", headers=auth_headers)
    assert r.status_code == 200


def test_jobs_schedule_validation(client, auth_headers):
    """Set then clear a schedule; both must work and round-trip correctly."""
    r = client.post(
        "/api/jobs",
        headers=auth_headers,
        json={
            "name": "Scheduled job",
            "template": "custom",
            "engine": "static",
            "spec": _VALID_JOB_SPEC,
        },
    )
    assert r.status_code == 201, r.text
    jid = r.json()["id"]
    r = client.post(f"/api/jobs/{jid}/schedule", headers=auth_headers, json={"cron": "not-a-cron"})
    assert r.status_code == 422
    r = client.post(f"/api/jobs/{jid}/schedule", headers=auth_headers, json={"cron": "*/5 * * * *"})
    assert r.status_code == 200
    assert r.json()["schedule_cron"] == "*/5 * * * *"
    assert r.json()["next_run_at"] is not None
    r = client.post(f"/api/jobs/{jid}/schedule", headers=auth_headers, json={"cron": None})
    assert r.status_code == 200
    assert r.json()["schedule_cron"] is None
    client.delete(f"/api/jobs/{jid}", headers=auth_headers)


def test_audit_logs_login(client, auth_headers):
    r = client.get("/api/audit?limit=20", headers=auth_headers)
    assert r.status_code == 200
    actions = [row["action"] for row in r.json()]
    assert "login" in actions


def test_api_keys_admin_only(client):
    r = client.post("/api/api-keys", json={"name": "x"})
    assert r.status_code == 401


def test_users_admin_only(client):
    r = client.post("/api/users", json={"email": "x@y.z", "password": "abcdef123"})
    assert r.status_code == 401


def test_audit_admin_only(client):
    r = client.get("/api/audit")
    assert r.status_code == 401


def test_shell_help_admin_only(client):
    r = client.get("/api/shell/help")
    assert r.status_code == 401


def test_shell_exec_validate_regex(client, auth_headers):
    r = client.post(
        "/api/shell/exec", headers=auth_headers, json={"op": "validate_regex", "pattern": "("}
    )
    assert r.status_code == 200
    assert r.json()["valid"] is False
    assert r.json()["error"]


def test_shell_exec_extract_emails(client, auth_headers):
    r = client.post(
        "/api/shell/exec",
        headers=auth_headers,
        json={"op": "extract_emails", "data": "Contact me at test@example.com or admin@example.com"},
    )
    assert r.status_code == 200


def test_shell_exec_unknown_op(client, auth_headers):
    r = client.post("/api/shell/exec", headers=auth_headers, json={"op": "rm_rf"})
    assert r.status_code == 422


def test_openapi_has_response_models(client):
    r = client.get("/openapi.json")
    assert r.status_code == 200
    spec = r.json()
    paths = spec.get("paths", {})
    for p in ("/api/auth/login", "/api/parse/pagination", "/api/parse/schemas",
              "/api/parse/analyze", "/api/system/info", "/api/system/disk",
              "/api/jobs/{job_id}/schedule"):
        assert p in paths, f"missing {p} in OpenAPI"
        # Each path has get/post/put/delete/... — pick the first one
        method_obj = next(iter(paths[p].values()))
        responses = method_obj.get("responses", {})
        twoxx = [k for k in responses.keys() if k.startswith("2")]
        assert twoxx, f"no 2xx response for {p}: keys={list(responses.keys())}"
        for code in twoxx:
            content = responses[code].get("content", {}).get("application/json", {})
            assert "schema" in content, f"no schema on {p} {code}"


def test_page_action_member_forbidden(client, auth_headers):
    r = client.post(
        "/api/users",
        headers=auth_headers,
        json={"email": "member@example.com", "password": "memberpass1", "role": "member"},
    )
    r = client.post("/api/auth/login", json={"email": "member@example.com", "password": "memberpass1"})
    assert r.status_code == 200
    member_token = r.json()["access_token"]
    member_headers = {"Authorization": f"Bearer {member_token}"}
    r = client.post(
        "/api/fetch",
        headers=member_headers,
        json={
            "url": "https://example.com",
            "engine": "dynamic",
            "page_action": "print('x')",
        },
    )
    assert r.status_code == 403