from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from .. import models, schemas, database, auth

# FastAPI router for exercise-related endpoints
router = APIRouter(tags=["exercises"])

# Predefined list of valid muscle groups
VALID_MUSCLES = [
    "pecho", "hombro", "triceps", "biceps", "espalda",
    "abdominales", "abdomen", "gluteos", "femoral", "cuadriceps", "gemelos"
]

@router.get("/muscles", response_model=List[schemas.Muscle])
async def get_muscles(db: Session = Depends(database.get_db)):
    """
    Retrieves a list of all available muscle groups.
    If muscles do not exist, they are initialized from VALID_MUSCLES.
    """
    # Initialize muscles if they don't exist
    for m_name in VALID_MUSCLES:
        if not db.query(models.Muscle).filter(models.Muscle.name == m_name).first():
            db.add(models.Muscle(name=m_name))
    db.commit()
    return db.query(models.Muscle).all()

@router.get("/exercises", response_model=List[schemas.Exercise])
async def get_exercises(
    muscle_id: Optional[str] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user) # Only authenticated users can get exercises
):
    """
    Retrieves a list of exercises, optionally filtered by muscle ID.
    Accessible only by authenticated users.
    """
    query = db.query(models.Exercise).outerjoin(models.Muscle)
    if muscle_id:
        query = query.filter(models.Exercise.muscle_id == muscle_id)
    return query.all()

@router.post("/exercises", response_model=schemas.Exercise)
async def create_exercise(
    exercise: schemas.ExerciseCreate,
    current_user: models.User = Depends(auth.get_current_root_user), # Restricted to root users
    db: Session = Depends(database.get_db)
):
    """
    Creates a new exercise.
    This endpoint is restricted to root users.
    """
    # Verify muscle exists
    muscle = db.query(models.Muscle).filter(models.Muscle.id == exercise.muscle_id).first()
    if not muscle:
        raise HTTPException(status_code=404, detail="Muscle not found")

    db_exercise = models.Exercise(name=exercise.name, muscle_id=exercise.muscle_id)
    db.add(db_exercise)
    try:
        db.commit()
        db.refresh(db_exercise)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Exercise with this name already exists")
    return db_exercise

@router.get("/exercises/unique", response_model=List[dict])
async def get_unique_exercises(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Get all unique exercises with their set usage count, grouped by muscle.
    """
    rows = (
        db.query(
            models.Exercise,
            func.count(models.ExerciseSet.id).label("usage_count"),
        )
        .outerjoin(models.ExerciseSet, models.ExerciseSet.exercise_id == models.Exercise.id)
        .group_by(models.Exercise.id)
        .all()
    )
    return [
        {
            "id": ex.id,
            "name": ex.name,
            "muscle_id": ex.muscle_id,
            "muscle_name": ex.muscle.name if ex.muscle else "Desconocido",
            "usage_count": count,
        }
        for ex, count in rows
    ]

@router.post("/exercises/standardize")
async def standardize_exercises(
    data: Dict[str, Any] = Body(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Merge multiple exercises into one standard name.
    Expects data: {
        "standard_name": "Press de Banca",
        "exercise_ids_to_merge": ["uuid-1", "uuid-2"],
        "muscle_id": "uuid-muscle"
    }
    """
    standard_name = data.get("standard_name")
    exercise_ids = data.get("exercise_ids_to_merge", [])
    muscle_id = data.get("muscle_id")

    if not standard_name or not exercise_ids or not muscle_id:
        raise HTTPException(status_code=400, detail="Missing required fields")

    # Check if standard exercise already exists
    standard_ex = db.query(models.Exercise).filter(
        models.Exercise.name == standard_name,
        models.Exercise.muscle_id == muscle_id
    ).first()

    if not standard_ex:
        standard_ex = models.Exercise(name=standard_name, muscle_id=muscle_id)
        db.add(standard_ex)
        db.flush()

    # Find all exercise sets pointing to the old exercises
    affected_sets = db.query(models.ExerciseSet).filter(models.ExerciseSet.exercise_id.in_(exercise_ids)).all()
    affected_workout_ids = set()

    for es in affected_sets:
        es.exercise_id = standard_ex.id
        affected_workout_ids.add(es.workout_id)

    # Delete old exercises (if they are not the standard one we just found/created)
    ids_to_delete = [eid for eid in exercise_ids if eid != standard_ex.id]
    if ids_to_delete:
        db.query(models.Exercise).filter(models.Exercise.id.in_(ids_to_delete)).delete(synchronize_session=False)

    db.commit()

    # Now, re-sync affected workouts to Google Calendar to update the descriptions
    user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == current_user.id).first()
    if user_tokens and user_tokens.selected_calendar_id:
        # Import update_google_calendar_event locally to avoid circular import if necessary
        from .workouts import update_google_calendar_event
        workouts = db.query(models.Workout).filter(models.Workout.id.in_(affected_workout_ids)).all()
        for w in workouts:
            try:
                update_google_calendar_event(db, user_tokens, w, w.fitbit_data)
            except Exception as e:
                print(f"Error updating calendar for workout {w.id}: {e}")
        db.commit()

    return {"message": f"Successfully merged {len(exercise_ids)} exercises into '{standard_name}'. Updated {len(affected_workout_ids)} workouts."}
