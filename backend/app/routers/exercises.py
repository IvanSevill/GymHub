from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from .. import models, schemas, database, auth

router = APIRouter(tags=["exercises"])

VALID_MUSCLES = ["pecho", "hombro", "triceps", "biceps", "espalda", "abdominales", "gluteos", "femoral", "cuadriceps", "gemelos"]

@router.get("/muscles", response_model=List[schemas.Muscle])
def get_muscles(db: Session = Depends(database.get_db)):
    # Initialize muscles if they don't exist
    for m_name in VALID_MUSCLES:
        if not db.query(models.Muscle).filter(models.Muscle.name == m_name).first():
            db.add(models.Muscle(name=m_name))
    db.commit()
    return db.query(models.Muscle).all()

@router.get("/exercises", response_model=List[schemas.Exercise])
def get_exercises(muscle_id: Optional[str] = None, db: Session = Depends(database.get_db)):
    query = db.query(models.Exercise)
    if muscle_id:
        query = query.filter(models.Exercise.muscle_id == muscle_id)
    return query.all()

@router.post("/exercises", response_model=schemas.Exercise)
def create_exercise(exercise: schemas.ExerciseCreate, current_user: models.User = Depends(auth.get_current_root_user), db: Session = Depends(database.get_db)):
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
        raise HTTPException(status_code=400, detail="Exercise already exists")
    return db_exercise
