import datetime
import logging
import json
import os
import unicodedata
from typing import List, Optional
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import User, Workout, ExerciseSet
from app.schemas.workout import WorkoutOut, WorkoutCreate
from app.services.workout_parser import WorkoutParser
from app.services.sync_service import parse_muscle_groups
from app.core.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

def get_root_users(db: Session):
    emails = []
    try:
        db_roots = db.query(User.email).filter(User.is_root == 1).all()
        emails.extend([r[0] for r in db_roots])
    except Exception as e:
        logger.error(f"Error reading root users from DB: {e}")
        
    return list(set([e.lower() for e in emails]))

def normalize_exercise_name(name: str) -> str:
    # Remove accents and convert to title case
    nksfd = unicodedata.normalize('NFKD', name)
    name = "".join([c for c in nksfd if not unicodedata.combining(c)])
    return name.strip().title()

@router.get("/", response_model=List[WorkoutOut])
def get_workouts(user_email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email.ilike(user_email)).first()
    if not user: raise HTTPException(404, "User not found")
    
    query = db.query(Workout).filter(Workout.user_email == user.email)
    
    # Hide 'root_import' and 'root_added' workouts from the regular timeline, 
    # since they are just mock containers for the exercise database.
    query = query.filter(~Workout.source.in_(['root_import', 'root_added']))
        
    workouts = query.order_by(Workout.date.desc()).all()
    
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
    user = db.query(User).filter(User.email.ilike(user_email)).first()
    if not user: raise HTTPException(404, "User not found")

    root_emails = get_root_users(db)
    search_emails = list(set([user.email.lower()] + root_emails))

    logger.info(f"Fetching exercises for user: {user.email}. Root users: {root_emails}")
    
    from sqlalchemy import func
    # 1. Get all unique exercise names available to this user (theirs + root)
    available_sets = (
        db.query(ExerciseSet.exercise_name, ExerciseSet.muscle_group, Workout.muscle_groups.label("workout_muscles"))
        .join(Workout, ExerciseSet.workout_id == Workout.id)
        .filter(func.lower(Workout.user_email).in_(search_emails))
        .all()
    )

    exercise_catalog = {}
    for es_name, es_muscle, w_muscles in available_sets:
        norm_name = normalize_exercise_name(es_name)
        if norm_name not in exercise_catalog:
            # Determine muscle group
            muscle = es_muscle
            if not muscle and w_muscles:
                parts = w_muscles.split(',')
                if parts: muscle = parts[0]
            muscle = WorkoutParser.normalize_muscle(muscle or 'Otros')
            
            if muscle != 'Otros':
                exercise_catalog[norm_name] = {"name": norm_name, "muscle": muscle, "last_weight": None}

    # 2. Get ONLY the user's most recent sets to fill in their own weights
    user_sets = (
        db.query(ExerciseSet)
        .join(Workout, ExerciseSet.workout_id == Workout.id)
        .filter(func.lower(Workout.user_email) == user.email.lower())
        .order_by(Workout.date.desc())
        .all()
    )

    for s in user_sets:
        norm_name = normalize_exercise_name(s.exercise_name)
        if norm_name in exercise_catalog and exercise_catalog[norm_name]["last_weight"] is None:
            vals = [v for v in [s.value1, s.value2, s.value3, s.value4] if v is not None]
            weight_str = " - ".join(str(int(v) if v == int(v) else v) for v in vals)
            if s.unit and weight_str:
                weight_str += s.unit
            exercise_catalog[norm_name]["last_weight"] = weight_str
    
    seen = exercise_catalog

    # Group by muscle
    grouped = {}
    for ex in seen.values():
        muscle = ex["muscle"]
        if muscle not in grouped:
            grouped[muscle] = []
        grouped[muscle].append({"name": ex["name"], "last_weight": ex["last_weight"]})

    # Sort muscles alphabetically
    sorted_muscles = sorted(grouped.keys())
    
    result = {}
    for muscle in sorted_muscles:
        # Sort exercises within each muscle alphabetically
        exercises = sorted(grouped[muscle], key=lambda x: x["name"])
        result[muscle] = exercises
        
    return result

@router.get("/root/export-mock")
def export_exercises_mock(user_email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email.ilike(user_email)).first()
    from .users import is_user_root
    if not user or not is_user_root(user.email, user.is_root):
        raise HTTPException(403, "Only root users can export mocks")
    
    sets = (
        db.query(ExerciseSet)
        .join(Workout)
        .filter(Workout.user_email == user.email)
        .all()
    )
    
    mock_data = []
    for s in sets:
        mock_data.append({
            "exercise_name": s.exercise_name,
            "muscle_group": s.muscle_group,
            "unit": s.unit,
            "reps": s.reps,
            "value1": s.value1,
            "value2": s.value2,
            "value3": s.value3,
            "value4": s.value4
        })
    return mock_data

@router.post("/root/import-mock")
def import_exercises_mock(user_email: str, mock_data: List[dict], db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email.ilike(user_email)).first()
    from .users import is_user_root
    if not user or not is_user_root(user.email, user.is_root):
        raise HTTPException(403, "Only root users can import mocks")
    
    # Create a dummy workout to hold these exercises
    master_workout = Workout(
        user_email=user.email,
        title="Master Exercises Mock",
        date=datetime.datetime.now(),
        muscle_groups="Master",
        source="root_import"
    )
    db.add(master_workout)
    db.flush()
    master_workout.sync_muscles_3nf(db)
    db.commit()
    db.refresh(master_workout)
    
    for item in mock_data:
        ex_set = ExerciseSet(
            workout_id=master_workout.id,
            exercise_name=item.get("exercise_name"),
            muscle_group=item.get("muscle_group"),
            unit=item.get("unit"),
            reps=item.get("reps"),
            value1=item.get("value1"),
            value2=item.get("value2"),
            value3=item.get("value3"),
            value4=item.get("value4")
        )
        db.add(ex_set)
    
    db.commit()
    return {"status": "Mock imported", "count": len(mock_data)}

@router.post("/root/add-exercise")
def add_master_exercise(user_email: str, exercise_name: str, muscle: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email.ilike(user_email)).first()
    from .users import is_user_root
    if not user or not is_user_root(user.email, user.is_root):
        raise HTTPException(403, "Only root users can add master exercises")
    
    # Check if exists normalized
    norm = normalize_exercise_name(exercise_name)
    
    # Create a persistent root workout for this muscle if not exists, or just a new one
    master_workout = db.query(Workout).filter(
        Workout.user_email == user.email, 
        Workout.title == f"Master {muscle}",
        Workout.source == "root_added"
    ).first()
    
    if not master_workout:
        master_workout = Workout(
            user_email=user.email,
            title=f"Master {muscle}",
            date=datetime.datetime.now(),
            muscle_groups=muscle,
            source="root_added"
        )
        db.add(master_workout)
        db.commit()
        db.refresh(master_workout)
    
    ex_set = ExerciseSet(
        workout_id=master_workout.id,
        exercise_name=exercise_name,
        muscle_group=muscle
    )
    db.add(ex_set)
    db.commit()
    return {"status": "Exercise added", "exercise": norm}

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
    db.flush()
    new_workout.sync_muscles_3nf(db)
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
    workout.muscle_groups = parse_muscle_groups(workout_in.title)
    db.query(ExerciseSet).filter(ExerciseSet.workout_id == workout_id).delete()
    exercises = WorkoutParser.parse_description(workout_in.description)
    for ex in exercises:
        ex_set = ExerciseSet(workout_id=workout.id, **ex)
        db.add(ex_set)
    workout.sync_muscles_3nf(db)
    db.commit()
    db.refresh(workout)
    return workout
