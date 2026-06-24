"""HTTP client the AI server uses to reach the GymHub backend REST API.

The AI server never touches the database directly: chat history, memory,
rate-limit usage, the user profile and workout data are all read and written
through the backend, authenticated with the end user's JWT (passed per call,
since the AI server handles many users). Centralizing access here keeps the
business rules and validation in the backend.
"""

import os
from urllib.parse import urljoin, urlparse

import httpx

DEFAULT_TIMEOUT = 30.0


def _base_url() -> str:
    return os.environ.get("BACKEND_URL", "http://localhost:8000").rstrip("/")


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def request(
    method: str,
    path: str,
    token: str,
    *,
    params: dict | None = None,
    json: dict | None = None,
    timeout: float = DEFAULT_TIMEOUT,
):
    """Perform an authenticated request and return parsed JSON (or None on 204).

    Raises ``httpx.HTTPStatusError`` on a non-2xx response so callers can map it
    to the right API error. Follows only same-origin GET redirects (FastAPI's
    trailing-slash 307) to avoid forwarding the user's token to another host.
    """
    url = f"{_base_url()}{path}"
    resp = httpx.request(
        method, url, params=params, json=json, headers=_headers(token),
        timeout=timeout, follow_redirects=False,
    )
    if method.upper() == "GET" and resp.status_code in (301, 302, 307, 308):
        location = resp.headers.get("location", "")
        base = _base_url()
        base_p = urlparse(base)
        abs_url = urljoin(base + "/", location)
        tgt = urlparse(abs_url)
        if tgt.scheme in ("http", "https") and (
            (tgt.scheme, tgt.hostname, tgt.port) == (base_p.scheme, base_p.hostname, base_p.port)
        ):
            resp = httpx.request(
                "GET", abs_url, headers=_headers(token), timeout=timeout, follow_redirects=False
            )
    resp.raise_for_status()
    if resp.status_code == 204 or not resp.content:
        return None
    return resp.json()


def get(path: str, token: str, params: dict | None = None, timeout: float = DEFAULT_TIMEOUT):
    return request("GET", path, token, params=params, timeout=timeout)


def post(path: str, token: str, json: dict | None = None, timeout: float = DEFAULT_TIMEOUT):
    return request("POST", path, token, json=json, timeout=timeout)


def delete(path: str, token: str, timeout: float = DEFAULT_TIMEOUT):
    return request("DELETE", path, token, timeout=timeout)
