import re
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas

router = APIRouter(prefix="/analytics", tags=["analytics"])


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


@router.get("/weight-progress", response_model=List[schemas.WeightProgressPoint])
async def get_weight_progress(
    exercise_id: str = Query(..., description="ID of the exercise to track progress for"),
    days: int = Query(30, description="Number of past days to include"),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Time series of maximum weight lifted per day for a specific exercise."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    now = datetime.utcnow()

    results = (
        db.query(
            models.Workout.start_time,
            models.ExerciseSet.value,
            models.ExerciseSet.measurement,
        )
        .join(models.ExerciseSet, models.Workout.id == models.ExerciseSet.workout_id)
        .filter(models.Workout.user_id == current_user.id)
        .filter(models.ExerciseSet.exercise_id == exercise_id)
        .filter(models.Workout.start_time >= cutoff)
        .filter(models.Workout.start_time <= now)
        .filter(models.ExerciseSet.value != "")
        .filter(models.ExerciseSet.value != "0")
        .order_by(models.Workout.start_time)
        .all()
    )

    daily_data: dict = {}
    for start_time, value_str, _measurement in results:
        max_val = _parse_exercise_value(value_str)
        if max_val == 0.0:
            continue
        date_key = start_time.date()
        if date_key not in daily_data or max_val > daily_data[date_key]:
            daily_data[date_key] = max_val

    return [
        {"date": datetime.combine(date, datetime.min.time()), "value": val}
        for date, val in sorted(daily_data.items())
    ]


@router.get("/frequency", response_model=List[schemas.ExerciseFrequency])
async def get_exercise_frequency(
    muscle_id: Optional[str] = Query(
        None, description="Optional ID of the muscle to filter frequency by"
    ),
    days: int = Query(730, description="Number of past days to consider"),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Frequency of exercises performed within a date range, optionally by muscle."""
    start_date = datetime.utcnow() - timedelta(days=days)

    query = (
        db.query(
            models.Exercise.name,
            models.Muscle.name.label("muscle_name"),
            func.count(models.ExerciseSet.id).label("count"),
        )
        .join(models.ExerciseSet, models.Exercise.id == models.ExerciseSet.exercise_id)
        .join(models.Workout, models.ExerciseSet.workout_id == models.Workout.id)
        .join(models.Muscle, models.Exercise.muscle_id == models.Muscle.id)
        .filter(models.Workout.user_id == current_user.id)
        .filter(models.Workout.start_time >= start_date)
    )

    if muscle_id:
        query = query.filter(models.Exercise.muscle_id == muscle_id)

    results = query.group_by(models.Exercise.id, models.Muscle.id).order_by(desc("count")).all()

    return [
        {"exercise_name": name, "muscle_name": m_name, "count": count}
        for name, m_name, count in results
    ]


@router.get("/max-lifts", response_model=List[schemas.MaxLift])
async def get_max_lifts(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Maximum lift recorded for each exercise by the current user."""
    results = (
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
        .filter(models.Workout.user_id == current_user.id)
        .filter(models.Workout.start_time <= datetime.utcnow())
        .filter(models.ExerciseSet.value != "")
        .filter(models.ExerciseSet.value != "0")
        .all()
    )

    max_lifts: dict = {}
    for ex_id, ex_name, m_name, value_str, measurement, start_time in results:
        current_max = _parse_exercise_value(value_str)
        if current_max == 0.0:
            continue
        if ex_id not in max_lifts or current_max > max_lifts[ex_id]["max_value"]:
            max_lifts[ex_id] = {
                "exercise_id": ex_id,
                "exercise_name": ex_name,
                "muscle_name": m_name,
                "max_value": current_max,
                "measurement": measurement,
                "date": start_time,
            }

    return sorted(max_lifts.values(), key=lambda x: x["muscle_name"])


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
) -> Optional[float]:
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


def _iso_weeks_in_range(start: datetime, end: datetime) -> List[str]:
    weeks = []
    current = start.date()
    current -= timedelta(days=current.weekday())
    end_date = end.date()
    while current <= end_date:
        weeks.append(current.strftime("%G-W%V"))
        current += timedelta(weeks=1)
    return weeks


@router.get("/summary", response_model=schemas.AnalyticsSummary)
async def get_analytics_summary(
    days: int = Query(30, description="Number of past days for the current period"),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """KPI summary with current and previous period values for trend comparison."""
    now = datetime.utcnow()
    cutoff = now - timedelta(days=days)

    curr_count = _compute_workout_count(db, current_user.id, cutoff, now)
    curr_volume = _compute_volume(db, current_user.id, cutoff, now)
    curr_duration = _compute_avg_duration(db, current_user.id, cutoff, now)
    curr_prs = _compute_prs(db, current_user.id, cutoff, now)

    if days >= 365:
        prev_count, prev_volume, prev_duration, prev_prs = 0, 0.0, None, 0
    else:
        prev_cutoff = cutoff - timedelta(days=days)
        prev_count = _compute_workout_count(db, current_user.id, prev_cutoff, cutoff)
        prev_volume = _compute_volume(db, current_user.id, prev_cutoff, cutoff)
        prev_duration = _compute_avg_duration(db, current_user.id, prev_cutoff, cutoff)
        prev_prs = _compute_prs(db, current_user.id, prev_cutoff, cutoff)

    return {
        "workout_count": curr_count,
        "prev_workout_count": prev_count,
        "total_volume_kg": round(curr_volume, 1),
        "prev_total_volume_kg": round(prev_volume, 1),
        "avg_duration_min": curr_duration,
        "prev_avg_duration_min": prev_duration,
        "pr_count": curr_prs,
        "prev_pr_count": prev_prs,
    }


@router.get("/workout-frequency", response_model=List[schemas.WorkoutFrequencyPoint])
async def get_workout_frequency(
    days: int = Query(90, description="Number of past days to include"),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Workout count per ISO week, with zero-filled gaps."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(models.Workout.start_time)
        .filter(
            models.Workout.user_id == current_user.id,
            models.Workout.start_time >= cutoff,
        )
        .order_by(models.Workout.start_time)
        .all()
    )
    counts: dict = {}
    for (start_time,) in rows:
        week_key = start_time.strftime("%G-W%V")
        counts[week_key] = counts.get(week_key, 0) + 1

    all_weeks = _iso_weeks_in_range(cutoff, datetime.utcnow())
    return [{"week": w, "count": counts.get(w, 0)} for w in all_weeks]


@router.get("/volume-trend", response_model=List[schemas.VolumeTrendPoint])
async def get_volume_trend(
    days: int = Query(90, description="Number of past days to include"),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Total exercise volume (kg) per session, sorted chronologically."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(models.Workout.start_time, models.ExerciseSet.value)
        .join(models.ExerciseSet, models.Workout.id == models.ExerciseSet.workout_id)
        .filter(
            models.Workout.user_id == current_user.id,
            models.Workout.start_time >= cutoff,
            models.ExerciseSet.value != "",
        )
        .order_by(models.Workout.start_time)
        .all()
    )
    volume_by_date: dict = {}
    for start_time, value_str in rows:
        v = _parse_exercise_value(value_str)
        if v > 0:
            date_key = start_time.date()
            volume_by_date[date_key] = volume_by_date.get(date_key, 0.0) + v
    return [
        {"date": datetime.combine(d, datetime.min.time()), "volume": round(v, 1)}
        for d, v in sorted(volume_by_date.items())
    ]


@router.get("/muscle-balance", response_model=List[schemas.MuscleBalancePoint])
async def get_muscle_balance(
    days: int = Query(90, description="Number of past days to include"),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Volume (kg) per muscle group per ISO week — for stacked bar chart."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(
            models.Workout.start_time,
            models.Muscle.name,
            models.ExerciseSet.value,
        )
        .join(models.ExerciseSet, models.Workout.id == models.ExerciseSet.workout_id)
        .join(models.Exercise, models.ExerciseSet.exercise_id == models.Exercise.id)
        .join(models.Muscle, models.Exercise.muscle_id == models.Muscle.id)
        .filter(
            models.Workout.user_id == current_user.id,
            models.Workout.start_time >= cutoff,
            models.ExerciseSet.value != "",
        )
        .all()
    )
    volume_map: dict = {}
    for start_time, muscle_name, value_str in rows:
        v = _parse_exercise_value(value_str)
        if v <= 0:
            continue
        key = (start_time.strftime("%G-W%V"), muscle_name)
        volume_map[key] = volume_map.get(key, 0.0) + v
    return [
        {"week": week, "muscle": muscle, "volume": round(v, 1)}
        for (week, muscle), v in sorted(volume_map.items())
    ]


@router.get("/session-durations", response_model=List[schemas.SessionDuration])
async def get_session_durations(
    days: int = Query(90, description="Number of past days to include"),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Duration (minutes) per workout session — for histogram."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(
            models.Workout.start_time,
            models.Workout.end_time,
            models.FitbitData.duration_ms,
        )
        .outerjoin(models.FitbitData, models.FitbitData.workout_id == models.Workout.id)
        .filter(
            models.Workout.user_id == current_user.id,
            models.Workout.start_time >= cutoff,
        )
        .order_by(models.Workout.start_time)
        .all()
    )
    result = []
    for start_time, end_time, fitbit_ms in rows:
        if fitbit_ms and fitbit_ms > 0:
            dur = fitbit_ms / 60000
        elif end_time and end_time > start_time:
            dur = (end_time - start_time).total_seconds() / 60
        else:
            continue
        if dur > 0:
            result.append({"date": start_time, "duration_min": round(dur, 1)})
    return result


@router.get("/exercise-history/{exercise_id}", response_model=List[dict])
async def get_exercise_history(
    exercise_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Historical sets for a specific exercise."""
    results = (
        db.query(
            models.Workout.start_time,
            models.ExerciseSet.value,
            models.ExerciseSet.measurement,
        )
        .join(models.ExerciseSet, models.Workout.id == models.ExerciseSet.workout_id)
        .filter(models.Workout.user_id == current_user.id)
        .filter(models.ExerciseSet.exercise_id == exercise_id)
        .order_by(desc(models.Workout.start_time))
        .all()
    )
    return [
        {"date": r.start_time, "value": r.value, "measurement": r.measurement}
        for r in results
    ]
