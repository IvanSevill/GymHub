from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class ExerciseSet(Base):
    __tablename__ = "exercise_sets"
    id = Column(Integer, primary_key=True, index=True)
    workout_id = Column(Integer, ForeignKey("workouts.id"))
    muscle_group = Column(String, nullable=True)  # e.g. "Pecho", extracted from line prefix
    exercise_name = Column(String)
    value1 = Column(Float, nullable=True)
    value2 = Column(Float, nullable=True)
    value3 = Column(Float, nullable=True)
    value4 = Column(Float, nullable=True)
    unit = Column(String, nullable=True)  # 'kg' or 'min'
    reps = Column(Integer, nullable=True, default=0)
    is_pr = Column(Integer, default=0)
    raw_text = Column(String, nullable=True)

    workout = relationship("Workout", back_populates="exercise_sets")
