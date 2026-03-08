import datetime
import logging
from sqlalchemy.orm import Session
from app.models import User, Workout, ExerciseSet, FitbitData
from .workout_parser import WorkoutParser
from .google_calendar import GoogleCalendarService
from .fitbit import FitbitService

logger = logging.getLogger(__name__)

def parse_muscle_groups(title: str) -> str:
    """
    Extracts muscle group names from a workout title and normalizes them.
    """
    import re
    parts = re.split(r'[/\-,+]|\by\b', title, flags=re.IGNORECASE)
    normalized = []
    for p in parts:
        if p.strip():
            normalized.append(WorkoutParser.normalize_muscle(p.strip()))
    
    # Unique parts
    unique = []
    for p in normalized:
        if p not in unique:
            unique.append(p)
    return ','.join(unique)

def unify_cardio_sessions(user: User, db: Session):
    """
    Standardize all 'Circuito' or 'Cardio' related sessions to the official 'Cardio' group.
    Also attempts to update Google Calendar titles for persistence.
    """
    logger.info(f"Unifying cardio sessions for {user.email}")
    workouts = db.query(Workout).filter(Workout.user_email == user.email).all()
    count = 0
    
    cal_service = None
    if user.google_access_token and user.selected_calendar_id:
        try:
            cal_service = GoogleCalendarService(user, db)
        except Exception as e:
            logger.error(f"Could not init calendar service for unification: {e}")

    for w in workouts:
        original_title = w.title
        original_muscles = w.muscle_groups or ""
        
        # Check if it needs unification: if it has "circuito", "circuit", or "cardio" in title
        title_norm = original_title.lower()
        needs_update = False
        if "circuito" in title_norm or "circuit" in title_norm or "cardio" in title_norm:
            needs_update = True
        
        if needs_update:
            import re
            new_title = original_title
            # Normalize Circuito/Circuit to Cardio
            if "circuito" in title_norm:
                new_title = re.sub(r'(?i)circuito', 'Cardio', original_title)
            elif "circuit" in title_norm:
                new_title = re.sub(r'(?i)circuit', 'Cardio', original_title)
            
            # Ensure "Cardio" is at least present
            if "Cardio" not in new_title:
                new_title = f"Cardio - {new_title}"

            if w.title != new_title or w.muscle_groups != "Cardio":
                w.title = new_title
                w.muscle_groups = "Cardio"
                db.commit()
                count += 1
                
                if cal_service and w.google_event_id:
                    try:
                        cal_service.update_event(w.google_event_id, title=new_title, calendar_id=user.selected_calendar_id)
                        logger.info(f"Updated Google Calendar event {w.google_event_id} to '{new_title}'")
                    except Exception as e:
                        logger.error(f"Failed to update calendar event {w.google_event_id}: {e}")
                    
    return count

def update_exercises_from_text(workout: Workout, text: str, db: Session):
    """
    Parses text into exercises and replaces existing sets for a workout.
    """
    db.query(ExerciseSet).filter(ExerciseSet.workout_id == workout.id).delete()
    exercises = WorkoutParser.parse_description(text)
    for ex in exercises:
        ex_set = ExerciseSet(workout_id=workout.id, **ex)
        db.add(ex_set)
    db.commit()

def sync_data_for_user(user: User, db: Session):
    """
    Bidirectional Sync:
    - Fetches Calendar events.
    - If event ID matches an existing Workout, update local data.
    - If event is NEW, create local Workout.
    """
    logger.info(f"Syncing data for user: {user.email}")
    if not user.google_access_token:
        logger.warning(f"User {user.email} has no Google token. Skipping sync.")
        return
    if not user.selected_calendar_id:
        logger.warning(f"User {user.email} has no selected calendar. Skipping sync.")
        return

    try:
        cal_service = GoogleCalendarService(user, db)
        cal_id = user.selected_calendar_id
        # Pull 10 years of history to ensure we catch all unifications
        recent_events = cal_service.get_recent_events(days=3650, calendar_id=cal_id)

        for event in recent_events:
            event_id = event.get('id')
            title = event.get('summary', 'Sin Título')
            description = event.get('description', '') or ''

            # Skip events with no workout data (birthdays, reminders, etc.)
            event_is_valid = '[GymHub]' in description or 'Fitbit' in description or '\u2705' in description
            if not event_is_valid:
                continue

            # Check if we already have this workout
            workout = db.query(Workout).filter(Workout.google_event_id == event_id).first()

            if workout:
                # Update existing workout if changed
                if workout.title != title:
                    workout.title = title
                    db.commit()
                update_exercises_from_text(workout, description, db)
            else:
                # Create new workout from calendar event
                start_time_str = event['start'].get('dateTime', event['start'].get('date'))
                if 'T' in start_time_str:
                    start_time = datetime.datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
                else:
                    start_time = datetime.datetime.fromisoformat(start_time_str)

                end_time_str = event.get('end', {}).get('dateTime', event.get('end', {}).get('date'))
                end_time = None
                if end_time_str:
                    if 'T' in end_time_str:
                        end_time = datetime.datetime.fromisoformat(end_time_str.replace('Z', '+00:00'))
                    else:
                        end_time = datetime.datetime.fromisoformat(end_time_str)

                new_workout = Workout(
                    user_email=user.email,
                    title=title,
                    muscle_groups=parse_muscle_groups(title),
                    date=start_time,
                    start_time=start_time,
                    end_time=end_time,
                    source="calendar",
                    google_event_id=event_id
                )
                db.add(new_workout)
                db.commit()
                db.refresh(new_workout)

                update_exercises_from_text(new_workout, description, db)

    except Exception as e:
        logger.error(f"Sync failed for {user.email}: {e}")

    # After syncing Google Calendar, automatically unify cardio sessions
    unify_cardio_sessions(user, db)
    
    # Then sync Fitbit metrics
    sync_fitbit_for_user(user, db)

ACTIVITY_MAP_ES = {
    "Swim": "Natación",
    "Pool": "Natación",
    "Run": "Carrera",
    "Running": "Carrera",
    "Bike": "Ciclismo",
    "Cycling": "Ciclismo",
    "Bici": "Ciclismo",
    "Weights": "Pesas",
    "Sport": "Deportes",
    "Workout": "Entrenamiento",
    "Aerobic": "Cardio Aeróbico",
    "Elliptical": "Elíptica",
    "Treadmill": "Cinta",
    "Yoga": "Yoga",
    "Pilates": "Pilates",
    "Circuit": "Cardio (Circuito)",
    "Abs": "Abdominales",
    "Core": "Abdominales",
    "High Intensity": "HIIT",
    "HIIT": "HIIT",
}

def translate_activity(name: str) -> str:
    if not name: return "Cardio"
    # If the name is literally just 'Sport' or 'Workout', it's generic.
    name_check = name.strip().lower()
    
    for eng, es in ACTIVITY_MAP_ES.items():
        if eng.lower() in name_check:
            # For 'Sport', if the original name has more info (like 'Sport - Tennis'), keep some parts if possible.
            # But usually it's just 'Sport'.
            if eng.lower() == "sport" and name_check != "sport":
                 continue
            return es
    return name

def sync_fitbit_for_user(user: User, db: Session):
    if not user.fitbit_access_token:
        return

    logger.info(f"Syncing Fitbit for {user.email}...")
    try:
        # Fetch activities from the last 60 days to be safe
        after_date = (datetime.datetime.now() - datetime.timedelta(days=60)).strftime("%Y-%m-%d")

        try:
            activities = FitbitService.fetch_recent_activities(user.fitbit_access_token, after_date)
        except Exception as e:
            logger.error(f"Fitbit fetch failed, attempting to refresh token: {e}")
            if user.fitbit_refresh_token:
                # Refrescar token usando FitbitService
                tokens = FitbitService.refresh_token(user.fitbit_refresh_token)
                user.fitbit_access_token = tokens.get("access_token")
                user.fitbit_refresh_token = tokens.get("refresh_token")
                db.commit()
                activities = FitbitService.fetch_recent_activities(user.fitbit_access_token, after_date)
            else:
                return

        user_workouts = db.query(Workout).filter(Workout.user_email == user.email).all()
        linked_workout_ids = set()

        # Prioritize activity names: Weights > Sport > Others > Walk
        def activity_priority(a):
            name = (a.get("activityName") or "").lower()
            if any(key in name for key in ["weight", "sport", "workout"]): return 0
            if any(key in name for key in ["run", "swim", "bike", "bici", "piscina"]): return 1
            if any(key in name for key in ["walk", "caminata"]): return 99
            return 2

        # Sort: priority first, then most recent first
        activities.sort(key=lambda x: (activity_priority(x), x.get("startTime", "")), reverse=True)
        # Flip to process highest priority first
        activities.sort(key=lambda x: activity_priority(x))

        for act in activities:
            name = (act.get("activityName") or "").lower()
            if any(k in name for k in ["walk", "caminata"]):
                continue # Skip walks entirely

            start_str = act.get("startTime")
            if not start_str:
                continue

            log_id = str(act.get("logId", ""))
            fitbit_start = _parse_fitbit_datetime(start_str)

            # Check by logId first (most reliable deduplication)
            existing_by_log = (
                db.query(FitbitData).filter(FitbitData.fitbit_log_id == log_id).first()
                if log_id else None
            )

            # Find the matching workout by time proximity
            matching_workout = _find_best_matching_workout(
                fitbit_start, act.get("duration", 0), user_workouts
            )

            if not matching_workout:
                # Do not create standalone cardio events for generic daily activities
                activity_name_lower = (act.get("activityName") or "").lower()
                generic_names = ["sport", "workout", "aerobic workout"]
                if any(g in activity_name_lower for g in generic_names):
                    logger.info(f"Skipping standalone creation for generic activity: {act.get('activityName')}")
                    continue

                # Create a standalone workout for high-value activities
                duration_ms = act.get("duration", 0)
                end_time = fitbit_start + datetime.timedelta(milliseconds=duration_ms)
                
                logger.info(f"  Creating standalone Cardio workout for {act.get('activityName')}")
                translated = translate_activity(act.get("activityName"))
                
                event_id = None
                if user.google_access_token and user.selected_calendar_id:
                    try:
                        cal_service = GoogleCalendarService(user, db)
                        event_id = cal_service.create_event(
                            title=translated,
                            description=f"[GymHub]\nActividad sincronizada automáticamente desde Fitbit:\n{act.get('activityName')}",
                            start_time=fitbit_start,
                            end_time=end_time,
                            calendar_id=user.selected_calendar_id
                        )
                        logger.info(f"    Created Google Calendar event {event_id} para {translated}")
                    except Exception as e:
                        logger.error(f"    Failed to create Google Calendar event for Fitbit activity: {e}")

                matching_workout = Workout(
                    user_email=user.email,
                    date=fitbit_start,
                    start_time=fitbit_start,
                    end_time=end_time,
                    source="fitbit",
                    title=translated,
                    muscle_groups="Cardio",
                    google_event_id=event_id
                )
                db.add(matching_workout)
                db.commit()
                db.refresh(matching_workout)
                user_workouts.append(matching_workout)

            # Parse Active Zone Minutes
            azm = act.get("activeZoneMinutes", {})
            azm_zones = {z["zoneName"]: z["minutes"] for z in azm.get("minutesInHeartRateZones", [])}

            fields = {
                "fitbit_log_id": log_id,
                "calories": act.get("calories"),
                "heart_rate_avg": act.get("averageHeartRate"),
                "duration_ms": act.get("duration"),
                "steps": act.get("steps"),
                "distance_km": act.get("distance"),
                "elevation_gain_m": act.get("elevationGain"),
                "activity_name": act.get("activityName"),
                "azm_fat_burn": azm_zones.get("Fat Burn", 0),
                "azm_cardio": azm_zones.get("Cardio", 0),
                "azm_peak": azm_zones.get("Peak", 0),
            }

            if existing_by_log:
                for k, v in fields.items():
                    setattr(existing_by_log, k, v)
            else:
                existing_data = db.query(FitbitData).filter(FitbitData.workout_id == matching_workout.id).first()
                if not existing_data:
                    db.add(FitbitData(workout_id=matching_workout.id, **fields))
                else:
                    for k, v in fields.items():
                        setattr(existing_data, k, v)
            
            db.commit()
            linked_workout_ids.add(matching_workout.id)

    except Exception as e:
        logger.error(f"Fitbit sync error for {user.email}: {e}")

def _parse_fitbit_datetime(dt_str: str):
    """Parse Fitbit's ISO datetime string (with timezone offset) to a naive UTC datetime."""
    if not dt_str:
        return None
    try:
        # e.g. "2026-02-09T15:38:39.254+01:00"
        import datetime as dt_mod
        dt = dt_mod.datetime.fromisoformat(dt_str)
        # Convert to UTC
        if dt.tzinfo is not None:
            dt = dt.astimezone(dt_mod.timezone.utc).replace(tzinfo=None)
        return dt
    except Exception:
        return None

def _find_best_matching_workout(fitbit_start: datetime.datetime, fitbit_duration_ms: int,
                                 workouts: list, max_gap_hours: float = 4.0):
    if not fitbit_start:
        return None

    date_only = fitbit_start.strftime("%Y-%m-%d")
    fitbit_duration = datetime.timedelta(milliseconds=fitbit_duration_ms or 0)
    fitbit_end = fitbit_start + fitbit_duration

    same_day = [
        w for w in workouts
        if w.date and w.date.strftime("%Y-%m-%d") == date_only
    ]

    if not same_day:
        return None

    # 1. Prefer a workout that time-overlaps with the Fitbit activity
    for w in same_day:
        w_start = w.start_time or w.date
        w_end = w.end_time or (w_start + datetime.timedelta(hours=2))

        if w_start <= fitbit_end and w_end >= fitbit_start:
            return w

    # 2. Closest by start time within max_gap_hours
    max_gap = datetime.timedelta(hours=max_gap_hours)
    best = None
    best_gap = max_gap + datetime.timedelta(seconds=1)
    for w in same_day:
        w_start = w.start_time or w.date
        gap = abs(w_start - fitbit_start)
        if gap < best_gap:
            best_gap = gap
            best = w

    return best
