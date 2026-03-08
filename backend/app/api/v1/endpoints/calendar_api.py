import datetime
import logging
import json
import os
import unicodedata as _ud
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import User, Workout, ExerciseSet
from app.schemas.workout import CreateEventTemplateRequest, CreateWeeklyPlanRequest
from app.services.google_calendar import GoogleCalendarService
from app.services.workout_parser import WorkoutParser
from app.core.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

def get_root_users(db: Session):
    emails = []
    # 1. From JSON file
    try:
        if os.path.exists(settings.ROOT_USERS_FILE):
             with open(settings.ROOT_USERS_FILE, 'r') as f:
                emails.extend(json.load(f))
    except Exception as e:
        logger.error(f"Error reading root users JSON: {e}")
    
    # 2. From Database
    try:
        db_roots = db.query(User.email).filter(User.is_root == True).all()
        emails.extend([r[0] for r in db_roots])
    except Exception as e:
        logger.error(f"Error reading root users from DB: {e}")
        
    return list(set([e.lower() for e in emails]))

def normalize_exercise_name(name: str) -> str:
    nksfd = _ud.normalize('NFKD', name)
    name = "".join([c for c in nksfd if not _ud.combining(c)])
    return name.strip().title()

def get_set_muscle(s: ExerciseSet, w: Workout) -> str:
    if s.muscle_group:
        return WorkoutParser.normalize_muscle(s.muscle_group)
    if w.muscle_groups:
        parts = w.muscle_groups.split(',')
        if parts:
            return WorkoutParser.normalize_muscle(parts[0])
    return 'Otros'

@router.post("/create-template")
def create_event_template(req: CreateEventTemplateRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email.ilike(req.user_email)).first()
    if not user: raise HTTPException(404, "User not found")
    if not user.google_access_token: raise HTTPException(400, "No Google token")
    if not user.selected_calendar_id: raise HTTPException(400, "No calendar selected")

    root_emails = get_root_users(db)
    search_emails = list(set([user.email.lower()] + root_emails))

    sets = (
        db.query(ExerciseSet)
        .join(Workout, ExerciseSet.workout_id == Workout.id)
        .filter(func.lower(Workout.user_email).in_(search_emails))
        .order_by(Workout.date.desc())
        .all()
    )

    # First pass: Identify available exercises from both user and root
    exercises_found = {}
    def _norm(t): return _ud.normalize('NFD', t).encode('ascii', 'ignore').decode().lower()
    leg_muscles_norm = ["pierna", "piernas", "gluteo", "cuadriceps", "femoral", "aductores", "gemelo", "gemelos", "isquios"]

    for s in sets:
        raw_name = s.exercise_name.strip()
        name = normalize_exercise_name(raw_name)
        
        if name not in exercises_found:
            muscle = get_set_muscle(s, s.workout)
            matched_muscle = None
            for req_m in req.muscles:
                if _norm(muscle) == _norm(req_m) or (_norm(req_m) in ["pierna", "piernas"] and _norm(muscle) in leg_muscles_norm):
                    matched_muscle = req_m
                    break
            
            if matched_muscle:
                exercises_found[name] = {
                    "muscle": muscle, 
                    "req_muscle": matched_muscle, 
                    "name": name, 
                    "weight": None
                }

    # Second pass: ONLY look for the current user's OWN weights to populate the records
    user_sets = (
        db.query(ExerciseSet)
        .join(Workout, ExerciseSet.workout_id == Workout.id)
        .filter(Workout.user_email == user.email)
        .order_by(Workout.date.desc())
        .all()
    )

    for s in user_sets:
        name = normalize_exercise_name(s.exercise_name)
        if name in exercises_found and exercises_found[name]["weight"] is None:
            vals = [v for v in [s.value1, s.value2, s.value3, s.value4] if v is not None]
            weight_str = " - ".join(str(int(v) if v == int(v) else v) for v in vals)
            if s.unit and weight_str:
                weight_str += s.unit
            exercises_found[name]["weight"] = weight_str

    seen = exercises_found

    lines = []
    # Sort the muscles requested to keep template consistent
    sorted_req_muscles = sorted(req.muscles)
    
    for muscle_req in sorted_req_muscles:
        # Filter and sort exercises for this muscle
        muscle_exercises = [
            d for d in seen.values() 
            if _norm(d["req_muscle"]) == _norm(muscle_req)
        ]
        if not muscle_exercises:
            continue
            
        muscle_exercises.sort(key=lambda x: x["name"])
        
        for data in muscle_exercises:
            weight_info = f" {data['weight']}" if data["weight"] else ""
            lines.append(f"{data['muscle']} - {data['name']}{weight_info}")
        
        # Add a newline between muscle groups
        lines.append("")

    title = " - ".join(req.muscles)
    # Automatically normalize Circuito/Circuit to Cardio
    title = title.replace("Circuito", "Cardio").replace("Circuit", "Cardio")
    if "cardio" in title.lower() and "Cardio" not in title:
        title = title.replace("cardio", "Cardio")

    description = "\n".join(lines)
    if not description:
        description = f"Sesión de {title}\n(No se encontraron ejercicios previos en el historial)"
        
    # Tag for sync identification
    description = f"[GymHub]\n{description}"

    logger.info(f"Creating event template for {req.user_email}, muscles: {req.muscles}, date: {req.date}")

    
    try:
        # Check if it's already a full ISO string or just date
        if 'T' in req.date:
             date_obj = datetime.datetime.fromisoformat(req.date.replace('Z', '+00:00'))
        else:
             date_obj = datetime.datetime.fromisoformat(req.date)
             
        start_time = date_obj.replace(hour=req.start_hour, minute=req.start_minute, second=0, microsecond=0)
        end_time = date_obj.replace(hour=req.end_hour, minute=req.end_minute, second=0, microsecond=0)
    except Exception as e:
        logger.error(f"Date/Time parsing error: {e} | date={req.date}, start={req.start_hour}:{req.start_minute}")
        raise HTTPException(400, f"Formato de fecha/hora inválido: {str(e)}")

    try:
        cal_service = GoogleCalendarService(user, db)
        event_id = cal_service.create_event(
            title=title,
            description=description,
            start_time=start_time,
            end_time=end_time,
            calendar_id=user.selected_calendar_id
        )
        logger.info(f"Successfully created event {event_id} for {user.email}")
        return {"status": "Event created", "event_id": event_id, "description": description}
    except Exception as e:
        logger.error(f"Failed to create template event for {user.email}: {e}")
        raise HTTPException(500, f"Error del servidor al crear el evento: {str(e)}")

@router.post("/create-weekly-plan")
def create_weekly_plan(req: CreateWeeklyPlanRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email.ilike(req.user_email)).first()
    if not user: raise HTTPException(404, "User not found")
    if not user.google_access_token: raise HTTPException(400, "No Google token")
    if not user.selected_calendar_id: raise HTTPException(400, "No calendar selected")

    root_emails = get_root_users(db)
    search_emails = list(set([user.email.lower()] + root_emails))

    # Fetch all sets once to reuse in multiple workouts
    all_sets = (
        db.query(ExerciseSet)
        .join(Workout, ExerciseSet.workout_id == Workout.id)
        .filter(func.lower(Workout.user_email).in_(search_emails))
        .order_by(Workout.date.desc())
        .all()
    )

    leg_muscles_norm = ["pierna", "piernas", "gluteo", "cuadriceps", "femoral", "aductores", "gemelo", "gemelos", "isquios"]
    def _norm(t): return _ud.normalize('NFD', t).encode('ascii', 'ignore').decode().lower()

    created_ids = []
    
    for w_req in req.workouts:
        # Template generation logic (similar to single event)
        # First pass: Identify available exercises from both user and root for this workout
        exercises_found = {}
        for s in all_sets:
            raw_name = s.exercise_name.strip()
            name = normalize_exercise_name(raw_name)
            if name not in exercises_found:
                muscle = get_set_muscle(s, s.workout)
                matched_muscle = None
                for req_m in w_req.muscles:
                    if _norm(muscle) == _norm(req_m) or (_norm(req_m) in ["pierna", "piernas"] and _norm(muscle) in leg_muscles_norm):
                        matched_muscle = req_m
                        break
                if matched_muscle:
                    exercises_found[name] = {
                        "muscle": muscle, 
                        "req_muscle": matched_muscle, 
                        "name": name, 
                        "weight": None
                    }

        # Second pass: ONLY use current user's sets for weights
        user_sets_only = [s for s in all_sets if s.workout.user_email == user.email]
        for s in user_sets_only:
            name = normalize_exercise_name(s.exercise_name)
            if name in exercises_found and exercises_found[name]["weight"] is None:
                vals = [v for v in [s.value1, s.value2, s.value3, s.value4] if v is not None]
                weight_str = " - ".join(str(int(v) if v == int(v) else v) for v in vals)
                if s.unit and weight_str: weight_str += s.unit
                exercises_found[name]["weight"] = weight_str

        seen = exercises_found

        lines = []
        for muscle_req in sorted(w_req.muscles):
            muscle_exercises = sorted([d for d in seen.values() if _norm(d["req_muscle"]) == _norm(muscle_req)], key=lambda x: x["name"])
            if not muscle_exercises:
                continue
                
            for data in muscle_exercises:
                weight_info = f" {data['weight']}" if data["weight"] else ""
                lines.append(f"{data['muscle']} - {data['name']}{weight_info}")
            
            # Add a newline between muscle groups
            lines.append("")

        title = w_req.title.replace(" / ", " - ").replace("/", " - ")
        title = title.replace("Pierna (Inferior)", "Pierna").replace("Piernas", "Pierna")
        title = title.replace("Circuito", "Cardio").replace("Circuit", "Cardio")
        description = f"[GymHub]\n" + ("\n".join(lines) or f"Sesión de {title}\n(No se encontraron ejercicios previos)")
        
        try:
            date_obj = datetime.datetime.fromisoformat(w_req.date.split('T')[0])
            start_time = date_obj.replace(hour=w_req.start_hour, minute=w_req.start_minute, second=0)
            end_time = date_obj.replace(hour=w_req.end_hour, minute=w_req.end_minute, second=0)
            
            cal_service = GoogleCalendarService(user, db)
            event_id = cal_service.create_event(
                title=title, description=description, start_time=start_time, end_time=end_time,
                calendar_id=user.selected_calendar_id
            )
            created_ids.append(event_id)
        except Exception as e:
            logger.error(f"Failed to create weekly plan event {w_req.title}: {e}")

    return {"status": "Weekly plan created", "created_count": len(created_ids), "ids": created_ids}
