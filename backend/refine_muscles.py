from app.core.database import SessionLocal
from app.models import Workout, ExerciseSet
from app.services.sync_service import parse_muscle_groups
import logging

logging.basicConfig(level=logging.INFO)
db = SessionLocal()

# Find all workouts that might need muscle group refinement (like "Extra", "GymHub" or empty ones)
workouts = db.query(Workout).all()
updated = 0

for w in workouts:
    exercises = db.query(ExerciseSet).filter(ExerciseSet.workout_id == w.id).all()
    ex_muscles = [ex.muscle_group for ex in exercises if ex.muscle_group]
    
    new_muscles = parse_muscle_groups(w.title, ex_muscles)
    if w.muscle_groups != new_muscles:
        print(f"Updating '{w.title}' ({w.date}): {w.muscle_groups} -> {new_muscles}")
        w.muscle_groups = new_muscles
        updated += 1

db.commit()
print(f"Finished. Updated {updated} workouts.")
db.close()
