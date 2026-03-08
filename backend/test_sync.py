from app.core.database import SessionLocal
from app.models import User, Workout
from app.services.sync_service import sync_data_for_user
import logging

logging.basicConfig(level=logging.INFO)

db = SessionLocal()
user = db.query(User).filter(User.email == 'ivansevillano2005@gmail.com').first()
if user:
    print(f"Syncing for {user.email}...")
    sync_data_for_user(user, db)
    db.commit()
    count = db.query(Workout).filter(Workout.user_email == user.email).count()
    print(f"Total workouts now: {count}")
else:
    print("User not found")
db.close()
