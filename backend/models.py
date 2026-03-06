from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker
from datetime import datetime, timezone
import os
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    email = Column(String, primary_key=True, index=True)
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
    user_email = Column(String, ForeignKey("users.email"))
    date = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    source = Column(String, default="app")  # "app" or "calendar"
    google_event_id = Column(String, unique=True, index=True, nullable=True)
    title = Column(String)  # e.g. "Pecho / Tríceps"
    # Comma-separated muscle groups extracted from title, e.g. "Pecho,Tríceps"
    muscle_groups = Column(String, nullable=True)

    calories = Column(Integer, nullable=True)
    heart_rate_avg = Column(Integer, nullable=True)
    duration_ms = Column(Integer, nullable=True)

    user = relationship("User", back_populates="workouts")
    exercise_sets = relationship("ExerciseSet", back_populates="workout")


class ExerciseSet(Base):
    __tablename__ = "exercise_sets"
    id = Column(Integer, primary_key=True, index=True)
    workout_id = Column(Integer, ForeignKey("workouts.id"))
    muscle_group = Column(String, nullable=True)  # e.g. "Pecho", extracted from line prefix
    exercise_name = Column(String)
    value1 = Column(Float, nullable=True)
    value2 = Column(Float, nullable=True)
    value3 = Column(Float, nullable=True)
    value4 = Column(Float, nullable=True)
    unit = Column(String, nullable=True)  # 'kg' or 'min'
    reps = Column(Integer, nullable=True, default=0)
    is_pr = Column(Integer, default=0)
    raw_text = Column(String, nullable=True)

    workout = relationship("Workout", back_populates="exercise_sets")

# Database setup
db_url = os.getenv("DB_URL")
if not db_url:
    db_url = "sqlite:///./gymhub.db"

if db_url and db_url.startswith("sqlite:///./"):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    db_name = db_url.split("sqlite:///./")[1]
    db_path = os.path.join(base_dir, db_name)
    db_url = f"sqlite:///{db_path}"

# Handle SQLite vs Postgres connection args
connect_args = {"check_same_thread": False} if "sqlite" in db_url else {}

engine = create_engine(db_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)
