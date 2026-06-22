"""Tests for the AI assistant persistence endpoints (/assistant/*)."""

import pytest


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_history_empty(client, auth_headers):
    resp = await client.get("/assistant/history", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.anyio
async def test_save_and_get_history(client, auth_headers):
    await client.post(
        "/assistant/history", headers=auth_headers, json={"role": "user", "content": "hola"}
    )
    await client.post(
        "/assistant/history", headers=auth_headers, json={"role": "assistant", "content": "qué tal"}
    )
    resp = await client.get("/assistant/history", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    # Oldest first
    assert [m["role"] for m in data] == ["user", "assistant"]
    assert data[0]["content"] == "hola"


@pytest.mark.anyio
async def test_clear_history_preserves_usage(client, auth_headers):
    await client.post(
        "/assistant/history", headers=auth_headers, json={"role": "user", "content": "uno"}
    )
    resp = await client.get("/assistant/usage", headers=auth_headers)
    assert resp.json()["used"] == 1

    del_resp = await client.delete("/assistant/history", headers=auth_headers)
    assert del_resp.status_code == 204

    # History gone…
    assert (await client.get("/assistant/history", headers=auth_headers)).json() == []
    # …but the rate-limit counter survives.
    assert (await client.get("/assistant/usage", headers=auth_headers)).json()["used"] == 1


# ---------------------------------------------------------------------------
# Usage / rate limit
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_usage_only_counts_user_messages(client, auth_headers):
    await client.post(
        "/assistant/history", headers=auth_headers, json={"role": "user", "content": "1"}
    )
    await client.post(
        "/assistant/history", headers=auth_headers, json={"role": "assistant", "content": "2"}
    )
    resp = await client.get("/assistant/usage", headers=auth_headers)
    body = resp.json()
    assert body["used"] == 1
    assert body["limit"] == 5
    assert body["is_root"] is False


@pytest.mark.anyio
async def test_usage_root_is_unlimited(client, root_headers):
    resp = await client.get("/assistant/usage", headers=root_headers)
    body = resp.json()
    assert body["is_root"] is True
    assert body["limit"] is None


# ---------------------------------------------------------------------------
# Memory
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_memory_upsert_and_list(client, auth_headers):
    r1 = await client.post(
        "/assistant/memory", headers=auth_headers, json={"key": "objetivo", "value": "ganar masa"}
    )
    assert r1.status_code == 200
    mem_id = r1.json()["id"]

    # Upsert same key updates value, keeps id
    r2 = await client.post(
        "/assistant/memory", headers=auth_headers, json={"key": "objetivo", "value": "perder grasa"}
    )
    assert r2.json()["id"] == mem_id
    assert r2.json()["value"] == "perder grasa"

    listing = await client.get("/assistant/memory", headers=auth_headers)
    assert len(listing.json()) == 1
    assert listing.json()[0]["value"] == "perder grasa"


@pytest.mark.anyio
async def test_memory_delete(client, auth_headers):
    created = await client.post(
        "/assistant/memory", headers=auth_headers, json={"key": "lesion", "value": "hombro"}
    )
    mem_id = created.json()["id"]
    del_resp = await client.delete(f"/assistant/memory/{mem_id}", headers=auth_headers)
    assert del_resp.status_code == 204
    assert (await client.get("/assistant/memory", headers=auth_headers)).json() == []


@pytest.mark.anyio
async def test_memory_delete_not_found(client, auth_headers):
    resp = await client.delete("/assistant/memory/does-not-exist", headers=auth_headers)
    assert resp.status_code == 404
