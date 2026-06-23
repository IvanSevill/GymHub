"""Tests for the AI server auth dependency (JWT decode + /auth/me resolution)."""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import httpx
import pytest
from jose import jwt

import backend_client

SECRET_KEY = "test-secret-key-for-testing"


def _token(sub="testuser@example.com"):
    payload = {"exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    if sub is not None:
        payload["sub"] = sub
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


@pytest.mark.asyncio
async def test_token_without_sub_rejected(async_client):
    resp = await async_client.get(
        "/chat/history", headers={"Authorization": f"Bearer {_token(sub=None)}"}
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_backend_unavailable_returns_502(async_client, test_user):
    """If /auth/me errors at transport level, the dependency reports 502."""
    with patch.object(backend_client, "get", side_effect=httpx.ConnectError("down")):
        resp = await async_client.get("/chat/history", headers=test_user["headers"])
    assert resp.status_code == 502


@pytest.mark.asyncio
async def test_user_not_found_returns_401(async_client, test_user, fake_backend):
    """A valid token whose user the backend cannot resolve yields 401."""
    fake_backend.user = {}  # /auth/me returns no id
    resp = await async_client.get("/chat/history", headers=test_user["headers"])
    assert resp.status_code == 401
