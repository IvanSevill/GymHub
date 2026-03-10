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
    unit = Column(String, nullable=True)  # 'kg', 's', 'rep', etc.
    reps = Column(Integer, nullable=True, default=0)

    workout = relationship("Workout", back_populates="exercise_sets")

    @property
    def weight_display(self) -> str:
        vals = [v for v in [self.value1, self.value2, self.value3, self.value4] if v is not None]
        s = "-".join(str(int(v) if v == int(v) else v) for v in vals)
        if self.unit and s:
            s += self.unit
        return s
