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
    """Records calls and returns queued or fixed responses keyed by path."""

    def __init__(self):
        self.calls: list[tuple[str, str, dict | None]] = []  # (method, path, body/params)
        self.responses: dict[str, object] = {}
        self._queues: dict[str, list] = {}
        self.default = []

    def set(self, path: str, response):
        self.responses[path] = response

    def set_queue(self, path: str, responses: list):
        """Queue responses for a path; sequential calls pop the next one."""
        self._queues[path] = list(responses)

    def _respond(self, path: str):
        if path in self._queues and self._queues[path]:
            return self._queues[path].pop(0)
        return self.responses.get(path, self.default)

    def get(self, path: str, params: dict | None = None, timeout: float = 30.0):
        self.calls.append(("GET", path, params))
        return self._respond(path)

    def post(self, path: str, json: dict | None = None, params: dict | None = None, timeout: float = 30.0):
        self.calls.append(("POST", path, json or params))
        return self._respond(path)

    def put(self, path: str, json: dict | None = None, timeout: float = 30.0):
        self.calls.append(("PUT", path, json))
        return self._respond(path)

    def delete(self, path: str, timeout: float = 30.0):
        self.calls.append(("DELETE", path, None))
        return self._respond(path)

    def last_path(self):
        return self.calls[-1][1] if self.calls else None

    def params_for(self, path: str):
        """Return params from the first GET call matching path (backwards compat)."""
        for method, p, data in self.calls:
            if p == path and method == "GET":
                return data
        return None

    def calls_for(self, path: str, method: str = "GET"):
        return [(m, p, d) for m, p, d in self.calls if p == path and m == method]


@pytest.fixture
def fake(monkeypatch):
    fb = FakeBackend()
    monkeypatch.setattr(backend_client, "get", fb.get)
    monkeypatch.setattr(backend_client, "post", fb.post)
    monkeypatch.setattr(backend_client, "put", fb.put)
    monkeypatch.setattr(backend_client, "delete", fb.delete)
    return fb
