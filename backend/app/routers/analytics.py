from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List, Optional
from datetime import datetime, timedelta
from .. import models, schemas, database, auth

router = APIRouter(prefix="/analytics", tags=["analytics"])

@router.get("/weight-progress")
def get_weight_progress(
    exercise_id: str,
    period: str = "month", # week, month, year
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    # Time series of max weight per day for the specific exercise
    # We'll need to parse 'value' as float. Since value can be '45-40', we pick the max.
    
    query = (
        db.query(
            models.Workout.start_time,
            models.ExerciseSet.value,
            models.ExerciseSet.measurement
        )
        .join(models.ExerciseSet, models.Workout.id == models.ExerciseSet.workout_id)
        .filter(models.Workout.user_id == current_user.id)
        .filter(models.ExerciseSet.exercise_id == exercise_id)
        .order_by(models.Workout.start_time)
    )
    
    results = query.all()
    
    # Process results into a daily max
    daily_data = {}
    for start_time, value_str, measurement in results:
        date_key = start_time.date()
        # Parse max value from string like "45-40"
        try:
            vals = [float(v) for v in value_str.split("-")]
            max_val = max(vals)
        except:
            continue
            
        if date_key not in daily_data or max_val > daily_data[date_key]:
            daily_data[date_key] = max_val
            
    # Format for response
    response_data = []
    for date, val in sorted(daily_data.items()):
        response_data.append({
            "date": date,
            "value": val
        })
        
    return response_data

@router.get("/frequency")
def get_exercise_frequency(
    muscle_id: Optional[str] = None,
    days: int = 30,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    start_date = datetime.utcnow() - timedelta(days=days)
    
    query = (
        db.query(
            models.Exercise.name,
            models.Muscle.name.label("muscle_name"),
            func.count(models.ExerciseSet.id).label("count")
        )
        .join(models.ExerciseSet, models.Exercise.id == models.ExerciseSet.exercise_id)
        .join(models.Workout, models.ExerciseSet.workout_id == models.Workout.id)
        .join(models.Muscle, models.Exercise.muscle_id == models.Muscle.id)
        .filter(models.Workout.user_id == current_user.id)
        .filter(models.Workout.start_time >= start_date)
    )
    
    if muscle_id:
        query = query.filter(models.Exercise.muscle_id == muscle_id)
        
    query = query.group_by(models.Exercise.id, models.Muscle.id).order_by(desc("count"))
    
    results = query.all()
    
    return [
        {"exercise_name": name, "muscle_name": m_name, "count": count}
        for name, m_name, count in results
    ]
