from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime, timedelta
import os

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleAuthRequest  # Alias to avoid conflict with FastAPI Request

from .. import models, schemas, database, auth, fitbit_utils, calendar_utils # Relative imports

# FastAPI router for workout-related endpoints
router = APIRouter(prefix="/workouts", tags=["workouts"])

def get_google_credentials(user_tokens: models.UserTokens, db: Session) -> Optional[Credentials]:
    """
    Helper function to get and refresh Google API credentials.
    """
    if not user_tokens or not user_tokens.google_access_token:
        return None
    
    creds = Credentials(
        token=user_tokens.google_access_token,
        refresh_token=user_tokens.google_refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.getenv("GOOGLE_CLIENT_ID"),
        client_secret=os.getenv("GOOGLE_CLIENT_SECRET")
    )
    
    if not creds.valid and creds.refresh_token:
        try:
            creds.refresh(GoogleAuthRequest())
            user_tokens.google_access_token = creds.token
            db.commit()
        except Exception as e:
            print(f"Failed to refresh Google token: {e}")
            return None
    elif not creds.valid and not creds.refresh_token:
        print("Google token is invalid and no refresh token available.")
        return None
        
    return creds

def update_google_calendar_event(db: Session, user_tokens: models.UserTokens, workout: models.Workout, fitbit_data: Optional[models.FitbitData] = None):
    """
    Creates or updates a Google Calendar event for a given workout.
    """
    creds = get_google_credentials(user_tokens, db)
    if not creds:
        print("No valid Google credentials for calendar sync.")
        return None

    service = build('calendar', 'v3', credentials=creds)

    # Ensure exercise/muscle relationships are loaded on all workout sets
    active_exercise_ids = [es.exercise_id for es in workout.exercise_sets if es.exercise_id]
    if active_exercise_ids:
        ex_map = {
            e.id: e for e in db.query(models.Exercise)
            .options(joinedload(models.Exercise.muscle))
            .filter(models.Exercise.id.in_(active_exercise_ids))
            .all()
        }
        for es in workout.exercise_sets:
            if es.exercise_id in ex_map:
                es.exercise = ex_map[es.exercise_id]

    # Build full exercise catalog for muscles referenced in the title
    exercises_by_muscle: dict = {}
    title_muscles = calendar_utils._muscles_from_title(workout.title or "")
    lookup_muscles = title_muscles if title_muscles else set()

    # Fall back to muscles active in the session if title has no keywords
    if not lookup_muscles and active_exercise_ids:
        lookup_muscles = {es.exercise.muscle.name for es in workout.exercise_sets if es.exercise and es.exercise.muscle}

    if lookup_muscles:
        muscle_objs = db.query(models.Muscle).filter(models.Muscle.name.in_(list(lookup_muscles))).all()
        muscle_ids = [m.id for m in muscle_objs]
        for ex in (
            db.query(models.Exercise)
            .options(joinedload(models.Exercise.muscle))
            .filter(models.Exercise.muscle_id.in_(muscle_ids))
            .all()
        ):
            exercises_by_muscle.setdefault(ex.muscle.name.lower(), []).append(ex)

    all_exercise_ids = [ex.id for exs in exercises_by_muscle.values() for ex in exs]
    prs = calendar_utils.get_exercise_prs_as_of(
        db=db,
        user_id=workout.user_id,
        as_of_date=workout.start_time,
        exercise_ids=all_exercise_ids,
    )
    description = calendar_utils.generate_calendar_description(workout, fitbit_data, exercises_by_muscle, prs)
    
    # Google Calendar requires timezone information. Assuming UTC then converting to local.
    # For simplicity, using +01:00 offset as in original for now, but should be dynamic or UTC.
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
            event = service.events().insert(calendarId=calendar_id, body=event_body).execute() # This line may fail if calendar_id is not found
            workout.google_event_id = event['id']
        return event['id']
    except Exception as e:
        print(f"Calendar Sync Error: {e}")
        # Depending on the error, might want to raise HTTPException or just log.
        return None # Indicate failure to sync


@router.get("/calendars", response_model=List[dict])
async def list_calendars(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Lists the Google Calendars available to the current user.
    Requires Google Calendar to be connected.
    """
    print(f"DEBUG: Listing calendars for user {current_user.email}")
    user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == current_user.id).first()
    if not user_tokens:
        print("DEBUG: No user tokens found in DB")
        raise HTTPException(status_code=400, detail="Google Calendar not connected (no tokens)")
        
    if not user_tokens.google_access_token:
        print("DEBUG: User has no google_access_token")
        raise HTTPException(status_code=400, detail="Google Calendar not connected (no access token)")
    
    creds = get_google_credentials(user_tokens, db)
    if not creds:
        print("DEBUG: Failed to get/refresh google credentials")
        raise HTTPException(status_code=400, detail="Could not refresh Google credentials.")

    service = build('calendar', 'v3', credentials=creds)
    
    try:
        calendar_list = service.calendarList().list().execute()
        calendars = calendar_list.get('items', [])
        print(f"DEBUG: Found {len(calendars)} calendars")
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
        print(f"DEBUG: Error fetching calendars from Google API: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch calendars: {str(e)}")

@router.post("/set-calendar", response_model=dict)
async def set_calendar(
    calendar_id: str = Query(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Sets the primary Google Calendar for syncing workouts for the current user.
    """
    user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == current_user.id).first()
    if not user_tokens:
        user_tokens = models.UserTokens(user_id=current_user.id)
        db.add(user_tokens)
    
    user_tokens.selected_calendar_id = calendar_id
    db.commit()
    db.refresh(user_tokens)
    return {"message": "Calendar updated", "selected_calendar_id": user_tokens.selected_calendar_id}

@router.get("", response_model=List[schemas.Workout])
async def list_workouts(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Lists workouts for the current user, optionally filtered by date range.
    Includes related exercise sets, exercises, muscles, and Fitbit data.
    """
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
async def create_workout(
    workout: schemas.WorkoutCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Creates a new workout for the current user.
    Automatically syncs the new workout to Google Calendar if connected.
    """
    db_workout = models.Workout(
        user_id=current_user.id,
        start_time=workout.start_time,
        end_time=workout.end_time,
        title=workout.title
    )
    db.add(db_workout)
    db.flush() # Flush to get workout.id for exercise_sets
    
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
    
    # Sync to Google Calendar
    user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == current_user.id).first()
    if user_tokens and user_tokens.selected_calendar_id:
        update_google_calendar_event(db, user_tokens, db_workout)
        db.commit() # Commit again to save google_event_id if created
    
    # Refresh the workout to include google_event_id if it was updated
    db.refresh(db_workout)
    return db_workout

@router.post("/reformat-last/{n}", response_model=dict)
async def reformat_last_n_events(
    n: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Reformats the last N workout Google Calendar events using the current description format.
    Only affects workouts that already have a google_event_id.
    """
    user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == current_user.id).first()
    if not user_tokens or not user_tokens.google_access_token:
        raise HTTPException(status_code=400, detail="Google Calendar not connected.")

    workouts = (
        db.query(models.Workout)
        .options(
            joinedload(models.Workout.exercise_sets)
            .joinedload(models.ExerciseSet.exercise)
            .joinedload(models.Exercise.muscle),
            joinedload(models.Workout.fitbit_data),
        )
        .filter(models.Workout.user_id == current_user.id)
        .filter(models.Workout.google_event_id.isnot(None))
        .order_by(models.Workout.start_time.desc())
        .limit(n)
        .all()
    )

    updated, failed = [], []
    for workout in workouts:
        event_id = update_google_calendar_event(db, user_tokens, workout, workout.fitbit_data)
        label = workout.title or str(workout.start_time.date())
        if event_id:
            updated.append(label)
        else:
            failed.append(label)

    db.commit()
    return {"updated": len(updated), "failed": len(failed), "updated_workouts": updated, "failed_workouts": failed}

@router.post("/sync-fitbit-bulk", response_model=dict)
async def sync_fitbit_bulk(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Syncs Fitbit data for all past workouts that are missing it.
    Uses a ±1 hour window around the workout start time to find a matching
    Fitbit activity. Updates Google Calendar events with the synced data.
    """
    user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == current_user.id).first()
    if not user_tokens or not user_tokens.fitbit_access_token:
        raise HTTPException(status_code=400, detail="Fitbit not connected.")

    now = datetime.utcnow()
    # Include workouts that have no FitbitData OR have FitbitData with a null
    # logId (created by a previous incomplete sync — need to be re-linked).
    synced_with_logid = db.query(models.FitbitData.workout_id).filter(
        models.FitbitData.fitbit_log_id.isnot(None),
        models.FitbitData.fitbit_log_id != "",
    )
    workouts = (
        db.query(models.Workout)
        .options(
            joinedload(models.Workout.exercise_sets)
            .joinedload(models.ExerciseSet.exercise)
            .joinedload(models.Exercise.muscle),
            joinedload(models.Workout.fitbit_data),
        )
        .filter(
            models.Workout.user_id == current_user.id,
            models.Workout.start_time < now,
            ~models.Workout.id.in_(synced_with_logid),
        )
        .order_by(models.Workout.start_time.desc())
        .all()
    )

    synced, not_found = 0, 0
    for workout in workouts:
        try:
            activity = fitbit_utils.get_fitbit_activity(
                db, user_tokens, workout.start_time, workout.end_time
            )
            if not activity:
                not_found += 1
                continue

            # Cardio activities must not be consumed here —
            # they create their own workout via sync_fitbit_create_missing.
            if not _is_gym_activity(activity):
                not_found += 1
                continue

            log_id = str(activity.get("logId", "")) or None
            azm = fitbit_utils.extract_azm(activity)
            has_gps = bool(activity.get("hasGps", False))

            existing_fd = workout.fitbit_data
            if existing_fd:
                # Update stale record (logId was null) in-place
                existing_fd.fitbit_log_id = log_id
                existing_fd.calories = activity.get("calories", 0)
                existing_fd.heart_rate_avg = activity.get("averageHeartRate", 0)
                existing_fd.duration_ms = activity.get("duration", 0)
                existing_fd.distance_km = activity.get("distance", 0.0)
                existing_fd.elevation_gain_m = activity.get("elevationGain", 0.0)
                existing_fd.activity_name = activity.get("activityName", "Unknown")
                existing_fd.azm_fat_burn = azm.get("fatBurnMinutes", 0)
                existing_fd.azm_cardio = azm.get("cardioMinutes", 0)
                existing_fd.azm_peak = azm.get("peakMinutes", 0)
                existing_fd.has_gps = has_gps
                fitbit_data = existing_fd
            else:
                fitbit_data = models.FitbitData(
                    workout_id=workout.id,
                    fitbit_log_id=log_id,
                    calories=activity.get("calories", 0),
                    heart_rate_avg=activity.get("averageHeartRate", 0),
                    duration_ms=activity.get("duration", 0),
                    distance_km=activity.get("distance", 0.0),
                    elevation_gain_m=activity.get("elevationGain", 0.0),
                    activity_name=activity.get("activityName", "Unknown"),
                    azm_fat_burn=azm.get("fatBurnMinutes", 0),
                    azm_cardio=azm.get("cardioMinutes", 0),
                    azm_peak=azm.get("peakMinutes", 0),
                    has_gps=has_gps,
                )
                db.add(fitbit_data)
                db.flush()
                workout.fitbit_data = fitbit_data

            if user_tokens.selected_calendar_id and workout.google_event_id:
                update_google_calendar_event(db, user_tokens, workout, fitbit_data)

            synced += 1
        except Exception as e:
            print(f"Fitbit bulk sync error for workout {workout.id}: {e}")
            not_found += 1

    db.commit()
    return {"synced": synced, "not_found": not_found, "total": len(workouts)}


def _is_gym_activity(activity: dict) -> bool:
    """Returns True for activities that match a pre-planned Calendar gym session."""
    name = activity.get("activityName", "").lower()
    return "weights" in name


def _resolve_activity_name(activity: dict) -> str:
    """Returns a display name, resolving generic Fitbit types via heuristics.

    Fitbit records outdoor runs as 'Workout' (activityTypeId 91060) when using
    a Pixel Watch — there is no finer type in the API response. GPS presence
    is a reliable signal: swimming has no GPS, gym sessions have no GPS, only
    outdoor cardio (running, hiking, cycling) produces GPS tracks.
    """
    name = activity.get("activityName", "Actividad Fitbit")
    if name.lower() == "workout" and activity.get("hasGps"):
        return "Run"
    return name


def _should_skip_activity(activity: dict) -> bool:
    """Returns True for activities that should not generate standalone workouts.

    - Walk: auto-tracked steps by Fitbit, not real exercise sessions.
    - Weights: gym sessions always come from Google Calendar events; bulk sync
      attaches their Fitbit data. Creating a standalone workout here would
      duplicate the Calendar event.
    """
    name = activity.get("activityName", "").lower()
    return name in ("walk", "weights")


def _activity_matches_any_workout(activity: dict, workouts: list) -> bool:
    """Returns True if a Fitbit activity matches any existing DB workout by time.

    Gym (weights): ±3 h window — calendar events are often manually entered
    and can misalign with the actual session time.
    Cardio (run, swim, sport, …): ±2 h window but only against existing
    workouts that already carry the same Fitbit activity name. This catches
    null-logId duplicates left by earlier syncs without blocking a real
    cardio event that happens near a gym session.
    """
    act_name = activity.get("activityName", "")

    try:
        raw_start = activity["startTime"].replace("Z", "+00:00")
        act_start = datetime.fromisoformat(raw_start).replace(tzinfo=None)
        act_end = act_start + timedelta(milliseconds=activity.get("duration", 0))
    except Exception:
        return False

    if _is_gym_activity(activity):
        for w in workouts:
            if abs((act_start - w.start_time).total_seconds()) < 10800:
                return True
            mid = w.start_time + (w.end_time - w.start_time) / 2
            if act_start <= mid <= act_end:
                return True
    else:
        resolved_name = _resolve_activity_name(activity)
        for w in workouts:
            if abs((act_start - w.start_time).total_seconds()) < 7200:
                fd = w.fitbit_data
                if fd and fd.activity_name:
                    stored = fd.activity_name.lower()
                    if stored in (act_name.lower(), resolved_name.lower()):
                        return True
                elif w.title.lower() in (act_name.lower(), resolved_name.lower()):
                    # FitbitData was wiped by a calendar sync — match by title to avoid duplicate
                    return True

    return False


@router.post("/sync-fitbit-create-missing", response_model=dict)
async def sync_fitbit_create_missing(
    days: int = 30,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """
    Fetches recent Fitbit activities and creates workouts for any that
    don't have a matching DB workout within the ±1h time window.
    Also creates Google Calendar events if a calendar is configured.
    """
    user_tokens = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.user_id == current_user.id)
        .first()
    )
    if not user_tokens or not user_tokens.fitbit_access_token:
        return {"created": 0}

    activities = fitbit_utils.get_fitbit_activities_range(db, user_tokens, days)
    if not activities:
        return {"created": 0}

    now = datetime.utcnow()
    cutoff = now - timedelta(days=days)

    existing_log_ids = {
        fd[0]
        for fd in db.query(models.FitbitData.fitbit_log_id)
        .join(models.Workout, models.FitbitData.workout_id == models.Workout.id)
        .filter(models.Workout.user_id == current_user.id)
        .all()
        if fd[0]
    }

    existing = (
        db.query(models.Workout)
        .options(joinedload(models.Workout.fitbit_data))
        .filter(
            models.Workout.user_id == current_user.id,
            models.Workout.start_time >= cutoff,
            models.Workout.start_time <= now,
        )
        .all()
    )

    created = 0
    for activity in activities:
        if _should_skip_activity(activity):
            continue
        if str(activity.get("logId", "")) in existing_log_ids:
            continue
        if _activity_matches_any_workout(activity, existing):
            continue

        try:
            raw_start = activity["startTime"].replace("Z", "+00:00")
            act_start = datetime.fromisoformat(raw_start).replace(tzinfo=None)
            act_end = act_start + timedelta(milliseconds=activity.get("duration", 0))
        except Exception:
            continue

        activity_name = _resolve_activity_name(activity)
        workout = models.Workout(
            user_id=current_user.id,
            start_time=act_start,
            end_time=act_end,
            title=activity_name,
        )
        db.add(workout)
        db.flush()

        azm = fitbit_utils.extract_azm(activity)
        fitbit_data = models.FitbitData(
            workout_id=workout.id,
            fitbit_log_id=str(activity.get("logId", "")),
            calories=activity.get("calories", 0),
            heart_rate_avg=activity.get("averageHeartRate", 0),
            duration_ms=activity.get("duration", 0),
            distance_km=activity.get("distance", 0.0),
            elevation_gain_m=activity.get("elevationGain", 0.0),
            activity_name=activity_name,
            azm_fat_burn=azm.get("fatBurnMinutes", 0),
            azm_cardio=azm.get("cardioMinutes", 0),
            azm_peak=azm.get("peakMinutes", 0),
            has_gps=bool(activity.get("hasGps", False)),
        )
        db.add(fitbit_data)
        db.flush()
        workout.fitbit_data = fitbit_data

        act_name_lower = activity_name.lower()
        if "weights" not in act_name_lower and "walk" not in act_name_lower:
            cardio_ex = db.query(models.Exercise).filter(models.Exercise.name == "cardio").first()
            if cardio_ex:
                db.add(
                    models.ExerciseSet(
                        workout_id=workout.id,
                        exercise_id=cardio_ex.id,
                        value=str(activity.get("duration", 0) // 60000),
                        measurement="min",
                        is_completed=True,
                    )
                )

        if user_tokens.selected_calendar_id:
            try:
                update_google_calendar_event(db, user_tokens, workout, fitbit_data)
            except Exception as e:
                print(f"Calendar sync error for Fitbit activity {activity.get('logId')}: {e}")

        existing.append(workout)
        created += 1

    db.commit()
    return {"created": created}


@router.put("/{workout_id}", response_model=schemas.Workout)
async def update_workout(
    workout_id: str,
    workout_update: schemas.WorkoutUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Updates an existing workout for the current user.
    Handles updates to exercise sets, auto-syncs Fitbit data if connected,
    and updates the corresponding Google Calendar event.
    """
    db_workout = db.query(models.Workout).filter(models.Workout.id == workout_id, models.Workout.user_id == current_user.id).first()
    if not db_workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    
    db_workout.start_time = workout_update.start_time
    db_workout.end_time = workout_update.end_time
    db_workout.title = workout_update.title
    
    # Refresh sets: drop and recreate (as per original logic)
    db.query(models.ExerciseSet).filter(models.ExerciseSet.workout_id == workout_id).delete(synchronize_session=False)
    db.flush() # Ensure deletions are processed before adding new ones
    
    for es in workout_update.exercise_sets:
        db_set = models.ExerciseSet(
            workout_id=db_workout.id,
            exercise_id=es.exercise_id,
            value=es.value,
            measurement=es.measurement,
            is_completed=es.is_completed
        )
        db.add(db_set)
    
    # Auto-sync Fitbit if connected and update FitbitData
    user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == current_user.id).first()
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
                
                db.flush() # Flush to get fitbit_data.id if new
                db_workout.fitbit_data = fitbit_data

                # Cardio Logic: If activity is not Weights or Walk, add a 'cardio' exercise set
                act_name_lower = fitbit_data.activity_name.lower()
                if "weights" not in act_name_lower and "walk" not in act_name_lower:
                    # Ensure 'cardio' exercise exists, create if not (only if current_user is root)
                    cardio_ex = db.query(models.Exercise).filter(models.Exercise.name == "cardio").first()
                    if not cardio_ex:
                        muscle_for_cardio = db.query(models.Muscle).filter(models.Muscle.name == "abdominales").first() # Arbitrary muscle
                        if muscle_for_cardio and current_user.is_root == 1: # Only root can create automatically
                             cardio_ex = models.Exercise(name="cardio", muscle_id=muscle_for_cardio.id)
                             db.add(cardio_ex)
                             db.flush()

                    if cardio_ex:
                        # Check if cardio set already exists for this workout
                        existing_cardio_set = db.query(models.ExerciseSet).filter(
                            models.ExerciseSet.workout_id == workout_id,
                            models.ExerciseSet.exercise_id == cardio_ex.id
                        ).first()
                        if not existing_cardio_set:
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

    db.commit() # Commit all changes from update and potential Fitbit sync
    db.refresh(db_workout) # Refresh to load relationships updated by Fitbit sync
    
    # Sync to Google Calendar (after all other updates)
    if user_tokens and user_tokens.selected_calendar_id:
        update_google_calendar_event(db, user_tokens, db_workout, db_workout.fitbit_data)
        db.commit() # Commit again to save google_event_id if created or updated

    db.refresh(db_workout) # Final refresh to ensure latest state including calendar_event_id
    return db_workout

@router.delete("/{workout_id}", response_model=dict)
async def delete_workout(
    workout_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Deletes a workout for the current user.
    Also deletes the corresponding Google Calendar event if it exists.
    """
    db_workout = db.query(models.Workout).filter(models.Workout.id == workout_id, models.Workout.user_id == current_user.id).first()
    if not db_workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    
    # Delete from Google Calendar
    if db_workout.google_event_id:
        user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == current_user.id).first()
        if user_tokens and user_tokens.selected_calendar_id:
            creds = get_google_credentials(user_tokens, db)
            if creds:
                service = build('calendar', 'v3', credentials=creds)
                try:
                    calendar_id = user_tokens.selected_calendar_id or 'primary'
                    service.events().delete(calendarId=calendar_id, eventId=db_workout.google_event_id).execute()
                except Exception as e:
                    print(f"Failed to delete Google Calendar event {db_workout.google_event_id}: {e}")
            
    db.delete(db_workout)
    db.commit()
    return {"message": "Workout deleted"}

@router.post("/{workout_id}/sync-fitbit", response_model=schemas.FitbitData)
async def sync_fitbit_to_workout(
    workout_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Manually syncs Fitbit activity data to a specific workout.
    Fetches activity from Fitbit within the workout's time range and associates it.
    """
    db_workout = db.query(models.Workout).filter(models.Workout.id == workout_id, models.Workout.user_id == current_user.id).first()
    if not db_workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    
    user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == current_user.id).first()
    if not user_tokens or not user_tokens.fitbit_access_token:
        raise HTTPException(status_code=400, detail="Fitbit not connected or token invalid")
    
    activity = fitbit_utils.get_fitbit_activity(db, user_tokens, db_workout.start_time, db_workout.end_time)
    if not activity:
        raise HTTPException(status_code=404, detail="No matching Fitbit activity found for this workout time")
    
    # Idempotent check: update existing FitbitData or create new
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
        if not cardio_ex:
            muscle_for_cardio = db.query(models.Muscle).filter(models.Muscle.name == "abdominales").first() # Arbitrary muscle
            if muscle_for_cardio and current_user.is_root == 1: # Only root can create automatically
                cardio_ex = models.Exercise(name="cardio", muscle_id=muscle_for_cardio.id)
                db.add(cardio_ex)
                db.flush()

        if cardio_ex:
            existing_cardio_set = db.query(models.ExerciseSet).filter(
                models.ExerciseSet.workout_id == workout_id,
                models.ExerciseSet.exercise_id == cardio_ex.id
            ).first()
            if not existing_cardio_set:
                db_set = models.ExerciseSet(
                    workout_id=workout_id,
                    exercise_id=cardio_ex.id,
                    value=str(fitbit_data.duration_ms // 60000),
                    measurement="min",
                    is_completed=True
                )
                db.add(db_set)
                db.commit() # Commit the new cardio set
    
    # Update Calendar event with new metrics
    if user_tokens and user_tokens.selected_calendar_id:
        db_workout = db.query(models.Workout).options(joinedload(models.Workout.fitbit_data)).filter(models.Workout.id == workout_id).first()
        update_google_calendar_event(db, user_tokens, db_workout, db_workout.fitbit_data)
        db.commit()

    return fitbit_data

@router.get("/{workout_id}/route", response_model=List[dict])
async def get_workout_route(
    workout_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """
    Returns GPS trackpoints for a workout that has Fitbit GPS data.
    Each point is {lat, lon, ele}. Requires Fitbit location scope.
    """
    workout = (
        db.query(models.Workout)
        .options(joinedload(models.Workout.fitbit_data))
        .filter(models.Workout.id == workout_id, models.Workout.user_id == current_user.id)
        .first()
    )
    if not workout or not workout.fitbit_data or not workout.fitbit_data.fitbit_log_id:
        raise HTTPException(status_code=404, detail="No GPS route available for this workout")

    user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == current_user.id).first()
    if not user_tokens or not user_tokens.fitbit_access_token:
        raise HTTPException(status_code=400, detail="Fitbit not connected")

    points = fitbit_utils.get_fitbit_route(db, user_tokens, workout.fitbit_data.fitbit_log_id)
    if not points:
        raise HTTPException(status_code=404, detail="No GPS trackpoints found — reconnect Fitbit with location scope")
    return points


@router.get("/test-parse", response_model=List[dict])
async def test_parse_calendar_events(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Temporary endpoint to fetch raw calendar events and return their parsed results
    for debugging the parser.
    """
    user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == current_user.id).first()
    if not user_tokens or not user_tokens.google_access_token:
        raise HTTPException(status_code=400, detail="Google Calendar not connected.")
    
    creds = get_google_credentials(user_tokens, db)
    if not creds:
        raise HTTPException(status_code=400, detail="Could not refresh Google credentials.")

    service = build('calendar', 'v3', credentials=creds)
    calendar_id = user_tokens.selected_calendar_id or 'primary'
    
    # Fetch recent events (e.g., last 90 days)
    time_min_dt = datetime.utcnow() - timedelta(days=90)
    time_min = time_min_dt.isoformat() + "Z"
    
    try:
        events_result = service.events().list(
            calendarId=calendar_id, timeMin=time_min,
            singleEvents=True, orderBy='startTime',
            maxResults=100
        ).execute()
        events = events_result.get('items', [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch calendar events: {str(e)}")

    muscle_map = {m.name.lower(): m.id for m in db.query(models.Muscle).all()}
    
    results = []
    for event in events:
        desc = event.get('description', '')
        summary = event.get('summary', 'Workout')
        
        is_gymhub_tagged = "[GymHub]" in desc or "[gymhub]" in desc.lower()
        has_workout_format = " - " in desc and any(m in desc.lower() for m in muscle_map.keys())
        is_leg_day = "pierna" in summary.lower()
        
        if not (is_gymhub_tagged or has_workout_format or is_leg_day):
            continue
            
        sync_result = calendar_utils.parse_calendar_description(desc, muscle_map, title=summary)
        
        results.append({
            "id": event.get('id'),
            "start": event.get('start', {}).get('dateTime', event.get('start', {}).get('date')),
            "summary": summary,
            "raw_description": desc,
            "parsed_sets": sync_result["sets"],
            "parsed_fitbit": sync_result["fitbit"],
        })
        
    return results

@router.get("/sync-all", response_model=dict)
async def sync_all_from_calendar(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db)
):
    """
    Synchronizes all relevant workouts from Google Calendar for the current user.
    Parses event descriptions to create/update local workouts, including Fitbit data,
    and handles deletion of orphaned local workouts.
    """
    user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == current_user.id).first()
    if not user_tokens:
        print("DEBUG: No user tokens found for user.")
        raise HTTPException(status_code=400, detail="Google Calendar not connected: No user tokens found.")
        
    if not user_tokens.google_access_token:
        print("DEBUG: User has no google_access_token.")
        raise HTTPException(status_code=400, detail="Google Calendar not connected: Missing access token.")
    
    creds = get_google_credentials(user_tokens, db)
    if not creds:
        print("DEBUG: Failed to get or refresh Google credentials.")
        raise HTTPException(status_code=400, detail="Could not refresh Google credentials. Please reconnect your Google account.")

    service = build('calendar', 'v3', credentials=creds)

    calendar_id = user_tokens.selected_calendar_id or 'primary'

    all_events = []
    next_sync_token = None
    is_incremental = bool(user_tokens.google_calendar_sync_token)
    time_min_dt = None  # only set for full sync (used later in orphan cleanup)

    # --- Incremental sync via syncToken ---
    if is_incremental:
        try:
            page_token = None
            while True:
                kwargs: dict = {
                    "calendarId": calendar_id,
                    "syncToken": user_tokens.google_calendar_sync_token,
                    "singleEvents": True,
                    "showDeleted": True,
                }
                if page_token:
                    kwargs["pageToken"] = page_token
                result = service.events().list(**kwargs).execute()
                all_events.extend(result.get("items", []))
                page_token = result.get("nextPageToken")
                next_sync_token = result.get("nextSyncToken", next_sync_token)
                if not page_token:
                    break
        except HttpError as e:
            if e.resp.status == 410:
                # Token expired or invalidated — fall back to full sync
                user_tokens.google_calendar_sync_token = None
                is_incremental = False
                all_events = []
            else:
                raise HTTPException(status_code=500, detail=f"Calendar sync error: {e}")

    # --- Full sync (first time or after token expiry) ---
    if not is_incremental:
        sync_days = 730
        time_min_dt = datetime.utcnow() - timedelta(days=sync_days)
        time_min = time_min_dt.isoformat() + "Z"
        try:
            page_token = None
            while True:
                result = service.events().list(
                    calendarId=calendar_id,
                    timeMin=time_min,
                    singleEvents=True,
                    orderBy="startTime",
                    showDeleted=True,
                    pageToken=page_token,
                ).execute()
                all_events.extend(result.get("items", []))
                page_token = result.get("nextPageToken")
                next_sync_token = result.get("nextSyncToken", next_sync_token)
                if not page_token:
                    break
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch calendar events: {str(e)}")

    events = all_events

    processed_count = 0
    calendar_event_ids = set()
    
    # Pre-fetch all muscles and exercises for efficient lookup
    muscle_map = {m.name.lower(): m for m in db.query(models.Muscle).all()}
    exercise_map = {e.name.lower(): e for e in db.query(models.Exercise).all()}

    for event in events:
        desc = event.get('description', '')
        event_id = event.get('id')
        calendar_event_ids.add(event_id)

        # Deleted events (status='cancelled') — remove from DB if present
        if event.get('status') == 'cancelled':
            dead = db.query(models.Workout).filter(
                models.Workout.google_event_id == event_id,
                models.Workout.user_id == current_user.id,
            ).first()
            if dead:
                db.delete(dead)
            continue

        # Determine if this is a GymHub event based on tags or format
        is_gymhub_tagged = "[GymHub]" in desc or "[gymhub]" in desc.lower()
        has_workout_format = " - " in desc and any(m in desc.lower() for m in muscle_map.keys())
        
        if not is_gymhub_tagged and not has_workout_format:
            continue
        
        start = event['start'].get('dateTime', event['start'].get('date'))
        end = event['end'].get('dateTime', event['end'].get('date'))
        if not start or not end:
            continue
            
        start_dt = datetime.fromisoformat(start.replace("Z", "+00:00")).replace(tzinfo=None)
        end_dt = datetime.fromisoformat(end.replace("Z", "+00:00")).replace(tzinfo=None)
        
        workout = db.query(models.Workout).filter(models.Workout.google_event_id == event_id, models.Workout.user_id == current_user.id).first()
        if not workout:
            workout = models.Workout(
                user_id=current_user.id,
                google_event_id=event_id,
                start_time=start_dt,
                end_time=end_dt,
                title=event.get('summary', 'Workout')
            )
            db.add(workout)
            db.flush() # Get workout id before adding sets
        else:
            workout.start_time = start_dt
            workout.end_time = end_dt
            workout.title = event.get('summary', 'Workout')
            # Only delete exercise sets — FitbitData is preserved to keep fitbit_log_id and has_gps
            db.query(models.ExerciseSet).filter(models.ExerciseSet.workout_id == workout.id).delete(synchronize_session=False)
            db.flush()

        # Parse exercises and fitbit from description using calendar_utils
        summary_title = event.get('summary', 'Workout')
        sync_result = calendar_utils.parse_calendar_description(desc, {name.lower(): m.id for name, m in muscle_map.items()}, title=summary_title)
        parsed_sets = sync_result["sets"]
        parsed_fitbit_data = sync_result["fitbit"]
        
        # Handle "Pierna" alias in title if no sets were parsed (Planning mode)
        # We don't necessarily add empty sets, but the frontend will know via the title.
        # But if we want the "points" in calendar to show all muscles, we might need a way.
        # For now, title-based logic in frontend is easier.
        
        sets_added_to_workout = 0
        for ps in parsed_sets:
            muscle_obj = muscle_map.get(ps["muscle_name"].lower() if ps.get("muscle_name") else "")
            if not muscle_obj:
                if current_user.is_root == 1 and ps.get("muscle_name"):
                    new_muscle = models.Muscle(name=ps["muscle_name"].strip())
                    db.add(new_muscle)
                    db.flush()
                    muscle_map[new_muscle.name.lower()] = new_muscle
                    muscle_obj = new_muscle
                else:
                    continue

            exercise_obj = exercise_map.get(ps["exercise_name"].lower())
            
            if not exercise_obj:
                # Auto-create exercise if root user, otherwise skip
                if current_user.is_root == 1:
                    new_ex = models.Exercise(name=ps["exercise_name"].strip(), muscle_id=muscle_obj.id)
                    db.add(new_ex)
                    db.flush() # Get ID for the new exercise
                    exercise_obj = new_ex
                    exercise_map[new_ex.name.lower()] = new_ex # Add to map for subsequent uses
                    print(f"Sync (Root): Created missing exercise '{new_ex.name}' for muscle '{muscle_obj.name}'")
                else:
                    print(f"Sync (User): Found new exercise '{ps['exercise_name']}' but not created (not root)")
                    continue 
            
            db_set = models.ExerciseSet(
                workout_id=workout.id,
                exercise_id=exercise_obj.id,
                value=ps["value"],
                measurement=ps["measurement"],
                is_completed=ps.get("is_completed", False)
            )
            db.add(db_set)
            sets_added_to_workout += 1
        
        # Save parsed Fitbit data — update existing record to preserve fitbit_log_id/has_gps
        if parsed_fitbit_data:
            existing_fd = workout.fitbit_data
            if existing_fd:
                existing_fd.calories = parsed_fitbit_data.get("calories", existing_fd.calories)
                existing_fd.heart_rate_avg = parsed_fitbit_data.get("heart_rate_avg", existing_fd.heart_rate_avg)
                existing_fd.duration_ms = parsed_fitbit_data.get("duration_ms", existing_fd.duration_ms)
                existing_fd.distance_km = parsed_fitbit_data.get("distance_km", existing_fd.distance_km)
                existing_fd.elevation_gain_m = parsed_fitbit_data.get("elevation_gain_m", existing_fd.elevation_gain_m)
                existing_fd.activity_name = parsed_fitbit_data.get("activity_name", existing_fd.activity_name)
                existing_fd.azm_fat_burn = parsed_fitbit_data.get("azm_fat_burn", existing_fd.azm_fat_burn)
                existing_fd.azm_cardio = parsed_fitbit_data.get("azm_cardio", existing_fd.azm_cardio)
                existing_fd.azm_peak = parsed_fitbit_data.get("azm_peak", existing_fd.azm_peak)
            else:
                db_fitbit = models.FitbitData(
                    workout_id=workout.id,
                    calories=parsed_fitbit_data.get("calories", 0),
                    heart_rate_avg=parsed_fitbit_data.get("heart_rate_avg", 0),
                    duration_ms=parsed_fitbit_data.get("duration_ms", 0),
                    distance_km=parsed_fitbit_data.get("distance_km", 0.0),
                    elevation_gain_m=parsed_fitbit_data.get("elevation_gain_m", 0.0),
                    activity_name=parsed_fitbit_data.get("activity_name", "Unknown"),
                    azm_fat_burn=parsed_fitbit_data.get("azm_fat_burn", 0),
                    azm_cardio=parsed_fitbit_data.get("azm_cardio", 0),
                    azm_peak=parsed_fitbit_data.get("azm_peak", 0),
                )
                db.add(db_fitbit)
        
        if sets_added_to_workout > 0 or parsed_fitbit_data:
            processed_count += 1
            
    # Orphan cleanup only on full sync (incremental gets deletions via status='cancelled')
    deleted_count = 0
    if not is_incremental and time_min_dt:
        local_workouts = db.query(models.Workout).filter(
            models.Workout.user_id == current_user.id,
            models.Workout.google_event_id.isnot(None),
            models.Workout.start_time >= time_min_dt,
        ).all()
        for lw in local_workouts:
            if lw.google_event_id not in calendar_event_ids:
                db.delete(lw)
                deleted_count += 1

    # Persist the new sync token for next incremental sync
    if next_sync_token:
        user_tokens.google_calendar_sync_token = next_sync_token

    db.commit()
    sync_type = "incremental" if is_incremental else "full"
    msg = f"Successfully synced {processed_count} workouts from Google Calendar ({sync_type})"
    if deleted_count > 0:
        msg += f" (deleted {deleted_count} orphaned workouts)"
    return {"message": msg}
