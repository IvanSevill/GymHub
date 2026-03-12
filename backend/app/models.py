from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
import uuid
from .database import Base

def generate_uuid():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=generate_uuid)
    email = Column(String, unique=True, index=True)
    name = Column(String)
    hashed_password = Column(String, nullable=True) # Optional for OAuth users
    picture_url = Column(String, nullable=True)
    is_root = Column(Integer, default=0)

    tokens = relationship("UserTokens", back_populates="user", uselist=False)
    workouts = relationship("Workout", back_populates="user")

class UserTokens(Base):
    __tablename__ = "user_tokens"
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"))
    selected_calendar_id = Column(String, nullable=True)
    google_id = Column(String, nullable=True)
    google_access_token = Column(String, nullable=True)
    google_refresh_token = Column(String, nullable=True)
    fitbit_id = Column(String, nullable=True)
    fitbit_access_token = Column(String, nullable=True)
    fitbit_refresh_token = Column(String, nullable=True)

    user = relationship("User", back_populates="tokens")

class Workout(Base):
    __tablename__ = "workouts"
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"))
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    google_event_id = Column(String, nullable=True)
    title = Column(String)

    user = relationship("User", back_populates="workouts")
    exercise_sets = relationship("ExerciseSet", back_populates="workout", cascade="all, delete-orphan")
    fitbit_data = relationship("FitbitData", back_populates="workout", uselist=False, cascade="all, delete-orphan")

class Muscle(Base):
    __tablename__ = "muscles"
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, unique=True) # e.g., "pecho", "hombro"

    exercises = relationship("Exercise", back_populates="muscle")

class Exercise(Base):
    __tablename__ = "exercises"
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, unique=True)
    muscle_id = Column(String, ForeignKey("muscles.id"))

    muscle = relationship("Muscle", back_populates="exercises")
    sets = relationship("ExerciseSet", back_populates="exercise")

class ExerciseSet(Base):
    __tablename__ = "exercise_sets"
    id = Column(String, primary_key=True, default=generate_uuid)
    workout_id = Column(String, ForeignKey("workouts.id"))
    exercise_id = Column(String, ForeignKey("exercises.id"))
    value = Column(String) # e.g., "45-40" or "45"
    measurement = Column(String) # e.g., "kg", "rep", "s"
    is_completed = Column(Boolean, default=False)

    workout = relationship("Workout", back_populates="exercise_sets")
    exercise = relationship("Exercise", back_populates="sets")

class FitbitData(Base):
    __tablename__ = "fitbit_data"
    id = Column(String, primary_key=True, default=generate_uuid)
    workout_id = Column(String, ForeignKey("workouts.id"))
    fitbit_log_id = Column(String, nullable=True)
    calories = Column(Integer)
    heart_rate_avg = Column(Integer)
    duration_ms = Column(Integer)
    distance_km = Column(Float)
    elevation_gain_m = Column(Float)
    activity_name = Column(String)
    azm_fat_burn = Column(Integer)
    azm_cardio = Column(Integer)
    azm_peak = Column(Integer)

    workout = relationship("Workout", back_populates="fitbit_data")
