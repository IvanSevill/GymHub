"""ORM models — read-only copies of the backend models needed for MCP queries."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from database import Base


def generate_uuid():
    return str(uuid.uuid4())


class User(Base):
    """Registered user."""

    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=True)
    picture_url = Column(String, nullable=True)
    is_root = Column(Integer, default=0)
    height_cm = Column(Float, nullable=True)

    workouts = relationship("Workout", back_populates="user")


class Workout(Base):
    """A workout session."""

    __tablename__ = "workouts"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    google_event_id = Column(String, nullable=True)
    title = Column(String, nullable=False)

    user = relationship("User", back_populates="workouts")
    exercise_sets = relationship("ExerciseSet", back_populates="workout")
    fitbit_data = relationship("FitbitData", back_populates="workout", uselist=False)


class Muscle(Base):
    """Muscle group."""

    __tablename__ = "muscles"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, unique=True, nullable=False)

    exercises = relationship("Exercise", back_populates="muscle")


class Exercise(Base):
    """Individual exercise definition."""

    __tablename__ = "exercises"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, unique=True, nullable=False)
    muscle_id = Column(String, ForeignKey("muscles.id", ondelete="CASCADE"), nullable=False)
    video_url_1 = Column(String, nullable=True)
    video_url_2 = Column(String, nullable=True)
    image_url = Column(String, nullable=True)

    muscle = relationship("Muscle", back_populates="exercises")
    sets = relationship("ExerciseSet", back_populates="exercise")


class ExerciseSet(Base):
    """A single set within a workout."""

    __tablename__ = "exercise_sets"

    id = Column(String, primary_key=True, default=generate_uuid)
    workout_id = Column(String, ForeignKey("workouts.id", ondelete="CASCADE"), nullable=False)
    exercise_id = Column(String, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False)
    value = Column(String, nullable=False)
    measurement = Column(String, nullable=False)
    is_completed = Column(Boolean, default=False, nullable=False)

    workout = relationship("Workout", back_populates="exercise_sets")
    exercise = relationship("Exercise", back_populates="sets")


class FitbitData(Base):
    """Fitbit activity data linked to a workout."""

    __tablename__ = "fitbit_data"

    id = Column(String, primary_key=True, default=generate_uuid)
    workout_id = Column(
        String, ForeignKey("workouts.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    fitbit_log_id = Column(String, nullable=True)
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


class DailyHealth(Base):
    """Fitbit daily activity summary."""

    __tablename__ = "daily_health"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    date = Column(String, nullable=False)
    steps = Column(Integer, default=0, nullable=False)
    floors = Column(Integer, default=0, nullable=False)
    resting_heart_rate = Column(Integer, default=0, nullable=False)
    calories_out = Column(Integer, default=0, nullable=False)
    minutes_sedentary = Column(Integer, default=0, nullable=False)
    minutes_lightly_active = Column(Integer, default=0, nullable=False)
    minutes_fairly_active = Column(Integer, default=0, nullable=False)
    minutes_very_active = Column(Integer, default=0, nullable=False)
    distance_km = Column(Float, default=0.0, nullable=False)

    user = relationship("User")


class SleepLog(Base):
    """Fitbit sleep session."""

    __tablename__ = "sleep_logs"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    fitbit_log_id = Column(String, nullable=True, unique=True)
    date = Column(String, nullable=False)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    duration_ms = Column(Integer, default=0, nullable=False)
    efficiency = Column(Integer, default=0, nullable=False)
    minutes_asleep = Column(Integer, default=0, nullable=False)
    minutes_awake = Column(Integer, default=0, nullable=False)
    minutes_to_fall_asleep = Column(Integer, default=0, nullable=False)
    time_in_bed = Column(Integer, default=0, nullable=False)
    minutes_deep = Column(Integer, default=0, nullable=False)
    minutes_light = Column(Integer, default=0, nullable=False)
    minutes_rem = Column(Integer, default=0, nullable=False)
    minutes_wake = Column(Integer, default=0, nullable=False)
    is_main_sleep = Column(Boolean, default=True, nullable=False)
    log_type = Column(String, nullable=True)

    user = relationship("User")


class WeightLog(Base):
    """Manual daily weight and body fat % entry."""

    __tablename__ = "weight_logs"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(String, nullable=False)
    weight_kg = Column(Float, nullable=False)
    body_fat_pct = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_weight_log_user_date"),)


# Suppress unused import warning — datetime is used via Column(DateTime, default=datetime.utcnow)
_ = datetime
