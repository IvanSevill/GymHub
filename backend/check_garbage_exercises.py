from app import database, models

def check_exercises():
    db = database.SessionLocal()
    try:
        exercises = db.query(models.Exercise).all()
        print(f"Total exercises: {len(exercises)}")
        for ex in exercises:
            import re
            if re.search(r'\d', ex.name):
                print(f"Potential garbage exercise: ID={ex.id}, Name='{ex.name}'")
    finally:
        db.close()

if __name__ == "__main__":
    check_exercises()
