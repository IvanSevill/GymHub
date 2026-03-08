import datetime
import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import User, Workout, ExerciseSet
from app.schemas.workout import CreateEventTemplateRequest
from app.services.google_calendar import GoogleCalendarService
from app.services.workout_parser import WorkoutParser

router = APIRouter()
logger = logging.getLogger(__name__)

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
    user = db.query(User).filter(User.email == req.user_email).first()
    if not user: raise HTTPException(404, "User not found")
    if not user.google_access_token: raise HTTPException(400, "No Google token")
    if not user.selected_calendar_id: raise HTTPException(400, "No calendar selected")

    sets = (
        db.query(ExerciseSet)
        .join(Workout)
        .filter(Workout.user_email == req.user_email)
        .order_by(Workout.date.desc())
        .all()
    )

    seen = {}
    import unicodedata as _ud
    def _norm(t): return _ud.normalize('NFD', t).encode('ascii', 'ignore').decode().lower()
    leg_muscles_norm = ["pierna", "piernas", "gluteo", "cuadriceps", "femoral", "aductores", "gemelo", "gemelos", "isquios"]

    for s in sets:
        name = s.exercise_name.strip()
        if name not in seen:
            muscle = get_set_muscle(s, s.workout)
            matched_muscle = None
            for req_m in req.muscles:
                if _norm(muscle) == _norm(req_m):
                    matched_muscle = req_m
                    break
                if _norm(req_m) in ["pierna", "piernas"] and _norm(muscle) in leg_muscles_norm:
                    matched_muscle = req_m
                    break
            if matched_muscle:
                vals = [v for v in [s.value1, s.value2, s.value3, s.value4] if v is not None]
                weight_str = " - ".join(str(int(v) if v == int(v) else v) for v in vals)
                if s.unit and weight_str:
                    weight_str += s.unit
                seen[name] = {"muscle": muscle, "weight": weight_str, "req_muscle": matched_muscle}

    lines = []
    for muscle_req in req.muscles:
        exercises = [(n, d) for n, d in seen.items() if _norm(d["req_muscle"]) == _norm(muscle_req)]
        for name, data in exercises:
            weight_info = f" {data['weight']}" if data["weight"] else ""
            lines.append(f"{data['muscle']} - {name}{weight_info}")

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
