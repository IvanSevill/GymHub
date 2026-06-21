"""Read tools — fetch the user's data through the GymHub backend REST API.

Tools no longer touch the database directly; they call the backend via
``backend_client`` (authenticated with the user's JWT from the environment).
The ``user_id``/``db`` parameters are kept in the signatures for backward
compatibility with the server wrappers but are ignored by migrated tools.
"""

import re
import statistics
from datetime import datetime, timedelta, timezone

from sqlalchemy import desc, func
from sqlalchemy.orm import Session

import backend_client
import models


def _days_cutoff_str(days: int) -> str:
    """YYYY-MM-DD cutoff `days` days ago (UTC, naive)."""
    return (datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)).strftime("%Y-%m-%d")


# ---------------------------------------------------------------------------
# Helpers copied verbatim from backend/app/routers/analytics.py
# ---------------------------------------------------------------------------


def _parse_exercise_value(value_str: str) -> float:
    """Return the single numeric weight stored in an ExerciseSet value.

    Each set stores one weight, so the only normalization required is the
    Spanish decimal comma. Non-numeric values (e.g. 'bodyweight') yield 0.0.
    """
    m = re.match(r"\s*(\d+\.?\d*)", value_str.replace(",", "."))
    return float(m.group(1)) if m else 0.0


def _compute_workout_count(
    db: Session, user_id: str, period_start: datetime, period_end: datetime
) -> int:
    return (
        db.query(func.count(models.Workout.id))
        .filter(
            models.Workout.user_id == user_id,
            models.Workout.start_time >= period_start,
            models.Workout.start_time < period_end,
        )
        .scalar()
        or 0
    )


def _compute_volume(
    db: Session, user_id: str, period_start: datetime, period_end: datetime
) -> float:
    sets = (
        db.query(models.ExerciseSet.value)
        .join(models.Workout, models.ExerciseSet.workout_id == models.Workout.id)
        .filter(
            models.Workout.user_id == user_id,
            models.Workout.start_time >= period_start,
            models.Workout.start_time < period_end,
            models.ExerciseSet.value != "",
        )
        .all()
    )
    return sum(_parse_exercise_value(s.value) for s in sets)


def _compute_avg_duration(
    db: Session, user_id: str, period_start: datetime, period_end: datetime
) -> float | None:
    rows = (
        db.query(
            models.Workout.start_time,
            models.Workout.end_time,
            models.FitbitData.duration_ms,
        )
        .outerjoin(models.FitbitData, models.FitbitData.workout_id == models.Workout.id)
        .filter(
            models.Workout.user_id == user_id,
            models.Workout.start_time >= period_start,
            models.Workout.start_time < period_end,
        )
        .all()
    )
    durations = []
    for start_time, end_time, fitbit_ms in rows:
        if fitbit_ms and fitbit_ms > 0:
            durations.append(fitbit_ms / 60000)
        elif end_time and end_time > start_time:
            durations.append((end_time - start_time).total_seconds() / 60)
    return round(sum(durations) / len(durations), 1) if durations else None


def _compute_prs(
    db: Session, user_id: str, period_start: datetime, period_end: datetime
) -> int:
    period_sets = (
        db.query(models.ExerciseSet.exercise_id, models.ExerciseSet.value)
        .join(models.Workout, models.ExerciseSet.workout_id == models.Workout.id)
        .filter(
            models.Workout.user_id == user_id,
            models.Workout.start_time >= period_start,
            models.Workout.start_time < period_end,
            models.ExerciseSet.value != "",
        )
        .all()
    )
    pre_sets = (
        db.query(models.ExerciseSet.exercise_id, models.ExerciseSet.value)
        .join(models.Workout, models.ExerciseSet.workout_id == models.Workout.id)
        .filter(
            models.Workout.user_id == user_id,
            models.Workout.start_time < period_start,
            models.ExerciseSet.value != "",
        )
        .all()
    )
    pre_max: dict = {}
    for ex_id, val in pre_sets:
        v = _parse_exercise_value(val)
        if v > 0:
            pre_max[ex_id] = max(pre_max.get(ex_id, 0.0), v)
    period_max: dict = {}
    for ex_id, val in period_sets:
        v = _parse_exercise_value(val)
        if v > 0:
            period_max[ex_id] = max(period_max.get(ex_id, 0.0), v)
    return sum(1 for ex_id, mv in period_max.items() if mv > pre_max.get(ex_id, 0.0))


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------


def get_workouts(args: dict, user_id: str, db: Session) -> dict:
    """Return recent workouts with exercise sets and Fitbit data."""
    days: int = int(args.get("days", 30))
    limit: int = int(args.get("limit", 20))
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)

    workouts = (
        db.query(models.Workout)
        .filter(
            models.Workout.user_id == user_id,
            models.Workout.start_time >= cutoff,
        )
        .order_by(desc(models.Workout.start_time))
        .limit(limit)
        .all()
    )

    result = []
    for w in workouts:
        # Calculate duration
        fitbit = w.fitbit_data
        if fitbit and fitbit.duration_ms and fitbit.duration_ms > 0:
            duration_min = round(fitbit.duration_ms / 60000, 1)
        elif w.end_time and w.end_time > w.start_time:
            duration_min = round((w.end_time - w.start_time).total_seconds() / 60, 1)
        else:
            duration_min = None

        # Group sets by exercise name
        exercises: dict = {}
        for s in w.exercise_sets:
            ex_name = s.exercise.name if s.exercise else "Unknown"
            label = f"{s.value} {s.measurement}".strip()
            exercises.setdefault(ex_name, []).append(label)

        fitbit_dict = None
        if fitbit:
            fitbit_dict = {
                "calories": fitbit.calories,
                "heart_rate_avg": fitbit.heart_rate_avg,
                "distance_km": fitbit.distance_km,
                "azm_fat_burn": fitbit.azm_fat_burn,
                "azm_cardio": fitbit.azm_cardio,
                "azm_peak": fitbit.azm_peak,
            }

        result.append(
            {
                "id": w.id,
                "title": w.title,
                "date": w.start_time.strftime("%Y-%m-%d %H:%M"),
                "duration_min": duration_min,
                "exercises": exercises,
                "fitbit": fitbit_dict,
            }
        )

    return {"workouts": result, "total": len(result)}


def get_exercise_prs(args: dict, user_id: str, db: Session) -> dict:
    """All-time personal records per exercise (optionally a single exercise)."""
    exercise_name = args.get("exercise_name")
    data = backend_client.get("/analytics/max-lifts", {"days": 3650})
    if backend_client.is_error(data):
        return data
    items = data if isinstance(data, list) else []
    if exercise_name:
        n = exercise_name.lower()
        items = [p for p in items if n in str(p).lower()]
    return {"prs": items}


def get_analytics_summary(args: dict, user_id: str, db: Session) -> dict:
    """Return KPI summary (current vs previous period) from the backend."""
    days = int(args.get("days", 30))
    data = backend_client.get("/analytics/summary", {"days": days})
    if backend_client.is_error(data):
        return data
    data["period_days"] = days
    return data


def get_exercise_frequency(args: dict, user_id: str, db: Session) -> dict:
    """Most-trained exercises in the period (optionally filtered by muscle)."""
    days = int(args.get("days", 90))
    muscle_name = args.get("muscle_name")
    data = backend_client.get("/analytics/frequency", {"days": days})
    if backend_client.is_error(data):
        return data
    items = data if isinstance(data, list) else []
    if muscle_name:
        m = muscle_name.lower()
        items = [e for e in items if m in str(e).lower()]
    return {"exercises": items}


def get_exercise_history(args: dict, user_id: str, db: Session) -> dict:
    """Return all sets for a specific exercise grouped by session date."""
    exercise_name: str = args.get("exercise_name", "")
    days: int = int(args.get("days", 90))
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)

    exercise = (
        db.query(models.Exercise)
        .filter(models.Exercise.name.ilike(f"%{exercise_name}%"))
        .first()
    )
    if not exercise:
        return {"error": f"Exercise not found: {exercise_name}"}

    rows = (
        db.query(
            models.Workout.start_time,
            models.ExerciseSet.value,
            models.ExerciseSet.measurement,
        )
        .join(models.ExerciseSet, models.Workout.id == models.ExerciseSet.workout_id)
        .filter(models.Workout.user_id == user_id)
        .filter(models.ExerciseSet.exercise_id == exercise.id)
        .filter(models.Workout.start_time >= cutoff)
        .order_by(desc(models.Workout.start_time))
        .all()
    )

    by_date: dict = {}
    for start_time, value, measurement in rows:
        date_key = start_time.strftime("%Y-%m-%d")
        by_date.setdefault(date_key, []).append({"value": value, "measurement": measurement})

    history = [
        {"date": date, "sets": sets_list} for date, sets_list in sorted(by_date.items(), reverse=True)
    ]
    return {"exercise": exercise.name, "history": history}


def get_weight_progress(args: dict, user_id: str, db: Session) -> dict:
    """Return daily maximum value for a specific exercise over time."""
    exercise_name: str = args.get("exercise_name", "")
    days: int = int(args.get("days", 60))
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    cutoff = now - timedelta(days=days)

    exercise = (
        db.query(models.Exercise)
        .filter(models.Exercise.name.ilike(f"%{exercise_name}%"))
        .first()
    )
    if not exercise:
        return {"error": f"Exercise not found: {exercise_name}"}

    rows = (
        db.query(
            models.Workout.start_time,
            models.ExerciseSet.value,
            models.ExerciseSet.measurement,
        )
        .join(models.ExerciseSet, models.Workout.id == models.ExerciseSet.workout_id)
        .filter(models.Workout.user_id == user_id)
        .filter(models.ExerciseSet.exercise_id == exercise.id)
        .filter(models.Workout.start_time >= cutoff)
        .filter(models.Workout.start_time <= now)
        .filter(models.ExerciseSet.value != "")
        .filter(models.ExerciseSet.value != "0")
        .order_by(models.Workout.start_time)
        .all()
    )

    daily_data: dict = {}
    unit: str = ""
    for start_time, value_str, measurement in rows:
        max_val = _parse_exercise_value(value_str)
        if max_val == 0.0:
            continue
        date_key = start_time.strftime("%Y-%m-%d")
        if date_key not in daily_data or max_val > daily_data[date_key]:
            daily_data[date_key] = max_val
            unit = measurement

    data = [
        {"date": date, "max_value": val} for date, val in sorted(daily_data.items())
    ]
    return {"exercise": exercise.name, "unit": unit, "data": data}


def get_daily_health(args: dict, user_id: str, db: Session) -> dict:
    """Return Fitbit daily health data (steps, calories, active minutes, etc.)."""
    days = int(args.get("days", 14))
    cutoff = _days_cutoff_str(days)
    data = backend_client.get("/fitbit-health/daily", {"days": days})
    if backend_client.is_error(data):
        return data
    rows = [d for d in data if str(d.get("date", "")) >= cutoff] if isinstance(data, list) else []
    avg_steps = round(sum(d.get("steps") or 0 for d in rows) / len(rows)) if rows else 0
    avg_calories = round(sum(d.get("calories_out") or 0 for d in rows) / len(rows)) if rows else 0
    return {"data": rows, "avg_steps": avg_steps, "avg_calories": avg_calories}


def get_sleep_logs(args: dict, user_id: str, db: Session) -> dict:
    """Return Fitbit sleep logs with duration, efficiency, and stage breakdown."""
    days = int(args.get("days", 14))
    cutoff = _days_cutoff_str(days)
    data = backend_client.get("/fitbit-health/sleep", {"days": days})
    if backend_client.is_error(data):
        return data
    rows = [s for s in data if str(s.get("date", "")) >= cutoff] if isinstance(data, list) else []
    logs = [
        {
            "date": r.get("date"),
            "duration_h": round((r.get("duration_ms") or 0) / 3_600_000, 2),
            "efficiency": r.get("efficiency"),
            "minutes_deep": r.get("minutes_deep"),
            "minutes_rem": r.get("minutes_rem"),
            "minutes_light": r.get("minutes_light"),
            "minutes_awake": r.get("minutes_wake", r.get("minutes_awake")),
        }
        for r in rows
    ]
    avg_duration_h = round(sum(x["duration_h"] for x in logs) / len(logs), 2) if logs else 0.0
    avg_efficiency = round(sum((x["efficiency"] or 0) for x in logs) / len(logs)) if logs else 0
    return {"logs": logs, "avg_duration_h": avg_duration_h, "avg_efficiency": avg_efficiency}


def get_muscle_balance(args: dict, user_id: str, db: Session) -> dict:
    """Return training volume per muscle group per ISO week (from the backend)."""
    days = int(args.get("days", 90))
    data = backend_client.get("/analytics/muscle-balance", {"days": days})
    if backend_client.is_error(data):
        return data
    balance = data if isinstance(data, list) else []
    totals_by_muscle: dict = {}
    for entry in balance:
        m = entry.get("muscle")
        vol = entry.get("volume_kg") or entry.get("volume") or 0
        totals_by_muscle[m] = round(totals_by_muscle.get(m, 0.0) + vol, 1)
    return {"balance": balance, "totals_by_muscle": totals_by_muscle}


def get_workout_count_in_period(args: dict, user_id: str, db: Session) -> dict:
    """Count workouts between two dates (inclusive). Dates as YYYY-MM-DD."""
    start_date: str = args["start_date"]
    end_date: str = args["end_date"]
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
    count = (
        db.query(func.count(models.Workout.id))
        .filter(
            models.Workout.user_id == user_id,
            models.Workout.start_time >= start,
            models.Workout.start_time < end,
        )
        .scalar()
        or 0
    )
    return {"count": count, "start_date": start_date, "end_date": end_date}


def get_workouts_in_period(args: dict, user_id: str, db: Session) -> list:
    """Return workouts with full exercise detail between two dates (inclusive)."""
    start_date: str = args["start_date"]
    end_date: str = args["end_date"]
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)

    workouts = (
        db.query(models.Workout)
        .filter(
            models.Workout.user_id == user_id,
            models.Workout.start_time >= start,
            models.Workout.start_time < end,
        )
        .order_by(models.Workout.start_time)
        .all()
    )

    result = []
    for w in workouts:
        duration_min: int | None = None
        if w.fitbit_data and w.fitbit_data.duration_ms:
            duration_min = round(w.fitbit_data.duration_ms / 60_000)
        elif w.start_time and w.end_time:
            duration_min = round((w.end_time - w.start_time).total_seconds() / 60)

        exercises: dict = {}
        for s in w.exercise_sets:
            name = s.exercise.name if s.exercise else "Unknown"
            exercises.setdefault(name, []).append(f"{s.value} {s.measurement}".strip())

        result.append({
            "id": w.id,
            "title": w.title,
            "date": w.start_time.strftime("%Y-%m-%d"),
            "start_time": w.start_time.isoformat(),
            "end_time": w.end_time.isoformat(),
            "duration_min": duration_min,
            "exercises": exercises,
        })

    return result


def get_user_profile(args: dict, user_id: str, db: Session) -> dict:
    """Return the user's profile plus their latest weight/body fat."""
    profile = backend_client.get("/auth/me")
    if backend_client.is_error(profile):
        return profile
    logs = backend_client.get("/weight")
    latest = logs[-1] if isinstance(logs, list) and logs else None
    return {
        "name": profile.get("name"),
        "height_cm": profile.get("height_cm"),
        "weight_kg": latest.get("weight_kg") if latest else None,
        "body_fat_pct": latest.get("body_fat_pct") if latest else None,
        "weight_date": latest.get("date") if latest else None,
    }


def get_weight_logs(args: dict, user_id: str, db: Session) -> dict:
    """Return the user's weight and body fat history (from the backend)."""
    days = int(args.get("days", 90))
    cutoff = _days_cutoff_str(days)
    data = backend_client.get("/weight")
    if backend_client.is_error(data):
        return data
    rows = sorted(
        (r for r in data if str(r.get("date", "")) >= cutoff),
        key=lambda r: r.get("date", ""),
    ) if isinstance(data, list) else []
    logs = [
        {"date": r.get("date"), "weight_kg": r.get("weight_kg"), "body_fat_pct": r.get("body_fat_pct")}
        for r in rows
    ]
    return {
        "logs": logs,
        "latest_weight_kg": logs[-1]["weight_kg"] if logs else None,
        "latest_body_fat_pct": logs[-1]["body_fat_pct"] if logs else None,
    }


# ---------------------------------------------------------------------------
# 6 new read tools for GymChat
# ---------------------------------------------------------------------------


def analyze_performance_correlation(args: dict, user_id: str, db: Session) -> dict:
    """Pearson correlation between two health/performance metrics."""
    metric1: str = args.get("metric1", "")
    metric2: str = args.get("metric2", "")
    days: int = int(args.get("days", 60))

    cutoff = (datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)).strftime("%Y-%m-%d")

    def _get_series(metric: str) -> dict[str, float]:
        series: dict[str, float] = {}
        if metric in ("sleep_duration", "sleep_efficiency"):
            col = models.SleepLog.duration_ms if metric == "sleep_duration" else models.SleepLog.efficiency
            rows = (
                db.query(models.SleepLog.date, col)
                .filter(models.SleepLog.user_id == user_id, models.SleepLog.is_main_sleep.is_(True), models.SleepLog.date >= cutoff)
                .all()
            )
            for date, val in rows:
                if val is not None:
                    v = val / 3_600_000 if metric == "sleep_duration" else float(val)
                    series[date] = v
        elif metric == "resting_hr":
            rows = (
                db.query(models.DailyHealth.date, models.DailyHealth.resting_heart_rate)
                .filter(models.DailyHealth.user_id == user_id, models.DailyHealth.date >= cutoff)
                .all()
            )
            for date, val in rows:
                if val and val > 0:
                    series[date] = float(val)
        elif metric == "steps":
            rows = (
                db.query(models.DailyHealth.date, models.DailyHealth.steps)
                .filter(models.DailyHealth.user_id == user_id, models.DailyHealth.date >= cutoff)
                .all()
            )
            for date, val in rows:
                if val and val > 0:
                    series[date] = float(val)
        elif metric == "workout_volume":
            rows = (
                db.query(models.Workout.start_time, models.ExerciseSet.value)
                .join(models.ExerciseSet, models.Workout.id == models.ExerciseSet.workout_id)
                .filter(models.Workout.user_id == user_id, models.Workout.start_time >= datetime.strptime(cutoff, "%Y-%m-%d"))
                .filter(models.ExerciseSet.value != "")
                .all()
            )
            daily_vol: dict[str, float] = {}
            for start_time, value_str in rows:
                date_key = start_time.strftime("%Y-%m-%d")
                daily_vol[date_key] = daily_vol.get(date_key, 0.0) + _parse_exercise_value(value_str)
            series.update(daily_vol)
        elif metric == "weight":
            rows = (
                db.query(models.WeightLog.date, models.WeightLog.weight_kg)
                .filter(models.WeightLog.user_id == user_id, models.WeightLog.date >= cutoff)
                .all()
            )
            for date, val in rows:
                if val:
                    series[date] = float(val)
        return series

    s1 = _get_series(metric1)
    s2 = _get_series(metric2)

    common_dates = sorted(set(s1.keys()) & set(s2.keys()))
    if len(common_dates) < 3:
        return {
            "metric1": metric1,
            "metric2": metric2,
            "correlation_r": None,
            "sample_size": len(common_dates),
            "interpretation": "Datos insuficientes para calcular correlación (mín. 3 puntos).",
        }

    v1 = [s1[d] for d in common_dates]
    v2 = [s2[d] for d in common_dates]

    try:
        r = statistics.correlation(v1, v2)
    except statistics.StatisticsError:
        r = None

    abs_r = abs(r) if r is not None else 0
    if r is None:
        interpretation = "No se pudo calcular la correlación."
    elif abs_r >= 0.7:
        direction = "positiva" if r > 0 else "negativa"
        interpretation = f"Correlación {direction} fuerte ({r:.3f})"
    elif abs_r >= 0.4:
        direction = "positiva" if r > 0 else "negativa"
        interpretation = f"Correlación {direction} moderada ({r:.3f})"
    else:
        direction = "positiva" if r > 0 else "negativa"
        interpretation = f"Correlación {direction} débil ({r:.3f})"

    return {
        "metric1": metric1,
        "metric2": metric2,
        "correlation_r": round(r, 4) if r is not None else None,
        "sample_size": len(common_dates),
        "interpretation": interpretation,
    }


def predict_performance_trend(args: dict, user_id: str, db: Session) -> dict:
    """Simple OLS linear regression to predict exercise performance trend."""
    exercise_name: str = args.get("exercise_name", "")
    days: int = int(args.get("days", 30))
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)

    exercise = (
        db.query(models.Exercise)
        .filter(models.Exercise.name.ilike(f"%{exercise_name}%"))
        .first()
    )
    if not exercise:
        return {"error": f"Exercise not found: {exercise_name}"}

    rows = (
        db.query(models.Workout.start_time, models.ExerciseSet.value)
        .join(models.ExerciseSet, models.Workout.id == models.ExerciseSet.workout_id)
        .filter(models.Workout.user_id == user_id)
        .filter(models.ExerciseSet.exercise_id == exercise.id)
        .filter(models.Workout.start_time >= cutoff)
        .filter(models.ExerciseSet.value != "")
        .filter(models.ExerciseSet.value != "0")
        .order_by(models.Workout.start_time)
        .all()
    )

    daily_max: dict[str, float] = {}
    for start_time, value_str in rows:
        val = _parse_exercise_value(value_str)
        if val > 0:
            date_key = start_time.strftime("%Y-%m-%d")
            daily_max[date_key] = max(daily_max.get(date_key, 0.0), val)

    if len(daily_max) < 2:
        return {
            "exercise": exercise.name,
            "data_points": len(daily_max),
            "slope_per_week": None,
            "current_max": max(daily_max.values()) if daily_max else None,
            "projected_max_in_days": None,
            "trend": "insufficient_data",
        }

    sorted_dates = sorted(daily_max.keys())
    values = [daily_max[d] for d in sorted_dates]
    n = len(values)
    x_mean = (n - 1) / 2.0
    y_mean = sum(values) / n

    num = sum((i - x_mean) * (v - y_mean) for i, v in enumerate(values))
    den = sum((i - x_mean) ** 2 for i in range(n))

    slope = num / den if den != 0 else 0.0
    slope_per_week = slope * 7

    current_max = values[-1]
    projected = current_max + slope * 30

    if abs(slope_per_week) < 0.01:
        trend = "estable"
    elif slope_per_week > 0:
        trend = "mejorando"
    else:
        trend = "bajando"

    return {
        "exercise": exercise.name,
        "data_points": n,
        "slope_per_week": round(slope_per_week, 4),
        "current_max": current_max,
        "projected_max_in_days": round(projected, 2),
        "trend": trend,
    }


def suggest_recovery_protocol(args: dict, user_id: str, db: Session) -> dict:
    """Evaluate recovery signals: last 3 workouts, sleep, resting HR."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    workout_cutoff = now - timedelta(days=14)
    workouts = (
        db.query(models.Workout)
        .filter(models.Workout.user_id == user_id, models.Workout.start_time >= workout_cutoff)
        .order_by(models.Workout.start_time.desc())
        .limit(3)
        .all()
    )

    total_volume = 0.0
    total_duration = 0.0
    for w in workouts:
        for s in w.exercise_sets:
            total_volume += _parse_exercise_value(s.value)
        if w.fitbit_data and w.fitbit_data.duration_ms:
            total_duration += w.fitbit_data.duration_ms / 60000
        elif w.end_time and w.start_time:
            total_duration += (w.end_time - w.start_time).total_seconds() / 60

    sleep_cutoff = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    sleep_rows = (
        db.query(models.SleepLog.efficiency, models.SleepLog.duration_ms)
        .filter(models.SleepLog.user_id == user_id, models.SleepLog.is_main_sleep.is_(True), models.SleepLog.date >= sleep_cutoff)
        .all()
    )

    avg_sleep_efficiency = (
        round(sum(r.efficiency for r in sleep_rows) / len(sleep_rows)) if sleep_rows else None
    )
    avg_sleep_duration_h = (
        round(sum(r.duration_ms for r in sleep_rows) / len(sleep_rows) / 3_600_000, 2) if sleep_rows else None
    )

    health_cutoff = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    health_rows = (
        db.query(models.DailyHealth.resting_heart_rate)
        .filter(models.DailyHealth.user_id == user_id, models.DailyHealth.date >= health_cutoff)
        .filter(models.DailyHealth.resting_heart_rate > 0)
        .all()
    )
    avg_resting_hr = (
        round(sum(r.resting_heart_rate for r in health_rows) / len(health_rows)) if health_rows else None
    )

    sleep_deficit = avg_sleep_duration_h is not None and avg_sleep_duration_h < 7.0

    return {
        "total_load_kg": round(total_volume, 1),
        "total_duration_min": round(total_duration, 1),
        "workout_count": len(workouts),
        "avg_sleep_efficiency": avg_sleep_efficiency,
        "avg_sleep_duration_h": avg_sleep_duration_h,
        "sleep_deficit": sleep_deficit,
        "avg_resting_hr": avg_resting_hr,
    }


def generate_workout_plan(args: dict, user_id: str, db: Session) -> dict:
    """Gather data for LLM to build a personalized workout plan."""
    focus_groups: list = args.get("focus_muscle_groups", [])
    goal: str = args.get("goal", "")
    intensity_level: str = args.get("intensity_level", "moderate")

    exercises_by_muscle = {}
    for muscle_name in focus_groups:
        exercises = (
            db.query(models.Exercise.name)
            .join(models.Muscle, models.Exercise.muscle_id == models.Muscle.id)
            .filter(models.Muscle.name.ilike(f"%{muscle_name}%"))
            .all()
        )
        exercises_by_muscle[muscle_name] = [e.name for e in exercises]

    prs = []
    for muscle_name in focus_groups:
        pr_rows = (
            db.query(
                models.Exercise.name,
                models.ExerciseSet.value,
                models.ExerciseSet.measurement,
                models.Workout.start_time,
            )
            .join(models.ExerciseSet, models.Exercise.id == models.ExerciseSet.exercise_id)
            .join(models.Workout, models.ExerciseSet.workout_id == models.Workout.id)
            .join(models.Muscle, models.Exercise.muscle_id == models.Muscle.id)
            .filter(models.Workout.user_id == user_id)
            .filter(models.Muscle.name.ilike(f"%{muscle_name}%"))
            .filter(models.ExerciseSet.value != "")
            .filter(models.ExerciseSet.value != "0")
            .all()
        )
        pr_map: dict = {}
        for ex_name, val, meas, _ in pr_rows:
            v = _parse_exercise_value(val)
            if v > 0 and (ex_name not in pr_map or v > pr_map[ex_name]["value"]):
                pr_map[ex_name] = {"value": v, "measurement": meas}
        for ex_name, data in pr_map.items():
            prs.append({"exercise": ex_name, "max_value": data["value"], "unit": data["measurement"]})

    days = 90
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    balance_rows = (
        db.query(models.Muscle.name, func.sum(_parse_exercise_value(models.ExerciseSet.value)))
        .join(models.Exercise, models.Muscle.id == models.Exercise.muscle_id)
        .join(models.ExerciseSet, models.Exercise.id == models.ExerciseSet.exercise_id)
        .join(models.Workout, models.ExerciseSet.workout_id == models.Workout.id)
        .filter(models.Workout.user_id == user_id, models.Workout.start_time >= cutoff)
        .filter(models.ExerciseSet.value != "")
        .group_by(models.Muscle.name)
        .all()
    )
    muscle_balance = {name: round(float(vol), 1) for name, vol in balance_rows if vol is not None}

    return {
        "focus_muscle_groups": focus_groups,
        "goal": goal,
        "intensity_level": intensity_level,
        "exercises_by_muscle": exercises_by_muscle,
        "personal_records": prs,
        "muscle_balance": muscle_balance,
    }


def get_overtraining_risk_assessment(args: dict, user_id: str, db: Session) -> dict:
    """Assess overtraining risk based on volume, HR and sleep trends."""
    days: int = int(args.get("days", 14))
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    cutoff = now - timedelta(days=days)
    mid = now - timedelta(days=days // 2)

    recent_volume = _compute_volume(db, user_id, mid, now)
    previous_volume = _compute_volume(db, user_id, cutoff, mid)

    recent_count = _compute_workout_count(db, user_id, mid, now)
    previous_count = _compute_workout_count(db, user_id, cutoff, mid)

    risk_factors = []
    if previous_volume > 0 and recent_volume > previous_volume * 1.2:
        risk_factors.append(
            f"Aumento de volumen >20% ({previous_volume:.0f} → {recent_volume:.0f} kg)"
        )

    health_cutoff = (now - timedelta(days=14)).strftime("%Y-%m-%d")
    health_rows = (
        db.query(models.DailyHealth.date, models.DailyHealth.resting_heart_rate)
        .filter(models.DailyHealth.user_id == user_id, models.DailyHealth.date >= health_cutoff)
        .filter(models.DailyHealth.resting_heart_rate > 0)
        .order_by(models.DailyHealth.date)
        .all()
    )
    if len(health_rows) >= 4:
        first_hr = sum(r.resting_heart_rate for r in health_rows[: len(health_rows) // 2]) / (len(health_rows) // 2)
        last_hr = sum(r.resting_heart_rate for r in health_rows[len(health_rows) // 2 :]) / (len(health_rows) - len(health_rows) // 2)
        if last_hr > first_hr * 1.05:
            risk_factors.append(
                f"FC en reposo en aumento ({first_hr:.0f} → {last_hr:.0f} bpm)"
            )

    sleep_cutoff = (now - timedelta(days=14)).strftime("%Y-%m-%d")
    sleep_rows = (
        db.query(models.SleepLog.efficiency)
        .filter(models.SleepLog.user_id == user_id, models.SleepLog.is_main_sleep.is_(True), models.SleepLog.date >= sleep_cutoff)
        .all()
    )
    if sleep_rows:
        avg_eff = sum(r.efficiency for r in sleep_rows) / len(sleep_rows)
        if avg_eff < 80:
            risk_factors.append(f"Eficiencia de sueño baja ({avg_eff:.0f}%)")

    if len(risk_factors) >= 3:
        risk_level = "alto"
    elif len(risk_factors) >= 1:
        risk_level = "moderado"
    else:
        risk_level = "bajo"

    recommendations = []
    if "volumen" in " ".join(risk_factors).lower():
        recommendations.append("Reducir el volumen de entrenamiento un 20% esta semana.")
    if "sueño" in " ".join(risk_factors).lower():
        recommendations.append("Priorizar descanso: mínimo 7-8 horas de sueño.")
    if "FC" in " ".join(risk_factors):
        recommendations.append("Tomar una semana de descarga o actividad ligera.")
    if not recommendations:
        recommendations.append("Mantener la rutina actual. Los indicadores son positivos.")

    return {
        "risk_level": risk_level,
        "risk_factors": risk_factors,
        "recommendations": recommendations,
        "data_summary": {
            "recent_workout_count": recent_count,
            "previous_workout_count": previous_count,
            "recent_volume_kg": round(recent_volume, 1),
            "previous_volume_kg": round(previous_volume, 1),
            "avg_sleep_efficiency": round(avg_eff, 1) if sleep_rows else None,
        },
    }
