from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from .. import models, database, auth
import json

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/export-mock")
def export_exercises(current_user: models.User = Depends(auth.get_current_root_user), db: Session = Depends(database.get_db)):
    exercises = db.query(models.Exercise).all()
    muscles = db.query(models.Muscle).all()
    
    data = {
        "muscles": [{"name": m.name} for m in muscles],
        "exercises": [{"name": e.name, "muscle": e.muscle.name} for e in exercises]
    }
    return data

@router.post("/import-mock")
def import_exercises(data: dict, current_user: models.User = Depends(auth.get_current_root_user), db: Session = Depends(database.get_db)):
    # Import muscles
    muscle_map = {}
    for m_data in data.get("muscles", []):
        name = m_data["name"].lower()
        muscle = db.query(models.Muscle).filter(models.Muscle.name == name).first()
        if not muscle:
            muscle = models.Muscle(name=name)
            db.add(muscle)
            db.flush()
        muscle_map[name] = muscle.id
        
    # Import exercises
    for e_data in data.get("exercises", []):
        name = e_data["name"]
        m_name = e_data["muscle"].lower()
        if m_name in muscle_map:
            if not db.query(models.Exercise).filter(models.Exercise.name == name).first():
                db.add(models.Exercise(name=name, muscle_id=muscle_map[m_name]))
    
    db.commit()
    return {"message": "Data imported successfully"}
