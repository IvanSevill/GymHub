import os
import datetime
import logging
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv
from pydantic import BaseModel

from models import SessionLocal, init_db, User, Workout, ExerciseSet
from parser import WorkoutParser
from google_calendar import GoogleCalendarService

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

from fastapi.middleware.cors import CORSMiddleware

# App initialization
app = FastAPI(title="GymHub Backend")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize DB on startup
@app.on_event("startup")
def startup_event():
    init_db()

# DB Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Scheduler setup
scheduler = BackgroundScheduler()

# Helper for JWT (Simplified for demo)
def create_access_token(data: dict):
    # In production, use jose library and a SECRET_KEY
    return f"token_{data['sub']}"

# --- Helpers ---

def parse_muscle_groups(title: str) -> str:
    """
    Extracts muscle group names from a workout title.
    Supports separators: '/', '-', ',', '+', 'y'
    e.g. 'Pecho / Tríceps' -> 'Pecho,Tríceps'
         'Espalda - Bíceps' -> 'Espalda,Bíceps'
    """
    import re
    parts = re.split(r'[/\-,+]|\by\b', title, flags=re.IGNORECASE)
    cleaned = [p.strip() for p in parts if p.strip()]
    return ','.join(cleaned)

# --- Pydantic Models ---
class WorkoutCreate(BaseModel):
    user_email: str
    title: str # Muscle groups
    description: str # Exercise details (text content from app or calendar)

class ExerciseSetOut(BaseModel):
    exercise_name: str
    muscle_group: Optional[str]
    value1: Optional[float]
    value2: Optional[float]
    value3: Optional[float]
    value4: Optional[float]
    unit: Optional[str]
    reps: Optional[int]
    is_pr: int

    class Config:
        from_attributes = True

class WorkoutOut(BaseModel):
    id: int
    title: str
    date: datetime.datetime
    start_time: Optional[datetime.datetime]
    end_time: Optional[datetime.datetime]
    source: str
    muscle_groups: Optional[str]   # e.g. "Pecho,Tríceps"
    exercise_sets: List[ExerciseSetOut]

    class Config:
        from_attributes = True

# --- Endpoints ---

@app.post("/auth/google/connect")
def google_connect(data: dict, db: Session = Depends(get_db)):
    """
    Exchange authorization code for tokens and get user info.
    """
    code = data.get("code")
    if not code:
        raise HTTPException(400, "Authorization code is required")
        
    try:
        from google_auth_oauthlib.flow import Flow
        from google.oauth2 import id_token
        from google.auth.transport import requests

        client_config = {
            "web": {
                "client_id": os.getenv("GOOGLE_CLIENT_ID"),
                "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": ["http://localhost", "postmessage"]
            }
        }
        
        flow = Flow.from_client_config(
            client_config,
            scopes=['openid', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.readonly'],
            redirect_uri='postmessage'
        )
        
        flow.fetch_token(code=code)
        credentials = flow.credentials
        
        # Get user info by decoding the ID token
        request = requests.Request()
        user_info = id_token.verify_oauth2_token(
            credentials.id_token, request, os.getenv("GOOGLE_CLIENT_ID")
        )
        
        email = user_info.get("email")
        if not email:
            raise HTTPException(400, "Could not get email from Google")
            
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(email=email)
            db.add(user)
            
        user.name = user_info.get("name")
        user.picture_url = user_info.get("picture")
        user.google_id = user_info.get("sub")
        # Update tokens
        user.google_access_token = credentials.token
        if credentials.refresh_token:
            user.google_refresh_token = credentials.refresh_token
            
        db.commit()
        db.refresh(user)
        
        session_token = create_access_token({"sub": user.email})
        return {"token": session_token, "user": user}
        
    except Exception as e:
        logger.error(f"Google auth error: {e}")
        raise HTTPException(400, f"Authentication failed: {str(e)}")

@app.post("/auth/google/callback")
def google_auth_mobile(data: dict, db: Session = Depends(get_db)):
    """
    Called by Android/iOS after a successful Google Sign-In native flow.
    Expects an 'id_token' and optionally 'access_token'.
    - Validates Google's id_token natively.
    - Upserts the user in our database.
    - Returns a JWT session token for the app.
    """
    id_token_str = data.get("id_token")
    if not id_token_str:
        raise HTTPException(400, "id_token is required for mobile auth")
        
    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests
        
        request = requests.Request()
        # Verify token. If you will have a specific Android/iOS Client ID later, you can pass it to verify_oauth2_token or let it verify generally
        # We pass the WEB Client ID here, but if the app sends a token generated for Android, it might be different. 
        # Typically we pass an array of acceptable CLIENT_IDs. For now, we will verify the signature via Google endpoints without strictly tying to 1 client_id
        try:
            user_info = id_token.verify_oauth2_token(
                id_token_str, request, os.getenv("GOOGLE_CLIENT_ID")
            )
        except ValueError:
            # Fallback for testing: if the user sends an ID token from a different CLIENT_ID (e.g., Android app later), 
            # verify without strictly matching the WEB Client ID
            user_info = id_token.verify_oauth2_token(id_token_str, request)
        
        email = user_info.get("email")
        if not email:
            raise HTTPException(400, "Could not get email from Google ID token")
            
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(email=email)
            db.add(user)
            
        user.name = user_info.get("name")
        user.picture_url = user_info.get("picture")
        user.google_id = user_info.get("sub")
        
        # Optionally assign an access token if mobile passed it
        access_token_str = data.get("access_token")
        if access_token_str:
            user.google_access_token = access_token_str
            
        db.commit()
        db.refresh(user)
        
        session_token = create_access_token({"sub": user.email})
        return {"token": session_token, "user": user}
    except Exception as e:
        logger.error(f"Mobile Google auth error: {e}")
        raise HTTPException(400, f"Authentication failed: {str(e)}")

@app.post("/auth/fitbit/connect")
def connect_fitbit(auth_code: str, user_email: str, db: Session = Depends(get_db)):
    """
    Exchange Fitbit auth_code for permanent access and refresh tokens.
    """
    user = db.query(User).filter(User.email == user_email).first()
    if not user: raise HTTPException(404, "User not found")
    # Call Fitbit API to exchange auth_code
    # user.fitbit_access_token = ...
    db.commit()
    return {"status": "Fitbit connected"}

@app.post("/auth/google/mock")
def mock_google_auth(user_email: str, db: Session = Depends(get_db)):
    """
    Mock Google login for development purposes.
    Sets dummy tokens and profile info to bypass authorization check.
    """
    user = db.query(User).filter(User.email == user_email).first()
    if not user:
        user = User(email=user_email, google_id=f"mock_{user_email}")
        db.add(user)
    
    user.name = "Iván J. Sevillano"  # Mock name from your Google Calendar screenshot
    user.picture_url = "https://ui-avatars.com/api/?name=Ivan+J+Sevillano&background=06b6d4&color=fff&bold=true"
    user.google_access_token = "mock_access_token"
    user.google_refresh_token = "mock_refresh_token"
    db.commit()
    db.refresh(user)
    return {"status": "Mock Google connected", "user": user}

@app.get("/users/me")
def get_me(user_email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_email).first()
    if not user: raise HTTPException(404, "User not found")
    return user

    
@app.get("/users/calendars")
def get_user_calendars(user_email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_email).first()
    if not user or not user.google_access_token:
        raise HTTPException(404, "User or Google tokens not found")
    
    cal_service = GoogleCalendarService(user, db)
    return cal_service.list_calendars()

@app.patch("/users/selected-calendar")
def update_selected_calendar(user_email: str, calendar_id: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_email).first()
    if not user: raise HTTPException(404, "User not found")
    
    user.selected_calendar_id = calendar_id
    db.commit()
    return {"status": "Calendar updated", "selected_calendar_id": calendar_id}

@app.get("/workouts", response_model=List[WorkoutOut])
def get_workouts(user_email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_email).first()
    if not user: raise HTTPException(404, "User not found")
    
    workouts = db.query(Workout).filter(Workout.user_email == user.email).order_by(Workout.date.desc()).all()
    # SQLAlchemy will include exercise_sets thanks to the relationship
    return workouts

# Muscle keyword mapping (same as frontend Analytics)
MUSCLE_KEYWORDS = {
    'Pecho':   ['pecho', 'press banca', 'press plano', 'press inclinado', 'aperturas', 'fondos'],
    'Espalda': ['espalda', 'tirón', 'dominadas', 'remo', 'peso muerto', 'jalón'],
    'Hombros': ['hombros', 'hombro', 'militar', 'laterales', 'elevaciones'],
    'Bíceps':  ['bíceps', 'biceps', 'curl'],
    'Tríceps': ['tríceps', 'triceps', 'extensiones'],
    'Piernas': ['pierna', 'sentadilla', 'squat', 'prensa', 'femoral', 'gemelo', 'zancada'],
    'Abdomen': ['abdomen', 'abdominal', 'plancha', 'crunch'],
}

def classify_exercise(name: str) -> str:
    name_lower = name.lower()
    for muscle, keywords in MUSCLE_KEYWORDS.items():
        if any(k in name_lower for k in keywords):
            return muscle
    return 'Otros'

@app.get("/workouts/exercises-by-muscle")
def get_exercises_by_muscle(user_email: str, db: Session = Depends(get_db)):
    """
    Returns the user's unique exercises classified by muscle group,
    with representative weights from their most recent session.
    """
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
            seen[name] = {"name": name, "muscle": classify_exercise(name), "last_weight": weight_str or None}

    result = {}
    for ex in seen.values():
        muscle = ex["muscle"]
        if muscle not in result:
            result[muscle] = []
        result[muscle].append({"name": ex["name"], "last_weight": ex["last_weight"]})

    return result

class CreateEventTemplateRequest(BaseModel):
    user_email: str
    title: str
    muscles: List[str]
    date: str
    start_hour: int
    start_minute: int
    end_hour: int
    end_minute: int

@app.post("/calendar/create-template")
def create_event_template(req: CreateEventTemplateRequest, db: Session = Depends(get_db)):
    """
    Creates a Google Calendar event with exercises for the selected muscles.
    Description is written WITHOUT the tick emoji so the user marks them after training.
    """
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
    for s in sets:
        name = s.exercise_name.strip()
        if name not in seen:
            muscle = classify_exercise(name)
            if muscle in req.muscles:
                vals = [v for v in [s.value1, s.value2, s.value3, s.value4] if v is not None]
                weight_str = " - ".join(str(int(v) if v == int(v) else v) for v in vals)
                if s.unit and weight_str:
                    weight_str += s.unit
                seen[name] = {"muscle": muscle, "weight": weight_str}

    # Build flat description: one line per exercise, format: "Músculo - Ejercicio (Xkg)"
    lines = []
    for muscle in req.muscles:
        exercises = [(n, d) for n, d in seen.items() if d["muscle"] == muscle]
        for name, data in exercises:
            weight_info = f" ({data['weight']})" if data["weight"] else ""
            lines.append(f"{muscle} - {name}{weight_info}")

    description = "\n".join(lines)
    if not description:
        raise HTTPException(400, "No exercises found for selected muscle groups")

    # Title uses ' - ' separator (no /, no emojis)
    title = " - ".join(req.muscles)

    try:
        date_obj = datetime.datetime.fromisoformat(req.date)
        start_time = date_obj.replace(hour=req.start_hour, minute=req.start_minute, second=0, microsecond=0)
        end_time = date_obj.replace(hour=req.end_hour, minute=req.end_minute, second=0, microsecond=0)
        if end_time <= start_time:
            raise HTTPException(400, "La hora de fin debe ser posterior a la de inicio")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "Formato de fecha/hora inválido")

    try:
        cal_service = GoogleCalendarService(user, db)
        event_id = cal_service.create_event(
            title=title,
            description=description,
            start_time=start_time,
            end_time=end_time,
            calendar_id=user.selected_calendar_id
        )
        return {"status": "Event created", "event_id": event_id, "description": description}
    except Exception as e:
        logger.error(f"Failed to create template event: {e}")
        raise HTTPException(500, f"Failed to create event: {str(e)}")


@app.post("/workouts", response_model=WorkoutOut)
def create_workout(workout_in: WorkoutCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == workout_in.user_email).first()
    if not user: raise HTTPException(404, "User not found")

    # 1. Save Workout to DB
    new_workout = Workout(
        user_email=user.email,
        title=workout_in.title,
        muscle_groups=parse_muscle_groups(workout_in.title),
        source="app"
    )
    db.add(new_workout)
    db.commit()
    db.refresh(new_workout)

    # 2. Extract exercise sets from description and save them
    exercises = WorkoutParser.parse_description(workout_in.description)
    for ex in exercises:
        ex_set = ExerciseSet(workout_id=new_workout.id, **ex)
        db.add(ex_set)

    # 3. Create Event in Google Calendar
    try:
        if user.google_access_token:
            if not user.selected_calendar_id:
                raise Exception("No calendar selected")
            cal_id = user.selected_calendar_id
            event_id = cal_service.create_event(
                title=new_workout.title,
                description=workout_in.description,
                start_time=new_workout.date,
                calendar_id=cal_id
            )
            new_workout.google_event_id = event_id
    except Exception as e:
        logger.error(f"Failed to create Google Calendar event: {e}")
        # We still continue since local DB is saved
        new_workout.google_event_id = f"error_{new_workout.id}"

    db.commit()
    db.refresh(new_workout)

    return new_workout

@app.patch("/workouts/{workout_id}", response_model=WorkoutOut)
def update_workout(workout_id: int, workout_in: WorkoutCreate, db: Session = Depends(get_db)):
    workout = db.query(Workout).filter(Workout.id == workout_id).first()
    if not workout: raise HTTPException(404, "Workout not found")

    # Update title
    workout.title = workout_in.title
    
    # Refresh exercise sets
    db.query(ExerciseSet).filter(ExerciseSet.workout_id == workout_id).delete()
    exercises = WorkoutParser.parse_description(workout_in.description)
    for ex in exercises:
        ex_set = ExerciseSet(workout_id=workout.id, **ex)
        db.add(ex_set)
    
    db.commit()
    db.refresh(workout)
    return workout

# --- Sync Logic ---

def update_exercises_from_text(workout: Workout, text: str, db: Session):
    """
    Parses text into exercises and replaces existing sets for a workout.
    """
    db.query(ExerciseSet).filter(ExerciseSet.workout_id == workout.id).delete()
    exercises = WorkoutParser.parse_description(text)
    for ex in exercises:
        ex_set = ExerciseSet(workout_id=workout.id, **ex)
        db.add(ex_set)
    db.commit()

def sync_data_for_user(user: User, db: Session):
    """
    Bidirectional Sync:
    - Fetches Calendar events (Mocked).
    - If event ID matches an existing Workout, update local data.
    - If event is NEW, create local Workout.
    """
    logger.info(f"Syncing data for user: {user.email}")
    if not user.google_access_token:
        logger.warning(f"User {user.email} has no Google token. Skipping sync.")
        return
    if not user.selected_calendar_id:
        logger.warning(f"User {user.email} has no selected calendar. Skipping sync.")
        return

    try:
        cal_service = GoogleCalendarService(user, db)
        cal_id = user.selected_calendar_id
        # Pull full year of history
        recent_events = cal_service.get_recent_events(days=365, calendar_id=cal_id)

        for event in recent_events:
            event_id = event.get('id')
            title = event.get('summary', 'Sin Título')
            description = event.get('description', '') or ''

            # Skip events with no workout data (birthdays, reminders, etc.)
            if '\u2705' not in description:
                continue

            # Check if we already have this workout
            workout = db.query(Workout).filter(Workout.google_event_id == event_id).first()

            if workout:
                # Update existing workout if changed
                if workout.title != title:
                    workout.title = title
                    db.commit()
                update_exercises_from_text(workout, description, db)
            else:
                # Create new workout from calendar event
                start_time_str = event['start'].get('dateTime', event['start'].get('date'))
                if 'T' in start_time_str:
                    start_time = datetime.datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
                else:
                    start_time = datetime.datetime.fromisoformat(start_time_str)

                end_time_str = event.get('end', {}).get('dateTime', event.get('end', {}).get('date'))
                end_time = None
                if end_time_str:
                    if 'T' in end_time_str:
                        end_time = datetime.datetime.fromisoformat(end_time_str.replace('Z', '+00:00'))
                    else:
                        end_time = datetime.datetime.fromisoformat(end_time_str)

                new_workout = Workout(
                    user_email=user.email,
                    title=title,
                    muscle_groups=parse_muscle_groups(title),
                    date=start_time,
                    start_time=start_time,
                    end_time=end_time,
                    source="calendar",
                    google_event_id=event_id
                )
                db.add(new_workout)
                db.commit()
                db.refresh(new_workout)

                update_exercises_from_text(new_workout, description, db)

    except Exception as e:
        logger.error(f"Sync failed for {user.email}: {e}")

@app.get("/health")
def health_check():
    return {"status": "healthy", "timestamp": datetime.datetime.now()}

@app.get("/users")
def list_users(db: Session = Depends(get_db)):
    return db.query(User).all()

@app.post("/sync/manual")
def manual_sync(user_email: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Explicitly trigger sync for a user from the mobile app.
    """
    if not user_email:
        # For demo purposes, we'll sync the first user if none provided
        user = db.query(User).first()
        if not user:
            return {"status": "No users to sync", "user_email": None}
    else:
        user = db.query(User).filter(User.email == user_email).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
    
    sync_data_for_user(user, db)
    return {"status": "Sync completed", "user_email": user.email}

@app.post("/users/register")
def register_user(email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user

if __name__ == "__main__":
    import uvicorn
    host = os.getenv("BACKEND_HOST", "0.0.0.0")
    port = int(os.getenv("BACKEND_PORT", 8000))
    logger.info(f"Starting backend on {host}:{port}")
    uvicorn.run(app, host=host, port=port)
