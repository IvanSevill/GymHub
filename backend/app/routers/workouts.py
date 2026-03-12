from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from .. import models, schemas, database, auth, calendar_utils, fitbit_utils
import os

router = APIRouter(prefix="/workouts", tags=["workouts"])

# Google Calendar API Helper (Simplified)
def update_google_calendar_event(user_tokens: models.UserTokens, workout: models.Workout, fitbit_data: Optional[models.FitbitData] = None):
    # This would use google-api-python-client
    # For now, it's a placeholder logic
    from googleapiclient.discovery import build
    from google.oauth2.credentials import Credentials
    
    if not user_tokens or not user_tokens.google_access_token:
        return None
    
    creds = Credentials(token=user_tokens.google_access_token)
    service = build('calendar', 'v3', credentials=creds)
    
    description = calendar_utils.generate_calendar_description(workout, fitbit_data)
    
    event_body = {
        'summary': workout.title,
        'description': description,
        'start': {'dateTime': workout.start_time.isoformat() + "Z"},
        'end': {'dateTime': workout.end_time.isoformat() + "Z"},
    }
    
    calendar_id = user_tokens.selected_calendar_id or 'primary'
    
    try:
        if workout.google_event_id:
            event = service.events().update(calendarId=calendar_id, eventId=workout.google_event_id, body=event_body).execute()
        else:
            event = service.events().insert(calendarId=calendar_id, body=event_body).execute()
            workout.google_event_id = event['id']
        return event['id']
    except Exception as e:
        print(f"Calendar Error: {e}")
        return None

@router.get("", response_model=List[schemas.Workout])
def list_workouts(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    query = db.query(models.Workout).filter(models.Workout.user_id == current_user.id)
    if start_date:
        query = query.filter(models.Workout.start_time >= start_date)
    if end_date:
        query = query.filter(models.Workout.end_time <= end_date)
    return query.order_by(models.Workout.start_time.desc()).all()

@router.post("", response_model=schemas.Workout)
def create_workout(
    workout: schemas.WorkoutCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    db_workout = models.Workout(
        user_id=current_user.id,
        start_time=workout.start_time,
        end_time=workout.end_time,
        title=workout.title
    )
    db.add(db_workout)
    db.flush()
    
    # Add exercise sets
    for es in workout.exercise_sets:
        db_set = models.ExerciseSet(
            workout_id=db_workout.id,
            exercise_id=es.exercise_id,
            value=es.value,
            measurement=es.measurement
        )
        db.add(db_set)
    
    db.commit()
    db.refresh(db_workout)
    
    # Sync to Calendar
    user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == current_user.id).first()
    update_google_calendar_event(user_tokens, db_workout)
    db.commit()
    
    return db_workout

@router.put("/{workout_id}", response_model=schemas.Workout)
def update_workout(
    workout_id: str,
    workout_update: schemas.WorkoutUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    db_workout = db.query(models.Workout).filter(models.Workout.id == workout_id, models.Workout.user_id == current_user.id).first()
    if not db_workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    
    db_workout.start_time = workout_update.start_time
    db_workout.end_time = workout_update.end_time
    db_workout.title = workout_update.title
    
    # Refresh sets: drop and recreate (as per spec: "fully regenerate")
    db.query(models.ExerciseSet).filter(models.ExerciseSet.workout_id == workout_id).delete()
    for es in workout_update.exercise_sets:
        db_set = models.ExerciseSet(
            workout_id=db_workout.id,
            exercise_id=es.exercise_id,
            value=es.value,
            measurement=es.measurement
        )
        db.add(db_set)
    
    db.commit()
    db.refresh(db_workout)
    
    # Sync to Calendar
    user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == current_user.id).first()
    update_google_calendar_event(user_tokens, db_workout, db_workout.fitbit_data)
    db.commit()
    
    return db_workout

@router.delete("/{workout_id}")
def delete_workout(
    workout_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    db_workout = db.query(models.Workout).filter(models.Workout.id == workout_id, models.Workout.user_id == current_user.id).first()
    if not db_workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    
    # Delete from Calendar
    if db_workout.google_event_id:
        user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == current_user.id).first()
        try:
            from googleapiclient.discovery import build
            from google.oauth2.credentials import Credentials
            creds = Credentials(token=user_tokens.google_access_token)
            service = build('calendar', 'v3', credentials=creds)
            calendar_id = user_tokens.selected_calendar_id or 'primary'
            service.events().delete(calendarId=calendar_id, eventId=db_workout.google_event_id).execute()
        except:
            pass
            
    db.delete(db_workout)
    db.commit()
    return {"message": "Workout deleted"}

@router.post("/{workout_id}/sync-fitbit", response_model=schemas.FitbitData)
def sync_fitbit(
    workout_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    db_workout = db.query(models.Workout).filter(models.Workout.id == workout_id, models.Workout.user_id == current_user.id).first()
    if not db_workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    
    user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == current_user.id).first()
    if not user_tokens or not user_tokens.fitbit_access_token:
        raise HTTPException(status_code=400, detail="Fitbit not connected")
    
    # Token refresh if needed (usually handled by fitbit_utils)
    access_token = user_tokens.fitbit_access_token
    
    activity = fitbit_utils.get_fitbit_activity(access_token, db_workout.start_time, db_workout.end_time)
    if not activity:
        raise HTTPException(status_code=404, detail="No matching Fitbit activity found")
    
    # Idempotent check
    fitbit_data = db.query(models.FitbitData).filter(models.FitbitData.workout_id == workout_id).first()
    if not fitbit_data:
        fitbit_data = models.FitbitData(workout_id=workout_id)
        db.add(fitbit_data)
    
    fitbit_data.fitbit_log_id = str(activity.get("logId"))
    fitbit_data.calories = activity.get("calories", 0)
    fitbit_data.heart_rate_avg = activity.get("averageHeartRate", 0)
    fitbit_data.duration_ms = activity.get("duration", 0)
    fitbit_data.distance_km = activity.get("distance", 0.0)
    fitbit_data.elevation_gain_m = activity.get("elevationGain", 0.0)
    fitbit_data.activity_name = activity.get("activityName", "Unknown")
    
    # Active Zone Minutes
    azm = activity.get("activeZoneMinutes", {})
    fitbit_data.azm_fat_burn = azm.get("fatBurnMinutes", 0)
    fitbit_data.azm_cardio = azm.get("cardioMinutes", 0)
    fitbit_data.azm_peak = azm.get("peakMinutes", 0)
    
    db.commit()
    db.refresh(fitbit_data)
    
    # Update Calendar event with new metrics
    update_google_calendar_event(user_tokens, db_workout, fitbit_data)
    
    return fitbit_data

@router.get("/sync-all")
def sync_all_from_calendar(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == current_user.id).first()
    if not user_tokens or not user_tokens.google_access_token:
        raise HTTPException(status_code=400, detail="Google Calendar not connected")
    
    from googleapiclient.discovery import build
    from google.oauth2.credentials import Credentials
    from datetime import timedelta
    
    creds = Credentials(token=user_tokens.google_access_token)
    service = build('calendar', 'v3', credentials=creds)
    
    calendar_id = user_tokens.selected_calendar_id or 'primary'
    
    # Fetch events from the last 30 days
    time_min = (datetime.utcnow() - timedelta(days=30)).isoformat() + "Z"
    
    try:
        events_result = service.events().list(
            calendarId=calendar_id, timeMin=time_min,
            singleEvents=True, orderBy='startTime'
        ).execute()
        events = events_result.get('items', [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch calendar events: {str(e)}")

    processed_count = 0
    muscle_map = {m.name: m.id for m in db.query(models.Muscle).all()}
    exercise_map = {e.name: e.id for e in db.query(models.Exercise).all()}

    for event in events:
        desc = event.get('description', '')
        if "[GymHub]" not in desc:
            continue
        
        # Parse event
        start = event['start'].get('dateTime', event['start'].get('date'))
        end = event['end'].get('dateTime', event['end'].get('date'))
        start_dt = datetime.fromisoformat(start.replace("Z", "+00:00")).replace(tzinfo=None)
        end_dt = datetime.fromisoformat(end.replace("Z", "+00:00")).replace(tzinfo=None)
        
        # Check if workout already exists by google_event_id
        workout = db.query(models.Workout).filter(models.Workout.google_event_id == event['id']).first()
        if not workout:
            workout = models.Workout(
                user_id=current_user.id,
                google_event_id=event['id'],
                start_time=start_dt,
                end_time=end_dt,
                title=event.get('summary', 'Workout')
            )
            db.add(workout)
            db.flush()
        else:
            # Update times and title
            workout.start_time = start_dt
            workout.end_time = end_dt
            workout.title = event.get('summary', 'Workout')
            # Reset sets
            db.query(models.ExerciseSet).filter(models.ExerciseSet.workout_id == workout.id).delete()

        # Parse exercises from description
        parsed_sets = calendar_utils.parse_calendar_description(desc, muscle_map)
        for ps in parsed_sets:
            # Map exercise name to ID
            e_id = exercise_map.get(ps["exercise_name"])
            if not e_id:
                # Spec says root only for exercise creation, so we skip if not found
                continue
            
            db_set = models.ExerciseSet(
                workout_id=workout.id,
                exercise_id=e_id,
                value=ps["value"],
                measurement=ps["measurement"]
            )
            db.add(db_set)
        
        processed_count += 1

    db.commit()
    return {"message": f"Successfully synced {processed_count} workouts from Google Calendar"}
