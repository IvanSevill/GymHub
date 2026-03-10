from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class Exercise(Base):
    __tablename__ = "exercises"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    
    # N:M with Muscles
    muscles = relationship("Muscle", secondary="ejercicio_musculo", backref="exercises")

class ExerciseMuscle(Base):
    __tablename__ = "ejercicio_musculo"
    exercise_id = Column(Integer, ForeignKey("exercises.id"), primary_key=True)
    muscle_id = Column(Integer, ForeignKey("muscles.id"), primary_key=True)

class ExerciseSet(Base):
    __tablename__ = "exercise_sets"
    id = Column(Integer, primary_key=True, index=True)
    workout_id = Column(Integer, ForeignKey("workouts.id"))
    exercise_id = Column(Integer, ForeignKey("exercises.id"), nullable=True) # 3NF Link
    
    number1 = Column(Float, nullable=True)
    number2 = Column(Float, nullable=True)
    number3 = Column(Float, nullable=True)
    number4 = Column(Float, nullable=True)
    measurement = Column(String, nullable=True)  # 'kg', 's', 'rep', etc.

    workout = relationship("Workout", back_populates="exercise_sets")
    exercise = relationship("Exercise")

    @property
    def exercise_name(self) -> str:
        return self.exercise.name if self.exercise else "Desconocido"

    @property
    def muscle_group(self) -> str:
        if self.exercise and self.exercise.muscles and len(self.exercise.muscles) > 0:
            return self.exercise.muscles[0].name
        return "Otros"

    @property
    def weight_display(self) -> str:
        vals = [v for v in [self.number1, self.number2, self.number3, self.number4] if v is not None]
        s = "-".join(str(int(v) if v == int(v) else v) for v in vals)
        if self.measurement and s:
            s += self.measurement
        return s
