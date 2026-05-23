from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from .. import models, schemas, database, auth

# FastAPI router for exercise-related endpoints
router = APIRouter(tags=["exercises"])

# Predefined list of valid muscle groups
VALID_MUSCLES = [
    "pecho", "hombro", "triceps", "biceps", "espalda",
    "abdomen", "gluteos", "femoral", "cuadriceps", "gemelos"
]

def _migrate_abdomen(db: Session) -> None:
    """Merge legacy 'abdominales' muscle group into 'abdomen'."""
    abdominales = db.query(models.Muscle).filter(models.Muscle.name == "abdominales").first()
    if not abdominales:
        return
    abdomen = db.query(models.Muscle).filter(models.Muscle.name == "abdomen").first()
    if abdomen:
        db.query(models.Exercise).filter(
            models.Exercise.muscle_id == abdominales.id
        ).update({"muscle_id": abdomen.id}, synchronize_session=False)
        db.delete(abdominales)
    else:
        abdominales.name = "abdomen"
    db.commit()


@router.get("/muscles", response_model=List[schemas.Muscle])
async def get_muscles(db: Session = Depends(database.get_db)):
    """
    Retrieves a list of all available muscle groups.
    If muscles do not exist, they are initialized from VALID_MUSCLES.
    """
    # One-time migration: merge legacy "abdominales" muscle into "abdomen"
    _migrate_abdomen(db)

    # Initialize muscles if they don't exist
    for m_name in VALID_MUSCLES:
        if not db.query(models.Muscle).filter(models.Muscle.name == m_name).first():
            db.add(models.Muscle(name=m_name))
    db.commit()
    return db.query(models.Muscle).all()

@router.post("/muscles", response_model=schemas.Muscle)
async def create_muscle(
    muscle: schemas.MuscleCreate,
    current_user: models.User = Depends(auth.get_current_root_user),
    db: Session = Depends(database.get_db),
):
    """Root-only: creates a new muscle group."""
    name = muscle.name.strip().lower()
    if not name:
        raise HTTPException(status_code=400, detail="Muscle name cannot be empty")
    existing = db.query(models.Muscle).filter(models.Muscle.name == name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Muscle group already exists")
    db_muscle = models.Muscle(name=name)
    db.add(db_muscle)
    try:
        db.commit()
        db.refresh(db_muscle)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Could not create muscle group")
    return db_muscle


@router.put("/muscles/{muscle_id}", response_model=schemas.Muscle)
async def update_muscle(
    muscle_id: str,
    data: schemas.MuscleUpdate,
    current_user: models.User = Depends(auth.get_current_root_user),
    db: Session = Depends(database.get_db),
):
    """Root-only: renames a muscle group."""
    db_muscle = db.query(models.Muscle).filter(models.Muscle.id == muscle_id).first()
    if not db_muscle:
        raise HTTPException(status_code=404, detail="Muscle not found")
    name = data.name.strip().lower()
    if not name:
        raise HTTPException(status_code=400, detail="Muscle name cannot be empty")
    duplicate = (
        db.query(models.Muscle)
        .filter(models.Muscle.name == name, models.Muscle.id != muscle_id)
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="A muscle group with that name already exists")
    db_muscle.name = name
    db.commit()
    db.refresh(db_muscle)
    return db_muscle


@router.delete("/muscles/{muscle_id}")
async def delete_muscle(
    muscle_id: str,
    current_user: models.User = Depends(auth.get_current_root_user),
    db: Session = Depends(database.get_db),
):
    """Root-only: deletes a muscle group and all its exercises (cascade)."""
    db_muscle = db.query(models.Muscle).filter(models.Muscle.id == muscle_id).first()
    if not db_muscle:
        raise HTTPException(status_code=404, detail="Muscle not found")
    db.delete(db_muscle)
    db.commit()
    return {"message": f"Muscle group '{db_muscle.name}' deleted"}


@router.put("/exercises/{exercise_id}", response_model=schemas.Exercise)
async def update_exercise(
    exercise_id: str,
    data: schemas.ExerciseUpdate,
    current_user: models.User = Depends(auth.get_current_root_user),
    db: Session = Depends(database.get_db),
):
    """Root-only: renames an exercise or moves it to a different muscle group."""
    db_exercise = db.query(models.Exercise).filter(models.Exercise.id == exercise_id).first()
    if not db_exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Exercise name cannot be empty")
    db_exercise.name = name
    if data.muscle_id and data.muscle_id != db_exercise.muscle_id:
        target_muscle = db.query(models.Muscle).filter(models.Muscle.id == data.muscle_id).first()
        if not target_muscle:
            raise HTTPException(status_code=404, detail="Target muscle not found")
        db_exercise.muscle_id = data.muscle_id
    try:
        db.commit()
        db.refresh(db_exercise)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="An exercise with that name already exists")
    return db_exercise


@router.delete("/exercises/{exercise_id}")
async def delete_exercise(
    exercise_id: str,
    current_user: models.User = Depends(auth.get_current_root_user),
    db: Session = Depends(database.get_db),
):
    """Root-only: deletes an exercise and all its associated sets (cascade)."""
    db_exercise = db.query(models.Exercise).filter(models.Exercise.id == exercise_id).first()
    if not db_exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    db.delete(db_exercise)
    db.commit()
    return {"message": f"Exercise '{db_exercise.name}' deleted"}


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

@router.post("/exercises/cleanup-unused")
async def cleanup_unused_exercises(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """
    Deletes all exercises that have no associated exercise sets (usage_count = 0).
    """
    used_ids = db.query(models.ExerciseSet.exercise_id).distinct()
    unused = db.query(models.Exercise).filter(~models.Exercise.id.in_(used_ids)).all()
    count = len(unused)
    for ex in unused:
        db.delete(ex)
    db.commit()
    return {"deleted": count}


@router.post("/exercises/reset-all", response_model=dict)
async def reset_all_data(
    current_user: models.User = Depends(auth.get_current_root_user),
    db: Session = Depends(database.get_db),
):
    """Root-only: wipes all workouts, exercises, and muscles; resets the sync token."""
    user_workout_ids = (
        db.query(models.Workout.id)
        .filter(models.Workout.user_id == current_user.id)
        .subquery()
    )
    db.query(models.ExerciseSet).filter(
        models.ExerciseSet.workout_id.in_(user_workout_ids)
    ).delete(synchronize_session=False)
    db.query(models.FitbitData).filter(
        models.FitbitData.workout_id.in_(user_workout_ids)
    ).delete(synchronize_session=False)
    db.query(models.Workout).filter(
        models.Workout.user_id == current_user.id
    ).delete(synchronize_session=False)
    db.query(models.Exercise).delete(synchronize_session=False)
    db.query(models.Muscle).delete(synchronize_session=False)
    user_tokens = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.user_id == current_user.id)
        .first()
    )
    if user_tokens:
        user_tokens.google_calendar_sync_token = None
        user_tokens.selected_calendar_id = None
    db.commit()
    return {"message": "Base de datos limpiada correctamente"}


@router.post("/exercises/reset-and-resync", response_model=dict)
async def reset_exercises_and_force_resync(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """
    Deletes all exercise sets from the current user's workouts and removes
    exercises that are no longer referenced by any set. Also resets the
    Google Calendar sync token so the next sync performs a full re-import.
    """
    user_workout_ids = (
        db.query(models.Workout.id)
        .filter(models.Workout.user_id == current_user.id)
        .subquery()
    )
    deleted_sets = (
        db.query(models.ExerciseSet)
        .filter(models.ExerciseSet.workout_id.in_(user_workout_ids))
        .delete(synchronize_session=False)
    )

    used_ids = db.query(models.ExerciseSet.exercise_id).distinct()
    deleted_exercises = (
        db.query(models.Exercise)
        .filter(~models.Exercise.id.in_(used_ids))
        .delete(synchronize_session=False)
    )

    user_tokens = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.user_id == current_user.id)
        .first()
    )
    if user_tokens:
        user_tokens.google_calendar_sync_token = None

    db.commit()
    return {
        "deleted_sets": deleted_sets,
        "deleted_exercises": deleted_exercises,
        "message": "Ejercicios eliminados. Sincroniza para reimportar desde Google Calendar.",
    }


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
