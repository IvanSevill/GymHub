from app.database import SessionLocal
from app import models
from datetime import datetime

db = SessionLocal()
try:
    workout = db.query(models.Workout).order_by(models.Workout.start_time.desc()).first()
    if workout:
        print(f"Workout ID: {workout.id}")
        print(f"Title: {workout.title}")
        print(f"Start Time (DB): {workout.start_time}")
        print(f"Start Time Type: {type(workout.start_time)}")
        
        sets = db.query(models.ExerciseSet).filter(models.ExerciseSet.workout_id == workout.id).all()
        print(f"Exercise Sets ({len(sets)}):")
        for s in sets:
            print(f"  - Exercise: {s.exercise.name if s.exercise else 'N/A'}, Value: {s.value}, Measurement: {s.measurement}")
    else:
        print("No workouts found.")
except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()
