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
    db = SessionLocal()
    # Seed data for demo purposes
    if not db.query(User).filter(User.email == "test@gymhub.app").first():
        user = User(email="test@gymhub.app", google_id="mock_google_id")
        db.add(user)
        db.commit()
        db.refresh(user)
        
        # Add a mock workout
        now = datetime.now(timezone.utc)
        workout = Workout(user_id=user.id, title="Pecho / Tríceps", date=now, source="app")
        db.add(workout)
        db.commit()
        db.refresh(workout)
        
        # Add some exercises
        exercises = [
            {"exercise_name": "Press de Banca", "weight_kg": 60.0, "is_pr": 1, "raw_text": "✅ Press de Banca (60kg)"},
            {"exercise_name": "Press Militar", "weight_kg": 40.0, "is_pr": 0, "raw_text": "✅ Press Militar (40kg)"}
        ]
        for ex in exercises:
            db.add(ExerciseSet(workout_id=workout.id, **ex))
        db.commit()
    db.close()

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

# --- Pydantic Models ---
class WorkoutCreate(BaseModel):
    user_email: str
    title: str # Muscle groups
    description: str # Exercise details (text content from app or calendar)

class ExerciseSetOut(BaseModel):
    exercise_name: str
    weight_kg: float
    reps: Optional[int]
    is_pr: int
    
    class Config:
        from_attributes = True

class WorkoutOut(BaseModel):
    id: int
    title: str
    date: datetime.datetime
    source: str
    exercise_sets: List[ExerciseSetOut]
    
    class Config:
        from_attributes = True

# --- Endpoints ---

@app.post("/auth/google/callback")
def google_auth(id_token: str, db: Session = Depends(get_db)):
    """
    Called by Android after a successful Google Sign-In.
    - Decodes Google's id_token
    - Upserts the user in our database
    - Returns a JWT session token for the app
    """
    # Mock behavior for identification:
    email = f"user_{id_token[:5]}@gmail.com"
    google_id = id_token
    
    user = db.query(User).filter(User.google_id == google_id).first()
    if not user:
        user = User(email=email, google_id=google_id)
        db.add(user)
        db.commit()
        db.refresh(user)
        
    session_token = create_access_token({"sub": user.email})
    return {"token": session_token, "user": user}

@app.post("/auth/fitbit/connect")
def connect_fitbit(auth_code: str, user_id: int, db: Session = Depends(get_db)):
    """
    Exchange Fitbit auth_code for permanent access and refresh tokens.
    """
    user = db.query(User).filter(User.id == user_id).first()
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
    
    workouts = db.query(Workout).filter(Workout.user_id == user.id).order_by(Workout.date.desc()).all()
    # SQLAlchemy will include exercise_sets thanks to the relationship
    return workouts

@app.post("/workouts", response_model=WorkoutOut)
def create_workout(workout_in: WorkoutCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == workout_in.user_email).first()
    if not user: raise HTTPException(404, "User not found")

    # 1. Save Workout to DB
    new_workout = Workout(
        user_id=user.id,
        title=workout_in.title,
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
            cal_service = GoogleCalendarService(user, db)
            cal_id = user.selected_calendar_id or 'primary'
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

    try:
        cal_service = GoogleCalendarService(user, db)
        cal_id = user.selected_calendar_id or 'primary'
        recent_events = cal_service.get_recent_events(days=7, calendar_id=cal_id)

        for event in recent_events:
            event_id = event.get('id')
            title = event.get('summary', 'Sin Título')
            description = event.get('description', '')
            
            # Check if we already have this workout
            workout = db.query(Workout).filter(Workout.google_event_id == event_id).first()
            
            if workout:
                # Update existing workout if description changed
                if workout.title != title:
                    workout.title = title
                    db.commit()
                # We could also check description hash to avoid unnecessary parsing
                update_exercises_from_text(workout, description, db)
            else:
                # Create new workout from calendar
                start_time_str = event['start'].get('dateTime', event['start'].get('date'))
                # Handle '2023-10-27T10:00:00Z' or '2023-10-27'
                if 'T' in start_time_str:
                    start_time = datetime.datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
                else:
                    start_time = datetime.datetime.fromisoformat(start_time_str)

                new_workout = Workout(
                    user_id=user.id,
                    title=title,
                    date=start_time,
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
