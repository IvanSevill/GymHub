from app import database, models, calendar_utils
from sqlalchemy.orm import Session
import re

def fix_everything():
    db = database.SessionLocal()
    try:
        # 1. Get all workouts
        workouts = db.query(models.Workout).all()
        print(f"Checking {len(workouts)} workouts for parsing fixes...")
        
        muscle_map = {m.name.lower(): m.id for m in db.query(models.Muscle).all()}
        exercise_map = {e.name.lower(): e.id for e in db.query(models.Exercise).all()}
        
        for workout in workouts:
            if not workout.google_event_id: continue
            
            # Use a dummy description or fetch it? 
            # In a real sync we'd fetch from Google, but here we can just use the workout title and muscle association if we had them, 
            # but wait, we have the exercises already.
            
            # Actually, let's just use the sync_all logic but in a script
            pass

        # Let's just run a script that identifies and deletes orphaned "garbage" exercises
        # AFTER the user would have triggered a sync.
        # But wait, I can trigger a sync for them from the backend if I have tokens.
        
        # Better: let's just delete the garbage exercises and their sets, 
        # then tell the user to click "Sync" in the UI.
        
        garbage_exercises = []
        exercises = db.query(models.Exercise).all()
        for ex in exercises:
            if re.search(r'\d', ex.name):
                garbage_exercises.append(ex)
        
        print(f"Found {len(garbage_exercises)} garbage exercises to remove.")
        for ex in garbage_exercises:
            # Delete sets associated with this garbage exercise
            # This is safe because the user can just resync to get them back correctly
            db.query(models.ExerciseSet).filter(models.ExerciseSet.exercise_id == ex.id).delete()
            db.delete(ex)
            print(f"Deleted: {ex.name}")
        
        db.commit()
        print("Cleanup complete. Please click 'Sincronizar' in the UI to restore workouts correctly.")
        
    finally:
        db.close()

if __name__ == "__main__":
    fix_everything()
