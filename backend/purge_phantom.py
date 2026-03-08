import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.models import Workout, FitbitData

db = SessionLocal()
workouts = db.query(Workout).filter(Workout.source == "fitbit").all()
print(f'Total fitbit workouts: {len(workouts)}')
count = 0
for w in workouts:
    if "Entrenamiento" in w.title:
        db.delete(w)
        count += 1
db.commit()
print(f'Deleted {count} phantom training sessions.')
db.close()
