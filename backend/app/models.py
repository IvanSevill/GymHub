from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
import uuid
from .database import Base

# Helper function to generate UUIDs for primary keys
def generate_uuid():
    return str(uuid.uuid4())

class User(Base):
    """
    SQLAlchemy model for storing user information.
    Users can be authenticated via OAuth (Google) or potentially traditional email/password.
    """
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=generate_uuid) # UUID as primary key
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=True) # For potential email/password users
    picture_url = Column(String, nullable=True)
    is_root = Column(Integer, default=0) # 0 for regular user, 1 for root/admin

    tokens = relationship("UserTokens", back_populates="user", uselist=False, cascade="all, delete-orphan")
    workouts = relationship("Workout", back_populates="user", cascade="all, delete-orphan")

class UserTokens(Base):
    """
    SQLAlchemy model for storing user authentication tokens for third-party services (Google, Fitbit).
    """
    __tablename__ = "user_tokens"
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    selected_calendar_id = Column(String, nullable=True) # Google Calendar ID for syncing

    google_id = Column(String, nullable=True)
    google_access_token = Column(String, nullable=True)
    google_refresh_token = Column(String, nullable=True)
    
    fitbit_id = Column(String, nullable=True)
    fitbit_access_token = Column(String, nullable=True)
    fitbit_refresh_token = Column(String, nullable=True)

    google_calendar_sync_token = Column(String, nullable=True)

    user = relationship("User", back_populates="tokens")

class Workout(Base):
    """
    SQLAlchemy model for storing workout sessions.
    """
    __tablename__ = "workouts"
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    google_event_id = Column(String, nullable=True) # ID of the corresponding Google Calendar event
    title = Column(String, nullable=False)

    user = relationship("User", back_populates="workouts")
    exercise_sets = relationship("ExerciseSet", back_populates="workout", cascade="all, delete-orphan")
    fitbit_data = relationship("FitbitData", back_populates="workout", uselist=False, cascade="all, delete-orphan")

class Muscle(Base):
    """
    SQLAlchemy model for storing muscle groups.
    """
    __tablename__ = "muscles"
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, unique=True, nullable=False) # e.g., "pecho", "hombro"

    exercises = relationship("Exercise", back_populates="muscle", cascade="all, delete-orphan")

class Exercise(Base):
    """
    SQLAlchemy model for storing individual exercises.
    """
    __tablename__ = "exercises"
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, unique=True, nullable=False)
    muscle_id = Column(String, ForeignKey("muscles.id", ondelete="CASCADE"), nullable=False)

    muscle = relationship("Muscle", back_populates="exercises")
    sets = relationship("ExerciseSet", back_populates="exercise", cascade="all, delete-orphan")

class ExerciseSet(Base):
    """
    SQLAlchemy model for storing individual sets within an exercise during a workout.
    """
    __tablename__ = "exercise_sets"
    id = Column(String, primary_key=True, default=generate_uuid)
    workout_id = Column(String, ForeignKey("workouts.id", ondelete="CASCADE"), nullable=False)
    exercise_id = Column(String, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False)
    value = Column(String, nullable=False) # e.g., "45-40" or "45"
    measurement = Column(String, nullable=False) # e.g., "kg", "rep", "s"
    is_completed = Column(Boolean, default=False, nullable=False)

    workout = relationship("Workout", back_populates="exercise_sets")
    exercise = relationship("Exercise", back_populates="sets")

class FitbitData(Base):
    """
    SQLAlchemy model for storing Fitbit activity data associated with a workout.
    """
    __tablename__ = "fitbit_data"
    id = Column(String, primary_key=True, default=generate_uuid)
    workout_id = Column(String, ForeignKey("workouts.id", ondelete="CASCADE"), unique=True, nullable=False)
    fitbit_log_id = Column(String, nullable=True) # Fitbit's internal activity ID
    calories = Column(Integer, default=0, nullable=False)
    heart_rate_avg = Column(Integer, default=0, nullable=False)
    duration_ms = Column(Integer, default=0, nullable=False)
    distance_km = Column(Float, default=0.0, nullable=False)
    elevation_gain_m = Column(Float, default=0.0, nullable=False)
    activity_name = Column(String, nullable=True)
    azm_fat_burn = Column(Integer, default=0, nullable=False)
    azm_cardio = Column(Integer, default=0, nullable=False)
    azm_peak = Column(Integer, default=0, nullable=False)
    has_gps = Column(Boolean, default=False, nullable=False)

    workout = relationship("Workout", back_populates="fitbit_data")
