import datetime
import logging
from typing import List, Optional
from sqlalchemy.orm import Session
from app.models import User, Workout, ExerciseSet, FitbitData
from .workout_parser import WorkoutParser
from .google_calendar import GoogleCalendarService
from .fitbit import FitbitService

logger = logging.getLogger(__name__)

def parse_muscle_groups(title: str, exercise_muscles: List[str] = None) -> List[str]:
    """
    Extracts muscle group names from a workout title and normalizes them.
    If exercise_muscles is provided, it merges them.
    Returns a list of unique muscle names.
    """
    import re
    parts = re.split(r'[/\-,+]|\by\b', title, flags=re.IGNORECASE)
    normalized = []
    
    # Muscle expansion map (e.g. "Pierna" is a category, not a single muscle)
    LEG_MUSCLES = ["Cuadriceps", "Gluteo", "Isquiotibiales", "Gemelos"]
    
    # Muscle aliases for normalization
    aliases = {
        "Piernas": "PIERNA_CAT", "Pierna": "PIERNA_CAT",
        "Bíceps": "Biceps", "Biceps": "Biceps",
        "Tríceps": "Triceps", "Triceps": "Triceps",
        "Abdomen": "Abdominales", "Abdominales": "Abdominales",
        "Gluteo": "Gluteo", "Glúteo": "Gluteo", 
        "Cuadriceps": "Cuadriceps", "Cuádriceps": "Cuadriceps",
        "Femoral": "Isquiotibiales", "Isquios": "Isquiotibiales",
        "Espalda": "Espalda", "Pecho": "Pecho", "Hombro": "Hombro",
        "Gemelos": "Gemelos", "Gemelo": "Gemelos"
    }
    
    def add_muscle(m_name):
        if m_name == "PIERNA_CAT":
            for lm in LEG_MUSCLES:
                if lm not in normalized: normalized.append(lm)
        elif m_name not in normalized:
            normalized.append(m_name)

    # 1. Process title parts
    for p in parts:
        p_clean = p.strip().title()
        if p_clean in aliases:
            add_muscle(aliases[p_clean])
        else:
            # Check for cardio
            cardio_keywords = ["Natacion", "Natación", "Swim", "Pool", "Piscina", "Carrera", "Run", "Running", "Ciclismo", "Bici", "Bike", "Cardio", "Circuito", "Circuit"]
            if any(k.lower() == p_clean.lower() for k in cardio_keywords):
                add_muscle("Cardio")

    # 2. Merge with exercise muscles
    if exercise_muscles:
        for m in exercise_muscles:
            m_norm = m.strip().title()
            if m_norm in aliases:
                add_muscle(aliases[m_norm])
            else:
                add_muscle(m_norm)
    
    # Filter out generic titles
    unique = [p for p in normalized if p.lower() not in ["extra", "gymhub", "entrenamiento"]]
            
    if not unique and any(k.lower() in title.lower() for k in ["cardio", "natacion", "swim", "naco", "piscina", "run", "bike"]):
        return ["Cardio"]
        
    return unique or ["Otros"]

def format_fitbit_metadata(fields: dict, owner_email: str) -> str:
    lines = ["\n\n[Fitbit Metrics]", f"Owner: {owner_email}"]
    if fields.get("calories"): lines.append(f"Calorias: {fields['calories']} kcal")
    if fields.get("heart_rate_avg"): lines.append(f"FC Media: {fields['heart_rate_avg']} bpm")
    if fields.get("steps"): lines.append(f"Pasos: {fields['steps']}")
    if fields.get("distance_km"): lines.append(f"Distancia: {float(fields['distance_km']):.2f} km")
    if fields.get("duration_ms"): lines.append(f"Duracion: {int(fields['duration_ms']/60000)} min")
    if fields.get("activity_name"): lines.append(f"Actividad: {fields['activity_name']}")
    return "\n".join(lines)

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
        
        # Check if it needs unification: if it has "circuito", "circuit", or "cardio" in title
        title_norm = original_title.lower()
        needs_update = False
        cardio_keywords = ["circuito", "circuit", "cardio", "natacion", "swim", "pool", "piscina", "carrera", "run", "ciclismo", "bike", "bici"]
        if any(k in title_norm for k in cardio_keywords):
            needs_update = True
        
        if needs_update:
            import re
            new_title = original_title
            # Normalize popular activity names to 'Cardio'
            cardio_patterns = [r'(?i)circuito', r'(?i)circuit', r'(?i)natacion', r'(?i)natación', r'(?i)swim', r'(?i)piscina', r'(?i)carrera', r'(?i)running', r'(?i)run', r'(?i)ciclismo', r'(?i)bike', r'(?i)bici']
            for pattern in cardio_patterns:
                if re.search(pattern, new_title):
                    new_title = re.sub(pattern, 'Cardio', new_title)
            
            # Remove redundant "Cardio - Cardio" if it happened
            new_title = re.sub(r'Cardio\s*-\s*Cardio', 'Cardio', new_title)
            
            # Ensure it's clean and starts with Cardio if needed, or is just Cardio
            new_title = new_title.strip()
            if not new_title or new_title.lower() == "cardio":
                new_title = "Cardio"
            elif "Cardio" not in new_title:
                new_title = f"Cardio - {new_title}"

            if w.title != new_title:
                w.title = new_title
                w.sync_muscles(["Cardio"], db)
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
    Also parses Fitbit metrics if present in text to reconstruct local metrics if missing.
    """
    db.query(ExerciseSet).filter(ExerciseSet.workout_id == workout.id).delete()
    exercises = WorkoutParser.parse_description(text)
    for ex in exercises:
        ex_set = ExerciseSet(workout_id=workout.id, **ex)
        db.add(ex_set)
    
    # Reconstruction logic: Parse Fitbit metrics from text
    # We only reconstruct if the user is currently connected to Fitbit,
    # as per user request to hide fitbit data/events when session is not started.
    from app.core.database import SessionLocal
    from app.models import User
    
    can_reconstruct = False
    with SessionLocal() as session:
        user = session.query(User).filter(User.email == workout.user_email).first()
        if user and user.fitbit_access_token:
            can_reconstruct = True

    if "[Fitbit Metrics]" in text and can_reconstruct:
        try:
            import re
            # Check if metrics already exist to avoid duplicate/overwrite unless necessary
            existing_metrics = db.query(FitbitData).filter(FitbitData.workout_id == workout.id).first()
            
            # Security Check: Only reconstruct if the owner in description matches the current workout owner
            owner_match = re.search(r'Owner: ([\w\.-]+@[\w\.-]+)', text)
            
            if owner_match:
                extracted_owner = owner_match.group(1).lower()
                if extracted_owner != workout.user_email.lower():
                    if existing_metrics:
                        logger.warning(f"Purging foreign FitbitData for workout {workout.id} (belonged to {extracted_owner})")
                        db.delete(existing_metrics)
                        db.commit()
                    return
            else:
                # If metrics are present but Owner tag is missing, it's safer to skip reconstruction
                # to prevent attribution error in shared calendars for legacy events.
                if not existing_metrics:
                    logger.info(f"Skipping legacy Fitbit metrics for workout {workout.id}: Missing Owner tag.")
                    return

            if not existing_metrics:
                fields = {}
                lines = text.split('\n')
                for line in lines:
                    line = line.strip()
                    if "Calorias:" in line: fields["calories"] = float(re.search(r'Calorias: ([\d.]+)', line).group(1))
                    if "FC Media:" in line: fields["heart_rate_avg"] = float(re.search(r'FC Media: ([\d.]+)', line).group(1))
                    if "Pasos:" in line: fields["steps"] = int(re.search(r'Pasos: (\d+)', line).group(1))
                    if "Distancia:" in line: fields["distance_km"] = float(re.search(r'Distancia: ([\d.]+)', line).group(1))
                    if "Duracion:" in line: fields["duration_ms"] = int(re.search(r'Duracion: (\d+)', line).group(1)) * 60000
                    if "Actividad:" in line: fields["activity_name"] = line.split("Actividad: ")[1].strip() if "Actividad: " in line else "Cardio"
                
                if fields:
                    db.add(FitbitData(workout_id=workout.id, **fields))
                    logger.info(f"Reconstructed Fitbit metrics from description for workout {workout.id}")
        except Exception as e:
            logger.error(f"Failed to reconstruct Fitbit metrics from text for workout {workout.id}: {e}")

    db.commit()

    # Derived muscles from exercises
    ex_muscles = [ex["muscle_group"] for ex in exercises if ex.get("muscle_group")]
    new_muscles = parse_muscle_groups(workout.title, ex_muscles)
    workout.sync_muscles(new_muscles, db)
    db.commit()

    # Fallback to 'Cardio' if no structured exercises were found
    if not exercises:
        has_cardio = False
        for m in workout.muscles:
            if m.name == "Cardio":
                has_cardio = True
                break
        
        if not has_cardio:
            title_norm = workout.title.lower()
            if any(k in title_norm for k in ["natacion", "swim", "run", "bike", "cardio", "piscina"]):
                 workout.sync_muscles(["Cardio"], db)
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
        
        # Keep track of synced IDs to prune obsolete local records later
        synced_google_ids = set()

        for event in recent_events:
            event_id = event.get('id')
            title = event.get('summary', 'Sin Título')
            description = event.get('description', '') or ''

            # 1. Validation: Only import events that look like workouts.
            is_gymhub = "[GymHub]" in description or "\u2705" in description
            is_fitbit = "[Fitbit Metrics]" in description or "Fitbit" in description
            
            title_norm = title.lower()
            cardio_keywords = ["cardio", "carrera", "run", "entren", "workout", "pesas", "weights", "gym", "bici", "bike", "ciclismo", "circuito", "routine", "rutina", "pecho", "espalda", "hombro", "biceps", "triceps", "pierna", "abdomen", "abdominales", "gluteo"]
            is_manual_workout = any(k in title_norm for k in cardio_keywords)


            if not (is_gymhub or is_fitbit or is_manual_workout):
                # Skip generic personal events
                continue

            synced_google_ids.add(event_id)

            # Check if we already have this workout (filtered by user to avoid crossover)
            workout = db.query(Workout).filter(
                Workout.google_event_id == event_id,
                Workout.user_email == user.email
            ).first()

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
                    date=start_time,
                    start_time=start_time,
                    end_time=end_time,
                    source="calendar",
                    google_event_id=event_id
                )
                db.add(new_workout)
                db.flush()
                new_workout.sync_muscles(parse_muscle_groups(title), db)
                db.commit()
                db.refresh(new_workout)

                update_exercises_from_text(new_workout, description, db)

        # 2. Pruning: Delete local workouts that were deleted from Google Calendar
        # or belong to a different calendar (if we just switched)
        # We only prune sessions that have a google_event_id (ones we expect to be in sync)
        existing_local = db.query(Workout).filter(
            Workout.user_email == user.email,
            Workout.google_event_id.isnot(None)
        ).all()
        
        deleted_count = 0
        for lw in existing_local:
            if lw.google_event_id not in synced_google_ids:
                # Security: Only delete if the event is within the time range we just fetched
                # (to avoid deleting very old history that might not be in the recent batch)
                # But since we fetch 3650 days, we can safely prune most.
                db.delete(lw)
                deleted_count += 1
        
        if deleted_count > 0:
            db.commit()
            logger.info(f"Pruned {deleted_count} obsolete local workouts for {user.email}")

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
    "Pesas": "Pesas",
    "Sport": "Deportivo",
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

            # Check by logId first (most reliable deduplication) - MUST filter by user
            existing_by_log = (
                db.query(FitbitData)
                .join(Workout)
                .filter(
                    FitbitData.fitbit_log_id == log_id,
                    Workout.user_email == user.email
                ).first()
                if log_id else None
            )

            # Find the matching workout by time proximity
            matching_workout = _find_best_matching_workout(
                fitbit_start, act.get("duration", 0), user_workouts
            )

            # CRITICAL: If we already have this log_id linked to ANY workout, skip creation
            if existing_by_log:
                logger.info(f"Skipping sync for log {log_id}: Already exists.")
                continue

            if not matching_workout:
                # Do not create standalone cardio events for generic daily activities
                activity_name_lower = (act.get("activityName") or "").lower()
                generic_names = ["sport", "workout", "aerobic workout", "pesas", "weights"]
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
                    google_event_id=event_id
                )
                db.add(matching_workout)
                db.flush()
                matching_workout.sync_muscles(["Cardio"], db)
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
                # Still check if this specific workout already had fitbit data 
                # (to avoid creating duplicates if matching_workout was found via time)
                existing_data = db.query(FitbitData).filter(FitbitData.workout_id == matching_workout.id).first()
                if not existing_data:
                    db.add(FitbitData(workout_id=matching_workout.id, **fields))
                else:
                    # Update the existing one
                    for k, v in fields.items():
                        setattr(existing_data, k, v)
            
            db.commit()

            # Update Google Calendar description with Fitbit metadata for persistence
            if matching_workout.google_event_id and user.google_access_token:
                try:
                    cal_service = GoogleCalendarService(user, db)
                    event = cal_service.service.events().get(
                        calendarId=user.selected_calendar_id, 
                        eventId=matching_workout.google_event_id
                    ).execute()
                    
                    desc = event.get('description', '') or ''
                    # Don't duplicate if already exists
                    if "[Fitbit Metrics]" not in desc:
                        new_desc = desc + format_fitbit_metadata(fields, user.email)
                        cal_service.update_event(
                            matching_workout.google_event_id, 
                            description=new_desc, 
                            calendar_id=user.selected_calendar_id
                        )
                        logger.info(f"Updated Google Calendar description for event {matching_workout.google_event_id}")
                except Exception as e:
                    logger.error(f"Failed to update calendar description with Fitbit data: {e}")

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
