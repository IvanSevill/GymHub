"""Tests for fitbit_sync.py — route handlers and _activity_matches_any_workout branches."""
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from app import models
from app.routers.fitbit_sync import _activity_matches_any_workout


def _get_user(db):
    return db.query(models.User).filter(models.User.email == "user@test.com").first()


def _fitbit_tokens(db, user_id):
    tokens = models.UserTokens(
        user_id=user_id,
        fitbit_access_token="fitbit-tok",
        fitbit_refresh_token="fitbit-ref",
    )
    db.add(tokens)
    db.commit()
    return tokens


def _make_workout(db, user_id, *, title="Test", start=None, end=None, fitbit_log_id=None):
    start = start or datetime(2026, 6, 10, 10, 0)
    end = end or datetime(2026, 6, 10, 11, 0)
    w = models.Workout(user_id=user_id, title=title, start_time=start, end_time=end)
    db.add(w)
    db.flush()
    if fitbit_log_id is not None:
        fd = models.FitbitData(
            workout_id=w.id, fitbit_log_id=fitbit_log_id, activity_name="Run"
        )
        db.add(fd)
    db.commit()
    db.refresh(w)
    return w


# ---------------------------------------------------------------------------
# _activity_matches_any_workout — missing branches
# ---------------------------------------------------------------------------


def test_activity_matches_gym_midpoint_branch():
    """Gym activity whose start is >3 h away but workout midpoint falls inside the activity."""
    w = MagicMock()
    w.start_time = datetime(2026, 6, 1, 10, 0)
    w.end_time = datetime(2026, 6, 1, 11, 0)
    # Midpoint = 10:30. Activity window 09:00–11:30 covers the midpoint.
    activity = {
        "activityName": "Weights",
        "startTime": "2026-06-01T09:00:00Z",
        "duration": 9000000,  # 2.5 h → ends 11:30
    }
    assert _activity_matches_any_workout(activity, [w]) is True


def test_activity_matches_cardio_by_fd_activity_name():
    """Cardio branch: workout has fitbit_data whose activity_name matches."""
    w = MagicMock()
    w.start_time = datetime(2026, 6, 2, 10, 0)
    w.end_time = datetime(2026, 6, 2, 11, 0)
    w.title = "Other"
    fd = MagicMock()
    fd.activity_name = "Run"
    w.fitbit_data = fd
    activity = {
        "activityName": "Run",
        "startTime": "2026-06-02T10:05:00Z",
        "duration": 3600000,
    }
    assert _activity_matches_any_workout(activity, [w]) is True


def test_activity_matches_cardio_by_title():
    """Cardio branch: no fitbit_data, workout title matches activity name."""
    w = MagicMock()
    w.start_time = datetime(2026, 6, 2, 10, 0)
    w.end_time = datetime(2026, 6, 2, 11, 0)
    w.title = "run"
    w.fitbit_data = None
    activity = {
        "activityName": "Run",
        "startTime": "2026-06-02T10:05:00Z",
        "duration": 3600000,
    }
    assert _activity_matches_any_workout(activity, [w]) is True


def test_activity_matches_cardio_no_match():
    """Cardio branch: different activity name → no match."""
    w = MagicMock()
    w.start_time = datetime(2026, 6, 2, 10, 0)
    w.end_time = datetime(2026, 6, 2, 11, 0)
    w.title = "Pecho"
    w.fitbit_data = None
    activity = {
        "activityName": "Run",
        "startTime": "2026-06-02T10:05:00Z",
        "duration": 3600000,
    }
    assert _activity_matches_any_workout(activity, [w]) is False


def test_activity_matches_cardio_fd_name_mismatch():
    """Cardio branch: workout has fitbit_data but activity_name doesn't match."""
    w = MagicMock()
    w.start_time = datetime(2026, 6, 2, 10, 0)
    w.end_time = datetime(2026, 6, 2, 11, 0)
    w.title = "Pecho"
    fd = MagicMock()
    fd.activity_name = "Swim"
    w.fitbit_data = fd
    activity = {
        "activityName": "Run",
        "startTime": "2026-06-02T10:05:00Z",
        "duration": 3600000,
    }
    assert _activity_matches_any_workout(activity, [w]) is False


# ---------------------------------------------------------------------------
# sync_fitbit_bulk — POST /workouts/sync-fitbit-bulk
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_sync_fitbit_bulk_no_tokens(client, auth_headers):
    resp = await client.post("/workouts/sync-fitbit-bulk", headers=auth_headers)
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_sync_fitbit_bulk_no_workouts(client, auth_headers, db):
    user = _get_user(db)
    _fitbit_tokens(db, user.id)
    resp = await client.post("/workouts/sync-fitbit-bulk", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["synced"] == 0
    assert data["total"] == 0


@pytest.mark.anyio
async def test_sync_fitbit_bulk_no_matching_activity(client, auth_headers, db):
    user = _get_user(db)
    _fitbit_tokens(db, user.id)
    _make_workout(db, user.id)
    with patch("app.routers.fitbit_sync.fitbit_utils.get_fitbit_activity", return_value=None):
        resp = await client.post("/workouts/sync-fitbit-bulk", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["not_found"] == 1


@pytest.mark.anyio
async def test_sync_fitbit_bulk_creates_fitbit_data(client, auth_headers, db):
    user = _get_user(db)
    _fitbit_tokens(db, user.id)
    _make_workout(db, user.id)
    mock_activity = {
        "logId": 111222,
        "calories": 350,
        "averageHeartRate": 130,
        "duration": 3600000,
        "distance": 0.0,
        "elevationGain": 0.0,
        "activityName": "Weights",
    }
    with (
        patch("app.routers.fitbit_sync.fitbit_utils.get_fitbit_activity", return_value=mock_activity),
        patch("app.routers.fitbit_sync.fitbit_utils.probe_has_gps", return_value=False),
    ):
        resp = await client.post("/workouts/sync-fitbit-bulk", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["synced"] == 1


@pytest.mark.anyio
async def test_sync_fitbit_bulk_updates_existing_fitbit_data(client, auth_headers, db):
    """Workout already has FitbitData without log_id → it gets updated."""
    user = _get_user(db)
    _fitbit_tokens(db, user.id)
    w = _make_workout(db, user.id)
    # Add FitbitData without log_id
    fd = models.FitbitData(workout_id=w.id, calories=200, activity_name="Weights")
    db.add(fd)
    db.commit()

    mock_activity = {
        "logId": 333444,
        "calories": 450,
        "averageHeartRate": 135,
        "duration": 3600000,
        "distance": 0.0,
        "elevationGain": 0.0,
        "activityName": "Weights",
    }
    with (
        patch("app.routers.fitbit_sync.fitbit_utils.get_fitbit_activity", return_value=mock_activity),
        patch("app.routers.fitbit_sync.fitbit_utils.probe_has_gps", return_value=False),
    ):
        resp = await client.post("/workouts/sync-fitbit-bulk", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["synced"] == 1


# ---------------------------------------------------------------------------
# sync_fitbit_create_missing — POST /workouts/sync-fitbit-create-missing
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_sync_fitbit_create_missing_no_tokens(client, auth_headers):
    resp = await client.post("/workouts/sync-fitbit-create-missing", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["created"] == 0


@pytest.mark.anyio
async def test_sync_fitbit_create_missing_no_activities(client, auth_headers, db):
    user = _get_user(db)
    _fitbit_tokens(db, user.id)
    with patch("app.routers.fitbit_sync.fitbit_utils.get_fitbit_activities_range", return_value=[]):
        resp = await client.post("/workouts/sync-fitbit-create-missing", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["created"] == 0


@pytest.mark.anyio
async def test_sync_fitbit_create_missing_skips_walk(client, auth_headers, db):
    user = _get_user(db)
    _fitbit_tokens(db, user.id)
    activities = [{"activityName": "Walk", "startTime": "2026-06-10T10:00:00Z", "duration": 1800000}]
    with patch("app.routers.fitbit_sync.fitbit_utils.get_fitbit_activities_range", return_value=activities):
        resp = await client.post("/workouts/sync-fitbit-create-missing", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["created"] == 0


@pytest.mark.anyio
async def test_sync_fitbit_create_missing_creates_run(client, auth_headers, db):
    user = _get_user(db)
    _fitbit_tokens(db, user.id)
    # Pre-create cardio exercise so it gets attached
    muscle = models.Muscle(name="abdomen_csm")
    db.add(muscle)
    db.flush()
    cardio_ex = models.Exercise(name="cardio", muscle_id=muscle.id)
    db.add(cardio_ex)
    db.commit()

    activities = [
        {
            "logId": 999888,
            "activityName": "Run",
            "activityTypeId": 90009,
            "startTime": "2026-06-10T07:00:00Z",
            "duration": 3600000,
            "calories": 400,
            "averageHeartRate": 155,
            "distance": 8.0,
            "elevationGain": 50.0,
        }
    ]
    with (
        patch("app.routers.fitbit_sync.fitbit_utils.get_fitbit_activities_range", return_value=activities),
        patch("app.routers.fitbit_sync.fitbit_utils.probe_has_gps", return_value=False),
    ):
        resp = await client.post("/workouts/sync-fitbit-create-missing", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["created"] == 1


@pytest.mark.anyio
async def test_sync_fitbit_create_missing_skips_existing_log_id(client, auth_headers, db):
    user = _get_user(db)
    _fitbit_tokens(db, user.id)
    _make_workout(db, user.id, fitbit_log_id="555666")

    activities = [
        {
            "logId": 555666,
            "activityName": "Run",
            "startTime": "2026-06-10T07:00:00Z",
            "duration": 3600000,
            "calories": 400,
        }
    ]
    with patch("app.routers.fitbit_sync.fitbit_utils.get_fitbit_activities_range", return_value=activities):
        resp = await client.post("/workouts/sync-fitbit-create-missing", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["created"] == 0


@pytest.mark.anyio
async def test_sync_fitbit_create_missing_invalid_start_time(client, auth_headers, db):
    """Activity with invalid startTime is skipped via except."""
    user = _get_user(db)
    _fitbit_tokens(db, user.id)
    activities = [
        {
            "logId": 777888,
            "activityName": "Run",
            "startTime": "bad-time",
            "duration": 3600000,
        }
    ]
    with patch("app.routers.fitbit_sync.fitbit_utils.get_fitbit_activities_range", return_value=activities):
        resp = await client.post("/workouts/sync-fitbit-create-missing", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["created"] == 0


# ---------------------------------------------------------------------------
# sync_fitbit_to_workout — POST /workouts/{workout_id}/sync-fitbit
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_sync_fitbit_to_workout_not_found(client, auth_headers):
    resp = await client.post("/workouts/00000000-0000-0000-0000-000000000000/sync-fitbit", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_sync_fitbit_to_workout_no_tokens(client, auth_headers, db):
    user = _get_user(db)
    w = _make_workout(db, user.id)
    resp = await client.post(f"/workouts/{w.id}/sync-fitbit", headers=auth_headers)
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_sync_fitbit_to_workout_no_activity(client, auth_headers, db):
    user = _get_user(db)
    _fitbit_tokens(db, user.id)
    w = _make_workout(db, user.id)
    with patch("app.routers.fitbit_sync.fitbit_utils.get_fitbit_activity", return_value=None):
        resp = await client.post(f"/workouts/{w.id}/sync-fitbit", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_sync_fitbit_to_workout_success_weights(client, auth_headers, db):
    user = _get_user(db)
    _fitbit_tokens(db, user.id)
    w = _make_workout(db, user.id)
    mock_activity = {
        "logId": 12300,
        "calories": 350,
        "averageHeartRate": 130,
        "duration": 3600000,
        "distance": 0.0,
        "elevationGain": 0.0,
        "activityName": "Weights",
        "hasGps": False,
    }
    with patch("app.routers.fitbit_sync.fitbit_utils.get_fitbit_activity", return_value=mock_activity):
        resp = await client.post(f"/workouts/{w.id}/sync-fitbit", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["calories"] == 350


@pytest.mark.anyio
async def test_sync_fitbit_to_workout_run_creates_cardio_set(client, auth_headers, db):
    """Run activity with existing 'cardio' exercise creates a cardio ExerciseSet."""
    user = _get_user(db)
    _fitbit_tokens(db, user.id)
    w = _make_workout(db, user.id)
    muscle = models.Muscle(name="abdomen_sfr")
    db.add(muscle)
    db.flush()
    cardio_ex = models.Exercise(name="cardio", muscle_id=muscle.id)
    db.add(cardio_ex)
    db.commit()

    mock_activity = {
        "logId": 45678,
        "calories": 450,
        "averageHeartRate": 155,
        "duration": 3600000,
        "distance": 8.0,
        "elevationGain": 20.0,
        "activityName": "Run",
        "hasGps": True,
    }
    with patch("app.routers.fitbit_sync.fitbit_utils.get_fitbit_activity", return_value=mock_activity):
        resp = await client.post(f"/workouts/{w.id}/sync-fitbit", headers=auth_headers)
    assert resp.status_code == 200
    db.expire_all()
    sets = db.query(models.ExerciseSet).filter(models.ExerciseSet.workout_id == w.id).all()
    assert any(s.exercise_id == cardio_ex.id for s in sets)


@pytest.mark.anyio
async def test_sync_fitbit_to_workout_run_no_cardio_exercise(client, auth_headers, db):
    """Run activity with no 'cardio' exercise and non-root user → just saves FitbitData."""
    user = _get_user(db)
    _fitbit_tokens(db, user.id)
    w = _make_workout(db, user.id)
    mock_activity = {
        "logId": 99100,
        "calories": 300,
        "averageHeartRate": 145,
        "duration": 2400000,
        "distance": 5.0,
        "elevationGain": 0.0,
        "activityName": "Run",
        "hasGps": False,
    }
    with patch("app.routers.fitbit_sync.fitbit_utils.get_fitbit_activity", return_value=mock_activity):
        resp = await client.post(f"/workouts/{w.id}/sync-fitbit", headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.anyio
async def test_sync_fitbit_to_workout_updates_calendar(client, auth_headers, db):
    """When tokens have selected_calendar_id, google calendar is updated."""
    user = _get_user(db)
    tokens = _fitbit_tokens(db, user.id)
    tokens.selected_calendar_id = "cal-abc"
    tokens.google_access_token = "goog-tok"
    db.commit()
    w = _make_workout(db, user.id)
    mock_activity = {
        "logId": 55500,
        "calories": 300,
        "averageHeartRate": 130,
        "duration": 3600000,
        "distance": 0.0,
        "elevationGain": 0.0,
        "activityName": "Weights",
        "hasGps": False,
    }
    with (
        patch("app.routers.fitbit_sync.fitbit_utils.get_fitbit_activity", return_value=mock_activity),
        patch("app.routers.fitbit_sync.update_google_calendar_event", return_value="ev-123"),
    ):
        resp = await client.post(f"/workouts/{w.id}/sync-fitbit", headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.anyio
async def test_sync_fitbit_to_workout_root_creates_cardio_exercise(client, root_headers, db):
    """Root user with abdomen muscle and no cardio exercise → creates cardio exercise."""
    user = db.query(models.User).filter(models.User.email == "root@test.com").first()
    tokens = models.UserTokens(
        user_id=user.id,
        fitbit_access_token="root-fitbit",
        fitbit_refresh_token="root-ref",
    )
    db.add(tokens)
    db.flush()
    muscle = models.Muscle(name="abdomen")
    db.add(muscle)
    db.flush()
    w = models.Workout(
        user_id=user.id,
        title="Root Run",
        start_time=datetime(2026, 6, 12, 10, 0),
        end_time=datetime(2026, 6, 12, 11, 0),
    )
    db.add(w)
    db.commit()

    mock_activity = {
        "logId": 77700,
        "calories": 380,
        "averageHeartRate": 158,
        "duration": 3600000,
        "distance": 9.0,
        "elevationGain": 30.0,
        "activityName": "Run",
        "hasGps": False,
    }
    with patch("app.routers.fitbit_sync.fitbit_utils.get_fitbit_activity", return_value=mock_activity):
        resp = await client.post(f"/workouts/{w.id}/sync-fitbit", headers=root_headers)
    assert resp.status_code == 200
    db.expire_all()
    cardio_ex = db.query(models.Exercise).filter(models.Exercise.name == "cardio").first()
    assert cardio_ex is not None


# ---------------------------------------------------------------------------
# sync_gps_flags — POST /workouts/sync-gps-flags
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_sync_gps_flags_no_tokens(client, auth_headers):
    resp = await client.post("/workouts/sync-gps-flags", headers=auth_headers)
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_sync_gps_flags_no_candidates(client, auth_headers, db):
    user = _get_user(db)
    _fitbit_tokens(db, user.id)
    resp = await client.post("/workouts/sync-gps-flags", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["checked"] == 0


@pytest.mark.anyio
async def test_sync_gps_flags_updates_record(client, auth_headers, db):
    user = _get_user(db)
    _fitbit_tokens(db, user.id)
    w = _make_workout(db, user.id)
    fd = models.FitbitData(
        workout_id=w.id,
        fitbit_log_id="log-gps-1",
        has_gps=False,
        activity_name="Run",
    )
    db.add(fd)
    db.commit()

    with patch("app.routers.fitbit_sync.fitbit_utils.probe_has_gps", return_value=True):
        resp = await client.post("/workouts/sync-gps-flags", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["updated"] == 1
    assert data["checked"] == 1


@pytest.mark.anyio
async def test_sync_gps_flags_skips_weights(client, auth_headers, db):
    """FitbitData with activity_name='Weights' is skipped."""
    user = _get_user(db)
    _fitbit_tokens(db, user.id)
    w = _make_workout(db, user.id)
    fd = models.FitbitData(
        workout_id=w.id,
        fitbit_log_id="log-weights-1",
        has_gps=False,
        activity_name="Weights",
    )
    db.add(fd)
    db.commit()

    resp = await client.post("/workouts/sync-gps-flags", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["checked"] == 0


# ---------------------------------------------------------------------------
# get_workout_route — GET /workouts/{workout_id}/route
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_get_workout_route_not_found(client, auth_headers):
    resp = await client.get("/workouts/00000000-0000-0000-0000-000000000000/route", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_get_workout_route_no_fitbit_data(client, auth_headers, db):
    user = _get_user(db)
    w = _make_workout(db, user.id)
    resp = await client.get(f"/workouts/{w.id}/route", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_get_workout_route_no_tokens(client, auth_headers, db):
    user = _get_user(db)
    w = _make_workout(db, user.id, fitbit_log_id="log-route-1")
    resp = await client.get(f"/workouts/{w.id}/route", headers=auth_headers)
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_get_workout_route_no_points(client, auth_headers, db):
    user = _get_user(db)
    _fitbit_tokens(db, user.id)
    w = _make_workout(db, user.id, fitbit_log_id="log-route-2")
    with patch("app.routers.fitbit_sync.fitbit_utils.get_fitbit_route", return_value=[]):
        resp = await client.get(f"/workouts/{w.id}/route", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_get_workout_route_success(client, auth_headers, db):
    user = _get_user(db)
    _fitbit_tokens(db, user.id)
    w = _make_workout(db, user.id, fitbit_log_id="log-route-3")
    points = [{"lat": 40.4, "lon": -3.7, "ele": 650.0}]
    with patch("app.routers.fitbit_sync.fitbit_utils.get_fitbit_route", return_value=points):
        resp = await client.get(f"/workouts/{w.id}/route", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["lat"] == 40.4
