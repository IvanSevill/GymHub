import pytest
from datetime import datetime, timedelta

from app import models
from app.routers.analytics import _parse_exercise_value


# ---------------------------------------------------------------------------
# Unit tests: _parse_exercise_value
# ---------------------------------------------------------------------------


def test_parse_value_simple():
    assert _parse_exercise_value("50") == 50.0


def test_parse_value_decimal():
    assert _parse_exercise_value("42.5") == 42.5


def test_parse_value_comma_decimal():
    # Spanish decimal comma is normalized to a point
    assert _parse_exercise_value("42,5") == 42.5


def test_parse_value_non_numeric():
    # Non-numeric values (e.g. bodyweight) do not contribute
    assert _parse_exercise_value("bodyweight") == 0.0


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
    # Volume = per-exercise mean weight x 4 series: (50*4) + (60*4) = 440
    assert data["total_volume_kg"] == 440.0
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
    # Per-exercise mean weight x 4 series: 50*4 = 200, 60*4 = 240
    assert volumes == [200.0, 240.0]


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


# ---------------------------------------------------------------------------
# Missing branches
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_summary_days_365(client, auth_headers, analytics_data):
    """days >= 365 skips prev period computation (line 273)."""
    resp = await client.get("/analytics/summary", headers=auth_headers, params={"days": 365})
    assert resp.status_code == 200
    data = resp.json()
    assert data["prev_workout_count"] == 0
    assert data["prev_pr_count"] == 0


@pytest.mark.anyio
async def test_summary_with_fitbit_duration(client, auth_headers, db):
    """_compute_avg_duration uses fitbit_ms when > 0 (line 203)."""
    user = db.query(models.User).filter(models.User.email == "user@test.com").first()
    now = datetime.utcnow()
    w = models.Workout(
        user_id=user.id,
        start_time=now - timedelta(days=5),
        end_time=now - timedelta(days=5) + timedelta(hours=1),
        title="Fitbit Dur",
    )
    db.add(w)
    db.flush()
    fd = models.FitbitData(workout_id=w.id, duration_ms=4800000, calories=300)  # 80 min
    db.add(fd)
    db.commit()
    resp = await client.get("/analytics/summary", headers=auth_headers, params={"days": 30})
    assert resp.status_code == 200
    assert resp.json()["avg_duration_min"] == 80.0


@pytest.mark.anyio
async def test_summary_with_previous_period_sets(client, auth_headers, db):
    """_compute_prs: pre_max lines 235-237 hit when sets exist before the period."""
    user = db.query(models.User).filter(models.User.email == "user@test.com").first()
    muscle = models.Muscle(name="femoral_pr")
    db.add(muscle)
    db.flush()
    ex = models.Exercise(name="leg curl pr", muscle_id=muscle.id)
    db.add(ex)
    db.flush()
    now = datetime.utcnow()
    # Old workout outside 30-day window
    w_old = models.Workout(
        user_id=user.id,
        start_time=now - timedelta(days=40),
        end_time=now - timedelta(days=40) + timedelta(hours=1),
        title="Old",
    )
    db.add(w_old)
    db.flush()
    db.add(models.ExerciseSet(workout_id=w_old.id, exercise_id=ex.id, value="70", measurement="kg"))
    # Recent workout inside 30-day window
    w_new = models.Workout(
        user_id=user.id,
        start_time=now - timedelta(days=5),
        end_time=now - timedelta(days=5) + timedelta(hours=1),
        title="New",
    )
    db.add(w_new)
    db.flush()
    db.add(models.ExerciseSet(workout_id=w_new.id, exercise_id=ex.id, value="75", measurement="kg"))
    db.commit()
    resp = await client.get("/analytics/summary", headers=auth_headers, params={"days": 30})
    assert resp.status_code == 200
    assert resp.json()["pr_count"] >= 1


@pytest.mark.anyio
async def test_muscle_balance_with_data(client, auth_headers, analytics_data):
    """GET /analytics/muscle-balance returns weekly volume per muscle (lines 357-381)."""
    resp = await client.get("/analytics/muscle-balance", headers=auth_headers, params={"days": 90})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    for point in data:
        assert "week" in point and "muscle" in point and "volume" in point


@pytest.mark.anyio
async def test_muscle_balance_zero_value_skipped(client, auth_headers, db):
    """Sets with value '0' are skipped (v <= 0 branch in muscle_balance)."""
    user = db.query(models.User).filter(models.User.email == "user@test.com").first()
    muscle = models.Muscle(name="cuadriceps_bal")
    db.add(muscle)
    db.flush()
    ex = models.Exercise(name="sentadilla bal", muscle_id=muscle.id)
    db.add(ex)
    db.flush()
    now = datetime.utcnow()
    w = models.Workout(
        user_id=user.id,
        start_time=now - timedelta(days=5),
        end_time=now - timedelta(days=5) + timedelta(hours=1),
        title="Piernas",
    )
    db.add(w)
    db.flush()
    db.add(models.ExerciseSet(workout_id=w.id, exercise_id=ex.id, value="0", measurement="kg"))
    db.commit()
    resp = await client.get("/analytics/muscle-balance", headers=auth_headers, params={"days": 30})
    assert resp.status_code == 200


@pytest.mark.anyio
async def test_session_durations_no_valid_duration(client, auth_headers, db):
    """Workout with same start/end and no FitbitData hits the continue branch (line 416)."""
    user = db.query(models.User).filter(models.User.email == "user@test.com").first()
    now = datetime.utcnow()
    w = models.Workout(
        user_id=user.id,
        start_time=now - timedelta(days=3),
        end_time=now - timedelta(days=3),  # same → dur = 0, hits continue
        title="No Duration",
    )
    db.add(w)
    db.commit()
    resp = await client.get("/analytics/session-durations", headers=auth_headers, params={"days": 30})
    assert resp.status_code == 200


@pytest.mark.anyio
async def test_frequency_with_muscle_filter(client, auth_headers, analytics_data):
    """GET /analytics/frequency with muscle_id filter hits line 98."""
    muscle_id = analytics_data["muscle"].id
    resp = await client.get(
        "/analytics/frequency",
        headers=auth_headers,
        params={"muscle_id": muscle_id, "days": 90},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert data[0]["muscle_name"] == "pecho"




@pytest.mark.anyio
async def test_weight_progress_non_numeric_value_skipped(client, auth_headers, db):
    """ExerciseSet with non-numeric value parses to 0.0 → hits continue on line 61."""
    user = db.query(models.User).filter(models.User.email == "user@test.com").first()
    muscle = models.Muscle(name="hombro_wp")
    db.add(muscle)
    db.flush()
    ex = models.Exercise(name="press militar wp", muscle_id=muscle.id)
    db.add(ex)
    db.flush()
    now = datetime.utcnow()
    w = models.Workout(
        user_id=user.id,
        start_time=now - timedelta(days=5),
        end_time=now - timedelta(days=5) + timedelta(hours=1),
        title="Hombros",
    )
    db.add(w)
    db.flush()
    # "bodyweight" passes SQL filter (not "" or "0") but _parse_exercise_value returns 0.0
    db.add(models.ExerciseSet(workout_id=w.id, exercise_id=ex.id, value="bodyweight", measurement="rep"))
    db.commit()
    resp = await client.get(
        "/analytics/weight-progress",
        headers=auth_headers,
        params={"exercise_id": ex.id, "days": 30},
    )
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.anyio
async def test_max_lifts_non_numeric_value_skipped(client, auth_headers, db):
    """ExerciseSet with non-numeric value parses to 0.0 → hits continue on line 137."""
    user = db.query(models.User).filter(models.User.email == "user@test.com").first()
    muscle = models.Muscle(name="gemelos_ml")
    db.add(muscle)
    db.flush()
    ex = models.Exercise(name="calf raise ml", muscle_id=muscle.id)
    db.add(ex)
    db.flush()
    now = datetime.utcnow()
    w = models.Workout(
        user_id=user.id,
        start_time=now - timedelta(days=5),
        end_time=now - timedelta(days=5) + timedelta(hours=1),
        title="Gemelos",
    )
    db.add(w)
    db.flush()
    db.add(models.ExerciseSet(workout_id=w.id, exercise_id=ex.id, value="bodyweight", measurement="rep"))
    db.commit()
    resp = await client.get("/analytics/max-lifts", headers=auth_headers)
    assert resp.status_code == 200
    names = [r["exercise_name"] for r in resp.json()]
    assert "calf raise ml" not in names
