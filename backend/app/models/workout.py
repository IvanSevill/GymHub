from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from typing import List, Optional
from app.core.database import Base

class Workout(Base):
    __tablename__ = "workouts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    date = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    source = Column(String, default="app")  # "app" or "calendar"
    google_event_id = Column(String, unique=True, index=True, nullable=True)
    title = Column(String)  # e.g. "Pecho / Tríceps"

    user = relationship("User", back_populates="workouts")
    exercise_sets = relationship("ExerciseSet", back_populates="workout")
    fitbit_data = relationship("FitbitData", back_populates="workout", uselist=False)

    @property
    def muscles(self):
        """Dynamic retrieval of muscles worked in this workout"""
        muscle_list = []
        seen = set()
        for es in self.exercise_sets:
            if es.exercise:
                for m in es.exercise.muscles:
                    if m.id not in seen:
                        muscle_list.append(m)
                        seen.add(m.id)
        return muscle_list
    
    @property
    def muscle_groups(self) -> str:
        """Helper to return a comma-separated string of muscle names for legacy frontend support"""
        return ", ".join([m.name for m in self.muscles])

class Muscle(Base):
    __tablename__ = "muscles"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
