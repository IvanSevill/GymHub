import pytest

@pytest.mark.anyio
async def test_read_root(client):
    """
    Tests the root endpoint.
    """
    response = await client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Welcome to GymHub API v2"}

@pytest.mark.anyio
async def test_health_check(client):
    """
    Tests the health check endpoint.
    """
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
