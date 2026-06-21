"""Tests for the read tools migrated to the backend REST API.

Each tool must (1) hit the correct backend endpoint with the right params,
(2) adapt the response, (3) propagate the backend error envelope, and
(4) cope with empty data. The backend client is mocked, so these verify the
wiring and client-side logic without a running backend.
"""

from datetime import datetime, timedelta, timezone

import read_tools


def _recent(days_ago: int) -> str:
    return (datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days_ago)).strftime("%Y-%m-%d")


# --------------------------------------------------------------------------
# get_analytics_summary
# --------------------------------------------------------------------------

def test_summary_calls_endpoint_with_days(fake):
    fake.set("/analytics/summary", {"workout_count": 5, "total_volume_kg": 440.0})
    out = read_tools.get_analytics_summary({"days": 30}, "u", None)
    assert fake.calls == [("/analytics/summary", {"days": 30})]
    assert out["workout_count"] == 5
    assert out["period_days"] == 30


def test_summary_default_days(fake):
    fake.set("/analytics/summary", {})
    read_tools.get_analytics_summary({}, "u", None)
    assert fake.params_for("/analytics/summary") == {"days": 30}


def test_summary_propagates_error(fake):
    fake.set("/analytics/summary", {"error": "backend HTTP 500"})
    out = read_tools.get_analytics_summary({"days": 7}, "u", None)
    assert out == {"error": "backend HTTP 500"}


# --------------------------------------------------------------------------
# get_muscle_balance
# --------------------------------------------------------------------------

def test_muscle_balance_totals(fake):
    fake.set("/analytics/muscle-balance", [
        {"week": "2026-W10", "muscle": "pecho", "volume_kg": 100.0},
        {"week": "2026-W11", "muscle": "pecho", "volume_kg": 50.0},
        {"week": "2026-W10", "muscle": "espalda", "volume_kg": 30.0},
    ])
    out = read_tools.get_muscle_balance({"days": 90}, "u", None)
    assert fake.params_for("/analytics/muscle-balance") == {"days": 90}
    assert out["totals_by_muscle"] == {"pecho": 150.0, "espalda": 30.0}
    assert len(out["balance"]) == 3


def test_muscle_balance_empty(fake):
    fake.set("/analytics/muscle-balance", [])
    out = read_tools.get_muscle_balance({}, "u", None)
    assert out == {"balance": [], "totals_by_muscle": {}}


# --------------------------------------------------------------------------
# get_exercise_frequency
# --------------------------------------------------------------------------

def test_frequency_passthrough(fake):
    fake.set("/analytics/frequency", [{"exercise": "Press Banca", "muscle": "pecho", "sessions": 4}])
    out = read_tools.get_exercise_frequency({"days": 90}, "u", None)
    assert out["exercises"][0]["exercise"] == "Press Banca"


def test_frequency_muscle_filter(fake):
    fake.set("/analytics/frequency", [
        {"exercise": "Press Banca", "muscle": "pecho", "sessions": 4},
        {"exercise": "Remo", "muscle": "espalda", "sessions": 2},
    ])
    out = read_tools.get_exercise_frequency({"muscle_name": "espalda"}, "u", None)
    assert len(out["exercises"]) == 1
    assert out["exercises"][0]["exercise"] == "Remo"


def test_frequency_error(fake):
    fake.set("/analytics/frequency", {"error": "x"})
    assert read_tools.get_exercise_frequency({}, "u", None) == {"error": "x"}


# --------------------------------------------------------------------------
# get_exercise_prs
# --------------------------------------------------------------------------

def test_prs_all(fake):
    fake.set("/analytics/max-lifts", [
        {"exercise": "Press Banca", "value": 60},
        {"exercise": "Sentadilla", "value": 100},
    ])
    out = read_tools.get_exercise_prs({}, "u", None)
    assert fake.params_for("/analytics/max-lifts") == {"days": 3650}
    assert len(out["prs"]) == 2


def test_prs_name_filter(fake):
    fake.set("/analytics/max-lifts", [
        {"exercise": "Press Banca", "value": 60},
        {"exercise": "Sentadilla", "value": 100},
    ])
    out = read_tools.get_exercise_prs({"exercise_name": "banca"}, "u", None)
    assert len(out["prs"]) == 1
    assert out["prs"][0]["exercise"] == "Press Banca"


# --------------------------------------------------------------------------
# get_daily_health
# --------------------------------------------------------------------------

def test_daily_health_filters_and_averages(fake):
    fake.set("/fitbit-health/daily", [
        {"date": _recent(2), "steps": 10000, "calories_out": 2000},
        {"date": _recent(1), "steps": 8000, "calories_out": 2200},
        {"date": _recent(40), "steps": 5000, "calories_out": 1000},  # outside 14-day cutoff
    ])
    out = read_tools.get_daily_health({"days": 14}, "u", None)
    assert len(out["data"]) == 2
    assert out["avg_steps"] == 9000
    assert out["avg_calories"] == 2100


def test_daily_health_empty(fake):
    fake.set("/fitbit-health/daily", [])
    out = read_tools.get_daily_health({}, "u", None)
    assert out == {"data": [], "avg_steps": 0, "avg_calories": 0}


# --------------------------------------------------------------------------
# get_sleep_logs
# --------------------------------------------------------------------------

def test_sleep_logs_adaptation(fake):
    fake.set("/fitbit-health/sleep", [
        {"date": _recent(1), "duration_ms": 7_200_000, "efficiency": 90, "minutes_deep": 60,
         "minutes_rem": 50, "minutes_light": 100, "minutes_wake": 10},
    ])
    out = read_tools.get_sleep_logs({"days": 14}, "u", None)
    assert out["logs"][0]["duration_h"] == 2.0
    assert out["logs"][0]["minutes_awake"] == 10
    assert out["avg_duration_h"] == 2.0
    assert out["avg_efficiency"] == 90


def test_sleep_logs_empty(fake):
    fake.set("/fitbit-health/sleep", [])
    out = read_tools.get_sleep_logs({}, "u", None)
    assert out["logs"] == [] and out["avg_efficiency"] == 0


# --------------------------------------------------------------------------
# get_weight_logs
# --------------------------------------------------------------------------

def test_weight_logs_cutoff_and_latest(fake):
    fake.set("/weight", [
        {"date": _recent(100), "weight_kg": 90.0, "body_fat_pct": 22.0},  # outside 90-day cutoff
        {"date": _recent(10), "weight_kg": 88.0, "body_fat_pct": 21.0},
        {"date": _recent(2), "weight_kg": 87.5, "body_fat_pct": 20.5},
    ])
    out = read_tools.get_weight_logs({"days": 90}, "u", None)
    assert len(out["logs"]) == 2
    assert out["latest_weight_kg"] == 87.5
    assert out["latest_body_fat_pct"] == 20.5


def test_weight_logs_empty(fake):
    fake.set("/weight", [])
    out = read_tools.get_weight_logs({}, "u", None)
    assert out["latest_weight_kg"] is None


# --------------------------------------------------------------------------
# get_user_profile  (combines /auth/me + /weight)
# --------------------------------------------------------------------------

def test_user_profile_combines_sources(fake):
    fake.set("/auth/me", {"name": "Iván", "height_cm": 188})
    fake.set("/weight", [
        {"date": "2026-06-01", "weight_kg": 89.0, "body_fat_pct": 22.0},
        {"date": "2026-06-10", "weight_kg": 88.0, "body_fat_pct": 21.0},
    ])
    out = read_tools.get_user_profile({}, "u", None)
    assert out["name"] == "Iván"
    assert out["height_cm"] == 188
    assert out["weight_kg"] == 88.0
    assert out["weight_date"] == "2026-06-10"


def test_user_profile_no_weight(fake):
    fake.set("/auth/me", {"name": "Iván", "height_cm": 188})
    fake.set("/weight", [])
    out = read_tools.get_user_profile({}, "u", None)
    assert out["weight_kg"] is None


def test_user_profile_error(fake):
    fake.set("/auth/me", {"error": "backend HTTP 401"})
    out = read_tools.get_user_profile({}, "u", None)
    assert out == {"error": "backend HTTP 401"}
