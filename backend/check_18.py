import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.models import Workout, FitbitData

db = SessionLocal()
workouts = db.query(Workout).filter(Workout.date.like('%-01-18%')).all()
print(f'Workouts on Jan 18: {len(workouts)}')
for w in workouts:
    print(f'- Date: {w.date} | Title: "{w.title}" | Source: {w.source} | Muscle: {w.muscle_groups}')
    if w.fitbit_data:
        print(f'  Fitbit: {w.fitbit_data.activity_name}')
db.close()
