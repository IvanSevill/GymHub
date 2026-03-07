import pytest
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from run_backend import app, get_db
from models import Base, User, Workout, FitbitData

# Configura DB en memoria temporal
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def create_test_database():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

from unittest.mock import patch

def test_fitbit_endpoint_connect():
    # Creamos usuario falso
    db = TestingSessionLocal()
    user = User(email="test@test.com", google_id="mock_id", name="Tester")
    db.add(user)
    db.commit()
    db.close()

    with patch("services.fitbit_client.FitbitService.exchange_code_for_token") as mock_exchange:
        mock_exchange.return_value = {
            "user_id": "FITBIT123",
            "access_token": "mocked_acc",
            "refresh_token": "mocked_ref"
        }
        response = client.post("/auth/fitbit/connect?auth_code=T3ST&user_email=test@test.com")
        
        assert response.status_code == 200
        assert response.json() == {"status": "Fitbit connected"}
        mock_exchange.assert_called_once_with("T3ST")

def test_fitbit_metrics_in_workout_response():
    db = TestingSessionLocal()
    user = User(email="test@test.com", google_id="mock_id", name="Tester")
    db.add(user)
    db.commit()

    workout = Workout(
        user_email="test@test.com", 
        title="Pecho",
        source="app"
    )
    db.add(workout)
    db.commit()
    db.refresh(workout)

    fitbit_data = FitbitData(
        workout_id=workout.id,
        calories=350,
        heart_rate_avg=130,
        duration_ms=3600000
    )
    db.add(fitbit_data)
    db.commit()
    db.close()

    response = client.get("/workouts?user_email=test@test.com")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    
    assert "fitbit_data" in data[0]
    fd = data[0]["fitbit_data"]
    assert fd is not None
    assert fd["calories"] == 350
    assert fd["heart_rate_avg"] == 130
    assert fd["duration_ms"] == 3600000
