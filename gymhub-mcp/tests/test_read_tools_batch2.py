"""Tests for MCP read tools migrated in batch 2 (workout / exercise / advanced tools)."""

import read_tools
import write_tools


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _workout(id_="w-1", title="Pecho", start="2026-06-21T18:00:00", end="2026-06-21T19:00:00",
             sets=None, fitbit=None):
    return {
        "id": id_, "title": title, "start_time": start, "end_time": end,
        "exercise_sets": sets or [],
        "fitbit_data": fitbit,
    }


def _set(exercise_name="Press Banca", exercise_id="ex-1", value="80", measurement="kg"):
    return {
        "exercise_id": exercise_id,
        "value": value,
        "measurement": measurement,
        "is_completed": True,
        "exercise": {"id": exercise_id, "name": exercise_name, "muscle_id": "m1"},
    }


def _exercise(id_="ex-1", name="Press Banca", muscle_name="pecho"):
    return {"id": id_, "name": name, "muscle_id": "m1", "muscle": {"id": "m1", "name": muscle_name}}


# ---------------------------------------------------------------------------
# get_workouts
# ---------------------------------------------------------------------------

def test_get_workouts_groups_sets(fake):
    s1 = _set("Press Banca", "ex-1", "80", "kg")
    s2 = _set("Press Banca", "ex-1", "75", "kg")
    fake.set("/workouts", [_workout(sets=[s1, s2])])
    out = read_tools.get_workouts({"days": 30}, "u", None)
    assert out["total"] == 1
    assert out["workouts"][0]["exercises"]["Press Banca"] == ["80 kg", "75 kg"]


def test_get_workouts_duration_from_fitbit(fake):
    fitbit = {"duration_ms": 3_600_000, "calories": 500, "heart_rate_avg": 140}
    fake.set("/workouts", [_workout(fitbit=fitbit)])
    out = read_tools.get_workouts({}, "u", None)
    assert out["workouts"][0]["duration_min"] == 60.0
    assert out["workouts"][0]["fitbit"]["calories"] == 500


def test_get_workouts_duration_from_times(fake):
    w = _workout(start="2026-06-21T18:00:00", end="2026-06-21T19:30:00")
    fake.set("/workouts", [w])
    out = read_tools.get_workouts({}, "u", None)
    assert out["workouts"][0]["duration_min"] == 90.0


def test_get_workouts_respects_limit(fake):
    fake.set("/workouts", [_workout(id_=f"w-{i}") for i in range(10)])
    out = read_tools.get_workouts({"limit": 3}, "u", None)
    assert out["total"] == 3


def test_get_workouts_empty(fake):
    fake.set("/workouts", [])
    out = read_tools.get_workouts({}, "u", None)
    assert out == {"workouts": [], "total": 0}


def test_get_workouts_error(fake):
    fake.set("/workouts", {"error": "backend HTTP 500"})
    out = read_tools.get_workouts({}, "u", None)
    assert "error" in out


# ---------------------------------------------------------------------------
# get_workout_count_in_period
# ---------------------------------------------------------------------------

def test_workout_count_returns_count(fake):
    fake.set("/workouts", [_workout(), _workout(id_="w-2")])
    out = read_tools.get_workout_count_in_period(
        {"start_date": "2026-06-01", "end_date": "2026-06-30"}, "u", None
    )
    assert out["count"] == 2
    assert out["start_date"] == "2026-06-01"
    assert out["end_date"] == "2026-06-30"


def test_workout_count_zero(fake):
    fake.set("/workouts", [])
    out = read_tools.get_workout_count_in_period(
        {"start_date": "2026-06-01", "end_date": "2026-06-01"}, "u", None
    )
    assert out["count"] == 0


def test_workout_count_passes_dates(fake):
    fake.set("/workouts", [])
    read_tools.get_workout_count_in_period(
        {"start_date": "2026-06-10", "end_date": "2026-06-20"}, "u", None
    )
    call = next(c for c in fake.calls if c[1] == "/workouts")
    assert "start_date" in call[2]
    assert "end_date" in call[2]


# ---------------------------------------------------------------------------
# get_workouts_in_period
# ---------------------------------------------------------------------------

def test_workouts_in_period_adaptation(fake):
    s = _set("Remo", "ex-2", "60", "kg")
    fake.set("/workouts", [_workout(id_="w-1", sets=[s], start="2026-06-15T10:00:00", end="2026-06-15T11:00:00")])
    result = read_tools.get_workouts_in_period(
        {"start_date": "2026-06-01", "end_date": "2026-06-30"}, "u", None
    )
    assert len(result) == 1
    assert result[0]["date"] == "2026-06-15"
    assert result[0]["exercises"]["Remo"] == ["60 kg"]
    assert result[0]["duration_min"] == 60.0


def test_workouts_in_period_empty(fake):
    fake.set("/workouts", [])
    result = read_tools.get_workouts_in_period(
        {"start_date": "2026-06-01", "end_date": "2026-06-30"}, "u", None
    )
    assert result == []


# ---------------------------------------------------------------------------
# get_exercise_history
# ---------------------------------------------------------------------------

def test_exercise_history_two_step(fake):
    fake.set("/exercises", [_exercise("ex-1", "Press Banca")])
    fake.set("/analytics/exercise-history/ex-1", [
        {"date": "2026-06-20T18:00:00", "value": "80", "measurement": "kg"},
        {"date": "2026-06-21T18:00:00", "value": "85", "measurement": "kg"},
    ])
    out = read_tools.get_exercise_history({"exercise_name": "banca", "days": 90}, "u", None)
    assert out["exercise"] == "Press Banca"
    assert len(out["history"]) == 2


def test_exercise_history_not_found(fake):
    fake.set("/exercises", [])
    out = read_tools.get_exercise_history({"exercise_name": "unknown"}, "u", None)
    assert "error" in out and "not found" in out["error"].lower()


def test_exercise_history_groups_by_date(fake):
    fake.set("/exercises", [_exercise("ex-1", "Curl Biceps")])
    fake.set("/analytics/exercise-history/ex-1", [
        {"date": "2026-06-20T18:00:00", "value": "30", "measurement": "kg"},
        {"date": "2026-06-20T18:05:00", "value": "25", "measurement": "kg"},
    ])
    out = read_tools.get_exercise_history({"exercise_name": "curl", "days": 90}, "u", None)
    assert len(out["history"]) == 1
    assert len(out["history"][0]["sets"]) == 2


# ---------------------------------------------------------------------------
# get_weight_progress
# ---------------------------------------------------------------------------

def test_weight_progress_two_step(fake):
    fake.set("/exercises", [_exercise("ex-1", "Press Banca")])
    fake.set("/analytics/weight-progress", [
        {"date": "2026-06-01", "value": 75.0},
        {"date": "2026-06-15", "value": 80.0},
    ])
    out = read_tools.get_weight_progress({"exercise_name": "banca", "days": 60}, "u", None)
    assert out["exercise"] == "Press Banca"
    assert out["unit"] == "kg"
    assert len(out["data"]) == 2
    assert out["data"][0]["max_value"] == 75.0


def test_weight_progress_not_found(fake):
    fake.set("/exercises", [])
    out = read_tools.get_weight_progress({"exercise_name": "x"}, "u", None)
    assert "error" in out


def test_weight_progress_passes_exercise_id(fake):
    fake.set("/exercises", [_exercise("ex-99", "Sentadilla")])
    fake.set("/analytics/weight-progress", [])
    read_tools.get_weight_progress({"exercise_name": "sentadilla", "days": 30}, "u", None)
    wp_calls = [c for c in fake.calls if c[1] == "/analytics/weight-progress"]
    assert wp_calls[0][2]["exercise_id"] == "ex-99"
    assert wp_calls[0][2]["days"] == 30


# ---------------------------------------------------------------------------
# analyze_performance_correlation
# ---------------------------------------------------------------------------

def test_correlation_sleep_steps(fake):
    fake.set("/fitbit/sleep", [
        {"date": "2026-06-19", "duration_ms": 7_200_000, "efficiency": 88},
        {"date": "2026-06-20", "duration_ms": 6_000_000, "efficiency": 82},
        {"date": "2026-06-21", "duration_ms": 8_000_000, "efficiency": 90},
    ])
    fake.set("/fitbit/daily", [
        {"date": "2026-06-19", "steps": 8000, "resting_heart_rate": 55},
        {"date": "2026-06-20", "steps": 6000, "resting_heart_rate": 58},
        {"date": "2026-06-21", "steps": 10000, "resting_heart_rate": 54},
    ])
    out = read_tools.analyze_performance_correlation(
        {"metric1": "sleep_efficiency", "metric2": "steps", "days": 30}, "u", None
    )
    assert out["metric1"] == "sleep_efficiency"
    assert out["correlation_r"] is not None
    assert "sample_size" in out


def test_correlation_insufficient_data(fake):
    fake.set("/fitbit/sleep", [])
    fake.set("/fitbit/daily", [])
    out = read_tools.analyze_performance_correlation(
        {"metric1": "sleep_duration", "metric2": "resting_hr", "days": 7}, "u", None
    )
    assert out["correlation_r"] is None
    assert out["sample_size"] == 0


def test_correlation_weight_metric(fake):
    fake.set("/weight", [
        {"date": "2026-06-19", "weight_kg": 90.0},
        {"date": "2026-06-20", "weight_kg": 89.5},
        {"date": "2026-06-21", "weight_kg": 89.0},
    ])
    fake.set("/fitbit/sleep", [
        {"date": "2026-06-19", "duration_ms": 7_200_000, "efficiency": 88},
        {"date": "2026-06-20", "duration_ms": 7_000_000, "efficiency": 85},
        {"date": "2026-06-21", "duration_ms": 7_500_000, "efficiency": 90},
    ])
    out = read_tools.analyze_performance_correlation(
        {"metric1": "weight", "metric2": "sleep_duration", "days": 30}, "u", None
    )
    assert out["sample_size"] == 3


# ---------------------------------------------------------------------------
# predict_performance_trend
# ---------------------------------------------------------------------------

def test_predict_trend_improving(fake):
    fake.set("/exercises", [_exercise("ex-1", "Press Banca")])
    fake.set("/analytics/weight-progress", [
        {"date": "2026-06-01", "value": 70.0},
        {"date": "2026-06-08", "value": 72.5},
        {"date": "2026-06-15", "value": 75.0},
    ])
    out = read_tools.predict_performance_trend({"exercise_name": "banca", "days": 30}, "u", None)
    assert out["exercise"] == "Press Banca"
    assert out["trend"] == "mejorando"
    assert out["slope_per_week"] > 0


def test_predict_trend_insufficient_data(fake):
    fake.set("/exercises", [_exercise("ex-1", "Press Banca")])
    fake.set("/analytics/weight-progress", [{"date": "2026-06-01", "value": 80.0}])
    out = read_tools.predict_performance_trend({"exercise_name": "banca"}, "u", None)
    assert out["trend"] == "insufficient_data"


def test_predict_trend_not_found(fake):
    fake.set("/exercises", [])
    out = read_tools.predict_performance_trend({"exercise_name": "x"}, "u", None)
    assert "error" in out


# ---------------------------------------------------------------------------
# suggest_recovery_protocol
# ---------------------------------------------------------------------------

def test_suggest_recovery_aggregates(fake):
    s = _set(value="100", measurement="kg")
    fake.set("/workouts", [_workout(sets=[s, s], fitbit={"duration_ms": 3_600_000, "calories": 400})])
    fake.set("/fitbit/sleep", [
        {"date": "2026-06-21", "duration_ms": 6_000_000, "efficiency": 75}
    ])
    fake.set("/fitbit/daily", [
        {"date": "2026-06-21", "resting_heart_rate": 60}
    ])
    out = read_tools.suggest_recovery_protocol({}, "u", None)
    assert out["workout_count"] == 1
    assert out["total_load_kg"] == 200.0
    assert out["avg_sleep_efficiency"] == 75
    assert out["sleep_deficit"] is True
    assert out["avg_resting_hr"] == 60


def test_suggest_recovery_no_data(fake):
    fake.set("/workouts", [])
    fake.set("/fitbit/sleep", [])
    fake.set("/fitbit/daily", [])
    out = read_tools.suggest_recovery_protocol({}, "u", None)
    assert out["workout_count"] == 0
    assert out["avg_sleep_efficiency"] is None


# ---------------------------------------------------------------------------
# generate_workout_plan
# ---------------------------------------------------------------------------

def test_generate_plan_groups_by_muscle(fake):
    fake.set("/exercises", [
        _exercise("ex-1", "Press Banca", "pecho"),
        _exercise("ex-2", "Aperturas", "pecho"),
        _exercise("ex-3", "Remo", "espalda"),
    ])
    fake.set("/analytics/max-lifts", [
        {"exercise_name": "Press Banca", "muscle_name": "pecho", "max_value": 80.0, "measurement": "kg"},
    ])
    fake.set("/analytics/muscle-balance", [
        {"muscle": "pecho", "volume_kg": 200.0, "week": "2026-W25"},
    ])
    out = read_tools.generate_workout_plan(
        {"focus_muscle_groups": ["pecho"], "goal": "fuerza", "intensity_level": "high"}, "u", None
    )
    assert "Press Banca" in out["exercises_by_muscle"]["pecho"]
    assert "Aperturas" in out["exercises_by_muscle"]["pecho"]
    assert "Remo" not in out["exercises_by_muscle"]["pecho"]
    assert len(out["personal_records"]) == 1
    assert out["muscle_balance"]["pecho"] == 200.0


def test_generate_plan_empty(fake):
    fake.set("/exercises", [])
    fake.set("/analytics/max-lifts", [])
    fake.set("/analytics/muscle-balance", [])
    out = read_tools.generate_workout_plan(
        {"focus_muscle_groups": ["pecho"], "goal": "", "intensity_level": "moderate"}, "u", None
    )
    assert out["exercises_by_muscle"] == {"pecho": []}
    assert out["personal_records"] == []


# ---------------------------------------------------------------------------
# get_overtraining_risk_assessment
# ---------------------------------------------------------------------------

def test_overtraining_risk_low(fake):
    s = _set(value="50", measurement="kg")
    fake.set_queue("/workouts", [
        [_workout(sets=[s])],   # recent half
        [_workout(sets=[s])],   # previous half
    ])
    fake.set("/fitbit/daily", [
        {"date": "2026-06-18", "resting_heart_rate": 58},
        {"date": "2026-06-19", "resting_heart_rate": 57},
        {"date": "2026-06-20", "resting_heart_rate": 58},
        {"date": "2026-06-21", "resting_heart_rate": 57},
    ])
    fake.set("/fitbit/sleep", [
        {"date": "2026-06-20", "efficiency": 85},
        {"date": "2026-06-21", "efficiency": 87},
    ])
    out = read_tools.get_overtraining_risk_assessment({"days": 14}, "u", None)
    assert out["risk_level"] == "bajo"
    assert out["data_summary"]["recent_workout_count"] == 1


def test_overtraining_risk_volume_spike(fake):
    light = [_set(value="50", measurement="kg")]
    heavy = [_set(value="200", measurement="kg")] * 5
    fake.set_queue("/workouts", [
        [_workout(sets=heavy)],   # recent: 200 * 5 = 1000 kg
        [_workout(sets=light)],   # previous: 50 kg
    ])
    fake.set("/fitbit/daily", [])
    fake.set("/fitbit/sleep", [])
    out = read_tools.get_overtraining_risk_assessment({"days": 14}, "u", None)
    assert out["risk_level"] in ("moderado", "alto")
    assert any("volumen" in f.lower() for f in out["risk_factors"])


# ---------------------------------------------------------------------------
# write_tools: create_workout
# ---------------------------------------------------------------------------

def test_create_workout_resolves_exercise(fake):
    fake.set("/exercises", [_exercise("ex-1", "Press Banca", "pecho")])
    fake.set("/workouts", {"id": "w-new", "title": "Pecho", "exercise_sets": []})
    out = write_tools.create_workout({
        "title": "Pecho",
        "start_time": "2026-06-21T18:00:00",
        "end_time": "2026-06-21T19:00:00",
        "exercises": [{"exercise_name": "banca", "sets": [{"value": "80", "measurement": "kg"}]}],
    }, "token")
    assert out["success"] is True
    assert out["sets_created"] == 1


def test_create_workout_exercise_not_found(fake):
    fake.set("/exercises", [])
    out = write_tools.create_workout({
        "title": "T", "start_time": "2026-06-21T18:00:00", "end_time": "2026-06-21T19:00:00",
        "exercises": [{"exercise_name": "unknown", "sets": [{"value": "50"}]}],
    }, "token")
    assert "error" in out


# ---------------------------------------------------------------------------
# write_tools: add_set_to_workout
# ---------------------------------------------------------------------------

def test_add_set_appends_correctly(fake):
    existing_set = {"exercise_id": "ex-1", "value": "75", "measurement": "kg", "is_completed": True}
    # Queue: first pop = GET response (workout with existing set), second pop = PUT response
    fake.set_queue("/workouts/w-1", [
        {
            "id": "w-1", "title": "Pecho",
            "start_time": "2026-06-21T18:00:00", "end_time": "2026-06-21T19:00:00",
            "exercise_sets": [existing_set],
        },
        {"id": "w-1", "title": "Pecho", "exercise_sets": []},
    ])
    fake.set("/exercises", [_exercise("ex-2", "Aperturas", "pecho")])
    out = write_tools.add_set_to_workout({
        "workout_id": "w-1", "exercise_name": "Aperturas", "value": "20", "measurement": "kg",
    }, "token")
    assert out["success"] is True
    put_calls = [c for c in fake.calls if c[0] == "PUT" and "w-1" in c[1]]
    assert len(put_calls) == 1
    assert len(put_calls[0][2]["exercise_sets"]) == 2


def test_add_set_workout_not_found(fake):
    fake.set("/workouts/w-x", {"error": "backend HTTP 404"})
    out = write_tools.add_set_to_workout({"workout_id": "w-x", "exercise_name": "x", "value": "50"}, "token")
    assert "error" in out


# ---------------------------------------------------------------------------
# write_tools: log_weight / delete_weight_log
# ---------------------------------------------------------------------------

def test_log_weight_posts_payload(fake):
    fake.set("/weight", {"id": "wl-1", "date": "2026-06-21", "weight_kg": 88.0})
    out = write_tools.log_weight({"date": "2026-06-21", "weight_kg": 88.0}, "token")
    assert out["ok"] is True
    assert out["weight_kg"] == 88.0


def test_delete_weight_log_success(fake):
    fake.set("/weight", [{"id": "wl-5", "date": "2026-06-10", "weight_kg": 90.0}])
    fake.set("/weight/wl-5", {})
    out = write_tools.delete_weight_log({"date": "2026-06-10"}, "token")
    assert out["ok"] is True
    delete_calls = [c for c in fake.calls if c[0] == "DELETE"]
    assert any("wl-5" in c[1] for c in delete_calls)


def test_delete_weight_log_not_found(fake):
    fake.set("/weight", [])
    out = write_tools.delete_weight_log({"date": "2026-06-10"}, "token")
    assert out["ok"] is False
