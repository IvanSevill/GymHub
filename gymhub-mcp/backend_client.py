"""HTTP client used by the MCP tools to reach the GymHub backend REST API.

The MCP server never touches the database directly: every tool reads and writes
the user's data through the backend, authenticated with the user's JWT, which
the AI server injects in the ``GYMHUB_TOKEN`` environment variable. Centralizing
access here keeps validation and business rules in the backend and makes the
tools trivial to test (only this module talks to the network).
"""

import os
from urllib.parse import urlparse, urljoin

import httpx

DEFAULT_TIMEOUT = 30.0


def _base_url() -> str:
    return os.environ.get("BACKEND_URL", "http://localhost:8000").rstrip("/")


def _headers() -> dict:
    return {"Authorization": f"Bearer {os.environ.get('GYMHUB_TOKEN', '')}"}


def _request(method: str, path: str, *, params: dict | None = None, json: dict | None = None,
             timeout: float = DEFAULT_TIMEOUT):
    """Perform an authenticated request and return parsed JSON.

    On any HTTP or transport error returns ``{"error": ...}`` so the tools
    degrade gracefully instead of raising into the model's tool loop.
    """
    url = f"{_base_url()}{path}"
    try:
        resp = httpx.request(method, url, params=params, json=json,
                             headers=_headers(), timeout=timeout,
                             follow_redirects=False)
        # Follow same-origin redirects for GET only (handles FastAPI trailing-slash 307).
        # POST/PUT/DELETE never follow redirects — prevents credential forwarding to unintended targets.
        # Use URL parsing (not string prefix) to validate same scheme+host+port.
        if method.upper() == "GET" and resp.status_code in (301, 302, 307, 308):
            location = resp.headers.get("location", "")
            base = _base_url()
            base_p = urlparse(base)
            abs_url = urljoin(base + "/", location)
            tgt = urlparse(abs_url)
            if (tgt.scheme in ("http", "https") and
                    (tgt.scheme, tgt.hostname, tgt.port) == (base_p.scheme, base_p.hostname, base_p.port)):
                resp = httpx.request("GET", abs_url, headers=_headers(),
                                     timeout=timeout, follow_redirects=False)
        resp.raise_for_status()
        if resp.status_code == 204 or not resp.content:
            return {}
        return resp.json()
    except httpx.HTTPStatusError as exc:
        return {"error": f"backend HTTP {exc.response.status_code}", "detail": exc.response.text}
    except Exception as exc:  # network errors, timeouts, JSON decode
        return {"error": str(exc)}


def get(path: str, params: dict | None = None, timeout: float = DEFAULT_TIMEOUT):
    return _request("GET", path, params=params, timeout=timeout)


def post(path: str, json: dict | None = None, params: dict | None = None, timeout: float = DEFAULT_TIMEOUT):
    return _request("POST", path, params=params, json=json, timeout=timeout)


def put(path: str, json: dict | None = None, timeout: float = DEFAULT_TIMEOUT):
    return _request("PUT", path, json=json, timeout=timeout)


def delete(path: str, timeout: float = DEFAULT_TIMEOUT):
    return _request("DELETE", path, timeout=timeout)


def is_error(data) -> bool:
    """True when a client call returned an error envelope."""
    return isinstance(data, dict) and "error" in data
