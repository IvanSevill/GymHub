import sys
import os

# Ensure backend directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal, engine, Base
from app.models.workout import Workout, Muscle, WorkoutMuscle
from sqlalchemy.orm import Session

# Create the new tables
Base.metadata.create_all(bind=engine)

def migrate():
    db = SessionLocal()
    try:
        workouts = db.query(Workout).all()
        for w in workouts:
            if w.muscle_groups:
                muscles = [m.strip() for m in w.muscle_groups.split(',')]
                for m_name in muscles:
                    if not m_name: continue
                    # get or create Muscle
                    muscle = db.query(Muscle).filter(Muscle.name == m_name).first()
                    if not muscle:
                        muscle = Muscle(name=m_name)
                        db.add(muscle)
                        db.commit()
                        db.refresh(muscle)
                    
                    # append if not already there
                    w.muscles.append(muscle)
        db.commit()
        print("Migrated 3NF tables successfully!")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    migrate()
