from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from jose import jwt

SECRET_KEY = "your-secret-key-please-change-me"
ALGORITHM = "HS256"


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


# ---------------------------------------------------------------------------
# Refresh token
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_refresh_token(client):
    # Obtain a refresh cookie through the Google OAuth flow (the only login path)
    mock_google_response = MagicMock()
    mock_google_response.status_code = 200
    mock_google_response.json.return_value = {
        "access_token": "fake-access-token",
        "refresh_token": "fake-refresh-token",
        "id_token": "fake-id-token",
    }
    mock_id_info = {
        "email": "refresh@test.com",
        "name": "Refresh",
        "picture": "https://example.com/pic.jpg",
        "sub": "google-sub-refresh",
    }
    with (
        patch("app.routers.auth_routes.requests.post", return_value=mock_google_response),
        patch("app.routers.auth_routes.id_token.verify_oauth2_token", return_value=mock_id_info),
    ):
        login_resp = await client.post("/auth/google", json={"code": "fake-code"})
    refresh_cookie = login_resp.cookies.get("refresh_token")
    assert refresh_cookie is not None

    resp = await client.post("/auth/refresh", cookies={"refresh_token": refresh_cookie})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["user"]["email"] == "refresh@test.com"


@pytest.mark.anyio
async def test_refresh_no_cookie(client):
    resp = await client.post("/auth/refresh")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_logout(client):
    resp = await client.post("/auth/logout")
    assert resp.status_code == 200
    assert resp.json()["message"] == "Sesión cerrada"


# ---------------------------------------------------------------------------
# Fitbit auth init
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_fitbit_auth_init(client, auth_headers):
    resp = await client.get("/auth/fitbit", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "url" in data
    assert "fitbit.com/oauth2/authorize" in data["url"]


# ---------------------------------------------------------------------------
# Disconnect Fitbit
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_disconnect_fitbit(client, auth_headers):
    resp = await client.delete("/auth/fitbit", headers=auth_headers)
    assert resp.status_code == 200
    assert "disconnected" in resp.json()["message"].lower()


# ---------------------------------------------------------------------------
# Update profile (PUT /auth/me)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_update_profile_height(client, auth_headers):
    resp = await client.put(
        "/auth/me",
        headers=auth_headers,
        json={"height_cm": 178.5},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["height_cm"] == 178.5


# ---------------------------------------------------------------------------
# Google OAuth (mocked)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_google_auth_mock(client):
    mock_google_response = MagicMock()
    mock_google_response.status_code = 200
    mock_google_response.json.return_value = {
        "access_token": "fake-access-token",
        "refresh_token": "fake-refresh-token",
        "id_token": "fake-id-token",
    }

    mock_id_info = {
        "email": "google@test.com",
        "name": "Google User",
        "picture": "https://example.com/pic.jpg",
        "sub": "google-sub-123",
    }

    with (
        patch("app.routers.auth_routes.requests.post", return_value=mock_google_response),
        patch("app.routers.auth_routes.id_token.verify_oauth2_token", return_value=mock_id_info),
    ):
        resp = await client.post("/auth/google", json={"code": "fake-code"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["user"]["email"] == "google@test.com"
    assert "access_token" in data


@pytest.mark.anyio
async def test_google_auth_failure(client):
    mock_fail_response = MagicMock()
    mock_fail_response.status_code = 400
    mock_fail_response.text = "invalid_grant"

    with patch("app.routers.auth_routes.requests.post", return_value=mock_fail_response):
        resp = await client.post("/auth/google", json={"code": "bad-code"})

    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Fitbit callback (mocked)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_fitbit_callback_mock(client, db, auth_headers):
    from app import models as m
    user = db.query(m.User).filter(m.User.email == "user@test.com").first()

    mock_fitbit_response = MagicMock()
    mock_fitbit_response.status_code = 200
    mock_fitbit_response.json.return_value = {
        "access_token": "fitbit-access",
        "refresh_token": "fitbit-refresh",
        "user_id": "FITBIT_USER_ABC",
    }

    with patch("app.routers.auth_routes.requests.post", return_value=mock_fitbit_response):
        resp = await client.get(
            "/auth/fitbit/callback",
            params={"code": "fitbit-code", "state": user.id},
        )

    assert resp.status_code in (200, 307, 302)  # redirect
