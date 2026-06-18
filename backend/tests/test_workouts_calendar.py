"""Tests for workouts.py routes that require Google Calendar or Fitbit tokens."""
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from app import models


def _add_tokens(db, user_id, *, google=True, fitbit=False, cal_id="cal-123"):
    tokens = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.user_id == user_id)
        .first()
    )
    if tokens is None:
        tokens = models.UserTokens(user_id=user_id)
        db.add(tokens)
    if google:
        tokens.google_access_token = "fake-google-access"
        tokens.google_refresh_token = "fake-google-refresh"
        tokens.selected_calendar_id = cal_id
    if fitbit:
        tokens.fitbit_access_token = "fake-fitbit-access"
        tokens.fitbit_refresh_token = "fake-fitbit-refresh"
    db.commit()
    return tokens


def _get_user(db):
    return db.query(models.User).filter(models.User.email == "user@test.com").first()


# ---------------------------------------------------------------------------
# list_calendars
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_list_calendars_with_tokens(client, auth_headers, db):
    user = _get_user(db)
    _add_tokens(db, user.id)

    mock_svc = MagicMock()
    mock_svc.calendarList().list().execute.return_value = {
        "items": [
            {"id": "cal-1", "summary": "Primary", "primary": True},
            {"id": "cal-123", "summary": "GymHub"},
        ]
    }

    with (
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=mock_svc),
    ):
        resp = await client.get("/workouts/calendars", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert any(c["id"] == "cal-1" for c in data)
    assert any(c["selected"] is True for c in data)


# ---------------------------------------------------------------------------
# create_calendar
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_create_calendar_with_tokens(client, auth_headers, db):
    user = _get_user(db)
    _add_tokens(db, user.id)

    mock_svc = MagicMock()
    mock_svc.calendars().insert().execute.return_value = {
        "id": "new-cal-id",
        "summary": "Mi Gym",
    }

    with (
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=mock_svc),
    ):
        resp = await client.post(
            "/workouts/create-calendar",
            params={"name": "Mi Gym"},
            headers=auth_headers,
        )

    assert resp.status_code == 200
    assert resp.json()["id"] == "new-cal-id"


# ---------------------------------------------------------------------------
# reformat_all_events (root only)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_reformat_all_events_no_events(client, root_headers, db):
    root = db.query(models.User).filter(models.User.email == "root@test.com").first()
    _add_tokens(db, root.id)

    with patch("app.routers.workouts.update_google_calendar_event", return_value="ev-id"):
        resp = await client.post("/workouts/reformat-all", headers=root_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["updated"] == 0
    assert data["total"] == 0


@pytest.mark.anyio
async def test_reformat_all_events_one_event(client, root_headers, db):
    root = db.query(models.User).filter(models.User.email == "root@test.com").first()
    _add_tokens(db, root.id)

    workout = models.Workout(
        user_id=root.id,
        title="Pecho",
        start_time=datetime(2026, 5, 1, 10, 0),
        end_time=datetime(2026, 5, 1, 11, 0),
        google_event_id="ev-existing",
    )
    db.add(workout)
    db.commit()

    with patch("app.routers.workouts.update_google_calendar_event", return_value="ev-existing"):
        resp = await client.post("/workouts/reformat-all", headers=root_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["updated"] == 1
    assert data["total"] == 1


@pytest.mark.anyio
async def test_reformat_all_events_failed(client, root_headers, db):
    root = db.query(models.User).filter(models.User.email == "root@test.com").first()
    _add_tokens(db, root.id)

    workout = models.Workout(
        user_id=root.id,
        title="Espalda",
        start_time=datetime(2026, 5, 10, 10, 0),
        end_time=datetime(2026, 5, 10, 11, 0),
        google_event_id="ev-fail",
    )
    db.add(workout)
    db.commit()

    with patch("app.routers.workouts.update_google_calendar_event", return_value=None):
        resp = await client.post("/workouts/reformat-all", headers=root_headers)

    assert resp.status_code == 200
    assert resp.json()["failed"] == 1


# ---------------------------------------------------------------------------
# reformat_last_n_events
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_reformat_last_no_events(client, auth_headers, db):
    user = _get_user(db)
    _add_tokens(db, user.id)

    with patch("app.routers.workouts.update_google_calendar_event", return_value="ev-id"):
        resp = await client.post("/workouts/reformat-last/5", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["updated"] == 0
    assert data["failed"] == 0


@pytest.mark.anyio
async def test_reformat_last_with_event(client, auth_headers, db):
    user = _get_user(db)
    _add_tokens(db, user.id)

    workout = models.Workout(
        user_id=user.id,
        title="Espalda",
        start_time=datetime(2026, 5, 2, 10, 0),
        end_time=datetime(2026, 5, 2, 11, 0),
        google_event_id="ev-back-1",
    )
    db.add(workout)
    db.commit()

    with patch("app.routers.workouts.update_google_calendar_event", return_value="ev-back-1"):
        resp = await client.post("/workouts/reformat-last/3", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["updated"] == 1
    assert len(data["updated_workouts"]) == 1


# ---------------------------------------------------------------------------
# update_workout — Fitbit auto-sync path
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_update_workout_fitbit_weights(client, auth_headers, db):
    user = _get_user(db)
    _add_tokens(db, user.id, fitbit=True, google=False)

    workout = models.Workout(
        user_id=user.id,
        title="Pecho",
        start_time=datetime(2026, 5, 1, 10, 0),
        end_time=datetime(2026, 5, 1, 11, 0),
    )
    db.add(workout)
    db.commit()

    mock_activity = {
        "logId": 12340001,
        "calories": 400,
        "averageHeartRate": 140,
        "duration": 3600000,
        "distance": 0.0,
        "elevationGain": 0.0,
        "activityName": "Weights",
    }

    with (
        patch("app.routers.workouts.fitbit_utils.get_fitbit_activity", return_value=mock_activity),
        patch("app.routers.workouts.update_google_calendar_event", return_value=None),
    ):
        resp = await client.put(
            f"/workouts/{workout.id}",
            headers=auth_headers,
            json={
                "title": "Pecho Updated",
                "start_time": "2026-05-01T10:00:00",
                "end_time": "2026-05-01T11:00:00",
                "exercise_sets": [],
            },
        )

    assert resp.status_code == 200
    db.expire_all()
    fitbit = (
        db.query(models.FitbitData)
        .filter(models.FitbitData.workout_id == workout.id)
        .first()
    )
    assert fitbit is not None
    assert fitbit.calories == 400
    assert fitbit.activity_name == "Weights"


@pytest.mark.anyio
async def test_update_workout_fitbit_run_activity(client, auth_headers, db):
    """Run activity triggers the cardio exercise set creation path."""
    user = _get_user(db)
    _add_tokens(db, user.id, fitbit=True, google=False)

    workout = models.Workout(
        user_id=user.id,
        title="Cardio",
        start_time=datetime(2026, 5, 5, 7, 0),
        end_time=datetime(2026, 5, 5, 8, 0),
    )
    db.add(workout)
    db.commit()

    mock_activity = {
        "logId": 12340002,
        "calories": 500,
        "averageHeartRate": 165,
        "duration": 3600000,
        "distance": 7.5,
        "elevationGain": 50.0,
        "activityName": "Run",
    }

    with (
        patch("app.routers.workouts.fitbit_utils.get_fitbit_activity", return_value=mock_activity),
        patch("app.routers.workouts.update_google_calendar_event", return_value=None),
    ):
        resp = await client.put(
            f"/workouts/{workout.id}",
            headers=auth_headers,
            json={
                "title": "Cardio Updated",
                "start_time": "2026-05-05T07:00:00",
                "end_time": "2026-05-05T08:00:00",
                "exercise_sets": [],
            },
        )

    assert resp.status_code == 200


@pytest.mark.anyio
async def test_update_workout_fitbit_no_activity(client, auth_headers, db):
    """When get_fitbit_activity returns None, update still succeeds without FitbitData."""
    user = _get_user(db)
    _add_tokens(db, user.id, fitbit=True, google=False)

    workout = models.Workout(
        user_id=user.id,
        title="Hombro",
        start_time=datetime(2026, 5, 6, 10, 0),
        end_time=datetime(2026, 5, 6, 11, 0),
    )
    db.add(workout)
    db.commit()

    with (
        patch("app.routers.workouts.fitbit_utils.get_fitbit_activity", return_value=None),
        patch("app.routers.workouts.update_google_calendar_event", return_value=None),
    ):
        resp = await client.put(
            f"/workouts/{workout.id}",
            headers=auth_headers,
            json={
                "title": "Hombro Updated",
                "start_time": "2026-05-06T10:00:00",
                "end_time": "2026-05-06T11:00:00",
                "exercise_sets": [],
            },
        )

    assert resp.status_code == 200


@pytest.mark.anyio
async def test_update_workout_calendar_sync(client, auth_headers, db):
    """update_workout triggers calendar sync when Google tokens are set."""
    user = _get_user(db)
    _add_tokens(db, user.id, google=True, fitbit=False)

    workout = models.Workout(
        user_id=user.id,
        title="Triceps",
        start_time=datetime(2026, 5, 3, 10, 0),
        end_time=datetime(2026, 5, 3, 11, 0),
    )
    db.add(workout)
    db.commit()

    with patch(
        "app.routers.workouts.update_google_calendar_event", return_value="ev-xyz"
    ) as mock_cal:
        resp = await client.put(
            f"/workouts/{workout.id}",
            headers=auth_headers,
            json={
                "title": "Triceps Updated",
                "start_time": "2026-05-03T10:00:00",
                "end_time": "2026-05-03T11:00:00",
                "exercise_sets": [],
            },
        )

    assert resp.status_code == 200
    mock_cal.assert_called_once()


# ---------------------------------------------------------------------------
# delete_workout — with google_event_id
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_reformat_last_failed_event(client, auth_headers, db):
    """When update_google_calendar_event returns None, the event appears in failed list."""
    user = _get_user(db)
    _add_tokens(db, user.id)

    workout = models.Workout(
        user_id=user.id,
        title="Biceps",
        start_time=datetime(2026, 5, 3, 10, 0),
        end_time=datetime(2026, 5, 3, 11, 0),
        google_event_id="ev-fail-1",
    )
    db.add(workout)
    db.commit()

    with patch("app.routers.workouts.update_google_calendar_event", return_value=None):
        resp = await client.post("/workouts/reformat-last/3", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["failed"] == 1
    assert data["updated"] == 0


# ---------------------------------------------------------------------------
# create_calendar — creds fail path (line 34)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_create_calendar_creds_fail(client, auth_headers, db):
    user = _get_user(db)
    _add_tokens(db, user.id)

    with patch("app.routers.workouts.get_google_credentials", return_value=None):
        resp = await client.post(
            "/workouts/create-calendar",
            params={"name": "Fail Cal"},
            headers=auth_headers,
        )

    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# list_calendars — creds fail path (line 61)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_list_calendars_creds_fail(client, auth_headers, db):
    user = _get_user(db)
    _add_tokens(db, user.id)

    with patch("app.routers.workouts.get_google_credentials", return_value=None):
        resp = await client.get("/workouts/calendars", headers=auth_headers)

    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# test-parse route (lines 464-516)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_test_parse_with_gymhub_events(client, auth_headers, db, sample_exercise):
    user = _get_user(db)
    _add_tokens(db, user.id)

    mock_svc = MagicMock()
    mock_svc.events().list().execute.return_value = {
        "items": [
            {
                "id": "ev-001",
                "summary": "Pecho",
                "start": {"dateTime": "2026-05-01T10:00:00Z"},
                "description": "[GymHub]\nPecho - Press banca 80kg",
            },
            {
                "id": "ev-002",
                "summary": "Random note",
                "start": {"dateTime": "2026-05-02T10:00:00Z"},
                "description": "Just a note without gym format",
            },
        ]
    }

    with (
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=mock_svc),
    ):
        resp = await client.get("/workouts/test-parse", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1  # only the GymHub-tagged event is returned
    assert data[0]["id"] == "ev-001"


@pytest.mark.anyio
async def test_test_parse_no_gymhub_events(client, auth_headers, db):
    user = _get_user(db)
    _add_tokens(db, user.id)

    mock_svc = MagicMock()
    mock_svc.events().list().execute.return_value = {"items": []}

    with (
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=mock_svc),
    ):
        resp = await client.get("/workouts/test-parse", headers=auth_headers)

    assert resp.status_code == 200
    assert resp.json() == []


# ---------------------------------------------------------------------------
# update_workout — run activity with pre-existing cardio exercise (lines 369-392)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_update_workout_fitbit_run_with_cardio_exercise(client, auth_headers, db):
    """When a cardio exercise already exists, a cardio set is added to the workout."""
    user = _get_user(db)
    _add_tokens(db, user.id, fitbit=True, google=False)

    muscle = models.Muscle(name="abdomen")
    db.add(muscle)
    db.flush()
    cardio_ex = models.Exercise(name="cardio", muscle_id=muscle.id)
    db.add(cardio_ex)
    db.flush()

    workout = models.Workout(
        user_id=user.id,
        title="Cardio Run",
        start_time=datetime(2026, 6, 1, 7, 0),
        end_time=datetime(2026, 6, 1, 8, 0),
    )
    db.add(workout)
    db.commit()

    mock_activity = {
        "logId": 99990001,
        "calories": 450,
        "averageHeartRate": 160,
        "duration": 3600000,
        "distance": 8.0,
        "elevationGain": 30.0,
        "activityName": "Run",
    }

    with (
        patch("app.routers.workouts.fitbit_utils.get_fitbit_activity", return_value=mock_activity),
        patch("app.routers.workouts.update_google_calendar_event", return_value=None),
    ):
        resp = await client.put(
            f"/workouts/{workout.id}",
            headers=auth_headers,
            json={
                "title": "Cardio Run Updated",
                "start_time": "2026-06-01T07:00:00",
                "end_time": "2026-06-01T08:00:00",
                "exercise_sets": [],
            },
        )

    assert resp.status_code == 200
    db.expire_all()
    cardio_sets = (
        db.query(models.ExerciseSet)
        .filter(
            models.ExerciseSet.workout_id == workout.id,
            models.ExerciseSet.exercise_id == cardio_ex.id,
        )
        .all()
    )
    assert len(cardio_sets) == 1
    assert cardio_sets[0].measurement == "min"


# ---------------------------------------------------------------------------
# delete_workout — with google_event_id
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_delete_workout_with_calendar_event(client, auth_headers, db):
    user = _get_user(db)
    _add_tokens(db, user.id)

    workout = models.Workout(
        user_id=user.id,
        title="Pierna",
        start_time=datetime(2026, 5, 4, 10, 0),
        end_time=datetime(2026, 5, 4, 11, 0),
        google_event_id="event-del-123",
    )
    db.add(workout)
    db.commit()
    wid = workout.id

    mock_svc = MagicMock()
    mock_svc.events().delete().execute.return_value = {}

    with (
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=mock_svc),
    ):
        resp = await client.delete(f"/workouts/{wid}", headers=auth_headers)

    assert resp.status_code == 200
    assert db.query(models.Workout).filter(models.Workout.id == wid).first() is None


# ---------------------------------------------------------------------------
# sync_all_from_calendar — GET /workouts/sync-all
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_sync_all_no_tokens(client, auth_headers):
    resp = await client.get("/workouts/sync-all", headers=auth_headers)
    assert resp.status_code == 400
    assert "No user tokens" in resp.json()["detail"]


@pytest.mark.anyio
async def test_sync_all_no_access_token(client, auth_headers, db):
    user = _get_user(db)
    tokens = models.UserTokens(user_id=user.id)  # no google_access_token
    db.add(tokens)
    db.commit()
    resp = await client.get("/workouts/sync-all", headers=auth_headers)
    assert resp.status_code == 400
    assert "Missing access token" in resp.json()["detail"]


@pytest.mark.anyio
async def test_sync_all_no_credentials(client, auth_headers, db):
    user = _get_user(db)
    _add_tokens(db, user.id, google=True)
    with patch("app.routers.workouts.get_google_credentials", return_value=None):
        resp = await client.get("/workouts/sync-all", headers=auth_headers)
    assert resp.status_code == 400
    assert "reconnect" in resp.json()["detail"]


@pytest.mark.anyio
async def test_sync_all_full_no_events(client, auth_headers, db):
    """Full sync with no calendar events returns 0 processed."""
    user = _get_user(db)
    _add_tokens(db, user.id, google=True)

    mock_svc = MagicMock()
    mock_svc.events.return_value.list.return_value.execute.return_value = {
        "items": [],
        "nextSyncToken": "tok-new",
    }

    with (
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=mock_svc),
    ):
        resp = await client.get("/workouts/sync-all", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert "0 workouts" in data["message"]
    assert "full" in data["message"]


@pytest.mark.anyio
async def test_sync_all_skips_non_gymhub_event(client, auth_headers, db):
    """Events without [GymHub] tag and no workout format are skipped."""
    user = _get_user(db)
    _add_tokens(db, user.id, google=True)

    event = {
        "id": "evt-ordinary",
        "summary": "Doctor appointment",
        "description": "Reminder to go",
        "start": {"dateTime": "2026-06-01T10:00:00Z"},
        "end": {"dateTime": "2026-06-01T11:00:00Z"},
        "status": "confirmed",
    }
    mock_svc = MagicMock()
    mock_svc.events.return_value.list.return_value.execute.return_value = {
        "items": [event],
        "nextSyncToken": "tok-skip",
    }

    with (
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=mock_svc),
    ):
        resp = await client.get("/workouts/sync-all", headers=auth_headers)

    assert resp.status_code == 200
    assert "0 workouts" in resp.json()["message"]


@pytest.mark.anyio
async def test_sync_all_cancelled_event_deletes_workout(client, auth_headers, db):
    """A cancelled calendar event removes the corresponding local workout."""
    user = _get_user(db)
    _add_tokens(db, user.id, google=True)

    workout = models.Workout(
        user_id=user.id,
        title="Hombro",
        start_time=datetime(2026, 6, 1, 9, 0),
        end_time=datetime(2026, 6, 1, 10, 0),
        google_event_id="evt-cancel-sync",
    )
    db.add(workout)
    db.commit()
    wid = workout.id

    event = {
        "id": "evt-cancel-sync",
        "summary": "Hombro",
        "description": "",
        "status": "cancelled",
        "start": {"dateTime": "2026-06-01T09:00:00Z"},
        "end": {"dateTime": "2026-06-01T10:00:00Z"},
    }
    mock_svc = MagicMock()
    mock_svc.events.return_value.list.return_value.execute.return_value = {
        "items": [event],
        "nextSyncToken": "tok-cancel",
    }

    with (
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=mock_svc),
    ):
        resp = await client.get("/workouts/sync-all", headers=auth_headers)

    assert resp.status_code == 200
    db.expire_all()
    assert db.query(models.Workout).filter(models.Workout.id == wid).first() is None


@pytest.mark.anyio
async def test_sync_all_gymhub_event_creates_workout(client, auth_headers, db):
    """A [GymHub]-tagged event with Fitbit data creates a workout and FitbitData record."""
    user = _get_user(db)
    _add_tokens(db, user.id, google=True)

    event = {
        "id": "evt-gymhub-new",
        "summary": "Pecho",
        "description": "[GymHub]\n",
        "status": "confirmed",
        "start": {"dateTime": "2026-06-02T10:00:00Z"},
        "end": {"dateTime": "2026-06-02T11:00:00Z"},
    }
    mock_svc = MagicMock()
    mock_svc.events.return_value.list.return_value.execute.return_value = {
        "items": [event],
        "nextSyncToken": "tok-gymhub",
    }

    mock_parse_result = {"sets": [], "fitbit": {"calories": 350, "heart_rate_avg": 140, "duration_ms": 3600000}}

    with (
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=mock_svc),
        patch("app.routers.workouts.calendar_utils.parse_calendar_description", return_value=mock_parse_result),
    ):
        resp = await client.get("/workouts/sync-all", headers=auth_headers)

    assert resp.status_code == 200
    assert "1 workouts" in resp.json()["message"]
    db.expire_all()
    new_workout = db.query(models.Workout).filter(models.Workout.google_event_id == "evt-gymhub-new").first()
    assert new_workout is not None
    assert new_workout.title == "Pecho"


@pytest.mark.anyio
async def test_sync_all_incremental_with_sync_token(client, auth_headers, db):
    """Incremental sync uses the stored sync_token."""
    user = _get_user(db)
    tokens = _add_tokens(db, user.id, google=True)
    tokens.google_calendar_sync_token = "existing-sync-token"
    db.commit()

    mock_svc = MagicMock()
    mock_svc.events.return_value.list.return_value.execute.return_value = {
        "items": [],
        "nextSyncToken": "new-sync-token",
    }

    with (
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=mock_svc),
    ):
        resp = await client.get("/workouts/sync-all", headers=auth_headers)

    assert resp.status_code == 200
    assert "incremental" in resp.json()["message"]
    db.expire_all()
    updated_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == user.id).first()
    assert updated_tokens.google_calendar_sync_token == "new-sync-token"
