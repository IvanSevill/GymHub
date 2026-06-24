"""Unit tests for the AI server's HTTP client to the backend."""

from unittest.mock import MagicMock, patch

import httpx
import pytest

import backend_client


def _resp(status=200, json_body=None, content=b"x", headers=None):
    r = MagicMock(spec=httpx.Response)
    r.status_code = status
    r.headers = headers or {}
    r.content = content
    r.json.return_value = json_body if json_body is not None else {}
    r.raise_for_status.side_effect = (
        None
        if status < 400
        else httpx.HTTPStatusError("err", request=MagicMock(), response=r)
    )
    return r


def test_get_returns_json():
    with patch("backend_client.httpx.request", return_value=_resp(json_body={"ok": 1})) as m:
        out = backend_client.get("/auth/me", "tok")
    assert out == {"ok": 1}
    # Auth header carries the per-request token
    _, kwargs = m.call_args
    assert kwargs["headers"]["Authorization"] == "Bearer tok"


def test_204_returns_none():
    with patch("backend_client.httpx.request", return_value=_resp(status=204, content=b"")):
        assert backend_client.delete("/assistant/history", "tok") is None


def test_post_sends_json_body():
    with patch("backend_client.httpx.request", return_value=_resp(json_body={"id": "a"})) as m:
        out = backend_client.post("/assistant/memory", "tok", {"key": "k", "value": "v"})
    assert out == {"id": "a"}
    _, kwargs = m.call_args
    assert kwargs["json"] == {"key": "k", "value": "v"}


def test_http_error_propagates():
    with patch("backend_client.httpx.request", return_value=_resp(status=404)):
        with pytest.raises(httpx.HTTPStatusError):
            backend_client.get("/nope", "tok")


def test_same_origin_get_redirect_is_followed():
    """A 307 to the same origin is followed once for GET (trailing-slash case)."""
    redirect = _resp(status=307, headers={"location": "http://localhost:8000/workouts/"})
    final = _resp(json_body=[{"id": "w1"}])
    with patch("backend_client.httpx.request", side_effect=[redirect, final]) as m:
        out = backend_client.get("/workouts", "tok")
    assert out == [{"id": "w1"}]
    assert m.call_count == 2


def test_cross_origin_redirect_is_not_followed():
    """A redirect to a different host is NOT followed (token must not leak)."""
    redirect = _resp(status=307, headers={"location": "http://evil.example.com/steal"})
    with patch("backend_client.httpx.request", return_value=redirect) as m:
        out = backend_client.get("/workouts", "tok")
    # Not followed: only one call, and the redirect response (no content json) returns {}
    assert m.call_count == 1
    assert out == {}
