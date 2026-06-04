"""Integration tests for ai-server HTTP endpoints."""

import pytest

from chat_history import save_message


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
async def test_clear_history(async_client, test_user, db):
    uid = test_user["user_id"]
    save_message(uid, "user", "hello", db)
    save_message(uid, "assistant", "world", db)

    delete_resp = await async_client.delete(
        "/chat/history",
        headers=test_user["headers"],
    )
    assert delete_resp.status_code == 200
    assert delete_resp.json() == {"cleared": True}

    history_resp = await async_client.get(
        "/chat/history",
        headers=test_user["headers"],
    )
    assert history_resp.status_code == 200
    assert history_resp.json() == []


@pytest.mark.asyncio
async def test_usage_endpoint(async_client, test_user):
    response = await async_client.get("/chat/usage", headers=test_user["headers"])
    assert response.status_code == 200
    data = response.json()
    assert "used" in data
    assert "limit" in data
    assert "is_root" in data
    assert data["used"] == 0
    assert data["is_root"] is False


@pytest.mark.asyncio
async def test_invalid_token_rejected(async_client):
    response = await async_client.get(
        "/chat/history",
        headers={"Authorization": "Bearer garbage.token.here"},
    )
    assert response.status_code == 401
