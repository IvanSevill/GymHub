"""Tests for services/google_calendar.py — get_google_credentials and update_google_calendar_event."""
import uuid
from datetime import datetime
from unittest.mock import MagicMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app import models
from app.services.google_calendar import get_google_credentials, update_google_calendar_event


def _make_db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def _new_user(db):
    user = models.User(id=str(uuid.uuid4()), email=f"gcal{uuid.uuid4().hex[:6]}@test.com", name="GCal User")
    db.add(user)
    db.commit()
    return user


def _new_tokens(db, user_id, *, access="fake-access", refresh="fake-refresh", cal_id="cal-123"):
    tokens = models.UserTokens(
        user_id=user_id,
        google_access_token=access,
        google_refresh_token=refresh,
        selected_calendar_id=cal_id,
    )
    db.add(tokens)
    db.commit()
    return tokens


# ---------------------------------------------------------------------------
# get_google_credentials
# ---------------------------------------------------------------------------


def test_get_google_credentials_no_token():
    db = _make_db()
    user = _new_user(db)
    tokens = models.UserTokens(user_id=user.id)  # no google_access_token
    db.add(tokens)
    db.commit()

    result = get_google_credentials(tokens, db)
    assert result is None


def test_get_google_credentials_none_tokens():
    db = _make_db()
    result = get_google_credentials(None, db)
    assert result is None


def test_get_google_credentials_with_refresh_token():
    db = _make_db()
    user = _new_user(db)
    tokens = _new_tokens(db, user.id)

    mock_creds = MagicMock()
    mock_creds.token = "refreshed-token"

    with (
        patch("app.services.google_calendar.Credentials", return_value=mock_creds),
        patch("app.services.google_calendar.GoogleAuthRequest", return_value=MagicMock()),
    ):
        result = get_google_credentials(tokens, db)

    assert result is mock_creds
    mock_creds.refresh.assert_called_once()


def test_get_google_credentials_refresh_fails_falls_back():
    """When token refresh throws, the stored token is still returned as fallback."""
    db = _make_db()
    user = _new_user(db)
    tokens = _new_tokens(db, user.id)

    mock_creds = MagicMock()
    mock_creds.refresh.side_effect = Exception("token expired")

    with (
        patch("app.services.google_calendar.Credentials", return_value=mock_creds),
        patch("app.services.google_calendar.GoogleAuthRequest", return_value=MagicMock()),
    ):
        result = get_google_credentials(tokens, db)

    assert result is mock_creds  # fallback: still returns creds even after failed refresh


def test_get_google_credentials_no_refresh_no_token():
    db = _make_db()
    user = _new_user(db)
    tokens = models.UserTokens(user_id=user.id, google_access_token="tok")
    db.add(tokens)
    db.commit()

    mock_creds = MagicMock()
    mock_creds.refresh_token = None
    mock_creds.token = None  # no access token either

    with (
        patch("app.services.google_calendar.Credentials", return_value=mock_creds),
        patch("app.services.google_calendar.GoogleAuthRequest", return_value=MagicMock()),
    ):
        result = get_google_credentials(tokens, db)

    assert result is None


# ---------------------------------------------------------------------------
# update_google_calendar_event
# ---------------------------------------------------------------------------


def _make_workout(db, user_id, *, google_event_id=None):
    muscle = models.Muscle(name=f"m{uuid.uuid4().hex[:4]}")
    db.add(muscle)
    db.flush()
    exercise = models.Exercise(name=f"ex{uuid.uuid4().hex[:4]}", muscle_id=muscle.id)
    db.add(exercise)
    db.flush()
    workout = models.Workout(
        user_id=user_id,
        title="Pecho",
        start_time=datetime(2026, 5, 1, 10, 0),
        end_time=datetime(2026, 5, 1, 11, 0),
        google_event_id=google_event_id,
    )
    db.add(workout)
    db.flush()
    db.add(
        models.ExerciseSet(
            workout_id=workout.id,
            exercise_id=exercise.id,
            value="75",
            measurement="kg",
            is_completed=True,
        )
    )
    db.commit()
    db.refresh(workout)
    return workout


def test_update_google_calendar_event_insert_new():
    db = _make_db()
    user = _new_user(db)
    tokens = _new_tokens(db, user.id)
    workout = _make_workout(db, user.id)

    mock_creds = MagicMock()
    mock_svc = MagicMock()
    mock_svc.events().insert().execute.return_value = {"id": "new-event-id"}

    with (
        patch("app.services.google_calendar.get_google_credentials", return_value=mock_creds),
        patch("app.services.google_calendar.build", return_value=mock_svc),
    ):
        event_id = update_google_calendar_event(db, tokens, workout)

    assert event_id == "new-event-id"
    assert workout.google_event_id == "new-event-id"


def test_update_google_calendar_event_update_existing():
    db = _make_db()
    user = _new_user(db)
    tokens = _new_tokens(db, user.id)
    workout = _make_workout(db, user.id, google_event_id="existing-event")

    mock_creds = MagicMock()
    mock_svc = MagicMock()
    mock_svc.events().update().execute.return_value = {"id": "existing-event"}

    with (
        patch("app.services.google_calendar.get_google_credentials", return_value=mock_creds),
        patch("app.services.google_calendar.build", return_value=mock_svc),
    ):
        event_id = update_google_calendar_event(db, tokens, workout)

    assert event_id == "existing-event"


def test_update_google_calendar_event_no_credentials():
    db = _make_db()
    user = _new_user(db)
    tokens = _new_tokens(db, user.id)
    workout = _make_workout(db, user.id)

    with patch("app.services.google_calendar.get_google_credentials", return_value=None):
        event_id = update_google_calendar_event(db, tokens, workout)

    assert event_id is None


def test_update_google_calendar_event_api_error_returns_none():
    db = _make_db()
    user = _new_user(db)
    tokens = _new_tokens(db, user.id)
    workout = _make_workout(db, user.id)

    mock_creds = MagicMock()
    mock_svc = MagicMock()
    mock_svc.events().insert().execute.side_effect = Exception("API error")

    with (
        patch("app.services.google_calendar.get_google_credentials", return_value=mock_creds),
        patch("app.services.google_calendar.build", return_value=mock_svc),
    ):
        event_id = update_google_calendar_event(db, tokens, workout)

    assert event_id is None
