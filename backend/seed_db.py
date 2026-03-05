from models import SessionLocal, init_db, User, Workout, ExerciseSet
from datetime import datetime, timezone

def seed():
    print("--- Seeding GymHub Database ---")
    init_db()
    db = SessionLocal()
    
    # 1. Create Mock User
    email = "test@gymhub.app"
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            email=email, 
            google_id="mock_google_123",
            google_access_token="YOUR_ACCESS_TOKEN", # Change this to test real sync
            google_refresh_token="YOUR_REFRESH_TOKEN" # Change this to test real sync
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"User created: {email}")
    else:
        print(f"User already exists: {email}")

    # 2. Clear old workouts for clean demo
    db.query(Workout).filter(Workout.user_id == user.id).delete()
    db.commit()

    # 3. Create Sample Workouts
    workouts_data = [
        {
            "title": "Pecho / Tríceps (Elite)",
            "exercises": [
                {"exercise_name": "Press de Banca", "weight_kg": 60.5, "is_pr": 1},
                {"exercise_name": "Aperturas con mancuernas", "weight_kg": 15.0, "is_pr": 0},
                {"exercise_name": "Extensiones Tríceps", "weight_kg": 25.0, "is_pr": 1}
            ]
        },
        {
            "title": "Espalda / Bíceps (Power)",
            "exercises": [
                {"exercise_name": "Dominadas", "weight_kg": 0.0, "is_pr": 0},
                {"exercise_name": "Remo con barra", "weight_kg": 75.0, "is_pr": 1},
                {"exercise_name": "Curl de Bíceps", "weight_kg": 12.0, "is_pr": 0}
            ]
        }
    ]

    for w_data in workouts_data:
        workout = Workout(
            user_id=user.id,
            title=w_data["title"],
            date=datetime.now(timezone.utc),
            source="app"
        )
        db.add(workout)
        db.commit()
        db.refresh(workout)
        
        for ex_data in w_data["exercises"]:
            ex_set = ExerciseSet(
                workout_id=workout.id,
                exercise_name=ex_data["exercise_name"],
                weight_kg=ex_data["weight_kg"],
                is_pr=ex_data["is_pr"],
                raw_text=f"✅ {ex_data['exercise_name']} ({ex_data['weight_kg']}kg)"
            )
            db.add(ex_set)
        
        db.commit()
        print(f"Added workout: {w_data['title']}")

    db.close()
    print("--- Database Seeded Successfully! ---")

if __name__ == "__main__":
    seed()
