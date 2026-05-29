import pytest
from datetime import datetime, timedelta

from app import models
from app.routers.analytics import _parse_exercise_value


# ---------------------------------------------------------------------------
# Unit tests: _parse_exercise_value
# ---------------------------------------------------------------------------


def test_parse_value_simple():
    assert _parse_exercise_value("50") == 50.0


def test_parse_value_range():
    assert _parse_exercise_value("45-40") == 45.0


def test_parse_value_fraction():
    assert _parse_exercise_value("40/35") == 40.0


def test_parse_value_decimal():
    assert _parse_exercise_value("42.5") == 42.5


def test_parse_value_comma_decimal():
    assert _parse_exercise_value("42,5") == 42.5


def test_parse_value_empty():
    assert _parse_exercise_value("") == 0.0


def test_parse_value_zero():
    assert _parse_exercise_value("0") == 0.0


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
async def analytics_data(client, auth_headers, db):
    """User with 2 workouts and exercise sets for analytics tests."""
    muscle = models.Muscle(name="pecho")
    db.add(muscle)
    db.flush()
    exercise = models.Exercise(name="press banca", muscle_id=muscle.id)
    db.add(exercise)
    db.flush()

    user = db.query(models.User).filter(models.User.email == "user@test.com").first()
    now = datetime.utcnow()

    w1 = models.Workout(
        user_id=user.id,
        start_time=now - timedelta(days=20),
        end_time=now - timedelta(days=20) + timedelta(hours=1, minutes=30),
        title="Workout 1",
    )
    w2 = models.Workout(
        user_id=user.id,
        start_time=now - timedelta(days=5),
        end_time=now - timedelta(days=5) + timedelta(hours=1),
        title="Workout 2",
    )
    db.add_all([w1, w2])
    db.flush()

    db.add(
        models.ExerciseSet(
            workout_id=w1.id, exercise_id=exercise.id, value="50", measurement="kg", is_completed=True
        )
    )
    db.add(
        models.ExerciseSet(
            workout_id=w2.id, exercise_id=exercise.id, value="60", measurement="kg", is_completed=True
        )
    )
    db.commit()
    return {"user": user, "muscle": muscle, "exercise": exercise, "w1": w1, "w2": w2}


# ---------------------------------------------------------------------------
# Integration tests
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_summary_empty(client, auth_headers):
    resp = await client.get("/analytics/summary", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["workout_count"] == 0
    assert data["total_volume_kg"] == 0.0
    assert data["pr_count"] == 0
    assert data["avg_duration_min"] is None


@pytest.mark.anyio
async def test_summary_with_workouts(client, auth_headers, analytics_data):
    resp = await client.get("/analytics/summary", headers=auth_headers, params={"days": 30})
    assert resp.status_code == 200
    data = resp.json()
    assert data["workout_count"] == 2
    assert data["total_volume_kg"] == 110.0
    assert data["pr_count"] == 1
    assert data["avg_duration_min"] == 75.0


@pytest.mark.anyio
async def test_workout_frequency_zero_filled(client, auth_headers, analytics_data):
    resp = await client.get("/analytics/workout-frequency", headers=auth_headers, params={"days": 90})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) > 0
    for point in data:
        assert "week" in point
        assert "count" in point
    total = sum(p["count"] for p in data)
    assert total == 2


@pytest.mark.anyio
async def test_volume_trend(client, auth_headers, analytics_data):
    resp = await client.get("/analytics/volume-trend", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    volumes = sorted(p["volume"] for p in data)
    assert volumes == [50.0, 60.0]


@pytest.mark.anyio
async def test_max_lifts(client, auth_headers, analytics_data):
    resp = await client.get("/analytics/max-lifts", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["exercise_name"] == "press banca"
    assert data[0]["max_value"] == 60.0
    assert data[0]["measurement"] == "kg"


@pytest.mark.anyio
async def test_exercise_frequency(client, auth_headers, analytics_data):
    resp = await client.get("/analytics/frequency", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["exercise_name"] == "press banca"
    assert data[0]["count"] == 2
    assert data[0]["muscle_name"] == "pecho"


@pytest.mark.anyio
async def test_session_durations_from_times(client, auth_headers, analytics_data):
    resp = await client.get("/analytics/session-durations", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    durations = sorted(p["duration_min"] for p in data)
    assert durations == [60.0, 90.0]


@pytest.mark.anyio
async def test_session_durations_fitbit_priority(client, auth_headers, db):
    user = db.query(models.User).filter(models.User.email == "user@test.com").first()
    now = datetime.utcnow()
    workout = models.Workout(
        user_id=user.id,
        start_time=now - timedelta(days=10),
        end_time=now - timedelta(days=10) + timedelta(hours=1),
        title="Fitbit Workout",
    )
    db.add(workout)
    db.flush()
    db.add(
        models.FitbitData(
            workout_id=workout.id,
            duration_ms=2_700_000,  # 45 min, overrides the 60 min start/end
            calories=300,
            heart_rate_avg=140,
        )
    )
    db.commit()

    resp = await client.get("/analytics/session-durations", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["duration_min"] == 45.0


@pytest.mark.anyio
async def test_weight_progress(client, auth_headers, analytics_data):
    exercise_id = analytics_data["exercise"].id
    resp = await client.get(
        "/analytics/weight-progress",
        headers=auth_headers,
        params={"exercise_id": exercise_id, "days": 30},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    values = sorted(p["value"] for p in data)
    assert values == [50.0, 60.0]


@pytest.mark.anyio
async def test_exercise_history(client, auth_headers, analytics_data):
    exercise_id = analytics_data["exercise"].id
    resp = await client.get(
        f"/analytics/exercise-history/{exercise_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert all("value" in r and "measurement" in r and "date" in r for r in data)
