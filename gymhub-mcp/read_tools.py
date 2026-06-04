"""Read tools — query the GymHub database directly via SQLAlchemy ORM."""

import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import desc, func
from sqlalchemy.orm import Session

import models


# ---------------------------------------------------------------------------
# Helpers copied verbatim from backend/app/routers/analytics.py
# ---------------------------------------------------------------------------


def _parse_exercise_value(value_str: str) -> float:
    """Return the max numeric value from a string like '50', '45-40', '40/35', '42.5'.

    Handles comma as decimal separator and range notation with '-' or '/'.
    Returns 0.0 if no numeric value can be extracted.
    """
    parts = re.split(r"[-/]", value_str.replace(",", "."))
    nums = []
    for p in parts:
        m = re.search(r"^\s*(\d+\.?\d*)", p)
        if m:
            nums.append(float(m.group(1)))
    return max(nums) if nums else 0.0


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
    """Return personal records (all-time maximum) per exercise."""
    exercise_name: str | None = args.get("exercise_name")

    query = (
        db.query(
            models.Exercise.id,
            models.Exercise.name,
            models.Muscle.name.label("muscle_name"),
            models.ExerciseSet.value,
            models.ExerciseSet.measurement,
            models.Workout.start_time,
        )
        .join(models.ExerciseSet, models.Exercise.id == models.ExerciseSet.exercise_id)
        .join(models.Workout, models.ExerciseSet.workout_id == models.Workout.id)
        .join(models.Muscle, models.Exercise.muscle_id == models.Muscle.id)
        .filter(models.Workout.user_id == user_id)
        .filter(models.Workout.start_time <= datetime.now(timezone.utc).replace(tzinfo=None))
        .filter(models.ExerciseSet.value != "")
        .filter(models.ExerciseSet.value != "0")
    )

    if exercise_name:
        query = query.filter(models.Exercise.name.ilike(f"%{exercise_name}%"))

    rows = query.all()

    max_lifts: dict = {}
    for ex_id, ex_name, m_name, value_str, measurement, start_time in rows:
        current_max = _parse_exercise_value(value_str)
        if current_max == 0.0:
            continue
        if ex_id not in max_lifts or current_max > max_lifts[ex_id]["value"]:
            max_lifts[ex_id] = {
                "exercise": ex_name,
                "muscle": m_name,
                "value": current_max,
                "measurement": measurement,
                "date": start_time.strftime("%Y-%m-%d"),
            }

    prs = sorted(max_lifts.values(), key=lambda x: x["muscle"])
    return {"prs": prs}


def get_analytics_summary(args: dict, user_id: str, db: Session) -> dict:
    """Return KPI summary for current and previous period."""
    days: int = int(args.get("days", 30))
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    cutoff = now - timedelta(days=days)

    curr_count = _compute_workout_count(db, user_id, cutoff, now)
    curr_volume = _compute_volume(db, user_id, cutoff, now)
    curr_duration = _compute_avg_duration(db, user_id, cutoff, now)
    curr_prs = _compute_prs(db, user_id, cutoff, now)

    if days >= 365:
        prev_count, prev_volume, prev_duration, prev_prs = 0, 0.0, None, 0
    else:
        prev_cutoff = cutoff - timedelta(days=days)
        prev_count = _compute_workout_count(db, user_id, prev_cutoff, cutoff)
        prev_volume = _compute_volume(db, user_id, prev_cutoff, cutoff)
        prev_duration = _compute_avg_duration(db, user_id, prev_cutoff, cutoff)
        prev_prs = _compute_prs(db, user_id, prev_cutoff, cutoff)

    return {
        "current": {
            "workout_count": curr_count,
            "total_volume_kg": round(curr_volume, 1),
            "avg_duration_min": curr_duration,
            "pr_count": curr_prs,
        },
        "previous": {
            "workout_count": prev_count,
            "total_volume_kg": round(prev_volume, 1),
            "avg_duration_min": prev_duration,
            "pr_count": prev_prs,
        },
        "period_days": days,
    }


def get_exercise_frequency(args: dict, user_id: str, db: Session) -> dict:
    """Return how many distinct sessions each exercise appeared in."""
    days: int = int(args.get("days", 90))
    muscle_name: str | None = args.get("muscle_name")
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)

    query = (
        db.query(
            models.Exercise.name,
            models.Muscle.name.label("muscle_name"),
            func.count(func.distinct(models.Workout.id)).label("sessions"),
        )
        .join(models.ExerciseSet, models.Exercise.id == models.ExerciseSet.exercise_id)
        .join(models.Workout, models.ExerciseSet.workout_id == models.Workout.id)
        .join(models.Muscle, models.Exercise.muscle_id == models.Muscle.id)
        .filter(models.Workout.user_id == user_id)
        .filter(models.Workout.start_time >= cutoff)
    )

    if muscle_name:
        query = query.filter(models.Muscle.name.ilike(f"%{muscle_name}%"))

    rows = (
        query.group_by(models.Exercise.id, models.Muscle.id)
        .order_by(desc("sessions"))
        .all()
    )

    exercises = [
        {"exercise": name, "muscle": m_name, "sessions": sessions}
        for name, m_name, sessions in rows
    ]
    return {"exercises": exercises}


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
    days: int = int(args.get("days", 14))
    cutoff = (datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)).strftime("%Y-%m-%d")

    rows = (
        db.query(models.DailyHealth)
        .filter(models.DailyHealth.user_id == user_id)
        .filter(models.DailyHealth.date >= cutoff)
        .order_by(models.DailyHealth.date)
        .all()
    )

    data = [
        {
            "date": r.date,
            "steps": r.steps,
            "floors": r.floors,
            "resting_heart_rate": r.resting_heart_rate,
            "calories_out": r.calories_out,
            "distance_km": r.distance_km,
            "minutes_sedentary": r.minutes_sedentary,
            "minutes_lightly_active": r.minutes_lightly_active,
            "minutes_fairly_active": r.minutes_fairly_active,
            "minutes_very_active": r.minutes_very_active,
        }
        for r in rows
    ]

    avg_steps = round(sum(d["steps"] for d in data) / len(data)) if data else 0
    avg_calories = round(sum(d["calories_out"] for d in data) / len(data)) if data else 0

    return {"data": data, "avg_steps": avg_steps, "avg_calories": avg_calories}


def get_sleep_logs(args: dict, user_id: str, db: Session) -> dict:
    """Return Fitbit sleep logs with duration, efficiency, and sleep stage breakdown."""
    days: int = int(args.get("days", 14))
    cutoff = (datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)).strftime("%Y-%m-%d")

    rows = (
        db.query(models.SleepLog)
        .filter(models.SleepLog.user_id == user_id)
        .filter(models.SleepLog.is_main_sleep.is_(True))
        .filter(models.SleepLog.date >= cutoff)
        .order_by(models.SleepLog.date)
        .all()
    )

    logs = [
        {
            "date": r.date,
            "duration_h": round(r.duration_ms / 3_600_000, 2) if r.duration_ms else 0.0,
            "efficiency": r.efficiency,
            "minutes_deep": r.minutes_deep,
            "minutes_rem": r.minutes_rem,
            "minutes_light": r.minutes_light,
            "minutes_awake": r.minutes_awake,
        }
        for r in rows
    ]

    avg_duration_h = round(sum(log["duration_h"] for log in logs) / len(logs), 2) if logs else 0.0
    avg_efficiency = round(sum(log["efficiency"] for log in logs) / len(logs)) if logs else 0

    return {"logs": logs, "avg_duration_h": avg_duration_h, "avg_efficiency": avg_efficiency}


def get_muscle_balance(args: dict, user_id: str, db: Session) -> dict:
    """Return training volume per muscle group per ISO week."""
    days: int = int(args.get("days", 90))
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)

    rows = (
        db.query(
            models.Workout.start_time,
            models.Muscle.name,
            models.ExerciseSet.value,
        )
        .join(models.ExerciseSet, models.Workout.id == models.ExerciseSet.workout_id)
        .join(models.Exercise, models.ExerciseSet.exercise_id == models.Exercise.id)
        .join(models.Muscle, models.Exercise.muscle_id == models.Muscle.id)
        .filter(models.Workout.user_id == user_id)
        .filter(models.Workout.start_time >= cutoff)
        .filter(models.ExerciseSet.value != "")
        .all()
    )

    volume_map: dict = {}
    for start_time, muscle_name, value_str in rows:
        v = _parse_exercise_value(value_str)
        if v <= 0:
            continue
        key = (start_time.strftime("%G-W%V"), muscle_name)
        volume_map[key] = volume_map.get(key, 0.0) + v

    balance = [
        {"week": week, "muscle": muscle, "volume_kg": round(v, 1)}
        for (week, muscle), v in sorted(volume_map.items())
    ]

    totals_by_muscle: dict = {}
    for entry in balance:
        m = entry["muscle"]
        totals_by_muscle[m] = round(totals_by_muscle.get(m, 0.0) + entry["volume_kg"], 1)

    return {"balance": balance, "totals_by_muscle": totals_by_muscle}
