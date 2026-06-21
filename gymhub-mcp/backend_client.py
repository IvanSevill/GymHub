"""HTTP client used by the MCP tools to reach the GymHub backend REST API.

The MCP server never touches the database directly: every tool reads and writes
the user's data through the backend, authenticated with the user's JWT, which
the AI server injects in the ``GYMHUB_TOKEN`` environment variable. Centralizing
access here keeps validation and business rules in the backend and makes the
tools trivial to test (only this module talks to the network).
"""

import os

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
                             follow_redirects=True)
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
