"""
Script para limpiar workouts contaminados de la BD (cumpleaños, eventos sin ejercicios).
Elimina SOLO los workouts que no tienen ningún ExerciseSet asociado,
o que venían del calendario pero sin datos de entrenamiento útiles.
"""
from models import SessionLocal, Workout, ExerciseSet

db = SessionLocal()

print("🧹 Limpiando BD...")

# Get all workouts
all_workouts = db.query(Workout).all()
deleted = 0

for w in all_workouts:
    sets = db.query(ExerciseSet).filter(ExerciseSet.workout_id == w.id).all()
    if len(sets) == 0:
        print(f"  ❌ Borrando workout sin ejercicios: '{w.title}' ({w.date})")
        db.delete(w)
        deleted += 1

db.commit()
print(f"\n✅ Limpieza completada. {deleted} workouts eliminados.")
print(f"   Quedan {db.query(Workout).count()} workouts válidos.")
db.close()
