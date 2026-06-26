from datetime import datetime

from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Boolean, Text, UniqueConstraint, Index
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
    height_cm = Column(Float, nullable=True)

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
    video_url_1 = Column(String, nullable=True)
    video_url_2 = Column(String, nullable=True)
    image_url = Column(String, nullable=True)

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
    value = Column(String, nullable=False)  # single weight per set, e.g. "45" or "42.5"
    measurement = Column(String, nullable=False) # e.g., "kg", "rep", "s"
    is_completed = Column(Boolean, default=False, nullable=False)

    workout = relationship("Workout", back_populates="exercise_sets")
    exercise = relationship("Exercise", back_populates="sets")

class SleepLog(Base):
    """Fitbit sleep session for a user, synced daily."""
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


class DailyHealth(Base):
    """Fitbit daily activity summary (steps, HR, calories, active minutes)."""
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


class ExerciseRequest(Base):
    """Pending request from a non-root user to add an exercise or a muscle group."""
    __tablename__ = "exercise_requests"

    id = Column(String, primary_key=True, default=generate_uuid)
    type = Column(String, nullable=False)  # "exercise" | "muscle_with_exercise"
    exercise_name = Column(String, nullable=False)
    muscle_id = Column(String, ForeignKey("muscles.id", ondelete="SET NULL"), nullable=True)
    muscle_name = Column(String, nullable=True)
    status = Column(String, default="pending")  # "pending" | "approved" | "rejected"
    rejection_reason = Column(String, nullable=True)
    exercise_id = Column(String, ForeignKey("exercises.id", ondelete="SET NULL"), nullable=True)
    requested_by_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reviewed_by_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)

    requested_by = relationship("User", foreign_keys=[requested_by_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])
    muscle = relationship("Muscle", foreign_keys=[muscle_id])


class WeightLog(Base):
    """Manual daily weight and body fat % log for a user."""
    __tablename__ = "weight_logs"
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(String, nullable=False)      # YYYY-MM-DD
    weight_kg = Column(Float, nullable=False)
    body_fat_pct = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_weight_log_user_date"),)


class UserFeedback(Base):
    """Feedback submitted by non-root users, visible to root admins."""
    __tablename__ = "user_feedback"
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    message = Column(Text, nullable=False)
    rating = Column(Integer, nullable=True)    # 1–5, optional
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")


# ---------------------------------------------------------------------------
# AI assistant (GymChat) — persistence owned by the backend so the AI server
# never touches the database directly; it reaches these through the REST API.
# ---------------------------------------------------------------------------

class ChatMessage(Base):
    """Flat AI-chat history: one row per message, ordered by timestamp."""
    __tablename__ = "chat_messages"
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String, nullable=False)
    content = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    __table_args__ = (Index("ix_chat_messages_user_created", "user_id", "created_at"),)


class ChatUsage(Base):
    """Append-only log of user message timestamps for AI-chat rate limiting.

    Decoupled from ChatMessage on purpose: clearing the visible chat history
    must not reset the user's message allowance.
    """
    __tablename__ = "chat_usage"
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    # First message of the rate-limit window this row belongs to. The window is
    # anchored at its first message and resets exactly RATE_LIMIT_HOURS later,
    # so every message in the same burst shares one window_start. Nullable for
    # rows created before this column existed (treated as an elapsed window).
    window_start = Column(DateTime, nullable=True)
    __table_args__ = (Index("ix_chat_usage_user_created", "user_id", "created_at"),)


class ChatMemory(Base):
    """Persistent facts the AI assistant has saved about a user (upsert by key)."""
    __tablename__ = "chat_memories"
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    key = Column(String, nullable=False)
    value = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
