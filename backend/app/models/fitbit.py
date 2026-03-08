from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class FitbitData(Base):
    __tablename__ = "fitbit_data"
    id = Column(Integer, primary_key=True, index=True)
    workout_id = Column(Integer, ForeignKey("workouts.id"), unique=True, index=True)
    fitbit_log_id = Column(String, nullable=True, index=True)  # Fitbit's own logId

    # Core metrics
    calories = Column(Integer, nullable=True)
    heart_rate_avg = Column(Integer, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    steps = Column(Integer, nullable=True)

    # Extended metrics from real API
    distance_km = Column(Float, nullable=True)
    elevation_gain_m = Column(Float, nullable=True)
    activity_name = Column(String, nullable=True)        # "Walk", "Sport", "Workout", etc.

    # Active Zone Minutes breakdown
    azm_fat_burn = Column(Integer, nullable=True)
    azm_cardio = Column(Integer, nullable=True)
    azm_peak = Column(Integer, nullable=True)

    workout = relationship("Workout", back_populates="fitbit_data")
