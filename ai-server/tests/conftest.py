"""Test configuration and fixtures for the ai-server test suite."""

import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from jose import jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# ---------------------------------------------------------------------------
# Env vars MUST be set before importing any ai-server module that reads them
# at module level (database.py uses os.environ["DATABASE_URL"] immediately;
# auth.py raises RuntimeError if SECRET_KEY is missing).
# ---------------------------------------------------------------------------
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("BACKEND_URL", "http://localhost:8000")
os.environ.setdefault("GEMINI_API_KEY", "test-key")

# Add ai-server root to sys.path so modules resolve without a package prefix
_AI_SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _AI_SERVER_DIR not in sys.path:
    sys.path.insert(0, _AI_SERVER_DIR)

# ---------------------------------------------------------------------------
# Build the shared in-memory test engine BEFORE importing any app module,
# so that all SessionLocal instances can be patched to use it.
# ---------------------------------------------------------------------------
_TEST_DB_URL = "sqlite:///:memory:"
_engine = create_engine(
    _TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)

# Now import app modules — they read DATABASE_URL (already set above)
import auth as _auth_module  # noqa: E402
import chat as _chat_module  # noqa: E402
from database import Base, get_db  # noqa: E402
from main import app  # noqa: E402
from models import User  # noqa: E402

SECRET_KEY = "test-secret-key-for-testing"
ALGORITHM = "HS256"


@pytest.fixture(autouse=True)
def _setup_tables():
    """Create all tables on the test engine and patch module-level SessionLocals."""
    Base.metadata.create_all(bind=_engine)

    # Patch every SessionLocal that bypasses FastAPI DI (auth.py, chat.py helpers)
    _auth_module.SessionLocal = _TestingSessionLocal
    _chat_module.SessionLocal = _TestingSessionLocal

    yield

    Base.metadata.drop_all(bind=_engine)


@pytest.fixture
def db(_setup_tables):
    """Yield a test DB session sharing the in-memory engine."""
    session = _TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
async def async_client(db):
    """Async HTTPX client that overrides the get_db dependency."""

    def _override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
def test_user(db):
    """Create a User in the test DB and return user metadata + a valid JWT."""
    user_id = str(uuid.uuid4())
    email = "testuser@example.com"

    user = User(id=user_id, email=email, name="Test User", is_root=0)
    db.add(user)
    db.commit()
    db.refresh(user)

    token_payload = {
        "sub": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    token = jwt.encode(token_payload, SECRET_KEY, algorithm=ALGORITHM)

    return {
        "user_id": user_id,
        "email": email,
        "token": token,
        "headers": {"Authorization": f"Bearer {token}"},
    }
