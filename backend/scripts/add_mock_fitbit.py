from models import SessionLocal, Workout, FitbitData

db = SessionLocal()
last_workout = db.query(Workout).order_by(Workout.date.desc()).first()

if last_workout:
    if not last_workout.fitbit_data:
        fd = FitbitData(
            workout_id=last_workout.id,
            calories=450,
            heart_rate_avg=142,
            heart_rate_max=178,
            duration_ms=5400000,
            steps=3200
        )
        db.add(fd)
        db.commit()
        print("Added mock Fitbit data to workout", last_workout.id)
    else:
        print("Workout already has Fitbit data.")
else:
    print("No workouts found.")
