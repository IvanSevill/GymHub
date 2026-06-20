import logging
import re
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy.orm import Session, joinedload

from .. import auth, calendar_utils, database, fitbit_utils, models, schemas
from ..services.google_calendar import get_google_credentials, update_google_calendar_event

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workouts", tags=["workouts"])


def _expand_set_values(value: str) -> List[str]:
    """Split a multi-weight value into individual weights, one per set.

    A value that encodes several weights in one entry (e.g. a progressive
    series ``"12-15"`` or ``"45/40"``) is expanded into one weight per
    ExerciseSet row. Single values, empty strings and non-numeric values
    (e.g. ``"bodyweight"``) are returned unchanged.
    """
    parts = [p.strip() for p in re.split(r"[-/]", value) if p.strip()]
    return parts if len(parts) > 1 else [value]


@router.post("/create-calendar", response_model=dict)
async def create_calendar(
    name: str = Query(..., description="Name for the new Google Calendar"),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Create a new Google Calendar with the given name and return its id."""
    user_tokens = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.user_id == current_user.id)
        .first()
    )
    if not user_tokens or not user_tokens.google_access_token:
        raise HTTPException(status_code=401, detail="Google credentials missing — please re-authenticate")
    creds = get_google_credentials(user_tokens, db)
    if not creds:
        raise HTTPException(status_code=401, detail="Google credentials expired — please re-authenticate")
    service = build("calendar", "v3", credentials=creds, cache_discovery=False)
    try:
        new_cal = service.calendars().insert(body={"summary": name.strip()}).execute()
        return {"id": new_cal["id"], "summary": new_cal["summary"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create calendar: {str(e)}")


@router.get("/calendars", response_model=List[dict])
async def list_calendars(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """List the Google Calendars available to the current user."""
    user_tokens = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.user_id == current_user.id)
        .first()
    )
    if not user_tokens or not user_tokens.google_access_token:
        raise HTTPException(
            status_code=401, detail="Google credentials missing — please re-authenticate"
        )

    creds = get_google_credentials(user_tokens, db)
    if not creds:
        raise HTTPException(
            status_code=401, detail="Google credentials expired — please re-authenticate"
        )

    service = build("calendar", "v3", credentials=creds, cache_discovery=False)
    try:
        calendars = service.calendarList().list().execute().get("items", [])
        logger.debug("Found %d calendars for user %s", len(calendars), current_user.email)
        return [
            {
                "id": c["id"],
                "summary": c["summary"],
                "primary": c.get("primary", False),
                "selected": c["id"] == (user_tokens.selected_calendar_id or None),
            }
            for c in calendars
        ]
    except HttpError as e:
        if e.status_code in (401, 403):
            logger.warning("Google API auth error for %s: %s", current_user.email, e)
            raise HTTPException(
                status_code=401, detail="Google Calendar access denied — please re-authenticate"
            )
        logger.error("Google Calendar API error for %s: %s", current_user.email, e)
        raise HTTPException(status_code=500, detail=f"Failed to fetch calendars: {str(e)}")
    except Exception as e:
        logger.error("Error fetching calendars from Google API: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to fetch calendars: {str(e)}")


@router.post("/set-calendar", response_model=dict)
async def set_calendar(
    calendar_id: str = Query(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Set the primary Google Calendar for syncing workouts."""
    user_tokens = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.user_id == current_user.id)
        .first()
    )
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
    db: Session = Depends(database.get_db),
):
    """List workouts for the current user, optionally filtered by date range."""
    query = (
        db.query(models.Workout)
        .options(
            joinedload(models.Workout.exercise_sets)
            .joinedload(models.ExerciseSet.exercise)
            .joinedload(models.Exercise.muscle),
            joinedload(models.Workout.fitbit_data),
        )
        .filter(models.Workout.user_id == current_user.id)
    )
    if start_date:
        query = query.filter(models.Workout.start_time >= start_date)
    if end_date:
        query = query.filter(models.Workout.end_time <= end_date)
    return query.order_by(models.Workout.start_time.desc()).all()


@router.post("", response_model=schemas.Workout)
async def create_workout(
    workout: schemas.WorkoutCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Create a new workout and sync it to Google Calendar if connected."""
    db_workout = models.Workout(
        user_id=current_user.id,
        start_time=workout.start_time,
        end_time=workout.end_time,
        title=workout.title,
    )
    db.add(db_workout)
    db.flush()

    for es in workout.exercise_sets:
        for single_value in _expand_set_values(es.value):
            db.add(
                models.ExerciseSet(
                    workout_id=db_workout.id,
                    exercise_id=es.exercise_id,
                    value=single_value,
                    measurement=es.measurement,
                    is_completed=es.is_completed,
                )
            )

    db.commit()
    db.refresh(db_workout)

    user_tokens = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.user_id == current_user.id)
        .first()
    )
    if user_tokens and user_tokens.selected_calendar_id:
        update_google_calendar_event(db, user_tokens, db_workout)
        db.commit()

    db.refresh(db_workout)
    return db_workout


@router.post("/reformat-all", response_model=dict)
async def reformat_all_events(
    current_user: models.User = Depends(auth.get_current_root_user),
    db: Session = Depends(database.get_db),
):
    """Root-only: run DB muscle migration then reformat every workout event in Google Calendar."""
    from ..routers.exercises import _migrate_abdomen

    _migrate_abdomen(db)

    user_tokens = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.user_id == current_user.id)
        .first()
    )
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
        .all()
    )

    updated, failed = 0, 0
    for workout in workouts:
        event_id = update_google_calendar_event(db, user_tokens, workout, workout.fitbit_data)
        if event_id:
            updated += 1
        else:
            failed += 1

    db.commit()
    return {"updated": updated, "failed": failed, "total": len(workouts)}


@router.post("/reformat-last/{n}", response_model=dict)
async def reformat_last_n_events(
    n: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Reformat the last N workout Google Calendar events using the current description format."""
    user_tokens = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.user_id == current_user.id)
        .first()
    )
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
    return {
        "updated": len(updated),
        "failed": len(failed),
        "updated_workouts": updated,
        "failed_workouts": failed,
    }


@router.put("/{workout_id}", response_model=schemas.Workout)
async def update_workout(
    workout_id: str,
    workout_update: schemas.WorkoutUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Update an existing workout, auto-sync Fitbit data, and update the Calendar event."""
    db_workout = (
        db.query(models.Workout)
        .filter(
            models.Workout.id == workout_id,
            models.Workout.user_id == current_user.id,
        )
        .first()
    )
    if not db_workout:
        raise HTTPException(status_code=404, detail="Workout not found")

    db_workout.start_time = workout_update.start_time
    db_workout.end_time = workout_update.end_time
    db_workout.title = workout_update.title

    db.query(models.ExerciseSet).filter(
        models.ExerciseSet.workout_id == workout_id
    ).delete(synchronize_session=False)
    db.flush()

    for es in workout_update.exercise_sets:
        for single_value in _expand_set_values(es.value):
            db.add(
                models.ExerciseSet(
                    workout_id=db_workout.id,
                    exercise_id=es.exercise_id,
                    value=single_value,
                    measurement=es.measurement,
                    is_completed=es.is_completed,
                )
            )

    user_tokens = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.user_id == current_user.id)
        .first()
    )
    if user_tokens and user_tokens.fitbit_access_token:
        try:
            activity = fitbit_utils.get_fitbit_activity(
                db, user_tokens, db_workout.start_time, db_workout.end_time
            )
            if activity:
                fitbit_data = (
                    db.query(models.FitbitData)
                    .filter(models.FitbitData.workout_id == workout_id)
                    .first()
                )
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

                act_name_lower = fitbit_data.activity_name.lower()
                if "weights" not in act_name_lower and "walk" not in act_name_lower:
                    cardio_ex = (
                        db.query(models.Exercise)
                        .filter(models.Exercise.name == "cardio")
                        .first()
                    )
                    if not cardio_ex:
                        muscle_for_cardio = (
                            db.query(models.Muscle)
                            .filter(models.Muscle.name == "abdomen")
                            .first()
                        )
                        if muscle_for_cardio and current_user.is_root == 1:
                            cardio_ex = models.Exercise(
                                name="cardio", muscle_id=muscle_for_cardio.id
                            )
                            db.add(cardio_ex)
                            db.flush()

                    if cardio_ex:
                        existing_cardio_set = (
                            db.query(models.ExerciseSet)
                            .filter(
                                models.ExerciseSet.workout_id == workout_id,
                                models.ExerciseSet.exercise_id == cardio_ex.id,
                            )
                            .first()
                        )
                        if not existing_cardio_set:
                            db.add(
                                models.ExerciseSet(
                                    workout_id=db_workout.id,
                                    exercise_id=cardio_ex.id,
                                    value=str(fitbit_data.duration_ms // 60000),
                                    measurement="min",
                                    is_completed=True,
                                )
                            )
                            logger.debug(
                                "Added cardio set for activity: %s",
                                fitbit_data.activity_name,
                            )
        except Exception as e:
            logger.warning("Auto-sync Fitbit error: %s", e)

    db.commit()
    db.refresh(db_workout)

    if user_tokens and user_tokens.selected_calendar_id:
        update_google_calendar_event(db, user_tokens, db_workout, db_workout.fitbit_data)
        db.commit()

    db.refresh(db_workout)
    return db_workout


@router.delete("/{workout_id}", response_model=dict)
async def delete_workout(
    workout_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Delete a workout and its corresponding Google Calendar event."""
    db_workout = (
        db.query(models.Workout)
        .filter(
            models.Workout.id == workout_id,
            models.Workout.user_id == current_user.id,
        )
        .first()
    )
    if not db_workout:
        raise HTTPException(status_code=404, detail="Workout not found")

    if db_workout.google_event_id:
        user_tokens = (
            db.query(models.UserTokens)
            .filter(models.UserTokens.user_id == current_user.id)
            .first()
        )
        if user_tokens and user_tokens.selected_calendar_id:
            creds = get_google_credentials(user_tokens, db)
            if creds:
                service = build("calendar", "v3", credentials=creds, cache_discovery=False)
                try:
                    calendar_id = user_tokens.selected_calendar_id or "primary"
                    service.events().delete(
                        calendarId=calendar_id, eventId=db_workout.google_event_id
                    ).execute()
                except Exception as e:
                    logger.error(
                        "Failed to delete Google Calendar event %s: %s",
                        db_workout.google_event_id,
                        e,
                    )

    db.delete(db_workout)
    db.commit()
    return {"message": "Workout deleted"}


@router.get("/test-parse", response_model=List[dict])
async def test_parse_calendar_events(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Fetch raw calendar events and return their parsed results for debugging."""
    user_tokens = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.user_id == current_user.id)
        .first()
    )
    if not user_tokens or not user_tokens.google_access_token:
        raise HTTPException(status_code=400, detail="Google Calendar not connected.")

    creds = get_google_credentials(user_tokens, db)
    if not creds:
        raise HTTPException(status_code=400, detail="Could not refresh Google credentials.")

    service = build("calendar", "v3", credentials=creds, cache_discovery=False)
    calendar_id = user_tokens.selected_calendar_id or "primary"
    time_min = (datetime.utcnow() - timedelta(days=90)).isoformat() + "Z"

    try:
        events = (
            service.events()
            .list(
                calendarId=calendar_id,
                timeMin=time_min,
                singleEvents=True,
                orderBy="startTime",
                maxResults=100,
            )
            .execute()
            .get("items", [])
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch calendar events: {str(e)}")

    muscle_map = {m.name.lower(): m.id for m in db.query(models.Muscle).all()}

    results = []
    for event in events:
        desc = event.get("description", "")
        summary = event.get("summary", "Workout")

        is_gymhub_tagged = "[GymHub]" in desc or "[gymhub]" in desc.lower()
        has_workout_format = " - " in desc and any(m in desc.lower() for m in muscle_map)
        is_leg_day = "pierna" in summary.lower()

        if not (is_gymhub_tagged or has_workout_format or is_leg_day):
            continue

        sync_result = calendar_utils.parse_calendar_description(desc, muscle_map, title=summary)
        results.append(
            {
                "id": event.get("id"),
                "start": event.get("start", {}).get(
                    "dateTime", event.get("start", {}).get("date")
                ),
                "summary": summary,
                "raw_description": desc,
                "parsed_sets": sync_result["sets"],
                "parsed_fitbit": sync_result["fitbit"],
            }
        )

    return results


@router.get("/sync-all", response_model=dict)
async def sync_all_from_calendar(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Synchronize all relevant workouts from Google Calendar for the current user."""
    user_tokens = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.user_id == current_user.id)
        .first()
    )
    if not user_tokens:
        raise HTTPException(
            status_code=400,
            detail="Google Calendar not connected: No user tokens found.",
        )
    if not user_tokens.google_access_token:
        raise HTTPException(
            status_code=400,
            detail="Google Calendar not connected: Missing access token.",
        )

    creds = get_google_credentials(user_tokens, db)
    if not creds:
        raise HTTPException(
            status_code=400,
            detail="Could not refresh Google credentials. Please reconnect your Google account.",
        )

    service = build("calendar", "v3", credentials=creds, cache_discovery=False)
    calendar_id = user_tokens.selected_calendar_id or "primary"

    all_events = []
    next_sync_token = None
    is_incremental = bool(user_tokens.google_calendar_sync_token)
    time_min_dt = None

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
                user_tokens.google_calendar_sync_token = None
                is_incremental = False
                all_events = []
            else:
                raise HTTPException(status_code=500, detail=f"Calendar sync error: {e}")

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
            raise HTTPException(
                status_code=500, detail=f"Failed to fetch calendar events: {str(e)}"
            )

    processed_count = 0
    calendar_event_ids = set()

    muscle_map = {m.name.lower(): m for m in db.query(models.Muscle).all()}
    exercise_map = {e.name.lower(): e for e in db.query(models.Exercise).all()}

    for event in all_events:
        desc = event.get("description", "")
        event_id = event.get("id")
        calendar_event_ids.add(event_id)

        if event.get("status") == "cancelled":
            dead = (
                db.query(models.Workout)
                .filter(
                    models.Workout.google_event_id == event_id,
                    models.Workout.user_id == current_user.id,
                )
                .first()
            )
            if dead:
                db.delete(dead)
            continue

        is_gymhub_tagged = "[GymHub]" in desc or "[gymhub]" in desc.lower()
        has_workout_format = " - " in desc and any(m in desc.lower() for m in muscle_map)

        if not is_gymhub_tagged and not has_workout_format:
            continue

        start = event["start"].get("dateTime", event["start"].get("date"))
        end = event["end"].get("dateTime", event["end"].get("date"))
        if not start or not end:
            continue

        start_dt = (
            datetime.fromisoformat(start.replace("Z", "+00:00"))
            .astimezone(timezone.utc)
            .replace(tzinfo=None)
        )
        end_dt = (
            datetime.fromisoformat(end.replace("Z", "+00:00"))
            .astimezone(timezone.utc)
            .replace(tzinfo=None)
        )

        workout = (
            db.query(models.Workout)
            .filter(
                models.Workout.google_event_id == event_id,
                models.Workout.user_id == current_user.id,
            )
            .first()
        )
        if not workout:
            workout = models.Workout(
                user_id=current_user.id,
                google_event_id=event_id,
                start_time=start_dt,
                end_time=end_dt,
                title=event.get("summary", "Workout"),
            )
            db.add(workout)
            db.flush()
        else:
            workout.start_time = start_dt
            workout.end_time = end_dt
            workout.title = event.get("summary", "Workout")
            db.query(models.ExerciseSet).filter(
                models.ExerciseSet.workout_id == workout.id
            ).delete(synchronize_session=False)
            db.flush()

        summary_title = event.get("summary", "Workout")
        sync_result = calendar_utils.parse_calendar_description(
            desc,
            {name.lower(): m.id for name, m in muscle_map.items()},
            title=summary_title,
        )
        parsed_sets = sync_result["sets"]
        parsed_fitbit_data = sync_result["fitbit"]

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
                if current_user.is_root == 1:
                    new_ex = models.Exercise(
                        name=ps["exercise_name"].strip(), muscle_id=muscle_obj.id
                    )
                    db.add(new_ex)
                    db.flush()
                    exercise_obj = new_ex
                    exercise_map[new_ex.name.lower()] = new_ex
                    logger.info(
                        "Sync (Root): created exercise '%s' for muscle '%s'",
                        new_ex.name,
                        muscle_obj.name,
                    )
                else:
                    logger.debug(
                        "Sync: exercise '%s' not found, skipping (not root)",
                        ps["exercise_name"],
                    )
                    continue

            for single_value in _expand_set_values(ps["value"]):
                db.add(
                    models.ExerciseSet(
                        workout_id=workout.id,
                        exercise_id=exercise_obj.id,
                        value=single_value,
                        measurement=ps["measurement"],
                        is_completed=ps.get("is_completed", False),
                    )
                )
                sets_added_to_workout += 1

        if parsed_fitbit_data:
            existing_fd = workout.fitbit_data
            if existing_fd:
                existing_fd.calories = parsed_fitbit_data.get("calories", existing_fd.calories)
                existing_fd.heart_rate_avg = parsed_fitbit_data.get(
                    "heart_rate_avg", existing_fd.heart_rate_avg
                )
                existing_fd.duration_ms = parsed_fitbit_data.get(
                    "duration_ms", existing_fd.duration_ms
                )
                existing_fd.distance_km = parsed_fitbit_data.get(
                    "distance_km", existing_fd.distance_km
                )
                existing_fd.elevation_gain_m = parsed_fitbit_data.get(
                    "elevation_gain_m", existing_fd.elevation_gain_m
                )
                existing_fd.activity_name = parsed_fitbit_data.get(
                    "activity_name", existing_fd.activity_name
                )
                existing_fd.azm_fat_burn = parsed_fitbit_data.get(
                    "azm_fat_burn", existing_fd.azm_fat_burn
                )
                existing_fd.azm_cardio = parsed_fitbit_data.get(
                    "azm_cardio", existing_fd.azm_cardio
                )
                existing_fd.azm_peak = parsed_fitbit_data.get(
                    "azm_peak", existing_fd.azm_peak
                )
            else:
                db.add(
                    models.FitbitData(
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
                )

        if sets_added_to_workout > 0 or parsed_fitbit_data:
            processed_count += 1

    deleted_count = 0
    if not is_incremental and time_min_dt:
        local_workouts = (
            db.query(models.Workout)
            .filter(
                models.Workout.user_id == current_user.id,
                models.Workout.google_event_id.isnot(None),
                models.Workout.start_time >= time_min_dt,
            )
            .all()
        )
        for lw in local_workouts:
            if lw.google_event_id not in calendar_event_ids:
                db.delete(lw)
                deleted_count += 1

    if next_sync_token:
        user_tokens.google_calendar_sync_token = next_sync_token

    db.commit()
    sync_type = "incremental" if is_incremental else "full"
    msg = f"Successfully synced {processed_count} workouts from Google Calendar ({sync_type})"
    if deleted_count > 0:
        msg += f" (deleted {deleted_count} orphaned workouts)"
    return {"message": msg}


@router.get("/cardio-pending", response_model=List[dict])
async def list_cardio_pending(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """List Fitbit cardio workouts not yet pushed to Google Calendar."""
    workouts_q = (
        db.query(models.Workout)
        .join(models.FitbitData, models.FitbitData.workout_id == models.Workout.id)
        .filter(
            models.Workout.user_id == current_user.id,
            models.Workout.google_event_id.is_(None),
            models.FitbitData.activity_name.isnot(None),
            models.FitbitData.activity_name != "Weights",
        )
        .options(joinedload(models.Workout.fitbit_data))
        .order_by(models.Workout.start_time.desc())
        .all()
    )
    return [
        {
            "id": w.id,
            "title": w.title,
            "start_time": w.start_time.isoformat(),
            "end_time": w.end_time.isoformat(),
            "activity_name": w.fitbit_data.activity_name,
            "duration_ms": w.fitbit_data.duration_ms,
            "calories": w.fitbit_data.calories,
            "heart_rate_avg": w.fitbit_data.heart_rate_avg,
            "distance_km": w.fitbit_data.distance_km,
        }
        for w in workouts_q
    ]


@router.post("/sync-cardio-to-calendar", response_model=dict)
async def sync_cardio_to_calendar(
    body: schemas.SyncCardioRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Push selected Fitbit cardio workouts to Google Calendar."""
    user_tokens = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.user_id == current_user.id)
        .first()
    )
    if not user_tokens or not user_tokens.google_access_token:
        raise HTTPException(status_code=401, detail="Google credentials missing — please re-authenticate")

    creds = get_google_credentials(user_tokens, db)
    if not creds:
        raise HTTPException(status_code=401, detail="Google credentials expired — please re-authenticate")

    calendar_id = user_tokens.selected_calendar_id or "primary"
    service = build("calendar", "v3", credentials=creds)

    synced = failed = already_synced = 0

    for workout_id in body.workout_ids:
        workout = (
            db.query(models.Workout)
            .options(joinedload(models.Workout.fitbit_data))
            .filter(
                models.Workout.id == workout_id,
                models.Workout.user_id == current_user.id,
            )
            .first()
        )
        if not workout or not workout.fitbit_data:
            failed += 1
            continue

        if workout.google_event_id:
            already_synced += 1
            continue

        f = workout.fitbit_data
        duration_min = f.duration_ms // 60_000
        description = (
            "[GymHub]\nActividad sincronizada automáticamente desde Fitbit\n\n"
            "[Fitbit]\n"
            f"Calorias: {f.calories} kcal\n"
            f"FC Media: {f.heart_rate_avg} bpm\n"
            f"Duracion: {duration_min} min\n"
            f"Actividad: {f.activity_name}\n"
        )
        if f.distance_km:
            description += f"Distancia: {f.distance_km:.2f} km\n"

        event_body = {
            "summary": f.activity_name,
            "description": description.strip(),
            "start": {"dateTime": workout.start_time.isoformat() + "Z"},
            "end": {"dateTime": workout.end_time.isoformat() + "Z"},
        }

        try:
            event = service.events().insert(calendarId=calendar_id, body=event_body).execute()
            workout.google_event_id = event["id"]
            db.commit()
            synced += 1
        except Exception as e:
            logger.error("Failed to create calendar event for workout %s: %s", workout_id, e)
            failed += 1

    return {"synced": synced, "failed": failed, "already_synced": already_synced}
