import os
import sys

# Make the gymhub-mcp package modules importable (they are top-level scripts).
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Safe defaults so importing models/database does not require a real database.
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("BACKEND_URL", "http://test-backend")
os.environ.setdefault("GYMHUB_TOKEN", "test-token")

import pytest  # noqa: E402

import backend_client  # noqa: E402


class FakeBackend:
    """Records GET calls and returns queued responses keyed by path."""

    def __init__(self):
        self.calls: list[tuple[str, dict | None]] = []
        self.responses: dict[str, object] = {}
        self.default = []

    def set(self, path: str, response):
        self.responses[path] = response

    def get(self, path: str, params: dict | None = None, timeout: float = 30.0):
        self.calls.append((path, params))
        return self.responses.get(path, self.default)

    def last_path(self):
        return self.calls[-1][0] if self.calls else None

    def params_for(self, path: str):
        for p, params in self.calls:
            if p == path:
                return params
        return None


@pytest.fixture
def fake(monkeypatch):
    fb = FakeBackend()
    monkeypatch.setattr(backend_client, "get", fb.get)
    return fb
