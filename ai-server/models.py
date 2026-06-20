import uuid

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from database import Base


def _uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    is_root = Column(Integer, default=0)
    height_cm = Column(Float, nullable=True)


class Workout(Base):
    __tablename__ = "workouts"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    title = Column(String, nullable=False)

    exercise_sets = relationship("ExerciseSet", back_populates="workout")
    fitbit_data = relationship("FitbitData", back_populates="workout", uselist=False)


class Muscle(Base):
    __tablename__ = "muscles"
    id = Column(String, primary_key=True, default=_uuid)
    name = Column(String, unique=True, nullable=False)

    exercises = relationship("Exercise", back_populates="muscle")


class Exercise(Base):
    __tablename__ = "exercises"
    id = Column(String, primary_key=True, default=_uuid)
    name = Column(String, unique=True, nullable=False)
    muscle_id = Column(String, ForeignKey("muscles.id", ondelete="CASCADE"), nullable=False)

    muscle = relationship("Muscle", back_populates="exercises")
    sets = relationship("ExerciseSet", back_populates="exercise")


class ExerciseSet(Base):
    __tablename__ = "exercise_sets"
    id = Column(String, primary_key=True, default=_uuid)
    workout_id = Column(String, ForeignKey("workouts.id", ondelete="CASCADE"), nullable=False)
    exercise_id = Column(String, ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False)
    value = Column(String, nullable=False)
    measurement = Column(String, nullable=False)
    is_completed = Column(Boolean, default=False, nullable=False)

    workout = relationship("Workout", back_populates="exercise_sets")
    exercise = relationship("Exercise", back_populates="sets")


class FitbitData(Base):
    __tablename__ = "fitbit_data"
    id = Column(String, primary_key=True, default=_uuid)
    workout_id = Column(String, ForeignKey("workouts.id", ondelete="CASCADE"), unique=True, nullable=False)
    calories = Column(Integer, default=0, nullable=False)
    heart_rate_avg = Column(Integer, default=0, nullable=False)
    duration_ms = Column(Integer, default=0, nullable=False)
    distance_km = Column(Float, default=0.0, nullable=False)
    activity_name = Column(String, nullable=True)
    azm_fat_burn = Column(Integer, default=0, nullable=False)
    azm_cardio = Column(Integer, default=0, nullable=False)
    azm_peak = Column(Integer, default=0, nullable=False)

    workout = relationship("Workout", back_populates="fitbit_data")


class DailyHealth(Base):
    __tablename__ = "daily_health"
    id = Column(String, primary_key=True, default=_uuid)
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


class SleepLog(Base):
    __tablename__ = "sleep_logs"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    date = Column(String, nullable=False)
    duration_ms = Column(Integer, default=0, nullable=False)
    efficiency = Column(Integer, default=0, nullable=False)
    minutes_deep = Column(Integer, default=0, nullable=False)
    minutes_light = Column(Integer, default=0, nullable=False)
    minutes_rem = Column(Integer, default=0, nullable=False)
    minutes_wake = Column(Integer, default=0, nullable=False)
    is_main_sleep = Column(Boolean, default=True, nullable=False)


# ---------------------------------------------------------------------------
# Chat history — flat table with timestamps
# ---------------------------------------------------------------------------

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String, nullable=False)
    content = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False)
    __table_args__ = (Index("ix_chat_messages_user_created", "user_id", "created_at"),)


class ChatUsage(Base):
    """Append-only log of user message timestamps for rate limiting.

    Decoupled from ChatMessage on purpose: clearing the visible chat history
    (delete_history) must not reset the user's message allowance, so the
    rate-limit counters read from this table instead of from ChatMessage.
    """
    __tablename__ = "chat_usage"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, nullable=False)
    __table_args__ = (Index("ix_chat_usage_user_created", "user_id", "created_at"),)


class ChatMemory(Base):
    __tablename__ = "chat_memories"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    key = Column(String, nullable=False)
    value = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)


class WeightLog(Base):
    __tablename__ = "weight_logs"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(String, nullable=False)
    weight_kg = Column(Float, nullable=False)
    body_fat_pct = Column(Float, nullable=True)
    created_at = Column(DateTime, nullable=True)
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_weight_log_user_date"),)
