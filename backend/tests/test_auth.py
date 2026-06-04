from datetime import datetime, timedelta

import pytest
from jose import jwt

SECRET_KEY = "your-secret-key-please-change-me"
ALGORITHM = "HS256"


@pytest.mark.anyio
async def test_register_user(client):
    response = await client.post(
        "/auth/register",
        json={"email": "test@example.com", "name": "Test User", "password": "password123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"
    assert data["name"] == "Test User"
    assert "id" in data


@pytest.mark.anyio
async def test_register_duplicate_email(client):
    await client.post(
        "/auth/register",
        json={"email": "test@example.com", "name": "Test User", "password": "password123"},
    )
    response = await client.post(
        "/auth/register",
        json={"email": "test@example.com", "name": "Another User", "password": "password456"},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Email already registered"


@pytest.mark.anyio
async def test_login_success(client):
    await client.post(
        "/auth/register",
        json={"email": "test@example.com", "name": "Test User", "password": "password123"},
    )
    response = await client.post(
        "/auth/login",
        json={"email": "test@example.com", "password": "password123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "test@example.com"


@pytest.mark.anyio
async def test_login_wrong_password(client):
    await client.post(
        "/auth/register",
        json={"email": "test@example.com", "name": "Test User", "password": "password123"},
    )
    response = await client.post(
        "/auth/login",
        json={"email": "test@example.com", "password": "wrongpassword"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password"


@pytest.mark.anyio
async def test_get_me(client, auth_headers):
    response = await client.get("/auth/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "user@test.com"
    assert data["name"] == "Test User"
    assert "id" in data
    assert "has_calendar" in data
    assert "fitbit_connected" in data
    assert data["has_calendar"] is False
    assert data["fitbit_connected"] is False


@pytest.mark.anyio
async def test_get_me_no_token(client):
    response = await client.get("/auth/me")
    assert response.status_code == 401


@pytest.mark.anyio
async def test_missing_auth_header_returns_401(client):
    response = await client.get("/workouts")
    assert response.status_code == 401


@pytest.mark.anyio
async def test_malformed_token_returns_401(client):
    response = await client.get(
        "/workouts",
        headers={"Authorization": "Bearer garbage"},
    )
    assert response.status_code == 401


@pytest.mark.anyio
async def test_expired_token_returns_401(client):
    expired_payload = {
        "sub": "ghost@test.com",
        "exp": datetime.utcnow() - timedelta(hours=1),
    }
    expired_token = jwt.encode(expired_payload, SECRET_KEY, algorithm=ALGORITHM)
    response = await client.get(
        "/workouts",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert response.status_code == 401
