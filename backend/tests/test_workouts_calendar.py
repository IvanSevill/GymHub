"""Tests for workouts.py routes that require Google Calendar or Fitbit tokens."""
import uuid
from datetime import datetime
from unittest.mock import MagicMock, patch

from googleapiclient.errors import HttpError as GHttpError

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
    assert resp.json()["detail"]["code"] == "GOOGLE_CALENDAR_NOT_CONNECTED"


@pytest.mark.anyio
async def test_sync_all_no_access_token(client, auth_headers, db):
    user = _get_user(db)
    tokens = models.UserTokens(user_id=user.id)  # no google_access_token
    db.add(tokens)
    db.commit()
    resp = await client.get("/workouts/sync-all", headers=auth_headers)
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "GOOGLE_CALENDAR_REAUTH_REQUIRED"


@pytest.mark.anyio
async def test_sync_all_no_credentials(client, auth_headers, db):
    user = _get_user(db)
    _add_tokens(db, user.id, google=True)
    with patch("app.routers.workouts.get_google_credentials", return_value=None):
        resp = await client.get("/workouts/sync-all", headers=auth_headers)
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "GOOGLE_CALENDAR_REAUTH_REQUIRED"


@pytest.mark.anyio
async def test_sync_all_preserves_jwt_401_semantics(client):
    resp = await client.get(
        "/workouts/sync-all",
        headers={"X-Correlation-ID": str(uuid.uuid4())},
    )

    assert resp.status_code == 401
    assert resp.json()["detail"] == "Not authenticated"


@pytest.mark.anyio
async def test_sync_all_replaces_invalid_correlation(client, auth_headers):
    resp = await client.get(
        "/workouts/sync-all",
        headers={**auth_headers, "X-Correlation-ID": "token=secret arbitrary log text"},
    )

    assert resp.status_code == 400
    correlation_id = resp.json()["detail"]["correlation_id"]
    assert str(uuid.UUID(correlation_id)) == correlation_id
    assert "secret" not in resp.text


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
async def test_sync_all_round_trips_correlation_and_logs(client, auth_headers, db, caplog):
    user = _get_user(db)
    _add_tokens(db, user.id, google=True)
    correlation_id = str(uuid.uuid4())
    mock_svc = MagicMock()
    mock_svc.events.return_value.list.return_value.execute.return_value = {
        "items": [],
        "nextSyncToken": "tok-new",
    }

    with (
        caplog.at_level("INFO", logger="app.routers.workouts"),
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=mock_svc),
    ):
        resp = await client.get(
            "/workouts/sync-all",
            headers={**auth_headers, "X-Correlation-ID": correlation_id},
        )

    assert resp.status_code == 200
    assert resp.json()["correlation_id"] == correlation_id
    records = [record for record in caplog.records if hasattr(record, "correlation_id")]
    assert [record.event for record in records] == [
        "calendar_sync.started",
        "calendar_sync.completed",
    ]
    assert all(record.correlation_id == correlation_id for record in records)


@pytest.mark.anyio
async def test_sync_all_returns_safe_correlated_provider_failure(
    client, auth_headers, db, caplog
):
    user = _get_user(db)
    _add_tokens(db, user.id, google=True)
    correlation_id = str(uuid.uuid4())
    mock_svc = MagicMock()
    mock_svc.events.return_value.list.return_value.execute.side_effect = RuntimeError(
        "private provider payload token=secret SQL stack"
    )

    with (
        caplog.at_level("INFO", logger="app.routers.workouts"),
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=mock_svc),
    ):
        resp = await client.get(
            "/workouts/sync-all",
            headers={**auth_headers, "X-Correlation-ID": correlation_id},
        )

    assert resp.status_code == 500
    assert resp.json()["detail"] == {
        "stage": "google_calendar",
        "code": "GOOGLE_CALENDAR_API_UNAVAILABLE",
        "message": "Google Calendar is temporarily unavailable.",
        "correlation_id": correlation_id,
        "retryable": True,
    }
    failed_record = next(
        record
        for record in caplog.records
        if getattr(record, "event", None) == "calendar_sync.failed"
    )
    assert failed_record.exception_type == "RuntimeError"
    assert "private provider payload" not in caplog.text
    assert "secret" not in resp.text


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
async def test_sync_all_root_creates_muscle_and_exercise(client, root_headers, db):
    """As root, a parsed set with unknown muscle and exercise creates both and adds the set."""
    root = db.query(models.User).filter(models.User.email == "root@test.com").first()
    _add_tokens(db, root.id, google=True)

    event = {
        "id": "evt-root-new",
        "summary": "Pierna",
        "description": "[GymHub]\nCuadriceps - Sentadilla 100kg",
        "status": "confirmed",
        "start": {"dateTime": "2026-06-03T10:00:00Z"},
        "end": {"dateTime": "2026-06-03T11:00:00Z"},
    }
    mock_svc = MagicMock()
    mock_svc.events.return_value.list.return_value.execute.return_value = {
        "items": [event],
        "nextSyncToken": "tok-root",
    }
    mock_parse_result = {
        "sets": [
            {
                "muscle_name": "Cuadriceps Test",
                "exercise_name": "Sentadilla Test",
                "value": "100",
                "measurement": "kg",
                "is_completed": True,
            }
        ],
        "fitbit": None,
    }

    with (
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=mock_svc),
        patch("app.routers.workouts.calendar_utils.parse_calendar_description", return_value=mock_parse_result),
    ):
        resp = await client.get("/workouts/sync-all", headers=root_headers)

    assert resp.status_code == 200
    db.expire_all()
    assert db.query(models.Muscle).filter(models.Muscle.name == "Cuadriceps Test").first() is not None
    new_ex = db.query(models.Exercise).filter(models.Exercise.name == "Sentadilla Test").first()
    assert new_ex is not None


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


# ---------------------------------------------------------------------------
# cardio-pending — GET /workouts/cardio-pending
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_cardio_pending_empty(client, auth_headers):
    resp = await client.get("/workouts/cardio-pending", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.anyio
async def test_cardio_pending_returns_workouts(client, auth_headers, db):
    user = _get_user(db)
    workout = models.Workout(
        user_id=user.id,
        title="Cardio Run",
        start_time=datetime(2026, 6, 1, 7, 0),
        end_time=datetime(2026, 6, 1, 8, 0),
    )
    db.add(workout)
    db.flush()
    fd = models.FitbitData(
        workout_id=workout.id,
        activity_name="Run",
        calories=450,
        heart_rate_avg=160,
        duration_ms=3600000,
        distance_km=9.0,
    )
    db.add(fd)
    db.commit()

    resp = await client.get("/workouts/cardio-pending", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["activity_name"] == "Run"


# ---------------------------------------------------------------------------
# sync-cardio-to-calendar — POST /workouts/sync-cardio-to-calendar
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_sync_cardio_to_calendar_no_tokens(client, auth_headers):
    resp = await client.post(
        "/workouts/sync-cardio-to-calendar",
        json={"workout_ids": []},
        headers=auth_headers,
    )
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_sync_cardio_to_calendar_no_creds(client, auth_headers, db):
    user = _get_user(db)
    tokens = models.UserTokens(user_id=user.id, google_access_token="tok")
    db.add(tokens)
    db.commit()
    with patch("app.routers.workouts.get_google_credentials", return_value=None):
        resp = await client.post(
            "/workouts/sync-cardio-to-calendar",
            json={"workout_ids": []},
            headers=auth_headers,
        )
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_sync_cardio_to_calendar_workout_not_found(client, auth_headers, db):
    user = _get_user(db)
    _add_tokens(db, user.id, google=True)
    mock_svc = MagicMock()
    with (
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=mock_svc),
    ):
        resp = await client.post(
            "/workouts/sync-cardio-to-calendar",
            json={"workout_ids": ["00000000-0000-0000-0000-000000000000"]},
            headers=auth_headers,
        )
    assert resp.status_code == 200
    assert resp.json()["failed"] == 1


@pytest.mark.anyio
async def test_sync_cardio_to_calendar_already_synced(client, auth_headers, db):
    user = _get_user(db)
    _add_tokens(db, user.id, google=True)
    workout = models.Workout(
        user_id=user.id,
        title="Run Already",
        start_time=datetime(2026, 6, 3, 7, 0),
        end_time=datetime(2026, 6, 3, 8, 0),
        google_event_id="ev-already",
    )
    db.add(workout)
    db.flush()
    fd = models.FitbitData(workout_id=workout.id, activity_name="Run", calories=400, duration_ms=3600000)
    db.add(fd)
    db.commit()

    with (
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=MagicMock()),
    ):
        resp = await client.post(
            "/workouts/sync-cardio-to-calendar",
            json={"workout_ids": [workout.id]},
            headers=auth_headers,
        )
    assert resp.status_code == 200
    assert resp.json()["already_synced"] == 1


@pytest.mark.anyio
async def test_sync_cardio_to_calendar_success(client, auth_headers, db):
    user = _get_user(db)
    _add_tokens(db, user.id, google=True)
    workout = models.Workout(
        user_id=user.id,
        title="Run New",
        start_time=datetime(2026, 6, 4, 7, 0),
        end_time=datetime(2026, 6, 4, 8, 0),
    )
    db.add(workout)
    db.flush()
    fd = models.FitbitData(
        workout_id=workout.id,
        activity_name="Run",
        calories=400,
        heart_rate_avg=155,
        duration_ms=3600000,
        distance_km=8.0,
    )
    db.add(fd)
    db.commit()

    mock_svc = MagicMock()
    mock_svc.events.return_value.insert.return_value.execute.return_value = {"id": "new-cardio-ev"}

    with (
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=mock_svc),
    ):
        resp = await client.post(
            "/workouts/sync-cardio-to-calendar",
            json={"workout_ids": [workout.id]},
            headers=auth_headers,
        )
    assert resp.status_code == 200
    assert resp.json()["synced"] == 1


# ---------------------------------------------------------------------------
# create_calendar — API exception (lines 39-40)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_create_calendar_exception(client, auth_headers, db):
    user = _get_user(db)
    _add_tokens(db, user.id)
    mock_svc = MagicMock()
    mock_svc.calendars.return_value.insert.return_value.execute.side_effect = Exception("API error")
    with (
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=mock_svc),
    ):
        resp = await client.post(
            "/workouts/create-calendar", params={"name": "Test"}, headers=auth_headers
        )
    assert resp.status_code == 500


# ---------------------------------------------------------------------------
# list_calendars — exception branches (lines 78-88)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_list_calendars_http_error_401(client, auth_headers, db):
    user = _get_user(db)
    _add_tokens(db, user.id)
    mock_resp = MagicMock()
    mock_resp.status = 401
    mock_svc = MagicMock()
    mock_svc.calendarList.return_value.list.return_value.execute.side_effect = GHttpError(
        resp=mock_resp, content=b"Unauthorized"
    )
    with (
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=mock_svc),
    ):
        resp = await client.get("/workouts/calendars", headers=auth_headers)
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_list_calendars_generic_exception(client, auth_headers, db):
    user = _get_user(db)
    _add_tokens(db, user.id)
    mock_svc = MagicMock()
    mock_svc.calendarList.return_value.list.return_value.execute.side_effect = Exception(
        "Network error"
    )
    with (
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=mock_svc),
    ):
        resp = await client.get("/workouts/calendars", headers=auth_headers)
    assert resp.status_code == 500


# ---------------------------------------------------------------------------
# test-parse — creds fail + API exception (lines 466, 485-486)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_test_parse_no_credentials(client, auth_headers, db):
    user = _get_user(db)
    _add_tokens(db, user.id)
    with patch("app.routers.workouts.get_google_credentials", return_value=None):
        resp = await client.get("/workouts/test-parse", headers=auth_headers)
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_test_parse_api_exception(client, auth_headers, db):
    user = _get_user(db)
    _add_tokens(db, user.id)
    mock_svc = MagicMock()
    mock_svc.events.return_value.list.return_value.execute.side_effect = Exception("Timeout")
    with (
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=mock_svc),
    ):
        resp = await client.get("/workouts/test-parse", headers=auth_headers)
    assert resp.status_code == 500


# ---------------------------------------------------------------------------
# sync_all — HttpError 410 falls back to full sync (lines 574-578)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_sync_all_http_error_410_falls_back_to_full(client, auth_headers, db):
    user = _get_user(db)
    tokens = _add_tokens(db, user.id, google=True)
    tokens.google_calendar_sync_token = "stale-token"
    db.commit()

    mock_resp_410 = MagicMock()
    mock_resp_410.status = 410
    mock_svc = MagicMock()
    mock_svc.events.return_value.list.return_value.execute.side_effect = [
        GHttpError(resp=mock_resp_410, content=b"Gone"),
        {"items": [], "nextSyncToken": "fresh-tok"},
    ]

    with (
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=mock_svc),
    ):
        resp = await client.get("/workouts/sync-all", headers=auth_headers)

    assert resp.status_code == 200
    assert "full" in resp.json()["message"]
    db.expire_all()
    updated_tokens = (
        db.query(models.UserTokens).filter(models.UserTokens.user_id == user.id).first()
    )
    assert updated_tokens.google_calendar_sync_token == "fresh-tok"


# ---------------------------------------------------------------------------
# sync_all — updates existing workout (lines 672-678)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_sync_all_updates_existing_workout(client, auth_headers, db):
    user = _get_user(db)
    _add_tokens(db, user.id, google=True)

    workout = models.Workout(
        user_id=user.id,
        google_event_id="evt-existing-upd",
        title="Old Title",
        start_time=datetime(2026, 5, 1, 9, 0),
        end_time=datetime(2026, 5, 1, 10, 0),
    )
    db.add(workout)
    db.commit()

    event = {
        "id": "evt-existing-upd",
        "summary": "New Title",
        "description": "[GymHub]\n",
        "status": "confirmed",
        "start": {"dateTime": "2026-06-10T10:00:00Z"},
        "end": {"dateTime": "2026-06-10T11:00:00Z"},
    }
    mock_svc = MagicMock()
    mock_svc.events.return_value.list.return_value.execute.return_value = {
        "items": [event],
        "nextSyncToken": "tok-upd",
    }

    with (
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=mock_svc),
        patch(
            "app.routers.workouts.calendar_utils.parse_calendar_description",
            return_value={"sets": [], "fitbit": None},
        ),
    ):
        resp = await client.get("/workouts/sync-all", headers=auth_headers)

    assert resp.status_code == 200
    db.expire_all()
    updated = (
        db.query(models.Workout)
        .filter(models.Workout.google_event_id == "evt-existing-upd")
        .first()
    )
    assert updated.title == "New Title"


# ---------------------------------------------------------------------------
# sync_all — updates existing FitbitData (lines 738-760)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_sync_all_updates_existing_fitbit_data(client, auth_headers, db):
    user = _get_user(db)
    _add_tokens(db, user.id, google=True)

    workout = models.Workout(
        user_id=user.id,
        google_event_id="evt-fd-upd",
        title="Cardio",
        start_time=datetime(2026, 6, 5, 7, 0),
        end_time=datetime(2026, 6, 5, 8, 0),
    )
    db.add(workout)
    db.flush()
    fd = models.FitbitData(
        workout_id=workout.id, calories=100, heart_rate_avg=120, duration_ms=1800000
    )
    db.add(fd)
    db.commit()

    event = {
        "id": "evt-fd-upd",
        "summary": "Cardio",
        "description": "[GymHub]\n",
        "status": "confirmed",
        "start": {"dateTime": "2026-06-05T07:00:00Z"},
        "end": {"dateTime": "2026-06-05T08:00:00Z"},
    }
    mock_svc = MagicMock()
    mock_svc.events.return_value.list.return_value.execute.return_value = {
        "items": [event],
        "nextSyncToken": "tok-fd-upd",
    }
    mock_parse = {
        "sets": [],
        "fitbit": {
            "calories": 500,
            "heart_rate_avg": 155,
            "duration_ms": 3600000,
            "distance_km": 9.0,
            "elevation_gain_m": 50.0,
            "activity_name": "Run",
            "azm_fat_burn": 10,
            "azm_cardio": 20,
            "azm_peak": 5,
        },
    }

    with (
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=mock_svc),
        patch(
            "app.routers.workouts.calendar_utils.parse_calendar_description",
            return_value=mock_parse,
        ),
    ):
        resp = await client.get("/workouts/sync-all", headers=auth_headers)

    assert resp.status_code == 200
    db.expire_all()
    updated_fd = (
        db.query(models.FitbitData).filter(models.FitbitData.workout_id == workout.id).first()
    )
    assert updated_fd.calories == 500


# ---------------------------------------------------------------------------
# sync_all — deletes orphaned local workouts (lines 795-796, 805)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_sync_all_deletes_orphaned_workout(client, auth_headers, db):
    user = _get_user(db)
    _add_tokens(db, user.id, google=True)

    orphan = models.Workout(
        user_id=user.id,
        google_event_id="orphan-event-id",
        title="Orphan",
        start_time=datetime(2026, 6, 1, 10, 0),
        end_time=datetime(2026, 6, 1, 11, 0),
    )
    db.add(orphan)
    db.commit()

    mock_svc = MagicMock()
    mock_svc.events.return_value.list.return_value.execute.return_value = {
        "items": [],
        "nextSyncToken": "tok-orphan",
    }

    with (
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=mock_svc),
    ):
        resp = await client.get("/workouts/sync-all", headers=auth_headers)

    assert resp.status_code == 200
    assert "deleted" in resp.json()["message"]
    db.expire_all()
    assert (
        db.query(models.Workout)
        .filter(models.Workout.google_event_id == "orphan-event-id")
        .first()
    ) is None


# ---------------------------------------------------------------------------
# sync_all — skips event with no start/end (line 640)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_sync_all_skips_event_without_start_end(client, auth_headers, db):
    user = _get_user(db)
    _add_tokens(db, user.id, google=True)

    event = {
        "id": "evt-no-start",
        "summary": "No Start",
        "description": "[GymHub]\n",
        "status": "confirmed",
        "start": {},
        "end": {},
    }
    mock_svc = MagicMock()
    mock_svc.events.return_value.list.return_value.execute.return_value = {
        "items": [event],
        "nextSyncToken": "tok-nostart",
    }

    with (
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=mock_svc),
    ):
        resp = await client.get("/workouts/sync-all", headers=auth_headers)

    assert resp.status_code == 200
    db.expire_all()
    assert (
        db.query(models.Workout).filter(models.Workout.google_event_id == "evt-no-start").first()
    ) is None


# ---------------------------------------------------------------------------
# sync_cardio_to_calendar — insert exception (lines 911-913)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_sync_cardio_to_calendar_insert_fails(client, auth_headers, db):
    user = _get_user(db)
    _add_tokens(db, user.id, google=True)
    workout = models.Workout(
        user_id=user.id,
        title="Run Error",
        start_time=datetime(2026, 6, 6, 7, 0),
        end_time=datetime(2026, 6, 6, 8, 0),
    )
    db.add(workout)
    db.flush()
    fd = models.FitbitData(
        workout_id=workout.id, activity_name="Run", calories=300, duration_ms=3600000
    )
    db.add(fd)
    db.commit()

    mock_svc = MagicMock()
    mock_svc.events.return_value.insert.return_value.execute.side_effect = Exception("API down")

    with (
        patch("app.routers.workouts.get_google_credentials", return_value=MagicMock()),
        patch("app.routers.workouts.build", return_value=mock_svc),
    ):
        resp = await client.post(
            "/workouts/sync-cardio-to-calendar",
            json={"workout_ids": [workout.id]},
            headers=auth_headers,
        )
    assert resp.status_code == 200
    assert resp.json()["failed"] == 1
