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
    
    # 3NF Relation: EntrenamientoMusculo
    muscles = relationship("Muscle", secondary="entrenamiento_musculo", backref="workouts")

    def sync_muscles_3nf(self, db):
        from sqlalchemy import select
        if not self.muscle_groups:
            self.muscles = []
            return
        
        muscle_names = [m.strip() for m in self.muscle_groups.split(',') if m.strip()]
        new_muscles = []
        for name in muscle_names:
            muscle = db.query(Muscle).filter(Muscle.name == name).first()
            if not muscle:
                muscle = Muscle(name=name)
                db.add(muscle)
                db.flush() # Ensure ID is generated
            new_muscles.append(muscle)
        self.muscles = new_muscles

class Muscle(Base):
    __tablename__ = "muscles"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)

class WorkoutMuscle(Base):
    __tablename__ = "entrenamiento_musculo"
    workout_id = Column(Integer, ForeignKey("workouts.id"), primary_key=True)
    muscle_id = Column(Integer, ForeignKey("muscles.id"), primary_key=True)
