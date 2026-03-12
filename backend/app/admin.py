from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from . import models, database, auth
import json

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/export-mock")
def export_exercises(current_user: models.User = Depends(auth.get_current_root_user), db: Session = Depends(database.get_db)):
    muscles = db.query(models.Muscle).all()
    
    data = {}
    for m in muscles:
        exercises = db.query(models.Exercise).filter(models.Exercise.muscle_id == m.id).all()
        if exercises:
            # Format: { "Pecho": ["Press Banca", "Aperturas"], ... }
            data[m.name.capitalize()] = [e.name for e in exercises]
            
    return data

@router.post("/import-mock")
def import_exercises(data: dict, current_user: models.User = Depends(auth.get_current_root_user), db: Session = Depends(database.get_db)):
    # Expected format: { "Pecho": ["Ejercicio 1", ...], "Espalda": [...] }
    
    muscle_map = {m.name.lower(): m.id for m in db.query(models.Muscle).all()}
    
    for muscle_name, exercises in data.items():
        m_name_lower = muscle_name.lower()
        
        # Get or create muscle
        if m_name_lower not in muscle_map:
            new_muscle = models.Muscle(name=m_name_lower)
            db.add(new_muscle)
            db.flush()
            muscle_map[m_name_lower] = new_muscle.id
        
        m_id = muscle_map[m_name_lower]
        
        # Import exercises for this muscle
        if isinstance(exercises, list):
            for e_name in exercises:
                if not e_name: continue
                # Check if exercise exists for this muscle (case-insensitive check would be better but simple check for now)
                exists = db.query(models.Exercise).filter(
                    models.Exercise.name == e_name, 
                    models.Exercise.muscle_id == m_id
                ).first()
                
                if not exists:
                    db.add(models.Exercise(name=e_name, muscle_id=m_id))
    
    db.commit()
    return {"message": "Catálogo importado correctamente"}
