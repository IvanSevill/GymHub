from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime, timedelta
from .. import models, schemas, database, auth, fitbit_utils, calendar_utils
import os
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials

router = APIRouter(prefix="/workouts", tags=["workouts"])

@router.get("/calendars")
def list_calendars(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == current_user.id).first()
    if not user_tokens or not user_tokens.google_access_token:
        raise HTTPException(status_code=400, detail="Google Calendar not connected")
    
    creds = Credentials(token=user_tokens.google_access_token)
    service = build('calendar', 'v3', credentials=creds)
    
    try:
        calendar_list = service.calendarList().list().execute()
        calendars = calendar_list.get('items', [])
        return [
            {
                "id": c["id"], 
                "summary": c["summary"], 
                "primary": c.get("primary", False),
                "selected": c["id"] == (user_tokens.selected_calendar_id if user_tokens else None)
            }
            for c in calendars
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch calendars: {str(e)}")

@router.post("/set-calendar")
def set_calendar(
    calendar_id: str = Query(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == current_user.id).first()
    if not user_tokens:
        user_tokens = models.UserTokens(user_id=current_user.id)
        db.add(user_tokens)
    
    user_tokens.selected_calendar_id = calendar_id
    db.commit()
    return {"message": "Calendar updated"}

# Google Calendar API Helper
def update_google_calendar_event(db: Session, user_tokens: models.UserTokens, workout: models.Workout, fitbit_data: Optional[models.FitbitData] = None):
    if not user_tokens or not user_tokens.google_access_token:
        return None
    
    # Simple token refresh logic for Google
    creds = Credentials(
        token=user_tokens.google_access_token,
        refresh_token=user_tokens.google_refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.getenv("GOOGLE_CLIENT_ID"),
        client_secret=os.getenv("GOOGLE_CLIENT_SECRET")
    )
    
    if not creds.valid:
        from google.auth.transport.requests import Request
        try:
            creds.refresh(Request())
            user_tokens.google_access_token = creds.token
            db.commit()
        except Exception as e:
            print(f"Failed to refresh Google token: {e}")
            return None

    service = build('calendar', 'v3', credentials=creds)
    
    # Fetch involved muscles and their full exercise catalog
    active_exercise_ids = [es.exercise_id for es in workout.exercise_sets if es.exercise_id]
    
    # Group by muscle name (lowercase) for the generator
    exercises_by_muscle = {}
    
    if active_exercise_ids:
        # Get exercises with joined muscle data
        exercises_info = db.query(models.Exercise).options(joinedload(models.Exercise.muscle)).filter(models.Exercise.id.in_(active_exercise_ids)).all()
        ex_map = {e.id: e for e in exercises_info}
        
        # Manually populate the relationship to avoid lazy-loading issues in the generator
        for es in workout.exercise_sets:
            if es.exercise_id in ex_map:
                es.exercise = ex_map[es.exercise_id]

        active_muscle_ids = list(set(e.muscle_id for e in exercises_info))
        
        # Fetch full catalog for those muscles
        all_exercises = db.query(models.Exercise).options(joinedload(models.Exercise.muscle)).filter(models.Exercise.muscle_id.in_(active_muscle_ids)).all()
        
        for ex in all_exercises:
            m_name = ex.muscle.name.lower()
            if m_name not in exercises_by_muscle:
                exercises_by_muscle[m_name] = []
            exercises_by_muscle[m_name].append(ex)

    description = calendar_utils.generate_calendar_description(workout, fitbit_data, exercises_by_muscle)
    
    event_body = {
        'summary': workout.title,
        'description': description,
        'start': {'dateTime': workout.start_time.isoformat() + "+01:00"},
        'end': {'dateTime': workout.end_time.isoformat() + "+01:00"},
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
        print(f"Calendar Sync Error: {e}")
        raise e # Re-raise to let the router handle it

@router.get("", response_model=List[schemas.Workout])
def list_workouts(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    query = db.query(models.Workout).options(
        joinedload(models.Workout.exercise_sets)
        .joinedload(models.ExerciseSet.exercise)
        .joinedload(models.Exercise.muscle),
        joinedload(models.Workout.fitbit_data)
    ).filter(models.Workout.user_id == current_user.id)
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
            measurement=es.measurement,
            is_completed=es.is_completed
        )
        db.add(db_set)
    
    db.commit()
    db.refresh(db_workout)
    
    # Sync to Calendar
    user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == current_user.id).first()
    update_google_calendar_event(db, user_tokens, db_workout)
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
            measurement=es.measurement,
            is_completed=es.is_completed
        )
        db.add(db_set)
    
    db.commit()
    db.refresh(db_workout)
    
    # Sync to Calendar
    user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == current_user.id).first()
    
    # Proactively try to sync Fitbit if connected
    if user_tokens and user_tokens.fitbit_access_token:
        try:
            activity = fitbit_utils.get_fitbit_activity(db, user_tokens, db_workout.start_time, db_workout.end_time)
            if activity:
                fitbit_data = db.query(models.FitbitData).filter(models.FitbitData.workout_id == workout_id).first()
                if not fitbit_data:
                    fitbit_data = models.FitbitData(workout_id=db_workout.id)
                    db.add(fitbit_data)
                
                fitbit_data.fitbit_log_id = str(activity.get("logId"))
                fitbit_data.calories = activity.get("calories", 0)
                fitbit_data.heart_rate_avg = activity.get("averageHeartRate", 0)
                fitbit_data.duration_ms = activity.get("duration", 0)
                fitbit_data.distance_km = activity.get("distance", 0.0)
                fitbit_data.elevation_gain_m = activity.get("elevationGain", 0.0)
                fitbit_data.activity_name = activity.get("activityName", "Unknown")
                
                azm_data = fitbit_utils.extract_azm(activity)
                fitbit_data.azm_fat_burn = azm_data.get("fatBurnMinutes", 0)
                fitbit_data.azm_cardio = azm_data.get("cardioMinutes", 0)
                fitbit_data.azm_peak = azm_data.get("peakMinutes", 0)
                
                db.flush()
                db_workout.fitbit_data = fitbit_data

                # Cardio Logic: If activity is not Weights or Walk, add a 'cardio' exercise set
                act_name_lower = fitbit_data.activity_name.lower()
                if "weights" not in act_name_lower and "walk" not in act_name_lower:
                    cardio_ex = db.query(models.Exercise).filter(models.Exercise.name == "cardio").first()
                    if cardio_ex:
                        # Check if cardio set already exists
                        existing_cardio = db.query(models.ExerciseSet).filter(
                            models.ExerciseSet.workout_id == workout_id,
                            models.ExerciseSet.exercise_id == cardio_ex.id
                        ).first()
                        if not existing_cardio:
                            db_set = models.ExerciseSet(
                                workout_id=db_workout.id,
                                exercise_id=cardio_ex.id,
                                value=str(fitbit_data.duration_ms // 60000),
                                measurement="min",
                                is_completed=True
                            )
                            db.add(db_set)
                            print(f"Added cardio set for activity: {fitbit_data.activity_name}")
        except Exception as e:
            print(f"Auto-sync Fitbit error: {e}")
            pass

    update_google_calendar_event(db, user_tokens, db_workout, db_workout.fitbit_data)
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
    
    activity = fitbit_utils.get_fitbit_activity(db, user_tokens, db_workout.start_time, db_workout.end_time)
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
    azm_data = fitbit_utils.extract_azm(activity)
    fitbit_data.azm_fat_burn = azm_data.get("fatBurnMinutes", 0)
    fitbit_data.azm_cardio = azm_data.get("cardioMinutes", 0)
    fitbit_data.azm_peak = azm_data.get("peakMinutes", 0)
    
    db.commit()
    db.refresh(fitbit_data)

    # Cardio Logic: If activity is not Weights or Walk, add a 'cardio' exercise set
    act_name_lower = fitbit_data.activity_name.lower()
    if "weights" not in act_name_lower and "walk" not in act_name_lower:
        cardio_ex = db.query(models.Exercise).filter(models.Exercise.name == "cardio").first()
        if cardio_ex:
            existing_cardio = db.query(models.ExerciseSet).filter(
                models.ExerciseSet.workout_id == workout_id,
                models.ExerciseSet.exercise_id == cardio_ex.id
            ).first()
            if not existing_cardio:
                db_set = models.ExerciseSet(
                    workout_id=workout_id,
                    exercise_id=cardio_ex.id,
                    value=str(fitbit_data.duration_ms // 60000),
                    measurement="min",
                    is_completed=True
                )
                db.add(db_set)
                db.commit()
    
    # Update Calendar event with new metrics
    update_google_calendar_event(db, user_tokens, db_workout, fitbit_data)
    
    return fitbit_data

@router.get("/sync-all")
def sync_all_from_calendar(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == current_user.id).first()
    if not user_tokens or not user_tokens.google_access_token:
        raise HTTPException(status_code=400, detail="Google Calendar not connected")
    
    creds = Credentials(token=user_tokens.google_access_token)
    service = build('calendar', 'v3', credentials=creds)
    
    calendar_id = user_tokens.selected_calendar_id or 'primary'
    
    # Fetch events from the last 2 years (730 days)
    sync_days = 730
    time_min_dt = datetime.utcnow() - timedelta(days=sync_days)
    time_min = time_min_dt.isoformat() + "Z"
    
    all_events = []
    page_token = None
    try:
        while True:
            events_result = service.events().list(
                calendarId=calendar_id, timeMin=time_min,
                singleEvents=True, orderBy='startTime',
                pageToken=page_token
            ).execute()
            all_events.extend(events_result.get('items', []))
            page_token = events_result.get('nextPageToken')
            if not page_token:
                break
        events = all_events
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch calendar events: {str(e)}")

    processed_count = 0
    calendar_event_ids = set()
    muscle_map = {m.name.lower(): m.id for m in db.query(models.Muscle).all()}
    # Create a case-insensitive exercise map
    exercise_map = {e.name.lower(): e.id for e in db.query(models.Exercise).all()}

    for event in events:
        desc = event.get('description', '')
        event_id = event.get('id')
        calendar_event_ids.add(event_id)
        
        # Determine if this is a GymHub event
        is_gymhub = "[GymHub]" in desc or "[gymhub]" in desc.lower()
        
        # If not explicitly tagged, check if it contains workout sessions format "Muscle - Exercise"
        has_workout_format = " - " in desc and any(m in desc.lower() for m in muscle_map.keys())
        
        if not is_gymhub and not has_workout_format:
            continue
        
        # Parse event
        start = event['start'].get('dateTime', event['start'].get('date'))
        end = event['end'].get('dateTime', event['end'].get('date'))
        if not start or not end:
            continue
            
        start_dt = datetime.fromisoformat(start.replace("Z", "+00:00")).replace(tzinfo=None)
        end_dt = datetime.fromisoformat(end.replace("Z", "+00:00")).replace(tzinfo=None)
        
        # Check if workout already exists by google_event_id
        workout = db.query(models.Workout).filter(models.Workout.google_event_id == event_id).first()
        if not workout:
            workout = models.Workout(
                user_id=current_user.id,
                google_event_id=event_id,
                start_time=start_dt,
                end_time=end_dt,
                title=event.get('summary', 'Workout')
            )
            db.add(workout)
            db.flush()
        else:
            workout.start_time = start_dt
            workout.end_time = end_dt
            workout.title = event.get('summary', 'Workout')
            db.query(models.ExerciseSet).filter(models.ExerciseSet.workout_id == workout.id).delete()

        # Parse exercises and fitbit from description
        sync_result = calendar_utils.parse_calendar_description(desc, muscle_map)
        parsed_sets = sync_result["sets"]
        parsed_fitbit = sync_result["fitbit"]
        
        sets_added = 0
        for ps in parsed_sets:
            m_id = muscle_map.get(ps["muscle_name"])
            if not m_id:
                # If muscle is not found (e.g., custom name?), fallback or skip
                continue
                
            # Map exercise name to ID (case-insensitive)
            e_name_lower = ps["exercise_name"].lower()
            e_id = exercise_map.get(e_name_lower)
            
            if not e_id:
                # AUTOMATIC CREATION: Only if current_user is root
                display_name = ps["exercise_name"].strip()
                if getattr(current_user, 'is_root', 0):
                    new_ex = models.Exercise(name=display_name, muscle_id=m_id)
                    db.add(new_ex)
                    db.flush() # Get the ID
                    e_id = new_ex.id
                    exercise_map[e_name_lower] = e_id
                    print(f"Sync (Root): Created missing exercise '{display_name}' for muscle '{ps['muscle_name']}'")
                else:
                    print(f"Sync (User): Found new exercise '{display_name}' but not saved (not root)")
                    continue # Skip this set as we have no exercise_id
            
            db_set = models.ExerciseSet(
                workout_id=workout.id,
                exercise_id=e_id,
                value=ps["value"],
                measurement=ps["measurement"],
                is_completed=ps.get("is_completed", False)
            )
            db.add(db_set)
            sets_added += 1
        
        # Save parsed Fitbit data
        if parsed_fitbit:
            db_fitbit = db.query(models.FitbitData).filter(models.FitbitData.workout_id == workout.id).first()
            if not db_fitbit:
                db_fitbit = models.FitbitData(workout_id=workout.id)
                db.add(db_fitbit)
            
            db_fitbit.calories = parsed_fitbit.get("calories", db_fitbit.calories)
            db_fitbit.heart_rate_avg = parsed_fitbit.get("heart_rate_avg", db_fitbit.heart_rate_avg)
            db_fitbit.duration_ms = parsed_fitbit.get("duration_ms", db_fitbit.duration_ms)
            db_fitbit.activity_name = parsed_fitbit.get("activity_name", db_fitbit.activity_name)
            db_fitbit.azm_fat_burn = parsed_fitbit.get("azm_fat_burn", db_fitbit.azm_fat_burn)
            db_fitbit.azm_cardio = parsed_fitbit.get("azm_cardio", db_fitbit.azm_cardio)
            db_fitbit.azm_peak = parsed_fitbit.get("azm_peak", db_fitbit.azm_peak)
        
        if sets_added > 0:
            processed_count += 1

    # Cleanup: Delete local workouts that were deleted from Google Calendar
    # Only check workouts that have a google_event_id and are within the sync time range
    local_workouts = db.query(models.Workout).filter(
        models.Workout.user_id == current_user.id,
        models.Workout.google_event_id != None,
        models.Workout.start_time >= time_min_dt
    ).all()
    
    deleted_count = 0
    for lw in local_workouts:
        if lw.google_event_id not in calendar_event_ids:
            db.delete(lw)
            deleted_count += 1
    
    db.commit()
    msg = f"Successfully synced {processed_count} workouts from Google Calendar"
    if deleted_count > 0:
        msg += f" (deleted {deleted_count} orphaned workouts)"
    return {"message": msg}
