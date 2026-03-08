from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.core.database import Base

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

    user = relationship("User", back_populates="workouts")
    exercise_sets = relationship("ExerciseSet", back_populates="workout")
    fitbit_data = relationship("FitbitData", back_populates="workout", uselist=False)
