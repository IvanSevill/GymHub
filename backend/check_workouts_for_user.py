from app.database import SessionLocal
from app import models

db = SessionLocal()
users = db.query(models.User).all()
for u in users:
    print(f"User: {u.email} ({u.id})")
    workouts = db.query(models.Workout).filter(models.Workout.user_id == u.id).all()
    print(f"  Workouts count: {len(workouts)}")
