import pytest


@pytest.mark.anyio
async def test_log_weight_requires_auth(client):
    resp = await client.post("/weight/", json={"date": "2026-05-01", "weight_kg": 75.0})
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_log_weight_creates_entry(client, auth_headers):
    resp = await client.post(
        "/weight/",
        headers=auth_headers,
        json={"date": "2026-05-01", "weight_kg": 75.5, "body_fat_pct": 18.0},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["weight_kg"] == 75.5
    assert data["body_fat_pct"] == 18.0
    assert data["date"] == "2026-05-01"
    assert "id" in data


@pytest.mark.anyio
async def test_log_weight_upserts_same_date(client, auth_headers):
    await client.post(
        "/weight/",
        headers=auth_headers,
        json={"date": "2026-05-02", "weight_kg": 80.0},
    )
    resp = await client.post(
        "/weight/",
        headers=auth_headers,
        json={"date": "2026-05-02", "weight_kg": 79.0, "body_fat_pct": 20.0},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["weight_kg"] == 79.0
    assert data["body_fat_pct"] == 20.0

    list_resp = await client.get("/weight/", headers=auth_headers)
    entries = [e for e in list_resp.json() if e["date"] == "2026-05-02"]
    assert len(entries) == 1


@pytest.mark.anyio
async def test_get_weight_logs(client, auth_headers):
    await client.post(
        "/weight/",
        headers=auth_headers,
        json={"date": "2026-04-01", "weight_kg": 77.0},
    )
    resp = await client.get("/weight/", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    dates = [e["date"] for e in resp.json()]
    assert "2026-04-01" in dates


@pytest.mark.anyio
async def test_get_weight_logs_filter_by_date(client, auth_headers):
    await client.post(
        "/weight/",
        headers=auth_headers,
        json={"date": "2026-03-15", "weight_kg": 76.0},
    )
    resp = await client.get("/weight/", headers=auth_headers, params={"date": "2026-03-15"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["date"] == "2026-03-15"


@pytest.mark.anyio
async def test_get_weight_logs_requires_auth(client):
    resp = await client.get("/weight/")
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_delete_weight_log(client, auth_headers):
    create_resp = await client.post(
        "/weight/",
        headers=auth_headers,
        json={"date": "2026-06-01", "weight_kg": 74.0},
    )
    entry_id = create_resp.json()["id"]

    del_resp = await client.delete(f"/weight/{entry_id}", headers=auth_headers)
    assert del_resp.status_code == 204

    list_resp = await client.get("/weight/", headers=auth_headers, params={"date": "2026-06-01"})
    assert list_resp.json() == []


@pytest.mark.anyio
async def test_delete_weight_log_not_found(client, auth_headers):
    resp = await client.delete("/weight/nonexistent-id", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_delete_weight_log_requires_auth(client):
    resp = await client.delete("/weight/some-id")
    assert resp.status_code == 401
