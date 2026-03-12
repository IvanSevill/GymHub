from app.database import SessionLocal
from app import models
from sqlalchemy import func

def cleanup():
    db = SessionLocal()
    try:
        print("Starting database cleanup and normalization...")
        
        # 1. Normalize Muscles to lowercase
        muscles = db.query(models.Muscle).all()
        muscle_map = {} # name -> id
        for m in muscles:
            old_name = m.name
            new_name = old_name.lower().strip()
            if new_name != old_name:
                print(f"Normalizing muscle: '{old_name}' -> '{new_name}'")
                # Check if another muscle with new_name already exists
                existing = db.query(models.Muscle).filter(models.Muscle.name == new_name).first()
                if existing:
                    print(f"  Merging '{old_name}' into existing '{new_name}'")
                    # Re-link exercises to the existing one
                    db.query(models.Exercise).filter(models.Exercise.muscle_id == m.id).update({"muscle_id": existing.id})
                    db.delete(m)
                    muscle_map[new_name] = existing.id
                else:
                    m.name = new_name
                    muscle_map[new_name] = m.id
            else:
                muscle_map[new_name] = m.id
        db.flush()

        # 2. Add 'cardio' muscle and exercise
        cardio_muscle = db.query(models.Muscle).filter(models.Muscle.name == "cardio").first()
        if not cardio_muscle:
            print("Creating 'cardio' muscle")
            cardio_muscle = models.Muscle(name="cardio")
            db.add(cardio_muscle)
            db.flush()
        
        cardio_exercise = db.query(models.Exercise).filter(models.Exercise.name == "cardio").first()
        if not cardio_exercise:
            print("Creating 'cardio' exercise")
            cardio_exercise = models.Exercise(name="cardio", muscle_id=cardio_muscle.id)
            db.add(cardio_exercise)
            db.flush()

        # 3. Normalize Exercises to lowercase and cleanup names
        exercises = db.query(models.Exercise).all()
        for e in exercises:
            old_name = e.name
            # Basic cleanup: lowercase, strip, and remove trailing garbage like " -" or "  "
            new_name = old_name.lower().strip()
            new_name = new_name.rstrip("- ").strip()
            
            if not new_name:
                print(f"Deleting exercise with no name: '{old_name}'")
                # Re-link sets to something else or delete? Let's delete if it's garbage
                db.query(models.ExerciseSet).filter(models.ExerciseSet.exercise_id == e.id).delete()
                db.delete(e)
                continue

            if new_name != old_name:
                print(f"Normalizing exercise: '{old_name}' -> '{new_name}'")
                # Check for duplicates after normalization
                existing = db.query(models.Exercise).filter(
                    models.Exercise.name == new_name, 
                    models.Exercise.muscle_id == e.muscle_id
                ).filter(models.Exercise.id != e.id).first()
                
                if existing:
                    print(f"  Merging '{old_name}' into existing '{new_name}'")
                    db.query(models.ExerciseSet).filter(models.ExerciseSet.exercise_id == e.id).update({"exercise_id": existing.id})
                    db.delete(e)
                else:
                    e.name = new_name
            else:
                # Still check for duplicates even if name didn't change (e.g. same name, different case previously)
                existing = db.query(models.Exercise).filter(
                    models.Exercise.name == new_name, 
                    models.Exercise.muscle_id == e.muscle_id
                ).filter(models.Exercise.id != e.id).first()
                if existing:
                    print(f"  Found duplicate for '{new_name}', merging...")
                    db.query(models.ExerciseSet).filter(models.ExerciseSet.exercise_id == e.id).update({"exercise_id": existing.id})
                    db.delete(e)

        # 4. Specific known garbage cleanup
        garbage_patterns = ["en multi-power", "en maquina", "en maquina barra fija"]
        for pattern in garbage_patterns:
            matches = db.query(models.Exercise).filter(models.Exercise.name == pattern).all()
            for g in matches:
                # If it has no sets, delete it. If it has sets, maybe it was a bad load?
                # User said "cargan mal", so we should probably delete them if they are just fragments.
                sets_count = db.query(models.ExerciseSet).filter(models.ExerciseSet.exercise_id == g.id).count()
                if sets_count == 0:
                    print(f"Deleting garbage fragment: '{g.name}'")
                    db.delete(g)
                else:
                    print(f"Garbage fragment '{g.name}' has {sets_count} sets. Keeping for now but normalized.")

        db.commit()
        print("Cleanup completed successfully.")
    except Exception as e:
        print(f"Error during cleanup: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    cleanup()
