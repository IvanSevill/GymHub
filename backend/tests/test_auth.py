import pytest

@pytest.mark.anyio
async def test_register_user(client):
    """
    Tests user registration.
    """
    response = await client.post(
        "/auth/register",
        json={"email": "test@example.com", "name": "Test User", "password": "password123"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"
    assert data["name"] == "Test User"
    assert "id" in data

@pytest.mark.anyio
async def test_register_duplicate_email(client):
    """
    Tests registration with a duplicate email.
    """
    await client.post(
        "/auth/register",
        json={"email": "test@example.com", "name": "Test User", "password": "password123"}
    )
    response = await client.post(
        "/auth/register",
        json={"email": "test@example.com", "name": "Another User", "password": "password456"}
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Email already registered"

@pytest.mark.anyio
async def test_login_success(client):
    """
    Tests successful user login.
    """
    await client.post(
        "/auth/register",
        json={"email": "test@example.com", "name": "Test User", "password": "password123"}
    )
    response = await client.post(
        "/auth/login",
        json={"email": "test@example.com", "password": "password123"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "test@example.com"

@pytest.mark.anyio
async def test_login_wrong_password(client):
    """
    Tests login with an incorrect password.
    """
    await client.post(
        "/auth/register",
        json={"email": "test@example.com", "name": "Test User", "password": "password123"}
    )
    response = await client.post(
        "/auth/login",
        json={"email": "test@example.com", "password": "wrongpassword"}
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password"
