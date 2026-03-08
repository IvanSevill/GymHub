from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.core.database import Base

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
