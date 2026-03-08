import datetime
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import User, Workout, ExerciseSet
from app.schemas.workout import WorkoutOut, WorkoutCreate
from app.services.workout_parser import WorkoutParser
from app.services.sync_service import parse_muscle_groups

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/", response_model=List[WorkoutOut])
def get_workouts(user_email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_email).first()
    if not user: raise HTTPException(404, "User not found")
    workouts = db.query(Workout).filter(Workout.user_email == user.email).order_by(Workout.date.desc()).all()
    return workouts

def get_set_muscle(s: ExerciseSet, w: Workout) -> str:
    if s.muscle_group:
        return WorkoutParser.normalize_muscle(s.muscle_group)
    if w.muscle_groups:
        parts = w.muscle_groups.split(',')
        if parts:
            return WorkoutParser.normalize_muscle(parts[0])
    return 'Otros'

@router.get("/exercises-by-muscle")
def get_exercises_by_muscle(user_email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_email).first()
    if not user: raise HTTPException(404, "User not found")

    sets = (
        db.query(ExerciseSet)
        .join(Workout)
        .filter(Workout.user_email == user_email)
        .order_by(Workout.date.desc())
        .all()
    )

    seen = {}
    for s in sets:
        name = s.exercise_name.strip()
        if name not in seen:
            vals = [v for v in [s.value1, s.value2, s.value3, s.value4] if v is not None]
            weight_str = " - ".join(str(int(v) if v == int(v) else v) for v in vals)
            if s.unit and weight_str:
                weight_str += s.unit
            muscle = get_set_muscle(s, s.workout)
            seen[name] = {"name": name, "muscle": muscle, "last_weight": weight_str or None}

    result = {}
    for ex in seen.values():
        muscle = ex["muscle"]
        if muscle not in result:
            result[muscle] = []
        result[muscle].append({"name": ex["name"], "last_weight": ex["last_weight"]})
    return result

@router.post("/", response_model=WorkoutOut)
def create_workout(workout_in: WorkoutCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == workout_in.user_email).first()
    if not user: raise HTTPException(404, "User not found")

    new_workout = Workout(
        user_email=user.email,
        title=workout_in.title,
        muscle_groups=parse_muscle_groups(workout_in.title),
        source="app"
    )
    db.add(new_workout)
    db.commit()
    db.refresh(new_workout)

    exercises = WorkoutParser.parse_description(workout_in.description)
    for ex in exercises:
        ex_set = ExerciseSet(workout_id=new_workout.id, **ex)
        db.add(ex_set)

    db.commit()
    db.refresh(new_workout)
    return new_workout

@router.patch("/{workout_id}", response_model=WorkoutOut)
def update_workout(workout_id: int, workout_in: WorkoutCreate, db: Session = Depends(get_db)):
    workout = db.query(Workout).filter(Workout.id == workout_id).first()
    if not workout: raise HTTPException(404, "Workout not found")
    workout.title = workout_in.title
    db.query(ExerciseSet).filter(ExerciseSet.workout_id == workout_id).delete()
    exercises = WorkoutParser.parse_description(workout_in.description)
    for ex in exercises:
        ex_set = ExerciseSet(workout_id=workout.id, **ex)
        db.add(ex_set)
    db.commit()
    db.refresh(workout)
    return workout
