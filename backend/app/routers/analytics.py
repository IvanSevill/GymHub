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
