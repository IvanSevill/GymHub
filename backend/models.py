from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker
from datetime import datetime, timezone
import os
from dotenv import load_dotenv

load_dotenv()

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String, nullable=True) # Optional if using Google Login exclusively
    
    # Google OAuth data
    google_id = Column(String, unique=True, index=True, nullable=True)
    google_access_token = Column(String, nullable=True)
    google_refresh_token = Column(String, nullable=True)
    selected_calendar_id = Column(String, nullable=True)
    
    name = Column(String, nullable=True)
    picture_url = Column(String, nullable=True)

    
    # Fitbit OAuth data
    fitbit_id = Column(String, unique=True, index=True, nullable=True)
    fitbit_access_token = Column(String, nullable=True)
    fitbit_refresh_token = Column(String, nullable=True)
    
    workouts = relationship("Workout", back_populates="user")

class Workout(Base):
    __tablename__ = "workouts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    date = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    source = Column(String, default="app")  # "app" or "calendar"
    google_event_id = Column(String, unique=True, index=True, nullable=True)
    title = Column(String) # Muscle Groups (e.g., "Pecho/Tríceps")
    
    calories = Column(Integer, nullable=True)
    heart_rate_avg = Column(Integer, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    
    user = relationship("User", back_populates="workouts")
    exercise_sets = relationship("ExerciseSet", back_populates="workout")

class ExerciseSet(Base):
    __tablename__ = "exercise_sets"
    id = Column(Integer, primary_key=True, index=True)
    workout_id = Column(Integer, ForeignKey("workouts.id"))
    exercise_name = Column(String)
    weight_kg = Column(Float)
    reps = Column(Integer, nullable=True, default=0)
    is_pr = Column(Integer, default=0) # 1 if it's a PR
    raw_text = Column(String, nullable=True)

    workout = relationship("Workout", back_populates="exercise_sets")

# Database setup
db_url = os.getenv("DB_URL")
if not db_url:
    db_url = "sqlite:///./gymhub.db"

# Handle SQLite vs Postgres connection args
connect_args = {"check_same_thread": False} if "sqlite" in db_url else {}

engine = create_engine(db_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)
