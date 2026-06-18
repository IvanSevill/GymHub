import os

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Must be set before app.main is imported — main.py calls Base.metadata.create_all at module level
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing")
os.environ.setdefault("TESTING", "true")

from app.main import app  # noqa: E402
from app.database import Base, get_db  # noqa: E402
from app import models  # noqa: E402

@pytest.fixture(params=["asyncio"])
def anyio_backend(request):
    return request.param


SQLALCHEMY_DATABASE_URL = "sqlite://"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
async def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
async def auth_headers(client):
    await client.post(
        "/auth/register",
        json={"email": "user@test.com", "name": "Test User", "password": "password123"},
    )
    resp = await client.post(
        "/auth/login",
        json={"email": "user@test.com", "password": "password123"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def root_headers(client, db):
    await client.post(
        "/auth/register",
        json={"email": "root@test.com", "name": "Root User", "password": "password123"},
    )
    user = db.query(models.User).filter(models.User.email == "root@test.com").first()
    user.is_root = 1
    db.commit()
    resp = await client.post(
        "/auth/login",
        json={"email": "root@test.com", "password": "password123"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def sample_muscle(db):
    muscle = models.Muscle(name="pecho")
    db.add(muscle)
    db.commit()
    db.refresh(muscle)
    return muscle


@pytest.fixture
def sample_exercise(db, sample_muscle):
    exercise = models.Exercise(name="press banca", muscle_id=sample_muscle.id)
    db.add(exercise)
    db.commit()
    db.refresh(exercise)
    return exercise
