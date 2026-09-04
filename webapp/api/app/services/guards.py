"""P0 security guards — SSRF / path-traversal / admin-action helpers.

Single shared module so fetch.py, sessions.py, spider_factory, job_runner,
exporters and main.py all enforce the same policy.
"""
from __future__ import annotations

import ipaddress
import logging
import re
import socket
import time
from pathlib import Path
from urllib.parse import urlparse

from fastapi import HTTPException

_log = logging.getLogger("scc.guards")

# ------------------------------------------------------------------ constants
# 5MB response cap: enforced by truncation in engines.serialize_response
# (text capped) and by Content-Length pre-checks where available.
MAX_RESPONSE_BYTES = 5 * 1024 * 1024
# 30s overall fetch cap (seconds). Static timeouts are seconds, browser ms.
MAX_FETCH_TIMEOUT_SECS = 30

_DENIED_NETS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]


def _ip_denied(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return True  # fail closed on unparsable
    # Explicit denylist from the P0 spec.
    for net in _DENIED_NETS:
        try:
            if ip in net:
                return True
        except TypeError:
            continue  # v4 vs v6 mismatch
    # Defense-in-depth: also deny anything stdlib flags as non-global,
    # except we still allow normal public unicast.
    try:
        if ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved:
            return True
        # is_private covers 10/8,172.16/12,192.168/16 + CGNAT 100.64/10 etc.
        if getattr(ip, "is_private", False):
            return True
        if getattr(ip, "is_global", False) is False:
            # Covers unspecified (0.0.0.0, ::) and other special ranges.
            return True
    except Exception:
        return True
    return False


def validate_url(
    url: str,
    *,
    allowlist: list[str] | None = None,
    timeout: float | None = None,
    timeout_is_ms: bool = False,
) -> str:
    """Validate an outbound fetch/crawl URL. Raises HTTPException(422/403) on failure.

    - Scheme must be http/https only.
    - Host is DNS-resolved via ``socket.getaddrinfo``; every resolved A/AAAA
      must NOT fall in 10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1
      (plus 0.0.0.0/8, fc00::/7, fe80::/10). DNS failure => deny (fail closed).
    - ``timeout`` (if given) is capped at 30s (``MAX_FETCH_TIMEOUT_SECS``).
      Pass ms for browser engines with ``timeout_is_ms=True``.
    - 5MB response cap is documented here and enforced at serialization
      (see ``MAX_RESPONSE_BYTES`` + engines.serialize_response truncation).
    - Optional ``allowlist`` restricts host to outbound_domain_allowlist.
    Returns the normalized URL on success.
    """
    if not url or not isinstance(url, str):
        raise HTTPException(422, "URL is required")
    url = url.strip()
    try:
        parts = urlparse(url)
    except Exception:
        raise HTTPException(422, f"Invalid URL: {url!r}")
    if parts.scheme.lower() not in ("http", "https"):
        raise HTTPException(422, f"Only http/https URLs allowed, got scheme {parts.scheme!r}")
    host = parts.hostname
    if not host:
        raise HTTPException(422, f"URL missing hostname: {url!r}")
    # Block userinfo credentials in URL (leak via logs) — fail closed.
    # (urllib splits them; we simply reject to avoid log exfil.)
    if "@" in (parts.netloc or "") and parts.username:
        # Allow? No — reject to keep logs clean.
        raise HTTPException(422, "Credentials in URL are not allowed")

    # DNS-resolve and deny private/link-local/loopback targets (SSRF guard).
    try:
        # getaddrinfo has no timeout kwarg; the surrounding fetch enforces the
        # 30s cap. Resolution failure denies (fail closed).
        infos = socket.getaddrinfo(host, None, family=socket.AF_UNSPEC, type=socket.SOCK_STREAM)
    except socket.gaierror as e:
        raise HTTPException(422, f"DNS resolution failed for {host!r}: {e}")
    except Exception as e:
        raise HTTPException(422, f"DNS resolution failed for {host!r}: {type(e).__name__}: {e}")
    if not infos:
        raise HTTPException(422, f"DNS resolution returned no addresses for {host!r}")
    for info in infos:
        try:
            ip_str = info[4][0]
        except Exception:
            continue
        if _ip_denied(ip_str):
            raise HTTPException(403, f"Target {host!r} resolves to blocked address {ip_str}")

    # 30s timeout cap.
    if timeout is not None:
        try:
            t = float(timeout)
        except (TypeError, ValueError):
            raise HTTPException(422, f"Invalid timeout: {timeout!r}")
        limit = MAX_FETCH_TIMEOUT_SECS * 1000 if timeout_is_ms else MAX_FETCH_TIMEOUT_SECS
        if t > limit:
            raise HTTPException(
                422, f"Timeout {t} exceeds {MAX_FETCH_TIMEOUT_SECS}s cap"
            )
        if t <= 0:
            raise HTTPException(422, "Timeout must be positive")

    # Optional domain allowlist (outbound_domain_allowlist).
    if allowlist:
        h = host.lower()
        if not any(h == d.lower() or h.endswith("." + d.lower()) for d in allowlist):
            raise HTTPException(403, f"Host {h!r} not in outbound_domain_allowlist")

    return url


def slugify_job_name(name: str, *, max_len: int = 64) -> str:
    """Slugify a job name for safe directory/file use.

    Keeps [A-Za-z0-9_.-], replaces anything else with '_', collapses repeats,
    strips leading dots/dashes (hidden files / option injection), caps length.
    """
    if not name or not isinstance(name, str):
        raise ValueError("job name is required")
    slug = re.sub(r"[^A-Za-z0-9_.\-]+", "_", name.strip())
    slug = re.sub(r"_+", "_", slug)
    slug = slug.strip("._-") or "job"
    if len(slug) > max_len:
        slug = slug[:max_len].rstrip("._-") or "job"
    # Reject path separators / traversal remnants explicitly.
    if "/" in slug or "\\" in slug or slug in (".", ".."):
        raise ValueError(f"Unsafe job name: {name!r}")
    return slug


def validate_path(user_path: str | Path, *, base: Path | None = None) -> Path:
    """Validate a filesystem path stays inside ``base`` (default: data_dir).

    - Rejects absolute paths (callers must pass paths relative to ``base``).
    - Resolves symlinks via ``Path.resolve()`` and requires
      ``resolved.is_relative_to(base_resolved)``.
    - Raises HTTPException(422/403) on violation (fail closed).
    Returns the resolved absolute Path.
    """
    if base is None:
        from ..config import settings as _settings

        base = _settings.data_dir
    base = Path(base)
    try:
        base_resolved = base.resolve()
    except Exception:
        base_resolved = base.absolute()
    p = Path(user_path) if isinstance(user_path, (str, Path)) else None
    if p is None or str(user_path).strip() == "":
        raise HTTPException(422, "Path is required")
    # Reject absolute paths outright — all persisted paths must be relative
    # to the data dir so deployments stay relocatable and auditable.
    if p.is_absolute():
        raise HTTPException(403, f"Absolute paths not allowed: {str(user_path)!r}")
    # Reject NUL bytes / drive specs.
    s = str(user_path)
    if "\x00" in s or re.match(r"^[A-Za-z]:", s):
        raise HTTPException(403, f"Blocked path: {s!r}")
    try:
        resolved = (base_resolved / p).resolve()
    except Exception as e:
        raise HTTPException(422, f"Invalid path {s!r}: {e}")
    try:
        # Python 3.9+: is_relative_to
        inside = resolved.is_relative_to(base_resolved)  # type: ignore[attr-defined]
    except AttributeError:
        try:
            resolved.relative_to(base_resolved)
            inside = True
        except ValueError:
            inside = False
    if not inside:
        raise HTTPException(403, f"Path escapes data dir: {s!r}")
    return resolved


def validate_crawldir(crawldir: str | Path | None, *, base: Path | None = None) -> Path | None:
    """Validate a spider crawldir (checkpoint dir). None stays None."""
    if crawldir is None or (isinstance(crawldir, str) and crawldir.strip() == ""):
        return None
    return validate_path(crawldir, base=base)


# ------------------------------------------------------- admin-action guard
def require_admin_action(
    user: dict | None,
    *,
    page_action: str | None = None,
    page_setup: str | None = None,
    has_action: bool | None = None,
) -> None:
    """Shared admin-only gate for page_action / page_setup.

    Correct precedence — equivalent to::

        if ((page_action) or (page_setup) or (has_action)) and role != "admin":
            raise 403

    Callers must compute ``has_action`` for nested configs (e.g. sessions.py
    stealth/dynamic configs) and pass it explicitly. Raises
    HTTPException(403) for non-admin use; no-op otherwise (including admin).
    """
    if has_action is None:
        has_action = bool(page_action or page_setup)
    # NOTE: parentheses are load-bearing here. `and` binds tighter than `or`,
    # so `A or B and C` == `A or (B and C)` — the bug this helper fixes.
    # Always parenthesize: ((A) or (B)) and (C).
    if ((bool(page_action) or bool(page_setup) or bool(has_action))) and (
        not user or user.get("role") != "admin"
    ):
        raise HTTPException(403, "page_action / page_setup are admin-only")


def strip_page_action_for_non_admin(spec: object, user: dict | None) -> None:
    """Defense-in-depth: strip page_action/page_setup from a pydantic spec
    for non-admin callers BEFORE browser_fetch. Mutates in place (best-effort).
    Admin callers are untouched.
    """
    try:
        if user is not None and user.get("role") == "admin":
            return
    except Exception:
        pass
    for attr in ("page_action", "page_setup"):
        try:
            if hasattr(spec, attr) and getattr(spec, attr):
                setattr(spec, attr, None)
                _log.warning("stripped %s for non-admin caller", attr)
        except Exception:
            continue


# ------------------------------------------------------- login rate limiting
# Simple in-memory sliding-window limiter (5/min per key) used when slowapi
# is not installed. Process-local; sufficient for single-replica OSS deploys.
# Multi-replica deployments should front with a reverse-proxy limit or Redis.
_LOGIN_ATTEMPTS: dict[str, list[float]] = {}
_LOGIN_WINDOW_SECS = 60.0
_LOGIN_MAX_ATTEMPTS = 5


def check_login_rate_limit(key: str) -> None:
    """Raise HTTPException(429) if ``key`` (IP/email) exceeded 5/min."""
    now = time.monotonic()
    attempts = _LOGIN_ATTEMPTS.get(key, [])
    # Prune outside window.
    attempts = [t for t in attempts if now - t < _LOGIN_WINDOW_SECS]
    if len(attempts) >= _LOGIN_MAX_ATTEMPTS:
        raise HTTPException(429, "Too many login attempts — try again in a minute")
    attempts.append(now)
    _LOGIN_ATTEMPTS[key] = attempts


def _reset_login_rate_limit_for_tests() -> None:  # pragma: no cover
    _LOGIN_ATTEMPTS.clear()
