from app.database import SessionLocal
from app import models

db = SessionLocal()
try:
    users = db.query(models.User).all()
    print(f"Users found: {len(users)}")
    for u in users:
        workouts = db.query(models.Workout).filter(models.Workout.user_id == u.id).all()
        print(f"User {u.email} has {len(workouts)} workouts")
        sets_count = db.query(models.ExerciseSet).join(models.Workout).filter(models.Workout.user_id == u.id).count()
        print(f"  Total Exercise Sets: {sets_count}")
    
    exercises = db.query(models.Exercise).count()
    print(f"Total Exercises in DB: {exercises}")
    muscles = db.query(models.Muscle).all()
    print(f"Total Muscles: {len(muscles)}")
    for m in muscles:
        ex_count = db.query(models.Exercise).filter(models.Exercise.muscle_id == m.id).count()
        print(f"  Muscle {m.name}: {ex_count} exercises")

except Exception as e:
    print(f"DB Error: {e}")
finally:
    db.close()
