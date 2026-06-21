"""Tests for pure utility functions in fitbit_sync.py."""
from datetime import datetime

from app.routers.fitbit_sync import (
    _is_gym_activity,
    _resolve_activity_name,
    _should_skip_activity,
    _activity_matches_any_workout,
)
from app import models


def test_is_gym_activity_weights():
    assert _is_gym_activity({"activityName": "Weights"}) is True
    assert _is_gym_activity({"activityName": "weights session"}) is True


def test_is_gym_activity_non_gym():
    assert _is_gym_activity({"activityName": "Run"}) is False
    assert _is_gym_activity({"activityName": "Walk"}) is False
    assert _is_gym_activity({}) is False


def test_resolve_activity_name_run():
    assert _resolve_activity_name({"activityName": "Run"}) == "Run"
    assert _resolve_activity_name({"activityName": "running"}) == "Run"
    assert _resolve_activity_name({"activityName": "Outdoor Run"}) == "Run"


def test_resolve_activity_name_workout_with_gps():
    assert _resolve_activity_name({"activityName": "Workout", "hasGps": True}) == "Run"


def test_resolve_activity_name_workout_by_type_id():
    assert _resolve_activity_name({"activityName": "Workout", "activityTypeId": 90013}) == "Run"


def test_resolve_activity_name_generic():
    assert _resolve_activity_name({"activityName": "Swim"}) == "Swim"
    assert _resolve_activity_name({"activityName": "Yoga"}) == "Yoga"


def test_should_skip_walk():
    assert _should_skip_activity({"activityName": "Walk"}) is True


def test_should_skip_weights():
    assert _should_skip_activity({"activityName": "Weights"}) is True


def test_should_not_skip_run():
    assert _should_skip_activity({"activityName": "Run"}) is False


def test_should_not_skip_swim():
    assert _should_skip_activity({"activityName": "Swim"}) is False


def test_activity_matches_workout_gym_time_window():
    """Gym activity (Weights) within ±3h of workout start should match."""
    activity = {
        "activityName": "Weights",
        "startTime": "2026-05-01T10:00:00Z",
        "duration": 3600000,
    }
    workout = models.Workout(
        start_time=datetime(2026, 5, 1, 10, 30),
        end_time=datetime(2026, 5, 1, 11, 30),
        title="Pecho",
    )
    assert _activity_matches_any_workout(activity, [workout]) is True


def test_activity_matches_workout_outside_window():
    """Activity more than 3h from workout should not match."""
    activity = {
        "activityName": "Weights",
        "startTime": "2026-05-01T06:00:00Z",
        "duration": 3600000,
    }
    workout = models.Workout(
        start_time=datetime(2026, 5, 1, 10, 30),
        end_time=datetime(2026, 5, 1, 11, 30),
        title="Pecho",
    )
    assert _activity_matches_any_workout(activity, [workout]) is False


def test_activity_matches_no_workouts():
    activity = {"activityName": "Run", "startTime": "2026-05-01T10:00:00Z", "duration": 1800000}
    assert _activity_matches_any_workout(activity, []) is False


def test_activity_matches_invalid_start_time():
    activity = {"activityName": "Run", "startTime": "not-a-date", "duration": 0}
    assert _activity_matches_any_workout(activity, []) is False
