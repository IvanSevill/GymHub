"""Test configuration and fixtures for the ai-server test suite.

The AI server no longer touches a database: every data access goes through the
backend REST API via ``backend_client``. Tests replace that module's functions
with an in-memory fake, so no DB or live backend is needed.
"""

import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from jose import jwt

# Env vars must be set before importing modules that read them at import time
# (auth.py raises if SECRET_KEY is missing).
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing")
os.environ.setdefault("BACKEND_URL", "http://localhost:8000")
os.environ.setdefault("GEMINI_API_KEY", "test-key")

_AI_SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _AI_SERVER_DIR not in sys.path:
    sys.path.insert(0, _AI_SERVER_DIR)

import backend_client as _backend_client  # noqa: E402
from main import app  # noqa: E402

SECRET_KEY = "test-secret-key-for-testing"
ALGORITHM = "HS256"


class FakeBackend:
    """In-memory stand-in for the backend REST API used by the AI server."""

    def __init__(self):
        self.history: list[dict] = []
        self.memories: list[dict] = []
        self.usage_count = 0
        self.is_root = False
        self.user = {"id": "user-1", "name": "Test User", "is_root": 0}
        self.workouts: list[dict] = []

    def get(self, path, token, params=None, timeout=30.0):
        if path == "/auth/me":
            return self.user
        if path == "/assistant/history":
            return list(self.history)
        if path == "/assistant/memory":
            return list(self.memories)
        if path == "/assistant/usage":
            return {
                "used": self.usage_count,
                "limit": None if self.is_root else 5,
                "reset_at": None,
                "is_root": self.is_root,
            }
        if path == "/workouts":
            return list(self.workouts)
        raise AssertionError(f"unexpected GET {path}")

    def post(self, path, token, json=None, timeout=30.0):
        if path == "/assistant/history":
            self.history.append({"role": json["role"], "content": json["content"]})
            if json["role"] == "user":
                self.usage_count += 1
            return {"ok": True}
        if path == "/assistant/memory":
            for m in self.memories:
                if m["key"] == json["key"]:
                    m["value"] = json["value"]
                    return m
            mem = {"id": str(uuid.uuid4()), "key": json["key"], "value": json["value"], "created_at": "now"}
            self.memories.append(mem)
            return mem
        raise AssertionError(f"unexpected POST {path}")

    def delete(self, path, token, timeout=30.0):
        if path == "/assistant/history":
            self.history.clear()
            return None
        if path.startswith("/assistant/memory/"):
            mid = path.rsplit("/", 1)[1]
            self.memories = [m for m in self.memories if m["id"] != mid]
            return None
        raise AssertionError(f"unexpected DELETE {path}")


@pytest.fixture
def fake_backend(monkeypatch):
    fb = FakeBackend()
    monkeypatch.setattr(_backend_client, "get", fb.get)
    monkeypatch.setattr(_backend_client, "post", fb.post)
    monkeypatch.setattr(_backend_client, "delete", fb.delete)
    return fb


@pytest.fixture
async def async_client(fake_backend):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as ac:
        yield ac


@pytest.fixture
def test_user():
    """Return a valid JWT and auth headers for a standard (non-root) user."""
    email = "testuser@example.com"
    token = jwt.encode(
        {"sub": email, "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )
    return {"email": email, "token": token, "headers": {"Authorization": f"Bearer {token}"}}
