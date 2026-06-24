"""Tests for chat.py helpers and the cheap /chat guard branches."""

from types import SimpleNamespace

import pytest

import chat


# --------------------------------------------------------------------------
# Pure helpers
# --------------------------------------------------------------------------

def test_unwrap_exc_unwraps_group():
    inner = ValueError("root cause")
    group = SimpleNamespace(exceptions=[inner])
    assert chat._unwrap_exc(group) == "root cause"


def test_unwrap_exc_plain():
    assert chat._unwrap_exc(RuntimeError("boom")) == "boom"


def test_json_schema_to_genai_object_and_array():
    schema = {
        "type": "object",
        "properties": {
            "days": {"type": "integer", "description": "n days"},
            "names": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["days"],
    }
    out = chat._json_schema_to_genai(schema)
    assert out.type == "OBJECT"
    assert "days" in out.properties
    assert out.properties["names"].type == "ARRAY"


def test_mcp_to_genai_tools_builds_declaration():
    tool = SimpleNamespace(
        name="get_workouts",
        description="lista entrenos",
        inputSchema={"type": "object", "properties": {"days": {"type": "integer"}}},
    )
    tools = chat._mcp_to_genai_tools([tool])
    assert len(tools) == 1
    assert tools[0].function_declarations[0].name == "get_workouts"


def test_mcp_to_genai_tools_empty():
    assert chat._mcp_to_genai_tools([]) == []


def test_system_prompt_includes_memories_and_workouts():
    prompt = chat._system_prompt(
        "Iván",
        memories=[{"key": "objetivo", "value": "ganar masa"}],
        recent_workouts=[{"date": "2026-06-01", "title": "Pecho", "exercises": {"Press": ["80 kg"]}}],
    )
    assert "Iván" in prompt
    assert "objetivo" in prompt
    assert "Pecho" in prompt


# --------------------------------------------------------------------------
# Backend-delegating helpers (use the fake backend fixture)
# --------------------------------------------------------------------------

def test_load_history_helper(fake_backend):
    fake_backend.history = [{"role": "user", "content": "hola"}]
    assert chat._load_history("tok") == [{"role": "user", "content": "hola"}]


def test_get_usage_helper(fake_backend):
    fake_backend.usage_count = 3
    assert chat._get_usage("tok")["used"] == 3


def test_load_recent_workouts_helper(fake_backend):
    fake_backend.workouts = [
        {
            "start_time": "2026-06-01T10:00:00",
            "title": "Pierna",
            "exercise_sets": [
                {"exercise": {"name": "Sentadilla"}, "value": "100", "measurement": "kg"}
            ],
        }
    ]
    out = chat._load_recent_workouts("tok")
    assert out[0]["title"] == "Pierna"
    assert out[0]["exercises"]["Sentadilla"] == ["100 kg"]


# --------------------------------------------------------------------------
# /chat guard branches
# --------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_chat_empty_message_rejected(async_client, test_user):
    resp = await async_client.post("/chat", headers=test_user["headers"], json={"message": "   "})
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_chat_rate_limit_429(async_client, test_user, fake_backend):
    fake_backend.usage_count = 5  # at the limit for a standard user
    resp = await async_client.post("/chat", headers=test_user["headers"], json={"message": "hola"})
    assert resp.status_code == 429


@pytest.mark.asyncio
async def test_chat_no_gemini_key_503(async_client, test_user, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    resp = await async_client.post("/chat", headers=test_user["headers"], json={"message": "hola"})
    assert resp.status_code == 503
