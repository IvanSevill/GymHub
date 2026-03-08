# Legacy redirection to new app structure
from app.models import User, Workout, ExerciseSet, FitbitData, Base
from app.core.database import SessionLocal, init_db, engine, db_url
