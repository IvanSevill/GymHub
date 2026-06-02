import uuid

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
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
# Chat history — ring buffer (10 slots per user)
# ---------------------------------------------------------------------------

class ChatEntry(Base):
    """One slot in the per-user circular message buffer."""
    __tablename__ = "chat_entries"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    slot = Column(Integer, nullable=False)          # 0 .. BUFFER_SIZE-1
    role = Column(String, nullable=False)           # "user" | "assistant"
    content = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False)
    __table_args__ = (UniqueConstraint("user_id", "slot", name="uq_chat_entry_slot"),)


class ChatCursor(Base):
    """Write-pointer and total-count for the ring buffer."""
    __tablename__ = "chat_cursors"
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    next_slot = Column(Integer, default=0, nullable=False)      # slot to write next
    total_written = Column(Integer, default=0, nullable=False)  # ever-incrementing count
