"""Integration tests for ai-server HTTP endpoints (backend access is faked)."""

import pytest


@pytest.mark.asyncio
async def test_health_endpoint(async_client):
    response = await async_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "gymhub-ai"


@pytest.mark.asyncio
async def test_chat_history_requires_auth(async_client):
    response = await async_client.get("/chat/history")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_chat_history_returns_empty_list(async_client, test_user):
    response = await async_client.get("/chat/history", headers=test_user["headers"])
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_clear_history(async_client, test_user, fake_backend):
    fake_backend.history = [
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "world"},
    ]

    delete_resp = await async_client.delete("/chat/history", headers=test_user["headers"])
    assert delete_resp.status_code == 200
    assert delete_resp.json() == {"cleared": True}

    history_resp = await async_client.get("/chat/history", headers=test_user["headers"])
    assert history_resp.status_code == 200
    assert history_resp.json() == []


@pytest.mark.asyncio
async def test_usage_endpoint(async_client, test_user):
    response = await async_client.get("/chat/usage", headers=test_user["headers"])
    assert response.status_code == 200
    data = response.json()
    assert data["used"] == 0
    assert data["limit"] == 5
    assert data["is_root"] is False


@pytest.mark.asyncio
async def test_memory_save_and_list(async_client, test_user):
    save = await async_client.post(
        "/chat/memory",
        headers=test_user["headers"],
        json={"key": "objetivo", "value": "ganar masa"},
    )
    assert save.status_code == 200
    assert save.json()["value"] == "ganar masa"

    listing = await async_client.get("/chat/memory", headers=test_user["headers"])
    assert listing.status_code == 200
    assert listing.json()[0]["key"] == "objetivo"


@pytest.mark.asyncio
async def test_invalid_token_rejected(async_client):
    response = await async_client.get(
        "/chat/history",
        headers={"Authorization": "Bearer garbage.token.here"},
    )
    assert response.status_code == 401
