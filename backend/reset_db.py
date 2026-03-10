from app.core.database import engine, Base
import os
import sys

# Get backend directory
backend_dir = os.path.dirname(os.path.abspath(__file__))
db_path = os.path.join(backend_dir, "gymhub_v2.db")

def reset_db():
    print(f"Checking for existing database at {db_path}...")
    if os.path.exists(db_path):
        print("Closing connections and deleting old database file to ensure 3rd Normal Form (3NF) migration...")
        try:
            os.remove(db_path)
            print("Successfully deleted gymhub_v2.db")
        except Exception as e:
            print(f"Error deleting database: {e}")
            print("Please make sure the backend server (run_backend.py) is CLOSED before running this script.")
            return

    print("Initializing new database with updated schema (number1..4, measurement, Exercise and Muscle 3NF relations)...")
    try:
        # Import models to ensure they are registered with Base.metadata
        from app.models.user import User
        from app.models.workout import Workout, Muscle, WorkoutMuscle
        from app.models.exercise import Exercise, ExerciseMuscle, ExerciseSet
        from app.models.fitbit import FitbitData
        
        Base.metadata.create_all(bind=engine)
        print("Database initialized successfully!")
        print("\nNow you can start the backend with: python run_backend.py")
    except Exception as e:
        print(f"Error initializing database: {e}")

if __name__ == "__main__":
    # Add parent dir to path for imports
    sys.path.append(backend_dir)
    reset_db()
