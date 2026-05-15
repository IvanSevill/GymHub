from app.database import SessionLocal
from app import models
from sqlalchemy.orm import joinedload

def check():
    db = SessionLocal()
    workout = db.query(models.Workout).options(
        joinedload(models.Workout.exercise_sets).joinedload(models.ExerciseSet.exercise).joinedload(models.Exercise.muscle)
    ).first()
    
    if not workout:
        print("No workouts found.")
        return

    print(f"Workout: {workout.title}")
    for s in workout.exercise_sets:
        print(f"  Set: value={s.value}, is_completed={s.is_completed}")
        if s.exercise:
            print(f"    Exercise: {s.exercise.name}")
            if s.exercise.muscle:
                print(f"      Muscle: {s.exercise.muscle.name}")
        else:
            print("    Exercise: NONE!")

check()