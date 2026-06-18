import pytest


@pytest.mark.anyio
async def test_submit_feedback_requires_auth(client):
    resp = await client.post("/feedback/", json={"message": "Muy buena app", "rating": 5})
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_submit_feedback(client, auth_headers):
    resp = await client.post(
        "/feedback/",
        headers=auth_headers,
        json={"message": "Me gusta mucho la app", "rating": 4},
    )
    assert resp.status_code == 201
    assert resp.json()["ok"] is True


@pytest.mark.anyio
async def test_submit_feedback_without_rating(client, auth_headers):
    resp = await client.post(
        "/feedback/",
        headers=auth_headers,
        json={"message": "Funciona muy bien"},
    )
    assert resp.status_code == 201
    assert resp.json()["ok"] is True


@pytest.mark.anyio
async def test_list_feedback_requires_root(client, auth_headers):
    resp = await client.get("/feedback/", headers=auth_headers)
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_list_feedback_as_root(client, root_headers, auth_headers):
    await client.post(
        "/feedback/",
        headers=auth_headers,
        json={"message": "Todo perfecto, muy intuitivo", "rating": 5},
    )
    resp = await client.get("/feedback/", headers=root_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    entry = data[0]
    assert "message" in entry
    assert "rating" in entry
    assert "user_email" in entry
